import { createHmac, createPublicKey, randomBytes, timingSafeEqual, verify as verifySignature } from 'node:crypto';
import { authSecret } from './session';
import { decodeBase58 } from '@/lib/base58';

export const NONCE_TTL_MS = 5 * 60 * 1000;
const RAND_LEN = 16;
const EXP_LEN = 9;
const FP_LEN = 8;
const TAG_LEN = 24;
const NONCE_LEN = RAND_LEN + EXP_LEN + FP_LEN + TAG_LEN;
const NONCE_SHAPE = new RegExp(`^[0-9a-z]{${NONCE_LEN}}$`);
const used = new Map<string, number>();

const hmac = (label: string, data: string) => createHmac('sha256', authSecret()).update(`${label}|${data}`).digest('hex');
const fingerprint = (address: string) => hmac('nomylax-siws-nonce-fp:v1', address).slice(0, FP_LEN);
const tagFor = (rand: string, exp: string, fp: string) => hmac('nomylax-siws-nonce:v1', `${rand}${exp}${fp}`).slice(0, TAG_LEN);

export function issueNonce(address: string, now = Date.now()): string {
  sweepNonces(now);
  const rand = randomBytes(RAND_LEN / 2).toString('hex');
  const exp = (now + NONCE_TTL_MS).toString(36).padStart(EXP_LEN, '0');
  const fp = fingerprint(address);
  return `${rand}${exp}${fp}${tagFor(rand, exp, fp)}`;
}

export type NonceFailure = 'unknown' | 'expired' | 'replayed' | 'wrong-address';
export function consumeNonce(nonce: string, address: string, now = Date.now()): { ok: true } | { ok: false; reason: NonceFailure } {
  if (!NONCE_SHAPE.test(nonce)) return { ok: false, reason: 'unknown' };
  const rand = nonce.slice(0, RAND_LEN);
  const exp = nonce.slice(RAND_LEN, RAND_LEN + EXP_LEN);
  const fp = nonce.slice(RAND_LEN + EXP_LEN, RAND_LEN + EXP_LEN + FP_LEN);
  const tag = nonce.slice(RAND_LEN + EXP_LEN + FP_LEN);
  const expected = Buffer.from(tagFor(rand, exp, fp));
  const given = Buffer.from(tag);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: 'unknown' };
  const expiresAt = parseInt(exp, 36);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) { used.delete(nonce); return { ok: false, reason: 'expired' }; }
  if (fp !== fingerprint(address)) return { ok: false, reason: 'wrong-address' };
  if (used.has(nonce)) return { ok: false, reason: 'replayed' };
  used.set(nonce, expiresAt);
  return { ok: true };
}

export function sweepNonces(now = Date.now()) { for (const [key, expiry] of used) if (expiry <= now) used.delete(key); }
export function resetNonces() { used.clear(); }
export function nonceIssuedAt(nonce: string): number | null {
  if (!NONCE_SHAPE.test(nonce)) return null;
  const expiresAt = parseInt(nonce.slice(RAND_LEN, RAND_LEN + EXP_LEN), 36);
  return Number.isFinite(expiresAt) ? expiresAt - NONCE_TTL_MS : null;
}

/** A deterministic Sign-In-With-Solana ownership challenge. */
export function buildChallenge(params: { domain: string; address: string; nonce: string; chain: string; issuedAt?: string }): string {
  const issuedAt = params.issuedAt ?? new Date().toISOString();
  return [
    `${params.domain} wants you to sign in with your Solana account:`,
    params.address,
    '',
    'Sign in to Nomylax. This proves wallet ownership only. It does not authorise a transfer and does not cost gas.',
    '',
    `URI: https://${params.domain}`,
    'Version: 1',
    `Chain: ${params.chain}`,
    `Nonce: ${params.nonce}`,
    `Issued At: ${issuedAt}`,
  ].join('\n');
}

/** Verify an Ed25519 Solana wallet signature with Node's built-in crypto. */
export async function verifyChallenge(params: { address: string; message: string; signature: string }): Promise<boolean> {
  try {
    const publicKeyBytes = Buffer.from(decodeBase58(params.address));
    const signatureBytes = Buffer.from(decodeBase58(params.signature));
    if (publicKeyBytes.length !== 32 || signatureBytes.length !== 64) return false;
    // ASN.1 SubjectPublicKeyInfo prefix for an Ed25519 raw 32-byte public key.
    const spki = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), publicKeyBytes]);
    const key = createPublicKey({ key: spki, format: 'der', type: 'spki' });
    return verifySignature(null, Buffer.from(params.message, 'utf8'), key, signatureBytes);
  } catch {
    return false;
  }
}
