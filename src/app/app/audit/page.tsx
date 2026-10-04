'use client';

import { useWorkspace } from '@/lib/store';
import { PageHead, Empty } from '@/components/ui/Bits';
import { solAmount, clock } from '@/lib/format';

export default function Audit() {
  const { decisions, ready } = useWorkspace();
  if (!ready) return null;

  const download = () => {
    const blob = new Blob([JSON.stringify(decisions, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `nomylax-audit-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  if (!decisions.length) return <Empty title="Audit log is empty" body="Every request, decision, score and outcome is written here as it happens." />;

  return (
    <>
      <PageHead
        title="Audit log"
        sub="Append only record of every decision, including the checks that produced it."
        actions={<button className="btn btn-ghost btn-sm" onClick={download}>Export JSON</button>}
      />
      <div style={{ display: 'grid', gap: 10 }}>
        {decisions.slice(0, 60).map((d) => {
          const failed = d.checks.filter((c) => !c.passed);
          const color = d.verdict === 'execute' ? '#3FD08A' : d.verdict === 'review' ? '#E8B04B' : '#FF5C6C';
          return (
            <div key={d.id} className="card" style={{ padding: 14, borderLeft: `2px solid ${color}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>
                <span style={{ color: 'var(--text-3)' }}>{clock(d.ts)}</span>
                <span style={{ color: '#66E1FF' }}>{d.id}</span>
                <span style={{ color: '#E6EAF2' }}>{d.agentName}</span>
                <span style={{ color: '#E6EAF2' }}>{solAmount(d.request.amount)} {d.request.token}</span>
                <span style={{ color: 'var(--text-3)' }}>NRS {d.risk.score}</span>
                <span style={{ color }}>{d.verdict.toUpperCase()}</span>
                <span style={{ color: 'var(--text-3)' }}>{d.simulated ? 'SIMULATED' : d.txHash ?? '-'}</span>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 8 }}>{d.reason}</div>
              {failed.length ? (
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6, fontFamily: 'var(--font-mono)' }}>
                  failed: {failed.map((c) => c.id).join(', ')}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}
