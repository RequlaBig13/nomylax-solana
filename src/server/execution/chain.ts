import { solanaNetwork } from '@/lib/network';

export class ChainConfigError extends Error {}

export function activeNetwork() {
  const n = solanaNetwork();
  if (!n.rpcUrl) throw new ChainConfigError('NEXT_PUBLIC_SOLANA_RPC_URL is not configured');
  return {
    name: n.name,
    label: n.label,
    chain: n.chain,
    isTestnet: n.isTestnet,
    explorer: n.explorer,
    rpcUrl: n.rpcUrl,
  };
}

/** Minimal server-side Solana JSON-RPC helper. Signing always stays in the browser wallet. */
export async function solanaRpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const n = activeNetwork();
  const res = await fetch(n.rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: `nomylax-${Date.now()}`, method, params }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Solana RPC returned HTTP ${res.status}`);
  const body = await res.json() as { result?: T; error?: { message?: string } };
  if (body.error) throw new Error(body.error.message ?? 'Solana RPC request failed');
  return body.result as T;
}

export function isExecutionConfigured() {
  // Nomylax deliberately has no hot executor private key. A live settlement is
  // considered configured when a public RPC is available; the user's Wallet
  // Standard wallet supplies the signer in the client.
  return Boolean(activeNetwork().rpcUrl);
}
