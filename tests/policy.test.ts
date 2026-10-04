import { describe, it, expect } from 'vitest';
import { evaluate, nextState } from '@/lib/policy-engine';
import { runShadow } from '@/lib/shadow';
import { hashConstitution, diffConstitution, nextVersion } from '@/server/repo/constitution';
import type { Agent, Constitution, IntentRequest, Treasury } from '@/lib/types';

const APPROVED = 'DUUh4fnF6tMMQHmNbR6cUJdunPZe3SxeVg39d2etaaYm';
const UNKNOWN = '7cUnpUR6kK31GXdRC1UT1Q8D7a4zKDBycnEdesr4butt';

const constitution = (over: Partial<Constitution> = {}): Constitution => ({
  dailyLimit: 25, maxTransaction: 10, monthlyLimit: 500,
  allowedTokens: ['SOL'], approvedRecipients: [APPROVED],
  unknownRecipient: 'block', emergencyReserve: 100,
  failedTxThreshold: 3, velocityThreshold: 150,
  riskThreshold: 40, permissionExpiryDays: 30, ...over,
});

const agent = (over: Partial<Agent> = {}): Agent => ({
  id: 'agt_1', name: 'Research Scout', type: 'research', mode: 'live', state: 'autonomous',
  constitution: constitution(), spentToday: 0, spentMonth: 0, failedCount: 0,
  riskScore: 0, createdAt: 0, ...over,
});

const treasury: Treasury = { total: 5000, available: 5000, allocated: 0, reserve: 100 };

const intent = (over: Partial<IntentRequest> = {}): IntentRequest => ({
  agentId: 'agt_1', amount: 4.5, token: 'SOL', recipient: APPROVED, purpose: 'Market dataset', ...over,
});

const failed = (d: ReturnType<typeof evaluate>) => d.checks.filter((c) => !c.passed).map((c) => c.id);

describe('deterministic policy enforcement', () => {
  it('approves a request inside every limit', () => {
    const d = evaluate(agent(), intent(), treasury);
    expect(d.verdict).toBe('execute');
    expect(failed(d)).toEqual([]);
  });

  it('blocks an amount above the transaction limit', () => {
    const d = evaluate(agent(), intent({ amount: 31 }), treasury);
    expect(d.verdict).toBe('blocked');
    expect(failed(d)).toContain('maxTx');
  });

  it('blocks when the daily budget is exhausted', () => {
    const d = evaluate(agent({ spentToday: 24 }), intent({ amount: 5 }), treasury);
    expect(d.verdict).toBe('blocked');
    expect(failed(d)).toContain('daily');
  });

  it('blocks when the monthly budget is exhausted', () => {
    const a = agent({ spentMonth: 499, constitution: constitution({ dailyLimit: 1000 }) });
    const d = evaluate(a, intent({ amount: 5 }), treasury);
    expect(d.verdict).toBe('blocked');
    expect(failed(d)).toContain('monthly');
  });

  it('blocks a token that is not on the allowed list', () => {
    const d = evaluate(agent(), intent({ token: 'DAI' }), treasury);
    expect(d.verdict).toBe('blocked');
    expect(failed(d)).toContain('asset');
  });

  it('blocks an unknown recipient when the rule is block', () => {
    const d = evaluate(agent(), intent({ recipient: UNKNOWN }), treasury);
    expect(d.verdict).toBe('blocked');
    expect(failed(d)).toContain('recipient');
  });

  it('holds an unknown recipient for review when the rule is review', () => {
    const a = agent({ constitution: constitution({ unknownRecipient: 'review', riskThreshold: 95 }) });
    const d = evaluate(a, intent({ recipient: UNKNOWN }), treasury);
    expect(d.verdict).toBe('review');
  });

  it('protects the emergency reserve', () => {
    const thin: Treasury = { total: 104, available: 104, allocated: 0, reserve: 100 };
    const d = evaluate(agent(), intent({ amount: 9 }), thin);
    expect(d.verdict).toBe('blocked');
    expect(failed(d)).toContain('reserve');
  });

  it('blocks every request while safe mode is active', () => {
    const d = evaluate(agent({ state: 'safe' }), intent(), treasury);
    expect(d.verdict).toBe('blocked');
    expect(failed(d)).toContain('state');
  });

  it('blocks a paused agent', () => {
    const d = evaluate(agent({ mode: 'paused' }), intent(), treasury);
    expect(d.verdict).toBe('blocked');
  });

  it('blocks once the failure threshold is reached', () => {
    const d = evaluate(agent({ failedCount: 3 }), intent(), treasury);
    expect(d.verdict).toBe('blocked');
    expect(failed(d)).toContain('failures');
  });

  it('blocks when risk exceeds the configured threshold', () => {
    const a = agent({ constitution: constitution({ riskThreshold: 5, unknownRecipient: 'allow' }) });
    const d = evaluate(a, intent({ recipient: UNKNOWN }), treasury);
    expect(d.verdict).toBe('blocked');
    expect(failed(d)).toContain('risk');
  });

  it('never runs simulation after a hard failure', () => {
    const d = evaluate(agent(), intent({ amount: 999 }), treasury);
    expect(d.checks.find((c) => c.id === 'simulation')?.passed).toBe(false);
    expect(d.checks.find((c) => c.id === 'simulation')?.detail).toBe('Not reached');
  });

  it('produces no transaction hash for any decision', () => {
    expect(evaluate(agent(), intent(), treasury).txHash).toBeUndefined();
    expect(evaluate(agent(), intent({ amount: 99 }), treasury).txHash).toBeUndefined();
  });

  it('records the protected value on a block', () => {
    const d = evaluate(agent(), intent({ amount: 80 }), treasury);
    expect(d.protectedValue).toBe(80);
  });

  it('names the failing rule in the reason', () => {
    expect(evaluate(agent(), intent({ amount: 31 }), treasury).reason).toContain('Single transaction limit');
  });

  it('is deterministic across repeated evaluation', () => {
    const runs = Array.from({ length: 20 }, () => evaluate(agent(), intent({ amount: 31 }), treasury));
    expect(new Set(runs.map((r) => r.verdict)).size).toBe(1);
    expect(new Set(runs.map((r) => r.risk.score)).size).toBe(1);
  });
});

