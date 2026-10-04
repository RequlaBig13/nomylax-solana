import { MemoryRepository } from './memory';
import { PostgresRepository } from './postgres';
import type { Repository } from './types';

let instance: Repository | null = null;
let warned = false;

function warnOnce(message: string) {
  if (warned) return;
  warned = true;
  console.error(`[nomylax] STORAGE_DEGRADED ${message}`);
}

export function getRepository(): Repository {
  if (instance) return instance;

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) {
    instance = new PostgresRepository(databaseUrl);
    return instance;
  }

  if (process.env.NODE_ENV === 'production') {
    warnOnce('DATABASE_URL is not set. Falling back to process-local storage; data will not persist across Vercel instances.');
  }
  instance = new MemoryRepository();
  return instance;
}

export function setRepository(r: Repository | null) {
  instance = r;
  if (r === null) warned = false;
}

export { MemoryRepository, PostgresRepository };
export type { Repository };
