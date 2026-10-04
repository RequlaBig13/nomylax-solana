/** Integer/base-unit helpers used by server APIs and future on-chain policy code. */
export interface TokenSpec { symbol: string; decimals: number; mint: string | null }

export const TOKENS: Record<string, TokenSpec> = {
  SOL: { symbol: 'SOL', decimals: 9, mint: null },
};

export class MoneyError extends Error {}

export function tokenSpec(symbol: string): TokenSpec {
  const t = TOKENS[symbol.toUpperCase()];
  if (!t) throw new MoneyError(`Unsupported token: ${symbol}. The contest MVP settles SOL on Devnet.`);
  return t;
}

export function parseAmount(input: string | number, decimals: number): bigint {
  const raw = typeof input === 'number' ? decimalFromNumber(input) : input.trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) throw new MoneyError(`Malformed amount: ${input}`);
  const [whole, frac = ''] = raw.split('.');
  if (frac.length > decimals) throw new MoneyError(`Amount has more precision than ${decimals} decimals: ${input}`);
  return BigInt(whole + frac.padEnd(decimals, '0'));
}

export function formatAmount(units: bigint, decimals: number, dp = decimals): string {
  const neg = units < 0n;
  const abs = neg ? -units : units;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = (abs % base).toString().padStart(decimals, '0').slice(0, dp);
  const s = dp > 0 ? `${whole}.${frac}` : whole.toString();
  return neg ? `-${s}` : s;
}

export function displayAmount(units: bigint, decimals: number, dp = 4): string {
  const [whole, frac] = formatAmount(units, decimals, dp).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac ? `${grouped}.${frac}` : grouped;
}

function decimalFromNumber(n: number): string {
  if (!Number.isFinite(n) || n < 0) throw new MoneyError('Amount must be a finite non-negative number');
  return n.toFixed(18).replace(/0+$/, '').replace(/\.$/, '') || '0';
}

export const sum = (...v: bigint[]) => v.reduce((a, b) => a + b, 0n);
export const max = (a: bigint, b: bigint) => (a > b ? a : b);
export const min = (a: bigint, b: bigint) => (a < b ? a : b);
export function percentOf(a: bigint, b: bigint): number {
  if (b === 0n) return a > 0n ? 100_000 : 0;
  return Number((a * 10000n) / b) / 100;
}
