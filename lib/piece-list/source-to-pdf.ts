/**
 * Convertit le blob source d'une pièce (PDF, DOCX, PNG, JPG) en
 * `PDFDocument` prêt à être tamponné. Cette étape ne pose aucun
 * tampon — elle se contente d'unifier le format.
 *
 * Pipeline par type :
 *   - application/pdf → PDFDocument.load (preserve les pages)
 *   - image/png, image/jpeg → 1 page A4 contenant l'image centrée
 *   - .docx → mammoth → HTML → SVG foreignObject → canvas → PDF
 *
 * Les SVG ne sont pas acceptés en pièce (uniquement pour l'image
 * du tampon, où on les rastérise à l'import).
 */

import { PDFDocument } from 'pdf-lib';
import mammoth from 'mammoth';
import {
  appendHtmlAsPdfPages,
  appendImageAsPdfPage,
} from './html-to-pdf';

export async function sourceBlobToPdf(
  blob: Blob,
  mimeType: string,
): Promise<PDFDocument> {
  const lower = mimeType.toLowerCase();
  if (lower.includes('pdf')) {
    const bytes = await blob.arrayBuffer();
    return PDFDocument.load(bytes, { ignoreEncryption: true });
  }
  if (lower === 'image/png') {
    const pdf = await PDFDocument.create();
    const img = await pdf.embedPng(await blob.arrayBuffer());
    appendImageAsPdfPage(pdf, img);
    return pdf;
  }
  if (lower === 'image/jpeg' || lower === 'image/jpg') {
    const pdf = await PDFDocument.create();
    const img = await pdf.embedJpg(await blob.arrayBuffer());
    appendImageAsPdfPage(pdf, img);
    return pdf;
  }
  if (
    lower.includes('word') ||
    lower.includes('officedocument') ||
    lower === 'application/msword'
  ) {
    const arrayBuffer = await blob.arrayBuffer();
    // mammoth produit un HTML « propre » (paragraphes, titres, listes,
    // tableaux simples). Il ne préserve pas les en-têtes/pieds, polices
    // exotiques, sauts de page manuels, etc.
    const result = await mammoth.convertToHtml({ arrayBuffer });
    const pdf = await PDFDocument.create();
    await appendHtmlAsPdfPages(result.value || '<p></p>', pdf);
    return pdf;
  }
  throw new Error(`Type non supporté : ${mimeType}`);
}
