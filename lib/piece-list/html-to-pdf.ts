/**
 * Conversion HTML → pages PDF.
 *
 * Le rendu utilise `html2canvas` (présent dans les dépendances) plutôt
 * que la technique du `<foreignObject>` SVG : cette dernière fait
 * tainter le canvas dans Chrome dès que le HTML embarque la moindre
 * ressource (image, certaines polices ou simplement un attribut SVG
 * particulier). `html2canvas` clone le DOM et le redessine élément
 * par élément, sans passer par un Blob image, donc sans taint.
 *
 * Limitations connues (best-effort, comme convenu) :
 *   - les polices custom ne sont pas embarquées dans le PDF ;
 *   - les images cross-origin sans CORS sont remplacées par un cadre
 *     vide ;
 *   - les sauts de page logiques ne sont pas honorés (la pagination
 *     est simplement géométrique : on découpe verticalement en pages
 *     A4).
 */

import { PDFDocument, type PDFImage } from 'pdf-lib';
import html2canvas from 'html2canvas';

/** A4 en points PDF (1 pt = 1/72 in). */
export const A4_WIDTH_PT = 595;
export const A4_HEIGHT_PT = 842;
const PAGE_MARGIN_PT = 40;
/** Sur-échantillonnage du rendu pour conserver une bonne netteté. */
const RENDER_SCALE = 2;
/** Conversion points → pixels CSS (1 pt ≈ 1.333 px à 96 dpi). */
const PT_TO_PX = 96 / 72;

/**
 * Style minimaliste appliqué au wrapper. Ces règles couvrent le HTML
 * produit par mammoth (DOCX) et celui produit par Tiptap (brouillons).
 */
const BASE_CSS = `
  body { margin: 0; padding: 0; }
  .mylaw-html-wrapper { font-family: 'Times New Roman', Times, serif; font-size: 11pt; line-height: 1.5; color: #111; background: white; }
  .mylaw-html-wrapper h1, .mylaw-html-wrapper h2, .mylaw-html-wrapper h3,
  .mylaw-html-wrapper h4, .mylaw-html-wrapper h5, .mylaw-html-wrapper h6 {
    font-weight: 600; line-height: 1.25; margin: 0.6em 0 0.3em;
  }
  .mylaw-html-wrapper h1 { font-size: 1.6em; }
  .mylaw-html-wrapper h2 { font-size: 1.35em; }
  .mylaw-html-wrapper h3 { font-size: 1.15em; }
  .mylaw-html-wrapper h4, .mylaw-html-wrapper h5, .mylaw-html-wrapper h6 { font-size: 1em; }
  .mylaw-html-wrapper p { margin: 0 0 0.6em; }
  .mylaw-html-wrapper ul, .mylaw-html-wrapper ol { margin: 0 0 0.6em 1.4em; padding: 0; }
  .mylaw-html-wrapper li { margin: 0.15em 0; }
  .mylaw-html-wrapper table { border-collapse: collapse; width: 100%; }
  .mylaw-html-wrapper th, .mylaw-html-wrapper td { border: 1px solid #888; padding: 4pt 6pt; vertical-align: top; }
  .mylaw-html-wrapper img { max-width: 100%; height: auto; }
  .mylaw-html-wrapper a { color: #1a4dc4; text-decoration: underline; }
  .mylaw-html-wrapper blockquote { margin: 0.5em 0 0.5em 1em; padding-left: 0.8em; border-left: 2pt solid #999; color: #444; }
`;

/**
 * Mesure la hauteur totale du HTML à la largeur de page utile, puis
 * ajoute autant de pages PDF que nécessaire.
 */
