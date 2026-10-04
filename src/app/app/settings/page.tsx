'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '@/lib/store';
import { useWallet } from '@/hooks/useWallet';
import { PageHead } from '@/components/ui/Bits';
import { shortAddr } from '@/lib/format';

export default function Settings() {
  const router = useRouter();
  const { workspace, agents, decisions, hardReset, ready } = useWorkspace();
  const { address, chainName, expectedChainId } = useWallet();
  const [confirm, setConfirm] = useState(false);
  if (!ready) return null;

  const rows: [string, string][] = [
    ['Workspace', workspace?.name ?? 'Not created'],
    ['Treasury label', workspace?.treasuryLabel ?? '-'],
    ['Default risk profile', workspace?.riskProfile ?? '-'],
    ['Network', `${chainName} · ${expectedChainId}`],
    ['Owner', address ?? workspace?.owner ? shortAddr((address ?? workspace?.owner)!) : 'Not connected'],
    ['Agents registered', String(agents.length)],
    ['Decisions recorded', String(decisions.length)],
  ];

  return (
    <>
      <PageHead title="Settings" sub="Workspace configuration and local data." />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 18, alignItems: 'start' }}>
        <div className="card">
          <div className="card-hd"><span className="label">Workspace</span></div>
          <div className="card-bd">
            {rows.map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '11px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
                <span style={{ color: 'var(--text-3)' }}>{k}</span>
                <span className="num" style={{ color: '#E6EAF2', textTransform: 'capitalize' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-hd"><span className="label">Data</span></div>
          <div className="card-bd">
            <p style={{ fontSize: 13, color: 'var(--text-2)' }}>
              This workspace is stored in your browser under <code className="num">nomylax.workspace.v1</code>. Nothing is sent to a server except the requests you explicitly make to the decision and shadow APIs.
            </p>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 12 }}>
              Swap the store for a database by replacing the persistence effect in <code className="num">src/lib/store.tsx</code>. Every component reads through the same context, so no page changes.
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
              {confirm ? (
                <>
                  <button className="btn btn-danger" onClick={() => { hardReset(); router.push('/app/onboarding'); }}>Confirm - erase everything</button>
                  <button className="btn btn-ghost" onClick={() => setConfirm(false)}>Cancel</button>
                </>
              ) : (
                <button className="btn btn-ghost" onClick={() => setConfirm(true)}>Reset workspace</button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
