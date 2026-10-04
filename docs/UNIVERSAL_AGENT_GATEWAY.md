# Universal Agent Gateway

Nomylax is a control plane, not an agent framework. The Universal Agent Gateway lets independently built agents and ordinary JSON APIs propose economic actions without giving those systems authority to bypass Nomylax policy.

## Flow

```text
External agent / API
        ↓
HTTPS connector
        ↓
Authentication resolved server-side
        ↓
JSON response
        ↓
Universal normalization
        ↓
Canonical Nomylax intent
        ↓
Financial Constitution
        ↓
Risk engine
        ↓
ALLOW / REVIEW / BLOCK
        ↓
Wallet + Solana Guard
```

## Connector modes

### Native

For agents that already return:

```json
{
  "intents": [{
    "amount": 0.02,
    "token": "SOL",
    "recipient": "<Solana address>",
    "purpose": "Dataset access",
    "recipientVerified": true,
    "contractRisk": 12
  }]
}
```

### Auto JSON normalization

Auto mode recognizes common collection names such as `actions`, `payments`, `transactions`, `requests`, `results` and `items`, including nested `data` or `payload` objects. Common field aliases such as `value`, `currency`, `destination` and `description` are converted into the canonical intent.

The reference agent exposes `/api/generic-intents` specifically to prove this path with a deliberately non-Nomylax response shape.

### Custom mapping

For unusual APIs, the owner can specify dotted paths such as:

```text
Intent collection: payload.actions
Amount: payment.value
Token: payment.currency
Recipient: payment.destination
Purpose: description
Verified: trust.recipientVerified
Risk: risk.score
```

## Authentication

Supported authentication modes:

- none
- Bearer from a server environment reference
- custom/API-key header from a server environment reference
- encrypted per-agent Bearer credential
- encrypted per-agent custom/API-key header

Environment references are restricted to names beginning with `AGENT_` or `NOMYLAX_AGENT_` so a connector cannot be pointed at arbitrary application secrets.

Direct credentials are encrypted with AES-256-GCM using key material derived from `SESSION_SECRET`. They are never returned in API responses or copied to browser workspace state.

## Endpoint security

Production connectors require HTTPS. Nomylax refuses localhost, private/reserved IP space, cloud metadata targets, internal namespaces, URL-embedded credentials and redirects. `AGENT_ENDPOINT_ALLOWLIST` may restrict connections to specific hosts. Set it to `*` for an open public-HTTPS gateway while retaining the SSRF controls.

## Security boundary

Normalization is not authorization. A connector may describe what an agent wants to do, but it cannot raise limits, approve itself, disable Safe Mode or bypass policy. The deterministic Financial Constitution and risk engine remain the authorization boundary.
