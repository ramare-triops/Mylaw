'use client';

import { FileText, Clock, AlignLeft, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/utils';
import type { Document } from '@/types';

interface DocumentPreviewPanelProps {
  doc: Document | null;
}

const TYPE_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  final: 'Finalisé',
  contract: 'Contrat',
};

export function DocumentPreviewPanel({ doc }: DocumentPreviewPanelProps) {
  const textContent = doc
    ? (doc.content ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    : '';

  return (
    <aside
      className={cn(
        'hidden lg:flex flex-col flex-shrink-0 w-72 xl:w-80',
        'border-l border-[var(--color-border)] bg-[var(--color-surface)]',
        'transition-all duration-200 overflow-hidden'
      )}
    >
      {/* Panel header */}
      <div className="px-5 py-4 border-b border-[var(--color-border)]">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Aperçu
        </p>
      </div>

      {!doc ? (
        /* Empty state */
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
          <div className="w-14 h-14 rounded-2xl bg-[var(--color-surface-raised)] flex items-center justify-center">
            <FileText className="w-7 h-7 text-[var(--color-text-subtle)]" />
          </div>
          <p className="text-sm text-[var(--color-text-muted)]">
            Survolez un document pour afficher son aperçu
          </p>
        </div>
      ) : (
        /* Document preview */
        <div className="flex-1 overflow-y-auto">

          {/* Big document icon + title */}
          <div className="flex flex-col items-center gap-3 px-5 py-6 border-b border-[var(--color-border)]">
            <div className="w-16 h-16 rounded-2xl bg-[var(--color-primary)]/10 flex items-center justify-center">
              <FileText className="w-8 h-8 text-[var(--color-primary)]" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-[var(--color-text)] leading-snug">{doc.title}</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                {TYPE_LABELS[doc.type ?? ''] ?? doc.type ?? 'Document'}
              </p>
            </div>
          </div>

          {/* Meta info */}
          <div className="px-5 py-4 space-y-3 border-b border-[var(--color-border)]">
            <div className="flex items-start gap-2.5">
              <Clock className="w-3.5 h-3.5 text-[var(--color-text-muted)] mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-[10px] text-[var(--color-text-subtle)] uppercase tracking-wide font-medium">Modifié le</p>
                <p className="text-xs text-[var(--color-text)]">{formatDateTime(doc.updatedAt)}</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Clock className="w-3.5 h-3.5 text-[var(--color-text-muted)] mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-[10px] text-[var(--color-text-subtle)] uppercase tracking-wide font-medium">Créé le</p>
                <p className="text-xs text-[var(--color-text)]">{formatDateTime(doc.createdAt)}</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <AlignLeft className="w-3.5 h-3.5 text-[var(--color-text-muted)] mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-[10px] text-[var(--color-text-subtle)] uppercase tracking-wide font-medium">Longueur</p>
                <p className="text-xs text-[var(--color-text)]">{doc.wordCount ?? 0} mots</p>
              </div>
            </div>
            {doc.tags && doc.tags.length > 0 && (
              <div className="flex items-start gap-2.5">
                <Tag className="w-3.5 h-3.5 text-[var(--color-text-muted)] mt-0.5 flex-shrink-0" />
                <div className="flex flex-wrap gap-1">
                  {doc.tags.map((tag) => (
                    <span key={tag} className="px-1.5 py-0.5 text-[10px] rounded bg-[var(--color-surface-raised)] text-[var(--color-text-muted)]">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Text excerpt */}
          <div className="px-5 py-4">
            <p className="text-[10px] text-[var(--color-text-subtle)] uppercase tracking-wide font-medium mb-2">Contenu</p>
            {textContent ? (
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                {textContent.slice(0, 500)}
                {textContent.length > 500 && (
                  <span className="text-[var(--color-text-subtle)]"> …</span>
                )}
              </p>
            ) : (
              <p className="text-xs text-[var(--color-text-subtle)] italic">Document vide.</p>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
