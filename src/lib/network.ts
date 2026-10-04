export type SolanaNetworkName = 'devnet' | 'testnet' | 'mainnet';

export interface ClientNetwork {
  name: SolanaNetworkName;
  label: string;
  chain: 'solana:devnet' | 'solana:testnet' | 'solana:mainnet';
  isTestnet: boolean;
  rpcUrl: string;
  explorerCluster: string;
  explorer: string;
}

const TABLE: Record<SolanaNetworkName, Omit<ClientNetwork, 'rpcUrl'>> = {
  devnet: {
    name: 'devnet',
    label: 'Solana Devnet',
    chain: 'solana:devnet',
    isTestnet: true,
    explorerCluster: '?cluster=devnet',
    explorer: 'https://explorer.solana.com',
  },
  testnet: {
    name: 'testnet',
    label: 'Solana Testnet',
    chain: 'solana:testnet',
    isTestnet: true,
    explorerCluster: '?cluster=testnet',
    explorer: 'https://explorer.solana.com',
  },
  mainnet: {
    name: 'mainnet',
    label: 'Solana Mainnet',
    chain: 'solana:mainnet',
    isTestnet: false,
    explorerCluster: '',
    explorer: 'https://explorer.solana.com',
  },
};

export function solanaNetwork(): ClientNetwork {
  const raw = (process.env.NEXT_PUBLIC_SOLANA_NETWORK ?? 'devnet') as SolanaNetworkName;
  const base = TABLE[raw] ?? TABLE.devnet;
  const fallbackRpc = raw === 'mainnet'
    ? 'https://api.mainnet-beta.solana.com'
    : raw === 'testnet'
      ? 'https://api.testnet.solana.com'
      : 'https://api.devnet.solana.com';
  return {
    ...base,
    rpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? fallbackRpc,
  };
}

/** Backwards-compatible name used by the existing shell. */
export const clientNetwork = solanaNetwork;

export const txUrl = (signature: string) => {
  const n = solanaNetwork();
  return `${n.explorer}/tx/${signature}${n.explorerCluster}`;
};

export const addressUrl = (address: string) => {
  const n = solanaNetwork();
  return `${n.explorer}/address/${address}${n.explorerCluster}`;
};
