/**
 * Nomylax guardian identity.
 *
 * A Corinthian helmet reduced to geometry: a circular guardian boundary, an
 * arched brow, a cheek line, a nasal, and a crest. Drawn rather than
 * illustrated, so it holds at 16px and prints as a seal at 200px.
 *
 * Three variants:
 *   HelmetMark   sidebar, onboarding, application shell, loading
 *   BrandLockup  landing navigation, footer, documentation, trust centre
 *   MicroMark    favicon, small badges, compact status areas
 */

interface MarkProps { size?: number; title?: string }

export function HelmetMark({ size = 28, title }: MarkProps) {
  const id = 'nmx-helm';
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role={title ? 'img' : 'presentation'} aria-label={title}>
      <defs>
        <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#E8CC72" />
          <stop offset="55%" stopColor="#D4AF37" />
          <stop offset="100%" stopColor="#8A7328" />
        </linearGradient>
        <linearGradient id={`${id}-steel`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1F2433" />
          <stop offset="100%" stopColor="#151A26" />
        </linearGradient>
      </defs>

      {/* guardian boundary */}
      <circle cx="32" cy="32" r="29" fill="url(#nmx-helm-steel)" stroke="url(#nmx-helm-gold)" strokeWidth="1.4" />
      <circle cx="32" cy="32" r="24.5" fill="none" stroke="#2962FF" strokeWidth="0.7" opacity="0.45" />

      {/* crest */}
      <path d="M32 8 L35.5 12 L32 20 L28.5 12 Z" fill="#2962FF" />
      <path d="M32 8 L35.5 12 L32 20 Z" fill="#66E1FF" opacity="0.55" />

      {/* helmet dome and brow */}
      <path
        d="M18 30 a14 15 0 0 1 28 0 v5 a14 20 0 0 1 -14 19 a14 20 0 0 1 -14 -19 z"
        fill="none" stroke="url(#nmx-helm-gold)" strokeWidth="1.7" strokeLinejoin="round"
      />
      {/* eye slits */}
      <path d="M22.5 31 h7 v3.4 h-7 z" fill="url(#nmx-helm-gold)" opacity="0.9" />
      <path d="M34.5 31 h7 v3.4 h-7 z" fill="url(#nmx-helm-gold)" opacity="0.9" />
      {/* nasal */}
      <path d="M32 28 v18" stroke="url(#nmx-helm-gold)" strokeWidth="1.7" />
      {/* cheek line */}
      <path d="M24 40 a8 9 0 0 0 16 0" fill="none" stroke="#66E1FF" strokeWidth="0.8" opacity="0.5" />
    </svg>
  );
}

export function MicroMark({ size = 18 }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="presentation">
      <circle cx="16" cy="16" r="14.5" fill="#0B1020" stroke="#D4AF37" strokeWidth="1.2" />
      <path d="M16 5 L17.8 8 L16 12 L14.2 8 Z" fill="#2962FF" />
      <path d="M9 15 a7 7.5 0 0 1 14 0 v2.5 a7 10 0 0 1 -7 9.5 a7 10 0 0 1 -7 -9.5 z"
        fill="none" stroke="#D4AF37" strokeWidth="1.5" />
      <path d="M16 14 v9" stroke="#D4AF37" strokeWidth="1.5" />
    </svg>
  );
}

export function BrandLockup({ size = 30, tagline = false }: { size?: number; tagline?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 11 }}>
      <HelmetMark size={size} title="Nomylax" />
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
        <span className="caps" style={{ fontSize: size * 0.46, letterSpacing: '0.26em', color: '#E6EAF2' }}>
          Nomylax
        </span>
        {tagline ? (
          <span className="caps" style={{ fontSize: size * 0.26, letterSpacing: '0.18em', color: 'var(--text-3)', marginTop: 4 }}>
            Financial guardian for AI agents
          </span>
        ) : null}
      </span>
    </span>
  );
}

/** Kept as an alias so existing imports keep working. */
export const GuardianMark = HelmetMark;
