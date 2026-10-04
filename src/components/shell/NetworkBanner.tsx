'use client';

import { clientNetwork } from '@/lib/network';

/**
 * Standing reminder of which chain is active. A test environment must never be
 * mistaken for mainnet, and mainnet must never be mistaken for a sandbox.
 */
export function NetworkBanner() {
  const net = clientNetwork();
  if (!net.isTestnet) return null;

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        padding: '7px 16px', fontSize: 11.5,
        background: 'rgba(232,176,75,0.08)', borderBottom: '1px solid rgba(232,176,75,0.22)',
        color: '#E8B04B',
      }}
    >
      <span className="caps" style={{ fontSize: 9.5, letterSpacing: '0.22em' }}>{net.label}</span>
      <span style={{ color: 'var(--text-3)' }}>
        Test environment. Transactions settle on a test network and carry no real value.
      </span>
    </div>
  );
}

export function NetworkBadge() {
  const net = clientNetwork();
  return (
    <span className={`badge ${net.isTestnet ? 'warn' : 'gold'}`} title={net.chain}>
      <i />{net.label}
    </span>
  );
}
