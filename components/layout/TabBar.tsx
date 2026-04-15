'use client';

import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useUIState } from '@/components/providers/UIStateProvider';
import { cn } from '@/lib/utils';

export function TabBar() {
  const { openTabs, activeTabId, closeTab, setActiveTab } = useUIState();
  const router = useRouter();

  if (openTabs.length === 0) return null;

  const handleTabClick = (tab: (typeof openTabs)[number]) => {
    setActiveTab(tab.id);
    if (tab.type === 'document') router.push(`/documents/${tab.entityId}`);
    else if (tab.type === 'tool') router.push(`/tools/${tab.entityId}`);
    else if (tab.type === 'template') router.push(`/templates/${tab.entityId}`);
  };

  return (
    <div
      className={cn(
        'flex items-center overflow-x-auto flex-shrink-0',
        'bg-[var(--color-surface-raised)] border-b border-[var(--color-border)]',
        'scrollbar-thin'
      )}
    >
      {openTabs.map((tab) => (
        <div
          key={tab.id}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 text-xs border-r border-[var(--color-border)] cursor-pointer',
            'min-w-[120px] max-w-[200px] flex-shrink-0 group transition-colors',
            activeTabId === tab.id
              ? 'bg-[var(--color-surface)] text-[var(--color-text)]'
              : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]'
          )}
          onClick={() => handleTabClick(tab)}
        >
          <span className="truncate flex-1">{tab.title}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              closeTab(tab.id);
            }}
            className="opacity-0 group-hover:opacity-100 flex-shrink-0 hover:text-[var(--color-danger)] transition-opacity"
            aria-label={`Fermer ${tab.title}`}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
