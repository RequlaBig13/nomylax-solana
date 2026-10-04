'use client';

import { useState } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { shortAddr } from '@/lib/format';

export function WalletButton({ compact = false }: { compact?: boolean }) {
  const wallet = useWallet();
  const [open, setOpen] = useState(false);

  if (wallet.address) {
    return (
      <div className="wallet-control">
        <button className="wallet-trigger connected" onClick={() => setOpen((v) => !v)} type="button">
          <span className="wallet-led" />
          <span className="num">{shortAddr(wallet.address)}</span>
          {!compact ? <span className="wallet-network">{wallet.network.name}</span> : null}
        </button>
        {open ? (
          <div className="wallet-menu">
            <div className="wallet-menu-eyebrow">Connected with {wallet.connectedWalletName ?? 'Wallet Standard'}</div>
            <div className="wallet-menu-address num">{wallet.address}</div>
            <button className="btn btn-ghost btn-sm" onClick={() => { void wallet.signOut(); setOpen(false); }}>Disconnect</button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="wallet-control">
      <button className="btn btn-primary btn-sm" onClick={() => setOpen((v) => !v)} type="button">
        {wallet.isConnecting ? 'Connecting…' : 'Connect wallet'}
      </button>
      {open ? (
        <div className="wallet-menu wallet-picker">
          <div className="wallet-menu-eyebrow">Wallet Standard</div>
          {wallet.walletNames.length ? wallet.walletNames.map((name) => (
            <button key={name} className="wallet-option" onClick={() => { wallet.connect(name); setOpen(false); }}>
              <span>{name}</span><span>Connect</span>
            </button>
          )) : (
            <p className="wallet-empty">No compatible Solana wallet found in this browser.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
