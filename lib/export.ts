import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, UnderlineType, Table, TableRow, TableCell,
  WidthType, BorderStyle, ShadingType,
} from 'docx';

// ─── Helpers HTML → texte brut ───────────────────────────────────────────────

function attr(el: Element, name: string): string {
  return el.getAttribute(name) ?? '';
}

function parseInlineRuns(node: ChildNode): TextRun[] {
  const runs: TextRun[] = [];

  function walk(n: ChildNode, bold = false, italic = false, underline = false, strike = false, color?: string) {
    if (n.nodeType === Node.TEXT_NODE) {
      const text = n.textContent ?? '';
      if (text) {
        runs.push(new TextRun({
          text,
          bold,
          italics: italic,
          underline: underline ? { type: UnderlineType.SINGLE } : undefined,
          strike,
          color: color?.replace('#', ''),
        }));
      }
      return;
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return;
    const el = n as Element;
    const tag = el.tagName.toLowerCase();
    const isBold = bold || tag === 'strong' || tag === 'b';
    const isItalic = italic || tag === 'em' || tag === 'i';
    const isUnderline = underline || tag === 'u';
    const isStrike = strike || tag === 's' || tag === 'del';
    // couleur inline
    const style = el.getAttribute('style') ?? '';
    const colorMatch = style.match(/color:\s*([#\w]+)/);
    const nodeColor = colorMatch ? colorMatch[1] : color;

    for (const child of Array.from(el.childNodes)) {
      walk(child, isBold, isItalic, isUnderline, isStrike, nodeColor);
    }
  }

  walk(node);
  return runs;
}

function alignmentOf(el: Element): AlignmentType {
  const style = el.getAttribute('style') ?? '';
  const cls = el.getAttribute('class') ?? '';
  if (style.includes('text-align: center') || cls.includes('text-center')) return AlignmentType.CENTER;
  if (style.includes('text-align: right') || cls.includes('text-right')) return AlignmentType.RIGHT;
  if (style.includes('text-align: justify') || cls.includes('text-justify')) return AlignmentType.JUSTIFIED;
  return AlignmentType.LEFT;
}

function parseBlock(el: Element): Paragraph[] {
  const tag = el.tagName.toLowerCase();
  const align = alignmentOf(el);

  const headingMap: Record<string, HeadingLevel> = {
    h1: HeadingLevel.HEADING_1,
    h2: HeadingLevel.HEADING_2,
    h3: HeadingLevel.HEADING_3,
    h4: HeadingLevel.HEADING_4,
  };

  if (headingMap[tag]) {
    return [new Paragraph({
      heading: headingMap[tag],
      alignment: align,
      children: parseInlineRuns(el),
    })];
  }

  if (tag === 'p' || tag === 'div') {
    return [new Paragraph({ alignment: align, children: parseInlineRuns(el) })];
  }

  if (tag === 'ul' || tag === 'ol') {
    const paras: Paragraph[] = [];
    Array.from(el.querySelectorAll('li')).forEach((li, idx) => {
      paras.push(new Paragraph({
        bullet: tag === 'ul' ? { level: 0 } : undefined,
        numbering: tag === 'ol' ? { reference: 'default-numbering', level: 0 } : undefined,
        children: [new TextRun(li.textContent ?? '')],
      }));
    });
    return paras;
  }

  if (tag === 'blockquote') {
    return [new Paragraph({
      indent: { left: 720 },
      children: [new TextRun({ text: el.textContent ?? '', italics: true, color: '6b7280' })],
    })];
  }

  if (tag === 'hr') {
    return [new Paragraph({ thematicBreak: true })];
  }

  // fallback : texte brut
  const text = el.textContent ?? '';
  if (text.trim()) return [new Paragraph({ children: [new TextRun(text)] })];
  return [];
}

function parseTableEl(tableEl: Element) {
  const rows = Array.from(tableEl.querySelectorAll('tr')).map((tr) => {
    const cells = Array.from(tr.querySelectorAll('th, td')).map((td) =>
      new TableCell({
        children: [new Paragraph({ children: [new TextRun(td.textContent ?? '')] })],
        shading: td.tagName.toLowerCase() === 'th'
          ? { type: ShadingType.CLEAR, fill: 'f9fafb' }
          : undefined,
      })
    );
    return new TableRow({ children: cells });
  });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
  });
}

function htmlToDocxChildren(html: string): (Paragraph | Table)[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild!;
  const children: (Paragraph | Table)[] = [];

  for (const child of Array.from(root.children)) {
    const tag = child.tagName.toLowerCase();
    if (tag === 'table') {
      children.push(parseTableEl(child));
    } else {
      children.push(...parseBlock(child));
    }
  }

  if (children.length === 0) {
    children.push(new Paragraph({ children: [new TextRun(root.textContent ?? '')] }));
  }

  return children;
}

// ─── Export DOCX ─────────────────────────────────────────────────────────────

export async function exportDocx(title: string, html: string): Promise<void> {
  const children = htmlToDocxChildren(html);

  const docxDoc = new Document({
    numbering: {
      config: [{
        reference: 'default-numbering',
        levels: [{
          level: 0,
          format: 'decimal',
          text: '%1.',
          alignment: AlignmentType.LEFT,
        }],
      }],
    },
    sections: [{
      properties: {
        page: {
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
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

export function exportPdf(title: string, html: string): void {
  const styles = `
    @page { size: A4; margin: 2cm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 12pt;
      line-height: 1.8;
      color: #1a1a1a;
    }
    h1 { font-size: 22pt; font-weight: 700; margin: 0.8em 0 0.4em; }
    h2 { font-size: 18pt; font-weight: 700; margin: 0.7em 0 0.35em; }
    h3 { font-size: 14pt; font-weight: 600; margin: 0.6em 0 0.3em; }
    h4 { font-size: 12pt; font-weight: 600; margin: 0.5em 0 0.25em; }
    p  { margin-bottom: 0.6em; }
    ul, ol { padding-left: 1.5em; margin-bottom: 0.6em; }
    li { margin-bottom: 0.2em; }
    blockquote { border-left: 3px solid #01696f; padding: 0.4em 0 0.4em 1em; margin: 0.8em 0; color: #6b7280; font-style: italic; }
    table { border-collapse: collapse; width: 100%; margin: 0.8em 0; }
    th, td { border: 1px solid #d1d5db; padding: 0.4em 0.6em; }
    th { background: #f9fafb; font-weight: 600; }
    strong { font-weight: 700; }
    em { font-style: italic; }
    u  { text-decoration: underline; }
    s  { text-decoration: line-through; }
    a  { color: #01696f; }
    [data-variable-field] {
      display: inline; border: 1px solid currentColor; border-radius: 3px;
      padding: 0 4px; font-size: 0.85em;
    }
  `;

  const srcdoc = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>${styles}</style></head>
<body>${html}</body></html>`;

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:210mm;height:297mm;border:none;';
  iframe.srcdoc = srcdoc;
  document.body.appendChild(iframe);

  iframe.onload = () => {
    // On donne le titre à la fenêtre pour que le PDF proposé porte le bon nom
    if (iframe.contentWindow) {
      iframe.contentWindow.document.title = title;
      setTimeout(() => {
        iframe.contentWindow!.print();
        setTimeout(() => document.body.removeChild(iframe), 1000);
      }, 200);
    }
  };
}
