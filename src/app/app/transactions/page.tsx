'use client';

import { useState } from 'react';
import { useWorkspace } from '@/lib/store';
import { PageHead, VerdictBadge, Empty } from '@/components/ui/Bits';
import { solAmount, clock, shortAddr } from '@/lib/format';
import { txUrl } from '@/lib/network';
import type { Verdict } from '@/lib/types';

const FILTERS: (Verdict | 'all')[] = ['all', 'execute', 'review', 'blocked'];

export default function Transactions() {
  const { decisions, ready } = useWorkspace();
  const [filter, setFilter] = useState<Verdict | 'all'>('all');
  if (!ready) return null;

  const rows = decisions.filter((d) => filter === 'all' || d.verdict === filter);

  return (
    <>
      <PageHead
        title="Transactions"
        sub="Every economic intent submitted to Nomylax, whether or not it settled."
        actions={
          <div style={{ display: 'inline-flex', border: '1px solid var(--line-2)', borderRadius: 3, padding: 3 }}>
            {FILTERS.map((f) => (
              <button key={f} className="btn btn-sm" style={{
                background: filter === f ? '#1F2433' : 'transparent',
                color: filter === f ? '#E6EAF2' : 'var(--text-3)', textTransform: 'capitalize',
              }} onClick={() => setFilter(f)}>{f}</button>
            ))}
          </div>
        }
      />
      {rows.length ? (
        <div className="card">
          <table className="tbl">
            <thead>
              <tr><th>Time</th><th>Agent</th><th>Purpose</th><th>Recipient</th><th className="t-right">Amount</th><th className="t-right">Risk</th><th className="t-right">Verdict</th><th className="t-right">Settlement</th></tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td className="num" style={{ fontSize: 11.5 }}>{clock(d.ts)}</td>
                  <td style={{ color: '#E6EAF2' }}>{d.agentName}</td>
                  <td>{d.request.purpose}</td>
                  <td className="num" style={{ fontSize: 11.5 }}>{shortAddr(d.request.recipient)}</td>
                  <td className="t-right num">{solAmount(d.request.amount)}</td>
                  <td className="t-right num" style={{ color: d.risk.band === 'low' ? '#3FD08A' : d.risk.band === 'critical' ? '#FF5C6C' : '#E8B04B' }}>{d.risk.score}</td>
                  <td className="t-right"><VerdictBadge v={d.verdict} /></td>
                  <td className="t-right num" style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{d.txHash ? <a href={txUrl(d.txHash)} target="_blank" rel="noreferrer" style={{ color: '#66E1FF' }}>{shortAddr(d.txHash)} ↗</a> : (d.simulated ? 'Simulated' : d.verdict === 'execute' ? 'Awaiting wallet' : '-')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="No transactions yet" body="Submit an intent from Intent Lab, or run a shadow simulation from an agent page." />
      )}
    </>
  );
}
