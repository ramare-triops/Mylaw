'use client';

import { useRef, useEffect, useState } from 'react';
import { FileText, Clock, AlignLeft, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/utils';
import { usePrivacyMasking } from '@/lib/hooks/usePrivacyMasking';
import type { Document } from '@/types';

interface DocumentPreviewPanelProps {
  doc: Document | null;
}

const TYPE_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  final: 'Finalis\u00e9',
  contract: 'Contrat',
};

function contentToHtml(raw: string): string {
  if (!raw || raw.trim() === '') return '';
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    try {
      const doc = JSON.parse(trimmed);
      function nodeToHtml(node: { type?: string; text?: string; attrs?: Record<string, unknown>; marks?: { type: string }[]; content?: unknown[] }): string {
        if (node.type === 'text') {
          let t = (node.text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
          case 'heading': return `<h${node.attrs?.level ?? 1}${style}>${inner}</h${node.attrs?.level ?? 1}>`;
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
  if (trimmed.startsWith('<')) return trimmed;
  return `<p>${trimmed.replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;
}

function A4Page({ html }: { html: string }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const A4_W = 794;
  // On affiche seulement le haut de la page (environ 1/3) pour un effet vignette
  const VISIBLE_H = 340;

  useEffect(() => {
    if (!wrapperRef.current) return;
    const obs = new ResizeObserver(([entry]) => {
      setScale(Math.min(1, entry.contentRect.width / A4_W));
    });
    obs.observe(wrapperRef.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={wrapperRef} className="w-full flex justify-center">
      {/* Cadre avec overflow:hidden pour ne montrer que la partie haute */}
      <div
        style={{
          width: A4_W * scale,
          height: VISIBLE_H * scale,
          position: 'relative',
          flexShrink: 0,
          overflow: 'hidden',
          borderRadius: 6,
          boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
        }}
      >
        {/* Page A4 r\u00e9elle mise \u00e0 l'\u00e9chelle */}
        <div
          style={{
            width: A4_W,
            transformOrigin: 'top left',
            transform: `scale(${scale})`,
            position: 'absolute',
            top: 0,
            left: 0,
            backgroundColor: '#ffffff',
            padding: '56px 64px',
            fontFamily: "Georgia, 'Source Serif 4', ui-serif",
            fontSize: '15px',
            lineHeight: '1.8',
            color: '#1a1a1a',
            boxSizing: 'border-box',
          }}
          className="tiptap-editor"
          dangerouslySetInnerHTML={{ __html: html }}
        />
        {/* Fondu en bas pour indiquer que le contenu continue */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 60,
            background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.95))',
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
}

export function DocumentPreviewPanel({ doc }: DocumentPreviewPanelProps) {
  // Le masquage utilise les intervenants du dossier rattaché : on
  // construit la table de remplacement « valeur → label » à partir de
  // ces contacts puis on l'applique au HTML rendu.
  const masking = usePrivacyMasking(doc?.dossierId ?? null);
  const rawHtml = doc ? contentToHtml(doc.content ?? '') : '';
  const html = masking.maskHtml(rawHtml);
  const title = doc
    ? masking.privacyMode
      ? masking.maskText(doc.title)
      : doc.title
    : '';

  return (
    <aside
      className={cn(
        'hidden lg:flex flex-col basis-[40%] shrink-0',
        'border-l border-[var(--color-border)] bg-[var(--color-surface-raised)]',
        'overflow-hidden'
      )}
    >
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-between">
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
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
          <div className="w-16 h-16 rounded-2xl bg-[var(--color-surface)] flex items-center justify-center shadow-sm">
            <FileText className="w-8 h-8 text-[var(--color-text-subtle)]" />
          </div>
          <p className="text-xs text-[var(--color-text-muted)] max-w-[200px]">
            Survolez un document pour afficher son aper\u00e7u
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">

          {/* Titre */}
          <div className="px-5 py-4 border-b border-[var(--color-border)]">
            <p className="text-sm font-semibold text-[var(--color-text)] leading-snug truncate">{title}</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{TYPE_LABELS[doc.type ?? ''] ?? doc.type ?? 'Document'}</p>
          </div>

          {/* M\u00e9ta compacte */}
          <div className="px-5 py-3 border-b border-[var(--color-border)] flex flex-wrap gap-x-4 gap-y-1.5">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3 h-3 text-[var(--color-text-muted)]" />
              <span className="text-xs text-[var(--color-text-muted)]">{formatDateTime(doc.updatedAt)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <AlignLeft className="w-3 h-3 text-[var(--color-text-muted)]" />
              <span className="text-xs text-[var(--color-text-muted)]">{doc.wordCount ?? 0} mots</span>
            </div>
            {doc.tags && doc.tags.length > 0 && (
              <div className="flex items-center gap-1">
                <Tag className="w-3 h-3 text-[var(--color-text-muted)]" />
                {doc.tags.map((tag) => (
                  <span key={tag} className="px-1.5 py-0.5 text-[10px] rounded-full bg-[var(--color-surface)] text-[var(--color-text-muted)]">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Miniature page A4 dans un cadre */}
          <div className="p-4">
            <A4Page html={html} />
          </div>
        </div>
      )}
    </aside>
  );
}
