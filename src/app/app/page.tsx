'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '@/lib/store';

export default function AppIndex() {
  const router = useRouter();
  const { ready, onboarded, agents } = useWorkspace();

  useEffect(() => {
    if (!ready) return;
    router.replace(onboarded && agents.length ? '/app/overview' : '/app/onboarding');
  }, [ready, onboarded, agents.length, router]);

  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '60vh', color: 'var(--text-3)', fontSize: 13 }}>
      Loading workspace…
    </div>
  );
}
