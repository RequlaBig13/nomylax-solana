# Solana integration

## Web client

Nomylax composes a current Solana Kit client with Wallet Standard signing and RPC access. The connected wallet supplies both payer and identity for live Devnet settlement. The application never asks for a seed phrase and does not embed a transfer private key.

## Authentication

`POST /api/auth/nonce` returns a nonce-bound message containing the wallet address, application domain, Solana chain and issue time. The browser asks the connected wallet to sign that exact message. `POST /api/auth/verify` verifies the Ed25519 signature and returns an httpOnly session.

## Live MVP settlement

The Intent Lab constructs a native SOL transfer only after deterministic policy returns `execute`. A memo instruction links the transaction to the Nomylax decision and risk score. The transaction is signed by the connected Wallet Standard wallet and sent to the configured Solana cluster.

Nomylax records spend only after a network signature is returned.

## Devnet configuration

```bash
NEXT_PUBLIC_SOLANA_NETWORK=devnet
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
```

For a public demo, use a dedicated RPC endpoint if shared Devnet is rate limited.

## Guard program

`programs/nomylax-guard` contains the hard-enforcement Anchor workspace. Its development ID is a placeholder until `anchor keys sync` and a real deployment are completed. The program implements an owner-created policy PDA, vault funding, agent authority, pause controls and SOL spend ceilings.

A live program ID, policy PDA and transaction signature belong in `SUBMISSION_EVIDENCE.md` only after deployment.

## Next rail

After the SOL-first contest MVP is stable, the intended next rail is SPL / USDC delegated authority so agents can operate with stable-value limits while owners retain revocation control.


## Guard controls

The included Anchor Guard workspace models hard per-transaction, daily and rolling limits, owner pause state, permission expiry, an optional recipient allowlist, and a 32-byte policy hash that can bind a deployed policy account to the Financial Constitution used by the application. The Guard is not presented as deployed evidence until it has a real Devnet program ID.
