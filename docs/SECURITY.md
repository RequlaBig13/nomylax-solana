# Security model

## Trust boundary

Nomylax assumes the agent may be wrong or compromised. Policy supplied by the agent is never authoritative.

## Wallet ownership

A connected address alone is not authentication. Nomylax issues a short-lived, address-bound challenge and verifies an Ed25519 signature before creating a signed httpOnly session.

## Settlement

The server has no executor private key. For the MVP, the owner wallet signs every live Solana settlement. A policy approval is not treated as a successful payment.

## Solana address handling

Base58 Solana addresses are case-sensitive. Nomylax does not lowercase addresses, recipient allowlists or owner identifiers.

## Agent endpoints

Remote agent endpoints are server-configured and pass SSRF checks. Caller-supplied arbitrary callback URLs are not trusted.

## AI boundary

Anthropic Control Copilot is explanatory only. Its output is not consumed by the policy engine and cannot sign a transaction.

## Secrets

Never commit `.env.local`, wallet seed phrases, private keys, RPC credentials or Anthropic keys. Any key that appeared in an earlier archive should be rotated before public release.

## Known production gaps

- replay tracking should use durable shared storage
- rate limiting should use shared infrastructure
- local-first workspace state should move to Postgres
- Guard program requires deployment testing and independent review before high-value use
- no independent audit is claimed
