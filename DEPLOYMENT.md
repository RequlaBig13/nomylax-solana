# Deployment guide

## Web application

Nomylax is designed for a standard Next.js deployment such as Vercel.

### Required production environment

```text
NEXT_PUBLIC_APP_URL=https://YOUR_DOMAIN
NEXT_PUBLIC_SOLANA_NETWORK=devnet
NEXT_PUBLIC_SOLANA_RPC_URL=YOUR_DEVNET_RPC
SESSION_SECRET=YOUR_RANDOM_64_HEX_SECRET
```

### Optional product services

```text
ANTHROPIC_API_KEY=YOUR_SERVER_SIDE_KEY
ANTHROPIC_MODEL=YOUR_CHOSEN_MODEL
AGENT_API_KEY=OPTIONAL_SHARED_AGENT_KEY
AGENT_ENDPOINT_ALLOWLIST=*  # or comma-separated hosts to restrict connectors
DATABASE_URL=YOUR_NEON_OR_POSTGRES_CONNECTION_STRING
NEXT_PUBLIC_NOMYLAX_GUARD_PROGRAM_ID=ONLY_AFTER_REAL_DEPLOYMENT
```

Never expose `ANTHROPIC_API_KEY`, `SESSION_SECRET`, connector credentials, or `DATABASE_URL` with a `NEXT_PUBLIC_` prefix.

When `DATABASE_URL` is configured, Nomylax automatically creates its compact Postgres state table on first use. No manual migration is required for this MVP.

## Release gate

Run from a clean checkout:

```bash
npm install
npm run check
```

Then manually test:

- wallet discovery and connection
- ownership signature
- onboarding
- Shadow Lab
- Intent Lab approval
- wallet rejection
- successful Devnet settlement
- Explorer link
- deliberate policy block
- Safe Mode
- mobile navigation

## Solana RPC

The public Devnet RPC is useful for local testing. For the judge-facing deployment, use a dedicated Solana RPC endpoint so shared-endpoint throttling does not interrupt the demo.

## Nomylax Guard

The Guard workspace is not required for the wallet-signed MVP. If you choose to deploy it, install the current Solana and Anchor toolchains first, then run:

```bash
solana config set --url devnet
anchor build
anchor keys sync
anchor build
anchor deploy
anchor keys list
```

After deployment, update `declare_id!`, `Anchor.toml`, and `NEXT_PUBLIC_NOMYLAX_GUARD_PROGRAM_ID` with the real program address as appropriate, rerun the checks, and record the real public deployment evidence in `SUBMISSION_EVIDENCE.md`.
