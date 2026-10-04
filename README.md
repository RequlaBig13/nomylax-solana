# Nomylax

### The financial firewall for autonomous agents on Solana

**Nomylax gives AI agents bounded economic authority without handing them unrestricted control of a treasury.** An agent proposes an intent. Nomylax checks the Financial Constitution, scores the risk, and either blocks, holds, or authorises the action. A live action still requires the connected Solana wallet to sign before value moves.

> Built by **Alexander Müller**, Germany, as part of the Superteam Germany builder journey toward the Colosseum Hackathon.

This repository is the Solana rebuild of Nomylax. It is designed as a working MVP for the Road to Colosseum challenge, with Devnet as the minimum settlement environment.

---

## Why this exists

Agent frameworks make software capable of deciding what to do. That creates a second problem: **how much financial authority should the software receive?**

A normal wallet gives a key whatever authority the wallet itself has. For an autonomous agent, that makes the blast radius of a bad loop, prompt injection, compromised endpoint, or hallucinated recipient much larger than the mistake itself.

Nomylax introduces a control boundary between **intent** and **money**.

```text
Agent intent
    |
    v
+-------------------------+
| Nomylax                 |
| Financial Constitution  |
| Deterministic checks    |
| Risk engine             |
| Safe Mode               |
+-------------------------+
    |
    | approved
    v
Wallet Standard signer
    |
    v
Solana Devnet
    |
    v
Signature + Explorer proof
```

The AI can propose. It cannot argue with a hard ceiling.

---

## What the contest MVP proves

The current application is designed to demonstrate these flows end to end:

- Solana Wallet Standard discovery and connection
- wallet ownership proof with a nonce-bound Ed25519 signing challenge
- per-agent Financial Constitutions
- deterministic policy evaluation
- Nomylax Risk Score and explainable factors
- Shadow Lab with simulated budget depletion
- automatic Watch / Safe Mode transitions
- live SOL settlement on Devnet through the connected wallet
- a Nomylax memo attached to live settlement for reconciliation
- a real transaction signature shown in the UI
- direct Solana Explorer evidence
- an optional Anthropic Control Copilot that explains decisions but cannot authorise them

No server hot wallet is required for the settlement path.

---

## The Financial Constitution

Each agent receives an explicit financial boundary:

| Control | Purpose |
| --- | --- |
| Maximum transaction | Caps the size of one mistake |
| Daily limit | Caps one day of activity |
| Monthly limit | Caps longer-term spend |
| Allowed assets | Prevents undeclared assets |
| Approved recipients | Defines trusted destinations |
| Unknown recipient rule | Block, review, or allow |
| Emergency reserve | Preserves owner-defined capital |
| Failure threshold | Trips Safe Mode after repeated failures |
| Velocity threshold | Detects abnormal spend pace |
| Risk threshold | Refuses excessive NRS |
| Permission expiry | Gives authority an end date |

Financial verdicts are deterministic. Anthropic is not asked whether a transaction should be approved.

---

## Shadow Lab

Before activating live authority, an owner can let the agent run against its real constitution without moving funds.

Shadow Lab reports:

- total value requested
- value that would pass
- value Nomylax would protect
- policy violations
- critical risk events
- projected burn
- the point where Safe Mode would trigger
- a trace of individual decisions

This is intended to answer a practical question before activation:

> **What would this agent have done with my money if I had trusted it today?**

---

## Solana settlement

A policy verdict and a settlement are deliberately separate events.

```text
EVALUATE -> AUTHORISE -> WALLET SIGN -> SUBMIT -> SIGNATURE -> ACCOUNT SPEND
```

An `execute` verdict does **not** reduce Nomylax's spend counters by itself. Counters update only after the Wallet Standard transaction returns a real Solana signature.

The Devnet MVP currently settles native SOL. A live transaction includes a memo in this form:

```text
NOMYLAX|<decision-id>|risk:<score>|agent:<agent-id>
```

The UI then exposes the network signature and a Solana Explorer link.

### Why no executor private key?

Nomylax keeps settlement authority with the connected owner wallet. The server can evaluate policy and produce an explainable verdict, but it does not hold a treasury private key. A live MVP payment is counted as settled only after the wallet signs and Solana returns a transaction signature.

---

## Nomylax Guard program

`programs/nomylax-guard` contains an Anchor program workspace for the next hard-enforcement layer.

The included v0.1 program supports:

- owner-created agent policy PDAs
- per-transaction SOL limits
- daily SOL limits
- rolling 30-day limits
- owner-controlled recipient allowlist enforcement
- permission expiry
- owner pause / resume
- a Financial Constitution policy hash
- a funded program-owned policy vault
- agent-signed `execute_payment`
- payment events with policy and reconciliation hashes

**Important:** the program ID in the repository is a development placeholder. Do not use it as submission evidence. Run `anchor keys sync`, deploy to Devnet, record the real program ID, and update `NEXT_PUBLIC_NOMYLAX_GUARD_PROGRAM_ID` before claiming an on-chain Guard deployment.

The web MVP works without pretending this program is already deployed.

---

## Anthropic Control Copilot

Control Copilot remains part of Nomylax.

Set an Anthropic key server-side:

```bash
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=...
```

Copilot can explain:

- why an action was blocked
- which policy should be reviewed
- what a risk factor means
- how Shadow Mode differs from live mode
- how Safe Mode works

Copilot cannot mutate a constitution, change a verdict, sign a transaction, or move funds.

---

## Quick start

### Requirements

