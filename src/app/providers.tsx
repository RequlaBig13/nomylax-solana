'use client';

import type { ReactNode } from 'react';
import { createClient } from '@solana/kit';
import { solanaRpc } from '@solana/kit-plugin-rpc';
import { walletSigner } from '@solana/kit-plugin-wallet';
import { ClientProvider } from '@solana/react';
import { solanaNetwork } from '@/lib/network';

const network = solanaNetwork();

/**
 * One wallet-standard client for the whole application. The connected wallet
 * supplies the payer and identity; Nomylax never asks the browser for a secret
 * key and never embeds a custodial executor key in client code.
 */
export const solanaClient = createClient()
  .use(walletSigner({ chain: network.chain }))
  .use(solanaRpc({ rpcUrl: network.rpcUrl }));

export type AppSolanaClient = Awaited<typeof solanaClient>;

export function Providers({ children }: { children: ReactNode }) {
  return <ClientProvider client={solanaClient}>{children}</ClientProvider>;
}
