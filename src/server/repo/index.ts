import { MemoryRepository } from './memory';
import type { Repository } from './types';

let instance: Repository | null = null;

/**
 * Returns the active repository.
 *
 * Only the in-memory implementation exists. DATABASE_URL is read solely to
 * report that it cannot be honoured yet.
 *
 * A configured DATABASE_URL used to throw here, and every route that touched
 * storage threw with it, including /api/auth/verify after the wallet signature
 * had already been validated. That surfaced as an unexplained 500 on sign in.
 * Degrading is the lesser fault for a gap that only costs durability, but it is
 * a real one: workspaces, agents, decisions, spend counters, Safe Mode latches
 * and the audit trail all live in process memory. They are lost on every
 * restart and invisible to every other instance, so on a serverless deployment
 * two consecutive requests may not agree on how much an agent has spent.
 *
 * Wiring Postgres behind this interface is the outstanding work. Nothing else
 * in the application needs to change when it lands, which is the point of the
 * boundary.
 */
let warned = false;

function warnOnce(message: string) {
  if (warned) return;
  warned = true;
  console.error(`[nomylax] STORAGE_DEGRADED ${message}`);
}

export function getRepository(): Repository {
  if (instance) return instance;

  if (process.env.DATABASE_URL) {
    warnOnce(
      'DATABASE_URL is set but the Postgres repository is not implemented. '
      + 'Using process local storage: workspaces, decisions, spend counters and '
      + 'the audit trail do not persist across instances or restarts.',
    );
  } else if (process.env.NODE_ENV === 'production') {
    warnOnce(
      'DATABASE_URL is not set. Using process local storage: workspaces, decisions, '
      + 'spend counters and the audit trail do not persist across instances or restarts.',
    );
  }

  instance = new MemoryRepository();
  return instance;
}

/**
 * Swap the active repository. Tests use this to force re appraisal of the
 * environment the way a cold start would, so the warning has to re-arm with it.
 */
export function setRepository(r: Repository | null) {
  instance = r;
  if (r === null) warned = false;
}
export { MemoryRepository };
export type { Repository };
