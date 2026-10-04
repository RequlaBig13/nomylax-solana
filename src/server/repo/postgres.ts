import postgres, { type Sql } from 'postgres';
import type { Decision, Treasury, Workspace } from '@/lib/types';
import type { AuditEvent, ConstitutionVersion, Repository, StoredAgent } from './types';

/**
 * Durable Postgres repository for Vercel/Neon.
 *
 * A compact typed state table keeps the hackathon MVP migration-free while
 * preserving the Repository boundary. JSONB stores the domain records exactly
 * as the policy engine expects them; indexed kind/scope/sort columns provide
 * deterministic lookup and history ordering.
 */
export class PostgresRepository implements Repository {
  readonly kind = 'postgres' as const;
  private sql: Sql;
  private ready: Promise<void> | null = null;

  constructor(url: string) {
    this.sql = postgres(url, {
      max: 1,
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: 'require',
    });
  }

  private ensure() {
    if (!this.ready) {
      this.ready = (async () => {
        await this.sql`
          CREATE TABLE IF NOT EXISTS nomylax_state (
            kind TEXT NOT NULL,
            key TEXT NOT NULL,
            scope TEXT,
            sort_value BIGINT NOT NULL DEFAULT 0,
            data JSONB NOT NULL,
            PRIMARY KEY (kind, key)
          )
        `;
        await this.sql`CREATE INDEX IF NOT EXISTS nomylax_state_scope_idx ON nomylax_state (kind, scope, sort_value DESC)`;
      })();
    }
    return this.ready;
  }

  private async put(kind: string, key: string, scope: string | null, sort: number, data: unknown) {
    await this.ensure();
    await this.sql`
      INSERT INTO nomylax_state (kind, key, scope, sort_value, data)
      VALUES (${kind}, ${key}, ${scope}, ${sort}, ${this.sql.json(data as any)})
      ON CONFLICT (kind, key) DO UPDATE SET
        scope = EXCLUDED.scope,
        sort_value = EXCLUDED.sort_value,
        data = EXCLUDED.data
    `;
  }

  async getWorkspaceByOwner(address: string) {
    await this.ensure();
    const rows = await this.sql`SELECT data FROM nomylax_state WHERE kind = 'workspace' AND scope = ${address} ORDER BY sort_value DESC LIMIT 1`;
    return (rows[0]?.data as Workspace & { id: string; ownerAddress: string } | undefined) ?? null;
  }

  async createWorkspace(w: Workspace & { id: string; ownerAddress: string }) {
    await this.put('workspace', w.id, w.ownerAddress, w.createdAt, w);
  }

  async getAgent(agentId: string) {
    await this.ensure();
    const rows = await this.sql`SELECT data FROM nomylax_state WHERE kind = 'agent' AND key = ${agentId} LIMIT 1`;
    return (rows[0]?.data as StoredAgent | undefined) ?? null;
  }

  async listAgents(workspaceId: string) {
    await this.ensure();
    const rows = await this.sql`SELECT data FROM nomylax_state WHERE kind = 'agent' AND scope = ${workspaceId} ORDER BY sort_value ASC`;
    return rows.map((r) => r.data as StoredAgent);
  }

  async saveAgent(agent: StoredAgent) {
    await this.put('agent', agent.id, agent.workspaceId, agent.createdAt, agent);
  }

  async getActiveConstitution(agentId: string) {
    await this.ensure();
    const rows = await this.sql`
      SELECT data FROM nomylax_state
      WHERE kind = 'constitution' AND scope = ${agentId} AND data->>'status' = 'active'
      ORDER BY sort_value DESC LIMIT 1
    `;
    return (rows[0]?.data as ConstitutionVersion | undefined) ?? null;
  }

  async listConstitutionVersions(agentId: string) {
    await this.ensure();
    const rows = await this.sql`SELECT data FROM nomylax_state WHERE kind = 'constitution' AND scope = ${agentId} ORDER BY sort_value DESC`;
    return rows.map((r) => r.data as ConstitutionVersion);
  }

  async appendConstitutionVersion(v: ConstitutionVersion) {
    await this.ensure();
    await this.sql.begin(async (tx) => {
      await tx`
        UPDATE nomylax_state
        SET data = jsonb_set(data, '{status}', '"superseded"'::jsonb, true)
        WHERE kind = 'constitution' AND scope = ${v.agentId} AND data->>'status' = 'active'
      `;
      await tx`
        INSERT INTO nomylax_state (kind, key, scope, sort_value, data)
        VALUES ('constitution', ${v.id}, ${v.agentId}, ${v.version}, ${tx.json(v as any)})
        ON CONFLICT (kind, key) DO UPDATE SET
          scope = EXCLUDED.scope,
          sort_value = EXCLUDED.sort_value,
          data = EXCLUDED.data
      `;
    });
  }

  async getTreasury(workspaceId: string) {
    await this.ensure();
    const rows = await this.sql`SELECT data FROM nomylax_state WHERE kind = 'treasury' AND key = ${workspaceId} LIMIT 1`;
    return (rows[0]?.data as Treasury | undefined) ?? null;
  }

  async saveTreasury(workspaceId: string, t: Treasury) {
    await this.put('treasury', workspaceId, workspaceId, Date.now(), t);
  }

  async recordDecision(workspaceId: string, d: Decision) {
    await this.put('decision', d.id, workspaceId, d.ts, d);
  }

  async listDecisions(workspaceId: string, limit = 100) {
    await this.ensure();
    const safeLimit = Math.max(1, Math.min(1000, Math.trunc(limit)));
    const rows = await this.sql`SELECT data FROM nomylax_state WHERE kind = 'decision' AND scope = ${workspaceId} ORDER BY sort_value DESC LIMIT ${safeLimit}`;
    return rows.map((r) => r.data as Decision);
  }

  async appendAudit(e: AuditEvent) {
    await this.put('audit', e.id, e.workspaceId, e.ts, e);
  }

  async listAudit(workspaceId: string, limit = 100) {
    await this.ensure();
    const safeLimit = Math.max(1, Math.min(1000, Math.trunc(limit)));
    const rows = await this.sql`SELECT data FROM nomylax_state WHERE kind = 'audit' AND scope = ${workspaceId} ORDER BY sort_value DESC LIMIT ${safeLimit}`;
    return rows.map((r) => r.data as AuditEvent);
  }
}
