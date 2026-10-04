import { describe, it, expect } from 'vitest';
import { evaluate } from '@/lib/policy-engine';
import { applyDecision, debitTreasury, rollCounters, utcDay, utcMonth } from '@/lib/spend';
import type { Agent, Constitution, Decision, IntentRequest, Treasury } from '@/lib/types';

const APPROVED = 'DUUh4fnF6tMMQHmNbR6cUJdunPZe3SxeVg39d2etaaYm';

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

const intent = (over: Partial<IntentRequest> = {}): IntentRequest => ({
  agentId: 'agt_1', amount: 4.5, token: 'SOL', recipient: APPROVED, purpose: 'Market dataset', ...over,
});

const treasury: Treasury = { total: 5000, available: 5000, allocated: 0, reserve: 100 };

const DAY_ONE = Date.UTC(2026, 0, 15, 12, 0, 0);
const DAY_TWO = Date.UTC(2026, 0, 16, 1, 0, 0);
const NEXT_MONTH = Date.UTC(2026, 1, 3, 9, 0, 0);

/** A decision as the route would hand it over once execution has settled. */
const settledDecision = (d: Decision): Decision => ({ ...d, txHash: `0x${'1'.repeat(64)}` });

describe('period rollover', () => {
  it('derives UTC period keys', () => {
    expect(utcDay(DAY_ONE)).toBe('2026-01-15');
    expect(utcMonth(DAY_ONE)).toBe('2026-01');
  });

  it('keeps counters inside the same day', () => {
    const a = agent({ spentToday: 18, spentMonth: 300, counterDay: '2026-01-15', counterMonth: '2026-01' });
    expect(rollCounters(a, DAY_ONE)).toMatchObject({ spentToday: 18, spentMonth: 300 });
  });

  it('zeroes the daily counter on a new UTC day but keeps the monthly one', () => {
    const a = agent({ spentToday: 18, spentMonth: 300, counterDay: '2026-01-15', counterMonth: '2026-01' });
    expect(rollCounters(a, DAY_TWO)).toMatchObject({
      spentToday: 0, spentMonth: 300, counterDay: '2026-01-16',
    });
  });

  it('zeroes both counters on a new month', () => {
    const a = agent({ spentToday: 18, spentMonth: 300, counterDay: '2026-01-15', counterMonth: '2026-01' });
    expect(rollCounters(a, NEXT_MONTH)).toMatchObject({
      spentToday: 0, spentMonth: 0, counterDay: '2026-02-03', counterMonth: '2026-02',
    });
  });

  it('treats a record written before period markers existed as current, not stale', () => {
    // The alternative would silently zero a real agent's spend the first time it
    // was read after deploy, handing back budget the owner had already spent.
    const a = agent({ spentToday: 18, spentMonth: 300 });
    expect(rollCounters(a, DAY_ONE)).toMatchObject({ spentToday: 18, spentMonth: 300 });
  });

  it('does not reset the failure counter on a period boundary', () => {
    // Failures describe the agent's reliability, not its budget. Rolling them
    // over nightly would let a failing agent reset itself by waiting.
    const a = agent({ failedCount: 2, counterDay: '2026-01-15', counterMonth: '2026-01' });
    expect(rollCounters(a, NEXT_MONTH).failedCount).toBe(2);
  });
});

describe('counters after a decision', () => {
  const approved = () => evaluate(agent(), intent({ amount: 4.5 }), treasury);

  it('adds a settled amount to both spend counters', () => {
    const c = applyDecision(agent(), settledDecision(approved()), { settled: true, now: DAY_ONE });
    expect(c).toMatchObject({ spentToday: 4.5, spentMonth: 4.5, failedCount: 0 });
  });

  it('accumulates without float drift', () => {
    let a = agent();
    for (let i = 0; i < 3; i += 1) {
      const c = applyDecision(a, settledDecision(evaluate(a, intent({ amount: 0.1 }), treasury)), {
        settled: true, now: DAY_ONE,
      });
      a = { ...a, ...c };
    }
    expect(a.spentToday).toBe(0.3); // 0.1 + 0.1 + 0.1 is 0.30000000000000004 unrounded
  });

  it('does not spend budget for a shadow decision', () => {
    const d = { ...approved(), simulated: true };
    const c = applyDecision(agent({ spentToday: 7 }), d, { settled: false, now: DAY_ONE });
    expect(c).toMatchObject({ spentToday: 7, spentMonth: 0 });
  });

  it('counts a blocked decision as a failure', () => {
    const d = evaluate(agent(), intent({ amount: 500 }), treasury);
    expect(d.verdict).toBe('blocked');
    const c = applyDecision(agent({ failedCount: 1 }), d, { settled: false, now: DAY_ONE });
    expect(c.failedCount).toBe(2);
    expect(c.spentToday).toBe(0);
  });

  it('clears the failure counter once a transaction settles', () => {
    const c = applyDecision(agent({ failedCount: 2 }), settledDecision(approved()), {
      settled: true, now: DAY_ONE,
    });
    expect(c.failedCount).toBe(0);
  });

  it('changes nothing for a decision held for review', () => {
    // riskThreshold is raised because an unknown recipient scores 94, which the
    // severity floor turns into 55. At the default threshold of 40 the risk
    // check hard fails first and the verdict is blocked, never review.
    const a = agent({
      spentToday: 7,
      failedCount: 1,
      constitution: constitution({ unknownRecipient: 'review', riskThreshold: 60 }),
    });
    const d = evaluate(a, intent({ recipient: '7cUnpUR6kK31GXdRC1UT1Q8D7a4zKDBycnEdesr4butt' }), treasury);
    expect(d.verdict).toBe('review');
    const c = applyDecision(a, d, { settled: false, now: DAY_ONE });
    expect(c).toMatchObject({ spentToday: 7, spentMonth: 0, failedCount: 1 });
  });

  it('does not credit an approved decision whose execution never settled', () => {
    // The route rewrites such a decision to blocked, so it must count as a
    // failure and must not consume budget for value that never moved.
    const d = { ...approved(), verdict: 'blocked' as const };
    const c = applyDecision(agent(), d, { settled: false, now: DAY_ONE });
    expect(c).toMatchObject({ spentToday: 0, failedCount: 1 });
  });
});

