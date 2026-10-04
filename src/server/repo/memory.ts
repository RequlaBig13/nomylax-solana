import type { Decision, Treasury, Workspace } from '@/lib/types';
import type { AuditEvent, ConstitutionVersion, Repository, StoredAgent } from './types';

/**
 * Process local repository.
 *
 * Satisfies the same contract as a Postgres implementation would, so no route
 * needs to know which is active. Currently it is the only implementation, and
 * getRepository selects it everywhere including production after logging
 * STORAGE_DEGRADED. Everything here is lost on restart and invisible to every
 * other instance: on a serverless deployment two consecutive requests may not
 * agree on how much an agent has spent.
 *
 * The bounded slices below are a memory ceiling, not a retention policy. They
 * are also why this cannot stand in for a durable audit trail - the oldest
 * entries are discarded silently once the cap is reached.
 */
export class MemoryRepository implements Repository {
  readonly kind = 'memory' as const;

  private workspaces = new Map<string, Workspace & { id: string; ownerAddress: string }>();
  private agents = new Map<string, StoredAgent>();
  private constitutions = new Map<string, ConstitutionVersion[]>();
  private treasuries = new Map<string, Treasury>();
  private decisions = new Map<string, Decision[]>();
  private audit: AuditEvent[] = [];

  async getWorkspaceByOwner(address: string) {
    const a = address;
    for (const w of this.workspaces.values()) if (w.ownerAddress === a) return w;
    return null;
  }
  async createWorkspace(w: Workspace & { id: string; ownerAddress: string }) {
    this.workspaces.set(w.id, w);
  }

  async getAgent(agentId: string) { return this.agents.get(agentId) ?? null; }
  async listAgents(workspaceId: string) {
    return [...this.agents.values()].filter((a) => a.workspaceId === workspaceId);
  }
  async saveAgent(agent: StoredAgent) { this.agents.set(agent.id, agent); }

  async getActiveConstitution(agentId: string) {
    const list = this.constitutions.get(agentId) ?? [];
    return list.find((v) => v.status === 'active') ?? null;
  }
  async listConstitutionVersions(agentId: string) {
    return [...(this.constitutions.get(agentId) ?? [])].sort((a, b) => b.version - a.version);
  }
  async appendConstitutionVersion(v: ConstitutionVersion) {
    const list = this.constitutions.get(v.agentId) ?? [];
    for (const old of list) old.status = 'superseded';
    list.push(v);
    this.constitutions.set(v.agentId, list);
  }

  async getTreasury(workspaceId: string) { return this.treasuries.get(workspaceId) ?? null; }
  async saveTreasury(workspaceId: string, t: Treasury) { this.treasuries.set(workspaceId, t); }

  async recordDecision(workspaceId: string, d: Decision) {
    const list = this.decisions.get(workspaceId) ?? [];
    list.unshift(d);
    this.decisions.set(workspaceId, list.slice(0, 1000));
  }
  async listDecisions(workspaceId: string, limit = 100) {
    return (this.decisions.get(workspaceId) ?? []).slice(0, limit);
  }

  async appendAudit(e: AuditEvent) { this.audit.unshift(e); this.audit = this.audit.slice(0, 2000); }
  async listAudit(workspaceId: string, limit = 100) {
    return this.audit.filter((e) => e.workspaceId === workspaceId).slice(0, limit);
  }

  /** Test helper. Not part of the Repository contract. */
  reset() {
    this.workspaces.clear(); this.agents.clear(); this.constitutions.clear();
    this.treasuries.clear(); this.decisions.clear(); this.audit = [];
  }
}
