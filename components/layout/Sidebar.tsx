'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Folder,
  Wrench,
  FileText,
  Settings,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  FileCode,
  Sparkles,
} from 'lucide-react';
import { useUIState } from '@/components/providers/UIStateProvider';
import { Avatar, Eyebrow } from '@/components/ui';
import { MylawLogo } from '@/components/ui/MylawLogo';
import { useCabinetIdentity } from '@/lib/hooks/useCabinetIdentity';
import { cn } from '@/lib/utils';

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const NAV_ITEMS: NavItem[] = [
  { href: '/',          label: 'Tableau de bord', icon: LayoutDashboard },
  { href: '/dossiers',  label: 'Dossiers',        icon: Folder          },
  { href: '/documents', label: 'Documents',       icon: FileText        },
  { href: '/tools',     label: 'Outils',          icon: Wrench          },
  { href: '/templates', label: 'Modèles',         icon: FileCode        },
  { href: '/ai',        label: 'Assistant IA',    icon: Sparkles        },
  { href: '/settings',  label: 'Paramètres',      icon: Settings        },
];

export function Sidebar() {
  const identity = useCabinetIdentity();
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useUIState();

  const isActive = (href: string) =>
    pathname === href || (href !== '/' && pathname.startsWith(href));

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-20 flex h-full flex-col',
        'border-r border-[var(--border-subtle)] bg-[var(--bg-surface)]',
        'transition-[width] duration-fast ease-standard',
        sidebarCollapsed ? 'w-[64px]' : 'w-sidebar',
      )}
    >
      {/* Brand */}
      <div
        className={cn(
          'flex items-center gap-2.5',
          sidebarCollapsed ? 'justify-center px-2' : 'px-4',
          'pt-4 pb-5',
        )}
      >
        <MylawLogo size={28} />
        {!sidebarCollapsed && (
          <span className="font-semibold text-[var(--fg-primary)] tracking-[-0.02em] text-[16px] leading-none">
            Mylaw
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        {!sidebarCollapsed && (
          <Eyebrow className="px-2 pb-2 pt-3">Navigation</Eyebrow>
        )}
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              title={sidebarCollapsed ? label : undefined}
              className={cn(
                'flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-[13px]',
                'transition-colors duration-fast ease-standard',
                active
                  ? 'bg-[var(--brand)] font-semibold text-[var(--fg-on-brand)]'
                  : 'font-medium text-[var(--fg-secondary)] hover:bg-[var(--bg-surface-alt)] hover:text-[var(--fg-primary)]',
                sidebarCollapsed && 'justify-center px-0',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && <span className="truncate">{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Account footer */}
      <div
        className={cn(
          'flex items-center gap-2.5 border-t border-[var(--border-subtle)]',
          sidebarCollapsed ? 'justify-center px-2 py-3' : 'px-3 py-3',
        )}
      >
        <Avatar initials={identity.initials} size={28} variant="brand" />
        {!sidebarCollapsed && (
          <>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-semibold leading-tight text-[var(--fg-primary)]">
                {identity.displayName}
              </div>
              {identity.cabinet && (
                <div className="truncate text-[11px] leading-tight text-[var(--fg-tertiary)]">
                  {identity.cabinet}
                </div>
              )}
            </div>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-[var(--fg-tertiary)]" />
          </>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={toggleSidebar}
        className={cn(
          'flex h-9 items-center justify-center border-t border-[var(--border-subtle)]',
          'text-[var(--fg-tertiary)] transition-colors duration-fast hover:text-[var(--fg-primary)]',
        )}
        aria-label={sidebarCollapsed ? 'Déplier la sidebar' : 'Réduire la sidebar'}
      >
        {sidebarCollapsed ? (
          <ChevronsRight className="h-4 w-4" />
        ) : (
          <ChevronsLeft className="h-4 w-4" />
        )}
      </button>
    </aside>
  );
}
