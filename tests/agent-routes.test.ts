/**
 * Route level tests for workspace, agent lifecycle and emergency controls.
 *
 * These routes did not exist before: the dashboard's Pause and Clear Safe Mode
 * buttons mutated browser state only, and there was no way to create the
 * workspace or agent that every server side path is scoped to. The tests below
 * exercise the handlers as HTTP endpoints, because the properties worth pinning
 * - ownership, non-disclosure, audit fidelity and the Safe Mode latch - live in
 * the route rather than in the primitives underneath it.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryRepository, setRepository } from '@/server/repo';
import { resetRateLimits } from '@/server/security/rate-limit';
import { newSession, signSession, SESSION_COOKIE } from '@/server/auth/session';
import type { Constitution } from '@/lib/types';

import { GET as wsGet, POST as wsPost, PATCH as wsPatch } from '@/app/api/workspace/route';
import { GET as agentsGet, POST as agentsPost } from '@/app/api/agents/route';
import { GET as agentGet } from '@/app/api/agents/[agentId]/route';
import { POST as controls } from '@/app/api/agents/[agentId]/controls/route';
import {
  GET as constitutionGet,
  PUT as constitutionPut,
} from '@/app/api/agents/[agentId]/constitution/route';
import { GET as auditGet } from '@/app/api/audit/route';

const OWNER = 'DvdQcgy9HQgtvZBRfi8sQWYCFb6BQuQ6orNsm6yqbfGW';
const OTHER = 'AmKjUaxjw3f3BUTyAroVp6Xori4Yt63exY3A3xrwEXiD';
const PAYEE = 'DUUh4fnF6tMMQHmNbR6cUJdunPZe3SxeVg39d2etaaYm';

let repo: MemoryRepository;

beforeEach(() => {
  process.env.SESSION_SECRET = 'd'.repeat(48);
  process.env.NEXT_PUBLIC_APP_URL = 'https://nomylax.vercel.app';
  process.env.NEXT_PUBLIC_SOLANA_NETWORK = 'devnet';
  delete process.env.DATABASE_URL;
  repo = new MemoryRepository();
  setRepository(repo);
  resetRateLimits();
});

/** A distinct forwarded address per request so the limiter never fires. */
const ip = () => `10.${rand()}.${rand()}.${rand()}`;
const rand = () => Math.floor(Math.random() * 250) + 1;

function headers(address?: string) {
  const h: Record<string, string> = { 'Content-Type': 'application/json', 'x-forwarded-for': ip() };
  if (address) h.cookie = `${SESSION_COOKIE}=${signSession(newSession(address, null))}`;
  return h;
}

