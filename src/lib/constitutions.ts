import type { AgentType, Constitution, RiskProfile } from './types';

/** Solana-first defaults. Values are denominated in SOL for the Devnet MVP. */
export const PROFILE_TEMPLATES: Record<RiskProfile, Constitution> = {
  conservative: {
    dailyLimit: 0.10,
    maxTransaction: 0.025,
    monthlyLimit: 2,
    allowedTokens: ['SOL'],
    approvedRecipients: [],
    unknownRecipient: 'block',
    emergencyReserve: 0.05,
    failedTxThreshold: 3,
    velocityThreshold: 150,
    riskThreshold: 40,
    permissionExpiryDays: 30,
  },
  balanced: {
    dailyLimit: 0.25,
    maxTransaction: 0.05,
    monthlyLimit: 5,
    allowedTokens: ['SOL'],
    approvedRecipients: [],
    unknownRecipient: 'review',
    emergencyReserve: 0.10,
    failedTxThreshold: 4,
    velocityThreshold: 200,
    riskThreshold: 55,
    permissionExpiryDays: 60,
  },
  autonomous: {
    dailyLimit: 1,
    maxTransaction: 0.25,
    monthlyLimit: 20,
    allowedTokens: ['SOL'],
    approvedRecipients: [],
    unknownRecipient: 'review',
    emergencyReserve: 0.5,
    failedTxThreshold: 5,
    velocityThreshold: 250,
    riskThreshold: 70,
    permissionExpiryDays: 90,
  },
};

export const PROFILE_COPY: Record<RiskProfile, { title: string; body: string }> = {
  conservative: {
    title: 'Conservative',
    body: 'Tight ceilings, allowlist-first behaviour and low risk tolerance for a new or unproven agent.',
  },
  balanced: {
    title: 'Balanced',
    body: 'Practical working limits for an agent you have observed. Unknown recipients are held for review.',
  },
  autonomous: {
    title: 'Autonomous',
    body: 'Wider authority for an agent with a track record. Reserve floors and Safe Mode remain hard boundaries.',
  },
};

export const AGENT_TEMPLATES: Record<
  Exclude<AgentType, 'custom'>,
  { name: string; blurb: string; constitution: Partial<Constitution> }
> = {
  research: {
    name: 'Research Scout',
    blurb: 'Pays for datasets, API access and compute in small bounded amounts.',
    constitution: { dailyLimit: 0.10, maxTransaction: 0.025, monthlyLimit: 2, unknownRecipient: 'block' },
  },
  trading: {
    name: 'Trading Agent',
    blurb: 'Prepares market actions inside hard position and treasury boundaries.',
    constitution: { dailyLimit: 0.25, maxTransaction: 0.05, monthlyLimit: 5, riskThreshold: 45 },
  },
  yield: {
    name: 'Yield Agent',
    blurb: 'Evaluates allowlisted venues while preserving an owner-defined reserve.',
    constitution: { dailyLimit: 0.15, maxTransaction: 0.05, monthlyLimit: 3, emergencyReserve: 0.15 },
  },
  ops: {
    name: 'Ops Agent',
    blurb: 'Pays recurring infrastructure and service costs to a fixed recipient list.',
    constitution: { dailyLimit: 0.05, maxTransaction: 0.02, monthlyLimit: 1, unknownRecipient: 'block' },
  },
  social: {
    name: 'Distribution Agent',
    blurb: 'Handles small, policy-bound distribution and content-service payments.',
    constitution: { dailyLimit: 0.08, maxTransaction: 0.025, monthlyLimit: 1.5 },
  },
};

/** Known addresses used only for Shadow Mode examples; live execution uses the address the user supplies. */
export const DEMO_RECIPIENTS = [
  'DvdQcgy9HQgtvZBRfi8sQWYCFb6BQuQ6orNsm6yqbfGW',
  'AmKjUaxjw3f3BUTyAroVp6Xori4Yt63exY3A3xrwEXiD',
  'DUUh4fnF6tMMQHmNbR6cUJdunPZe3SxeVg39d2etaaYm',
];
