import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, UnderlineType, Table, TableRow, TableCell,
  WidthType, ShadingType,
} from 'docx';

// ─── Types Tiptap JSON ──────────────────────────────────────────────────────────────

interface TiptapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: TiptapMark[];
  text?: string;
}

// ─── PDF : conversion JSON → HTML (via generateHTML) ──────────────────────────────

async function contentToHtmlForPdf(raw: string): Promise<string> {
  if (!raw || raw.trim() === '') return '';
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const { generateHTML } = await import('@tiptap/core');
      const { default: StarterKit }    = await import('@tiptap/starter-kit');
      const { default: Underline }     = await import('@tiptap/extension-underline');
      const { default: TextAlign }     = await import('@tiptap/extension-text-align');
      const { default: TextStyle }     = await import('@tiptap/extension-text-style');
      const { default: Color }         = await import('@tiptap/extension-color');
      const { default: Highlight }     = await import('@tiptap/extension-highlight');
      const { default: Link }          = await import('@tiptap/extension-link');
      const { default: Table2 }        = await import('@tiptap/extension-table');
      const { default: TableRow2 }     = await import('@tiptap/extension-table-row');
      const { default: TableCell2 }    = await import('@tiptap/extension-table-cell');
      const { default: TableHeader }   = await import('@tiptap/extension-table-header');
      return generateHTML(JSON.parse(trimmed), [
        StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
        Underline, TextStyle, Color,
        Highlight.configure({ multicolor: true }),
        TextAlign.configure({ types: ['heading', 'paragraph'] }),
        Link.configure({ openOnClick: false }),
        Table2.configure({ resizable: false }), TableRow2, TableCell2, TableHeader,
      ]);
    } catch (e) { console.error('generateHTML failed', e); }
  }
  return trimmed;
}

// ─── DOCX : parser direct du JSON Tiptap ───────────────────────────────────────────

function tiptapAlign(val: unknown): AlignmentType {
  if (val === 'center')  return AlignmentType.CENTER;
  if (val === 'right')   return AlignmentType.RIGHT;
  if (val === 'justify') return AlignmentType.JUSTIFIED;
  return AlignmentType.LEFT;
}

function tiptapTextNode(node: TiptapNode): TextRun {
  const marks = node.marks ?? [];
  const bold      = marks.some(m => m.type === 'bold');
  const italic    = marks.some(m => m.type === 'italic');
  const underline = marks.some(m => m.type === 'underline');
  const strike    = marks.some(m => m.type === 'strike');
  const colorMark = marks.find(m => m.type === 'textStyle');
  const color     = (colorMark?.attrs?.color as string | undefined)?.replace('#', '');
  const fontSize  = (() => {
    const fs = colorMark?.attrs?.fontSize as string | undefined;
    if (!fs) return undefined;
    const match = fs.match(/([\d.]+)pt/);
    return match ? Math.round(parseFloat(match[1]) * 2) : undefined;
  })();

  return new TextRun({
    text: node.text ?? '',
    bold,
    italics: italic,
    underline: underline ? { type: UnderlineType.SINGLE } : undefined,
    strike,
    color: color || undefined,
    size: fontSize,
  });
}

function tiptapInlineNodes(nodes: TiptapNode[] | undefined): TextRun[] {
  if (!nodes) return [];
  const runs: TextRun[] = [];
  for (const n of nodes) {
    if (n.type === 'text') {
      runs.push(tiptapTextNode(n));
    } else if (n.type === 'hardBreak') {
      runs.push(new TextRun({ text: '', break: 1 }));
    }
    // images inline ignorées pour DOCX
  }
  return runs;
}

