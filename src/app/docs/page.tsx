import Link from 'next/link';
import { BrandLockup } from '@/components/ui/Mark';
import { clientNetwork } from '@/lib/network';

export const metadata = {
  title: 'Documentation - Nomylax',
  description: 'How Nomylax turns an autonomous agent intent into a deterministic, wallet-signed Solana action.',
};

const SECTIONS = [
  {
    id: 'model', title: 'The model',
    body: 'Nomylax sits between an autonomous agent and a human-controlled Solana wallet. The agent proposes an economic intent. The Financial Constitution and risk engine decide whether that intent is allowed. If it passes, the connected wallet still signs the final Devnet transaction. Nomylax does not hide a hot executor key behind the interface.',
  },
  {
    id: 'constitution', title: 'Financial Constitution',
    body: 'Each agent receives explicit boundaries: maximum action, daily and monthly budget, allowed asset, approved recipients, unknown-recipient behaviour, emergency reserve, risk ceiling, failure threshold, velocity ceiling and permission expiry. The point is not to make an AI promise to behave. The point is to make the boundary deterministic and inspectable.',
  },
  {
    id: 'enforcement', title: 'Decision path',
    list: ['Allowed asset', 'Transaction ceiling', 'Daily budget', 'Monthly budget', 'Recipient policy', 'Reserve floor', 'Agent state', 'Failure threshold', 'Velocity', 'Risk ceiling'],
    body: 'Checks run in a fixed order. Hard policy failures block. Soft recipient uncertainty can be held for review. Anthropic is not in this authorization path. Control Copilot may explain a decision after the fact, but it cannot approve, sign or settle one.',
  },
  {
    id: 'solana', title: 'Solana settlement',
    list: ['Policy verdict', 'Wallet Standard signer', 'SOL transfer', 'Nomylax memo', 'Network signature', 'Explorer proof'],
    body: 'A live execute verdict is only an authorization to attempt settlement. Spend counters are updated only after the Wallet Standard signer returns a real Solana transaction signature. The transaction includes a Nomylax memo that links the settlement to its decision and risk score, creating a simple on-chain reconciliation trail for the MVP.',
  },
  {
    id: 'shadow', title: 'Shadow Lab',
    body: 'Before an agent gets live authority, Shadow Lab runs the same adapter against the same policy with simulated settlement. Budgets deplete on an isolated copy, so the owner can see what the agent would have requested, what Nomylax would have protected, and when Safe Mode would have tripped, without moving value.',
  },
  {
    id: 'safe', title: 'Safe Mode',
    body: 'An agent can move from autonomous to watch or safe as failures and risk accumulate. It cannot promote itself back to autonomous. Recovery is an owner action. This keeps the emergency path outside the agent’s control.',
  },
  {
    id: 'auth', title: 'Wallet ownership',
    body: 'Nomylax uses a nonce-bound Solana message challenge and verifies the wallet’s Ed25519 signature before issuing an httpOnly session. Connecting a wallet is not treated as ownership proof. Signing the login message moves no funds and grants no transfer permission.',
  },
  {
    id: 'copilot', title: 'Control Copilot',
    body: 'The optional Anthropic-backed copilot explains policies, blocks, risk factors and product controls in plain language. It is deliberately advisory. Deterministic code, not a language model, produces financial verdicts.',
  },
];

export default function Docs() {
  const net = clientNetwork();
  return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: '32px 24px 96px' }}>
      <header className="public-doc-header"><Link href="/"><BrandLockup size={30} /></Link><span className={`badge ${net.isTestnet ? 'warn' : 'gold'}`}><i />{net.label}</span></header>
      <h1 className="display" style={{ fontSize: 40, marginTop: 44 }}>How Nomylax works</h1>
      <p className="public-doc-lead">A transparent control plane for autonomous economic intent, built around deterministic policy and wallet-signed Solana settlement.</p>
      <nav className="public-doc-nav">{SECTIONS.map((s) => <a key={s.id} href={`#${s.id}`}>{s.title}</a>)}</nav>
      {SECTIONS.map((s, index) => (
        <section id={s.id} key={s.id} className="public-doc-section">
          <div className="public-doc-number">{String(index + 1).padStart(2, '0')}</div>
          <div><h2>{s.title}</h2><p>{s.body}</p>{s.list ? <div className="public-doc-flow">{s.list.map((item) => <span key={item}>{item}</span>)}</div> : null}</div>
        </section>
      ))}
      <section className="public-doc-section"><div className="public-doc-number">09</div><div><h2>What the MVP proves</h2><p>The contest build is deliberately honest about its boundary. It proves Wallet Standard connectivity, Solana ownership signing, deterministic policy, Shadow Mode, Safe Mode, wallet-signed Devnet SOL settlement, on-chain memo evidence and Explorer-verifiable signatures. The longer-term Nomylax Guard program and durable Postgres deployment are separated in the repository roadmap rather than presented as finished evidence before they are deployed.</p></div></section>
      <footer className="public-doc-footer"><Link href="/">Home</Link><Link href="/trust">Trust</Link><Link href="/app">Launch app</Link></footer>
    </main>
  );
}
