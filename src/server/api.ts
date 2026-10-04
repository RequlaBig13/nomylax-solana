import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifySession, SESSION_COOKIE, type SessionData } from './auth/session';
import { rateLimit, clientKey } from './security/rate-limit';

/**
 * Shared route helpers: uniform errors, validation, authentication and rate
 * limiting. Internal messages are never returned to the caller.
 */

export function fail(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status });
}

/**
 * Unexpected failure. The caller gets a generic message; the operator gets the
 * detail in the platform log.
 *
 * Production logging was previously suppressed, which is why a 500 in this
 * deployment left nothing behind in Vercel to diagnose. The message and stack
 * are internal, never the response body.
 */
export function serverError(e: unknown, publicMessage = 'The request could not be completed') {
  const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  console.error('[nomylax] unhandled', detail);
  if (e instanceof Error && e.stack) console.error(e.stack);
  return fail(500, publicMessage);
}

/**
 * The deployment is misconfigured, not the request. 503 rather than 500 so this
 * is distinguishable in logs and monitoring; the specific variable at fault is
 * logged but never returned, since that would describe the server's internals to
 * an anonymous caller.
 */
export function configError(e: unknown, publicMessage: string) {
  const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  console.error('[nomylax] misconfiguration', detail);
  return fail(503, publicMessage);
}

export function requireSession(req: Request): SessionData | null {
  const cookie = req.headers.get('cookie') ?? '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return verifySession(match?.[1]);
}

export function guard(req: Request, scope: string, limit: number, windowMs = 60_000) {
  const r = rateLimit(clientKey(req, scope), limit, windowMs);
  if (r.ok) return null;
  return NextResponse.json(
    { error: 'Too many requests. Slow down and try again shortly.' },
    { status: 429, headers: { 'Retry-After': String(r.retryAfter) } },
  );
}

export async function parse<T extends z.ZodTypeAny>(
  req: Request, schema: T,
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: NextResponse }> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { ok: false, response: fail(400, 'Request body must be valid JSON') };
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    return {
      ok: false,
      response: fail(400, `Invalid request: ${issue.path.join('.') || 'body'} ${issue.message.toLowerCase()}`),
    };
  }
  return { ok: true, data: result.data };
}

/** Financial amounts arrive as decimal strings, never as floats. */
export const amountString = z
  .string()
  .regex(/^\d+(\.\d{1,18})?$/, 'must be a positive decimal string')
  .refine((v) => Number(v) > 0, 'must be greater than zero');

export const addressString = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, 'must be a Solana base58 address');

export const intentSchema = z.object({
  agentId: z.string().min(3).max(64),
  intent: z.object({
    type: z.enum(['payment', 'swap', 'deposit']).default('payment'),
    token: z.string().min(2).max(12),
    amount: amountString,
    recipient: addressString,
    purpose: z.string().min(1).max(120),
  }),
  mode: z.enum(['live', 'shadow']).optional(),
});
