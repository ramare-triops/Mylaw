'use client';

import { useRef, useEffect, useState } from 'react';
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
 * Convertit le contenu (JSON TipTap ou HTML) en HTML rendu.
 * Pour le JSON TipTap on reconstruit un HTML simple mais fid\u00e8le.
 */
function contentToHtml(raw: string): string {
  if (!raw || raw.trim() === '') return '';
  const trimmed = raw.trim();

  // JSON TipTap \u2192 reconstruction HTML
  if (trimmed.startsWith('{')) {
    try {
      const doc = JSON.parse(trimmed);
      function nodeToHtml(node: { type?: string; text?: string; attrs?: Record<string, unknown>; marks?: { type: string; attrs?: Record<string, unknown> }[]; content?: unknown[] }): string {
        if (node.type === 'text') {
          let t = node.text ?? '';
          // Escape HTML
          t = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          // Apply marks
          (node.marks ?? []).forEach((m) => {
            if (m.type === 'bold') t = `<strong>${t}</strong>`;
            if (m.type === 'italic') t = `<em>${t}</em>`;
            if (m.type === 'underline') t = `<u>${t}</u>`;
            if (m.type === 'strike') t = `<s>${t}</s>`;
          });
          return t;
        }
        const inner = (node.content ?? []).map((c) => nodeToHtml(c as Parameters<typeof nodeToHtml>[0])).join('');
        const align = (node.attrs?.textAlign as string) ?? null;
        const style = align && align !== 'null' ? ` style="text-align:${align}"` : '';
        switch (node.type) {
          case 'doc': return inner;
          case 'paragraph': return `<p${style}>${inner || '&nbsp;'}</p>`;
          case 'heading': {
            const level = (node.attrs?.level as number) ?? 1;
            return `<h${level}${style}>${inner}</h${level}>`;
          }
          case 'bulletList': return `<ul>${inner}</ul>`;
          case 'orderedList': return `<ol>${inner}</ol>`;
          case 'listItem': return `<li>${inner}</li>`;
          case 'blockquote': return `<blockquote>${inner}</blockquote>`;
          case 'hardBreak': return '<br>';
          case 'horizontalRule': return '<hr>';
          default: return inner;
        }
      }
      return nodeToHtml(doc);
    } catch { /* fallback */ }
  }

  // HTML direct
  if (trimmed.startsWith('<')) return trimmed;

  // Texte brut
  return `<p>${trimmed.replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;
}

/** Composant page A4 mise \u00e0 l'\u00e9chelle dans son conteneur */
function A4Page({ html }: { html: string }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // Largeur r\u00e9elle d'une page A4 \u00e0 96 dpi = 794 px
  const A4_W = 794;
  const A4_H = 1123;

  useEffect(() => {
    if (!wrapperRef.current) return;
    const obs = new ResizeObserver(([entry]) => {
      const available = entry.contentRect.width;
      setScale(Math.min(1, available / A4_W));
    });
    obs.observe(wrapperRef.current);
    return () => obs.disconnect();
  }, []);

  return (
    // Conteneur qui mesure la largeur disponible
    <div ref={wrapperRef} className="w-full flex justify-center">
      {/* Wrapper qui prend la hauteur mise \u00e0 l'\u00e9chelle */}
      <div style={{ width: A4_W * scale, height: A4_H * scale, position: 'relative', flexShrink: 0 }}>
        {/* La page A4 r\u00e9elle, transform\u00e9e */}
        <div
          style={{
            width: A4_W,
            height: A4_H,
            transformOrigin: 'top left',
            transform: `scale(${scale})`,
            position: 'absolute',
            top: 0,
            left: 0,
            backgroundColor: '#ffffff',
            boxShadow: '0 2px 16px rgba(0,0,0,0.13)',
            padding: '72px 80px',
            fontFamily: "Georgia, 'Source Serif 4', ui-serif",
            fontSize: '15px',
            lineHeight: '1.8',
            color: '#1a1a1a',
            overflow: 'hidden',
            boxSizing: 'border-box',
          }}
          // Applique les m\u00eames styles que .tiptap-editor
          className="tiptap-editor"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}

export function DocumentPreviewPanel({ doc }: DocumentPreviewPanelProps) {
  const html = doc ? contentToHtml(doc.content ?? '') : '';

  return (
    <aside
      className={cn(
        'hidden lg:flex flex-col basis-[55%] shrink-0',
        'border-l border-[var(--color-border)] bg-[var(--color-surface-raised)]',
        'overflow-hidden'
      )}
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Aper\u00e7u
        </p>
        {doc && (
          <span className="text-xs text-[var(--color-text-subtle)]">
            {TYPE_LABELS[doc.type ?? ''] ?? doc.type} \u2022 {doc.wordCount ?? 0} mots
          </span>
        )}
      </div>

      {!doc ? (
        /* Empty state */
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-10">
          <div className="w-20 h-20 rounded-3xl bg-[var(--color-surface)] flex items-center justify-center shadow-sm">
            <FileText className="w-10 h-10 text-[var(--color-text-subtle)]" />
          </div>
          <p className="text-sm text-[var(--color-text-muted)] max-w-xs">
            Survolez un document pour afficher son aper\u00e7u
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">

          {/* M\u00e9ta compacte en haut */}
          <div className="px-6 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
              <span className="text-xs text-[var(--color-text-muted)]">{formatDateTime(doc.updatedAt)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <AlignLeft className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
              <span className="text-xs text-[var(--color-text-muted)]">{doc.wordCount ?? 0} mots</span>
            </div>
            {doc.tags && doc.tags.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                <div className="flex gap-1">
                  {doc.tags.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 text-[10px] rounded-full bg-[var(--color-surface-raised)] text-[var(--color-text-muted)]">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Page A4 simul\u00e9e */}
          <div className="p-6">
            <A4Page html={html} />
          </div>
        </div>
      )}
    </aside>
  );
}
