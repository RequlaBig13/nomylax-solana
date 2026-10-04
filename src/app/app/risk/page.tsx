'use client';

import { useWorkspace } from '@/lib/store';
import { RiskGauge, FactorBars, Bars } from '@/components/charts/Charts';
import { PageHead, Empty, StateBadge } from '@/components/ui/Bits';
import { bandOf } from '@/lib/risk-engine';
import { solAmount } from '@/lib/format';
import Link from 'next/link';

const BANDS = [
  ['0-29', 'Low', '#3FD08A'],
  ['30-54', 'Moderate', '#66E1FF'],
  ['55-74', 'High', '#E8B04B'],
  ['75-100', 'Critical', '#FF5C6C'],
] as const;

export default function Risk() {
  const { agents, decisions, ready } = useWorkspace();
  if (!ready) return null;
  if (!agents.length) return <Empty title="Nothing to score" body="Risk is computed per request. Connect an agent to start producing decisions." action={<Link className="btn btn-primary" href="/app/onboarding">Start onboarding</Link>} />;

  const avg = Math.round(agents.reduce((s, a) => s + a.riskScore, 0) / agents.length);
  const latest = decisions[0];
  const history = decisions.slice(0, 14).reverse().map((d) => d.risk.score);
  const critical = decisions.filter((d) => d.risk.band === 'critical');

  return (
    <>
      <PageHead title="Risk & compliance" sub="The Nomylax Risk Score compresses seven signals into one value from 0 to 100 that policy thresholds act on." />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.2fr)', gap: 18, alignItems: 'start' }}>
        <div className="card">
          <div className="card-hd"><span className="label">Workspace risk</span><span className="badge">{agents.length} agents</span></div>
          <div className="card-bd">
            <RiskGauge score={avg} band={bandOf(avg)} size={260} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1, background: 'var(--line)', border: '1px solid var(--line)', marginTop: 22 }}>
              {BANDS.map(([range, name, color]) => (
                <div key={name} style={{ background: '#0B1020', padding: 12, textAlign: 'center' }}>
                  <div className="num" style={{ fontSize: 11, color: 'var(--text-3)' }}>{range}</div>
                  <div className="caps" style={{ fontSize: 10, marginTop: 6, color }}>{name}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-hd"><span className="label">Factors · most recent decision</span></div>
          <div className="card-bd">
            {latest ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14, fontSize: 13 }}>
                  <span style={{ color: 'var(--text-2)' }}>{latest.agentName} · {latest.request.purpose}</span>
                  <span className="num" style={{ color: '#E6EAF2' }}>{solAmount(latest.request.amount)}</span>
                </div>
                <FactorBars factors={latest.risk.factors} />
              </>
            ) : <span style={{ fontSize: 13, color: 'var(--text-3)' }}>No decisions recorded yet.</span>}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 18, marginTop: 18 }}>
        <div className="card">
          <div className="card-hd"><span className="label">Risk history</span></div>
          <div className="card-bd">
            {history.length ? <Bars data={history} colors={history.map((s) => (s < 30 ? '#3FD08A' : s < 55 ? '#2962FF' : s < 75 ? '#E8B04B' : '#FF5C6C'))} /> : <span style={{ fontSize: 13, color: 'var(--text-3)' }}>No history yet.</span>}
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 12 }}>Score per decision, oldest to newest.</p>
          </div>
        </div>

        <div className="card">
          <div className="card-hd"><span className="label">Agent compliance</span></div>
          <table className="tbl">
            <thead><tr><th>Agent</th><th>State</th><th className="t-right">Risk</th><th className="t-right">Threshold</th></tr></thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.id}>
                  <td style={{ color: '#E6EAF2' }}>{a.name}</td>
                  <td><StateBadge s={a.state} /></td>
                  <td className="t-right num">{a.riskScore}</td>
                  <td className="t-right num" style={{ color: 'var(--text-3)' }}>{a.constitution.riskThreshold}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-hd"><span className="label">Critical events</span><span className="badge bad"><i />{critical.length}</span></div>
          <div className="card-bd" style={{ fontSize: 13, display: 'grid', gap: 10 }}>
            {critical.length ? critical.slice(0, 6).map((d) => (
              <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingBottom: 10, borderBottom: '1px solid var(--line)' }}>
                <span style={{ color: 'var(--text-2)' }}>{d.agentName} · {d.request.purpose}</span>
                <span className="num" style={{ color: '#FF5C6C' }}>{d.risk.score}</span>
              </div>
            )) : <span style={{ color: 'var(--text-3)' }}>No critical events recorded.</span>}
          </div>
        </div>
      </div>
    </>
  );
}
