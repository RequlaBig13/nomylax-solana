'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useWorkspace } from '@/lib/store';
import { runShadow } from '@/lib/shadow';
import { PageHead, StateBadge, ModeBadge, VerdictBadge, Empty, Stat } from '@/components/ui/Bits';
import { RiskGauge, Bars } from '@/components/charts/Charts';
import { ConstitutionSummary } from '@/components/onboarding/ConstitutionBuilder';
import { bandOf } from '@/lib/risk-engine';
import { solAmount, ago, clock } from '@/lib/format';
import type { ShadowReport } from '@/lib/types';

export default function AgentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { agents, decisions, treasury, setMode, resetState, ready } = useWorkspace();
  const [report, setReport] = useState<ShadowReport | null>(null);
  const [busy, setBusy] = useState(false);

  const agent = agents.find((a) => a.id === id);
  if (!ready) return null;
  if (!agent) return <Empty title="Agent not found" body="This agent is not in the current workspace." action={<Link className="btn btn-ghost" href="/app/agents">Back to agents</Link>} />;

  const mine = decisions.filter((d) => d.agentId === agent.id);
  const blocked = mine.filter((d) => d.verdict === 'blocked');
  const spendSeries = mine.slice(0, 12).reverse().map((d) => (d.verdict === 'execute' ? d.request.amount : 0));

  const shadow = async () => {
    setBusy(true);
    try { setReport(await runShadow(agent, treasury, { requests: 12 })); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHead
        title={agent.name}
        sub={`${agent.type} agent · registered ${ago(agent.createdAt)}${agent.endpoint ? ` · ${agent.endpoint}` : ' · demo adapter'}`}
        actions={
          <>
            {agent.state === 'safe' ? <button className="btn btn-danger btn-sm" onClick={() => resetState(agent.id)}>Clear safe mode</button> : null}
            {agent.mode === 'paused'
              ? <button className="btn btn-primary btn-sm" onClick={() => setMode(agent.id, 'live')}>Resume agent</button>
              : <button className="btn btn-ghost btn-sm" onClick={() => setMode(agent.id, 'paused')}>Pause agent</button>}
            <button className="btn btn-ghost btn-sm" onClick={() => setMode(agent.id, agent.mode === 'shadow' ? 'live' : 'shadow')}>
              {agent.mode === 'shadow' ? 'Go live' : 'To shadow'}
            </button>
          </>
        }
      />

      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <ModeBadge m={agent.mode} /><StateBadge s={agent.state} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 1, background: 'var(--line)', border: '1px solid var(--line)' }}>
        <div style={{ background: '#151A26' }}><Stat label="Spent today" value={solAmount(agent.spentToday)} sub={`of ${solAmount(agent.constitution.dailyLimit, 0)}`} /></div>
        <div style={{ background: '#151A26' }}><Stat label="Spent this month" value={solAmount(agent.spentMonth)} sub={`of ${solAmount(agent.constitution.monthlyLimit, 0)}`} /></div>
        <div style={{ background: '#151A26' }}><Stat label="Blocked value" value={solAmount(blocked.reduce((s, d) => s + d.protectedValue, 0))} tone="gold" sub={`${blocked.length} refused`} /></div>
        <div style={{ background: '#151A26' }}><Stat label="Failures" value={`${agent.failedCount} / ${agent.constitution.failedTxThreshold}`} tone={agent.failedCount >= agent.constitution.failedTxThreshold ? 'bad' : 'default'} sub="Before safe mode" /></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)', gap: 18, marginTop: 18 }}>
        <div className="card">
          <div className="card-hd"><span className="label">Current risk</span></div>
          <div className="card-bd"><RiskGauge score={agent.riskScore} band={bandOf(agent.riskScore)} size={200} /></div>
        </div>

        <div className="card">
          <div className="card-hd"><span className="label">Recent executed spend</span></div>
          <div className="card-bd">
            {spendSeries.length ? <Bars data={spendSeries} /> : <span style={{ fontSize: 13, color: 'var(--text-3)' }}>No executed spend yet.</span>}
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 12 }}>Last {spendSeries.length} decisions, blocked actions shown as zero.</p>
          </div>
        </div>

        <ConstitutionSummary value={agent.constitution} agentName={agent.name} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 18, marginTop: 18 }}>
        <div className="card">
          <div className="card-hd"><span className="label">Decision history</span></div>
          {mine.length ? (
            <table className="tbl">
              <thead><tr><th>Time</th><th>Purpose</th><th className="t-right">Amount</th><th className="t-right">Risk</th><th className="t-right">Verdict</th></tr></thead>
              <tbody>
                {mine.slice(0, 14).map((d) => (
                  <tr key={d.id}>
                    <td className="num" style={{ fontSize: 11.5 }}>{clock(d.ts)}</td>
                    <td>{d.request.purpose}</td>
                    <td className="t-right num">{solAmount(d.request.amount)}</td>
                    <td className="t-right num">{d.risk.score}</td>
                    <td className="t-right"><VerdictBadge v={d.verdict} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="card-bd" style={{ fontSize: 13, color: 'var(--text-3)' }}>Nothing recorded yet.</div>}
        </div>

        <div className="card">
          <div className="card-hd">
            <span className="label">Shadow run</span>
            <button className="btn btn-ghost btn-sm" onClick={shadow} disabled={busy}>{busy ? 'Running…' : 'Run simulation'}</button>
          </div>
          <div className="card-bd">
            {report ? (
              <div className="anim-in">
                {([['Requested', solAmount(report.requested)], ['Would approve', solAmount(report.wouldApprove)], ['Would block', solAmount(report.wouldBlock)], ['Critical events', String(report.criticalEvents)], ['Monthly burn', solAmount(report.monthlyBurn, 0)]] as [string, string][]).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-3)' }}>{k}</span><span className="num" style={{ color: '#E6EAF2' }}>{v}</span>
                  </div>
                ))}
                <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 12 }}>{report.notes.join(' ')}</p>
              </div>
            ) : <span style={{ fontSize: 13, color: 'var(--text-3)' }}>Run a simulation to project this agent&apos;s behaviour without moving capital.</span>}
          </div>
        </div>
      </div>
    </>
  );
}
