/**
 * Pipeline de génération du bordereau de pièces.
 *
 * Pour chaque pièce :
 *   1. convertit le blob source en `PDFDocument` (pdf-lib) via
 *      `sourceBlobToPdf` ;
 *   2. apppose le tampon (image + numéro) selon les réglages ;
 *   3. sauvegarde le PDF résultant et crée un `Document` dans la GED
 *      du dossier (avec `fileBlob` local — non synchronisé via Drive).
 *
 * Génère ensuite le PDF récap « Bordereau de communication de pièces »
 * et l'ajoute également comme `Document`.
 *
 * Si une génération précédente existe (`generatedDocumentIds`), elle
 * est supprimée AVANT la nouvelle génération pour éviter d'accumuler.
 */

import { db, getStampSettings } from '@/lib/db';
import type {
  Bordereau,
  BordereauPiece,
  Document,
  Dossier,
} from '@/types';
import { sourceBlobToPdf } from './source-to-pdf';
import { applyStamp } from './stamp-renderer';
import { buildRecapPdf } from './recap-pdf';

export interface GenerationProgress {
  step:
    | 'cleanup'
    | 'piece'
    | 'recap'
    | 'finalize';
  /** Index de la pièce courante (0-based, pour `step='piece'`). */
  index?: number;
  total?: number;
  pieceLabel?: string;
}

export interface GenerationResult {
  generatedDocumentIds: number[];
  recapDocumentId: number;
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[\/\\:*?"<>|]/g, '_') // caractères interdits FS
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

function pieceTitleFor(pieceNumber: string, customName: string): string {
  const num = pieceNumber.trim() || '?';
  const designation = customName.trim() || 'Pièce';
  return sanitizeFileName(`Pièce n°${num} : ${designation}`);
}

async function deletePreviousGeneration(b: Bordereau): Promise<void> {
  const ids = [
    ...(b.generatedDocumentIds ?? []),
    ...(b.generatedRecapDocumentId != null
      ? [b.generatedRecapDocumentId]
      : []),
  ];
  if (ids.length === 0) return;
  await db.documents.bulkDelete(ids);
}

export async function generateBordereau(
  bordereau: Bordereau,
  dossier: Dossier,
  onProgress?: (p: GenerationProgress) => void,
): Promise<GenerationResult> {
  const settings = await getStampSettings();
  const pieces = (
    await db.bordereauPieces
      .where('bordereauId')
      .equals(bordereau.id!)
      .toArray()
  ).sort((a, b) => a.order - b.order);

  if (pieces.length === 0) {
    throw new Error('Aucune pièce à générer dans ce bordereau.');
  }

  onProgress?.({ step: 'cleanup' });
  await deletePreviousGeneration(bordereau);

  const now = new Date();
  const generatedDocumentIds: number[] = [];

  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    const title = pieceTitleFor(piece.pieceNumber, piece.customName);
    onProgress?.({
      step: 'piece',
      index: i,
      total: pieces.length,
      pieceLabel: title,
    });

    let pdfDoc;
    try {
      pdfDoc = await sourceBlobToPdf(piece.sourceBlob, piece.sourceMimeType);
    } catch (err) {
      throw new Error(
        `Impossible de convertir « ${piece.sourceFileName} » en PDF : ${(err as Error).message}`,
      );
    }
    await applyStamp(pdfDoc, settings, piece.pieceNumber);
    const bytes = await pdfDoc.save();
    const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], {
      type: 'application/pdf',
    });

    const docPayload: Document = {
      title,
      type: 'imported',
      content: '',
      dossierId: dossier.id,
      tags: ['pièce', `bordereau:${bordereau.id}`],
      fileBlob: blob,
      fileMimeType: 'application/pdf',
      sourceFile: piece.sourceFileName,
      createdAt: now,
      updatedAt: now,
      wordCount: 0,
    };
    const id = await db.documents.add(docPayload);
    generatedDocumentIds.push(Number(id));
  }

  // Récapitulatif
  onProgress?.({ step: 'recap' });
  const recapBlob = await buildRecapPdf({
    bordereauName: bordereau.name,
    dossierLabel: `${dossier.reference} — ${dossier.name}`,
    pieces: pieces.map((p) => ({
      pieceNumber: p.pieceNumber,
      designation: p.customName,
    })),
  });
  const recapTitle = sanitizeFileName(
    `${bordereau.name} — Bordereau de communication de pièces`,
  );
  const recapDoc: Document = {
    title: recapTitle,
    type: 'imported',
    content: '',
    dossierId: dossier.id,
    tags: ['bordereau-récap', `bordereau:${bordereau.id}`],
    fileBlob: recapBlob,
    fileMimeType: 'application/pdf',
    createdAt: now,
    updatedAt: now,
    wordCount: 0,
  };
  const recapId = Number(await db.documents.add(recapDoc));

  // Met à jour le projet de bordereau
  onProgress?.({ step: 'finalize' });
  await db.bordereaux.update(bordereau.id!, {
    generatedDocumentIds,
    generatedRecapDocumentId: recapId,
    lastGeneratedAt: now,
    updatedAt: now,
  });

  return {
    generatedDocumentIds,
    recapDocumentId: recapId,
  };
}

/**
 * Supprime uniquement les Documents PDF générés par la précédente
 * exécution. Le projet de bordereau (sélection des pièces, réglages)
 * est conservé.
 */
export async function clearGeneratedBordereau(
  bordereau: Bordereau,
): Promise<void> {
  await deletePreviousGeneration(bordereau);
  await db.bordereaux.update(bordereau.id!, {
    generatedDocumentIds: [],
    generatedRecapDocumentId: undefined,
    lastGeneratedAt: undefined,
    updatedAt: new Date(),
  });
}

/**
 * Génère un PDF tamponné pour UNE seule pièce (utilisé par l'aperçu
 * « avec tampon » en Phase 4). N'écrit pas en base.
 */
export async function buildStampedPreview(
  piece: BordereauPiece,
): Promise<Blob> {
  const settings = await getStampSettings();
  const pdf = await sourceBlobToPdf(piece.sourceBlob, piece.sourceMimeType);
  await applyStamp(pdf, settings, piece.pieceNumber);
  const bytes = await pdf.save();
  return new Blob([bytes as Uint8Array<ArrayBuffer>], {
    type: 'application/pdf',
  });
}
