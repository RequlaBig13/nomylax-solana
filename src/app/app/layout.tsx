'use client';

import { usePathname } from 'next/navigation';
import { WorkspaceProvider } from '@/lib/store';
import { Sidebar } from '@/components/shell/Sidebar';
import { Topbar } from '@/components/shell/Topbar';
import { NetworkBanner } from '@/components/shell/NetworkBanner';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const bare = path.startsWith('/app/onboarding');

  return (
    <WorkspaceProvider>
      <NetworkBanner />
      {bare ? <main className="onboarding-shell">{children}</main> : (
        <div className="app-shell">
          <Sidebar />
          <div className="app-main"><Topbar /><main className="app-content">{children}</main></div>
        </div>
      )}
    </WorkspaceProvider>
  );
}
