'use client';

import { cn } from '@/lib/utils';
import type { Document } from '@/types';

interface DocumentPreviewProps {
  doc: Document;
}

export function DocumentPreview({ doc }: DocumentPreviewProps) {
  const preview = (doc.content ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);

  return (
    <div
      className={cn(
        'absolute left-full top-0 ml-3 z-30 w-72 rounded-lg shadow-xl pointer-events-none',
        'bg-[var(--color-surface)] border border-[var(--color-border)]',
        'p-4 animate-in fade-in slide-in-from-left-2 duration-150'
      )}
    >
      <p className="text-xs font-semibold text-[var(--color-text)] mb-2 truncate">{doc.title}</p>
      <p className="text-xs text-[var(--color-text-muted)] leading-relaxed line-clamp-6">
        {preview || 'Document vide.'}
      </p>
      <div className="mt-3 pt-3 border-t border-[var(--color-border)] flex items-center justify-between text-[10px] text-[var(--color-text-subtle)]">
        <span>{doc.wordCount} mots</span>
        <span className="capitalize">{doc.type ?? 'brouillon'}</span>
      </div>
    </div>
  );
}
