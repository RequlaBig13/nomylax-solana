'use client';

import { useMemo, useState } from 'react';
import { useConnect, useConnectedWallet, useDisconnect, useWalletStatus, useWallets } from '@solana/kit-plugin-wallet/react';
import { useClient } from '@solana/react';
import type { AppSolanaClient } from '@/app/providers';
import { solanaNetwork } from '@/lib/network';
import { encodeBase58 } from '@/lib/base58';

type UiStatus = 'disconnected' | 'connecting' | 'connected' | 'authenticating' | 'authenticated' | 'error';

export function useWallet() {
  const client = useClient<AppSolanaClient>();
  const wallets = useWallets(client);
  const connected = useConnectedWallet(client);
  const walletStatus = useWalletStatus(client);
  const connectAction = useConnect(client);
  const disconnectAction = useDisconnect(client);
  const [localError, setLocalError] = useState<string | null>(null);
  const [authenticating, setAuthenticating] = useState(false);
  const [authenticatedAddress, setAuthenticatedAddress] = useState<string | null>(null);
  const network = solanaNetwork();
  const address = connected ? String(connected.account.address) : null;
  const authenticated = Boolean(address && authenticatedAddress === address);

  const status: UiStatus = authenticated ? 'authenticated'
    : authenticating ? 'authenticating'
      : connected ? 'connected'
        : walletStatus === 'connecting' || walletStatus === 'reconnecting' ? 'connecting'
          : connectAction.error ? 'error' : 'disconnected';

  const error = localError
    ?? (connectAction.error ? String(connectAction.error) : null)
    ?? (disconnectAction.error ? String(disconnectAction.error) : null);

  const connect = (walletName?: string) => {
    setLocalError(null);
    setAuthenticatedAddress(null);
    const wallet = walletName ? wallets.find((w) => w.name === walletName) : wallets[0];
    if (!wallet) {
      setLocalError('No Wallet Standard-compatible Solana wallet was discovered. Install Phantom, Solflare, Backpack, or another compatible wallet and reload.');
      return;
    }
    connectAction.dispatch(wallet);
  };

  const disconnect = () => { setAuthenticatedAddress(null); disconnectAction.dispatch(); };

  const signIn = async () => {
    if (!address) return false;
    setAuthenticating(true); setLocalError(null);
    try {
      const challengeRes = await fetch('/api/auth/nonce', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address }) });
      const challenge = await challengeRes.json() as { nonce?: string; message?: string; error?: string };
      if (!challengeRes.ok || !challenge.nonce || !challenge.message) throw new Error(challenge.error ?? 'Could not create a wallet challenge');

      const raw = await client.wallet.signMessage(new TextEncoder().encode(challenge.message));
      const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw as unknown as ArrayBuffer);
      const signature = encodeBase58(bytes);
      const verifyRes = await fetch('/api/auth/verify', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address, message: challenge.message, nonce: challenge.nonce, signature }),
      });
      const verified = await verifyRes.json() as { error?: string };
      if (!verifyRes.ok) throw new Error(verified.error ?? 'Wallet signature could not be verified');
      setAuthenticatedAddress(address);
      return true;
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally { setAuthenticating(false); }
  };

  const signOut = async () => {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } finally { disconnect(); }
  };

  const walletNames = useMemo(() => wallets.map((w) => w.name), [wallets]);
  return {
    address, status, error, hasProvider: wallets.length > 0, walletNames,
    connectedWalletName: connected?.wallet.name ?? null,
    connect, disconnect, signIn, signOut, network,
    chainName: network.label, expectedChainId: network.chain,
    isAuthenticated: authenticated, isConnecting: connectAction.isRunning,
  };
}
