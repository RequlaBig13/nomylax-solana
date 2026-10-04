import { NextResponse } from 'next/server';
import { evaluate, nextState } from '@/lib/policy-engine';
import { getRepository } from '@/server/repo';
import { fail, guard, intentSchema, parse, requireSession, serverError } from '@/server/api';
import { parseAmount, tokenSpec, MoneyError } from '@/lib/money';
import { applyDecision, rollCounters } from '@/lib/spend';
import { activeNetwork } from '@/server/execution/chain';

export const runtime = 'nodejs';

/**
 * Decision history for the caller's workspace.
 *
 * Read only. Every record here was produced by the evaluator below; nothing is
 * synthesised for display, so an empty workspace returns an empty list rather
 * than sample rows.
 */
export async function GET(req: Request) {
  const limited = guard(req, 'decisions-read', 120);
  if (limited) return limited;

  const session = requireSession(req);
  if (!session) return fail(401, 'Authentication required');

  try {
    const url = new URL(req.url);
    const raw = Number(url.searchParams.get('limit') ?? 50);
    const limit = Number.isFinite(raw) ? Math.min(200, Math.max(1, Math.trunc(raw))) : 50;
    const agentId = url.searchParams.get('agentId');

    const repo = getRepository();
    const workspace = await repo.getWorkspaceByOwner(session.address);
    if (!workspace) return NextResponse.json({ decisions: [] });

    const all = await repo.listDecisions(workspace.id, agentId ? 500 : limit);
    const decisions = (agentId ? all.filter((d) => d.agentId === agentId) : all).slice(0, limit);

    return NextResponse.json({ decisions, storage: repo.kind });
  } catch (e) {
    return serverError(e);
  }
}

/**
 * Evaluate an economic intent.
 *
 * The caller sends an agentId and an intent, nothing more. The agent, its
 * constitution, the treasury and the safe mode state are all loaded from
 * storage. Limits supplied by a caller are ignored, so a compromised client
 * cannot raise its own ceiling.
 */
export async function POST(req: Request) {
  const limited = guard(req, 'decisions', 60);
  if (limited) return limited;

  const session = requireSession(req);
  if (!session) return fail(401, 'Authentication required');

  const parsed = await parse(req, intentSchema);
  if (!parsed.ok) return parsed.response;
  const { agentId, intent, mode } = parsed.data;

  try {
    const repo = getRepository();

    // One clock reading for the whole evaluation, so a request crossing a UTC
    // midnight cannot roll the counters against one boundary and write them
    // back against the next.
    const now = Date.now();

    // ---- Authoritative state. Nothing here comes from the request. ----
    const agent = await repo.getAgent(agentId);
    if (!agent) return fail(404, 'Agent not found');
    if (agent.ownerAddress !== session.address) {
      return fail(404, 'Agent not found');
    }
    if (!agent.enabled) return fail(409, 'This agent is disabled');

    const version = await repo.getActiveConstitution(agentId);
    if (!version) return fail(409, 'This agent has no active constitution. Create one before submitting intents.');

    const treasury = await repo.getTreasury(agent.workspaceId);
    if (!treasury) return fail(409, 'Workspace treasury is not initialised');

    // ---- Amount handling in base units. ----
    let units: bigint;
    try {
      units = parseAmount(intent.amount, tokenSpec(intent.token).decimals);
    } catch (e) {
      return fail(400, e instanceof MoneyError ? e.message : 'Amount could not be parsed');
    }

    const authoritative = { ...agent, ...rollCounters(agent, now), constitution: version.constitution };
    const simulated = mode === 'shadow' || agent.mode === 'shadow';

    const decision = evaluate(
      authoritative,
      {
        agentId,
        amount: Number(intent.amount),
        token: intent.token.toUpperCase(),
        recipient: intent.recipient,
        purpose: intent.purpose,
      },
      treasury,
      { simulated },
    );

    // A server verdict can authorise settlement but cannot move funds. The live
    // transaction is constructed and signed by the connected Wallet Standard
    // wallet in the client. This API therefore never holds a custodial key.
    const settlement = decision.verdict === 'execute' && !simulated
      ? { required: true, method: 'wallet-standard', status: 'awaiting-signature' as const }
      : { required: false, method: 'none', status: simulated ? 'shadow' as const : 'not-authorised' as const };

    const updated = { ...authoritative, riskScore: decision.risk.score };
    updated.state = nextState(updated, decision);

    // Settled means value actually left the treasury. A hash only ever arrives
    // from the executor after the network returns a receipt, so requiring one
    // here keeps the counters tied to real movement rather than to approval.
    const settled = false;
    const counters = applyDecision(authoritative, decision, { settled, now });

    await repo.saveAgent({
      ...agent, ...counters, riskScore: decision.risk.score, state: updated.state,
    });
    await repo.recordDecision(agent.workspaceId, decision);
    await repo.appendAudit({
      id: `aud_${decision.id}`,
      ts: Date.now(),
      actor: session.address,
      workspaceId: agent.workspaceId,
      agentId,
      action: `decision.${decision.verdict}`,
      detail: {
        amount: intent.amount, token: intent.token, purpose: intent.purpose,
        risk: decision.risk.score, constitutionVersion: version.version,
        constitutionHash: version.hash, simulated,
      },
      txHash: decision.txHash,
    });

    return NextResponse.json({
      decision,
      settlement,
      network: { name: activeNetwork().label, chain: activeNetwork().chain, testnet: activeNetwork().isTestnet },
      constitution: { version: version.version, hash: version.hash },
    });
  } catch (e) {
    return serverError(e);
  }
}
