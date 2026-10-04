'use client';

import Link from 'next/link';
import { useWorkspace } from '@/lib/store';
import { AreaChart, Donut, RiskGauge } from '@/components/charts/Charts';
import { Stat, VerdictBadge, StateBadge, ModeBadge, PageHead, Empty, ChartEmpty } from '@/components/ui/Bits';
import { treasuryHistory, outflowByAsset, changePct, axisLabels, settled } from '@/lib/series';
import { solAmount, solCompact, ago, clock } from '@/lib/format';
import { bandOf } from '@/lib/risk-engine';

export default function Overview() {
  const { treasury, agents, decisions, ready } = useWorkspace();
  if (!ready) return null;

  if (!agents.length) {
    return (
      <Empty
        title="No agents under policy yet"
        body="Your treasury is ready. Add an agent to begin defining financial authority."
        action={<Link className="btn btn-primary" href="/app/onboarding">Start onboarding</Link>}
      />
    );
  }

  const blockedValue = decisions.filter((d) => d.verdict === 'blocked').reduce((s, d) => s + d.protectedValue, 0);
  const executed = decisions.filter((d) => d.verdict === 'execute');
  const dailyBurn = agents.reduce((s, a) => s + a.spentToday, 0);
  const runway = dailyBurn > 0 ? Math.floor((treasury.available - treasury.reserve) / dailyBurn) : Infinity;
  const avgRisk = Math.round(agents.reduce((s, a) => s + a.riskScore, 0) / agents.length);

  // Charts are reconstructed from recorded decisions, not from a fixed series.
  // Both render an empty state when nothing has settled, because a treasury
  // that has released nothing has no curve and no outflow mix to show.
  const history = treasuryHistory(treasury, decisions);
  const drift = changePct(history);
  const outflow = outflowByAsset(decisions);
  const settledCount = settled(decisions).length;

  return (
    <>
      <PageHead
        title="Control plane overview"
        sub="Everything drawing on this treasury, and every decision made about it."
        actions={<Link className="btn btn-ghost btn-sm" href="/app/monitoring">Submit test intent</Link>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 1, background: 'var(--line)', border: '1px solid var(--line)' }}>
        <div style={{ background: '#151A26' }}><Stat label="Treasury declared" value={solCompact(treasury.total)} sub={`${solAmount(treasury.available)} available`} /></div>
        <div style={{ background: '#151A26' }}><Stat label="Active agents" value={agents.filter((a) => a.mode === 'live').length} sub={`${agents.length} registered`} /></div>
        <div style={{ background: '#151A26' }}><Stat label="Decisions" value={decisions.length} sub={`${executed.length} executed`} /></div>
        <div style={{ background: '#151A26' }}><Stat label="Value protected" value={solAmount(blockedValue)} tone="gold" sub={`${decisions.filter((d) => d.verdict === 'blocked').length} blocked`} /></div>
        <div style={{ background: '#151A26' }}><Stat label="Mean risk" value={avgRisk} tone={avgRisk < 30 ? 'ok' : avgRisk < 60 ? 'default' : 'bad'} sub={bandOf(avgRisk).toUpperCase()} /></div>
        <div style={{ background: '#151A26' }}><Stat label="Operating runway" value={Number.isFinite(runway) ? `${runway}d` : '-'} sub="At current burn" /></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', gap: 18, marginTop: 18 }}>
        <div className="card">
          <div className="card-hd">
            <div>
              <span className="label">Treasury balance · 7D</span>
              <div className="num" style={{ fontSize: 24, marginTop: 8 }}>{solCompact(treasury.total)}</div>
            </div>
            {drift !== null ? (
              <span className="num" style={{ color: drift < 0 ? '#E8B04B' : 'var(--text-3)', fontSize: 12.5 }}>
                {drift > 0 ? '+' : ''}{drift}%
              </span>
            ) : null}
          </div>
          <div className="card-bd">
            {settledCount ? (
              <>
                <AreaChart data={history.map((p) => p.value)} labels={axisLabels(history)} />
                <p className="hint" style={{ marginTop: 12 }}>
                  Reconstructed from settled outflow. Deposits and transfers made outside
                  Nomylax do not appear here - this is what the control plane released,
                  not an on-chain balance history.
                </p>
              </>
            ) : (
              <ChartEmpty
                line="Nothing has settled from this treasury yet."
                note="The curve is built from decisions the engine executed, so there is nothing to plot until the first one settles."
              />
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-hd"><span className="label">Outflow by asset</span></div>
          <div className="card-bd" style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            {outflow.length ? (
              <>
                <Donut slices={outflow} />
                <div style={{ flex: 1, minWidth: 150 }}>
                  {outflow.map((s) => (
                    <div key={s.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 9, color: 'var(--text-2)' }}>
                        <i style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: 'block' }} />{s.name}
                      </span>
                      <span className="num" style={{ color: '#E6EAF2' }}>{s.pct}%</span>
                    </div>
                  ))}
                  <p className="hint" style={{ marginTop: 12 }}>
                    Where value went. Not a holdings breakdown - Nomylax does not custody
                    assets or read balances.
                  </p>
                </div>
              </>
            ) : (
              <ChartEmpty
                line="No outflow recorded."
                note="This breaks down assets the agents actually moved. It stays empty until something settles."
              />
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: 18, marginTop: 18 }}>
        <div className="card">
          <div className="card-hd">
            <span className="label">Agents</span>
            <Link className="btn btn-ghost btn-sm" href="/app/agents">View all</Link>
          </div>
          <table className="tbl">
            <thead><tr><th>Agent</th><th>Mode</th><th>State</th><th className="t-right">Spent today</th><th className="t-right">Risk</th></tr></thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.id}>
                  <td><Link href={`/app/agents/${a.id}`} style={{ color: '#E6EAF2' }}>{a.name}</Link></td>
                  <td><ModeBadge m={a.mode} /></td>
                  <td><StateBadge s={a.state} /></td>
                  <td className="t-right num">{solAmount(a.spentToday)} <span style={{ color: 'var(--text-3)' }}>/ {solAmount(a.constitution.dailyLimit, 0)}</span></td>
                  <td className="t-right num" style={{ color: a.riskScore < 30 ? '#3FD08A' : a.riskScore < 75 ? '#E8B04B' : '#FF5C6C' }}>{a.riskScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-hd"><span className="label">Risk overview</span></div>
          <div className="card-bd">
            <RiskGauge score={avgRisk} band={bandOf(avgRisk)} size={240} />
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 18, marginTop: 18 }}>
        <div className="card">
          <div className="card-hd">
            <span className="label">Latest decisions</span>
            <Link className="btn btn-ghost btn-sm" href="/app/transactions">View all</Link>
          </div>
          {decisions.length ? (
            <table className="tbl">
              <tbody>
                {decisions.slice(0, 6).map((d) => (
                  <tr key={d.id}>
                    <td style={{ color: '#E6EAF2' }}>{d.agentName}</td>
                    <td className="num">{solAmount(d.request.amount)}</td>
                    <td style={{ color: 'var(--text-3)' }}>{d.request.purpose}</td>
                    <td className="t-right"><VerdictBadge v={d.verdict} /></td>
                    <td className="t-right num" style={{ color: 'var(--text-3)', fontSize: 11.5 }}>{ago(d.ts)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="card-bd" style={{ color: 'var(--text-3)', fontSize: 13 }}>
              No decisions recorded yet. Submit a test intent from Monitoring to see the engine run.
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-hd"><span className="label">Live audit stream</span><span className="badge ok"><i />Recording</span></div>
          <div className="card-bd" style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, display: 'grid', gap: 7, maxHeight: 250, overflowY: 'auto' }}>
            {decisions.slice(0, 10).map((d) => (
              <div key={d.id} style={{ display: 'flex', gap: 12, color: 'var(--text-3)' }}>
                <span style={{ opacity: 0.6 }}>{clock(d.ts)}</span>
                <span style={{ color: '#66E1FF', opacity: 0.85 }}>{d.id.slice(-8)}</span>
                <span style={{ color: d.verdict === 'execute' ? '#3FD08A' : d.verdict === 'review' ? '#E8B04B' : '#FF5C6C' }}>
                  {d.verdict.toUpperCase()}
                </span>
              </div>
            ))}
            {!decisions.length ? <span style={{ color: 'var(--text-3)' }}>Awaiting first decision…</span> : null}
          </div>
        </div>
      </div>
    </>
  );
}
