import type { AgentAdapter } from './types';
import type { IntentRequest } from '../types';

export class HttpAgentAdapter implements AgentAdapter {
  readonly kind = 'http' as const;

  constructor(private endpoint?: string) {}

  async nextIntents(
    agentId: string,
    count: number,
  ): Promise<Omit<IntentRequest, 'agentId'>[]> {
    const isPreview = agentId === 'preview' && Boolean(this.endpoint);

    const route = isPreview
      ? '/api/agents/preview-intents'
      : '/api/agents/intents';

    const body = isPreview
      ? { agentId, count, endpoint: this.endpoint }
      : { agentId, count };

    const res = await fetch(route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(
        data.error ?? `The agent gateway returned status ${res.status}`,
      );
    }

    const data = await res.json();
    return Array.isArray(data.intents) ? data.intents : [];
  }
}
