import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getRepository } from '@/server/repo';
import { assertSafeUrl, UnsafeUrlError } from '@/server/security/url-guard';
import { fail, guard, parse, requireSession, serverError } from '@/server/api';

export const runtime = 'nodejs';

/**
 * Fetch pending intents from an agent.
 *
 * The caller supplies an agentId only. The destination URL is loaded from
 * storage, validated against the SSRF guard, and only then contacted. A URL
 * from the request body is never used, so Nomylax credentials cannot be
 * redirected to an attacker chosen host.
 */
const schema = z.object({
  agentId: z.string().min(3).max(64),
  count: z.number().int().min(1).max(25).default(5),
});

export async function POST(req: Request) {
  const limited = guard(req, 'agent-intents', 30);
  if (limited) return limited;

  const session = requireSession(req);
  if (!session) return fail(401, 'Authentication required');

  const parsed = await parse(req, schema);
  if (!parsed.ok) return parsed.response;

  try {
    const repo = getRepository();
    const agent = await repo.getAgent(parsed.data.agentId);

    if (!agent) return fail(404, 'Agent not found');
    if (agent.ownerAddress !== session.address) {
      // Same response as a missing agent: existence is not disclosed.
      return fail(404, 'Agent not found');
    }
    if (!agent.enabled) return fail(409, 'This agent is disabled');
    if (agent.mode === 'paused') return fail(409, 'This agent is paused');
    if (!agent.endpoint) return fail(400, 'This agent has no registered endpoint');

    let url: URL;
    try {
      url = assertSafeUrl(agent.endpoint, {
        allowlist: process.env.AGENT_ENDPOINT_ALLOWLIST?.split(',').filter(Boolean),
      });
    } catch (e) {
      if (e instanceof UnsafeUrlError) {
        return fail(400, `Registered endpoint was refused: ${e.reason}`);
      }
      throw e;
    }

    const key = process.env.AGENT_API_KEY;
    if (!key) return fail(501, 'Agent gateway is not configured on this deployment');

    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        'User-Agent': 'Nomylax/1.0',
      },
      body: JSON.stringify({ agentId: agent.id, count: parsed.data.count }),
      cache: 'no-store',
      redirect: 'error', // a redirect could point somewhere the guard rejected
      signal: AbortSignal.timeout(10_000),
    }).catch((e: any) => {
      throw new UpstreamError(e?.name === 'TimeoutError' ? 'Agent did not respond in time' : 'Agent is unreachable');
    });

    if (!upstream.ok) return fail(502, `Agent returned status ${upstream.status}`);

    const data = await upstream.json().catch(() => null);
    const intents = Array.isArray((data as any)?.intents) ? (data as any).intents : [];
    return NextResponse.json({ intents });
  } catch (e) {
    if (e instanceof UpstreamError) return fail(502, e.message);
    return serverError(e);
  }
}

class UpstreamError extends Error {}
