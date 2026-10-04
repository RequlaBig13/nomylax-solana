import type { AgentConnectorConfig } from '@/lib/connectors';
import type { IntentRequest } from '@/lib/types';

const ARRAY_KEYS = ['intents', 'actions', 'payments', 'transactions', 'requests', 'results', 'items'];
const AMOUNT_KEYS = ['amount', 'value', 'cost', 'price', 'quantity', 'spend', 'lamports'];
const TOKEN_KEYS = ['token', 'asset', 'currency', 'symbol'];
const RECIPIENT_KEYS = ['recipient', 'to', 'destination', 'address', 'wallet', 'payee'];
const PURPOSE_KEYS = ['purpose', 'reason', 'description', 'memo', 'note', 'label', 'action'];
const VERIFIED_KEYS = ['recipientVerified', 'recipient_verified', 'verified', 'isVerified'];
const RISK_KEYS = ['contractRisk', 'contract_risk', 'riskScore', 'risk_score', 'score'];

export interface NormalizeResult {
  intents: Omit<IntentRequest, 'agentId'>[];
  rejected: number;
  sourceCount: number;
}

export function normalizeAgentResponse(data: unknown, cfg: AgentConnectorConfig): NormalizeResult {
  let rows: unknown[];
  if (cfg.responseMode === 'native') {
    const raw = getPath(data, cfg.rootPath || 'intents');
    rows = Array.isArray(raw) ? raw : [];
  } else if (cfg.responseMode === 'mapping') {
    const raw = cfg.rootPath ? getPath(data, cfg.rootPath) : data;
    rows = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : [];
  } else {
    rows = findIntentRows(data);
  }

  const intents: Omit<IntentRequest, 'agentId'>[] = [];
  let rejected = 0;
  for (const row of rows.slice(0, 25)) {
    const intent = cfg.responseMode === 'mapping' ? mapRow(row, cfg) : autoRow(row, cfg);
    if (intent) intents.push(intent);
    else rejected += 1;
  }
  return { intents, rejected, sourceCount: rows.length };
}

function mapRow(row: unknown, cfg: AgentConnectorConfig) {
  const m = cfg.mapping ?? {};
  return buildIntent({
    amount: m.amount ? getPath(row, m.amount) : undefined,
    token: m.token ? getPath(row, m.token) : cfg.defaultToken,
    recipient: m.recipient ? getPath(row, m.recipient) : undefined,
    purpose: m.purpose ? getPath(row, m.purpose) : undefined,
    recipientVerified: m.recipientVerified ? getPath(row, m.recipientVerified) : undefined,
    contractRisk: m.contractRisk ? getPath(row, m.contractRisk) : undefined,
  }, cfg.defaultToken);
}

function autoRow(row: unknown, cfg: AgentConnectorConfig) {
  if (!row || typeof row !== 'object') return null;
  const amountHit = findValue(row, AMOUNT_KEYS);
  let amount = amountHit?.value;
  if (amountHit?.key === 'lamports') {
    const raw = numeric(amount);
    amount = raw === null ? amount : raw / 1_000_000_000;
  }
  return buildIntent({
    amount,
    token: findValue(row, TOKEN_KEYS)?.value ?? cfg.defaultToken,
    recipient: findValue(row, RECIPIENT_KEYS)?.value,
    purpose: findValue(row, PURPOSE_KEYS)?.value,
    recipientVerified: findValue(row, VERIFIED_KEYS)?.value,
    contractRisk: findValue(row, RISK_KEYS)?.value,
  }, cfg.defaultToken);
}

function buildIntent(raw: Record<string, unknown>, defaultToken = 'SOL'): Omit<IntentRequest, 'agentId'> | null {
  const amount = numeric(raw.amount);
  const recipient = typeof raw.recipient === 'string' ? raw.recipient.trim() : '';
  const purpose = typeof raw.purpose === 'string' ? raw.purpose.trim() : '';
  const token = typeof raw.token === 'string' && raw.token.trim() ? raw.token.trim().toUpperCase() : defaultToken.toUpperCase();
  if (amount === null || amount <= 0 || amount > 1e9) return null;
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(recipient)) return null;
  if (!purpose || purpose.length > 180) return null;
  if (!/^[A-Z0-9._-]{2,12}$/.test(token)) return null;

  const verified = bool(raw.recipientVerified);
  const risk = numeric(raw.contractRisk);
  return {
    amount,
    token,
    recipient,
    purpose: purpose.slice(0, 180),
    ...(verified === null ? {} : { recipientVerified: verified }),
    ...(risk === null ? {} : { contractRisk: Math.max(0, Math.min(100, Math.round(risk))) }),
  };
}

function findIntentRows(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  const obj = data as Record<string, unknown>;
  for (const key of ARRAY_KEYS) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
  }
  for (const key of ['data', 'payload', 'result', 'response']) {
    const nested = obj[key];
    if (nested !== undefined) {
      const rows = findIntentRows(nested);
      if (rows.length) return rows;
    }
  }
  // Last resort: breadth-first scan up to four levels for a recognised array.
  const queue: { value: unknown; depth: number }[] = [{ value: data, depth: 0 }];
  const seen = new Set<unknown>();
  while (queue.length) {
    const { value, depth } = queue.shift()!;
    if (!value || typeof value !== 'object' || seen.has(value) || depth > 4) continue;
    seen.add(value);
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (ARRAY_KEYS.includes(key) && Array.isArray(child)) return child;
      if (child && typeof child === 'object') queue.push({ value: child, depth: depth + 1 });
    }
  }
  return [data];
}

export function getPath(value: unknown, rawPath: string): unknown {
  if (!rawPath) return value;
  const parts = rawPath.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let current: unknown = value;
  for (const part of parts) {
    if (Array.isArray(current) && /^\d+$/.test(part)) current = current[Number(part)];
    else if (current && typeof current === 'object') current = (current as Record<string, unknown>)[part];
    else return undefined;
  }
  return current;
}

function findValue(value: unknown, keys: string[], depth = 0): { key: string; value: unknown } | null {
  if (!value || typeof value !== 'object' || depth > 3) return null;
  const obj = value as Record<string, unknown>;
  for (const key of keys) if (Object.prototype.hasOwnProperty.call(obj, key)) return { key, value: obj[key] };
  for (const child of Object.values(obj)) {
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      const found = findValue(child, keys, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function numeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.trim().replace(/,/g, '');
    if (/^-?\d+(\.\d+)?$/.test(cleaned)) {
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
}

function bool(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return null;
}