export async function appendHtmlAsPdfPages(
  html: string,
  pdfDoc: PDFDocument,
): Promise<void> {
  const contentWidthPt = A4_WIDTH_PT - 2 * PAGE_MARGIN_PT;
  const contentHeightPt = A4_HEIGHT_PT - 2 * PAGE_MARGIN_PT;
  const contentWidthPx = Math.round(contentWidthPt * PT_TO_PX);
  const contentHeightPx = Math.round(contentHeightPt * PT_TO_PX);

  // 1. On insère le HTML dans un wrapper hors champ, à la bonne largeur.
  const wrapper = document.createElement('div');
  wrapper.className = 'mylaw-html-wrapper';
  wrapper.style.cssText = `
    position: fixed;
    left: -99999px;
    top: 0;
    width: ${contentWidthPx}px;
    background: white;
    color: #111;
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  `;

  const styleEl = document.createElement('style');
  styleEl.textContent = BASE_CSS;
  wrapper.appendChild(styleEl);

  const content = document.createElement('div');
  content.innerHTML = html;
  wrapper.appendChild(content);
  document.body.appendChild(wrapper);

  // Attend un cycle de layout (et le chargement éventuel des images).
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => resolve()),
  );
  await waitForImages(wrapper);

  let fullCanvas: HTMLCanvasElement;
  try {
    fullCanvas = await html2canvas(wrapper, {
      scale: RENDER_SCALE,
      backgroundColor: '#ffffff',
      // useCORS demande à html2canvas de tenter le chargement
      // cross-origin avec crossOrigin="anonymous" — quand le serveur
      // renvoie le bon entête, l'image est rendue ; sinon, html2canvas
      // saute l'image plutôt que de tainter le canvas.
      useCORS: true,
      // Laisse html2canvas escamoter les ressources non-CORS plutôt
      // que de tainter (allowTaint: false).
      allowTaint: false,
      logging: false,
      width: contentWidthPx,
      windowWidth: contentWidthPx,
    });
  } finally {
    document.body.removeChild(wrapper);
  }

  // 2. Découpe le canvas plein-format en tranches A4.
  const sliceHeightPx = contentHeightPx * RENDER_SCALE;
  const totalHeightPx = fullCanvas.height;
  const numPages = Math.max(1, Math.ceil(totalHeightPx / sliceHeightPx));

  for (let i = 0; i < numPages; i++) {
    const yOffset = i * sliceHeightPx;
    const thisHeight = Math.min(sliceHeightPx, totalHeightPx - yOffset);

    const slice = document.createElement('canvas');
    slice.width = fullCanvas.width;
    slice.height = thisHeight;
    const ctx = slice.getContext('2d');
    if (!ctx) throw new Error('Canvas indisponible');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(
      fullCanvas,
      0,
      yOffset,
      fullCanvas.width,
      thisHeight,
      0,
      0,
      fullCanvas.width,
      thisHeight,
    );

    const pngBlob = await new Promise<Blob | null>((resolve) =>
      slice.toBlob((b) => resolve(b), 'image/png'),
    );
    if (!pngBlob) throw new Error('Conversion canvas → PNG échouée');
    const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());
    const pngImage = await pdfDoc.embedPng(pngBytes);

    const page = pdfDoc.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
    const drawHeightPt = thisHeight / RENDER_SCALE / PT_TO_PX;
    page.drawImage(pngImage, {
      x: PAGE_MARGIN_PT,
      y: A4_HEIGHT_PT - PAGE_MARGIN_PT - drawHeightPt,
      width: contentWidthPt,
      height: drawHeightPt,
    });
  }
}

/**
 * Attend que toutes les `<img>` du wrapper aient terminé de charger
 * (ou échoué). Sans ça, html2canvas peut prendre une mesure de
 * hauteur prématurée.
 */
async function waitForImages(root: HTMLElement, timeoutMs = 8000): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img'));
  if (imgs.length === 0) return;
  const all = imgs.map(
    (img) =>
      new Promise<void>((resolve) => {
        if (img.complete) {
          resolve();
          return;
        }
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };
        img.addEventListener('load', finish, { once: true });
        img.addEventListener('error', finish, { once: true });
        setTimeout(finish, timeoutMs);
      }),
  );
  await Promise.all(all);
}

/** Variante utilitaire : intègre une image bitmap (PNG/JPG) en pleine
 *  page A4, conservée à son ratio, centrée. */
export function appendImageAsPdfPage(
  pdfDoc: PDFDocument,
  image: PDFImage,
): void {
  const page = pdfDoc.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
  const usableW = A4_WIDTH_PT - 2 * PAGE_MARGIN_PT;
  const usableH = A4_HEIGHT_PT - 2 * PAGE_MARGIN_PT;
  const { width: iw, height: ih } = image;
  const scale = Math.min(usableW / iw, usableH / ih);
  const w = iw * scale;
  const h = ih * scale;
  page.drawImage(image, {
    x: (A4_WIDTH_PT - w) / 2,
    y: (A4_HEIGHT_PT - h) / 2,
    width: w,
    height: h,
  });
}