describe('simulation is reported, never asserted', () => {
  const sim = (d: ReturnType<typeof evaluate>) => d.checks.find((c) => c.id === 'simulation');

  it('does not claim a simulation result the engine never produced', () => {
    // The engine is pure and never reaches the network. This row used to read
    // "No unexpected state change" on every pass, stating the outcome of a
    // simulation that had not been performed. Real simulation lives in the
    // separate wallet settlement step, which still requires a real signature.
    // fails.
    const d = evaluate(agent(), intent(), treasury);
    expect(sim(d)?.passed).toBe(true);
    expect(sim(d)?.detail).not.toContain('No unexpected state change');
    expect(sim(d)?.detail).toContain('Required before submission');
  });

  it('says plainly that shadow mode simulates nothing on chain', () => {
    const d = evaluate(agent({ mode: 'shadow' }), intent(), treasury, { simulated: true });
    expect(sim(d)?.detail).toContain('Not performed');
  });

  it('still reports the full set of eleven checks', () => {
    expect(evaluate(agent(), intent(), treasury).checks).toHaveLength(11);
    expect(evaluate(agent(), intent({ amount: 999 }), treasury).checks).toHaveLength(11);
  });
});

describe('risk severity floor', () => {
  it('does not let benign factors dilute an extreme signal', () => {
    const a = agent({ constitution: constitution({ riskThreshold: 99, unknownRecipient: 'allow' }) });
    const d = evaluate(a, intent({ amount: 10, recipient: UNKNOWN, contractRisk: 95 }), treasury);
    // Unknown recipient and contract risk are both extreme: floored to critical.
    expect(d.risk.band).toBe('critical');
    expect(d.risk.escalation).toContain('extreme');
  });

  it('floors a single extreme signal at high rather than critical', () => {
    const a = agent({ constitution: constitution({ riskThreshold: 99, unknownRecipient: 'allow' }) });
    const d = evaluate(a, intent({ amount: 2, recipient: UNKNOWN, contractRisk: 10 }), treasury);
    expect(d.risk.score).toBeGreaterThanOrEqual(55);
    expect(d.risk.band).toBe('high');
  });

  it('leaves an ordinary request untouched', () => {
    const d = evaluate(agent(), intent({ amount: 2, contractRisk: 10 }), treasury);
    expect(d.risk.escalation).toBeUndefined();
    expect(d.risk.band).toBe('low');
  });

  it('explains every factor it scored', () => {
    const d = evaluate(agent(), intent(), treasury);
    expect(d.risk.factors).toHaveLength(7);
    expect(d.risk.factors.every((f) => Number.isInteger(f.score) && f.weight > 0)).toBe(true);
  });
});

