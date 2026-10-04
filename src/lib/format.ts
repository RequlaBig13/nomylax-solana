/** Amount formatting for the contest MVP's native SOL execution rail. */
export const solAmount = (n: number, dp = 4) =>
  `${n.toLocaleString('en-US', { minimumFractionDigits: Math.min(dp, 4), maximumFractionDigits: Math.max(4, dp) })} SOL`;

export const solCompact = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M SOL';
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + 'K SOL';
  return solAmount(n);
};

export const pct = (n: number, dp = 1) => `${n >= 0 ? '+' : ''}${n.toFixed(dp)}%`;

export const shortAddr = (a: string) =>
  a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;

export const ago = (ts: number) => {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export const clock = (ts: number) =>
  new Date(ts).toLocaleTimeString('en-GB', { hour12: false });

export const uid = (prefix = 'nmx') =>
  `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
