'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { HelmetMark } from '@/components/ui/Mark';
import { useWorkspace } from '@/lib/store';

const NAV = [
  ['Command Center', '/app/overview'],
  ['Treasury', '/app/treasury'],
  ['Agents', '/app/agents'],
  ['Constitutions', '/app/policies'],
  ['Intent Lab', '/app/monitoring'],
  ['Shadow Lab', '/app/shadow'],
  ['Transactions', '/app/transactions'],
  ['Risk', '/app/risk'],
  ['Audit', '/app/audit'],
  ['Control Copilot', '/app/copilot'],
  ['Settings', '/app/settings'],
] as const;

export function Sidebar() {
  const path = usePathname();
  const { agents } = useWorkspace();
  const guardian = agents.some((a) => a.state === 'safe')
    ? { text: 'Safe mode', color: '#FF5C6C' }
    : agents.some((a) => a.state === 'watch')
      ? { text: 'Watching', color: '#E8B04B' }
      : { text: 'Active', color: '#66E1FF' };

  return (
    <aside className="app-sidebar">
      <Link href="/" className="sidebar-brand"><HelmetMark size={27} /><span><strong className="caps">Nomylax</strong><small>Solana control plane</small></span></Link>
      <nav className="sidebar-nav">
        {NAV.map(([label, href]) => {
          const active = path === href || (href !== '/app/overview' && path.startsWith(href));
          return <Link key={href} href={href} className={active ? 'active' : ''}>{label}</Link>;
        })}
      </nav>
      <div className="sidebar-foot">
        <div className="guardian-card">
          <span className="label">Guardian status</span>
          <div><i className="pulse-dot" style={{ background: guardian.color, boxShadow: `0 0 10px ${guardian.color}` }} /><strong style={{ color: guardian.color }}>{guardian.text}</strong></div>
          <small>{agents.length} agent{agents.length === 1 ? '' : 's'} under policy</small>
        </div>
      </div>
    </aside>
  );
}
