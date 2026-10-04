import type { AgentAdapter } from './types';
import type { IntentRequest } from '../types';
import type { AgentConnectorConfig, ConnectorInput } from '../connectors';

export class HttpAgentAdapter implements AgentAdapter {
  readonly kind = 'http' as const;

  constructor(
    private endpoint?: string,
    private connector?: AgentConnectorConfig | ConnectorInput,
  ) {}

  async nextIntents(
    agentId: string,
    count: number,
  ): Promise<Omit<IntentRequest, 'agentId'>[]> {
    const isPreview = agentId === 'preview' && Boolean(this.endpoint);
    if (isPreview) return this.preview(count);

    const res = await fetch('/api/agents/intents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, count }),
    });

    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data.intents) ? data.intents : [];
    }

    // Compatibility bridge for agents created by the pre-Postgres onboarding
    // flow. Those agents exist in browser state but not in the authoritative
    // repository. Env-reference/no-auth connectors can still be tested safely
    // through the preview gateway; newly activated agents are persisted and do
    // not take this path.
    if (res.status === 404 && this.endpoint) return this.preview(count);

    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `The agent gateway returned status ${res.status}`);
  }

  private async preview(count: number) {
    const res = await fetch('/api/agents/preview-intents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'preview',
        count,
        endpoint: this.endpoint,
        connector: this.connector,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? `The agent gateway returned status ${res.status}`);
    }
    const data = await res.json();
    return Array.isArray(data.intents) ? data.intents : [];
  }
}
