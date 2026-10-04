'use client';

import { useEffect, useRef, useState } from 'react';

function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } });
    }, { threshold: 0.25 });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return { ref, seen };
}

export function AreaChart({
  data, height = 220, color = '#2962FF', labels,
}: { data: number[]; height?: number; color?: string; labels?: string[] }) {
  const { ref, seen } = useInView<HTMLDivElement>();
  const w = 620, h = height, pad = 8;
  const min = Math.min(...data), max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = pad + (1 - (v - min) / span) * (h - pad * 2 - 18);
    return [x, y] as const;
  });
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${w} ${h} L0 ${h} Z`;
  const last = pts[pts.length - 1];

  return (
    <div ref={ref}>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" role="img" aria-label="Treasury performance">
        <defs>
          <linearGradient id="nmxArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.32" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <g stroke="rgba(230,234,242,0.06)">
          {[0.25, 0.5, 0.75].map((f) => <path key={f} d={`M0 ${h * f} H${w}`} />)}
        </g>
        <path d={area} fill="url(#nmxArea)" style={{ opacity: seen ? 1 : 0, transition: 'opacity 1s 0.5s var(--ease)' }} />
        <path
          d={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round"
          style={{ strokeDasharray: 2000, strokeDashoffset: seen ? 0 : 2000, transition: 'stroke-dashoffset 2s var(--ease)' }}
        />
        <circle cx={last[0]} cy={last[1]} r="3.5" fill="#66E1FF" style={{ opacity: seen ? 1 : 0, transition: 'opacity 0.4s 1.6s' }} />
      </svg>
      {labels ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
          {labels.map((l) => <span key={l} className="num" style={{ fontSize: 10, color: 'var(--text-3)' }}>{l}</span>)}
        </div>
      ) : null}
    </div>
  );
}

export function Bars({ data, colors }: { data: number[]; colors?: (string | undefined)[] }) {
  const { ref, seen } = useInView<HTMLDivElement>();
  const max = Math.max(...data, 1);
  return (
    <div ref={ref} style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 96 }}>
      {data.map((v, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', alignItems: 'flex-end', height: '100%' }}>
          <div
            style={{
              width: '100%',
              height: seen ? `${(v / max) * 100}%` : '0%',
              background: colors?.[i] ?? 'rgba(41,98,255,0.55)',
              transition: `height 0.9s ${i * 60}ms var(--ease)`,
            }}
          />
        </div>
      ))}
    </div>
  );
}

export function Donut({ slices, size = 140 }: { slices: { name: string; pct: number; color: string }[]; size?: number }) {
  const { ref, seen } = useInView<HTMLDivElement>();
  const r = 52, C = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div ref={ref}>
      <svg width={size} height={size} viewBox="0 0 132 132" role="img" aria-label="Treasury allocation">
        <circle cx="66" cy="66" r={r} fill="none" stroke="rgba(230,234,242,0.06)" strokeWidth="14" />
        {slices.map((s, i) => {
          const len = (s.pct / 100) * C;
          const off = -acc;
          acc += len;
          return (
            <circle
              key={s.name} cx="66" cy="66" r={r} fill="none" stroke={s.color} strokeWidth="14"
              strokeDasharray={`${seen ? len : 0} ${C}`} strokeDashoffset={off}
              transform="rotate(-90 66 66)"
              style={{ transition: `stroke-dasharray 0.9s ${i * 140}ms var(--ease)` }}
            />
          );
        })}
      </svg>
    </div>
  );
}

export function RiskGauge({ score, band, size = 300 }: { score: number; band: string; size?: number }) {
  const ARC = 613, TOTAL = 817;
  const color = score < 30 ? '#3FD08A' : score < 55 ? '#66E1FF' : score < 75 ? '#E8B04B' : '#FF5C6C';
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setShown(score); return; }
    const start = shown; let raf = 0, t0 = 0;
    const step = (t: number) => {
      if (!t0) t0 = t;
      const p = Math.min((t - t0) / 800, 1);
      setShown(Math.round(start + (score - start) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [score]);

  return (
    <div style={{ position: 'relative', width: size, maxWidth: '100%', marginInline: 'auto' }}>
      <svg viewBox="0 0 320 320" width="100%" role="img" aria-label={`Risk score ${score}, ${band}`}>
        <circle cx="160" cy="160" r="130" fill="none" stroke="rgba(230,234,242,0.07)" strokeWidth="8"
          strokeLinecap="round" strokeDasharray={`${ARC} ${TOTAL}`} transform="rotate(135 160 160)" />
        <circle cx="160" cy="160" r="130" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${ARC} ${TOTAL}`} strokeDashoffset={ARC - ARC * (shown / 100)}
          transform="rotate(135 160 160)" style={{ transition: 'stroke-dashoffset 0.8s var(--ease), stroke 0.5s' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div className="num" style={{ fontSize: size / 5.4, lineHeight: 1 }}>{shown}</div>
        <div className="num" style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>/ 100 NRS</div>
        <div className="caps" style={{ fontSize: 11, marginTop: 10, color }}>{band}</div>
      </div>
    </div>
  );
}

export function FactorBars({ factors }: { factors: { id: string; name: string; score: number }[] }) {
  const { ref, seen } = useInView<HTMLDivElement>();
  return (
    <div ref={ref}>
      {factors.map((f, i) => {
        const c = f.score < 45 ? '#2962FF' : f.score < 70 ? '#E8B04B' : '#FF5C6C';
        return (
          <div key={f.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
              <span style={{ color: 'var(--text-2)' }}>{f.name}</span>
              <span className="num" style={{ fontSize: 12, color: 'var(--text-3)' }}>{f.score}</span>
            </div>
            <div style={{ height: 2, background: '#1F2433', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: '0 auto 0 0', width: seen ? `${f.score}%` : 0, background: c, transition: `width 1s ${i * 90}ms var(--ease)` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
