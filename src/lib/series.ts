import type { Decision, Treasury } from './types';
import { utcDay, roundCents } from './spend';

/**
 * Chart series derived from recorded decisions.
 *
 * The overview and treasury pages previously rendered three fixed arrays - a
 * rising balance curve, a daily burn histogram and an asset allocation donut -
 * next to figures computed from real workspace state. Nothing distinguished the
 * invented numbers from the real ones, so a reader had no way to tell that the
 * portfolio mix and the performance line described no treasury at all.
 *
 * Everything here is reconstructed from decisions the engine actually produced.
 * Where there is no history, the functions return empty rather than a plausible
 * shape, so the pages can say so instead of drawing one.
 */

/**
 * Value that actually left the treasury.
 *
 * A verdict of execute is not sufficient on its own - shadow decisions settle
 * nothing - but the non simulated case needs no further test. The decision
 * route rewrites an approved decision to blocked whenever its execution cannot
 * be verified against a receipt, so an execute verdict that survives to
 * storage is one where value moved. The browser store attaches a transaction signature only after wallet settlement, so charts count only signed network outcomes.
 */
export function settled(decisions: Decision[]): Decision[] {
  return decisions.filter((d) => d.verdict === 'execute' && !d.simulated && !!d.txHash);
}

export interface DayPoint { day: string; value: number }

/** Settled outflow per UTC day, oldest first, including days with no activity. */
export function dailySpend(decisions: Decision[], days = 7, now = Date.now()): DayPoint[] {
  const totals = new Map<string, number>();
  for (const d of settled(decisions)) {
    const key = utcDay(d.ts);
    totals.set(key, (totals.get(key) ?? 0) + d.request.amount);
  }
  return lastDays(days, now).map((day) => ({ day, value: roundCents(totals.get(day) ?? 0) }));
}

/**
 * Treasury balance at the close of each of the last N days.
 *
 * Reconstructed backwards from the current balance by re-adding settled
 * outflow, which is the only movement this system records. It is therefore a
 * record of what Nomylax released, not an on chain balance history: deposits
 * and any transfer made outside the control plane are invisible to it. The
 * treasury page states that alongside the chart rather than leaving the curve
 * to imply more than it knows.
 */
export function treasuryHistory(
  treasury: Treasury, decisions: Decision[], days = 7, now = Date.now(),
): DayPoint[] {
  const spend = dailySpend(decisions, days, now);
  const out: DayPoint[] = [];
  let balance = treasury.total;

  // Walk from today backwards, undoing each day's outflow as we go.
  for (let i = spend.length - 1; i >= 0; i -= 1) {
    out.unshift({ day: spend[i].day, value: roundCents(balance) });
    balance += spend[i].value;
  }
  return out;
}

/** Percentage change across a series. Null when there is nothing to compare. */
export function changePct(points: DayPoint[]): number | null {
  if (points.length < 2) return null;
  const first = points[0].value;
  const last = points[points.length - 1].value;
  if (first === 0) return null;
  return Math.round(((last - first) / first) * 1000) / 10;
}

/**
 * Palette assigned by rank, not by asset.
 *
 * Presentation only. Mapping a fixed colour to a named token would mean
 * carrying a list of assets the workspace may never hold.
 */
const PALETTE = ['#2962FF', '#66E1FF', '#D4AF37', '#5C6784', '#3FD08A', '#E8B04B'];

export interface Slice { name: string; pct: number; color: string }

/**
 * Share of settled outflow by asset.
 *
 * This is where value went, which is what the control plane observed. It is not
 * a holdings breakdown: Nomylax does not custody assets or read balances, so it
 * cannot report what a treasury contains, only what it released.
 */
export function outflowByAsset(decisions: Decision[], limit = 6): Slice[] {
  const totals = new Map<string, number>();
  for (const d of settled(decisions)) {
    const token = d.request.token.toUpperCase();
    totals.set(token, (totals.get(token) ?? 0) + d.request.amount);
  }

  const sum = [...totals.values()].reduce((a, b) => a + b, 0);
  if (sum === 0) return [];

  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const head = ranked.slice(0, limit);
  const tail = ranked.slice(limit);

  const slices = head.map(([name, v], i) => ({
    name,
    pct: Math.round((v / sum) * 1000) / 10,
    color: PALETTE[i % PALETTE.length],
  }));

  if (tail.length) {
    const rest = tail.reduce((a, [, v]) => a + v, 0);
    slices.push({
      name: `${tail.length} other assets`,
      pct: Math.round((rest / sum) * 1000) / 10,
      color: PALETTE[PALETTE.length - 1],
    });
  }
  return slices;
}

/** Short axis labels, e.g. "May 16". */
export function axisLabels(points: DayPoint[], count = 4): string[] {
  if (points.length <= count) return points.map((p) => shortDay(p.day));
  const step = (points.length - 1) / (count - 1);
  return Array.from({ length: count }, (_, i) => shortDay(points[Math.round(i * step)].day));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function shortDay(day: string): string {
  const [, m, d] = day.split('-');
  return `${MONTHS[Number(m) - 1] ?? m} ${Number(d)}`;
}

/** The last N UTC day keys, oldest first. */
function lastDays(days: number, now: number): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) out.push(utcDay(now - i * 86_400_000));
  return out;
}
