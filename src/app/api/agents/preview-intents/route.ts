import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertSafeUrl, UnsafeUrlError } from '@/server/security/url-guard';
import {
  fail,
  guard,
  parse,
  requireSession,
  serverError,
} from '@/server/api';

export const runtime = 'nodejs';

const schema = z.object({
  agentId: z.literal('preview'),
  count: z.number().int().min(1).max(25).default(5),
  endpoint: z.string().url().max(500),
});

export async function POST(req: Request) {
  const limited = guard(req, 'agent-preview-intents', 20);
  if (limited) return limited;

  const session = requireSession(req);
  if (!session) return fail(401, 'Authentication required');

  const parsed = await parse(req, schema);
  if (!parsed.ok) return parsed.response;

  let url: URL;

  try {
    url = assertSafeUrl(parsed.data.endpoint, {
      allowlist: process.env.AGENT_ENDPOINT_ALLOWLIST
        ?.split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    });
  } catch (error) {
    if (error instanceof UnsafeUrlError) {
      return fail(400, `Endpoint was refused: ${error.reason}`);
    }
    throw error;
  }

  const apiKey = process.env.AGENT_API_KEY;
  if (!apiKey) {
    return fail(501, 'Agent gateway is not configured on this deployment');
  }

  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'User-Agent': 'Nomylax/1.0',
      },
      body: JSON.stringify({
        agentId: parsed.data.agentId,
        count: parsed.data.count,
      }),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });

    if (!upstream.ok) {
      return fail(502, `Agent returned status ${upstream.status}`);
    }

    const data = await upstream.json().catch(() => null);

    return NextResponse.json({
      intents: Array.isArray((data as any)?.intents)
        ? (data as any).intents
        : [],
    });
  } catch (error: any) {
    if (error?.name === 'TimeoutError') {
      return fail(502, 'Agent did not respond in time');
    }

    return serverError(error, 'External agent could not be reached');
  }
}
