import { NextResponse } from 'next/server';
import { getRepository } from '@/server/repo';
import { fail, guard, requireSession, serverError } from '@/server/api';

export const runtime = 'nodejs';

/**
 * The workspace audit trail.
 *
 * Append only and scoped to the caller's own workspace. Every entry records
 * who acted, on what, and under which constitution version, so a decision can
 * be reconstructed after the fact rather than argued about.
 *
 * The trail is a record of what the system did, not a store of how it did it:
 * entries carry policy hashes, amounts and verdicts, never signatures, session
 * material or credentials.
 */
export async function GET(req: Request) {
  const limited = guard(req, 'audit-read', 60);
  if (limited) return limited;

  const session = requireSession(req);
  if (!session) return fail(401, 'Authentication required');

  try {
    const url = new URL(req.url);
    const limit = clamp(Number(url.searchParams.get('limit') ?? 100), 1, 200);
    const agentId = url.searchParams.get('agentId');

    const repo = getRepository();
    const workspace = await repo.getWorkspaceByOwner(session.address);
    if (!workspace) return NextResponse.json({ events: [], durable: repo.kind === 'postgres' });

    const events = await repo.listAudit(workspace.id, limit);
    const filtered = agentId ? events.filter((e) => e.agentId === agentId) : events;

    return NextResponse.json({
      events: filtered,
      /**
       * Stated in the payload rather than only in the docs. On the in-memory
       * repository the trail does not survive a restart and is not shared
       * between instances, and an audit trail whose durability is assumed
       * wrongly is worse than one whose limits are visible.
       */
      durable: repo.kind === 'postgres',
      storage: repo.kind,
    });
  } catch (e) {
    return serverError(e);
  }
}

const clamp = (n: number, lo: number, hi: number) =>
  (Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.trunc(n))) : lo);
