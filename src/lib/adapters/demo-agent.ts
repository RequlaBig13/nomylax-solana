import type { AgentAdapter } from './types';
import type { AgentType, IntentRequest } from '../types';
import { DEMO_RECIPIENTS } from '../constitutions';

type Draft = Omit<IntentRequest, 'agentId'>;

const PURPOSES: Record<AgentType, string[]> = {
  research: ['Market dataset', 'API credits', 'Compute hours', 'Sentiment feed', 'Archive access'],
  trading: ['Position entry', 'Swap execution', 'Rebalance', 'Hedge open', 'Position exit'],
  yield: ['LP deposit', 'Vault allocation', 'Reward claim', 'Position migration'],
  ops: ['RPC subscription', 'Node hosting', 'Monitoring tier', 'Storage renewal'],
  social: ['Content boost', 'Distribution buy', 'Creator payout'],
  custom: ['Agent action'],
};

const UNKNOWN = '7cUnpUR6kK31GXdRC1UT1Q8D7a4zKDBycnEdesr4butt';

/**
 * Generates realistic economic intents so the demo path works with no external
 * agent infrastructure. Roughly one request in four is deliberately out of
 * bounds - that is the point of shadow mode.
 */
export class DemoAgentAdapter implements AgentAdapter {
  readonly kind = 'demo' as const;
  constructor(private type: AgentType, private scale = 1) {}

  async nextIntents(agentId: string, count: number): Promise<Draft[]> {
    const out: Draft[] = [];
    for (let i = 0; i < count; i++) out.push(this.draft());
    return out;
  }

  private draft(): Draft {
    const purposes = PURPOSES[this.type] ?? PURPOSES.custom;
    const purpose = pick(purposes);
    const misbehave = Math.random() < 0.26;
    const base = { research: 0.012, trading: 0.035, yield: 0.045, ops: 0.008, social: 0.01, custom: 0.015 }[this.type];

    const amount = misbehave
      ? round2(base * (3 + Math.random() * 4) * this.scale)
      : round2(base * (0.4 + Math.random() * 1.2) * this.scale);

    const unknownRecipient = misbehave && Math.random() < 0.7;

    return {
      amount,
      token: 'SOL',
      recipient: unknownRecipient ? UNKNOWN : pick(DEMO_RECIPIENTS),
      purpose,
      recipientVerified: !unknownRecipient,
      contractRisk: unknownRecipient ? 70 + Math.floor(Math.random() * 25) : 8 + Math.floor(Math.random() * 22),
    };
  }
}

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const round2 = (n: number) => Math.round(n * 100) / 100;
