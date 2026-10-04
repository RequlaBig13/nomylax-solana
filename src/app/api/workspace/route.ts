import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { getRepository } from '@/server/repo';
import { activeNetwork, ChainConfigError } from '@/server/execution/chain';
import { publicAgent } from '@/server/agents';
import { rollCounters, roundCents } from '@/lib/spend';
import { configError, fail, guard, parse, requireSession, serverError } from '@/server/api';

export const runtime = 'nodejs';

/**
 * The owner's workspace and its treasury envelope.
 *
 * Every other authenticated route hangs off a workspace, so until this existed
 * nothing server side could be reached: there was no way to create the record
 * that agents, decisions and the audit trail are scoped to.
 *
 * The treasury here is a budget envelope the owner declares, not a reading of
 * an on chain balance. Nomylax does not custody funds and does not query wallet
 * balances, so presenting these figures as verified holdings would be a claim
 * the system cannot support. Responses carry source: 'owner-declared' to keep
 * that distinction in the payload rather than only in the documentation.
 */

const createSchema = z.object({
  name: z.string().min(1).max(60),
  treasuryLabel: z.string().min(1).max(60).default('Operating treasury'),
  riskProfile: z.enum(['conservative', 'balanced', 'autonomous']).default('balanced'),
});

const patchSchema = z
  .object({
    name: z.string().min(1).max(60).optional(),
    treasuryLabel: z.string().min(1).max(60).optional(),
    riskProfile: z.enum(['conservative', 'balanced', 'autonomous']).optional(),
    /** Declared envelope. Owner asserted, never read from chain. */
    total: z.number().min(0).max(1e9).optional(),
    reserve: z.number().min(0).max(1e9).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'no fields to update' });

export async function GET(req: Request) {
  const limited = guard(req, 'workspace-read', 120);
  if (limited) return limited;

  const session = requireSession(req);
  if (!session) return fail(401, 'Authentication required');

  try {
    const repo = getRepository();
    const workspace = await repo.getWorkspaceByOwner(session.address);
    if (!workspace) return fail(404, 'No workspace yet. Create one to begin.');

    const treasury = await repo.getTreasury(workspace.id);
    const agents = await repo.listAgents(workspace.id);

    // Counters are rolled for display only, not written back. A dashboard that
    // renders yesterday's spend as today's would misstate the remaining budget
    // in the one place an owner looks before raising a limit.
    const now = Date.now();

    return NextResponse.json({
      workspace,
      treasury: treasury ? { ...treasury, source: 'owner-declared' } : null,
      agents: agents.map((a) => publicAgent({ ...a, ...rollCounters(a, now) })),
      storage: repo.kind,
      network: networkSummary(),
    });
  } catch (e) {
    if (e instanceof ChainConfigError) {
      return configError(e, 'The workspace is temporarily unavailable. The server is misconfigured.');
    }
    return serverError(e);
  }
}

export async function POST(req: Request) {
  const limited = guard(req, 'workspace-write', 10);
  if (limited) return limited;

  const session = requireSession(req);
  if (!session) return fail(401, 'Authentication required');

  const parsed = await parse(req, createSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const repo = getRepository();

    // One workspace per owner. Re-posting returns the existing record rather
    // than a second one, so a retried request cannot fragment an owner's agents
    // across two workspaces they can no longer see together.
    const existing = await repo.getWorkspaceByOwner(session.address);
    if (existing) {
      return NextResponse.json({ workspace: existing, created: false }, { status: 200 });
    }

    const now = Date.now();
    const id = `ws_${randomBytes(9).toString('hex')}`;
    const workspace = {
      id,
      ownerAddress: session.address,
      name: parsed.data.name,
      treasuryLabel: parsed.data.treasuryLabel,
      riskProfile: parsed.data.riskProfile,
      network: activeNetwork().label,
      owner: session.address,
      createdAt: now,
    };

    await repo.createWorkspace(workspace);

    // Starts empty on purpose. A treasury seeded with a number nobody declared
    // would be a fabricated figure on the owner's first dashboard.
    await repo.saveTreasury(id, { total: 0, available: 0, allocated: 0, reserve: 0 });

    await repo.appendAudit({
      id: `aud_${randomBytes(8).toString('hex')}`,
      ts: now,
      actor: session.address,
      workspaceId: id,
      agentId: null,
      action: 'workspace.created',
      detail: { name: workspace.name, riskProfile: workspace.riskProfile, network: workspace.network },
    });

    return NextResponse.json({ workspace, created: true }, { status: 201 });
  } catch (e) {
    // A bad Solana network configuration is a deployment fault, not a bad request.
    // 503 keeps it distinguishable from a genuine server error in monitoring.
    if (e instanceof ChainConfigError) {
      return configError(e, 'Workspace creation is temporarily unavailable. The server is misconfigured.');
    }
    return serverError(e);
  }
}

export async function PATCH(req: Request) {
  const limited = guard(req, 'workspace-write', 30);
  if (limited) return limited;

  const session = requireSession(req);
  if (!session) return fail(401, 'Authentication required');

  const parsed = await parse(req, patchSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const repo = getRepository();
    const workspace = await repo.getWorkspaceByOwner(session.address);
    if (!workspace) return fail(404, 'No workspace yet. Create one to begin.');

    const body = parsed.data;
    const current = (await repo.getTreasury(workspace.id))
      ?? { total: 0, available: 0, allocated: 0, reserve: 0 };

    const total = body.total ?? current.total;
    const reserve = body.reserve ?? current.reserve;

    // The reserve is the floor the policy engine refuses to spend below. A
    // reserve larger than the envelope would make every request fail the
    // reserve check with no way for the owner to understand why, so it is
    // rejected here rather than silently clamped.
    if (reserve > total) {
      return fail(400, 'Emergency reserve cannot exceed the declared treasury total');
    }

    const next = {
      ...current,
      total,
      reserve,
      // Applied as a delta, not an overwrite. A settled transaction reduces
      // total and available together, so assigning available = total here
      // would restore spent value every time the owner edited an unrelated
      // field. Moving the envelope by the difference makes a top-up add funds
      // and a reduction remove them, while leaving what has already gone out
      // accounted for.
      available: Math.max(0, roundCents(current.available + (total - current.total))),
    };

    const updated = {
      ...workspace,
      name: body.name ?? workspace.name,
      treasuryLabel: body.treasuryLabel ?? workspace.treasuryLabel,
      riskProfile: body.riskProfile ?? workspace.riskProfile,
    };

    await repo.createWorkspace({ ...updated, ownerAddress: session.address });
    await repo.saveTreasury(workspace.id, next);

    await repo.appendAudit({
      id: `aud_${randomBytes(8).toString('hex')}`,
      ts: Date.now(),
      actor: session.address,
      workspaceId: workspace.id,
      agentId: null,
      action: 'workspace.updated',
      detail: {
        fields: Object.keys(body),
        treasuryTotal: next.total,
        treasuryReserve: next.reserve,
        declared: true,
      },
    });

    return NextResponse.json({
      workspace: updated,
      treasury: { ...next, source: 'owner-declared' },
    });
  } catch (e) {
    return serverError(e);
  }
}

function networkSummary() {
  const n = activeNetwork();
  return { name: n.label, chain: n.chain, testnet: n.isTestnet };
}
