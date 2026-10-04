import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { getRepository } from '@/server/repo';
import { loadOwnedAgent, publicAgent } from '@/server/agents';
import { rollCounters } from '@/lib/spend';
import { fail, guard, parse, requireSession, serverError } from '@/server/api';

export const runtime = 'nodejs';

/**
 * Emergency controls.
 *
 * Pause, disable and Safe Mode recovery previously existed only as client state
 * in the browser store, so the buttons moved a local variable and the server
 * kept evaluating intents exactly as before. An emergency control that the
 * enforcement path cannot see is not a control.
 *
 * This is the only route that can move an agent out of Safe Mode. The state
 * machine in policy-engine drops an agent downward on its own and treats 'safe'
 * as absorbing, so recovery has to be an authenticated owner action taken from
 * outside the evaluation path. Ownership is proven by the session cookie, which
 * is issued only after a wallet signature over a server generated challenge.
 */

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('pause') }),
  z.object({ action: z.literal('resume'), mode: z.enum(['live', 'shadow']) }),
  z.object({ action: z.literal('disable') }),
  z.object({ action: z.literal('enable') }),
  z.object({ action: z.literal('clear-safe-mode'), acknowledge: z.literal(true) }),
]);

export async function POST(req: Request, ctx: { params: Promise<{ agentId: string }> }) {
  // Deliberately tighter than the read limits. These are rare, consequential
  // actions, and a loop hammering enable/disable is not a legitimate pattern.
  const limited = guard(req, 'agent-controls', 20);
  if (limited) return limited;

  const session = requireSession(req);
  if (!session) return fail(401, 'Authentication required');

  const { agentId } = await ctx.params;
  const parsed = await parse(req, schema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  try {
    const repo = getRepository();
    const owned = await loadOwnedAgent(repo, agentId, session);
    if (!owned.ok) return owned.response;
    const agent = owned.agent;

    const now = Date.now();
    let next = { ...agent };
    let detail: Record<string, unknown> = {};

    switch (body.action) {
      case 'pause':
        if (agent.mode === 'paused') return unchanged(agent, 'Already paused');
        // The prior mode is recorded so the audit trail shows what the owner
        // interrupted, but it is not used to auto-restore: resume states its
        // target explicitly rather than reviving a mode nobody re-read.
        detail = { from: agent.mode };
        next.mode = 'paused';
        break;

      case 'resume':
        if (agent.mode !== 'paused') return unchanged(agent, 'This agent is not paused');
        if (agent.state === 'safe') {
          return fail(409, 'This agent is in Safe Mode. Clear Safe Mode before resuming.');
        }
        detail = { to: body.mode };
        next.mode = body.mode;
        break;

      case 'disable':
        if (!agent.enabled) return unchanged(agent, 'Already disabled');
        next.enabled = false;
        break;

      case 'enable':
        if (agent.enabled) return unchanged(agent, 'Already enabled');
        next.enabled = true;
        break;

      case 'clear-safe-mode': {
        if (agent.state !== 'safe') return unchanged(agent, 'This agent is not in Safe Mode');

        // The failure tally has to clear with the latch. Leaving it at or above
        // failedTxThreshold means nextState re-trips to 'safe' on the very next
        // decision, and the owner would be clearing a state that reinstates
        // itself immediately.
        //
        // Spend counters are deliberately not cleared. Value that left the
        // treasury has left it, and zeroing spentToday here would turn an
        // emergency control into a way to spend twice the daily ceiling.
        const rolled = rollCounters(agent, now);
        detail = {
          clearedFailedCount: agent.failedCount,
          spentTodayRetained: rolled.spentToday,
          spentMonthRetained: rolled.spentMonth,
        };
        next = { ...next, ...rolled, state: 'autonomous', failedCount: 0 };

        // Returning from Safe Mode into live execution without a human looking
        // at the agent again is how the same incident happens twice. The agent
        // comes back paused; resuming is a second, separate decision.
        next.mode = 'paused';
        break;
      }
    }

    await repo.saveAgent(next);
    await repo.appendAudit({
      id: `aud_${randomBytes(8).toString('hex')}`,
      ts: now,
      actor: session.address,
      workspaceId: agent.workspaceId,
      agentId: agent.id,
      action: `agent.${body.action}`,
      detail: {
        ...detail,
        previousState: agent.state,
        previousMode: agent.mode,
        resultingState: next.state,
        resultingMode: next.mode,
        enabled: next.enabled,
      },
    });

    return NextResponse.json({ agent: publicAgent(next), changed: true });
  } catch (e) {
    return serverError(e);
  }
}

/**
 * A no-op is reported, not recorded. Writing an audit entry for a control that
 * changed nothing would fill an incident timeline with events that never
 * happened, and that timeline is the artefact an owner reads after a loss.
 */
function unchanged(agent: Parameters<typeof publicAgent>[0], note: string) {
  return NextResponse.json({ agent: publicAgent(agent), changed: false, note });
}
