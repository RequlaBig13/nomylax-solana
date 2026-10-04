import type { AgentConnectorConfig, ConnectorInput } from '@/lib/connectors';
import type { StoredAgent } from '@/server/repo/types';
import { assertSafeUrl } from '@/server/security/url-guard';
import { decryptConnectorSecret } from './crypto';
import { normalizeAgentResponse } from './normalize';

export class ConnectorError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
    this.name = 'ConnectorError';
  }
}

export function endpointAllowlist() {
  const raw = process.env.AGENT_ENDPOINT_ALLOWLIST?.trim();
  if (!raw || raw === '*') return undefined;
  return raw.split(',').map((v) => v.trim()).filter(Boolean);
}

export async function fetchAgentIntents(args: {
  endpoint: string;
  connector: AgentConnectorConfig;
  credentialCiphertext?: string;
  previewCredential?: string;
  agentId: string;
  count: number;
}) {
  const url = assertSafeUrl(args.endpoint, { allowlist: endpointAllowlist() });
  const cfg = args.connector;
  const headers: Record<string, string> = { Accept: 'application/json', 'User-Agent': 'Nomylax/1.0' };
  const credential = resolveCredential(cfg, args.credentialCiphertext, args.previewCredential);

  if (cfg.auth.type === 'env-bearer' || cfg.auth.type === 'bearer') {
    if (!credential) throw new ConnectorError('Connector credential is not configured', 501);
    headers.Authorization = `Bearer ${credential}`;
  } else if (cfg.auth.type === 'env-header' || cfg.auth.type === 'header') {
    if (!credential) throw new ConnectorError('Connector credential is not configured', 501);
    if (!cfg.auth.headerName) throw new ConnectorError('Connector header name is missing', 400);
    headers[cfg.auth.headerName] = credential;
  }

  let body: string | undefined;
  if (cfg.method === 'GET') {
    if (cfg.sendContext) {
      url.searchParams.set('agentId', args.agentId);
      url.searchParams.set('count', String(args.count));
    }
  } else {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(cfg.sendContext ? { agentId: args.agentId, count: args.count } : {});
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: cfg.method,
      headers,
      body,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error: any) {
    throw new ConnectorError(error?.name === 'TimeoutError' ? 'Agent did not respond in time' : 'Agent is unreachable');
  }

  if (!upstream.ok) throw new ConnectorError(`Agent returned status ${upstream.status}`);
  const contentType = upstream.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('json')) throw new ConnectorError('Agent response must be JSON');
  const length = Number(upstream.headers.get('content-length') ?? 0);
  if (Number.isFinite(length) && length > 512_000) throw new ConnectorError('Agent response is too large');
  const text = await upstream.text();
  if (text.length > 512_000) throw new ConnectorError('Agent response is too large');
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new ConnectorError('Agent returned invalid JSON'); }

  const normalized = normalizeAgentResponse(data, cfg);
  if (!normalized.intents.length) {
    throw new ConnectorError(
      normalized.sourceCount
        ? 'Agent JSON was received but no valid economic intents could be normalized. Configure response mapping for this API.'
        : 'Agent returned no economic intents',
      422,
    );
  }
  return normalized;
}

export function publicConnector(input?: ConnectorInput | AgentConnectorConfig): AgentConnectorConfig | undefined {
  if (!input) return undefined;
  const { credential: _credential, ...cfg } = input as ConnectorInput;
  return cfg;
}

function resolveCredential(cfg: AgentConnectorConfig, encrypted?: string, preview?: string) {
  if (cfg.auth.type === 'none') return undefined;
  if (cfg.auth.type === 'env-bearer' || cfg.auth.type === 'env-header') {
    const ref = cfg.auth.secretRef;
    if (!ref || !/^(AGENT_|NOMYLAX_AGENT_)[A-Z0-9_]{1,80}$/.test(ref)) {
      throw new ConnectorError('Connector secret reference is not permitted', 400);
    }
    return process.env[ref]?.trim();
  }
  if (preview) return preview;
  return encrypted ? decryptConnectorSecret(encrypted) : undefined;
}

export function connectorForAgent(agent: StoredAgent): AgentConnectorConfig {
  return agent.connector ?? {
    method: 'POST',
    sendContext: true,
    responseMode: 'native',
    defaultToken: 'SOL',
    auth: { type: 'env-bearer', secretRef: 'AGENT_API_KEY' },
  };
}
