'use client';

import { PROFILE_TEMPLATES, PROFILE_COPY } from '@/lib/constitutions';
import type { Constitution, RiskProfile } from '@/lib/types';
import { solAmount } from '@/lib/format';

const FIELDS: {
  key: keyof Constitution; label: string; hint: string; prefix?: string; suffix?: string; step?: number;
}[] = [
  { key: 'dailyLimit', label: 'Daily spend limit', hint: 'Resets at midnight UTC. The agent cannot exceed this in a single day, whatever it decides.', suffix: ' SOL' },
  { key: 'maxTransaction', label: 'Maximum transaction', hint: 'The largest single action allowed. This is the size of the worst mistake the agent can make at once.', suffix: ' SOL' },
  { key: 'monthlyLimit', label: 'Monthly spend limit', hint: 'A ceiling across the whole billing month, independent of daily pacing.', suffix: ' SOL' },
  { key: 'emergencyReserve', label: 'Emergency reserve', hint: 'Capital held outside agent authority. No approval can reduce the treasury below this line.', suffix: ' SOL' },
  { key: 'failedTxThreshold', label: 'Failed transaction threshold', hint: 'Consecutive refusals before the agent is dropped into Safe Mode.' },
  { key: 'velocityThreshold', label: 'Spend velocity threshold', hint: 'Percentage of the daily pace that triggers Safe Mode. 200% means twice the expected rate.', suffix: '%' },
  { key: 'riskThreshold', label: 'Risk threshold (NRS)', hint: 'Any action scoring above this is refused. Lower is stricter.' },
  { key: 'permissionExpiryDays', label: 'Permission expiry', hint: 'Delegated spend permission expires after this many days and must be renewed by the owner.', suffix: ' days' },
];

export function ConstitutionBuilder({
  value, onChange, agentName, showTemplates = true,
}: {
  value: Constitution;
  onChange: (patch: Partial<Constitution>) => void;
  agentName: string;
  showTemplates?: boolean;
}) {
  const applyTemplate = (p: RiskProfile) => onChange({ ...PROFILE_TEMPLATES[p], approvedRecipients: value.approvedRecipients });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.35fr) minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
      <div style={{ display: 'grid', gap: 18 }}>
        {showTemplates ? (
          <div className="card">
            <div className="card-hd"><span className="label">Start from a profile</span></div>
            <div className="card-bd" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
              {(Object.keys(PROFILE_TEMPLATES) as RiskProfile[]).map((p) => (
                <button key={p} type="button" className="btn btn-ghost" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 5, padding: 14, textAlign: 'left', height: '100%' }} onClick={() => applyTemplate(p)}>
                  <span className="caps" style={{ fontSize: 11, color: '#D4AF37' }}>{PROFILE_COPY[p].title}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 400, whiteSpace: 'normal', lineHeight: 1.45 }}>{PROFILE_COPY[p].body}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="card">
          <div className="card-hd"><span className="label">Limits</span></div>
          <div className="card-bd" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 18 }}>
            {FIELDS.map((f) => (
              <label key={f.key} className="field">
                <span style={{ fontSize: 13 }}>{f.label}</span>
                <div style={{ position: 'relative' }}>
                  {f.prefix ? <span className="num" style={{ position: 'absolute', left: 11, top: 10, color: 'var(--text-3)', fontSize: 13 }}>{f.prefix}</span> : null}
                  <input
                    className="input num-input" type="number" min={0} step={f.step ?? 0.001}
                    style={{ paddingLeft: f.prefix ? 24 : 12 }}
                    value={value[f.key] as number}
                    onChange={(e) => onChange({ [f.key]: Number(e.target.value) } as Partial<Constitution>)}
                  />
                  {f.suffix ? <span className="num" style={{ position: 'absolute', right: 11, top: 10, color: 'var(--text-3)', fontSize: 12 }}>{f.suffix}</span> : null}
                </div>
                <span className="hint">{f.hint}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-hd"><span className="label">Recipients & assets</span></div>
          <div className="card-bd" style={{ display: 'grid', gap: 18 }}>
            <label className="field">
              <span style={{ fontSize: 13 }}>Allowed tokens</span>
              <input
                className="input" value={value.allowedTokens.join(', ')}
                onChange={(e) => onChange({ allowedTokens: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })}
              />
              <span className="hint">Comma separated. Any asset not listed here is refused before anything else is evaluated.</span>
            </label>

            <label className="field">
              <span style={{ fontSize: 13 }}>Approved recipients</span>
              <textarea
                className="textarea" rows={4} style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
                value={value.approvedRecipients.join('\n')}
                onChange={(e) => onChange({ approvedRecipients: e.target.value.split('\n').map((t) => t.trim()).filter(Boolean) })}
              />
              <span className="hint">One address per line.</span>
            </label>

            <label className="field">
              <span style={{ fontSize: 13 }}>Unknown recipient behaviour</span>
              <select className="select" value={value.unknownRecipient} onChange={(e) => onChange({ unknownRecipient: e.target.value as Constitution['unknownRecipient'] })}>
                <option value="block">Block: refuse outright</option>
                <option value="review">Review: hold for owner decision</option>
                <option value="allow">Allow: permit any recipient</option>
              </select>
              <span className="hint">
                {value.unknownRecipient === 'allow'
                  ? 'Warning: with this setting a hallucinated address will pass the recipient check.'
                  : 'Applies to any address not on the approved list above.'}
              </span>
            </label>
          </div>
        </div>
      </div>

      <ConstitutionSummary value={value} agentName={agentName} />
    </div>
  );
}

export function ConstitutionSummary({ value, agentName }: { value: Constitution; agentName: string }) {
  const rows: [string, string][] = [
    ['Daily', solAmount(value.dailyLimit)],
    ['Single transaction', solAmount(value.maxTransaction)],
    ['Monthly', solAmount(value.monthlyLimit)],
    ['Reserve', `${solAmount(value.emergencyReserve)} · locked`],
    ['Assets', value.allowedTokens.join(' · ') || '-'],
    ['Approved recipients', String(value.approvedRecipients.length)],
    ['Unknown recipient', value.unknownRecipient.toUpperCase()],
    ['Critical risk', `Above ${value.riskThreshold} NRS → BLOCK`],
    [`${value.failedTxThreshold} failures`, 'SAFE MODE'],
    [`Velocity > ${value.velocityThreshold}%`, 'SAFE MODE'],
    ['Permission expiry', `${value.permissionExpiryDays} days`],
  ];

  return (
    <div className="card" style={{ position: 'sticky', top: 84 }}>
      <div className="card-hd">
        <span className="label">Financial constitution</span>
        <span className="badge gold">Live</span>
      </div>
      <div className="card-bd" style={{ paddingTop: 14 }}>
        <div className="display" style={{ fontSize: 20 }}>{agentName || 'Unnamed agent'}</div>
        <div style={{ marginTop: 14 }}>
          {rows.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '10px 0', borderBottom: '1px solid var(--line)', fontSize: 12.5 }}>
              <span style={{ color: 'var(--text-3)' }}>{k}</span>
              <span className="num" style={{ color: '#E6EAF2', textAlign: 'right' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
