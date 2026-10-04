import { evaluate } from './policy-engine';
import { createAdapter } from './adapters';
import type { Agent, Decision, ShadowReport, Treasury } from './types';
import type { ConnectorInput } from './connectors';

/**
 * Runs the agent against real policy with simulated settlement. Spend is
 * accumulated on a copy of the agent, so budgets deplete exactly as they would
 * in production and nothing touches the treasury.
 */
export async function runShadow(
  agent: Agent,
  treasury: Treasury,
  opts: { requests?: number; hours?: number; previewConnector?: ConnectorInput } = {},
): Promise<ShadowReport> {
  const requests = opts.requests ?? 14;
  const hours = opts.hours ?? 24;

  const adapter = createAdapter({
    kind: agent.endpoint ? 'http' : 'demo',
    type: agent.type,
    endpoint: agent.endpoint,
    connector: opts.previewConnector ?? agent.connector,
  });
  const drafts = await adapter.nextIntents(agent.id, requests);

  const ghost: Agent = { ...agent, spentToday: 0, spentMonth: 0, failedCount: 0 };
  const decisions: Decision[] = [];
  let requested = 0;
  let approved = 0;
  let blocked = 0;
  let violations = 0;
  let critical = 0;
  let haltedAfter: number | null = null;

  for (const [i, d] of drafts.entries()) {
    const req = { ...d, agentId: agent.id };
    const decision = evaluate(ghost, req, treasury, { simulated: true });
    decisions.push(decision);
    requested += req.amount;

    if (decision.verdict === 'execute') {
      approved += req.amount;
      ghost.spentToday += req.amount;
      ghost.spentMonth += req.amount;
    } else {
      blocked += req.amount;
      violations += decision.checks.filter((c) => !c.passed).length ? 1 : 0;
      ghost.failedCount += 1;
      if (haltedAfter === null && ghost.failedCount >= agent.constitution.failedTxThreshold) {
        haltedAfter = i + 1;
      }
    }
    if (decision.risk.band === 'critical') critical += 1;
  }

  const monthlyBurn = (approved / hours) * 24 * 30;
  const notes: string[] = [];
  if (haltedAfter !== null) {
    const remaining = drafts.length - haltedAfter;
    notes.push(
      `The agent reached its failure threshold after ${haltedAfter} request${haltedAfter > 1 ? 's' : ''} and would have entered Safe Mode` +
        (remaining > 0 ? `, so the remaining ${remaining} were refused automatically.` : '.'),
    );
  }
  if (critical > 0) notes.push(`${critical} critical risk event${critical > 1 ? 's' : ''} recorded.`);
  if (blocked > approved * 0.4)
    notes.push('A large share of requested value was refused - the agent is asking for more than its constitution allows.');
  if (monthlyBurn > agent.constitution.monthlyLimit)
    notes.push(`Projected burn of ${monthlyBurn.toFixed(3)} SOL exceeds the ${agent.constitution.monthlyLimit} SOL monthly ceiling.`);
  if (!notes.length) notes.push('No policy breaches or critical events in this run.');

  const recommendation: ShadowReport['recommendation'] =
    critical > 1 || monthlyBurn > agent.constitution.monthlyLimit * 1.5
      ? 'unsafe'
      : critical > 0 || violations > 2
        ? 'review'
        : 'safe';

  return {
    requested: round2(requested),
    wouldApprove: round2(approved),
    wouldBlock: round2(blocked),
    violations,
    criticalEvents: critical,
    monthlyBurn: Math.round(monthlyBurn),
    haltedAfter,
    decisions,
    recommendation,
    notes,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