function tiptapNodeToDocx(node: TiptapNode): (Paragraph | Table)[] {
  const attrs = node.attrs ?? {};
  const align = tiptapAlign(attrs.textAlign);

  switch (node.type) {
    case 'paragraph': {
      const children = tiptapInlineNodes(node.content);
      // Paragraphe vide = ligne blanche
      return [new Paragraph({
        alignment: align,
        children: children.length > 0 ? children : [new TextRun('')],
      })];
    }

    case 'heading': {
      const levelMap: Record<number, HeadingLevel> = {
        1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2,
        3: HeadingLevel.HEADING_3, 4: HeadingLevel.HEADING_4,
      };
      const level = (attrs.level as number) ?? 1;
      return [new Paragraph({
        heading: levelMap[level] ?? HeadingLevel.HEADING_1,
        alignment: align,
        children: tiptapInlineNodes(node.content),
      })];
    }

    case 'bulletList': {
      const items: Paragraph[] = [];
      for (const li of node.content ?? []) {
        const inlines = tiptapInlineNodes(li.content?.[0]?.content);
        items.push(new Paragraph({ bullet: { level: 0 }, children: inlines }));
      }
      return items;
    }

    case 'orderedList': {
      const items: Paragraph[] = [];
      for (const li of node.content ?? []) {
        const inlines = tiptapInlineNodes(li.content?.[0]?.content);
        items.push(new Paragraph({
          numbering: { reference: 'default-numbering', level: 0 },
          children: inlines,
        }));
      }
      return items;
    }

    case 'blockquote': {
      const text = (node.content ?? []).map(n => (n.content ?? []).map(t => t.text ?? '').join('')).join('\n');
      return [new Paragraph({
        indent: { left: 720 },
        children: [new TextRun({ text, italics: true, color: '6b7280' })],
      })];
    }

    case 'horizontalRule':
      return [new Paragraph({ thematicBreak: true })];

    case 'table': {
      const rows = (node.content ?? []).map((rowNode) =>
        new TableRow({
          children: (rowNode.content ?? []).map((cellNode) => {
            const cellContent = (cellNode.content ?? []).flatMap(p => [
              new Paragraph({ children: tiptapInlineNodes(p.content) })
            ]);
            return new TableCell({
              children: cellContent.length > 0 ? cellContent : [new Paragraph({})],
              shading: cellNode.type === 'tableHeader'
                ? { type: ShadingType.CLEAR, fill: 'f9fafb' } : undefined,
            });
          }),
        })
      );
      return [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows })];
    }

    default:
      // Fallback : essaye de récupérer le texte brut
      if (node.content) return node.content.flatMap(tiptapNodeToDocx);
      return [];
  }
}

function jsonToDocxChildren(raw: string): (Paragraph | Table)[] {
  try {
    const doc: TiptapNode = JSON.parse(raw);
    const topNodes = doc.type === 'doc' ? (doc.content ?? []) : [doc];
    return topNodes.flatMap(tiptapNodeToDocx);
  } catch {
    // Fallback : texte brut
    return [new Paragraph({ children: [new TextRun(raw)] })];
  }
}

// ─── Export DOCX ─────────────────────────────────────────────────────────────

export async function exportDocx(title: string, rawContent: string): Promise<void> {
  const trimmed = (rawContent ?? '').trim();
  const children = (trimmed.startsWith('{') || trimmed.startsWith('['))
    ? jsonToDocxChildren(trimmed)
    : [new Paragraph({ children: [new TextRun(trimmed)] })];

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

// ─── Export PDF ─────────────────────────────────────────────────────────────────

export async function exportPdf(title: string, rawContent: string): Promise<void> {
  const html = await contentToHtmlForPdf(rawContent);

  const styles = `
    @page { size: A4; margin: 2cm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Georgia, 'Times New Roman', serif; font-size: 12pt; line-height: 1.8; color: #1a1a1a; }
    h1 { font-size: 22pt; font-weight: 700; margin: 0.8em 0 0.4em; }
    h2 { font-size: 18pt; font-weight: 700; margin: 0.7em 0 0.35em; }
    h3 { font-size: 14pt; font-weight: 600; margin: 0.6em 0 0.3em; }
    h4 { font-size: 12pt; font-weight: 600; margin: 0.5em 0 0.25em; }
    p  { margin-bottom: 0.5em; }
    p:empty, p br:only-child { min-height: 1.8em; display: block; }
    ul, ol { padding-left: 1.5em; margin-bottom: 0.6em; }
    li { margin-bottom: 0.2em; }
    blockquote { border-left: 3px solid #01696f; padding: 0.4em 0 0.4em 1em; margin: 0.8em 0; color: #6b7280; font-style: italic; }
    table { border-collapse: collapse; width: 100%; margin: 0.8em 0; }
    th, td { border: 1px solid #d1d5db; padding: 0.4em 0.6em; }
    th { background: #f9fafb; font-weight: 600; }
    strong { font-weight: 700; } em { font-style: italic; }
    u { text-decoration: underline; } s { text-decoration: line-through; }
    a { color: #01696f; } mark { background: #d9f2f3; }
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
