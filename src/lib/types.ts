// ---------------------------------------------------------------
// Nomylax domain model
// Owner -> Workspace -> Agent -> Financial Constitution -> Decision
// ---------------------------------------------------------------

export type RiskProfile = 'conservative' | 'balanced' | 'autonomous';
export type AgentMode = 'live' | 'shadow' | 'paused';
export type AgentState = 'autonomous' | 'watch' | 'safe';
export type AgentType = 'research' | 'trading' | 'yield' | 'ops' | 'social' | 'custom';
export type UnknownRecipientRule = 'block' | 'review' | 'allow';
export type Verdict = 'execute' | 'review' | 'blocked';

/** The rules governing what an agent is financially allowed to do. */
export interface Constitution {
  dailyLimit: number;
  maxTransaction: number;
  monthlyLimit: number;
  allowedTokens: string[];
  approvedRecipients: string[];
  unknownRecipient: UnknownRecipientRule;
  emergencyReserve: number;
  failedTxThreshold: number;
  /** Percent of the normal daily pace that triggers Safe Mode, e.g. 200. */
  velocityThreshold: number;
  /** NRS above this value is refused. 0-100. */
  riskThreshold: number;
  permissionExpiryDays: number;
}

export interface Agent {
  id: string;
  name: string;
  type: AgentType;
  mode: AgentMode;
  state: AgentState;
  constitution: Constitution;
  spentToday: number;
  spentMonth: number;
  failedCount: number;
  /**
   * UTC period the two counters above belong to, as YYYY-MM-DD and YYYY-MM.
   * Without these a counter cannot be told apart from a stale one, so a budget
   * would either never reset or reset on every read. Optional so records
   * written before spend accounting existed keep their values.
   */
  counterDay?: string;
  counterMonth?: string;
  riskScore: number;
  /** Present only for agents connected over HTTP. Never contains secrets. */
  endpoint?: string;
  createdAt: number;
}

export interface IntentRequest {
  agentId: string;
  amount: number;
  token: string;
  recipient: string;
  purpose: string;
  /** Optional signals an adapter may attach. */
  contractRisk?: number;
  recipientVerified?: boolean;
}

export interface PolicyCheck {
  id: string;
  name: string;
  detail: string;
  passed: boolean;
  /** A failed hard check blocks. A failed soft check escalates to review. */
  hard: boolean;
}

export interface RiskFactor {
  id: string;
  name: string;
  score: number;
  weight: number;
}

export interface RiskResult {
  score: number;
  band: 'low' | 'moderate' | 'high' | 'critical';
  factors: RiskFactor[];
  /** Set when a severity floor raised the score above the weighted mean. */
  escalation?: string;
}

export interface Decision {
  id: string;
  ts: number;
  agentId: string;
  agentName: string;
  request: IntentRequest;
  checks: PolicyCheck[];
  risk: RiskResult;
  verdict: Verdict;
  reason: string;
  /** Value kept in the treasury because the action was refused. */
  protectedValue: number;
  simulated: boolean;
  txHash?: string;
}

export interface Treasury {
  total: number;
  available: number;
  allocated: number;
  reserve: number;
}

export interface Workspace {
  name: string;
  treasuryLabel: string;
  riskProfile: RiskProfile;
  network: string;
  owner: string | null;
  createdAt: number;
}

export interface ShadowReport {
  requested: number;
  wouldApprove: number;
  wouldBlock: number;
  violations: number;
  criticalEvents: number;
  monthlyBurn: number;
  /** Request index at which the agent would have tripped into Safe Mode. */
  haltedAfter: number | null;
  decisions: Decision[];
  recommendation: 'safe' | 'review' | 'unsafe';
  notes: string[];
}
