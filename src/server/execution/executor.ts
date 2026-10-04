import { activeNetwork } from './chain';

/**
 * Server-side execution is intentionally disabled in the Solana edition.
 * The policy API can authorise an intent, but value only moves through a
 * Wallet-Standard signer in the browser. This removes the original custodial
 * hot-key executor from the trust boundary.
 */
export type ExecutionStage = 'wallet-required' | 'failed';
export interface ExecutionRequest { token: string; amount: bigint; recipient: string }
export interface ExecutionResult {
  stage: ExecutionStage;
  ok: false;
  network: string;
  error: string;
}

export async function execute(_req: ExecutionRequest): Promise<ExecutionResult> {
  return {
    stage: 'wallet-required',
    ok: false,
    network: activeNetwork().label,
    error: 'Policy approved. Settlement requires the connected Solana wallet to sign the transaction.',
  };
}