describe('safe mode', () => {
  it('drops to safe mode on a critical risk event', () => {
    const a = agent({ constitution: constitution({ riskThreshold: 99, unknownRecipient: 'allow' }) });
    const d = evaluate(a, intent({ amount: 10, recipient: UNKNOWN, contractRisk: 95 }), treasury);
    expect(d.risk.band).toBe('critical');
    expect(nextState(a, d)).toBe('safe');
  });

  it('cannot be left by the agent, only by the owner', () => {
    const a = agent({ state: 'safe' });
    const d = evaluate(a, intent(), treasury);
    expect(nextState(a, d)).toBe('safe');
  });

  it('escalates to watch on a review verdict', () => {
    const a = agent({ constitution: constitution({ unknownRecipient: 'review', riskThreshold: 95 }) });
    const d = evaluate(a, intent({ recipient: UNKNOWN }), treasury);
    expect(nextState(a, d)).toBe('watch');
  });
});

describe('shadow mode', () => {
  it('never settles funds and marks every decision simulated', async () => {
    const r = await runShadow(agent({ mode: 'shadow' }), treasury, { requests: 12 });
    expect(r.decisions.every((d) => d.simulated)).toBe(true);
    expect(r.decisions.every((d) => d.txHash === undefined)).toBe(true);
  });

  it('leaves the treasury untouched', async () => {
    const snapshot = { ...treasury };
    await runShadow(agent({ mode: 'shadow' }), treasury, { requests: 12 });
    expect(treasury).toEqual(snapshot);
  });

  it('reports where the agent would have entered safe mode', async () => {
    const strict = agent({ constitution: constitution({ maxTransaction: 0.01, failedTxThreshold: 2 }) });
    const r = await runShadow(strict, treasury, { requests: 10 });
    expect(r.haltedAfter).toBe(2);
    expect(r.notes.join(' ')).toContain('Safe Mode');
  });
});

describe('constitution versioning', () => {
  it('hashes equivalent policies identically regardless of ordering', () => {
    const a = constitution({ approvedRecipients: ['DvdQcgy9HQgtvZBRfi8sQWYCFb6BQuQ6orNsm6yqbfGW', 'AmKjUaxjw3f3BUTyAroVp6Xori4Yt63exY3A3xrwEXiD'], allowedTokens: ['SOL', 'JUP'] });
    const b = constitution({ approvedRecipients: ['AmKjUaxjw3f3BUTyAroVp6Xori4Yt63exY3A3xrwEXiD', 'DvdQcgy9HQgtvZBRfi8sQWYCFb6BQuQ6orNsm6yqbfGW'], allowedTokens: ['JUP', 'sol'] });
    expect(hashConstitution(a)).toBe(hashConstitution(b));
  });

  it('changes the hash when a limit changes', () => {
    expect(hashConstitution(constitution())).not.toBe(hashConstitution(constitution({ maxTransaction: 11 })));
  });

  it('records a readable diff', () => {
    const changes = diffConstitution(constitution(), constitution({ maxTransaction: 50 }));
    expect(changes.join(' ')).toContain('Max Transaction: 10 to 50');
  });

  it('appends rather than replacing', () => {
    const v1 = nextVersion('agt_1', null, constitution(), '0xowner');
    const v2 = nextVersion('agt_1', v1, constitution({ dailyLimit: 40 }), '0xowner');
    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);
    expect(v1.constitution.dailyLimit).toBe(25);
    expect(v2.changes[0]).toContain('Daily Limit');
  });
});
