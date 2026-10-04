import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

/**
 * Stateless signed sessions.
 *
 * Payload is base64url JSON with an HMAC-SHA256 tag over it. No dependency, no
 * session table lookup on every request. Revocation before expiry is therefore
 * not possible, which SECURITY.md records as a known limitation; sessions are
 * kept short to bound it.
 */

export interface SessionData {
  address: string;
  workspaceId: string | null;
  issuedAt: number;
  expiresAt: number;
}

export const SESSION_COOKIE = 'nomylax_session';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export class SessionError extends Error {}

/**
 * The HMAC key for both session tags and nonce tags. Exported so the challenge
 * code can authenticate nonces under the same secret, with its own domain
 * separation label. Throws rather than falling back to anything derivable, so a
 * misconfigured deployment fails loudly instead of issuing forgeable sessions.
 */
export function authSecret(): Buffer {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new SessionError('SESSION_SECRET must be set to at least 32 characters');
  }
  return Buffer.from(s, 'utf8');
}


const b64u = (b: Buffer) => b.toString('base64url');

export function signSession(data: SessionData): string {
  const body = b64u(Buffer.from(JSON.stringify(data), 'utf8'));
  const tag = b64u(createHmac('sha256', authSecret()).update(body).digest());
  return `${body}.${tag}`;
}

export function verifySession(token: string | undefined | null, now = Date.now()): SessionData | null {
  if (!token) return null;
  const [body, tag] = token.split('.');
  if (!body || !tag) return null;

  let expected: string;
  try {
    expected = b64u(createHmac('sha256', authSecret()).update(body).digest());
  } catch {
    return null;
  }

  const a = Buffer.from(tag);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionData;
    if (typeof data.expiresAt !== 'number' || data.expiresAt <= now) return null;
    if (typeof data.address !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(data.address)) return null;
    return data;
  } catch {
    return null;
  }
}

export function newSession(address: string, workspaceId: string | null, now = Date.now()): SessionData {
  return {
    address,
    workspaceId,
    issuedAt: now,
    expiresAt: now + SESSION_TTL_MS,
  };
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}

export const newNonce = () => randomBytes(16).toString('hex');
