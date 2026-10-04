import { NextResponse } from 'next/server';
import { z } from 'zod';
import { connectorInputSchema } from '@/server/connectors/schema';
import { fail, guard, parse, requireSession, serverError } from '@/server/api';
import { ConnectorError, fetchAgentIntents, publicConnector } from '@/server/connectors/gateway';

export const runtime = 'nodejs';

const schema = z.object({
  agentId: z.literal('preview'),
  count: z.number().int().min(1).max(25).default(5),
  endpoint: z.string().url().max(500),
  connector: connectorInputSchema.optional(),
});

export async function POST(req: Request) {
  const limited = guard(req, 'agent-preview-intents', 20);
  if (limited) return limited;

  const session = requireSession(req);
  if (!session) return fail(401, 'Authentication required');

  const parsed = await parse(req, schema);
  if (!parsed.ok) return parsed.response;

  const input = parsed.data.connector ?? {
    method: 'POST' as const,
    sendContext: true,
    responseMode: 'native' as const,
    defaultToken: 'SOL',
    auth: { type: 'env-bearer' as const, secretRef: 'AGENT_API_KEY' },
  };

  try {
    const connector = publicConnector(input)!;
    const result = await fetchAgentIntents({
      endpoint: parsed.data.endpoint,
      connector,
      previewCredential: input.credential,
      agentId: parsed.data.agentId,
      count: parsed.data.count,
    });

    return NextResponse.json({
      intents: result.intents,
      normalization: { sourceCount: result.sourceCount, rejected: result.rejected },
    });
  } catch (error) {
    if (error instanceof ConnectorError) return fail(error.status, error.message);
    return serverError(error, 'External agent could not be reached');
  }
}
