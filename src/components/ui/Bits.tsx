'use client';

import { useEffect, useRef, useState } from 'react';
import type { Verdict } from '@/lib/types';

export function Stat({
  label, value, sub, tone = 'default',
}: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'default' | 'ok' | 'bad' | 'gold' }) {
  const color = { default: 'var(--text-1)', ok: '#3FD08A', bad: '#FF5C6C', gold: '#D4AF37' }[tone];
  return (
    <div className="card-bd">
      <div className="label">{label}</div>
      <div className="num" style={{ fontSize: 26, marginTop: 10, color }}>{value}</div>
      {sub ? <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>{sub}</div> : null}
    </div>
  );
}

export function VerdictBadge({ v }: { v: Verdict }) {
  const map = { execute: ['ok', 'Executed'], review: ['warn', 'Review'], blocked: ['bad', 'Blocked'] } as const;
  const [cls, text] = map[v];
  return <span className={`badge ${cls}`}><i />{text}</span>;
}

export function StateBadge({ s }: { s: 'autonomous' | 'watch' | 'safe' }) {
  const map = { autonomous: ['ok', 'Autonomous'], watch: ['warn', 'Watch'], safe: ['bad', 'Safe mode'] } as const;
  const [cls, text] = map[s];
  return <span className={`badge ${cls}`}><i />{text}</span>;
}

export function ModeBadge({ m }: { m: 'live' | 'shadow' | 'paused' }) {
  const map = { live: ['info', 'Live'], shadow: ['gold', 'Shadow'], paused: ['', 'Paused'] } as const;
  const [cls, text] = map[m];
  return <span className={`badge ${cls}`}>{text}</span>;
}

/** Counts a number up when it first enters the viewport. */
export function CountUp({
  to, prefix = '', dp = 0, duration = 1200,
}: { to: number; prefix?: string; dp?: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [v, setV] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setV(to); return; }
    let raf = 0, t0 = 0;
    const step = (t: number) => {
      if (!t0) t0 = t;
      const p = Math.min((t - t0) / duration, 1);
      setV(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) { raf = requestAnimationFrame(step); io.disconnect(); } });
    }, { threshold: 0.4 });
    if (ref.current) io.observe(ref.current);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to, duration]);

  return (
    <span ref={ref} className="num">
      {prefix}
      {v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}
    </span>
  );
}

export function PageHead({
  title, sub, actions,
}: { title: string; sub?: string; actions?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap', marginBottom: 24 }}>
      <div>
        <h1 className="display" style={{ fontSize: 30, margin: 0 }}>{title}</h1>
        {sub ? <p style={{ color: 'var(--text-3)', fontSize: 13.5, marginTop: 8, maxWidth: '64ch' }}>{sub}</p> : null}
      </div>
      {actions ? <div style={{ display: 'flex', gap: 10 }}>{actions}</div> : null}
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: '48px 24px', textAlign: 'center' }}>
      <div className="display" style={{ fontSize: 20 }}>{title}</div>
      <p style={{ color: 'var(--text-3)', fontSize: 13.5, marginTop: 10, maxWidth: '46ch', marginInline: 'auto' }}>{body}</p>
      {action ? <div style={{ marginTop: 20 }}>{action}</div> : null}
    </div>
  );
}

/**
 * Stands in for a chart with no data behind it.
 *
 * Sized to roughly the height of the chart it replaces so the dashboard does
 * not reflow as history accumulates, and deliberately plain: a placeholder
 * skeleton or a flat baseline both read as "a chart that happens to be quiet",
 * which is the impression these panels must not give. The note says which
 * event will populate it.
 */
export function ChartEmpty({ line, note }: { line: string; note: string }) {
  return (
    <div
      style={{
        flex: 1, minHeight: 190, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        gap: 10, padding: '20px 16px',
        border: '1px dashed var(--line-2)', borderRadius: 3,
      }}
    >
      <span className="label" style={{ color: 'var(--text-2)' }}>{line}</span>
      <p style={{ color: 'var(--text-3)', fontSize: 12.5, maxWidth: '42ch', margin: 0 }}>{note}</p>
    </div>
  );
}
