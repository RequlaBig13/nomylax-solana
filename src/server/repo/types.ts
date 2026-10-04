import type { Agent, Constitution, Decision, Treasury, Workspace } from '@/lib/types';

/**
 * Storage boundary.
 *
 * Every authoritative read goes through this interface. The Postgres
 * implementation and the in-memory development implementation satisfy the same
 * contract, so no route needs to know which is active.
 */

export interface StoredAgent extends Agent {
  workspaceId: string;
  ownerAddress: string;
  /** Approved outbound endpoint. Never accepted from a request body. */
  endpoint?: string;
  /** Hash of the shared secret an agent presents when calling the API. */
  apiKeyHash?: string;
  enabled: boolean;
  constitutionVersion: number;
}

export interface ConstitutionVersion {
  id: string;
  agentId: string;
  version: number;
  constitution: Constitution;
  createdAt: number;
  createdBy: string;
  changes: string[];
  /** Integrity reference over the serialised policy. */
  hash: string;
  status: 'active' | 'superseded';
}

export interface AuditEvent {
  id: string;
  ts: number;
  actor: string;
  workspaceId: string | null;
  agentId: string | null;
  action: string;
  detail: Record<string, unknown>;
  txHash?: string;
}

export interface Repository {
  readonly kind: 'postgres' | 'memory';

  getWorkspaceByOwner(address: string): Promise<Workspace & { id: string } | null>;
  createWorkspace(w: Workspace & { id: string; ownerAddress: string }): Promise<void>;

  getAgent(agentId: string): Promise<StoredAgent | null>;
  listAgents(workspaceId: string): Promise<StoredAgent[]>;
  saveAgent(agent: StoredAgent): Promise<void>;

  getActiveConstitution(agentId: string): Promise<ConstitutionVersion | null>;
  listConstitutionVersions(agentId: string): Promise<ConstitutionVersion[]>;
  appendConstitutionVersion(v: ConstitutionVersion): Promise<void>;

  getTreasury(workspaceId: string): Promise<Treasury | null>;
  saveTreasury(workspaceId: string, t: Treasury): Promise<void>;

  recordDecision(workspaceId: string, d: Decision): Promise<void>;
  listDecisions(workspaceId: string, limit?: number): Promise<Decision[]>;

  appendAudit(e: AuditEvent): Promise<void>;
  listAudit(workspaceId: string, limit?: number): Promise<AuditEvent[]>;
}
