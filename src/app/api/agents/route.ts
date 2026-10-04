import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { getRepository } from '@/server/repo';
import { nextVersion } from '@/server/repo/constitution';
import { assertSafeUrl, UnsafeUrlError } from '@/server/security/url-guard';
import { constitutionSchema, defaultConstitution, normaliseConstitution, publicAgent } from '@/server/agents';
import { rollCounters } from '@/lib/spend';
import { fail, guard, parse, requireSession, serverError } from '@/server/api';

export const runtime = 'nodejs';

/**
 * Agents belonging to the signed in owner.
 *
 * Creating an agent also creates version 1 of its constitution, in the same
 * request. An agent that exists without a policy is an agent the decision route
 * has to refuse, and the gap between the two calls is exactly the window in
 * which an unconstrained agent would be reachable.
 */

const createSchema = z.object({
  name: z.string().min(1).max(60),
  type: z.enum(['research', 'trading', 'yield', 'ops', 'social', 'custom']).default('custom'),
  /**
   * New agents start in shadow by default. Rehearsing against real policy
   * before anything can settle is the safer default, and the owner opting into
   * live is a decision worth making deliberately.
   */
  mode: z.enum(['live', 'shadow']).default('shadow'),
  /**
   * Validity is decided by assertSafeUrl rather than by a second URL matcher
   * here. Two definitions of "acceptable endpoint" drift apart, and the one
   * that matters is the one the outbound request is checked against.
   */
  endpoint: z.string().min(1).max(300).optional(),
  constitution: constitutionSchema.optional(),
});

export async function GET(req: Request) {
  const limited = guard(req, 'agents-read', 120);
  if (limited) return limited;

  const session = requireSession(req);
  if (!session) return fail(401, 'Authentication required');

  try {
    const repo = getRepository();
    const workspace = await repo.getWorkspaceByOwner(session.address);
    if (!workspace) return NextResponse.json({ agents: [] });

    const now = Date.now();
    const agents = await repo.listAgents(workspace.id);
    return NextResponse.json({
      agents: agents.map((a) => publicAgent({ ...a, ...rollCounters(a, now) })),
    });
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(req: Request) {
  const limited = guard(req, 'agents-write', 20);
  if (limited) return limited;

  const session = requireSession(req);
  if (!session) return fail(401, 'Authentication required');

  const parsed = await parse(req, createSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  try {
    const repo = getRepository();
    const workspace = await repo.getWorkspaceByOwner(session.address);
    if (!workspace) return fail(409, 'Create a workspace before adding agents');

    // A cap per owner. Unbounded creation on process local storage is a memory
    // exhaustion path that needs no authentication beyond one wallet.
    const existing = await repo.listAgents(workspace.id);
    if (existing.length >= 25) return fail(409, 'Agent limit reached for this workspace');

    // Checked at registration as well as at call time. The guard in the intents
    // route is the one that matters, but refusing here means an owner learns
    // the endpoint is unusable when they set it rather than when an agent
    // first needs it.
    if (body.endpoint) {
      try {
        assertSafeUrl(body.endpoint, {
          allowlist: process.env.AGENT_ENDPOINT_ALLOWLIST?.split(',').filter(Boolean),
        });
      } catch (e) {
        if (e instanceof UnsafeUrlError) return fail(400, `Endpoint was refused: ${e.reason}`);
        throw e;
      }
    }

    const now = Date.now();
    // Server generated. A caller chosen id would let the first caller claim any
    // identifier in a shared keyspace, and agent ids appear in audit records.
    const id = `agt_${randomBytes(9).toString('hex')}`;
    const constitution = body.constitution
      ? normaliseConstitution(body.constitution)
      : defaultConstitution();

    const version = nextVersion(id, null, constitution, session.address, now);
    await repo.appendConstitutionVersion(version);

    const agent = {
      id,
      workspaceId: workspace.id,
      ownerAddress: session.address,
      name: body.name,
      type: body.type,
      mode: body.mode,
      state: 'autonomous' as const,
      constitution,
      spentToday: 0,
      spentMonth: 0,
      failedCount: 0,
      riskScore: 0,
      endpoint: body.endpoint,
      enabled: true,
      constitutionVersion: version.version,
      createdAt: now,
    };
    await repo.saveAgent(agent);

    await repo.appendAudit({
      id: `aud_${randomBytes(8).toString('hex')}`,
      ts: now,
      actor: session.address,
      workspaceId: workspace.id,
      agentId: id,
      action: 'agent.created',
      detail: {
        name: agent.name,
        type: agent.type,
        mode: agent.mode,
        constitutionVersion: version.version,
        constitutionHash: version.hash,
        policySource: body.constitution ? 'owner-supplied' : 'restrictive-default',
      },
    });

    return NextResponse.json(
      {
        agent: publicAgent(agent),
        constitution: { version: version.version, hash: version.hash, policy: constitution },
      },
      { status: 201 },
    );
  } catch (e) {
    return serverError(e);
  }
}
