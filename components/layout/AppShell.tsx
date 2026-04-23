'use client';

import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { TabBar } from './TabBar';
import { AIPanel } from '@/components/ai/AIPanel';
import { useUIState } from '@/components/providers/UIStateProvider';
import { cn } from '@/lib/utils';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { sidebarCollapsed } = useUIState();

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg-canvas)]">
      <Sidebar />

      <div
        className={cn(
          'flex min-w-0 flex-1 flex-col',
          'transition-[margin] duration-fast ease-standard',
          sidebarCollapsed ? 'ml-[64px]' : 'ml-sidebar',
        )}
      >
        <Topbar />
        <TabBar />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>

      <AIPanel />
    </div>
  );
}
