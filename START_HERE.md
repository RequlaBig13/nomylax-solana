# Start here

## 1. Keep the original project untouched

This repository is the contest-ready Nomylax Solana edition. Keep it in its own folder so your existing Nomylax backup remains untouched.

## 2. Configure the app

```bash
cp .env.example .env.local
openssl rand -hex 32
```

Paste the generated value into `SESSION_SECRET`.

If you want Control Copilot, add a fresh Anthropic API key to `ANTHROPIC_API_KEY`.

## 3. Install and launch

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## 4. Prepare the wallet

- use a Wallet Standard-compatible Solana wallet
- switch the wallet to Devnet
- fund it with Devnet SOL
- keep a second Devnet address available for the live payment demo

## 5. Test the full product path

```text
Connect -> Sign in -> Workspace -> Agent -> Constitution -> Shadow -> Activate
-> Intent Lab -> Wallet signature -> Explorer proof -> Deliberate block
```

## 6. Run release checks

```bash
npm run check
```

## 7. Optional Anchor Guard

Install the Solana and Anchor toolchains, then:

```bash
anchor build
anchor keys sync
anchor test
```

Do not publish a Guard program ID until a real Devnet deployment exists.
