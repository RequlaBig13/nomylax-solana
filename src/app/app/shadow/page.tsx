'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useWorkspace } from '@/lib/store';
import { runShadow } from '@/lib/shadow';
import { PageHead, Empty, VerdictBadge } from '@/components/ui/Bits';
import { solAmount } from '@/lib/format';
import type { ShadowReport } from '@/lib/types';

export default function ShadowLab() {
  const { agents, treasury, recordDecisions, ready } = useWorkspace();
  const [agentId, setAgentId] = useState('');
  const [report, setReport] = useState<ShadowReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ready) return null;
  if (!agents.length) return <Empty title="Shadow Lab needs an agent" body="Create an agent first, then pressure-test its behaviour before giving it live authority." action={<Link className="btn btn-primary" href="/app/onboarding">Create agent</Link>} />;
  const active = agents.find((a) => a.id === agentId) ?? agents[0];

  const run = async () => {
    setBusy(true); setError(null);
    try {
      const next = await runShadow(active, treasury, { requests: 18, hours: 24 });
      setReport(next);
      recordDecisions(next.decisions);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setBusy(false); }
  };

  return <>
    <PageHead title="Shadow Lab" sub="Let an agent behave naturally against its real constitution without moving funds. Promote it only after you understand its failure pattern." />
    <div className="shadow-grid">
      <div className="card shadow-control">
        <div className="card-hd"><span className="label">Pressure test</span><span className="badge warn">No settlement</span></div>
        <div className="card-bd" style={{ display: 'grid', gap: 16 }}>
          <label className="field"><span>Agent</span><select className="select" value={active.id} onChange={(e) => { setAgentId(e.target.value); setReport(null); }}>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <div className="shadow-constitution">
            <span><small>Daily</small><strong>{solAmount(active.constitution.dailyLimit)}</strong></span>
            <span><small>Max action</small><strong>{solAmount(active.constitution.maxTransaction)}</strong></span>
            <span><small>Risk ceiling</small><strong>{active.constitution.riskThreshold} NRS</strong></span>
          </div>
          <p className="muted-copy">Nomylax will request 18 intents from the same adapter used by the product, deplete simulated budgets, and model the moment Safe Mode would have tripped.</p>
          <button className="btn btn-primary" onClick={run} disabled={busy}>{busy ? 'Running agent…' : report ? 'Run another shadow session' : 'Run shadow session'}</button>
          {error ? <div className="settlement-note bad">{error}</div> : null}
        </div>
      </div>

      <div className="card">
        <div className="card-hd"><span className="label">Behaviour report</span>{report ? <span className={`badge ${report.recommendation === 'safe' ? 'ok' : report.recommendation === 'review' ? 'warn' : 'bad'}`}>{report.recommendation}</span> : <span className="badge">Waiting</span>}</div>
        {!report ? <div className="card-bd empty-trace">This view starts empty on purpose. Run the agent and the report will be built from that session.</div> : <div className="card-bd">
          <div className="shadow-score-grid">
            <span><small>Requested</small><strong>{solAmount(report.requested)}</strong></span>
            <span><small>Would pass</small><strong className="ok-text">{solAmount(report.wouldApprove)}</strong></span>
            <span><small>Protected</small><strong className="bad-text">{solAmount(report.wouldBlock)}</strong></span>
            <span><small>Violations</small><strong>{report.violations}</strong></span>
          </div>
          <div className="shadow-notes">{report.notes.map((note) => <p key={note}>{note}</p>)}</div>
          <div className="shadow-ledger">{report.decisions.slice(0, 8).map((d) => <div key={d.id}><span>{d.request.purpose}</span><span className="num">{solAmount(d.request.amount)}</span><VerdictBadge v={d.verdict} /></div>)}</div>
        </div>}
      </div>
    </div>
  </>;
}
