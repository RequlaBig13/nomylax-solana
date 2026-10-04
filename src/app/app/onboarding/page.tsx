'use client';

import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '@/lib/store';
import { useWallet } from '@/hooks/useWallet';
import { runShadow } from '@/lib/shadow';
import { PROFILE_TEMPLATES, PROFILE_COPY, AGENT_TEMPLATES, DEMO_RECIPIENTS } from '@/lib/constitutions';
import { ConstitutionBuilder } from '@/components/onboarding/ConstitutionBuilder';
import { HelmetMark } from '@/components/ui/Mark';
import { solAmount, shortAddr } from '@/lib/format';
import type { AgentType, Constitution, RiskProfile, ShadowReport, Treasury } from '@/lib/types';
import type { AgentConnectorConfig, ConnectorAuthType, ConnectorInput, ConnectorResponseMode } from '@/lib/connectors';

const STEPS = ['Connect', 'Workspace', 'Agent', 'Configure', 'Constitution', 'Shadow', 'Activate'];

export default function Onboarding() {
  const router = useRouter();
  const { createWorkspace, declareTreasury, addAgent, completeOnboarding, setMode } = useWorkspace();
  const wallet = useWallet();

  const [isMounted, setIsMounted] = useState(false);
  
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const [step, setStep] = useState(0);
  const [wsName, setWsName] = useState('Guardian Treasury');
  const [wsLabel, setWsLabel] = useState('Primary treasury');
  const [profile, setProfile] = useState<RiskProfile>('conservative');

  /**
   * The owner declares the envelope here rather than inheriting a seeded one.
   * This is not decoration: the reserve check and the liquidity risk signal
   * both read treasury.available, so the shadow run in step 6 and every
   * verdict after activation depend on this number being the owner's own.
   */
  const [wsTotal, setWsTotal] = useState('');
  const [wsReserve, setWsReserve] = useState('');

  const declared = useMemo<Treasury>(() => {
    const total = Math.max(0, Number(wsTotal) || 0);
    const reserve = Math.min(Math.max(0, Number(wsReserve) || 0), total);
    return { total, available: total, allocated: 0, reserve };
  }, [wsTotal, wsReserve]);

  const [source, setSource] = useState<'demo' | 'existing' | null>(null);
  const [agentType, setAgentType] = useState<Exclude<AgentType, 'custom'>>('research');
  const [agentName, setAgentName] = useState('Research Scout');
  const [endpoint, setEndpoint] = useState('');
  const [connectorMethod, setConnectorMethod] = useState<'GET' | 'POST'>('POST');
  const [responseMode, setResponseMode] = useState<ConnectorResponseMode>('auto');
  const [authType, setAuthType] = useState<ConnectorAuthType>('env-bearer');
  const [authRef, setAuthRef] = useState('AGENT_API_KEY');
  const [credential, setCredential] = useState('');
  const [headerName, setHeaderName] = useState('x-api-key');
  const [sendContext, setSendContext] = useState(true);
  const [rootPath, setRootPath] = useState('');
  const [amountPath, setAmountPath] = useState('amount');
  const [tokenPath, setTokenPath] = useState('token');
  const [recipientPath, setRecipientPath] = useState('recipient');
  const [purposePath, setPurposePath] = useState('purpose');
  const [verifiedPath, setVerifiedPath] = useState('recipientVerified');
  const [riskPath, setRiskPath] = useState('contractRisk');

  const connectorInput = useMemo<ConnectorInput>(() => {
    const auth = authType === 'none'
      ? { type: 'none' as const }
      : authType === 'env-bearer'
        ? { type: 'env-bearer' as const, secretRef: authRef.trim() || 'AGENT_API_KEY' }
        : authType === 'env-header'
          ? { type: 'env-header' as const, secretRef: authRef.trim(), headerName: headerName.trim() || 'x-api-key' }
          : authType === 'bearer'
            ? { type: 'bearer' as const }
            : { type: 'header' as const, headerName: headerName.trim() || 'x-api-key' };
    return {
      method: connectorMethod,
      sendContext,
      responseMode,
      rootPath: rootPath.trim() || undefined,
      mapping: responseMode === 'mapping' ? {
        amount: amountPath.trim(), token: tokenPath.trim() || undefined,
        recipient: recipientPath.trim(), purpose: purposePath.trim(),
        recipientVerified: verifiedPath.trim() || undefined,
        contractRisk: riskPath.trim() || undefined,
      } : undefined,
      defaultToken: 'SOL',
      auth,
      ...((authType === 'bearer' || authType === 'header') ? { credential } : {}),
    };
  }, [authType, authRef, headerName, connectorMethod, sendContext, responseMode, rootPath, amountPath, tokenPath, recipientPath, purposePath, verifiedPath, riskPath, credential]);

  const connectorPublic = useMemo<AgentConnectorConfig>(() => {
    const { credential: _credential, ...publicConfig } = connectorInput;
    return publicConfig;
  }, [connectorInput]);

  const [constitution, setConstitution] = useState<Constitution>({
    ...PROFILE_TEMPLATES.conservative,
    approvedRecipients: [...DEMO_RECIPIENTS],
  });

  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<ShadowReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const owner = wallet.address;
  const canAdvance = useMemo(() => {
    if (step === 0) return !!owner && wallet.isAuthenticated;
    // A zero envelope fails the reserve check on every request, so letting the
    // owner past this step would produce a shadow run where everything blocks
    // for a reason that has nothing to do with the constitution they wrote.
    if (step === 1) return wsName.trim().length > 1 && declared.total > 0;
    if (step === 2) return source !== null;
    if (step === 3) {
      if (agentName.trim().length <= 1) return false;
      if (source === 'demo') return true;
      if (endpoint.trim().length <= 4) return false;
      if ((authType === 'env-bearer' || authType === 'env-header') && !authRef.trim()) return false;
      if ((authType === 'bearer' || authType === 'header') && !credential.trim()) return false;
      if (responseMode === 'mapping' && (!amountPath.trim() || !recipientPath.trim() || !purposePath.trim())) return false;
      return true;
    }
    if (step === 5) return !!report;
    return true;
  }, [step, owner, wallet.isAuthenticated, wsName, declared.total, source, agentName, endpoint, report, authType, authRef, credential, responseMode, amountPath, recipientPath, purposePath]);

  const applyProfile = (p: RiskProfile) => {
    setProfile(p);
    setConstitution((c) => ({ ...PROFILE_TEMPLATES[p], approvedRecipients: c.approvedRecipients }));
  };

  const chooseTemplate = (t: Exclude<AgentType, 'custom'>) => {
    setAgentType(t);
    setAgentName(AGENT_TEMPLATES[t].name);
    setConstitution((c) => ({ ...c, ...AGENT_TEMPLATES[t].constitution }));
  };

  const runSimulation = async () => {
    setRunning(true); setError(null); setReport(null);
    try {
      const ghost = {
        id: 'preview', name: agentName, type: agentType as AgentType, mode: 'shadow' as const,
        state: 'autonomous' as const, constitution, spentToday: 0, spentMonth: 0,
        failedCount: 0, riskScore: 0, createdAt: Date.now(),
        endpoint: source === 'existing' ? endpoint : undefined,
      };
      const r = await runShadow(ghost, declared, {
        requests: 14,
        previewConnector: source === 'existing' ? connectorInput : undefined,
      });
      setReport(r);
    } catch (e: any) {
      setError(e?.message ?? 'Simulation could not complete.');
    } finally {
      setRunning(false);
    }
  };

  const [activating, setActivating] = useState(false);

  const activate = async () => {
    setActivating(true); setError(null);
    try {
      const wsRes = await fetch('/api/workspace', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: wsName, treasuryLabel: wsLabel, riskProfile: profile }),
      });
      if (!wsRes.ok) throw new Error((await wsRes.json().catch(() => ({}))).error ?? 'Workspace could not be saved');

      const treasuryRes = await fetch('/api/workspace', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: wsName, treasuryLabel: wsLabel, riskProfile: profile, total: declared.total, reserve: declared.reserve }),
      });
      if (!treasuryRes.ok) throw new Error((await treasuryRes.json().catch(() => ({}))).error ?? 'Treasury envelope could not be saved');

      const agentRes = await fetch('/api/agents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: agentName, type: agentType, mode: 'live', constitution,
          ...(source === 'existing' ? { endpoint, connector: connectorInput } : {}),
        }),
      });
      const agentBody = await agentRes.json().catch(() => ({}));
      if (!agentRes.ok) throw new Error(agentBody.error ?? 'Agent could not be saved');

      createWorkspace({
        name: wsName, treasuryLabel: wsLabel, riskProfile: profile,
        network: wallet.chainName, owner: owner ?? null,
      });
      declareTreasury({ total: declared.total, reserve: declared.reserve });
      const agent = addAgent({
        id: agentBody.agent.id,
        name: agentName, type: agentType, mode: 'live', profile, constitution,
        endpoint: source === 'existing' ? endpoint : undefined,
        connector: source === 'existing' ? connectorPublic : undefined,
      });
      setMode(agent.id, 'live');
      completeOnboarding();
      router.push('/app/overview');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Activation could not complete');
    } finally {
      setActivating(false);
    }
  };


  if (!isMounted) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--text-3)' }}>Loading workspace...</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* header */}
      <div style={{ borderBottom: '1px solid var(--line)', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <HelmetMark size={26} />
          <span className="caps" style={{ fontSize: 13 }}>Nomylax</span>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className="caps" style={{
                fontSize: 9.5, padding: '5px 9px', borderRadius: 2,
                color: i === step ? '#D4AF37' : i < step ? 'var(--text-2)' : 'var(--text-3)',
                border: `1px solid ${i === step ? 'var(--line-gold)' : 'transparent'}`,
                background: i === step ? 'rgba(212,175,55,0.06)' : 'transparent',
              }}>{i + 1} {s}</span>
              {i < STEPS.length - 1 ? <span style={{ width: 10, height: 1, background: i < step ? '#D4AF37' : 'var(--line-2)' }} /> : null}
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, padding: '36px 24px 24px', maxWidth: 1180, width: '100%', marginInline: 'auto' }}>
        {step === 0 ? <StepConnect wallet={wallet} /> : null}

        {step === 1 ? (
          <Step title="Create your workspace" sub="A workspace holds one treasury and every agent drawing on it.">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 18, maxWidth: 760 }}>
              <label className="field"><span style={{ fontSize: 13 }}>Workspace name</span>
                <input className="input" value={wsName} onChange={(e) => setWsName(e.target.value)} />
              </label>
              <label className="field"><span style={{ fontSize: 13 }}>Treasury label</span>
                <input className="input" value={wsLabel} onChange={(e) => setWsLabel(e.target.value)} />
              </label>
              <label className="field"><span style={{ fontSize: 13 }}>Network</span>
                <input className="input" value={wallet.chainName} readOnly style={{ color: 'var(--text-3)' }} />
                <span className="hint">Set by NEXT_PUBLIC_SOLANA_NETWORK and NEXT_PUBLIC_SOLANA_RPC_URL.</span>
              </label>
            </div>

            <div style={{ marginTop: 28, maxWidth: 760 }}>
              <div className="label" style={{ marginBottom: 12 }}>Declare the treasury envelope</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 18 }}>
                <label className="field"><span style={{ fontSize: 13 }}>Treasury envelope (SOL)</span>
                  <input
                    className="input num-input" inputMode="decimal" placeholder="0.00"
                    value={wsTotal} onChange={(e) => setWsTotal(e.target.value.replace(/[^0-9.]/g, ''))}
                  />
                  <span className="hint">
                    The amount you are putting under agent control. Nomylax does not take custody
                    and does not read your wallet balance, so this figure is yours to state.
                  </span>
                </label>
                <label className="field"><span style={{ fontSize: 13 }}>Emergency reserve (SOL)</span>
                  <input
                    className="input num-input" inputMode="decimal" placeholder="0.00"
                    value={wsReserve} onChange={(e) => setWsReserve(e.target.value.replace(/[^0-9.]/g, ''))}
                  />
                  <span className="hint">A floor no agent can spend below. Capped at the total.</span>
                </label>
              </div>
              {declared.total > 0 ? (
                <div className="num" style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 14 }}>
                  Spendable after reserve: {solAmount(Math.max(declared.total - declared.reserve, 0))}
                </div>
              ) : null}
            </div>

            <div style={{ marginTop: 28 }}>
              <div className="label" style={{ marginBottom: 12 }}>Default risk profile</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
                {(Object.keys(PROFILE_TEMPLATES) as RiskProfile[]).map((p) => (
                  <button key={p} type="button" onClick={() => applyProfile(p)} className="card" style={{
                    textAlign: 'left', padding: 18, cursor: 'pointer',
                    borderColor: profile === p ? 'var(--line-gold)' : 'var(--line)',
                    background: profile === p ? 'rgba(212,175,55,0.05)' : '#151A26',
                  }}>
                    <div className="caps" style={{ fontSize: 11, color: profile === p ? '#D4AF37' : 'var(--text-2)' }}>{PROFILE_COPY[p].title}</div>
                    <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 10 }}>{PROFILE_COPY[p].body}</p>
                    <div className="num" style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 12 }}>
                      {solAmount(PROFILE_TEMPLATES[p].dailyLimit, 0)}/day · {solAmount(PROFILE_TEMPLATES[p].maxTransaction, 0)} max
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </Step>
        ) : null}

        {step === 2 ? (
          <Step title="Add your first agent" sub="Bring an agent you already run, or start with one that works immediately.">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16, maxWidth: 820 }}>
              <button type="button" onClick={() => setSource('existing')} className="card" style={{ textAlign: 'left', padding: 22, cursor: 'pointer', borderColor: source === 'existing' ? 'var(--line-gold)' : 'var(--line)' }}>
                <span className="badge info">For developers</span>
                <div className="display" style={{ fontSize: 21, marginTop: 14 }}>Connect existing agent</div>
                <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 10 }}>Register an agent endpoint. Credentials stay in server environment variables and are never sent to the browser.</p>
              </button>
              <button type="button" onClick={() => setSource('demo')} className="card" style={{ textAlign: 'left', padding: 22, cursor: 'pointer', borderColor: source === 'demo' ? 'var(--line-gold)' : 'var(--line)' }}>
                <span className="badge gold">No setup</span>
                <div className="display" style={{ fontSize: 21, marginTop: 14 }}>Try a demo agent</div>
                <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 10 }}>A generated agent that submits realistic requests, including ones it should not be allowed to make. Works with no external infrastructure.</p>
              </button>
            </div>
          </Step>
        ) : null}

        {step === 3 ? (
          <Step title={source === 'demo' ? 'Choose a demo agent' : 'Configure the connection'} sub={source === 'demo' ? 'Each template arrives with sensible starting limits you can edit next.' : 'Nomylax polls this endpoint for economic intents. The endpoint is stored against the agent and validated before every call.'}>
            {source === 'demo' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12, maxWidth: 900 }}>
                {(Object.keys(AGENT_TEMPLATES) as Exclude<AgentType, 'custom'>[]).map((t) => (
                  <button key={t} type="button" onClick={() => chooseTemplate(t)} className="card" style={{
                    textAlign: 'left', padding: 18, cursor: 'pointer',
                    borderColor: agentType === t ? 'var(--line-gold)' : 'var(--line)',
                  }}>
                    <div className="caps" style={{ fontSize: 10.5, color: agentType === t ? '#D4AF37' : 'var(--text-3)' }}>{t}</div>
                    <div style={{ fontSize: 15, marginTop: 10 }}>{AGENT_TEMPLATES[t].name}</div>
                    <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>{AGENT_TEMPLATES[t].blurb}</p>
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ maxWidth: 920 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 18 }}>
                  <label className="field"><span style={{ fontSize: 13 }}>Agent type</span>
                    <select className="select" value={agentType} onChange={(e) => setAgentType(e.target.value as any)}>
                      {Object.keys(AGENT_TEMPLATES).map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </label>
                  <label className="field"><span style={{ fontSize: 13 }}>HTTPS endpoint</span>
                    <input className="input" placeholder="https://agent.example.com/actions" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
                    <span className="hint">Any public HTTPS JSON endpoint. Private networks and metadata hosts are refused.</span>
                  </label>
                  <label className="field"><span style={{ fontSize: 13 }}>Request method</span>
                    <select className="select" value={connectorMethod} onChange={(e) => setConnectorMethod(e.target.value as 'GET' | 'POST')}>
                      <option value="POST">POST</option><option value="GET">GET</option>
                    </select>
                  </label>
                  <label className="field"><span style={{ fontSize: 13 }}>Response adapter</span>
                    <select className="select" value={responseMode} onChange={(e) => setResponseMode(e.target.value as ConnectorResponseMode)}>
                      <option value="auto">Auto JSON normalization</option>
                      <option value="native">Nomylax native intents</option>
                      <option value="mapping">Custom JSON mapping</option>
                    </select>
                  </label>
                  <label className="field"><span style={{ fontSize: 13 }}>Authentication</span>
                    <select className="select" value={authType} onChange={(e) => setAuthType(e.target.value as ConnectorAuthType)}>
                      <option value="none">None</option>
                      <option value="env-bearer">Bearer · server env reference</option>
                      <option value="env-header">API key header · server env reference</option>
                      <option value="bearer">Bearer · save encrypted credential</option>
                      <option value="header">API key header · save encrypted credential</option>
                    </select>
                  </label>
                  {(authType === 'env-bearer' || authType === 'env-header') ? (
                    <label className="field"><span style={{ fontSize: 13 }}>Server secret reference</span>
                      <input className="input num-input" value={authRef} onChange={(e) => setAuthRef(e.target.value.toUpperCase())} />
                      <span className="hint">Must start with AGENT_ or NOMYLAX_AGENT_. The secret value never enters browser state.</span>
                    </label>
                  ) : null}
                  {(authType === 'bearer' || authType === 'header') ? (
                    <label className="field"><span style={{ fontSize: 13 }}>API credential</span>
                      <input className="input" type="password" autoComplete="off" value={credential} onChange={(e) => setCredential(e.target.value)} />
                      <span className="hint">Sent once over HTTPS and encrypted server-side with the session secret. It is never returned by the API.</span>
                    </label>
                  ) : null}
                  {(authType === 'env-header' || authType === 'header') ? (
                    <label className="field"><span style={{ fontSize: 13 }}>API key header name</span>
                      <input className="input" placeholder="x-api-key" value={headerName} onChange={(e) => setHeaderName(e.target.value)} />
                    </label>
                  ) : null}
                  <label className="field"><span style={{ fontSize: 13 }}>Intent collection path (optional)</span>
                    <input className="input" placeholder="payload.actions" value={rootPath} onChange={(e) => setRootPath(e.target.value)} />
                    <span className="hint">Leave blank in Auto mode. Use a dotted path when your API nests the action list.</span>
                  </label>
                  <label className="field"><span style={{ fontSize: 13 }}>Request context</span>
                    <select className="select" value={sendContext ? 'yes' : 'no'} onChange={(e) => setSendContext(e.target.value === 'yes')}>
                      <option value="yes">Send agentId + count</option><option value="no">Send no Nomylax context</option>
                    </select>
                  </label>
                </div>

                {responseMode === 'mapping' ? (
                  <div className="card" style={{ padding: 18, marginTop: 18 }}>
                    <div className="label" style={{ marginBottom: 14 }}>Custom response mapping</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12 }}>
                      <label className="field"><span>Amount path</span><input className="input" value={amountPath} onChange={(e) => setAmountPath(e.target.value)} /></label>
                      <label className="field"><span>Token path</span><input className="input" value={tokenPath} onChange={(e) => setTokenPath(e.target.value)} /></label>
                      <label className="field"><span>Recipient path</span><input className="input" value={recipientPath} onChange={(e) => setRecipientPath(e.target.value)} /></label>
                      <label className="field"><span>Purpose path</span><input className="input" value={purposePath} onChange={(e) => setPurposePath(e.target.value)} /></label>
                      <label className="field"><span>Verified path</span><input className="input" value={verifiedPath} onChange={(e) => setVerifiedPath(e.target.value)} /></label>
                      <label className="field"><span>Risk path</span><input className="input" value={riskPath} onChange={(e) => setRiskPath(e.target.value)} /></label>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            <label className="field" style={{ maxWidth: 360, marginTop: 24 }}>
              <span style={{ fontSize: 13 }}>Agent name</span>
              <input className="input" value={agentName} onChange={(e) => setAgentName(e.target.value)} />
            </label>
          </Step>
        ) : null}

        {step === 4 ? (
          <Step title="Write the financial constitution" sub="These rules are evaluated on every request, in order, before anything settles.">
            <ConstitutionBuilder value={constitution} agentName={agentName} onChange={(patch) => setConstitution((c) => ({ ...c, ...patch }))} />
          </Step>
        ) : null}

        {step === 5 ? (
          <Step title="Run shadow mode" sub="The agent runs its real logic against real policy. Nothing settles and no capital moves.">
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.1fr)', gap: 24, alignItems: 'start' }}>
              <div className="card card-bd">
                <p style={{ fontSize: 13.5, color: 'var(--text-2)' }}>
                  Nomylax will request 14 economic intents from <strong style={{ color: '#E6EAF2' }}>{agentName}</strong> and evaluate each one against the constitution you just wrote. Budgets deplete exactly as they would in production.
                </p>
                <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={runSimulation} disabled={running}>
                  {running ? 'Simulating…' : report ? 'Run again' : 'Run simulation'}
                </button>
                {error ? <p style={{ color: '#FF5C6C', fontSize: 12.5, marginTop: 14 }}>{error}</p> : null}
              </div>
              {report ? <ShadowCard report={report} /> : (
                <div className="card card-bd" style={{ color: 'var(--text-3)', fontSize: 13 }}>
                  No report yet. Run the simulation to see what this agent would have done with your money.
                </div>
              )}
            </div>
          </Step>
        ) : null}

        {step === 6 ? (
          <Step title="Review and activate" sub="After activation the agent operates autonomously inside this boundary, and only inside it.">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 1, background: 'var(--line)', border: '1px solid var(--line)', maxWidth: 900 }}>
              {[
                ['Agent', agentName],
                ['Source', source === 'demo' ? 'Demo agent' : 'Connected endpoint'],
                ['Treasury declared', solAmount(declared.total)],
                ['Policy profile', PROFILE_COPY[profile].title],
                ['Daily budget', solAmount(constitution.dailyLimit)],
                ['Max transaction', solAmount(constitution.maxTransaction)],
                ['Emergency reserve', solAmount(constitution.emergencyReserve)],
                ['Shadow result', report ? report.recommendation.toUpperCase() : 'NOT RUN'],
                ['Network', wallet.chainName],
                ['Owner', owner ? shortAddr(owner) : '-'],
              ].map(([k, v]) => (
                <div key={k} style={{ background: '#0B1020', padding: 18 }}>
                  <div className="label">{k}</div>
                  <div className="num" style={{ fontSize: 15, marginTop: 8, color: '#E6EAF2' }}>{v}</div>
                </div>
              ))}
            </div>

            {report && report.recommendation !== 'safe' ? (
              <div className="card" style={{ marginTop: 20, borderColor: 'rgba(232,176,75,0.3)', background: 'rgba(232,176,75,0.05)', padding: 16, maxWidth: 900 }}>
                <div className="label" style={{ color: '#E8B04B' }}>Shadow run flagged this agent</div>
                <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 8 }}>{report.notes.join(' ')}</p>
                <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 8 }}>You can still activate. Every limit above will hold regardless.</p>
              </div>
            ) : null}

            <button className="btn btn-primary" style={{ marginTop: 26, padding: '14px 26px' }} onClick={activate} disabled={activating}>
              {activating ? 'Saving protected agent…' : 'Enable protected autonomous mode'}
            </button>
            {error ? <p style={{ color: '#FF5C6C', fontSize: 12.5, marginTop: 14 }}>{error}</p> : null}
          </Step>
        ) : null}
      </div>

      {/* footer nav */}
      <div style={{ borderTop: '1px solid var(--line)', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', gap: 12, position: 'sticky', bottom: 0, background: 'rgba(11,16,32,0.9)', backdropFilter: 'blur(10px)' }}>
        <button className="btn btn-ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>Back</button>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className="label">Step {step + 1} of {STEPS.length}</span>
          {step < STEPS.length - 1 ? (
            <button className="btn btn-primary" onClick={() => setStep((s) => s + 1)} disabled={!canAdvance}>Continue</button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Step({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="anim-in">
      <h1 className="display" style={{ fontSize: 34, margin: 0 }}>{title}</h1>
      <p style={{ color: 'var(--text-3)', fontSize: 14, marginTop: 10, maxWidth: '68ch' }}>{sub}</p>
      <div style={{ marginTop: 30 }}>{children}</div>
    </div>
  );
}

function StepConnect({ wallet }: { wallet: ReturnType<typeof useWallet> }) {
  const { status, address, error, connect, signIn, chainName, hasProvider, network } = wallet;
  return (
    <Step title="Connect your Solana wallet" sub="Your wallet establishes ownership of the treasury. Nomylax does not take custody and does not require unrestricted control of your funds.">
      <div className="card" style={{ maxWidth: 560, padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span className="label">Connection state</span>
          <span className={`badge ${status === 'authenticated' ? 'ok' : status === 'error' ? 'bad' : ''}`}>
            {status === 'authenticated' ? 'Signed in'
              : status === 'connected' ? 'Connected, not signed in'
              : status === 'authenticating' ? 'Awaiting signature'
              : status === 'connecting' ? 'Connecting'
              : status === 'error' ? 'Error' : 'Not connected'}
          </span>
        </div>
        <div style={{ marginTop: 14 }}>
          <span className={`badge ${network.isTestnet ? 'warn' : 'gold'}`}>
            {network.label}{network.isTestnet ? ' · test environment' : ' · mainnet'}
          </span>
        </div>

        {address ? (
          <div className="num" style={{ fontSize: 14, marginTop: 18, color: '#E6EAF2', wordBreak: 'break-all' }}>{address}</div>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 18 }}>
            {hasProvider ? `Choose a Wallet Standard wallet. Nomylax binds transactions to ${chainName}.` : 'No Wallet Standard-compatible Solana wallet was detected in this browser.'}
          </p>
        )}

        {error ? <p style={{ color: '#FF5C6C', fontSize: 12.5, marginTop: 14 }}>{error}</p> : null}

        <div style={{ display: 'flex', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
          {!address ? (
            <button className="btn btn-primary" onClick={() => connect()} disabled={status === 'connecting'}>
              {status === 'connecting' ? 'Connecting' : 'Connect Solana wallet'}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={signIn} disabled={status === 'authenticating' || status === 'authenticated'}>
              {status === 'authenticated' ? 'Signed in' : status === 'authenticating' ? 'Check your wallet' : 'Sign in with this wallet'}
            </button>
          )}
        </div>
        <p className="hint" style={{ marginTop: 14 }}>
          Connecting grants Nomylax no custody. Every live Devnet settlement still requires the connected wallet to sign the transaction.
        </p>
      </div>
    </Step>
  );
}

function ShadowCard({ report }: { report: ShadowReport }) {
  const tone = report.recommendation === 'safe' ? 'ok' : report.recommendation === 'review' ? 'warn' : 'bad';
  const rows: [string, string, string?][] = [
    ['Requested', solAmount(report.requested)],
    ['Would approve', solAmount(report.wouldApprove), 'ok'],
    ['Would block', solAmount(report.wouldBlock), 'bad'],
    ['Policy violations', String(report.violations), 'warn'],
    ['Critical events', String(report.criticalEvents), 'bad'],
    ['Estimated monthly burn', solAmount(report.monthlyBurn, 0)],
    ...(report.haltedAfter !== null
      ? ([['Safe mode triggered', `After request ${report.haltedAfter}`, 'bad']] as [string, string, string][])
      : []),
  ];
  return (
    <div className="card anim-in">
      <div className="card-hd">
        <span className="label">24-hour shadow report</span>
        <span className={`badge ${tone}`}><i />{report.recommendation}</span>
      </div>
      <div style={{ display: 'flex', height: 6, margin: 18, background: '#1F2433', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${(report.wouldApprove / Math.max(report.requested, 1)) * 100}%`, background: '#3FD08A' }} />
        <div style={{ width: `${(report.wouldBlock / Math.max(report.requested, 1)) * 100}%`, background: '#FF5C6C' }} />
      </div>
      <div className="card-bd" style={{ paddingTop: 0 }}>
        {rows.map(([k, v, t]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{k}</span>
            <span className="num" style={{ fontSize: 15, color: t === 'ok' ? '#3FD08A' : t === 'bad' ? '#FF5C6C' : t === 'warn' ? '#E8B04B' : '#E6EAF2' }}>{v}</span>
          </div>
        ))}
        <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 14 }}>{report.notes.join(' ')}</p>
      </div>
    </div>
  );
}
