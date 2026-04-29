/**
 * Génère le PDF récapitulatif « Bordereau de communication de pièces ».
 *
 * Pour la v1, le contenu est volontairement minimal : titre, dossier,
 * date, tableau (n° / désignation), total. Le contenu détaillé sera
 * affiné ultérieurement à partir des instructions du cabinet.
 */

import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFPage,
  type PDFFont,
} from 'pdf-lib';
import { A4_WIDTH_PT, A4_HEIGHT_PT } from './html-to-pdf';

export interface RecapPiece {
  pieceNumber: string;
  designation: string;
}

export interface RecapInput {
  bordereauName: string;
  dossierLabel: string;
  pieces: RecapPiece[];
}

const MARGIN = 56;
const TITLE_SIZE = 18;
const SUBTITLE_SIZE = 11;
const HEADER_SIZE = 9;
const ROW_SIZE = 10;
const ROW_PADDING = 6;
const COL_NUM_W = 80;
const FOOTER_SIZE = 9;

export async function buildRecapPdf(input: RecapInput): Promise<Blob> {
  const pdf = await PDFDocument.create();
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
  let cursorY = A4_HEIGHT_PT - MARGIN;

  // Titre principal
  page.drawText('Bordereau de communication de pièces', {
    x: MARGIN,
    y: cursorY - TITLE_SIZE,
    size: TITLE_SIZE,
    font: helvBold,
    color: rgb(0.1, 0.2, 0.4),
  });
  cursorY -= TITLE_SIZE + 14;

  // Sous-titres
  page.drawText(input.bordereauName, {
    x: MARGIN,
    y: cursorY - SUBTITLE_SIZE,
    size: SUBTITLE_SIZE,
    font: helv,
    color: rgb(0.2, 0.2, 0.2),
  });
  cursorY -= SUBTITLE_SIZE + 4;
  page.drawText(`Dossier : ${input.dossierLabel}`, {
    x: MARGIN,
    y: cursorY - SUBTITLE_SIZE,
    size: SUBTITLE_SIZE,
    font: helv,
    color: rgb(0.3, 0.3, 0.3),
  });
  cursorY -= SUBTITLE_SIZE + 4;
  const today = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  page.drawText(`Édité le ${today}`, {
    x: MARGIN,
    y: cursorY - SUBTITLE_SIZE,
    size: SUBTITLE_SIZE,
    font: helv,
    color: rgb(0.4, 0.4, 0.4),
  });
  cursorY -= SUBTITLE_SIZE + 18;

  // Filet horizontal
  page.drawRectangle({
    x: MARGIN,
    y: cursorY,
    width: A4_WIDTH_PT - 2 * MARGIN,
    height: 0.8,
    color: rgb(0.6, 0.6, 0.6),
  });
  cursorY -= 14;

  // En-têtes du tableau
  page.drawText('N°', {
    x: MARGIN,
    y: cursorY - HEADER_SIZE,
    size: HEADER_SIZE,
    font: helvBold,
    color: rgb(0.2, 0.2, 0.2),
  });
  page.drawText('Désignation de la pièce', {
    x: MARGIN + COL_NUM_W,
    y: cursorY - HEADER_SIZE,
    size: HEADER_SIZE,
    font: helvBold,
    color: rgb(0.2, 0.2, 0.2),
  });
  cursorY -= HEADER_SIZE + 4;
  page.drawRectangle({
    x: MARGIN,
    y: cursorY,
    width: A4_WIDTH_PT - 2 * MARGIN,
    height: 0.5,
    color: rgb(0.6, 0.6, 0.6),
  });
  cursorY -= 8;

  const designationW = A4_WIDTH_PT - 2 * MARGIN - COL_NUM_W;

  // Lignes
  for (const p of input.pieces) {
    const wrapped = wrapText(p.designation || '—', helv, ROW_SIZE, designationW);
    const rowHeight =
      Math.max(1, wrapped.length) * (ROW_SIZE + 2) + 2 * ROW_PADDING;
    if (cursorY - rowHeight < MARGIN + 30) {
      page = pdf.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
      cursorY = A4_HEIGHT_PT - MARGIN;
    }
    // N°
    page.drawText(p.pieceNumber || '—', {
      x: MARGIN,
      y: cursorY - ROW_SIZE - 2,
      size: ROW_SIZE,
      font: helvBold,
      color: rgb(0.1, 0.1, 0.1),
    });
    // Désignation (multi-lignes)
    let lineY = cursorY - ROW_SIZE - 2;
    for (const line of wrapped) {
      page.drawText(line, {
        x: MARGIN + COL_NUM_W,
        y: lineY,
        size: ROW_SIZE,
        font: helv,
        color: rgb(0.1, 0.1, 0.1),
      });
      lineY -= ROW_SIZE + 2;
    }
    cursorY -= rowHeight;
    // Filet de ligne
    page.drawRectangle({
      x: MARGIN,
      y: cursorY,
      width: A4_WIDTH_PT - 2 * MARGIN,
      height: 0.3,
      color: rgb(0.85, 0.85, 0.85),
    });
    cursorY -= 4;
  }

  // Pied de page : total et mention de production
  drawFooter(
    page,
    helv,
    `${input.pieces.length} pièce${input.pieces.length > 1 ? 's' : ''} communiquée${input.pieces.length > 1 ? 's' : ''}.`,
  );
  for (let i = 0; i < pdf.getPageCount(); i++) {
    drawPageNumber(pdf.getPage(i), helv, i + 1, pdf.getPageCount());
  }

  const bytes = await pdf.save();
  return new Blob([bytes as Uint8Array<ArrayBuffer>], {
    type: 'application/pdf',
  });
}

function drawFooter(page: PDFPage, font: PDFFont, text: string) {
  page.drawText(text, {
    x: MARGIN,
    y: MARGIN - 12,
    size: FOOTER_SIZE,
    font,
    color: rgb(0.45, 0.45, 0.45),
  });
}

function drawPageNumber(
  page: PDFPage,
  font: PDFFont,
  current: number,
  total: number,
) {
  const txt = `${current} / ${total}`;
  const w = font.widthOfTextAtSize(txt, FOOTER_SIZE);
  page.drawText(txt, {
    x: A4_WIDTH_PT - MARGIN - w,
    y: MARGIN - 12,
    size: FOOTER_SIZE,
    font,
    color: rgb(0.45, 0.45, 0.45),
  });
}

/**
 * Découpe un texte en lignes adaptées à la largeur disponible. Pas de
 * césure au milieu d'un mot (sauf mot trop long).
 */
function wrapText(
  text: string,
  font: { widthOfTextAtSize(s: string, size: number): number },
  size: number,
  maxWidth: number,
): string[] {
  if (!text) return [''];
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let current = '';
    for (const w of words) {
      const candidate = current ? `${current} ${w}` : w;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        // Mot plus long que la largeur : on le force.
        if (font.widthOfTextAtSize(w, size) > maxWidth) {
          let chunk = '';
          for (const ch of w) {
            if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
              if (chunk) lines.push(chunk);
              chunk = ch;
            } else {
              chunk += ch;
            }
          }
          current = chunk;
        } else {
          current = w;
        }
      }
    }
    if (current) lines.push(current);
  }
  return lines.length > 0 ? lines : [''];
}
