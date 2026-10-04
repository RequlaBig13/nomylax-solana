'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useWorkspace } from '@/lib/store';
import { createAdapter } from '@/lib/adapters';
import { PageHead, VerdictBadge, Empty } from '@/components/ui/Bits';
import { FactorBars } from '@/components/charts/Charts';
import { SolanaSettlement } from '@/components/solana/SolanaSettlement';
import { solAmount, clock } from '@/lib/format';
import { isSolanaAddress } from '@/lib/base58';
import type { Decision } from '@/lib/types';

export default function IntentLab() {
  const { agents, submit, settleDecision, ready } = useWorkspace();
  const [agentId, setAgentId] = useState('');
  const [amount, setAmount] = useState('0.01');
  const [recipient, setRecipient] = useState('');
  const [purpose, setPurpose] = useState('Agent service payment');
  const [last, setLast] = useState<Decision | null>(null);
  const [busy, setBusy] = useState(false);

  if (!ready) return null;
  if (!agents.length) {
    return <Empty title="No agents yet" body="Create an agent and a Financial Constitution before submitting intents." action={<Link className="btn btn-primary" href="/app/onboarding">Start onboarding</Link>} />;
  }

  const active = agents.find((a) => a.id === agentId) ?? agents[0];

  const send = (over?: Partial<{ amount: number; recipient: string; purpose: string }>) => {
    const target = over?.recipient ?? recipient.trim();
    const d = submit({
      agentId: active.id,
      amount: over?.amount ?? Number(amount),
      token: active.constitution.allowedTokens[0] ?? 'SOL',
      recipient: target || '7cUnpUR6kK31GXdRC1UT1Q8D7a4zKDBycnEdesr4butt',
      purpose: over?.purpose ?? purpose,
      recipientVerified: Boolean(target && active.constitution.approvedRecipients.includes(target)),
    }, { simulated: active.mode !== 'live' });
    if (d) setLast(d);
  };

  const generate = async () => {
    setBusy(true);
    try {
      const adapter = createAdapter({ kind: active.endpoint ? 'http' : 'demo', type: active.type, endpoint: active.endpoint });
      const [draft] = await adapter.nextIntents(active.id, 1);
      if (draft) {
        setAmount(String(draft.amount));
        setRecipient(draft.recipient);
        setPurpose(draft.purpose);
        send({ amount: draft.amount, recipient: draft.recipient, purpose: draft.purpose });
      }
    } finally {
      setBusy(false);
    }
  };

  const updateSettlement = (signature: string) => {
    if (!last) return;
    settleDecision(last.id, signature);
    setLast((d) => d ? { ...d, txHash: signature } : d);
  };

  return (
    <>
      <PageHead title="Intent Lab" sub="Inspect the exact path from agent intent to policy verdict. Live-mode approvals can be settled by the connected Solana wallet on Devnet." />

      <div className="two-column-workbench">
        <div className="card">
          <div className="card-hd"><span className="label">Economic intent</span><span className={`badge ${active.mode === 'live' ? 'ok' : 'warn'}`}>{active.mode}</span></div>
          <div className="card-bd" style={{ display: 'grid', gap: 16 }}>
            <label className="field"><span style={{ fontSize: 13 }}>Agent</span>
              <select className="select" value={active.id} onChange={(e) => setAgentId(e.target.value)}>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.mode}</option>)}
              </select>
              <span className="hint">Daily remaining: {solAmount(Math.max(active.constitution.dailyLimit - active.spentToday, 0))} · Max transaction {solAmount(active.constitution.maxTransaction)}</span>
            </label>

            <label className="field"><span style={{ fontSize: 13 }}>Amount</span>
              <div className="input-with-unit"><input className="input num-input" type="number" step="0.001" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} /><span>SOL</span></div>
            </label>

            <label className="field"><span style={{ fontSize: 13 }}>Recipient</span>
              <input className="input num-input" style={{ fontSize: 12 }} placeholder="Paste a Solana address" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
              <span className="hint">For live settlement, paste a Devnet address you control or explicitly approved in the constitution. {recipient && !isSolanaAddress(recipient) ? 'This address is not valid Solana base58.' : ''}</span>
            </label>

            <label className="field"><span style={{ fontSize: 13 }}>Purpose</span>
              <input className="input" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
            </label>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={() => send()}>Evaluate intent</button>
              <button className="btn btn-ghost" onClick={generate} disabled={busy}>{busy ? 'Asking agent…' : 'Generate agent intent'}</button>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => send({ amount: active.constitution.maxTransaction * 4, recipient: '7cUnpUR6kK31GXdRC1UT1Q8D7a4zKDBycnEdesr4butt', purpose: 'Deliberate out-of-policy transfer' })}>
              Run a deliberate violation
            </button>
          </div>
        </div>

        <div className="card decision-card">
          <div className="card-hd"><span className="label">Decision trace</span>{last ? <VerdictBadge v={last.verdict} /> : <span className="badge">Idle</span>}</div>
          {last ? (
            <div className="card-bd anim-in" key={last.id}>
              <div className="decision-metrics">
                <div><div className="label">Amount</div><div className="num">{solAmount(last.request.amount)}</div></div>
                <div><div className="label">Risk</div><div className="num" style={{ color: last.risk.band === 'low' ? '#3FD08A' : last.risk.band === 'critical' ? '#FF5C6C' : '#E8B04B' }}>{last.risk.score} · {last.risk.band.toUpperCase()}</div></div>
                <div><div className="label">Time</div><div className="num">{clock(last.ts)}</div></div>
                <div><div className="label">Rail</div><div className="num">{last.simulated ? 'Shadow' : last.txHash ? 'Settled' : 'Wallet required'}</div></div>
              </div>

              <div className="check-stack">
                {last.checks.map((c, i) => (
                  <div key={c.id} className="check-row anim-in" style={{ animationDelay: `${i * 45}ms` }}>
                    <span className={`check-dot ${c.passed ? 'pass' : 'fail'}`}><i /></span>
                    <span>{c.name}</span><strong className="num">{c.detail}</strong>
                  </div>
                ))}
              </div>

              <div className={`decision-callout ${last.verdict}`}>
                <div className="caps">{last.verdict === 'execute' ? (last.simulated ? 'Would execute' : 'Policy approved') : last.verdict === 'review' ? 'Held for review' : 'Blocked'}</div>
                <p>{last.reason}</p>
                {last.protectedValue > 0 ? <p className="num gold-text">{solAmount(last.protectedValue)} kept behind the policy boundary</p> : null}
              </div>

              <SolanaSettlement decision={last} onSettled={updateSettlement} />

              <div style={{ marginTop: 20 }}><div className="label" style={{ marginBottom: 10 }}>Risk factors</div><FactorBars factors={last.risk.factors} /></div>
            </div>
          ) : <div className="card-bd empty-trace">No synthetic transaction history. Submit an intent and Nomylax will show every policy check in the order it ran.</div>}
        </div>
      </div>
    </>
  );
}
