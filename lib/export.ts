import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, UnderlineType, Table, TableRow, TableCell,
  WidthType, ShadingType,
} from 'docx';
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
import TiptapTable from '@tiptap/extension-table';
import TiptapTableRow from '@tiptap/extension-table-row';
import TiptapTableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';

const EXPORT_EXTENSIONS = [
  StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
  Underline, TextStyle, FontFamily, Color,
  Highlight.configure({ multicolor: true }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Link.configure({ openOnClick: false }),
  Image.configure({ inline: true, allowBase64: true }),
  TiptapTable.configure({ resizable: false }),
  TiptapTableRow, TiptapTableCell, TableHeader,
  Subscript, Superscript,
  TaskList, TaskItem.configure({ nested: true }),
];

/** Convertit JSON Tiptap ou HTML brut en HTML */
function contentToHtml(raw: string | null | undefined): string {
  if (!raw || raw.trim() === '') return '';
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { return generateHTML(JSON.parse(trimmed), EXPORT_EXTENSIONS); } catch { /* fallback */ }
  }
  return trimmed;
}

// ─── Helpers HTML → DOCX ─────────────────────────────────────────────────

/** Lit text-align depuis le style inline d'un élément */
function getAlignment(el: Element): AlignmentType {
  const style = (el.getAttribute('style') ?? '').replace(/\s/g, '').toLowerCase();
  if (style.includes('text-align:center')) return AlignmentType.CENTER;
  if (style.includes('text-align:right')) return AlignmentType.RIGHT;
  if (style.includes('text-align:justify')) return AlignmentType.JUSTIFIED;
  return AlignmentType.LEFT;
}

interface RunStyle {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color?: string;
  fontSize?: number; // en demi-points (1pt = 2)
}

const DEFAULT_STYLE: RunStyle = { bold: false, italic: false, underline: false, strike: false };

/** Parse récursivement les noeuds inline et produit des TextRun */
function parseInline(node: ChildNode, style: RunStyle = DEFAULT_STYLE): TextRun[] {
  const runs: TextRun[] = [];

  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? '';
    if (text) {
      runs.push(new TextRun({
        text,
        bold: style.bold,
        italics: style.italic,
        underline: style.underline ? { type: UnderlineType.SINGLE } : undefined,
        strike: style.strike,
        color: style.color,
        size: style.fontSize,
      }));
    }
    return runs;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return runs;
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  const inlineStyle = (el.getAttribute('style') ?? '').replace(/\s*/g, '').toLowerCase();

  // Calcule le style hérité enrichi
  const next: RunStyle = {
    bold: style.bold || tag === 'strong' || tag === 'b' || inlineStyle.includes('font-weight:bold') || inlineStyle.includes('font-weight:700'),
    italic: style.italic || tag === 'em' || tag === 'i' || inlineStyle.includes('font-style:italic'),
    underline: style.underline || tag === 'u' || inlineStyle.includes('text-decoration:underline'),
    strike: style.strike || tag === 's' || tag === 'del' || inlineStyle.includes('text-decoration:line-through'),
    color: (() => {
      const m = inlineStyle.match(/(?:^|;)color:([^;]+)/);
      return m ? m[1].replace('#', '') : style.color;
    })(),
    fontSize: (() => {
      const m = inlineStyle.match(/font-size:([\d.]+)pt/);
      return m ? Math.round(parseFloat(m[1]) * 2) : style.fontSize;
    })(),
  };

  // <br> = espace insécable pour ne pas perdre le saut
  if (tag === 'br') {
    runs.push(new TextRun({ text: '', break: 1 }));
    return runs;
  }

  for (const child of Array.from(el.childNodes)) {
    runs.push(...parseInline(child, next));
  }
  return runs;
}

