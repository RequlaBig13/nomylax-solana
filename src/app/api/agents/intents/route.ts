import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getRepository } from '@/server/repo';
import { fail, guard, parse, requireSession, serverError } from '@/server/api';
import { connectorForAgent, ConnectorError, fetchAgentIntents } from '@/server/connectors/gateway';

export const runtime = 'nodejs';

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
    if (!agent || agent.ownerAddress !== session.address) return fail(404, 'Agent not found');
    if (!agent.enabled) return fail(409, 'This agent is disabled');
    if (agent.mode === 'paused') return fail(409, 'This agent is paused');
    if (!agent.endpoint) return fail(400, 'This agent has no registered endpoint');

    const result = await fetchAgentIntents({
      endpoint: agent.endpoint,
      connector: connectorForAgent(agent),
      credentialCiphertext: agent.credentialCiphertext,
      agentId: agent.id,
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
