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

## Agents

`POST /api/agents/intents` fetches economic intents from a registered adapter. Remote endpoints remain subject to SSRF restrictions.
