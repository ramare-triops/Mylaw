'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { Clock, AlignLeft } from 'lucide-react';
import { generateHTML } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import TextStyle from '@tiptap/extension-text-style';
import FontFamily from '@tiptap/extension-font-family';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { VariableField } from '@/components/editor/extensions/VariableField';
import { FontSize } from '@/components/editor/extensions/FontSize';
import { formatDateTime } from '@/lib/utils';
import type { Document } from '@/types';

interface DocumentHoverPreviewProps {
  doc: Document;
  anchor: { top: number; left: number };
}

const TYPE_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  final: 'Finalisé',
  contract: 'Contrat',
};

const PREVIEW_EXTENSIONS = [
  StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
  Underline, TextStyle, FontFamily, FontSize, Color,
  Highlight.configure({ multicolor: true }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Link.configure({ openOnClick: false }),
  Image.configure({ inline: true, allowBase64: true }),
  Table.configure({ resizable: false }),
  TableRow, TableCell, TableHeader,
  Subscript, Superscript,
  TaskList, TaskItem.configure({ nested: true }),
  VariableField.configure({ HTMLAttributes: {} }),
];

function contentToHtml(raw: string | null | undefined): string {
  if (!raw || raw.trim() === '') return '';
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { return generateHTML(JSON.parse(trimmed), PREVIEW_EXTENSIONS); } catch { /* fallback */ }
  }
  return trimmed;
}

// Largeur de la bulle
const BUBBLE_W = 380;
// Hauteur de la zone d'aperçu doc (en px dans la bulle)
const PREVIEW_H = 280;

// On rend l'iframe à exactement BUBBLE_W de large.
// Le body CSS est aussi à BUBBLE_W — pas de scale, pas de trick.
// On simule les marges Word en padding interne.
function buildSrcdoc(html: string, bubbleW: number): string {
  const pad = Math.round(bubbleW * 0.09); // ~9% de marge latérale, style Word
  const styles = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: ${bubbleW}px;
      background: #fff;
      font-family: Georgia, 'Times New Roman', ui-serif;
      font-size: 13px;
      line-height: 1.75;
      color: #1a1a1a;
      overflow: hidden;
    }
    body {
      padding: ${pad}px ${pad}px 0;
    }
    p { margin-bottom: 0.6em; }
    p:last-child { margin-bottom: 0; }
    h1 { font-size: 1.5em; font-weight: 700; margin: 0.8em 0 0.4em; line-height: 1.2; }
    h2 { font-size: 1.25em; font-weight: 700; margin: 0.7em 0 0.35em; }
    h3 { font-size: 1.1em; font-weight: 600; margin: 0.6em 0 0.3em; }
    h4 { font-size: 1em; font-weight: 600; margin: 0.5em 0 0.25em; }
    ul, ol { padding-left: 1.4em; margin-bottom: 0.6em; }
    li { margin-bottom: 0.15em; }
    ul { list-style-type: disc; }
    ol { list-style-type: decimal; }
    blockquote { border-left: 3px solid #01696f; padding: 0.4em 0 0.4em 1em; margin: 0.8em 0; color: #6b7280; font-style: italic; }
    strong { font-weight: 700; }
    em { font-style: italic; }
    u { text-decoration: underline; }
    s { text-decoration: line-through; }
    hr { border: none; border-top: 1px solid #d1d5db; margin: 1em 0; }
    table { border-collapse: collapse; width: 100%; margin: 0.8em 0; }
    th, td { border: 1px solid #d1d5db; padding: 0.35em 0.6em; text-align: left; vertical-align: top; }
    th { background: #f9fafb; font-weight: 600; }
    a { color: #01696f; text-decoration: underline; }
    mark { background: #d9f2f3; }
    img { max-width: 100%; height: auto; border-radius: 4px; }
    sub { vertical-align: sub; font-size: smaller; }
    sup { vertical-align: super; font-size: smaller; }
    [data-variable-field] {
      display: inline-flex; align-items: center;
      font-size: 0.8em; font-weight: 500;
      padding: 0.05em 0.4em; border-radius: 3px;
      border: 1px solid currentColor;
      vertical-align: baseline; line-height: 1.5; margin: 0 1px;
    }
    [data-variable-type="date"]      { color: #4f46e5; background: rgba(79,70,229,0.07); }
    [data-variable-type="name"]      { color: #01696f; background: rgba(1,105,111,0.07); }
    [data-variable-type="address"]   { color: #c2410c; background: rgba(194,65,12,0.07); }
    [data-variable-type="price"]     { color: #15803d; background: rgba(21,128,61,0.07); }
    [data-variable-type="duration"]  { color: #7c3aed; background: rgba(124,58,237,0.07); }
    [data-variable-type="reference"] { color: #be185d; background: rgba(190,24,93,0.07); }
    [data-variable-field]:not([data-variable-type]),
    [data-variable-type="default"]   { color: #6b7280; background: rgba(107,114,128,0.07); }
  `;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${styles}</style></head><body>${html}</body></html>`;
}

export function DocumentHoverPreview({ doc, anchor }: DocumentHoverPreviewProps) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: anchor.top, left: anchor.left });

  const html = useMemo(() => contentToHtml(doc.content), [doc.content]);
  const srcdoc = useMemo(() => buildSrcdoc(html, BUBBLE_W), [html]);

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
      style={{ position: 'fixed', top: pos.top, left: pos.left, width: BUBBLE_W, zIndex: 50, pointerEvents: 'none' }}
      className="animate-fade-in"
    >
      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)',
        overflow: 'hidden',
      }}>

        {/* En-tête méta */}
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

        {/* Aperçu document — iframe native, pas de scale */}
        <div style={{ position: 'relative', height: PREVIEW_H, overflow: 'hidden', background: '#fff' }}>
          <iframe
            srcDoc={srcdoc}
            scrolling="no"
            style={{
              width: BUBBLE_W,
              height: PREVIEW_H,
              border: 'none',
              display: 'block',
              pointerEvents: 'none',
              background: '#fff',
            }}
            sandbox="allow-same-origin"
          />
          {/* Fondu bas */}
          <div style={{
            position: 'absolute',
            bottom: 0, left: 0, right: 0,
            height: 64,
            background: 'linear-gradient(to bottom, transparent, #fff)',
            pointerEvents: 'none',
          }} />
        </div>

      </div>
    </div>
  );
}
