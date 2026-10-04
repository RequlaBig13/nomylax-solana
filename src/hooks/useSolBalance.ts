'use client';

import { useCallback, useEffect, useState } from 'react';
import { solanaNetwork } from '@/lib/network';

export function useSolBalance(address: string | null) {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!address) { setBalance(null); return; }
    setLoading(true); setError(null);
    try {
      const rpc = solanaNetwork().rpcUrl;
      const res = await fetch(rpc, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [address, { commitment: 'confirmed' }] }),
      });
      const json = await res.json() as { result?: { value?: number }; error?: { message?: string } };
      if (!res.ok || json.error || typeof json.result?.value !== 'number') throw new Error(json.error?.message ?? 'Could not read wallet balance');
      setBalance(json.result.value / 1_000_000_000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setLoading(false); }
  }, [address]);

  useEffect(() => { void refresh(); }, [refresh]);
  return { balance, loading, error, refresh };
}
