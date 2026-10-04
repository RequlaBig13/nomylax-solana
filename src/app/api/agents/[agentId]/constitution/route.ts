import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { getRepository } from '@/server/repo';
import { hashConstitution, nextVersion } from '@/server/repo/constitution';
import { constitutionSchema, loadOwnedAgent, normaliseConstitution } from '@/server/agents';
import { fail, guard, parse, requireSession, serverError } from '@/server/api';

export const runtime = 'nodejs';

/**
 * The agent's financial constitution and its full history.
 *
 * Policy is append only. A change never overwrites the rule that authorised a
 * past decision, so an audit record from three weeks ago can still be resolved
 * to the exact policy text and hash it was evaluated against. That property is
 * the reason this is a PUT that creates a version rather than a PATCH that
 * edits one.
 */

export async function GET(req: Request, ctx: { params: Promise<{ agentId: string }> }) {
  const limited = guard(req, 'constitution-read', 60);
  if (limited) return limited;

  const session = requireSession(req);
  if (!session) return fail(401, 'Authentication required');

  const { agentId } = await ctx.params;

  try {
    const repo = getRepository();
    const owned = await loadOwnedAgent(repo, agentId, session);
    if (!owned.ok) return owned.response;

    const versions = await repo.listConstitutionVersions(agentId);
    return NextResponse.json({
      active: versions.find((v) => v.status === 'active') ?? null,
      versions,
    });
  } catch (e) {
    return serverError(e);
  }
}

export async function PUT(req: Request, ctx: { params: Promise<{ agentId: string }> }) {
  const limited = guard(req, 'constitution-write', 20);
  if (limited) return limited;

  const session = requireSession(req);
  if (!session) return fail(401, 'Authentication required');

  const { agentId } = await ctx.params;
  const parsed = await parse(req, constitutionSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const repo = getRepository();
    const owned = await loadOwnedAgent(repo, agentId, session);
    if (!owned.ok) return owned.response;
    const agent = owned.agent;

    const constitution = normaliseConstitution(parsed.data);
    const prev = await repo.getActiveConstitution(agentId);

    // An unchanged policy does not earn a version. Otherwise a form that
    // re-submits on every save would bury the one real change in a history of
    // identical entries, which is the failure mode that makes audit trails
    // unread.
    if (prev && hashConstitution(constitution) === prev.hash) {
      return NextResponse.json({
        version: prev.version, hash: prev.hash, changed: false, changes: [],
      });
    }

    const now = Date.now();
    const version = nextVersion(agentId, prev, constitution, session.address, now);
    await repo.appendConstitutionVersion(version);
    await repo.saveAgent({ ...agent, constitution, constitutionVersion: version.version });

    await repo.appendAudit({
      id: `aud_${randomBytes(8).toString('hex')}`,
      ts: now,
      actor: session.address,
      workspaceId: agent.workspaceId,
      agentId,
      action: 'constitution.updated',
      detail: {
        version: version.version,
        hash: version.hash,
        previousVersion: prev?.version ?? null,
        previousHash: prev?.hash ?? null,
        changes: version.changes,
      },
    });

    return NextResponse.json(
      { version: version.version, hash: version.hash, changed: true, changes: version.changes },
      { status: 201 },
    );
  } catch (e) {
    return serverError(e);
  }
}
