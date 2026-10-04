'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { evaluate, nextState } from './policy-engine';
import { PROFILE_TEMPLATES, DEMO_RECIPIENTS } from './constitutions';
import { seedAgent } from './seed';
import { uid } from './format';
import type {
  Agent, AgentMode, Constitution, Decision, IntentRequest, RiskProfile, Treasury, Workspace,
} from './types';

const KEY = 'nomylax.workspace.v1';

interface State {
  workspace: Workspace | null;
  treasury: Treasury;
  agents: Agent[];
  decisions: Decision[];
  onboarded: boolean;
}

/**
 * A workspace opens with nothing in it.
 *
 * This previously started at $24,732.68 across four fields, which meant every
 * visitor's first dashboard reported a treasury balance, an allocated figure
 * and a reserve that nobody had declared and no wallet held. The number then
 * flowed into the reserve check and the liquidity risk signal, so invented
 * capital was deciding real verdicts.
 *
 * The owner declares the envelope during onboarding instead. Until they do,
 * available is zero and the reserve check refuses everything - which is the
 * correct behaviour for a control plane that has not been told what it guards.
 */
const EMPTY_TREASURY: Treasury = { total: 0, available: 0, allocated: 0, reserve: 0 };

const initial: State = {
  workspace: null,
  treasury: EMPTY_TREASURY,
  agents: [],
  decisions: [],
  onboarded: false,
};

interface Ctx extends State {
  ready: boolean;
  connect: (address: string) => void;
  createWorkspace: (w: Omit<Workspace, 'createdAt'>) => void;
  /** Owner-declared budget envelope. Not a balance read from chain. */
  declareTreasury: (d: { total: number; reserve: number }) => void;
  addAgent: (a: {
    name: string; type: Agent['type']; mode?: AgentMode; endpoint?: string;
    constitution?: Partial<Constitution>; profile?: RiskProfile;
  }) => Agent;
  updateConstitution: (agentId: string, patch: Partial<Constitution>) => void;
  setMode: (agentId: string, mode: AgentMode) => void;
  resetState: (agentId: string) => void;
  submit: (req: IntentRequest, opts?: { simulated?: boolean }) => Decision | null;
  settleDecision: (decisionId: string, signature: string) => void;
  recordDecisions: (d: Decision[]) => void;
  completeOnboarding: () => void;
  hardReset: () => void;
}

