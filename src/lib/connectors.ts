export type ConnectorMethod = 'GET' | 'POST';
export type ConnectorResponseMode = 'native' | 'auto' | 'mapping';
export type ConnectorAuthType = 'none' | 'env-bearer' | 'env-header' | 'bearer' | 'header';

export interface ConnectorFieldMapping {
  amount?: string;
  token?: string;
  recipient?: string;
  purpose?: string;
  recipientVerified?: string;
  contractRisk?: string;
}

export interface AgentConnectorConfig {
  method: ConnectorMethod;
  /** Send agentId/count to the upstream API. Disable for APIs that need a plain request. */
  sendContext: boolean;
  responseMode: ConnectorResponseMode;
  /** Optional path to the array or object containing intents, e.g. payload.actions. */
  rootPath?: string;
  mapping?: ConnectorFieldMapping;
  /** Used only when the upstream response does not contain an asset symbol. */
  defaultToken?: string;
  auth: {
    type: ConnectorAuthType;
    /** Server environment variable name. Only AGENT_* / NOMYLAX_AGENT_* refs are accepted. */
    secretRef?: string;
    /** Header name for env-header/header auth. */
    headerName?: string;
  };
}

/** Sent only during preview/creation. Never returned by an API or stored in browser state. */
export interface ConnectorInput extends AgentConnectorConfig {
  credential?: string;
}

export const DEFAULT_CONNECTOR: AgentConnectorConfig = {
  method: 'POST',
  sendContext: true,
  responseMode: 'auto',
  defaultToken: 'SOL',
  auth: { type: 'env-bearer', secretRef: 'AGENT_API_KEY' },
};
