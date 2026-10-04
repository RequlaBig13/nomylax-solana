# Nomylax: Colosseum submission draft

## Project name

**Nomylax**

## Tagline

**The financial firewall for autonomous agents on Solana.**

## Builder

**Alexander Müller**  
Germany  
Superteam Germany builder ecosystem  
Road to Colosseum

## Problem and product

AI agents are becoming capable of buying data, paying for APIs, moving capital and acting without a human approving every step. Giving that software a normal wallet creates an uncomfortable choice: either keep a person in every loop, or give the agent more financial authority than the task requires.

Nomylax inserts a programmable control boundary between an agent's intent and a wallet's money. Every request is evaluated against a Financial Constitution containing hard spend limits, recipient rules, permission expiry, reserve requirements, velocity controls and risk thresholds. The result is explainable: Nomylax shows exactly which rule passed or failed instead of asking an AI model to make the financial decision.

Owners can first run an agent in Shadow Lab to see what it would have attempted without moving funds. When live mode is enabled, an approved action still requires real Solana settlement. Safe Mode can stop further activity when repeated failures or elevated risk cross the owner's boundary.

Nomylax is agent-agnostic. Its Universal Agent Gateway can connect public HTTPS agent/API endpoints using GET or POST, resolve authentication server-side, and normalize native or third-party JSON response shapes into one canonical financial intent before the same deterministic policy engine runs. A separate reference agent exposes both a native endpoint and a deliberately different nested JSON endpoint so judges can verify that the control plane is not hardcoded to one agent format.

## Solana integration

Nomylax uses Solana as the settlement and verification layer of the MVP.

- Wallets are discovered through Wallet Standard using the current Solana Kit frontend stack.
- Wallet ownership is proven with a nonce-bound Ed25519 signing challenge.
- Live approved intents are settled as real Solana Devnet transactions from the connected wallet.
- Nomylax attaches a memo containing the decision identifier, agent identifier and risk score for reconciliation.
- Spend is recorded only after Solana returns a transaction signature.
- The UI exposes the signature and a direct Solana Explorer link.
- `programs/nomylax-guard` contains the next enforcement layer: an Anchor policy vault with hard per-transaction, daily and rolling limits. It should only be described as deployed after a real Devnet deployment is completed and recorded.

Solana is not used as a decorative wallet connection. It is where an approved autonomous action becomes a verifiable financial action.

## Deployment details

**MVP network:** Solana Devnet

**Live app:** `ADD_AFTER_DEPLOYMENT`

**Public repository:** `ADD_AFTER_REPOSITORY_CREATION`

**Verified transaction examples:** add these only after running the live demo and confirming each signature in Explorer.

**Nomylax Guard program ID:** do not add a program ID until the Anchor program has actually been deployed to Devnet.

## What to show in the 2 to 3 minute demo

1. Open the landing page and explain the problem in one sentence.
2. Connect the Solana wallet and sign the ownership challenge.
3. Connect the external Research Scout and show the Universal Agent Gateway configuration.
4. Run Shadow Lab against the native endpoint, then switch to the generic nested JSON endpoint to show automatic normalization.
5. Show the agent's Financial Constitution and point out an action that Nomylax blocks.
6. Switch to live mode and submit a compliant intent.
7. Sign the Solana transaction in the wallet.
8. Open the returned signature in Solana Explorer.
9. Submit a deliberate request above the max-transaction boundary.
10. Show the failed deterministic check and the value Nomylax protected.
11. Show Transactions / Audit and finish with the product direction: bounded economic authority for autonomous software.

## One-sentence closing

**Nomylax lets software act with money without forcing its owner to trust the software with everything.**
