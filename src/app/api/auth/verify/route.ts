import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildChallenge, consumeNonce, nonceIssuedAt, verifyChallenge } from '@/server/auth/siws';
import {
  newSession, signSession, SESSION_COOKIE, sessionCookieOptions, SessionError,
} from '@/server/auth/session';
import { ChainConfigError, activeNetwork } from '@/server/execution/chain';
import { authLog, noncePreview } from '@/server/auth/diagnostics';
import { getRepository } from '@/server/repo';
import { addressString, configError, fail, guard, parse, serverError } from '@/server/api';

export const runtime = 'nodejs';

const schema = z.object({
  address: addressString,
  message: z.string().min(32).max(2000),
  signature: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{80,96}$/, 'must be a base58 Ed25519 signature'),
  nonce: z.string().min(8).max(64),
});

/**
 * Verify the signature, consume the nonce, issue a session.
 *
 * The message is rebuilt here rather than inspected. An earlier version accepted
 * any text that merely contained the nonce as a substring, which meant the
 * signature proved only that the wallet had signed *something* the caller chose.
 * Since /api/auth/nonce issues a challenge for any address to any anonymous
 * caller, that was enough to take over an account: mint a challenge for the
 * victim, get them to sign an unrelated string carrying that nonce, and replay
 * the signature here. Domain, URI, chain ID and issue time went unchecked.
 *
 * The nonce is authenticated under SESSION_SECRET and carries its own expiry and
 * address binding, so once consumeNonce accepts it the server can regenerate the
 * one challenge it would have issued and demand an exact match. Nothing the
 * caller sends influences the text a signature is accepted over.
 */
export async function POST(req: Request) {
  const limited = guard(req, 'auth-verify', 10);
  if (limited) return limited;

  const parsed = await parse(req, schema);
  if (!parsed.ok) return parsed.response;
  const { address, message, signature, nonce } = parsed.data;

  try {
    // Authenticate the nonce before anything is derived from it. This checks the
    // HMAC tag, the expiry and the address binding, and burns it. Burning before
    // the message comparison is deliberate: one challenge permits one attempt,
    // so a failed match cannot be retried with different text.
    const consumed = consumeNonce(nonce, address);
    if (!consumed.ok) {
      authLog('AUTH_NONCE_LOOKUP', 'fail', {
        address, nonce: noncePreview(nonce), reason: consumed.reason,
      });
      const reason = {
        unknown: 'Challenge not recognised. Request a new one.',
        expired: 'Challenge expired. Request a new one.',
        replayed: 'This challenge has already been used.',
        'wrong-address': 'Challenge was issued to a different wallet.',
      }[consumed.reason];
      return fail(401, reason);
    }

    const issuedAtMs = nonceIssuedAt(nonce);
    if (issuedAtMs === null) {
      authLog('AUTH_NONCE_LOOKUP', 'fail', { address, nonce: noncePreview(nonce), reason: 'unreadable' });
      return fail(401, 'Challenge not recognised. Request a new one.');
    }

    const domain = new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://nomylax.app').host;
    const chain = activeNetwork().chain;
    const expected = buildChallenge({
      domain, address, nonce, chain, issuedAt: new Date(issuedAtMs).toISOString(),
    });

    // Not a secret comparison. The challenge was handed to this caller in the
    // clear, so there is nothing for a timing side channel to reveal.
    if (message !== expected) {
      authLog('AUTH_NONCE_LOOKUP', 'fail', {
        address, nonce: noncePreview(nonce), reason: 'challenge-mismatch', len: message.length,
      });
      return fail(400, 'The signed message is not the challenge this server issued');
    }
    authLog('AUTH_NONCE_LOOKUP', 'ok', { address, nonce: noncePreview(nonce), domain, chain });

    const valid = await verifyChallenge({
      address,
      message,
      signature,
    });
    if (!valid) {
      authLog('AUTH_SIGNATURE_VERIFY', 'fail', { address, siglen: signature.length });
      return fail(401, 'Signature does not match this wallet');
    }
    authLog('AUTH_SIGNATURE_VERIFY', 'ok', { address });

    const repo = getRepository();
    const workspace = await repo.getWorkspaceByOwner(address);
    authLog('AUTH_USER_UPSERT', 'ok', { address, workspaceId: workspace?.id ?? null });

    const token = signSession(newSession(address, workspace?.id ?? null));
    authLog('AUTH_SESSION_CREATE', 'ok', { address, workspaceId: workspace?.id ?? null });

    await repo.appendAudit({
      id: `aud_login_${Date.now()}`,
      ts: Date.now(),
      actor: address,
      workspaceId: workspace?.id ?? null,
      agentId: null,
      action: 'auth.login',
      detail: { method: 'wallet-signature' },
    });

    const res = NextResponse.json({
      address,
      workspaceId: workspace?.id ?? null,
    });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    authLog('AUTH_COOKIE_SET', 'ok', { address });
    return res;
  } catch (e) {
    authLog('AUTH_SIGNATURE_VERIFY', 'fail', {
      address, cause: e instanceof Error ? e.name : 'unknown',
    });
    // A bad SESSION_SECRET or an unset network is a deployment fault, not a bad
    // request, and must not surface as an unexplained 500 the way the storage
    // selection once did.
    if (e instanceof SessionError || e instanceof ChainConfigError) {
      return configError(e, 'Sign in is temporarily unavailable. The server is misconfigured.');
    }
    return serverError(e, 'Sign in could not be completed');
  }
}
