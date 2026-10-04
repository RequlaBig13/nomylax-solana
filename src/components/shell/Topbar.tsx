'use client';

import { usePathname } from 'next/navigation';
import { useWorkspace } from '@/lib/store';
import { NetworkBadge } from './NetworkBanner';
import { WalletButton } from '@/components/wallet/WalletButton';

const TITLES: Record<string, string> = {
  '/app/overview': 'Command Center',
  '/app/treasury': 'Treasury',
  '/app/agents': 'Agents',
  '/app/transactions': 'Transactions',
  '/app/risk': 'Risk & compliance',
  '/app/policies': 'Financial Constitutions',
  '/app/monitoring': 'Intent Lab',
  '/app/shadow': 'Shadow Lab',
  '/app/audit': 'Audit trail',
  '/app/copilot': 'Control Copilot',
  '/app/settings': 'Settings',
};

export function Topbar() {
  const path = usePathname();
  const { agents } = useWorkspace();
  const title = TITLES[path] ?? (path.startsWith('/app/agents/') ? 'Agent detail' : 'Nomylax');
  const halted = agents.some((a) => a.state === 'safe');

  return (
    <header className="app-topbar">
      <div className="topbar-context">
        <span className="topbar-title">{title}</span>
        <span className={`system-state ${halted ? 'halted' : ''}`}>
          <i className="pulse-dot" />{halted ? 'Safe Mode active' : 'Policy engine healthy'}
        </span>
      </div>
      <div className="topbar-actions"><NetworkBadge /><WalletButton compact /></div>
    </header>
  );
}
