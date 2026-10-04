import type { AgentType, IntentRequest } from '../types';
import type { AgentConnectorConfig, ConnectorInput } from '../connectors';

/**
 * Adapter boundary. The UI never talks to an agent directly - it asks an
 * adapter for the next economic intents. Swapping in a real agent is a matter
 * of implementing this interface, not touching any component.
 */
export interface AgentAdapter {
  readonly kind: 'demo' | 'http';
  /** Ask the agent what it wants to spend next. */
  nextIntents(agentId: string, count: number): Promise<Omit<IntentRequest, 'agentId'>[]>;
}

export interface AdapterConfig {
  kind: 'demo' | 'http';
  type: AgentType;
  /** HTTP adapters only. Secrets are resolved server-side. */
  endpoint?: string;
  connector?: AgentConnectorConfig | ConnectorInput;
}
