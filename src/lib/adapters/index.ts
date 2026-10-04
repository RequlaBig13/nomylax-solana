import { DemoAgentAdapter } from './demo-agent';
import { HttpAgentAdapter } from './http-agent';
import type { AdapterConfig, AgentAdapter } from './types';

export function createAdapter(cfg: AdapterConfig): AgentAdapter {
  if (cfg.kind === 'http') return new HttpAgentAdapter();
  return new DemoAgentAdapter(cfg.type);
}

export type { AgentAdapter, AdapterConfig };
