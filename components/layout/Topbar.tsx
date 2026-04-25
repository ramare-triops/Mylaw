'use client';

import { useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Bell, ChevronRight, Eye, EyeOff, Moon, Search, Sparkles, Sun } from 'lucide-react';
import { useTheme } from '@/components/providers/ThemeProvider';
import { usePrivacy } from '@/components/providers/PrivacyProvider';
import { GlobalSearch } from '@/components/search/GlobalSearch';
import { cn } from '@/lib/utils';

const SEGMENT_LABEL: Record<string, string> = {
  dossiers: 'Dossiers',
  documents: 'Documents',
  tools: 'Outils',
  templates: 'Modèles',
  settings: 'Paramètres',
  ai: 'Assistant IA',
};

function useBreadcrumb(pathname: string) {
  return useMemo(() => {
    if (pathname === '/' || pathname === '') {
      return [{ label: 'Tableau de bord', href: '/' }];
    }
    const parts = pathname.split('/').filter(Boolean);
    const crumbs: { label: string; href: string }[] = [{ label: 'Mylaw', href: '/' }];
    let acc = '';
    parts.forEach((p) => {
      acc += '/' + p;
      const label = SEGMENT_LABEL[p] ?? decodeURIComponent(p);
      crumbs.push({ label, href: acc });
    });
    return crumbs;
  }, [pathname]);
}

export function Topbar() {
  const pathname = usePathname();
  const crumbs = useBreadcrumb(pathname ?? '/');
  const { resolvedTheme, setTheme } = useTheme();
  const { privacyMode, togglePrivacyMode } = usePrivacy();
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <>
      <header
        className={cn(
          'flex h-topbar shrink-0 items-center gap-4 px-6',
          'border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]',
        )}
      >
        {/* Breadcrumb */}
        <nav
          aria-label="Fil d'Ariane"
          className="flex min-w-0 items-center gap-2 text-[14px] leading-none"
        >
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <div key={`${c.href}-${i}`} className="flex items-center gap-2">
                {i > 0 && <ChevronRight className="h-3 w-3 text-[var(--fg-tertiary)]" />}
                {last ? (
                  <span className="truncate font-semibold text-[var(--fg-primary)]">
                    {c.label}
                  </span>
                ) : (
                  <Link
                    href={c.href}
                    className="truncate font-medium text-[var(--fg-secondary)] transition-colors duration-fast hover:text-[var(--fg-primary)]"
                  >
                    {c.label}
                  </Link>
                )}
              </div>
            );
          })}
        </nav>

        <div className="flex-1" />

        {/* Search trigger */}
        <button
          onClick={() => setSearchOpen(true)}
          className={cn(
            'flex h-8 w-[280px] items-center gap-2 rounded-sm px-2.5',
            'bg-[var(--bg-sunken)] text-[13px] text-[var(--fg-tertiary)]',
            'transition-colors duration-fast hover:text-[var(--fg-secondary)]',
          )}
          aria-label="Recherche globale"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="truncate">Rechercher un dossier, un acte…</span>
          <span className="ml-auto text-[11px] font-medium">⌘ K</span>
        </button>

        {/* Theme toggle */}
        <button
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          className="flex h-8 w-8 items-center justify-center rounded-sm text-[var(--fg-secondary)] transition-colors duration-fast hover:bg-[var(--bg-surface-alt)] hover:text-[var(--fg-primary)]"
          aria-label={resolvedTheme === 'dark' ? 'Mode clair' : 'Mode sombre'}
          title={resolvedTheme === 'dark' ? 'Mode clair' : 'Mode sombre'}
        >
          {resolvedTheme === 'dark' ? (
            <Sun className="h-[18px] w-[18px]" />
          ) : (
            <Moon className="h-[18px] w-[18px]" />
          )}
        </button>

        {/* Privacy / secret professionnel toggle */}
        <button
          onClick={togglePrivacyMode}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-sm transition-colors duration-fast',
            privacyMode
              ? 'bg-[var(--brand-subtle)] text-[var(--brand)] hover:opacity-80'
              : 'text-[var(--fg-secondary)] hover:bg-[var(--bg-surface-alt)] hover:text-[var(--fg-primary)]',
          )}
          aria-pressed={privacyMode}
          aria-label={
            privacyMode
              ? 'Désactiver le mode confidentialité'
              : 'Activer le mode confidentialité'
          }
          title={
            privacyMode
              ? 'Mode confidentialité activé — cliquez pour révéler'
              : 'Mode confidentialité — masquer les noms et données sensibles'
          }
        >
          {privacyMode ? (
            <EyeOff className="h-[18px] w-[18px]" />
          ) : (
            <Eye className="h-[18px] w-[18px]" />
          )}
        </button>

        {/* Notifications */}
        <button
          className="relative flex h-8 w-8 items-center justify-center rounded-sm text-[var(--fg-secondary)] transition-colors duration-fast hover:bg-[var(--bg-surface-alt)] hover:text-[var(--fg-primary)]"
          aria-label="Notifications"
        >
          <Bell className="h-[18px] w-[18px]" />
          <span
            className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full"
            style={{ background: 'var(--accent)' }}
            aria-hidden
          />
        </button>

        {/* AI quick-access */}
        <button
          className={cn(
            'flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-[12px] font-semibold',
            'bg-[var(--brand-subtle)] text-[var(--brand)]',
            'transition-opacity duration-fast hover:opacity-80',
          )}
          aria-label="Assistant IA"
          title="Assistant IA (Alt+I)"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>IA</span>
        </button>
      </header>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