- Node.js 20.18+
- npm 10+
- a Wallet Standard-compatible Solana wallet such as Phantom, Solflare, or Backpack
- Devnet SOL for live settlement testing
- optional Anthropic API key for Control Copilot

### Install

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

### Required local secret

Generate a strong session secret:

```bash
openssl rand -hex 32
```

Put the result in `.env.local`:

```bash
SESSION_SECRET=<generated-value>
```

Do not commit `.env.local`.

### Environment

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SOLANA_NETWORK=devnet
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_NOMYLAX_GUARD_PROGRAM_ID=

SESSION_SECRET=
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=

AGENT_API_KEY=
# Use * to allow any public HTTPS host through the SSRF guard, or comma-separated hosts to restrict it.
AGENT_ENDPOINT_ALLOWLIST=*
DATABASE_URL=
```

Use a dedicated RPC provider for a public demo if the shared Devnet endpoint becomes rate limited.

### Universal Agent Gateway

Nomylax is agent-agnostic. A connected agent can use the native Nomylax intent contract or any public HTTPS JSON API that can be normalized into an economic intent.

Supported connector options:

- `GET` or `POST`
- no authentication
- Bearer token from an approved server environment reference
- API-key/custom header from an approved server environment reference
- encrypted per-agent Bearer/API-key credential
- native `{ intents: [...] }` responses
- automatic JSON normalization for common action/payment/transaction shapes
- explicit dotted-path field mapping for unusual APIs

All outbound URLs still pass the SSRF guard. Private/reserved addresses, localhost, metadata services, embedded URL credentials and non-HTTPS production endpoints are refused. Normalization only interprets the upstream payload; the final `ALLOW / REVIEW / BLOCK` decision remains deterministic and is produced by the Financial Constitution and risk engine.

See [Universal Agent Gateway](./docs/UNIVERSAL_AGENT_GATEWAY.md).

---

## Demo path

For a clean 2 to 3 minute walkthrough:

1. Open Nomylax and connect a Solana wallet.
2. Sign the ownership challenge.
3. Create a workspace and declare a Devnet SOL envelope.
4. Create a Research Scout.
5. Choose or edit its Financial Constitution.
6. Add a Devnet recipient you control to the approved list.
7. Run Shadow Mode and show at least one block.
8. Activate the agent.
9. Open **Intent Lab** and evaluate a compliant payment.
10. Sign the transaction in the wallet.
11. Show the returned signature and open it in Solana Explorer.
12. Submit a deliberate violation above the max transaction.
13. Show the exact failed check and protected value.
14. Open the Audit / Transactions views and the Trust page.

The demo should show real behavior, not slides describing behavior.

---

## Development checks

```bash
npm run check
```

The repository intentionally does not include `node_modules`, `.next`, `.env.local`, private keys, or generated production evidence.

---

## Anchor Guard development

The Guard program requires the Solana and Anchor toolchains separately from the Next.js application.

```bash
solana --version
anchor --version
anchor build
anchor keys sync
anchor test
```

For Devnet deployment:

```bash
solana config set --url devnet
anchor deploy
```

After deployment, record:

- program ID
- deployment transaction
- policy PDA used in the demo
- live payment transaction(s)

Then add only the public addresses to the submission evidence file.

---

## Repository map

```text
src/app                 Next.js routes and product screens
src/components          shell, wallet, onboarding, charts, settlement UI
src/hooks/useWallet.ts  Wallet Standard + signed ownership flow
src/lib                 policy, risk, Shadow Mode, adapters, domain logic
src/server              auth, repository boundary, API security
programs/nomylax-guard  Anchor hard-limit program
public                   static assets
scripts                  release and evidence helpers
docs                     architecture, security and Solana notes
```

---

## Architecture principle

Nomylax deliberately separates three different things:

1. **Reasoning** - an autonomous agent decides what it wants to do.
2. **Authorization** - deterministic policy decides whether that intent fits the Financial Constitution.
3. **Settlement** - a Solana signer performs the approved action.

That separation is the product.

---

## Current limitations

This repository does not hide unfinished work behind marketing language.

- Live MVP settlement is SOL-first on Devnet.
- Only a Guard Program ID that has actually been deployed and verified on Devnet should be presented as live evidence.
- Browser state remains available for fast UX, while authenticated workspaces, agents, constitutions, decisions and audit events are persisted through the Postgres repository when `DATABASE_URL` is configured.
- Shared, multi-instance rate limiting is not yet wired.
- No independent security audit is claimed.
- Mainnet deployment is intentionally not required for the contest MVP.

See [HACKATHON_READINESS.md](./HACKATHON_READINESS.md) for the release checklist and [COLOSSEUM_SUBMISSION.md](./COLOSSEUM_SUBMISSION.md) for the prepared submission narrative.

---

## Public documentation

- `/docs` - product and architecture explanation
- `/trust` - security boundary and honest limitations
- [Solana integration](./docs/SOLANA_INTEGRATION.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Security](./docs/SECURITY.md)
- [API](./docs/API.md)
- [Submission evidence](./SUBMISSION_EVIDENCE.md)
- [Colosseum submission draft](./COLOSSEUM_SUBMISSION.md)
- [Deployment guide](./DEPLOYMENT.md)

---

## Builder

**Alexander Müller**  
Germany  
Superteam Germany builder ecosystem  
Road to Colosseum / Colosseum build

Nomylax is being developed as a serious product beyond a one-off hackathon demo: a policy and risk layer for software that can increasingly spend, subscribe, trade, and pay other machines.
