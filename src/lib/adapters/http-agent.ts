import type { AgentAdapter } from './types';
import type { IntentRequest } from '../types';

/**
 * Talks to an external agent through our own server route.
 *
 * The adapter sends an agentId and nothing else. The destination URL lives in
 * server storage and is validated there, so a compromised browser cannot point
 * Nomylax credentials at a host of its choosing.
 */
export class HttpAgentAdapter implements AgentAdapter {
  readonly kind = 'http' as const;

  async nextIntents(agentId: string, count: number): Promise<Omit<IntentRequest, 'agentId'>[]> {
    const res = await fetch('/api/agents/intents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, count }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `The agent gateway returned status ${res.status}`);
    }

    const data = await res.json();
    return Array.isArray(data.intents) ? data.intents : [];
  }
}
