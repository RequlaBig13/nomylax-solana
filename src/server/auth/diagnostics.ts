/* eslint-disable no-console -- this module is the logging boundary itself. */

/**
 * Authentication diagnostics.
 *
 * One greppable line per step of the sign in flow, so a production failure can
 * be located from Vercel logs without having to add logging and redeploy.
 *
 * Nothing secret is ever passed here. Signatures, session tokens and nonces are
 * recorded by length or short prefix only. SESSION_SECRET, private keys and API
 * keys are never arguments. Wallet addresses are public on chain identifiers and
 * are logged whole because they are the only useful correlation key.
 */

export type AuthStep =
  | 'AUTH_NONCE_ISSUE'
  | 'AUTH_NONCE_LOOKUP'
  | 'AUTH_SIGNATURE_VERIFY'
  | 'AUTH_USER_UPSERT'
  | 'AUTH_SESSION_CREATE'
  | 'AUTH_COOKIE_SET';

type Fields = Record<string, string | number | boolean | null | undefined>;

/** A nonce is a single use credential. Enough to correlate, never the whole value. */
export const noncePreview = (nonce: string) => `${nonce.slice(0, 8)}~len${nonce.length}`;

export function authLog(step: AuthStep, outcome: 'ok' | 'fail', fields: Fields = {}) {
  const parts = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v === null ? 'null' : String(v)}`);
  const line = `[nomylax] ${step} ${outcome}${parts.length ? ` ${parts.join(' ')}` : ''}`;
  // Both go to stderr, which Vercel captures. warn keeps ok lines from being
  // filtered out as errors while remaining inside the project's console policy.
  if (outcome === 'ok') console.warn(line);
  else console.error(line);
}
