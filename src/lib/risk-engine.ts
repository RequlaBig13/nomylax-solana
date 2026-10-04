import type { Agent, IntentRequest, RiskFactor, RiskResult, Treasury } from './types';

/**
 * NRS - Nomylax Risk Score.
 * Seven weighted signals, each scored 0-100, combined into one 0-100 value.
 * Deliberately deterministic: no model sits in this path.
 */
export function scoreRisk(agent: Agent, req: IntentRequest, treasury: Treasury): RiskResult {
  const c = agent.constitution;

  // 1. Amount anomaly - how far the request sits above the agent's normal size.
  const normal = Math.max(c.maxTransaction * 0.4, 1e-9);
  const amountAnomaly = clamp(((req.amount - normal) / Math.max(normal, 1e-9)) * 45, 0, 100);

  // 2. Unknown recipient.
  const known =
    req.recipientVerified === true || c.approvedRecipients.some((r) => eq(r, req.recipient));
  const unknownRecipient = known ? 6 : 94;

  // 3. Program / instruction risk - supplied by the adapter, defaults to a low baseline.
  const contractRisk = clamp(req.contractRisk ?? 18, 0, 100);

  // 4. Spend velocity against the daily pace the constitution implies.
  const paceSoFar = agent.spentToday + req.amount;
  const velocity = clamp((paceSoFar / Math.max(c.dailyLimit, 1e-9)) * 80, 0, 100);

  // 5. Liquidity - how much of the free treasury this single action consumes.
  const free = Math.max(treasury.available - c.emergencyReserve, 0);
  const liquidity = clamp((req.amount / Math.max(free, 1e-9)) * 100, 0, 100);

  // 6. Policy deviation - the size of the breach, if any.
  const overTx = Math.max(req.amount - c.maxTransaction, 0);
  const overDaily = Math.max(paceSoFar - c.dailyLimit, 0);
  const policyDeviation = clamp(
    (overTx / Math.max(c.maxTransaction, 1e-9)) * 60 + (overDaily / Math.max(c.dailyLimit, 1e-9)) * 60,
    0,
    100,
  );

  // 7. Operational failures recorded against this agent.
  const operational = clamp((agent.failedCount / Math.max(c.failedTxThreshold, 1)) * 90, 0, 100);

  const factors: RiskFactor[] = [
    { id: 'amount', name: 'Amount anomaly', score: r(amountAnomaly), weight: 0.14 },
    { id: 'recipient', name: 'Unknown recipient', score: r(unknownRecipient), weight: 0.22 },
    { id: 'contract', name: 'Program risk', score: r(contractRisk), weight: 0.12 },
    { id: 'velocity', name: 'Spend velocity', score: r(velocity), weight: 0.14 },
    { id: 'liquidity', name: 'Liquidity risk', score: r(liquidity), weight: 0.1 },
    { id: 'deviation', name: 'Policy deviation', score: r(policyDeviation), weight: 0.19 },
    { id: 'operational', name: 'Operational failures', score: r(operational), weight: 0.09 },
  ];

  const weighted = r(factors.reduce((sum, f) => sum + f.score * f.weight, 0));
  const { score, escalation } = applySeverityFloor(weighted, factors);
  return { score, band: bandOf(score), factors, escalation };
}

/**
 * Severity floor.
 *
 * A weighted mean lets benign signals dilute a dangerous one. A payment that
 * sits inside every limit but goes to an unknown address through a high risk
 * contract is the exact shape of a drain, and it must not average its way down
 * to moderate. Any single extreme signal floors the score at HIGH; two or more
 * floor it at CRITICAL.
 *
 * The rule is deterministic and reported on the result, so an owner can always
 * see why a score was raised.
 */
export function applySeverityFloor(
  weighted: number,
  factors: RiskFactor[],
): { score: number; escalation?: string } {
  const extreme = factors.filter((f) => f.score >= EXTREME_SIGNAL);
  if (!extreme.length || weighted >= 75) return { score: weighted };

  const floor = extreme.length >= 2 ? 75 : 55;
  if (weighted >= floor) return { score: weighted };

  const names = extreme.map((f) => f.name.toLowerCase()).join(' and ');
  return {
    score: floor,
    escalation: `Raised from ${weighted} because ${extreme.length > 1 ? 'multiple signals are' : 'one signal is'} extreme: ${names}.`,
  };
}

/** A factor at or above this value is treated as an extreme signal. */
export const EXTREME_SIGNAL = 90;

export function bandOf(score: number): RiskResult['band'] {
  if (score < 30) return 'low';
  if (score < 55) return 'moderate';
  if (score < 75) return 'high';
  return 'critical';
}

export function bandColor(band: RiskResult['band']) {
  return { low: '#3FD08A', moderate: '#66E1FF', high: '#E8B04B', critical: '#FF5C6C' }[band];
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const r = (n: number) => Math.round(n);
const eq = (a: string, b: string) => a.trim() === b.trim();
