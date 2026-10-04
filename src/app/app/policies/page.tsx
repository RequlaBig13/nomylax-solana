'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useWorkspace } from '@/lib/store';
import { ConstitutionBuilder } from '@/components/onboarding/ConstitutionBuilder';
import { PageHead, Empty } from '@/components/ui/Bits';

export default function Policies() {
  const { agents, updateConstitution, ready } = useWorkspace();
  const [sel, setSel] = useState('');
  const [saved, setSaved] = useState(false);

  if (!ready) return null;
  if (!agents.length) {
    return <Empty title="No constitutions to edit" body="Policies belong to agents. Add an agent and its Financial Constitution is created with it." action={<Link className="btn btn-primary" href="/app/onboarding">Add an agent</Link>} />;
  }

  const agent = agents.find((a) => a.id === sel) ?? agents[0];

  return (
    <>
      <PageHead
        title="Policies"
        sub="Edits create a new version. Existing decisions keep the policy version that produced them."
        actions={
          <select className="select" style={{ width: 220 }} value={agent.id} onChange={(e) => { setSel(e.target.value); setSaved(false); }}>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        }
      />
      {saved ? <div className="badge ok" style={{ marginBottom: 14 }}><i />Saved</div> : null}
      <ConstitutionBuilder
        value={agent.constitution}
        agentName={agent.name}
        onChange={(patch) => { updateConstitution(agent.id, patch); setSaved(true); }}
      />
    </>
  );
}
