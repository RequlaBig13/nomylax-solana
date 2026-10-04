'use client';

import { FormEvent, useMemo, useState } from 'react';
import { PageHead } from '@/components/ui/Bits';
import { useWorkspace } from '@/lib/store';

type Message = { role: 'user' | 'assistant'; content: string };

const STARTERS = [
  'Explain how Nomylax prevents an AI agent from bypassing spending limits.',
  'What is the difference between Shadow Mode and live execution?',
  'Explain Safe Mode and who can restore an agent to autonomous operation.',
  'What should I inspect when a transaction is blocked by policy?',
];

export default function CopilotPage() {
  const { agents, decisions, ready } = useWorkspace();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const context = useMemo(() => ({
    agentCount: agents.length,
    decisionCount: decisions.length,
    safeModeAgents: agents.filter((a) => a.state === 'safe').length,
    recentDecisions: decisions.slice(0, 8).map((d) => ({
      verdict: d.verdict,
      purpose: d.request.purpose,
      riskScore: d.risk.score,
    })),
  }), [agents, decisions]);

  if (!ready) return null;

  async function ask(text: string) {
    const message = text.trim();
    if (!message || loading) return;
    setMessages((m) => [...m, { role: 'user', content: message }]);
    setInput(''); setError(''); setLoading(true);
    try {
      const res = await fetch('/api/copilot', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, context }),
      });
      const body = await res.json() as { answer?: string; error?: string };
      if (!res.ok || !body.answer) throw new Error(body.error || 'Copilot request failed');
      setMessages((m) => [...m, { role: 'assistant', content: body.answer! }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Copilot request failed');
    } finally { setLoading(false); }
  }

  function submit(e: FormEvent) { e.preventDefault(); void ask(input); }

  return (
    <>
      <PageHead title="Control Copilot" sub="AI-assisted explanation for policy, risk and transaction decisions. Copilot can explain controls; it cannot authorize or execute financial actions." />
      <div className="copilot-grid">
        <section className="card" style={{ minHeight: 590, display: 'flex', flexDirection: 'column' }}>
          <div className="card-hd">
            <span className="label">Explanation channel</span>
            <span className="badge gold">No execution authority</span>
          </div>
          <div className="card-bd" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', maxHeight: 480 }}>
            {messages.length === 0 ? (
              <div style={{ margin: 'auto', textAlign: 'center', maxWidth: 560 }}>
                <div className="display" style={{ fontSize: 24 }}>Ask the control plane</div>
                <p className="muted" style={{ fontSize: 13.5 }}>Understand policy outcomes, risk signals, Safe Mode, Shadow Mode and the Solana execution lifecycle without giving an LLM financial authority.</p>
              </div>
            ) : messages.map((m, i) => (
              <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '82%', padding: '12px 14px', border: '1px solid var(--line-2)', borderRadius: 3, background: m.role === 'user' ? 'rgba(41,98,255,.10)' : '#0D1220', whiteSpace: 'pre-wrap', fontSize: 13.5 }}>
                <div className="label" style={{ marginBottom: 6 }}>{m.role === 'user' ? 'You' : 'Nomylax Copilot'}</div>{m.content}
              </div>
            ))}
            {loading ? <div className="muted" style={{ fontSize: 13 }}>Copilot is analyzing the request…</div> : null}
          </div>
          <form onSubmit={submit} style={{ borderTop: '1px solid var(--line)', padding: 16 }}>
            {error ? <div style={{ color: '#FF5C6C', fontSize: 12.5, marginBottom: 10 }}>{error}</div> : null}
            <div style={{ display: 'flex', gap: 10 }}>
              <input className="input" value={input} onChange={(e) => setInput(e.target.value)} maxLength={2000} placeholder="Ask why a decision was blocked, how a control works, or how to configure a safer policy…" />
              <button className="btn btn-primary" disabled={loading || input.trim().length < 2}>Ask</button>
            </div>
          </form>
        </section>
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="card"><div className="card-hd"><span className="label">Security boundary</span></div><div className="card-bd" style={{ fontSize: 13, color: 'var(--text-2)' }}>
            Groq is used only for interpretation and explanation. Deterministic Nomylax code remains authoritative for policy evaluation, approval requirements, Safe Mode and execution.
          </div></div>
          <div className="card"><div className="card-hd"><span className="label">Suggested questions</span></div><div className="card-bd" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {STARTERS.map((s) => <button key={s} className="btn btn-ghost" style={{ whiteSpace: 'normal', textAlign: 'left', justifyContent: 'flex-start' }} onClick={() => void ask(s)}>{s}</button>)}
          </div></div>
        </aside>
      </div>
    </>
  );
}