const req = (url: string, method: string, address?: string, body?: unknown) =>
  new Request(`http://x${url}`, {
    method,
    headers: headers(address),
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const params = (agentId: string) => ({ params: Promise.resolve({ agentId }) });

const policy = (over: Partial<Constitution> = {}): Constitution => ({
  dailyLimit: 25,
  maxTransaction: 10,
  monthlyLimit: 500,
  allowedTokens: ['SOL'],
  approvedRecipients: [PAYEE],
  unknownRecipient: 'block',
  emergencyReserve: 0,
  failedTxThreshold: 3,
  velocityThreshold: 150,
  riskThreshold: 40,
  permissionExpiryDays: 30,
  ...over,
});

/** Workspace plus one agent, the state every later test starts from. */
async function setup(address = OWNER, over: Record<string, unknown> = {}) {
  const ws = await wsPost(req('/api/workspace', 'POST', address, { name: 'Ops' }));
  expect(ws.status).toBe(201);

  const res = await agentsPost(
    req('/api/agents', 'POST', address, {
      name: 'Research Scout', type: 'research', mode: 'live', constitution: policy(), ...over,
    }),
  );
  expect(res.status).toBe(201);
  const created = await res.json();
  return { workspace: (await ws.json()).workspace, agentId: created.agent.id as string };
}

describe('authentication is required everywhere', () => {
  it('refuses every workspace and agent route without a session', async () => {
    const anon = [
      await wsGet(req('/api/workspace', 'GET')),
      await wsPost(req('/api/workspace', 'POST', undefined, { name: 'x' })),
      await wsPatch(req('/api/workspace', 'PATCH', undefined, { name: 'x' })),
      await agentsGet(req('/api/agents', 'GET')),
      await agentsPost(req('/api/agents', 'POST', undefined, { name: 'x' })),
      await agentGet(req('/api/agents/a/', 'GET'), params('agt_x')),
      await controls(req('/api/agents/a/controls', 'POST', undefined, { action: 'pause' }), params('agt_x')),
      await constitutionGet(req('/api/agents/a/constitution', 'GET'), params('agt_x')),
      await constitutionPut(req('/api/agents/a/constitution', 'PUT', undefined, policy()), params('agt_x')),
      await auditGet(req('/api/audit', 'GET')),
    ];
    expect(anon.map((r) => r.status)).toEqual(Array(anon.length).fill(401));
  });

  it('rejects a session cookie signed with the wrong secret', async () => {
    const forged = signSession(newSession(OWNER, null));
    process.env.SESSION_SECRET = 'e'.repeat(48);
    const res = await wsGet(
      new Request('http://x/api/workspace', {
        headers: { 'x-forwarded-for': ip(), cookie: `${SESSION_COOKIE}=${forged}` },
      }),
    );
    expect(res.status).toBe(401);
  });
});

describe('workspace', () => {
  it('creates one workspace per owner and is idempotent on retry', async () => {
    const first = await wsPost(req('/api/workspace', 'POST', OWNER, { name: 'Ops' }));
    expect(first.status).toBe(201);
    const a = await first.json();
    expect(a.created).toBe(true);

    const second = await wsPost(req('/api/workspace', 'POST', OWNER, { name: 'Something else' }));
    expect(second.status).toBe(200);
    const b = await second.json();
    expect(b.created).toBe(false);
    expect(b.workspace.id).toBe(a.workspace.id);
    expect(b.workspace.name).toBe('Ops'); // the retry does not rename
  });

  it('starts the treasury empty rather than seeding a figure nobody declared', async () => {
    await wsPost(req('/api/workspace', 'POST', OWNER, { name: 'Ops' }));
    const body = await (await wsGet(req('/api/workspace', 'GET', OWNER))).json();
    expect(body.treasury).toMatchObject({ total: 0, available: 0, allocated: 0, reserve: 0 });
  });

  it('labels treasury figures as owner declared, not as an on chain balance', async () => {
    await wsPost(req('/api/workspace', 'POST', OWNER, { name: 'Ops' }));
    const body = await (await wsGet(req('/api/workspace', 'GET', OWNER))).json();
    expect(body.treasury.source).toBe('owner-declared');
  });

  it('refuses a reserve larger than the declared total', async () => {
    await wsPost(req('/api/workspace', 'POST', OWNER, { name: 'Ops' }));
    const res = await wsPatch(req('/api/workspace', 'PATCH', OWNER, { total: 100, reserve: 250 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('reserve');
  });

  it('moves the envelope by the difference so settled spend is not restored', async () => {
    const { workspace } = await setup();
    await wsPatch(req('/api/workspace', 'PATCH', OWNER, { total: 100 }));

    // Stand in for a settled decision: debitTreasury reduces both figures.
    await repo.saveTreasury(workspace.id, { total: 80, available: 80, allocated: 0, reserve: 0 });

    // A top up of 20 leaves 100 total, not a treasury reset to some prior high
    // water mark.
    const res = await wsPatch(req('/api/workspace', 'PATCH', OWNER, { total: 100 }));
    const body = await res.json();
    expect(body.treasury.total).toBe(100);
    expect(body.treasury.available).toBe(100);

    // And a reduction removes value rather than adding it.
    const down = await wsPatch(req('/api/workspace', 'PATCH', OWNER, { total: 60 }));
    expect((await down.json()).treasury.available).toBe(60);
  });

  it('does not show one owner the workspace of another', async () => {
    await wsPost(req('/api/workspace', 'POST', OWNER, { name: 'Ops' }));
    const res = await wsGet(req('/api/workspace', 'GET', OTHER));
    expect(res.status).toBe(404);
  });
});

describe('agent creation', () => {
  it('requires a workspace first', async () => {
    const res = await agentsPost(req('/api/agents', 'POST', OWNER, { name: 'Scout' }));
    expect(res.status).toBe(409);
  });

  it('creates version 1 of the constitution in the same request', async () => {
    await wsPost(req('/api/workspace', 'POST', OWNER, { name: 'Ops' }));
    const res = await agentsPost(req('/api/agents', 'POST', OWNER, { name: 'Scout' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.constitution.version).toBe(1);
    expect(body.constitution.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(body.agent.constitutionVersion).toBe(1);
  });

  it('defaults to shadow mode and a policy that refuses unknown recipients', async () => {
    await wsPost(req('/api/workspace', 'POST', OWNER, { name: 'Ops' }));
    const body = await (await agentsPost(req('/api/agents', 'POST', OWNER, { name: 'Scout' }))).json();
    expect(body.agent.mode).toBe('shadow');
    expect(body.constitution.policy.unknownRecipient).toBe('block');
    expect(body.constitution.policy.approvedRecipients).toEqual([]);
  });

  it('ignores a caller supplied id and issues its own', async () => {
    await wsPost(req('/api/workspace', 'POST', OWNER, { name: 'Ops' }));
    const body = await (await agentsPost(
      req('/api/agents', 'POST', OWNER, { name: 'Scout', id: 'agt_squatted' }),
    )).json();
    expect(body.agent.id).not.toBe('agt_squatted');
    expect(body.agent.id).toMatch(/^agt_[0-9a-f]{18}$/);
  });

  it('refuses an incoherent constitution instead of storing it', async () => {
    await wsPost(req('/api/workspace', 'POST', OWNER, { name: 'Ops' }));
    const res = await agentsPost(
      req('/api/agents', 'POST', OWNER, {
        name: 'Scout', constitution: policy({ maxTransaction: 100, dailyLimit: 25 }),
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('maxtransaction');
  });

  it('refuses an endpoint the SSRF guard would reject, at registration time', async () => {
    await wsPost(req('/api/workspace', 'POST', OWNER, { name: 'Ops' }));
    const res = await agentsPost(
      req('/api/agents', 'POST', OWNER, { name: 'Scout', endpoint: 'http://169.254.169.254/latest/meta-data' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('refused');
  });

  it('never returns the owner address, workspace id, endpoint or key hash', async () => {
    const { agentId } = await setup(OWNER, { endpoint: 'https://agent.example.com/intents' });
    await repo.saveAgent({ ...(await repo.getAgent(agentId))!, apiKeyHash: 'sha256:secret-material' });

    const serialised = JSON.stringify(await (await agentsGet(req('/api/agents', 'GET', OWNER))).json());
    expect(serialised).not.toContain('secret-material');
    expect(serialised).not.toContain('apiKeyHash');
    expect(serialised).not.toContain('ownerAddress');
    expect(serialised).not.toContain('agent.example.com');
    expect(serialised).toContain('"hasEndpoint":true');
  });
});

describe('ownership is enforced without disclosing existence', () => {
  it('answers 404, not 403, for an agent owned by someone else', async () => {
    const { agentId } = await setup(OWNER);

    const statuses = [
      (await agentGet(req('/api/agents/x', 'GET', OTHER), params(agentId))).status,
      (await controls(req('/api/agents/x/controls', 'POST', OTHER, { action: 'pause' }), params(agentId))).status,
      (await constitutionGet(req('/api/agents/x/constitution', 'GET', OTHER), params(agentId))).status,
      (await constitutionPut(req('/api/agents/x/constitution', 'PUT', OTHER, policy()), params(agentId))).status,
    ];
    expect(statuses).toEqual([404, 404, 404, 404]);
  });

  it('gives the same answer for an agent that does not exist at all', async () => {
    const { agentId } = await setup(OWNER);
    const missing = await agentGet(req('/api/agents/x', 'GET', OTHER), params('agt_000000000000000000'));
    const foreign = await agentGet(req('/api/agents/x', 'GET', OTHER), params(agentId));
    expect(missing.status).toBe(foreign.status);
    expect(await missing.json()).toEqual(await foreign.json());
  });

  it('does not let another owner mutate state through the controls route', async () => {
    const { agentId } = await setup(OWNER);
    await controls(req('/api/agents/x/controls', 'POST', OTHER, { action: 'disable' }), params(agentId));
    expect((await repo.getAgent(agentId))!.enabled).toBe(true);
  });
});

describe('emergency controls reach the enforcement path', () => {
  it('pauses an agent in storage, not only in the response', async () => {
    const { agentId } = await setup();
    const res = await controls(req('/api/agents/x/controls', 'POST', OWNER, { action: 'pause' }), params(agentId));
    expect(res.status).toBe(200);
    expect((await res.json()).changed).toBe(true);
    expect((await repo.getAgent(agentId))!.mode).toBe('paused');
  });

  it('reports a repeated pause as no change and writes no audit entry for it', async () => {
    const { agentId } = await setup();
    await controls(req('/api/agents/x/controls', 'POST', OWNER, { action: 'pause' }), params(agentId));
    const again = await controls(req('/api/agents/x/controls', 'POST', OWNER, { action: 'pause' }), params(agentId));

    expect(again.status).toBe(200);
    expect((await again.json()).changed).toBe(false);

    const events = await (await auditGet(req('/api/audit', 'GET', OWNER))).json();
    expect(events.events.filter((e: { action: string }) => e.action === 'agent.pause')).toHaveLength(1);
  });

  it('requires an explicit target mode to resume', async () => {
    const { agentId } = await setup();
    await controls(req('/api/agents/x/controls', 'POST', OWNER, { action: 'pause' }), params(agentId));

    const vague = await controls(req('/api/agents/x/controls', 'POST', OWNER, { action: 'resume' }), params(agentId));
    expect(vague.status).toBe(400);

    const explicit = await controls(
      req('/api/agents/x/controls', 'POST', OWNER, { action: 'resume', mode: 'shadow' }), params(agentId),
    );
    expect(explicit.status).toBe(200);
    expect((await repo.getAgent(agentId))!.mode).toBe('shadow');
  });

  it('disables an agent, which the decision route treats as a hard stop', async () => {
    const { agentId } = await setup();
    await controls(req('/api/agents/x/controls', 'POST', OWNER, { action: 'disable' }), params(agentId));
    expect((await repo.getAgent(agentId))!.enabled).toBe(false);
  });
});

describe('safe mode recovery', () => {
  /** Latch the agent the way a run of blocked decisions would have. */
  async function latch(agentId: string, over: Record<string, unknown> = {}) {
    const agent = (await repo.getAgent(agentId))!;
    await repo.saveAgent({ ...agent, state: 'safe', failedCount: 3, spentToday: 7.5, spentMonth: 40, ...over });
  }

  it('will not clear without an explicit acknowledgement', async () => {
    const { agentId } = await setup();
    await latch(agentId);
    const res = await controls(
      req('/api/agents/x/controls', 'POST', OWNER, { action: 'clear-safe-mode' }), params(agentId),
    );
    expect(res.status).toBe(400);
    expect((await repo.getAgent(agentId))!.state).toBe('safe');
  });

  it('clears the failure tally with the latch so the state cannot reinstate itself', async () => {
    const { agentId } = await setup();
    await latch(agentId);

    const res = await controls(
      req('/api/agents/x/controls', 'POST', OWNER, { action: 'clear-safe-mode', acknowledge: true }),
      params(agentId),
    );
    expect(res.status).toBe(200);

    const after = (await repo.getAgent(agentId))!;
    expect(after.state).toBe('autonomous');
    // failedTxThreshold is 3. Left at 3, nextState would return 'safe' on the
    // very next decision and the owner would have cleared nothing.
    expect(after.failedCount).toBe(0);
    expect(after.failedCount).toBeLessThan(after.constitution.failedTxThreshold);
  });

  it('does not refund spend, so recovery cannot be used to spend twice', async () => {
    const { agentId } = await setup();
    await latch(agentId);
    await controls(
      req('/api/agents/x/controls', 'POST', OWNER, { action: 'clear-safe-mode', acknowledge: true }),
      params(agentId),
    );
    const after = (await repo.getAgent(agentId))!;
    expect(after.spentToday).toBe(7.5);
    expect(after.spentMonth).toBe(40);
  });

  it('returns the agent paused, so resuming is a second deliberate step', async () => {
    const { agentId } = await setup();
    await latch(agentId);
    await controls(
      req('/api/agents/x/controls', 'POST', OWNER, { action: 'clear-safe-mode', acknowledge: true }),
      params(agentId),
    );
    expect((await repo.getAgent(agentId))!.mode).toBe('paused');
  });

  it('refuses to resume an agent that is still latched', async () => {
    const { agentId } = await setup();
    await latch(agentId, { mode: 'paused' });
    const res = await controls(
      req('/api/agents/x/controls', 'POST', OWNER, { action: 'resume', mode: 'live' }), params(agentId),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain('Safe Mode');
  });

  it('reports no change when the agent was never in safe mode', async () => {
    const { agentId } = await setup();
    const res = await controls(
      req('/api/agents/x/controls', 'POST', OWNER, { action: 'clear-safe-mode', acknowledge: true }),
      params(agentId),
    );
    expect((await res.json()).changed).toBe(false);
  });

  it('records what it cleared, including the spend it deliberately kept', async () => {
    const { agentId } = await setup();
    await latch(agentId);
    await controls(
      req('/api/agents/x/controls', 'POST', OWNER, { action: 'clear-safe-mode', acknowledge: true }),
      params(agentId),
    );

    const { events } = await (await auditGet(req('/api/audit', 'GET', OWNER))).json();
    const entry = events.find((e: { action: string }) => e.action === 'agent.clear-safe-mode');
    expect(entry.detail.clearedFailedCount).toBe(3);
    expect(entry.detail.spentTodayRetained).toBe(7.5);
    expect(entry.detail.previousState).toBe('safe');
    expect(entry.detail.resultingState).toBe('autonomous');
    expect(entry.actor.toLowerCase()).toBe(OWNER);
  });
});

describe('constitution versioning through the API', () => {
  it('appends a version and leaves the previous one resolvable', async () => {
    const { agentId } = await setup();
    const res = await constitutionPut(
      req('/api/agents/x/constitution', 'PUT', OWNER, policy({ dailyLimit: 40 })), params(agentId),
    );
    expect(res.status).toBe(201);
    expect((await res.json()).version).toBe(2);

    const history = await (await constitutionGet(req('/api/agents/x/constitution', 'GET', OWNER), params(agentId))).json();
    expect(history.versions).toHaveLength(2);
    expect(history.active.version).toBe(2);
    expect(history.versions.find((v: { version: number }) => v.version === 1).constitution.dailyLimit).toBe(25);
  });

  it('does not create a version when nothing actually changed', async () => {
    const { agentId } = await setup();
    const res = await constitutionPut(req('/api/agents/x/constitution', 'PUT', OWNER, policy()), params(agentId));
    expect((await res.json()).changed).toBe(false);
    expect((await repo.listConstitutionVersions(agentId))).toHaveLength(1);
  });

  it('treats a reordered policy as unchanged', async () => {
    const { agentId } = await setup(OWNER, {
      constitution: policy({ approvedRecipients: [PAYEE, OTHER], allowedTokens: ['SOL', 'JUP'] }),
    });
    const res = await constitutionPut(
      req('/api/agents/x/constitution', 'PUT', OWNER, policy({
        approvedRecipients: [OTHER, PAYEE], allowedTokens: ['JUP', 'sol'],
      })),
      params(agentId),
    );
    expect((await res.json()).changed).toBe(false);
  });

  it('records both hashes so a past decision stays attributable', async () => {
    const { agentId } = await setup();
    const before = (await repo.getActiveConstitution(agentId))!.hash;
    await constitutionPut(
      req('/api/agents/x/constitution', 'PUT', OWNER, policy({ maxTransaction: 5 })), params(agentId),
    );

    const { events } = await (await auditGet(req('/api/audit', 'GET', OWNER))).json();
    const entry = events.find((e: { action: string }) => e.action === 'constitution.updated');
    expect(entry.detail.previousHash).toBe(before);
    expect(entry.detail.hash).not.toBe(before);
    expect(entry.detail.changes.join(' ')).toContain('Max Transaction');
  });

  it('updates the agent the policy engine will read, not just the version table', async () => {
    const { agentId } = await setup();
    await constitutionPut(
      req('/api/agents/x/constitution', 'PUT', OWNER, policy({ maxTransaction: 5 })), params(agentId),
    );
    const agent = (await repo.getAgent(agentId))!;
    expect(agent.constitution.maxTransaction).toBe(5);
    expect(agent.constitutionVersion).toBe(2);
  });
});

describe('agent detail and budget reporting', () => {
  it('reports remaining budget from the same counters the engine enforces', async () => {
    const { agentId } = await setup();
    await repo.saveAgent({ ...(await repo.getAgent(agentId))!, spentToday: 10, spentMonth: 120, failedCount: 1 });

    const body = await (await agentGet(req('/api/agents/x', 'GET', OWNER), params(agentId))).json();
    expect(body.budget.dailyRemaining).toBe(15);
    expect(body.budget.monthlyRemaining).toBe(380);
    expect(body.budget.failuresRemaining).toBe(2);
  });

  it('does not report yesterday spend as today', async () => {
    const { agentId } = await setup();
    await repo.saveAgent({
      ...(await repo.getAgent(agentId))!, spentToday: 20, counterDay: '2020-01-01', counterMonth: '2020-01',
    });
    const body = await (await agentGet(req('/api/agents/x', 'GET', OWNER), params(agentId))).json();
    expect(body.agent.spentToday).toBe(0);
    expect(body.budget.dailyRemaining).toBe(25);
  });

  it('returns an empty decision list rather than sample rows', async () => {
    const { agentId } = await setup();
    const body = await (await agentGet(req('/api/agents/x', 'GET', OWNER), params(agentId))).json();
    expect(body.decisions).toEqual([]);
  });
});

describe('audit trail', () => {
  it('is scoped to the caller workspace', async () => {
    await setup(OWNER);
    await setup(OTHER);
    const mine = await (await auditGet(req('/api/audit', 'GET', OWNER))).json();
    const workspaceIds = new Set(mine.events.map((e: { workspaceId: string }) => e.workspaceId));
    expect(workspaceIds.size).toBe(1);
  });

  it('states plainly that process local storage is not durable', async () => {
    await setup(OWNER);
    const body = await (await auditGet(req('/api/audit', 'GET', OWNER))).json();
    expect(body.durable).toBe(false);
    expect(body.storage).toBe('memory');
  });

  it('records workspace and agent creation with the policy hash', async () => {
    const { agentId } = await setup(OWNER);
    const { events } = await (await auditGet(req('/api/audit', 'GET', OWNER))).json();
    const actions = events.map((e: { action: string }) => e.action);
    expect(actions).toContain('workspace.created');
    expect(actions).toContain('agent.created');

    const created = events.find((e: { action: string }) => e.action === 'agent.created');
    expect(created.agentId).toBe(agentId);
    expect(created.detail.constitutionHash).toMatch(/^[0-9a-f]{64}$/);
    expect(created.detail.policySource).toBe('owner-supplied');
  });

  it('filters to a single agent on request', async () => {
    const { agentId } = await setup(OWNER);
    const body = await (await auditGet(req(`/api/audit?agentId=${agentId}`, 'GET', OWNER))).json();
    expect(body.events.every((e: { agentId: string }) => e.agentId === agentId)).toBe(true);
    expect(body.events.length).toBeGreaterThan(0);
  });

  it('never carries credential material', async () => {
    const { agentId } = await setup(OWNER);
    await controls(req('/api/agents/x/controls', 'POST', OWNER, { action: 'pause' }), params(agentId));
    const serialised = JSON.stringify(await (await auditGet(req('/api/audit', 'GET', OWNER))).json());
    expect(serialised).not.toContain(process.env.SESSION_SECRET!);
    expect(serialised.toLowerCase()).not.toContain('apikey');
    expect(serialised.toLowerCase()).not.toContain('signature');
  });
});
