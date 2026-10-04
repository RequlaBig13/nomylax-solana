import { NextResponse } from 'next/server';
import { z } from 'zod';
import { runShadow } from '@/lib/shadow';
import { getRepository } from '@/server/repo';
import { fail, guard, parse, requireSession, serverError } from '@/server/api';

export const runtime = 'nodejs';

/**
 * Shadow simulation. Loads the agent and its constitution from storage, runs
 * the real policy engine, and never settles anything.
 */
const schema = z.object({
  agentId: z.string().min(3).max(64),
  requests: z.number().int().min(1).max(50).default(14),
});

export async function POST(req: Request) {
  const limited = guard(req, 'shadow', 20);
  if (limited) return limited;

  const session = requireSession(req);
  if (!session) return fail(401, 'Authentication required');

  const parsed = await parse(req, schema);
  if (!parsed.ok) return parsed.response;

  try {
    const repo = getRepository();
    const agent = await repo.getAgent(parsed.data.agentId);
    if (!agent || agent.ownerAddress !== session.address) {
      return fail(404, 'Agent not found');
    }

    const version = await repo.getActiveConstitution(agent.id);
    if (!version) return fail(409, 'This agent has no active constitution');

    const treasury = await repo.getTreasury(agent.workspaceId);
    if (!treasury) return fail(409, 'Workspace treasury is not initialised');

    const report = await runShadow(
      { ...agent, constitution: version.constitution, mode: 'shadow' },
      treasury,
      { requests: parsed.data.requests },
    );

    await repo.appendAudit({
      id: `aud_shadow_${Date.now()}`,
      ts: Date.now(),
      actor: session.address,
      workspaceId: agent.workspaceId,
      agentId: agent.id,
      action: 'shadow.run',
      detail: {
        requested: report.requested, approved: report.wouldApprove, blocked: report.wouldBlock,
        recommendation: report.recommendation, constitutionVersion: version.version,
      },
    });

    return NextResponse.json({ report, constitution: { version: version.version, hash: version.hash } });
  } catch (e) {
    return serverError(e, 'Simulation could not be completed');
  }
}