const StoreCtx = createContext<Ctx | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>(initial);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setState({ ...initial, ...JSON.parse(raw) });
    } catch {
      /* corrupt or unavailable storage - start clean */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* quota or private mode - the session still works in memory */
    }
  }, [state, ready]);

  const connect = useCallback((address: string) => {
    setState((s) => ({
      ...s,
      workspace: s.workspace ? { ...s.workspace, owner: address } : s.workspace,
    }));
  }, []);

  const createWorkspace = useCallback((w: Omit<Workspace, 'createdAt'>) => {
    setState((s) => ({ ...s, workspace: { ...w, createdAt: Date.now() } }));
  }, []);

  /**
   * Mirrors the delta semantics of PATCH /api/workspace. Raising the declared
   * total is a top-up and adds to available; it does not restore value that has
   * already settled out, which is what assigning available = total would do.
   */
  const declareTreasury: Ctx['declareTreasury'] = useCallback(({ total, reserve }) => {
    setState((s) => {
      const delta = total - s.treasury.total;
      return {
        ...s,
        treasury: {
          ...s.treasury,
          total,
          reserve: Math.min(reserve, total),
          available: Math.max(0, s.treasury.available + delta),
        },
      };
    });
  }, []);

  const addAgent: Ctx['addAgent'] = useCallback((a) => {
    const profile = a.profile ?? 'balanced';
    const agent = seedAgent(uid('agt'), a.name, a.type, {
      mode: a.mode ?? 'shadow',
      endpoint: a.endpoint,
      constitution: {
        ...PROFILE_TEMPLATES[profile],
        approvedRecipients: [...DEMO_RECIPIENTS],
        ...a.constitution,
      },
    });
    setState((s) => ({ ...s, agents: [...s.agents, agent] }));
    return agent;
  }, []);

  const updateConstitution: Ctx['updateConstitution'] = useCallback((agentId, patch) => {
    setState((s) => ({
      ...s,
      agents: s.agents.map((g) =>
        g.id === agentId ? { ...g, constitution: { ...g.constitution, ...patch } } : g,
      ),
    }));
  }, []);

  const setMode: Ctx['setMode'] = useCallback((agentId, mode) => {
    setState((s) => ({
      ...s,
      agents: s.agents.map((g) => (g.id === agentId ? { ...g, mode } : g)),
    }));
  }, []);

  /** Owner action. An agent can drop itself into Safe Mode; only this brings it back. */
  const resetState: Ctx['resetState'] = useCallback((agentId) => {
    setState((s) => ({
      ...s,
      agents: s.agents.map((g) =>
        g.id === agentId ? { ...g, state: 'autonomous', failedCount: 0 } : g,
      ),
    }));
  }, []);

  const submit: Ctx['submit'] = useCallback((req, opts = {}) => {
    let decision: Decision | null = null;
    setState((s) => {
      const agent = s.agents.find((g) => g.id === req.agentId);
      if (!agent) return s;

      const simulated = opts.simulated ?? agent.mode === 'shadow';
      const d = evaluate(agent, req, s.treasury, { simulated });
      decision = d;

      // An "execute" verdict authorises a settlement attempt. It does not count
      // as spend until a wallet-signed Solana transaction returns a signature.
      // This prevents rejected/failed wallet transactions from corrupting spend
      // counters or the displayed treasury envelope.
      const updated: Agent = {
        ...agent,
        failedCount: agent.failedCount + (d.verdict === 'blocked' ? 1 : 0),
        riskScore: d.risk.score,
      };
      updated.state = nextState(updated, d);

      return {
        ...s,
        agents: s.agents.map((g) => (g.id === agent.id ? updated : g)),
        decisions: [d, ...s.decisions].slice(0, 400),
      };
    });
    return decision;
  }, []);

  const settleDecision: Ctx['settleDecision'] = useCallback((decisionId, signature) => {
    setState((s) => {
      const decision = s.decisions.find((d) => d.id === decisionId);
      if (!decision || decision.simulated || decision.verdict !== 'execute' || decision.txHash) return s;

      const amount = decision.request.amount;
      const agent = s.agents.find((a) => a.id === decision.agentId);
      if (!agent) return s;

      return {
        ...s,
        treasury: {
          ...s.treasury,
          total: Math.max(0, s.treasury.total - amount),
          available: Math.max(0, s.treasury.available - amount),
        },
        agents: s.agents.map((a) => a.id === agent.id ? {
          ...a,
          spentToday: a.spentToday + amount,
          spentMonth: a.spentMonth + amount,
        } : a),
        decisions: s.decisions.map((d) => d.id === decisionId ? { ...d, txHash: signature } : d),
      };
    });
  }, []);

  const recordDecisions: Ctx['recordDecisions'] = useCallback((d) => {
    setState((s) => ({ ...s, decisions: [...d, ...s.decisions].slice(0, 400) }));
  }, []);

  const completeOnboarding = useCallback(() => setState((s) => ({ ...s, onboarded: true })), []);

  const hardReset = useCallback(() => {
    localStorage.removeItem(KEY);
    setState(initial);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      ...state, ready, connect, createWorkspace, declareTreasury, addAgent, updateConstitution,
      setMode, resetState, submit, settleDecision, recordDecisions, completeOnboarding, hardReset,
    }),
    [state, ready, connect, createWorkspace, declareTreasury, addAgent, updateConstitution, setMode, resetState, submit, settleDecision, recordDecisions, completeOnboarding, hardReset],
  );

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useWorkspace must be used inside <WorkspaceProvider>');
  return ctx;
}
