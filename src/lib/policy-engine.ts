import { scoreRisk } from './risk-engine';
import { uid } from './format';
import type { Agent, Decision, IntentRequest, PolicyCheck, Treasury, Verdict } from './types';

/**
 * The enforcement path. Deterministic by design - every check is a comparison
 * against a value the owner wrote into the constitution. No inference here.
 *
 * Order matters and is fixed: asset, size, budget, recipient, reserve, state,
 * failures, then risk, then simulation.
 */
export function evaluate(
  agent: Agent,
  req: IntentRequest,
  treasury: Treasury,
  opts: { simulated?: boolean } = {},
): Decision {
  const c = agent.constitution;
  const checks: PolicyCheck[] = [];
  const known = c.approvedRecipients.some(
    (r) => r.trim() === req.recipient.trim(),
  );

  const tokenOk = c.allowedTokens.includes(req.token);
  checks.push({
    id: 'asset',
    name: 'Allowed asset',
    detail: tokenOk ? req.token : `${req.token} not permitted`,
    passed: tokenOk,
    hard: true,
  });

  const txOk = req.amount <= c.maxTransaction;
  checks.push({
    id: 'maxTx',
    name: 'Single transaction limit',
    detail: `${req.amount.toFixed(4)} / ${c.maxTransaction.toFixed(4)} SOL`,
    passed: txOk,
    hard: true,
  });

  const dayRemaining = c.dailyLimit - agent.spentToday;
  const dayOk = req.amount <= dayRemaining;
  checks.push({
    id: 'daily',
    name: 'Daily budget remaining',
    detail: `${Math.max(dayRemaining, 0).toFixed(4)} of ${c.dailyLimit.toFixed(4)} SOL`,
    passed: dayOk,
    hard: true,
  });

  const monthRemaining = c.monthlyLimit - agent.spentMonth;
  const monthOk = req.amount <= monthRemaining;
  checks.push({
    id: 'monthly',
    name: 'Monthly budget remaining',
    detail: `${Math.max(monthRemaining, 0).toFixed(4)} of ${c.monthlyLimit.toFixed(4)} SOL`,
    passed: monthOk,
    hard: true,
  });

  const recipientOk = known || c.unknownRecipient === 'allow';
  const recipientSoft = !known && c.unknownRecipient === 'review';
  checks.push({
    id: 'recipient',
    name: 'Recipient allowlist',
    detail: known ? 'Match found' : `No match · rule is ${c.unknownRecipient.toUpperCase()}`,
    passed: recipientOk,
    hard: !recipientSoft,
  });

  const reserveOk = treasury.available - req.amount >= c.emergencyReserve;
  checks.push({
    id: 'reserve',
    name: 'Emergency reserve',
    detail: reserveOk
      ? `${c.emergencyReserve.toFixed(4)} SOL untouched`
      : `Would breach ${c.emergencyReserve.toFixed(4)} SOL`,
    passed: reserveOk,
    hard: true,
  });

  const stateOk = agent.state !== 'safe' && agent.mode !== 'paused';
  checks.push({
    id: 'state',
    name: 'Agent state',
    detail: stateOk ? `${agent.state} · ${agent.mode}` : 'Safe mode - spending halted',
    passed: stateOk,
    hard: true,
  });

  const failuresOk = agent.failedCount < c.failedTxThreshold;
  checks.push({
    id: 'failures',
    name: 'Failed transaction threshold',
    detail: `${agent.failedCount} of ${c.failedTxThreshold}`,
    passed: failuresOk,
    hard: true,
  });

  const velocity = ((agent.spentToday + req.amount) / Math.max(c.dailyLimit, 1e-9)) * 100;
  const velocityOk = velocity <= c.velocityThreshold;
  checks.push({
    id: 'velocity',
    name: 'Spend velocity',
    detail: `${velocity.toFixed(0)}% of ${c.velocityThreshold}% ceiling`,
    passed: velocityOk,
    hard: true,
  });

  const risk = scoreRisk(agent, req, treasury);
  const riskOk = risk.score <= c.riskThreshold;
  checks.push({
    id: 'risk',
    name: 'Risk score',
    detail: `${risk.score} · ${risk.band.toUpperCase()} (limit ${c.riskThreshold})`,
    passed: riskOk,
    hard: true,
  });

  const hardFail = checks.find((k) => !k.passed && k.hard);
  const softFail = checks.find((k) => !k.passed && !k.hard);

  // The pure policy engine cannot claim that a network simulation happened.
  // This final gate states whether an approved intent is ready to proceed to the
  // separate wallet-signing and Solana submission step.
  const settlementReady = !hardFail;
  checks.push({
    id: 'settlement',
    name: 'Settlement readiness',
    detail: !settlementReady
      ? 'Not reached'
      : opts.simulated
        ? 'Shadow Mode: no network action or wallet signature is requested'
        : 'Policy cleared; connected wallet must still sign the Solana transaction',
    passed: settlementReady,
    hard: true,
  });

  let verdict: Verdict = 'execute';
  let reason = 'All checks passed';
  if (hardFail) {
    verdict = 'blocked';
    reason = `${hardFail.name}: ${hardFail.detail}`;
  } else if (softFail) {
    verdict = 'review';
    reason = `${softFail.name}: held for owner review`;
  }

  return {
    id: uid('dec'),
    ts: Date.now(),
    agentId: agent.id,
    agentName: agent.name,
    request: req,
    checks,
    risk,
    verdict,
    reason,
    protectedValue: verdict === 'blocked' ? req.amount : 0,
    simulated: !!opts.simulated,
    // No transaction hash is invented here. A hash only ever arrives from the
    // wallet settlement after the Solana network returns a signature.
    txHash: undefined,
  };
}

/**
 * State machine for autonomy. Recovery is always an owner action -
 * an agent can move itself down, never up.
 */
export function nextState(agent: Agent, decision: Decision): Agent['state'] {
  const c = agent.constitution;
  if (agent.state === 'safe') return 'safe';
  if (decision.risk.band === 'critical') return 'safe';
  if (agent.failedCount + (decision.verdict === 'blocked' ? 1 : 0) >= c.failedTxThreshold) return 'safe';
  const velocity = ((agent.spentToday + decision.request.amount) / Math.max(c.dailyLimit, 1e-9)) * 100;
  if (velocity >= c.velocityThreshold) return 'safe';
  if (decision.verdict === 'review' || decision.risk.band === 'high') return 'watch';
  return agent.state === 'watch' ? 'watch' : 'autonomous';
}
