import { createHash } from 'node:crypto';
import type { Constitution } from '@/lib/types';
import type { ConstitutionVersion } from './types';

/**
 * A constitution is never edited in place. Each change appends a version with
 * a hash over the canonical form, so an audit entry can always be tied back to
 * the exact policy that produced a decision.
 */

export function hashConstitution(c: Constitution): string {
  return createHash('sha256').update(canonical(c)).digest('hex');
}

/** Key-sorted JSON so equivalent policies always hash identically. */
export function canonical(c: Constitution): string {
  const sortedRecipients = [...c.approvedRecipients].map((r) => r).sort();
  const sortedTokens = [...c.allowedTokens].map((t) => t.toUpperCase()).sort();
  const obj: Record<string, unknown> = { ...c, approvedRecipients: sortedRecipients, allowedTokens: sortedTokens };
  return JSON.stringify(Object.keys(obj).sort().reduce<Record<string, unknown>>((a, k) => { a[k] = obj[k]; return a; }, {}));
}

/** Human readable field-level diff, stored on the version record. */
export function diffConstitution(prev: Constitution | null, next: Constitution): string[] {
  if (!prev) return ['Initial constitution created'];
  const out: string[] = [];
  for (const key of Object.keys(next) as (keyof Constitution)[]) {
    const a = prev[key];
    const b = next[key];
    const same = Array.isArray(a) && Array.isArray(b)
      ? a.length === b.length && a.every((v, i) => v === b[i])
      : a === b;
    if (!same) {
      out.push(`${label(key)}: ${render(a)} to ${render(b)}`);
    }
  }
  return out.length ? out : ['No effective change'];
}

export function nextVersion(
  agentId: string, prev: ConstitutionVersion | null, constitution: Constitution, actor: string, now = Date.now(),
): ConstitutionVersion {
  return {
    id: `cv_${agentId}_${(prev?.version ?? 0) + 1}`,
    agentId,
    version: (prev?.version ?? 0) + 1,
    constitution,
    createdAt: now,
    createdBy: actor,
    changes: diffConstitution(prev?.constitution ?? null, constitution),
    hash: hashConstitution(constitution),
    status: 'active',
  };
}

const label = (k: string) => k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
const render = (v: unknown) => (Array.isArray(v) ? `${v.length} entries` : String(v));