describe('the daily budget actually binds', () => {
  /**
   * The drain this guards against. maxTransaction is 10 and the daily limit is
   * 25, so an agent repeating transfers just under the single transaction
   * ceiling must be stopped by the daily budget on the third attempt. While the
   * counters were never written back, every one of these was approved and the
   * only real ceiling was the size of an individual transfer.
   */
  it('stops a sequence of transfers each just under the single transaction limit', () => {
    let a = agent();
    const verdicts: string[] = [];

    for (let i = 0; i < 5; i += 1) {
      const d = evaluate(a, intent({ amount: 9.99 }), treasury);
      verdicts.push(d.verdict);
      const settled = d.verdict === 'execute';
      a = { ...a, ...applyDecision(a, settled ? settledDecision(d) : d, { settled, now: DAY_ONE }) };
    }

    expect(verdicts).toEqual(['execute', 'execute', 'blocked', 'blocked', 'blocked']);
    expect(a.spentToday).toBe(19.98);
    expect(a.spentToday).toBeLessThanOrEqual(constitution().dailyLimit);
  });

  it('without accounting the same sequence never stops, which was the defect', () => {
    const frozen = agent();
    const verdicts = Array.from({ length: 5 }, () => evaluate(frozen, intent({ amount: 9.99 }), treasury).verdict);
    expect(verdicts.every((v) => v === 'execute')).toBe(true);
  });

  it('lets the agent spend again after the day rolls over', () => {
    const spent = agent({ spentToday: 24.9, counterDay: '2026-01-15', counterMonth: '2026-01' });
    expect(evaluate({ ...spent, ...rollCounters(spent, DAY_ONE) }, intent({ amount: 5 }), treasury).verdict)
      .toBe('blocked');
    expect(evaluate({ ...spent, ...rollCounters(spent, DAY_TWO) }, intent({ amount: 5 }), treasury).verdict)
      .toBe('execute');
  });

  it('holds the monthly ceiling across the day rollover', () => {
    const spent = agent({
      spentToday: 20, spentMonth: 499, counterDay: '2026-01-15', counterMonth: '2026-01',
    });
    const d = evaluate({ ...spent, ...rollCounters(spent, DAY_TWO) }, intent({ amount: 5 }), treasury);
    expect(d.verdict).toBe('blocked');
    expect(d.checks.filter((c) => !c.passed).map((c) => c.id)).toContain('monthly');
  });

  it('trips the failure threshold into a block once failures accumulate', () => {
    const a = agent({ failedCount: 3 });
    const d = evaluate(a, intent({ amount: 1 }), treasury);
    expect(d.verdict).toBe('blocked');
    expect(d.checks.filter((c) => !c.passed).map((c) => c.id)).toContain('failures');
  });
});

describe('treasury debiting', () => {
  it('reduces total and available by the settled amount', () => {
    expect(debitTreasury(treasury, 4.5)).toMatchObject({ total: 4995.5, available: 4995.5 });
  });

  it('leaves the allocated and reserve figures alone', () => {
    expect(debitTreasury(treasury, 4.5)).toMatchObject({ allocated: 0, reserve: 100 });
  });

  it('makes the emergency reserve reachable, which it was not while the balance never moved', () => {
    const c = constitution({ emergencyReserve: 4990, maxTransaction: 100, dailyLimit: 1000 });
    const a = agent({ constitution: c });
    expect(evaluate(a, intent({ amount: 5 }), treasury).verdict).toBe('execute');

    const drained = debitTreasury(treasury, 6);
    const d = evaluate(a, intent({ amount: 5 }), drained);
    expect(d.verdict).toBe('blocked');
    expect(d.checks.filter((k) => !k.passed).map((k) => k.id)).toContain('reserve');
  });
});
