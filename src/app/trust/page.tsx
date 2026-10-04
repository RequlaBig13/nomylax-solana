import Link from 'next/link';
import { BrandLockup } from '@/components/ui/Mark';
import { clientNetwork } from '@/lib/network';

export const metadata = { title: 'Trust - Nomylax', description: 'Nomylax security boundary, evidence and current limitations.' };

export default function Trust() {
  const net = clientNetwork();
  return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: '32px 24px 96px' }}>
      <header className="public-doc-header"><Link href="/"><BrandLockup size={30} /></Link><span className={`badge ${net.isTestnet ? 'warn' : 'gold'}`}><i />{net.label}</span></header>
      <h1 className="display" style={{ fontSize: 40, marginTop: 44 }}>Trust is a boundary, not a slogan.</h1>
      <p className="public-doc-lead">Nomylax is explicit about what it enforces, what the connected wallet still controls, and which parts remain roadmap until there is verifiable deployment evidence.</p>

      <Section title="Current security boundary">
        <Grid rows={[
          ['Wallet custody', 'Owner wallet', 'ok'],
          ['Server hot key', 'None', 'ok'],
          ['Financial verdicts', 'Deterministic', 'ok'],
          ['AI authorization', 'Never', 'ok'],
          ['Settlement', 'Wallet-signed', 'ok'],
          ['Network', net.label, net.isTestnet ? 'warn' : 'plain'],
        ]} />
      </Section>

      <Section title="What a live settlement proves">
        <div className="trust-chain">
          {['Intent received', 'Constitution evaluated', 'Risk scored', 'Owner wallet signs', 'Solana confirms', 'Explorer signature recorded'].map((x, i) => <div key={x}><span>{String(i + 1).padStart(2, '0')}</span><strong>{x}</strong></div>)}
        </div>
      </Section>

      <Section title="Fail-closed decisions">
        <p className="trust-copy">A blocked policy check cannot be overridden by Control Copilot. A rejected wallet prompt cannot be counted as spend. An invalid Solana recipient cannot be settled. If Nomylax cannot verify the prerequisites for an action, value does not move through the product flow.</p>
      </Section>

      <Section title="Honest limitations">
        <ul className="trust-list">
          <li>The contest MVP settles SOL on Devnet. SPL/USDC delegated authority is the next execution rail, not a fake claim in the current UI.</li>
          <li>The included Nomylax Guard Anchor program is a deployable program workspace, but a program ID must not be advertised until the team actually deploys and records it.</li>
          <li>The browser workspace remains local-first for the downloadable MVP. The server repository boundary is prepared for durable storage, but production Postgres must be wired and tested before enterprise claims are made.</li>
          <li>Rate limiting is process-local and should move to shared infrastructure for a multi-instance production deployment.</li>
          <li>No independent security audit is claimed.</li>
        </ul>
      </Section>

      <Section title="Anthropic Control Copilot">
        <p className="trust-copy">Anthropic is optional and server-side. It can translate a block or risk factor into plain language, but the model receives no signing authority and cannot mutate a verdict. If the API key is absent, the core control plane still works.</p>
      </Section>

      <footer className="public-doc-footer"><Link href="/">Home</Link><Link href="/docs">Documentation</Link><Link href="/app">Launch app</Link></footer>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <section className="trust-section"><h2>{title}</h2>{children}</section>; }
function Grid({ rows }: { rows: [string, string, string][] }) {
  const color = (t: string) => ({ ok: '#3FD08A', warn: '#E8B04B', bad: '#FF5C6C', plain: '#E6EAF2' }[t] ?? '#E6EAF2');
  return <div className="trust-grid">{rows.map(([k, v, t]) => <div key={k}><span>{k}</span><strong className="num" style={{ color: color(t) }}>{v}</strong></div>)}</div>;
}
