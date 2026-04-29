/**
 * Apposition du tampon virtuel sur un `PDFDocument` pdf-lib.
 *
 * Le tampon est composé de :
 *   - une image (sceau du cabinet, PNG ou JPG ; les SVG sont rastérisés
 *     en PNG dès l'import dans les réglages) ;
 *   - le numéro de pièce écrit en dessous, dans la police, la taille
 *     et la couleur configurées.
 *
 * Position : grille 3 × 3, avec une marge intérieure de 5 % de la
 * dimension de la page. Taille : `sizeRatio` × largeur de la page,
 * appliquée à la BOX du tampon (l'image conserve son ratio à
 * l'intérieur de cette box, le texte est inscrit en dessous).
 *
 * « allPages = false » → tampon uniquement sur la première page.
 */

import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  type Color,
} from 'pdf-lib';
import { sizeRatio } from '@/components/tools/StampSettingsDialog';
import type { StampFont, StampPosition, StampSettings } from '@/types';

/** Taille de la fonte du numéro en proportion de la largeur de la box.
 *  Le numéro est dessiné par-dessus le sceau, centré : on peut le faire
 *  un peu plus gros que lorsqu'il était écrit en dessous. */
const TEXT_SIZE_RATIO = 0.3;
/** Marge intérieure des 9 positions (en proportion de la dimension page). */
const MARGIN_RATIO = 0.05;

function fontForStamp(font: StampFont): keyof typeof StandardFonts {
  switch (font) {
    case 'Times':
      return 'TimesRomanBold';
    case 'Courier':
      return 'CourierBold';
    case 'Helvetica':
    case 'Inter':
    case 'Georgia':
    default:
      // pdf-lib n'inclut que 14 fontes standard (PDF 1.7). Inter et
      // Georgia ne sont pas standardisées → fallback Helvetica-Bold.
      return 'HelveticaBold';
  }
}

function hexToColor(hex: string): Color {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return rgb(0.78, 0.12, 0.12); // rouge cabinet par défaut
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255);
}

interface StampGeometry {
  boxX: number;
  boxY: number;
  boxW: number;
  boxH: number;
}

function geometryFor(
  page: PDFPage,
  position: StampPosition,
  boxSize: number,
): StampGeometry {
  const { width: W, height: H } = page.getSize();
  const mx = W * MARGIN_RATIO;
  const my = H * MARGIN_RATIO;
  const xLeft = mx;
  const xCenter = (W - boxSize) / 2;
  const xRight = W - boxSize - mx;
  // pdf-lib : Y croît vers le HAUT. « top » dans l'UI ⇒ y haut PDF.
  const yTop = H - boxSize - my;
  const yMiddle = (H - boxSize) / 2;
  const yBottom = my;
  const map: Record<StampPosition, { x: number; y: number }> = {
    'top-left': { x: xLeft, y: yTop },
    'top-center': { x: xCenter, y: yTop },
    'top-right': { x: xRight, y: yTop },
    'middle-left': { x: xLeft, y: yMiddle },
    'middle-center': { x: xCenter, y: yMiddle },
    'middle-right': { x: xRight, y: yMiddle },
    'bottom-left': { x: xLeft, y: yBottom },
    'bottom-center': { x: xCenter, y: yBottom },
    'bottom-right': { x: xRight, y: yBottom },
  };
  const { x, y } = map[position];
  return { boxX: x, boxY: y, boxW: boxSize, boxH: boxSize };
}

interface PreparedStamp {
  image: PDFImage | null;
  font: PDFFont;
  color: Color;
}

async function prepareStamp(
  pdf: PDFDocument,
  settings: StampSettings,
): Promise<PreparedStamp> {
  let image: PDFImage | null = null;
  if (settings.imageDataUrl) {
    const bytes = dataUrlToUint8Array(settings.imageDataUrl);
    if (settings.imageMimeType === 'image/jpeg') {
      image = await pdf.embedJpg(bytes);
    } else {
      image = await pdf.embedPng(bytes);
    }
  }
  const font = await pdf.embedFont(StandardFonts[fontForStamp(settings.font)]);
  return { image, font, color: hexToColor(settings.numberColor) };
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const i = dataUrl.indexOf(',');
  const b64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let k = 0; k < bin.length; k++) out[k] = bin.charCodeAt(k);
  return out;
}

/** Texte inscrit sur le tampon : uniquement le numéro de la pièce. */
function stampLabel(pieceNumber: string): string {
  return pieceNumber.trim();
}

function drawStampOnPage(
  page: PDFPage,
  prepared: PreparedStamp,
  settings: StampSettings,
  pieceNumber: string,
): void {
  const { width: W } = page.getSize();
  const boxSize = W * sizeRatio(settings.size);
  const { boxX, boxY, boxW, boxH } = geometryFor(
    page,
    settings.position,
    boxSize,
  );

  // Image : occupe toute la box, ratio préservé, centrée.
  if (prepared.image) {
    const iw = prepared.image.width;
    const ih = prepared.image.height;
    const scale = Math.min(boxW / iw, boxH / ih);
    const w = iw * scale;
    const h = ih * scale;
    page.drawImage(prepared.image, {
      x: boxX + (boxW - w) / 2,
      y: boxY + (boxH - h) / 2,
      width: w,
      height: h,
      opacity: 1,
    });
  }

  // Numéro : superposé au centre exact du sceau (par-dessus l'image).
  const label = stampLabel(pieceNumber);
  if (label) {
    const fontSize = boxW * TEXT_SIZE_RATIO;
    const textWidth = prepared.font.widthOfTextAtSize(label, fontSize);
    const textHeight = prepared.font.heightAtSize(fontSize);
    const textX = boxX + (boxW - textWidth) / 2;
    // Y est la baseline du texte chez pdf-lib. On veut le centre
    // visuel du glyph (≈ moitié de la hauteur de capitale) au centre
    // de la box.
    const textY = boxY + (boxH - textHeight) / 2;
    page.drawText(label, {
      x: textX,
      y: textY,
      size: fontSize,
      font: prepared.font,
      color: prepared.color,
    });
  }
}

export async function applyStamp(
  pdf: PDFDocument,
  settings: StampSettings,
  pieceNumber: string,
): Promise<void> {
  const prepared = await prepareStamp(pdf, settings);
  const pages = pdf.getPages();
  const target = settings.allPages ? pages : pages.slice(0, 1);
  for (const page of target) {
    drawStampOnPage(page, prepared, settings, pieceNumber);
  }
}
