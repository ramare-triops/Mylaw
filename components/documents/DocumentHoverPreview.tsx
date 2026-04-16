'use client';

import { useEffect, useRef, useState } from 'react';
import { Clock, AlignLeft } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import type { Document } from '@/types';

interface DocumentHoverPreviewProps {
  doc: Document;
  anchor: { top: number; left: number };
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
      function nodeToHtml(node: {
        type?: string; text?: string;
        attrs?: Record<string, unknown>;
        marks?: { type: string }[];
        content?: unknown[];
      }): string {
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

export function DocumentHoverPreview({ doc, anchor }: DocumentHoverPreviewProps) {
  const html = contentToHtml(doc.content ?? '');
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: anchor.top, left: anchor.left });

  // Largeur de la bulle et hauteur visible de la page A4 mock
  const BUBBLE_W = 320;
  const A4_W = 794;
  const A4_VISIBLE_H = 420; // hauteur visible de la page dans la bulle
  const scale = (BUBBLE_W - 32) / A4_W; // 32 = padding gauche+droite de la bulle

  useEffect(() => {
    if (!bubbleRef.current) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const bh = bubbleRef.current.offsetHeight;
    let top = anchor.top;
    let left = anchor.left;
    // Ajustement si d\u00e9borde en bas
    if (top + bh > vh - 16) top = Math.max(16, vh - bh - 16);
    // Ajustement si d\u00e9borde \u00e0 droite
    if (left + BUBBLE_W > vw - 16) left = anchor.left - BUBBLE_W - 24;
    setPos({ top, left });
  }, [anchor]);

  return (
    <div
      ref={bubbleRef}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        width: BUBBLE_W,
        zIndex: 50,
        pointerEvents: 'none',
      }}
      className="animate-fade-in"
    >
      {/* Carte bulle */}
      <div
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)',
          overflow: 'hidden',
        }}
      >
        {/* En-t\u00eate m\u00e9ta */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {doc.title}
          </p>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock style={{ width: 10, height: 10 }} />{formatDateTime(doc.updatedAt)}
            </span>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <AlignLeft style={{ width: 10, height: 10 }} />{doc.wordCount ?? 0} mots
            </span>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
              {TYPE_LABELS[doc.type ?? ''] ?? doc.type}
            </span>
          </div>
        </div>

        {/* Page A4 simul\u00e9e */}
        <div
          style={{
            background: '#e8e4dc', // couleur de fond autour de la page
            padding: '12px 16px 0 16px',
            overflow: 'hidden',
          }}
        >
          {/* Wrapper hauteur visible */}
          <div
            style={{
              width: (A4_W * scale),
              height: A4_VISIBLE_H * scale,
              position: 'relative',
              overflow: 'hidden',
              borderRadius: '4px 4px 0 0',
              boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
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
                fontSize: 15,
                lineHeight: 1.8,
                color: '#1a1a1a',
                boxSizing: 'border-box',
              }}
              className="tiptap-editor"
              dangerouslySetInnerHTML={{ __html: html }}
            />
            {/* Fondu bas */}
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: 48,
                background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.97))',
                pointerEvents: 'none',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
