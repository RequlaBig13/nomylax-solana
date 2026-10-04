# Threat model

## Threats Nomylax is designed to reduce

- agent requests a payment above its authority
- prompt injection causes an unexpected recipient or amount
- repeated small requests attempt to bypass a single-transaction cap
- compromised agent endpoint produces high-risk activity
- wallet address is impersonated without a signature
- UI claims a payment succeeded when the wallet rejected it
- AI explanation is confused with authorization

## Controls

- deterministic Financial Constitution
- daily, monthly and single-action ceilings
- recipient policy
- reserve floor
- risk score and severity escalation
- Watch / Safe Mode
- Shadow Lab before activation
- Ed25519 ownership proof
- wallet-signed settlement
- spend accounting only after a signature
- audit-oriented decision records

## Out of scope for the current MVP

- protecting a compromised user's wallet extension
- preventing a user from manually sending funds outside Nomylax
- enterprise multi-party approval
- audited SPL delegation
- guaranteeing availability of public Solana RPC infrastructure
