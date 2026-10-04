'use client';

import Link from 'next/link';
import { useWorkspace } from '@/lib/store';
import { PageHead, StateBadge, ModeBadge, Empty } from '@/components/ui/Bits';
import { solAmount, ago } from '@/lib/format';

export default function Agents() {
  const { agents, ready } = useWorkspace();
  if (!ready) return null;

  if (!agents.length) {
    return <Empty title="No agents registered" body="Create a Financial Constitution before enabling live execution." action={<Link className="btn btn-primary" href="/app/onboarding">Add your first agent</Link>} />;
  }

  return (
    <>
      <PageHead
        title="Agents"
        sub="Every autonomous system drawing on this treasury, and the authority each one holds."
        actions={<Link className="btn btn-primary btn-sm" href="/app/onboarding">Add agent</Link>}
      />
      <div className="card">
        <table className="tbl">
          <thead>
            <tr>
              <th>Name</th><th>Type</th><th>Mode</th><th>State</th>
              <th className="t-right">Daily budget</th><th className="t-right">Spent today</th>
              <th className="t-right">Risk</th><th className="t-right">Compliance</th><th className="t-right">Added</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => {
              const util = (a.spentToday / Math.max(a.constitution.dailyLimit, 1)) * 100;
              const compliance = a.failedCount === 0 ? 100 : Math.max(0, 100 - a.failedCount * 12);
              return (
                <tr key={a.id}>
                  <td><Link href={`/app/agents/${a.id}`} style={{ color: '#E6EAF2' }}>{a.name}</Link></td>
                  <td style={{ textTransform: 'capitalize' }}>{a.type}</td>
                  <td><ModeBadge m={a.mode} /></td>
                  <td><StateBadge s={a.state} /></td>
                  <td className="t-right num">{solAmount(a.constitution.dailyLimit, 0)}</td>
                  <td className="t-right num" style={{ color: util > 80 ? '#E8B04B' : 'var(--text-2)' }}>{solAmount(a.spentToday)}</td>
                  <td className="t-right num" style={{ color: a.riskScore < 30 ? '#3FD08A' : a.riskScore < 75 ? '#E8B04B' : '#FF5C6C' }}>{a.riskScore}</td>
                  <td className="t-right num">{compliance}%</td>
                  <td className="t-right num" style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{ago(a.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
