'use client';

import { useState } from 'react';
import { address, sol, solToLamports } from '@solana/kit';
import { getTransferSolInstruction } from '@solana-program/system';
import { getAddMemoInstruction } from '@solana-program/memo';
import { useClient } from '@solana/react';
import { useConnectedWallet } from '@solana/kit-plugin-wallet/react';
import type { AppSolanaClient } from '@/app/providers';
import type { Decision } from '@/lib/types';
import { txUrl } from '@/lib/network';
import { isSolanaAddress } from '@/lib/base58';

export function SolanaSettlement({ decision, onSettled }: { decision: Decision; onSettled: (signature: string) => void }) {
  const client = useClient<AppSolanaClient>();
  const connected = useConnectedWallet(client);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState(decision.txHash ?? '');

  if (decision.simulated || decision.verdict !== 'execute') return null;

  const recipientOk = isSolanaAddress(decision.request.recipient);
  const canSettle = Boolean(connected && recipientOk && decision.request.amount > 0 && !signature);

  const settle = async () => {
    if (!canSettle) return;
    setBusy(true);
    setError(null);
    try {
      const transfer = getTransferSolInstruction({
        source: client.payer,
        destination: address(decision.request.recipient),
        amount: solToLamports(sol(String(decision.request.amount))),
      });
      const memo = getAddMemoInstruction({ memo: `NOMYLAX|${decision.id}|risk:${decision.risk.score}|agent:${decision.agentId}` });
      const result = await client.sendTransaction([transfer, memo]);
      const sig = String(result.context.signature);
      setSignature(sig);
      onSettled(sig);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(/reject/i.test(message) ? 'Transaction rejected in wallet. Nothing was settled.' : message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settlement-panel">
      <div className="settlement-kicker">Wallet-signed settlement</div>
      <div className="settlement-title">Policy passed. Solana still requires your signature.</div>
      <p>Nomylax never marks this intent as spent until the connected wallet signs and the network returns a transaction signature.</p>
      {!connected ? <div className="settlement-note bad">Connect a Solana wallet to settle this approved intent.</div> : null}
      {!recipientOk ? <div className="settlement-note bad">Enter a valid Solana recipient address before settling.</div> : null}
      {error ? <div className="settlement-note bad">{error}</div> : null}
      {signature ? (
        <div className="settlement-proof">
          <div><span>Verified signature</span><strong className="num">{signature}</strong></div>
          <a href={txUrl(signature)} target="_blank" rel="noreferrer">Open in Solana Explorer ↗</a>
        </div>
      ) : (
        <button className="btn btn-primary" type="button" disabled={!canSettle || busy} onClick={settle}>
          {busy ? 'Waiting for Solana…' : `Sign & settle ${decision.request.amount} SOL`}
        </button>
      )}
    </div>
  );
}
