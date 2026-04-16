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

// Styles CSS A4 embarqu\u00e9s dans le srcdoc de l'iframe
const A4_STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 794px;
    min-height: 1123px;
    padding: 72px 80px;
    background: #fff;
    font-family: Georgia, 'Source Serif 4', ui-serif;
    font-size: 15px;
    line-height: 1.8;
    color: #1a1a1a;
    overflow: hidden;
  }
  p { margin-bottom: 0.75rem; }
  h1 { font-size: 1.4rem; font-weight: 700; margin: 1.5rem 0 1rem; }
  h2 { font-size: 1.2rem; font-weight: 600; margin: 1.25rem 0 0.75rem; }
  h3 { font-size: 1rem; font-weight: 600; margin: 1rem 0 0.5rem; }
  h4, h5, h6 { font-weight: 600; margin: 0.75rem 0 0.4rem; }
  ul, ol { padding-left: 1.5rem; margin-bottom: 0.75rem; }
  li { margin-bottom: 0.2rem; }
  blockquote {
    border-left: 3px solid #01696f;
    padding-left: 1rem;
    color: #6b6b6b;
    font-style: italic;
    margin-bottom: 0.75rem;
  }
  strong { font-weight: 700; }
  em { font-style: italic; }
  u { text-decoration: underline; }
  s { text-decoration: line-through; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 1rem; }
  td, th { border: 1px solid #ddd8ce; padding: 0.5rem; vertical-align: top; }
  th { background: #f0ece4; font-weight: 600; }
  hr { border: none; border-top: 1px solid #ddd8ce; margin: 1rem 0; }
  mark { background: #d9f2f3; color: inherit; }
  /* Variables */
  [data-type="variable"] {
    background: #d9f2f3;
    color: #01696f;
    font-family: monospace;
    font-size: 0.85em;
    padding: 0 0.25rem;
    border-radius: 3px;
  }
`;

const BUBBLE_W = 320;
const A4_W = 794;
// Hauteur visible de la page dans la bulle (avant fondu)
const A4_VISIBLE_H = 400;
const SCALE = (BUBBLE_W - 32) / A4_W; // 32 = padding h de la zone grise

export function DocumentHoverPreview({ doc, anchor }: DocumentHoverPreviewProps) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: anchor.top, left: anchor.left });

  // HTML du document (l'\u00e9diteur sauvegarde en HTML pur)
  const html = doc.content ?? '';

  // srcdoc de l'iframe : page A4 compl\u00e8te avec styles embarqu\u00e9s
  const srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${A4_STYLES}</style></head><body>${html}</body></html>`;

  useEffect(() => {
    if (!bubbleRef.current) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const bh = bubbleRef.current.offsetHeight;
    let top = anchor.top;
    let left = anchor.left;
    if (top + bh > vh - 16) top = Math.max(16, vh - bh - 16);
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
          <p style={{
            fontSize: 13, fontWeight: 600, color: 'var(--color-text)',
            marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
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

        {/* Zone A4 */}
        <div style={{ background: '#e8e4dc', padding: '12px 16px 0', position: 'relative' }}>
          {/* Wrapper hauteur visible avec overflow:hidden */}
          <div
            style={{
              width: A4_W * SCALE,
              height: A4_VISIBLE_H * SCALE,
              position: 'relative',
              overflow: 'hidden',
              borderRadius: '4px 4px 0 0',
              boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
            }}
          >
            {/* iframe isol\u00e9e : rendu propre sans interf\u00e9rence des CSS globaux */}
            <iframe
              srcDoc={srcdoc}
              scrolling="no"
              style={{
                width: A4_W,
                height: Math.ceil(A4_VISIBLE_H / SCALE), // hauteur r\u00e9elle avant scale
                border: 'none',
                transformOrigin: 'top left',
                transform: `scale(${SCALE})`,
                position: 'absolute',
                top: 0,
                left: 0,
                pointerEvents: 'none',
                background: '#fff',
              }}
              sandbox="allow-same-origin"
            />
            {/* Fondu bas */}
            <div
              style={{
                position: 'absolute',
                bottom: 0, left: 0, right: 0,
                height: 56,
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
