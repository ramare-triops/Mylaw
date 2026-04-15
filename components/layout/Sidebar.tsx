'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FileText,
  Wrench,
  FileCode,
  Sparkles,
  Settings,
  ChevronLeft,
  ChevronRight,
  Scale,
} from 'lucide-react';
import { useUIState } from '@/components/providers/UIStateProvider';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/', label: 'Tableau de bord', icon: LayoutDashboard },
  { href: '/documents', label: 'Documents', icon: FileText },
  { href: '/tools', label: 'Outils', icon: Wrench },
  { href: '/templates', label: 'Mod\u00e8les', icon: FileCode },
  { href: '/ai', label: 'Intelligence IA', icon: Sparkles },
  { href: '/settings', label: 'Param\u00e8tres', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useUIState();

  return (
    <aside
      className={cn(
        'fixed top-0 left-0 h-full flex flex-col z-20 transition-all duration-150',
        'bg-[var(--color-sidebar)] border-r border-[var(--color-border)]',
        sidebarCollapsed ? 'w-[52px]' : 'w-[var(--sidebar-width)]'
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          'flex items-center gap-2 px-3 border-b border-[var(--color-border)]',
          'h-[var(--topbar-height)]'
        )}
      >
        <Scale className="w-5 h-5 text-[var(--color-primary)] flex-shrink-0" />
        {!sidebarCollapsed && (
          <span className="font-bold text-[var(--color-primary)] tracking-tight text-base">
            Mylaw
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 mx-1 rounded-md text-sm transition-colors duration-100 min-h-[44px]',
                'hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text)]',
                active
                  ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)] font-medium'
                  : 'text-[var(--color-text-muted)]'
              )}
              title={sidebarCollapsed ? label : undefined}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {!sidebarCollapsed && <span className="truncate">{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={toggleSidebar}
        className={cn(
          'flex items-center justify-center h-10 border-t border-[var(--color-border)]',
          'text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors'
        )}
        aria-label={sidebarCollapsed ? 'D\u00e9plier la sidebar' : 'R\u00e9duire la sidebar'}
      >
        {sidebarCollapsed ? (
          <ChevronRight className="w-4 h-4" />
        ) : (
          <ChevronLeft className="w-4 h-4" />
        )}
      </button>
    </aside>
  );
}
