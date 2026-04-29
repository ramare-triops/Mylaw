/**
 * Pipeline de génération du bordereau de pièces.
 *
 * Pour chaque pièce :
 *   1. convertit le blob source en `PDFDocument` (pdf-lib) via
 *      `sourceBlobToPdf` ;
 *   2. apposition du tampon (image + numéro) selon les réglages ;
 *   3. sauvegarde le PDF résultant comme `Attachment` du dossier (le
 *      blob binaire vit dans la table `attachments`, locale, et la
 *      pièce s'ouvre directement comme PDF dans la GED — non comme
 *      brouillon Tiptap vide).
 *
 * Génère ensuite le PDF récap « Bordereau de communication de pièces »
 * et l'ajoute également comme `Attachment`.
 *
 * Si une génération précédente existe (`generatedAttachmentIds`), elle
 * est supprimée AVANT la nouvelle génération pour éviter d'accumuler.
 */

import { db, getStampSettings, saveAttachment, deleteAttachment } from '@/lib/db';
import type {
  Attachment,
  Bordereau,
  BordereauPiece,
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
  generatedAttachmentIds: number[];
  recapAttachmentId: number;
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
    ...(b.generatedAttachmentIds ?? []),
    ...(b.generatedRecapAttachmentId != null
      ? [b.generatedRecapAttachmentId]
      : []),
  ];
  if (ids.length === 0) return;
  // On utilise deleteAttachment plutôt que bulkDelete pour conserver
  // l'audit log et un retour d'erreur cohérent en cas d'attachement
  // déjà supprimé manuellement par l'utilisateur.
  for (const id of ids) {
    try {
      await deleteAttachment(id);
    } catch {
      // ignoré : l'utilisateur a peut-être déjà retiré le fichier
      // depuis la GED.
    }
  }
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
  const generatedAttachmentIds: number[] = [];

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

    const filename = `${title}.pdf`;
    const att: Attachment = {
      dossierId: dossier.id!,
      name: filename,
      mimeType: 'application/pdf',
      size: blob.size,
      blob,
      tags: ['pièce', `bordereau:${bordereau.id}`],
      uploadedAt: now,
    };
    const id = await saveAttachment(att);
    generatedAttachmentIds.push(id);
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
  const recapFilename = sanitizeFileName(
    `${bordereau.name} — Bordereau de communication de pièces`,
  ) + '.pdf';
  const recapAtt: Attachment = {
    dossierId: dossier.id!,
    name: recapFilename,
    mimeType: 'application/pdf',
    size: recapBlob.size,
    blob: recapBlob,
    tags: ['bordereau-récap', `bordereau:${bordereau.id}`],
    uploadedAt: now,
  };
  const recapId = await saveAttachment(recapAtt);

  // Met à jour le projet de bordereau
  onProgress?.({ step: 'finalize' });
  await db.bordereaux.update(bordereau.id!, {
    generatedAttachmentIds,
    generatedRecapAttachmentId: recapId,
    lastGeneratedAt: now,
    updatedAt: now,
  });

  return {
    generatedAttachmentIds,
    recapAttachmentId: recapId,
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
    generatedAttachmentIds: [],
    generatedRecapAttachmentId: undefined,
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
