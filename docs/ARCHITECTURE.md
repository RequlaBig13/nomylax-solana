# Architecture

Nomylax separates reasoning, authorization and settlement.

```text
Agent adapter
   |
   v
Intent
   |
   v
Deterministic policy ---- Financial Constitution
   |
   +---- Risk Engine
   |
   +---- Shadow / Safe Mode state
   |
   v
Verdict
   |
   +---- blocked / review -> record only
   |
   +---- execute -> Wallet Standard signer -> Solana -> signature -> account spend
```

## Product layers

### Agent layer

Demo and HTTP adapters produce the same `IntentRequest` shape. Agent output is treated as untrusted input.

### Authorization layer

`policy-engine.ts` runs fixed checks. `risk-engine.ts` calculates NRS. A model is never called for authorization.

### Settlement layer

The Solana edition removes the original hot executor. The user's connected wallet signs Devnet transfers. This makes the wallet prompt part of the authorization ceremony for the MVP.

### State layer

The downloadable contest application is local-first for product state, while server APIs retain a repository boundary for durable deployment. Production hardening requires Postgres and shared replay/rate-limit storage.

### On-chain layer

The Anchor Guard workspace moves hard SOL ceilings into a policy PDA and program-owned vault. It is intentionally separated from current evidence until deployed.
