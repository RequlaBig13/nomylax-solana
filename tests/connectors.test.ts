import { describe, expect, it } from 'vitest';
import { normalizeAgentResponse } from '@/server/connectors/normalize';
import type { AgentConnectorConfig } from '@/lib/connectors';

const cfg: AgentConnectorConfig = {
  method: 'POST', sendContext: true, responseMode: 'auto', defaultToken: 'SOL', auth: { type: 'none' },
};

const recipient = 'DvdQcgy9HQgtvZBRfi8sQWYCFb6BQuQ6orNsm6yqbfGW';

describe('Universal Agent Gateway normalization', () => {
  it('keeps native Nomylax intents', () => {
    const result = normalizeAgentResponse({ intents: [{ amount: 0.02, token: 'SOL', recipient, purpose: 'Dataset access', recipientVerified: true, contractRisk: 8 }] }, cfg);
    expect(result.intents).toHaveLength(1);
    expect(result.intents[0].amount).toBe(0.02);
  });

  it('normalizes a nested third-party shape', () => {
    const result = normalizeAgentResponse({ payload: { actions: [{ payment: { value: 0.03, currency: 'SOL', destination: recipient }, description: 'External API payment', trust: { recipientVerified: true }, risk: { score: 22 } }] } }, cfg);
    expect(result.intents).toEqual([{ amount: 0.03, token: 'SOL', recipient, purpose: 'External API payment', recipientVerified: true, contractRisk: 22 }]);
  });

  it('supports custom response mapping', () => {
    const mapped: AgentConnectorConfig = {
      ...cfg,
      responseMode: 'mapping',
      rootPath: 'payload.rows',
      mapping: { amount: 'price', recipient: 'wallet', purpose: 'note', token: 'asset' },
    };
    const result = normalizeAgentResponse({ payload: { rows: [{ price: '0.04', wallet: recipient, note: 'Mapped purchase', asset: 'SOL' }] } }, mapped);
    expect(result.intents[0]?.purpose).toBe('Mapped purchase');
  });
});
