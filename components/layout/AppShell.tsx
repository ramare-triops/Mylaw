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
    <div className="flex h-screen overflow-hidden bg-[var(--color-surface)]">
      {/* Sidebar */}
      <Sidebar />

      {/* Main */}
      <div
        className={cn(
          'flex flex-col flex-1 min-w-0 transition-all duration-150',
          sidebarCollapsed ? 'ml-[52px]' : 'ml-[var(--sidebar-width)]'
        )}
      >
        <Topbar />
        <TabBar />
        <main className="flex-1 overflow-auto p-0">{children}</main>
      </div>

      {/* Floating AI Panel */}
      <AIPanel />
    </div>
  );
}
