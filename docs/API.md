# API

## Authentication

### `POST /api/auth/nonce`

Input:

```json
{ "address": "SOLANA_BASE58_ADDRESS" }
```

Returns a nonce and exact message to sign.

### `POST /api/auth/verify`

Input:

```json
{
  "address": "SOLANA_BASE58_ADDRESS",
  "nonce": "...",
  "message": "...",
  "signature": "BASE58_ED25519_SIGNATURE"
}
```

Verifies ownership and issues the httpOnly session cookie.

### `POST /api/auth/logout`

Clears the session cookie.

## Decisions

### `POST /api/decisions`

Authenticated policy evaluation. The server loads the agent, active constitution and treasury from its repository boundary. It returns a verdict and, for a live `execute` result, indicates that a Wallet Standard signature is required. It does not hold or use a hot executor key.

Example intent:

```json
{
  "agentId": "agt_example",
  "mode": "shadow",
  "intent": {
    "type": "payment",
    "token": "SOL",
    "amount": "0.01",
    "recipient": "DvdQcgy9HQgtvZBRfi8sQWYCFb6BQuQ6orNsm6yqbfGW",
    "purpose": "Dataset access"
  }
}
```

## Shadow

`POST /api/shadow` evaluates behavior without settlement.

## Agents and Universal Agent Gateway

`POST /api/agents` registers an agent and, for external agents, stores its connector configuration. User-supplied Bearer/API-key credentials are encrypted server-side and are never returned by the API.

`POST /api/agents/preview-intents` securely tests an endpoint during onboarding before the agent is persisted.

`POST /api/agents/intents` fetches intents for a persisted external agent. The route loads the endpoint and connector configuration from authoritative storage, resolves authentication server-side, applies the SSRF guard, fetches JSON, and normalizes the response into the canonical Nomylax intent shape.

Connector response modes:

- `native` - expects a Nomylax intent array
- `auto` - discovers common `intents`, `actions`, `payments`, `transactions`, `requests`, `results` or nested payload arrays and common field aliases
- `mapping` - uses explicit dotted paths for amount, token, recipient, purpose, verification and risk

A connector may use GET or POST and may be unauthenticated, use an approved environment-secret reference, or store an encrypted per-agent credential. Remote endpoints remain subject to HTTPS/SSRF restrictions.
