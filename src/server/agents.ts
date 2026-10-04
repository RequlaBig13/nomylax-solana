import { z } from 'zod';
import type { Constitution } from '@/lib/types';
import type { Repository, StoredAgent } from './repo/types';
import { addressString, fail } from './api';
import type { SessionData } from './auth/session';

/**
 * Shared agent handling for the owner facing routes.
 *
 * Ownership is checked in one place because getting it wrong in one route is
 * enough to expose every agent. A caller who does not own an agent gets the
 * same 404 as a caller asking for one that does not exist, so the API never
 * confirms that an agent id is real to someone who cannot use it.
 */

export type OwnedAgent = { ok: true; agent: StoredAgent } | { ok: false; response: Response };

export async function loadOwnedAgent(
  repo: Repository, agentId: string, session: SessionData,
): Promise<OwnedAgent> {
  const agent = await repo.getAgent(agentId);
  if (!agent) return { ok: false, response: fail(404, 'Agent not found') };
  if (agent.ownerAddress !== session.address) {
    // Existence is not disclosed to a caller who does not own it.
    return { ok: false, response: fail(404, 'Agent not found') };
  }
  return { ok: true, agent };
}

/**
 * A constitution supplied by an owner.
 *
 * Every ceiling is bounded rather than merely typed. An unbounded limit is not
 * a policy, and a policy the engine cannot enforce coherently is worse than no
 * policy at all, so the relationships between the three spend ceilings are
 * checked here rather than discovered at evaluation time.
 */
export const constitutionSchema = z
  .object({
    dailyLimit: z.number().positive().max(1e9),
    maxTransaction: z.number().positive().max(1e9),
    monthlyLimit: z.number().positive().max(1e9),
    allowedTokens: z.array(z.string().min(2).max(12)).min(1).max(20),
    approvedRecipients: z.array(addressString).max(200),
    unknownRecipient: z.enum(['block', 'review', 'allow']),
    emergencyReserve: z.number().min(0).max(1e9),
    failedTxThreshold: z.number().int().min(1).max(100),
    velocityThreshold: z.number().min(1).max(1000),
    riskThreshold: z.number().min(0).max(100),
    permissionExpiryDays: z.number().int().min(1).max(365),
  })
  .refine((c) => c.maxTransaction <= c.dailyLimit, {
    message: 'maxTransaction cannot exceed dailyLimit',
    path: ['maxTransaction'],
  })
  .refine((c) => c.dailyLimit <= c.monthlyLimit, {
    message: 'dailyLimit cannot exceed monthlyLimit',
    path: ['dailyLimit'],
  });

/** Tokens are compared uppercase in the engine, so they are stored that way. */
export function normaliseConstitution(c: z.infer<typeof constitutionSchema>): Constitution {
  return {
    ...c,
    allowedTokens: c.allowedTokens.map((t) => t.toUpperCase()),
    approvedRecipients: c.approvedRecipients.map((r) => r),
  };
}

/**
 * The starting policy for a new agent.
 *
 * Deliberately restrictive. A new agent that can spend freely until its owner
 * remembers to tighten it is the failure this product exists to prevent, so the
 * default refuses unknown recipients and holds small ceilings until the owner
 * raises them.
 */
export function defaultConstitution(): Constitution {
  return {
    dailyLimit: 0.10,
    maxTransaction: 0.025,
    monthlyLimit: 2,
    allowedTokens: ['SOL'],
    approvedRecipients: [],
    unknownRecipient: 'block',
    emergencyReserve: 0,
    failedTxThreshold: 3,
    velocityThreshold: 150,
    riskThreshold: 40,
    permissionExpiryDays: 30,
  };
}

export const agentIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{3,64}$/, 'must be 3-64 url safe characters');

/**
 * The shape of an agent that is safe to return to its owner.
 *
 * Built as an allowlist rather than by deleting fields from the stored record.
 * A deny list silently starts leaking the moment someone adds a column, and the
 * columns most likely to be added here are credentials: apiKeyHash and endpoint
 * are both on StoredAgent already. The endpoint is reduced to a boolean because
 * the owner needs to know whether one is registered, not what it is.
 */
export function publicAgent(a: StoredAgent) {
  return {
    id: a.id,
    name: a.name,
    type: a.type,
    mode: a.mode,
    state: a.state,
    spentToday: a.spentToday,
    spentMonth: a.spentMonth,
    failedCount: a.failedCount,
    riskScore: a.riskScore,
    enabled: a.enabled,
    constitutionVersion: a.constitutionVersion,
    createdAt: a.createdAt,
    hasEndpoint: !!a.endpoint,
  };
}
