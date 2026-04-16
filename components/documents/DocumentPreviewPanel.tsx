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
  final: 'Finalis\u00e9',
  contract: 'Contrat',
};

/**
 * Extrait le texte brut depuis n'importe quel format de contenu :
 * - JSON TipTap  ({"type":"doc", ...})
 * - HTML          (<p>...</p>)
 * - Texte brut
 */
function extractPlainText(raw: string): string {
  if (!raw || raw.trim() === '') return '';
  const trimmed = raw.trim();

  // JSON TipTap
  if (trimmed.startsWith('{')) {
    try {
      const doc = JSON.parse(trimmed);
      const parts: string[] = [];
      function walk(node: { type?: string; text?: string; content?: unknown[] }) {
        if (node.type === 'text' && node.text) parts.push(node.text);
        if (Array.isArray(node.content)) {
          node.content.forEach((child) => walk(child as { type?: string; text?: string; content?: unknown[] }));
          // Ajoute un espace après les blocs (paragraph, heading...)
          if (['paragraph', 'heading', 'bulletList', 'listItem'].includes(node.type ?? '')) {
            parts.push(' ');
          }
        }
      }
      walk(doc);
      return parts.join('').replace(/\s+/g, ' ').trim();
    } catch {
      // pas du JSON valide, on continue
    }
  }

  // HTML
  if (trimmed.startsWith('<')) {
    return trimmed.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  return trimmed;
}

export function DocumentPreviewPanel({ doc }: DocumentPreviewPanelProps) {
  const textContent = doc ? extractPlainText(doc.content ?? '') : '';

  return (
    <aside
      className={cn(
        // Panneau fixe à droite — 40% de la largeur disponible, min 280px, max 420px
        'hidden lg:flex flex-col flex-shrink-0',
        'w-[38%] min-w-[280px] max-w-[420px]',
        'border-l border-[var(--color-border)] bg-[var(--color-surface)]',
        'overflow-hidden'
      )}
    >
      {/* Panel header */}
      <div className="px-5 py-4 border-b border-[var(--color-border)]">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Aper\u00e7u
        </p>
      </div>

      {!doc ? (
        /* Empty state */
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
          <div className="w-16 h-16 rounded-2xl bg-[var(--color-surface-raised)] flex items-center justify-center">
            <FileText className="w-8 h-8 text-[var(--color-text-subtle)]" />
          </div>
          <p className="text-sm text-[var(--color-text-muted)]">
            Survolez un document pour afficher son aper\u00e7u
          </p>
        </div>
      ) : (
        /* Document preview */
        <div className="flex-1 overflow-y-auto">

          {/* Big document icon + title */}
          <div className="flex flex-col items-center gap-3 px-6 py-8 border-b border-[var(--color-border)]">
            <div className="w-20 h-20 rounded-2xl bg-[var(--color-primary)]/10 flex items-center justify-center">
              <FileText className="w-10 h-10 text-[var(--color-primary)]" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-[var(--color-text)] leading-snug">{doc.title}</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                {TYPE_LABELS[doc.type ?? ''] ?? doc.type ?? 'Document'}
              </p>
            </div>
          </div>

          {/* Meta info */}
          <div className="px-6 py-5 space-y-4 border-b border-[var(--color-border)]">
            <div className="flex items-start gap-3">
              <Clock className="w-4 h-4 text-[var(--color-text-muted)] mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-[10px] text-[var(--color-text-subtle)] uppercase tracking-wide font-medium">Modifi\u00e9 le</p>
                <p className="text-xs text-[var(--color-text)] mt-0.5">{formatDateTime(doc.updatedAt)}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Clock className="w-4 h-4 text-[var(--color-text-muted)] mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-[10px] text-[var(--color-text-subtle)] uppercase tracking-wide font-medium">Cr\u00e9\u00e9 le</p>
                <p className="text-xs text-[var(--color-text)] mt-0.5">{formatDateTime(doc.createdAt)}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <AlignLeft className="w-4 h-4 text-[var(--color-text-muted)] mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-[10px] text-[var(--color-text-subtle)] uppercase tracking-wide font-medium">Longueur</p>
                <p className="text-xs text-[var(--color-text)] mt-0.5">{doc.wordCount ?? 0} mots</p>
              </div>
            </div>
            {doc.tags && doc.tags.length > 0 && (
              <div className="flex items-start gap-3">
                <Tag className="w-4 h-4 text-[var(--color-text-muted)] mt-0.5 flex-shrink-0" />
                <div className="flex flex-wrap gap-1.5">
                  {doc.tags.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 text-[10px] rounded-full bg-[var(--color-surface-raised)] text-[var(--color-text-muted)]">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Text excerpt */}
          <div className="px-6 py-5">
            <p className="text-[10px] text-[var(--color-text-subtle)] uppercase tracking-wide font-medium mb-3">Contenu</p>
            {textContent ? (
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                {textContent.slice(0, 800)}
                {textContent.length > 800 && (
                  <span className="text-[var(--color-text-subtle)]"> \u2026</span>
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