/** Construit un Paragraph DOCX depuis un élément bloc HTML */
function blockToParagraph(el: Element): Paragraph[] {
  const tag = el.tagName.toLowerCase();
  const align = getAlignment(el);

  // Titres
  const headingMap: Record<string, HeadingLevel> = {
    h1: HeadingLevel.HEADING_1, h2: HeadingLevel.HEADING_2,
    h3: HeadingLevel.HEADING_3, h4: HeadingLevel.HEADING_4,
  };
  if (headingMap[tag]) {
    return [new Paragraph({ heading: headingMap[tag], alignment: align, children: parseInline(el) })];
  }

  // Paragraphe (y compris vide = ligne vide)
  if (tag === 'p') {
    const children = parseInline(el);
    // Paragraphe vide -> ligne blanche
    if (children.length === 0 || (el.textContent ?? '').trim() === '') {
      return [new Paragraph({ alignment: align, children: [new TextRun('')] })];
    }
    return [new Paragraph({ alignment: align, children })];
  }

  // Listes
  if (tag === 'ul' || tag === 'ol') {
    return Array.from(el.querySelectorAll(':scope > li')).map((li) =>
      new Paragraph({
        bullet: tag === 'ul' ? { level: 0 } : undefined,
        numbering: tag === 'ol' ? { reference: 'default-numbering', level: 0 } : undefined,
        children: parseInline(li),
      })
    );
  }

  // Blockquote
  if (tag === 'blockquote') {
    return [new Paragraph({
      indent: { left: 720 },
      children: [new TextRun({ text: el.textContent ?? '', italics: true, color: '6b7280' })],
    })];
  }

  // Ligne horizontale
  if (tag === 'hr') return [new Paragraph({ thematicBreak: true })];

  // div ou autre — fallback sur les enfants ou le texte
  if (tag === 'div') {
    const blockChildren = Array.from(el.children).filter(c => {
      const t = c.tagName.toLowerCase();
      return ['p','h1','h2','h3','h4','ul','ol','blockquote','hr','table'].includes(t);
    });
    if (blockChildren.length > 0) return blockChildren.flatMap(c => blockToParagraph(c));
    return [new Paragraph({ alignment: align, children: parseInline(el) })];
  }

  const text = el.textContent ?? '';
  if (text.trim()) return [new Paragraph({ children: [new TextRun(text)] })];
  return [];
}

function parseTableNode(tableEl: Element): Table {
  const rows = Array.from(tableEl.querySelectorAll('tr')).map((tr) =>
    new TableRow({
      children: Array.from(tr.querySelectorAll('th, td')).map((td) =>
        new TableCell({
          children: [new Paragraph({ children: parseInline(td) })],
          shading: td.tagName.toLowerCase() === 'th'
            ? { type: ShadingType.CLEAR, fill: 'f9fafb' } : undefined,
        })
      ),
    })
  );
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

function htmlToDocxChildren(html: string): (Paragraph | Table)[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body>${html}</body>`, 'text/html');
  const body = doc.body;
  const result: (Paragraph | Table)[] = [];

  for (const child of Array.from(body.children)) {
    const tag = child.tagName.toLowerCase();
    if (tag === 'table') result.push(parseTableNode(child));
    else result.push(...blockToParagraph(child));
  }

  if (result.length === 0)
    result.push(new Paragraph({ children: [new TextRun(body.textContent ?? '')] }));

  return result;
}

// ─── Export DOCX ─────────────────────────────────────────────────────────────

export async function exportDocx(title: string, rawContent: string): Promise<void> {
  const html = contentToHtml(rawContent);
  const children = htmlToDocxChildren(html);

  const docxDoc = new Document({
    numbering: {
      config: [{
        reference: 'default-numbering',
        levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.LEFT }],
      }],
    },
    sections: [{
      properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      children,
    }],
  });

  const blob = await Packer.toBlob(docxDoc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Export PDF (via impression iframe) ──────────────────────────────────────

export function exportPdf(title: string, rawContent: string): void {
  const html = contentToHtml(rawContent);

  const styles = `
    @page { size: A4; margin: 2cm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Georgia, 'Times New Roman', serif; font-size: 12pt; line-height: 1.8; color: #1a1a1a; }
    h1 { font-size: 22pt; font-weight: 700; margin: 0.8em 0 0.4em; }
    h2 { font-size: 18pt; font-weight: 700; margin: 0.7em 0 0.35em; }
    h3 { font-size: 14pt; font-weight: 600; margin: 0.6em 0 0.3em; }
    h4 { font-size: 12pt; font-weight: 600; margin: 0.5em 0 0.25em; }
    p  { margin-bottom: 0.5em; }
    p:empty { min-height: 1.8em; }
    ul, ol { padding-left: 1.5em; margin-bottom: 0.6em; }
    li { margin-bottom: 0.2em; }
    blockquote { border-left: 3px solid #01696f; padding: 0.4em 0 0.4em 1em; margin: 0.8em 0; color: #6b7280; font-style: italic; }
    table { border-collapse: collapse; width: 100%; margin: 0.8em 0; }
    th, td { border: 1px solid #d1d5db; padding: 0.4em 0.6em; }
    th { background: #f9fafb; font-weight: 600; }
    strong { font-weight: 700; } em { font-style: italic; }
    u { text-decoration: underline; } s { text-decoration: line-through; }
    a { color: #01696f; }
    mark { background: #d9f2f3; }
    [data-variable-field] { display: inline; border: 1px solid currentColor; border-radius: 3px; padding: 0 4px; font-size: 0.85em; }
  `;

  const srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>${styles}</style></head><body>${html}</body></html>`;

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:210mm;height:297mm;border:none;';
  iframe.srcdoc = srcdoc;
  document.body.appendChild(iframe);

  iframe.onload = () => {
    if (iframe.contentWindow) {
      iframe.contentWindow.document.title = title;
      setTimeout(() => {
        iframe.contentWindow!.print();
        setTimeout(() => document.body.removeChild(iframe), 1000);
      }, 200);
    }
  };
}
