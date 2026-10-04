import { PROFILE_TEMPLATES, DEMO_RECIPIENTS } from './constitutions';
import type { Agent, AgentType } from './types';

/**
 * A new agent, with nothing recorded against it yet.
 *
 * riskScore starts at 0 rather than at a plausible-looking baseline. The score
 * is an output of the risk engine over a specific request, so an agent that has
 * never submitted one has no score - and a dashboard reading "12" before the
 * first decision is a number the engine never produced. The first evaluation
 * overwrites it with a real one.
 */
export const seedAgent = (
  id: string,
  name: string,
  type: AgentType,
  over: Partial<Agent> = {},
): Agent => ({
  id,
  name,
  type,
  mode: 'live',
  state: 'autonomous',
  constitution: { ...PROFILE_TEMPLATES.balanced, approvedRecipients: [...DEMO_RECIPIENTS] },
  spentToday: 0,
  spentMonth: 0,
  failedCount: 0,
  riskScore: 0,
  createdAt: Date.now(),
  ...over,
});

/*
 * TREASURY_SERIES, DAILY_BURN and ALLOCATION used to live here: a rising
 * balance curve, a burn histogram and a four-asset portfolio mix, all fixed
 * arrays, rendered on the overview and treasury pages beside figures computed
 * from real workspace state. Nothing marked them apart, so the pages showed an
 * asset allocation for a treasury that held nothing and a performance line for
 * capital that had never moved.
 *
 * They are gone. src/lib/series.ts derives the same shapes from decisions the
 * engine actually recorded and returns empty where there is no history, so the
 * pages render an empty state instead of an invented one.
 */
