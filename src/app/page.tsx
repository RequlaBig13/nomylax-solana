import Link from 'next/link';
import { HelmetMark } from '@/components/ui/Mark';
import { WalletButton } from '@/components/wallet/WalletButton';

const gates = [
  ['01', 'Constitution', 'Owner-written spending boundaries. No model can raise them.'],
  ['02', 'Risk engine', 'Every intent is scored against deterministic and behavioural signals.'],
  ['03', 'Shadow Lab', 'Watch an agent operate against real policy before giving it authority.'],
  ['04', 'Settlement proof', 'Approved activity can settle on Solana Devnet with a real signature.'],
];

export default function Home() {
  return (
    <main className="landing-shell">
      <div className="landing-noise" aria-hidden />
      <header className="landing-nav">
        <Link href="/" className="landing-brand"><HelmetMark size={28} /><span className="caps">Nomylax</span></Link>
        <nav className="landing-links">
          <Link href="/docs">Protocol</Link>
          <Link href="/trust">Trust</Link>
          <a href="https://arena.colosseum.org/?ref=germany" target="_blank" rel="noreferrer">Colosseum</a>
        </nav>
        <WalletButton compact />
      </header>

      <section className="landing-hero">
        <div className="hero-copy">
          <div className="landing-kicker"><i /> Built on Solana · Road to Colosseum</div>
          <h1 className="display">Give agents authority.<br/><em>Keep the boundary.</em></h1>
          <p className="hero-lede">Nomylax is a financial firewall for autonomous AI agents. It evaluates intent, enforces owner-defined limits, rehearses behaviour in Shadow Mode, and leaves verifiable Solana evidence when value moves.</p>
          <div className="hero-actions">
            <Link className="btn btn-primary landing-cta" href="/app">Open control plane</Link>
            <Link className="btn btn-ghost landing-cta" href="/docs">Read the architecture</Link>
          </div>
          <div className="hero-proofline">
            <span>Non-custodial</span><span>Deterministic policy</span><span>Devnet live rail</span><span>Anthropic copilot outside authority</span>
          </div>
        </div>

        <div className="hero-machine" aria-label="Nomylax decision pipeline">
          <div className="machine-head"><span>LIVE DECISION PATH</span><span className="badge ok"><i/>ARMED</span></div>
          <div className="machine-intent"><span className="machine-small">AGENT INTENT</span><strong>Acquire research dataset</strong><span className="num">0.012 SOL</span></div>
          <div className="machine-rail">
            {['Asset allowed','Max transaction','Daily budget','Recipient','Reserve','Risk score','Wallet signer'].map((x,i)=>(
              <div className="machine-row" key={x}><span className="machine-index">0{i+1}</span><span>{x}</span><span className="machine-pass">PASS</span></div>
            ))}
          </div>
          <div className="machine-footer"><span>RESULT</span><strong>EXECUTE ON SOLANA</strong></div>
        </div>
      </section>

      <section className="landing-principle">
        <div className="principle-number">01</div>
        <div>
          <div className="label">The principle</div>
          <h2 className="display">An agent should never inherit the size of your treasury as the size of its mistake.</h2>
        </div>
      </section>

      <section className="landing-gates">
        {gates.map(([n,title,body]) => (
          <article key={n} className="gate-card">
            <span className="gate-n num">{n}</span>
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </section>

      <section className="landing-bottom">
        <div>
          <div className="label">Builder note</div>
          <h2 className="display">Rebuilt for Solana by Alexander Müller, a builder in the Superteam Germany ecosystem, for the Road to Colosseum.</h2>
        </div>
        <Link href="/app/onboarding" className="btn btn-primary landing-cta">Create an agent boundary</Link>
      </section>
    </main>
  );
}
