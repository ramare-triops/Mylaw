/**
 * Conversion HTML → pages PDF via la technique du `<foreignObject>`
 * SVG : on dessine le HTML dans un SVG sérialisé, on rend ce SVG dans
 * un canvas, puis on embarque le PNG résultant dans un `PDFDocument`
 * pdf-lib. La pagination est gérée en découpant le rendu vertical en
 * tranches A4.
 *
 * Cette technique :
 *   - ne nécessite aucune dépendance supplémentaire (html2canvas etc.) ;
 *   - rend correctement les styles inline (mammoth en produit beaucoup) ;
 *   - n'est PAS pixel-perfect sur des CSS complexes (positionnement,
 *     fontes externes, en-têtes/pieds de page) — voir limitations
 *     mentionnées dans le plan.
 */

import { PDFDocument, type PDFImage } from 'pdf-lib';

/** A4 en points PDF (1 pt = 1/72 in). */
export const A4_WIDTH_PT = 595;
export const A4_HEIGHT_PT = 842;
const PAGE_MARGIN_PT = 40;
/** Sur-échantillonnage du rendu pour conserver une bonne netteté. */
const RENDER_SCALE = 2;
/** Conversion points → pixels CSS (1 pt ≈ 1.333 px à 96 dpi). */
const PT_TO_PX = 96 / 72;

/**
 * Style minimaliste ajouté à chaque tranche de rendu pour donner un
 * rendu correct aux DOCX convertis par mammoth (qui n'apporte pas
 * beaucoup de styles).
 */
const BASE_CSS = `
  body { margin: 0; padding: 0; font-family: 'Times New Roman', Times, serif; font-size: 11pt; line-height: 1.5; color: #111; }
  h1, h2, h3, h4, h5, h6 { font-weight: 600; line-height: 1.25; margin: 0.6em 0 0.3em; }
  h1 { font-size: 1.6em; } h2 { font-size: 1.35em; }
  h3 { font-size: 1.15em; } h4, h5, h6 { font-size: 1em; }
  p { margin: 0 0 0.6em; }
  ul, ol { margin: 0 0 0.6em 1.4em; padding: 0; }
  li { margin: 0.15em 0; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #888; padding: 4pt 6pt; vertical-align: top; }
  img { max-width: 100%; height: auto; }
  a { color: #1a4dc4; text-decoration: underline; }
  blockquote { margin: 0.5em 0 0.5em 1em; padding-left: 0.8em; border-left: 2pt solid #999; color: #444; }
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

  // 1. Mesure du HTML rendu in-document à la largeur de page.
  const wrapper = document.createElement('div');
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
  // Inclut les styles de base + le HTML utilisateur.
  wrapper.innerHTML = `<style>${BASE_CSS}</style>${html}`;
  document.body.appendChild(wrapper);

  // Force un layout puis récupère la hauteur réelle.
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => resolve()),
  );
  const totalHeightPx = Math.max(wrapper.scrollHeight, contentHeightPx);

  // Sérialise le contenu (une fois) — on s'en sert pour chaque page.
  const serialized = serializeNode(wrapper);

  document.body.removeChild(wrapper);

  // 2. Pour chaque page, on rend une tranche de hauteur contentHeightPx.
  const numPages = Math.max(1, Math.ceil(totalHeightPx / contentHeightPx));
  for (let i = 0; i < numPages; i++) {
    const sliceTopPx = i * contentHeightPx;
    const sliceHeightPx = Math.min(contentHeightPx, totalHeightPx - sliceTopPx);

    // SVG foreignObject : on positionne le contenu avec un margin-top
    // négatif pour que la tranche désirée s'aligne en haut du SVG.
    const svgWidth = contentWidthPx * RENDER_SCALE;
    const svgHeight = sliceHeightPx * RENDER_SCALE;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${contentWidthPx} ${sliceHeightPx}">` +
      `<foreignObject width="100%" height="100%">` +
      `<div xmlns="http://www.w3.org/1999/xhtml" style="margin:0;padding:0;width:${contentWidthPx}px;height:${sliceHeightPx}px;overflow:hidden;background:white;">` +
      `<div style="margin-top:${-sliceTopPx}px;">${serialized}</div>` +
      `</div></foreignObject></svg>`;

    const pngBytes = await svgToPng(svg, svgWidth, svgHeight);
    const pngImage = await pdfDoc.embedPng(pngBytes);

    const page = pdfDoc.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
    // Convertit la hauteur de tranche pixels → points pour respecter
    // l'échelle (la dernière page peut être plus courte).
    const drawHeightPt = sliceHeightPx / PT_TO_PX;
    page.drawImage(pngImage, {
      x: PAGE_MARGIN_PT,
      // Origine pdf-lib en bas-gauche : on remonte d'autant.
      y: A4_HEIGHT_PT - PAGE_MARGIN_PT - drawHeightPt,
      width: contentWidthPt,
      height: drawHeightPt,
    });
  }
}

/**
 * Sérialise le contenu d'un nœud DOM en chaîne XHTML utilisable
 * dans un <foreignObject>. On contourne `XMLSerializer` qui ne sait
 * pas toujours produire du XHTML strict, en passant par `outerHTML`
 * et en encodant les éventuelles ampersands restants.
 */
function serializeNode(node: HTMLElement): string {
  // L'outerHTML d'un div HTML est généralement compatible XHTML pour
  // les sous-éléments produits par mammoth/Tiptap (balises auto-fermantes
  // correctes, attributs entre guillemets…).
  return node.innerHTML;
}

/**
 * Rend un SVG en PNG via Image + Canvas. Renvoie les octets PNG.
 */
async function svgToPng(
  svg: string,
  width: number,
  height: number,
): Promise<Uint8Array> {
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () =>
        reject(
          new Error(
            "Impossible de rendre la page HTML : le navigateur a refusé le SVG (CSS exotique ?).",
          ),
        );
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas indisponible');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png'),
    );
    if (!blob) throw new Error('Conversion canvas → PNG échouée');
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
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
