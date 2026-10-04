import type { Agent, Decision, Treasury } from './types';

/**
 * Spend accounting.
 *
 * The policy engine reads agent.spentToday, agent.spentMonth and
 * agent.failedCount on every request, but nothing ever wrote them back. They sat
 * at zero for the life of an agent, which quietly disabled four of the eleven
 * checks - daily budget, monthly budget, velocity and the failure threshold -
 * and two of the three routes into Safe Mode. The remaining ceilings were
 * maxTransaction and the emergency reserve, so an agent could drain a treasury
 * through repeated transfers each a cent under the single transaction limit.
 *
 * These functions are pure. Rollover and accumulation are the rules most likely
 * to be wrong in a way no one notices, so they are testable without storage.
 */

/**
 * Period keys are UTC. A deployment that moved region would otherwise shift the
 * boundary of every budget, and an owner who set a daily limit would find it
 * resetting at a different hour than the one they agreed to.
 */
export const utcDay = (ts: number) => new Date(ts).toISOString().slice(0, 10);
export const utcMonth = (ts: number) => new Date(ts).toISOString().slice(0, 7);

/**
 * Client-side counters are display-denominated SOL values rather than base units, which is a known MVP gap recorded in
 * the limitations. Until that is closed, every accumulation is pinned to cents
 * so repeated addition cannot drift far enough to change a comparison.
 */
export const roundCents = (n: number) => Math.round(n * 100) / 100;

export interface SpendCounters {
  spentToday: number;
  spentMonth: number;
  failedCount: number;
  counterDay: string;
  counterMonth: string;
}

/**
 * The counters as they stand at `now`, zeroing any whose period has elapsed.
 *
 * This has to run before evaluation, not merely before a write. A spentToday
 * left over from yesterday would refuse spending the agent is entitled to
 * today, which is a failure closed but still a failure.
 *
 * An agent with no period markers is treated as belonging to the current
 * period rather than as stale, so existing records keep whatever they hold
 * instead of being silently zeroed on first read.
 */
export function rollCounters(agent: Agent, now = Date.now()): SpendCounters {
  const counterDay = utcDay(now);
  const counterMonth = utcMonth(now);
  const dayCurrent = agent.counterDay === undefined || agent.counterDay === counterDay;
  const monthCurrent = agent.counterMonth === undefined || agent.counterMonth === counterMonth;
  return {
    spentToday: dayCurrent ? agent.spentToday : 0,
    spentMonth: monthCurrent ? agent.spentMonth : 0,
    failedCount: agent.failedCount,
    counterDay,
    counterMonth,
  };
}

/**
 * The counters after a decision.
 *
 * `settled` means value actually left the treasury: an approved, non simulated
 * decision whose execution returned a verified transaction. A decision that was
 * approved but whose execution could not be verified is not settled, and the
 * route rewrites its verdict to blocked, so it counts as a failure here.
 */
export function applyDecision(
  agent: Agent,
  decision: Decision,
  opts: { settled: boolean; now?: number },
): SpendCounters {
  const base = rollCounters(agent, opts.now ?? Date.now());

  // A rehearsal moves no money and so cannot consume a real budget. Shadow
  // decisions are still recorded and can still move agent state, because the
  // point of Shadow Mode is to show what the agent would have done to itself.
  if (decision.simulated) return base;

  if (opts.settled) {
    return {
      ...base,
      spentToday: roundCents(base.spentToday + decision.request.amount),
      spentMonth: roundCents(base.spentMonth + decision.request.amount),
      // The threshold exists to catch a burst of failures, so a settled
      // transaction clears it. Left as a lifetime tally it would latch every
      // long lived agent into Safe Mode eventually, and only the owner can
      // release that.
      failedCount: 0,
    };
  }

  if (decision.verdict === 'blocked') return { ...base, failedCount: base.failedCount + 1 };

  // Held for owner review. Nothing moved and nothing failed.
  return base;
}

/**
 * The treasury after a settled decision.
 *
 * Local bookkeeping, not a balance read. Nothing here queries the chain, so
 * this tracks what Nomylax believes it has released rather than what the wallet
 * actually holds; reconciliation against an on chain balance is recorded as
 * outstanding. Without it the emergency reserve check compares every request
 * against the opening balance forever and can never trip.
 */
export function debitTreasury(treasury: Treasury, amount: number): Treasury {
  return {
    ...treasury,
    total: roundCents(treasury.total - amount),
    available: roundCents(treasury.available - amount),
  };
}
