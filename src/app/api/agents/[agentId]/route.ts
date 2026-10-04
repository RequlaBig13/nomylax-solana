import { NextResponse } from 'next/server';
import { getRepository } from '@/server/repo';
import { loadOwnedAgent, publicAgent } from '@/server/agents';
import { rollCounters } from '@/lib/spend';
import { fail, guard, requireSession, serverError } from '@/server/api';

export const runtime = 'nodejs';

/**
 * One agent, as its owner sees it.
 *
 * The active constitution is returned alongside the agent because the two are
 * only meaningful together: a spend counter means nothing without the ceiling
 * it is measured against, and the hash lets the owner confirm the policy shown
 * here is the one the decision records were evaluated under.
 */
export async function GET(req: Request, ctx: { params: Promise<{ agentId: string }> }) {
  const limited = guard(req, 'agent-read', 120);
  if (limited) return limited;

  const session = requireSession(req);
  if (!session) return fail(401, 'Authentication required');

  const { agentId } = await ctx.params;

  try {
    const repo = getRepository();
    const owned = await loadOwnedAgent(repo, agentId, session);
    if (!owned.ok) return owned.response;
    const agent = owned.agent;

    const [version, decisions] = await Promise.all([
      repo.getActiveConstitution(agentId),
      repo.listDecisions(agent.workspaceId, 200),
    ]);

    const rolled = rollCounters(agent, Date.now());
    const mine = decisions.filter((d) => d.agentId === agentId).slice(0, 50);

    return NextResponse.json({
      agent: publicAgent({ ...agent, ...rolled }),
      constitution: version
        ? { version: version.version, hash: version.hash, policy: version.constitution }
        : null,
      // What is left before each ceiling binds, computed from the same rolled
      // counters the policy engine will use, so the dashboard and the enforcer
      // cannot disagree.
      budget: version
        ? {
          dailyRemaining: Math.max(0, round(version.constitution.dailyLimit - rolled.spentToday)),
          monthlyRemaining: Math.max(0, round(version.constitution.monthlyLimit - rolled.spentMonth)),
          failuresRemaining: Math.max(0, version.constitution.failedTxThreshold - rolled.failedCount),
        }
        : null,
      decisions: mine,
    });
  } catch (e) {
    return serverError(e);
  }
}

const round = (n: number) => Math.round(n * 100) / 100;
