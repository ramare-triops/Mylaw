'use client';

import { useState, useCallback } from 'react';
import { Search, Sun, Moon, Sparkles } from 'lucide-react';
import { useTheme } from '@/components/providers/ThemeProvider';
import { GlobalSearch } from '@/components/search/GlobalSearch';
import { cn } from '@/lib/utils';

export function Topbar() {
  const { resolvedTheme, setTheme } = useTheme();
  const [searchOpen, setSearchOpen] = useState(false);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    },
    []
  );

  // Global Cmd+K listener
  if (typeof window !== 'undefined') {
    // handled in GlobalSearch component
  }

  return (
    <>
      <header
        className={cn(
          'flex items-center gap-3 px-4 h-[var(--topbar-height)] flex-shrink-0',
          'bg-[var(--color-surface-raised)] border-b border-[var(--color-border)]'
        )}
      >
        {/* Search trigger */}
        <button
          onClick={() => setSearchOpen(true)}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm flex-1 max-w-xs',
            'bg-[var(--color-surface)] border border-[var(--color-border)]',
            'text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors'
          )}
          aria-label="Recherche globale"
        >
          <Search className="w-3.5 h-3.5" />
          <span>Rechercher&hellip;</span>
          <kbd className="ml-auto text-xs opacity-50">Cmd K</kbd>
        </button>

        <div className="flex-1" />

        {/* Theme toggle */}
        <button
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          className={cn(
            'p-2 rounded-md transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center',
            'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)]'
          )}
          aria-label="Basculer thème"
        >
          {resolvedTheme === 'dark' ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
        </button>

        {/* AI indicator */}
        <button
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium',
            'bg-[var(--color-primary-light)] text-[var(--color-primary)]',
            'hover:opacity-80 transition-opacity min-h-[44px]'
          )}
          aria-label="Ouvrir l'assistant IA (Alt+I)"
          title="Alt+I"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>IA</span>
        </button>
      </header>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
