/**
 * Drive backup / restore — stratégie de merge record-par-record.
 *
 * Schéma de synchronisation à deux étages :
 *   - les MÉTADONNÉES de toutes les tables sont sérialisées dans un
 *     unique fichier JSON Drive (`mylaw-backup.json`) ;
 *   - les BLOBS binaires des Attachments et BordereauPieces sont
 *     stockés dans des fichiers Drive séparés (un par blob),
 *     référencés depuis le JSON par `driveFileId` + `contentHash`.
 *
 * Avantages : le JSON reste de taille raisonnable (mégaoctets) même
 * pour les utilisateurs qui ont versé des centaines de pièces ; les
 * blobs sont téléchargés à la demande et seulement quand ils
 * changent (détection via hash).
 */

import type { Table } from 'dexie';
import {
  db,
  deleteAttachment as deleteAttachmentRecord,
  loadTombstonesByTable,
} from './db';
import type { MylawBackup } from './drive-sync';
import type { Attachment, BordereauPiece } from '@/types';
import {
  computeBlobHash,
  deleteBlobFromDrive,
  downloadBlobFromDrive,
  uploadBlobToDrive,
} from './drive-blobs';

// ─── Clés internes à exclure du backup ──────────────────────────────────────
// Ces clés vivent dans db.settings mais représentent l'état de sync local de
// l'appareil : elles NE doivent PAS voyager via Drive sinon elles corrompent
// l'état des autres appareils (boucle de sync, faux "déjà connecté"…).
export const INTERNAL_SETTING_KEYS = new Set<string>([
  'drive_connected',
  'last_synced_at',
  'last_sync_error',
  'last_sync_success_at',
  // Horodatages « dernière ouverture » par dossier — par définition
  // locaux, par appareil.
  'dossier_last_opened_v1',
]);

// ─── Extraction d'un timestamp comparable ───────────────────────────────────

function toTime(value: unknown): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : 0;
  }
  if (typeof value === 'number') return value;
  return 0;
}

/**
 * Timestamp de dernière modif "au mieux" :
 *   updatedAt > lastUsedAt > createdAt > date > uploadedAt.
 * Permet au merge de comparer des entités qui n'ont pas toutes la même forme.
 */
export function recordTime(r: any): number {
  return (
    toTime(r?.updatedAt) ||
    toTime(r?.lastUsedAt) ||
    toTime(r?.createdAt) ||
    toTime(r?.date) ||
    toTime(r?.uploadedAt) ||
    0
  );
}

// ─── Merge générique ────────────────────────────────────────────────────────

interface MergeOptions {
  /** Backup.exportedAt, sert de watermark pour détecter les suppressions distantes. */
  remoteExportedAt: number;
  /** last_synced_at local, permet de distinguer création locale fraîche vs suppression distante. */
  localSyncedAt: number;
}

/**
 * Champs locaux à PRÉSERVER quand on remplace un record local par sa
 * version distante. Les blobs binaires (`blob`, `sourceBlob`) ne
 * voyagent pas par le JSON : leur contenu vit dans la table locale
 * uniquement. Si le hash distant est inchangé, le blob local reste
 * valide ; sinon, il est obsolète et sera re-téléchargé en
 * arrière-plan via `driveFileId`.
 */
const PRESERVED_LOCAL_FIELDS = ['blob', 'sourceBlob'] as const;

async function mergeTable<T extends { id?: number }>(
  table: Table<T>,
  remoteRecords: T[] | undefined,
  opts: MergeOptions,
  /** Set des `id` supprimés localement et pas encore poussés. Les
   *  records distants présents dans ce set NE sont PAS ré-importés
   *  (anti-resurrection). */
  tombstones: Set<number> | undefined = undefined,
): Promise<void> {
  const remote = Array.isArray(remoteRecords) ? remoteRecords : [];
  const local = await table.toArray();

  const remoteById = new Map<number, T>();
  for (const r of remote) if (r.id != null) remoteById.set(r.id, r);

  const localById = new Map<number, T>();
  for (const l of local) if (l.id != null) localById.set(l.id, l);

  const toPut: T[] = [];
  const toDelete: number[] = [];

  // Parcours local : gestion des collisions + détection des suppressions distantes
  for (const [id, l] of Array.from(localById.entries())) {
    const r = remoteById.get(id);
    if (r) {
      // Les deux existent : on garde celui au timestamp le plus récent.
      if (recordTime(r) > recordTime(l)) {
        toPut.push(mergeWithLocalBlobs(r, l));
      }
      // sinon on ne touche pas (local est déjà plus récent ou égal).
      continue;
    }
    // Local-seulement : suppression distante si le record était connu au dernier sync.
    const lTime = recordTime(l);
    // Si le record est plus ancien que le dernier sync ET que le backup distant
    // est postérieur au dernier sync, c'est qu'il a été supprimé ailleurs.
    if (lTime <= opts.localSyncedAt && opts.remoteExportedAt > opts.localSyncedAt) {
      toDelete.push(id);
    }
    // Sinon : création locale postérieure au dernier sync → on la conserve.
  }

  // Parcours distant : on ajoute les records absents localement, SAUF
  // ceux que nous venons de supprimer en local (tombstones). Sans
  // cette protection, le record disparaîtrait quelques secondes après
  // suppression, le temps du prochain pull, puis réapparaîtrait —
  // jusqu'à ce que notre push propre soit envoyé.
  for (const [id, r] of Array.from(remoteById.entries())) {
    if (localById.has(id)) continue;
    if (tombstones?.has(id)) continue;
    toPut.push(r);
  }

  if (toPut.length) await table.bulkPut(toPut);
  if (toDelete.length) await table.bulkDelete(toDelete);
}

/**
 * Quand le remote remplace le local, on conserve les blobs locaux si
 * le `contentHash` distant correspond (le binaire en cache est encore
 * à jour). Si les hashs diffèrent, on jette le blob local — il sera
 * re-téléchargé en arrière-plan.
 */
function mergeWithLocalBlobs<T>(remote: T, local: T): T {
  const r = remote as Record<string, unknown>;
  const l = local as Record<string, unknown>;
  const remoteHash = typeof r.contentHash === 'string' ? r.contentHash : null;
  const localHash = typeof l.contentHash === 'string' ? l.contentHash : null;
  const hashUnchanged =
    remoteHash != null && localHash != null && remoteHash === localHash;
  if (!hashUnchanged) return remote;
  const next: Record<string, unknown> = { ...r };
  for (const f of PRESERVED_LOCAL_FIELDS) {
    if (l[f] != null && next[f] == null) next[f] = l[f];
  }
  return next as T;
}

// ─── Sérialisation Drive : strip des blobs ─────────────────────────────────
//
// Les Blob ne survivent pas à un round-trip JSON. Avant d'inclure les
// attachments / bordereauPieces dans le backup, on retire `blob` /
// `sourceBlob`. Le binaire vit dans son propre fichier Drive
// (référencé par `driveFileId`).

type StrippedAttachment = Omit<Attachment, 'blob'>;
type StrippedBordereauPiece = Omit<BordereauPiece, 'sourceBlob'>;

function stripAttachmentBlob(a: Attachment): StrippedAttachment {
  const { blob: _blob, ...rest } = a;
  return rest;
}

function stripBordereauPieceBlob(p: BordereauPiece): StrippedBordereauPiece {
  const { sourceBlob: _sb, ...rest } = p;
  return rest;
}

// ─── Pre-upload des blobs avant push JSON ─────────────────────────────────
//
// Pour chaque attachment ou bordereauPiece qui porte un blob local mais
// dont (a) le `driveFileId` est absent, ou (b) le `contentHash` ne
// correspond plus au hash courant du blob, on uploade le blob vers
// Drive (PATCH si fileId existant, CREATE sinon) puis on persiste les
// nouvelles valeurs `driveFileId` + `contentHash` sur le record local.
//
// Cette opération est appelée AVANT la sérialisation du backup : les
// records publiés portent ainsi des références Drive à jour.
//
// Best-effort : si un upload échoue (réseau, quota, etc.), on continue
// quand même — la métadonnée du record est publiée sans `driveFileId`
// et le prochain cycle de sync ré-essayera.

interface BlobBackupStats {
  uploadsAttempted: number;
  uploadsSucceeded: number;
  uploadsFailed: number;
}

async function ensureBlobsUploaded(): Promise<BlobBackupStats> {
  const stats: BlobBackupStats = {
    uploadsAttempted: 0,
    uploadsSucceeded: 0,
    uploadsFailed: 0,
  };

  const attachments = await db.attachments.toArray();
  for (const a of attachments) {
    if (!a.blob || a.id == null) continue;
    let currentHash: string;
    try {
      currentHash = await computeBlobHash(a.blob);
    } catch {
      continue;
    }
    if (a.driveFileId && a.contentHash === currentHash) continue;
    stats.uploadsAttempted += 1;
    try {
      const result = await uploadBlobToDrive(a.blob, {
        driveFileId: a.driveFileId,
        name: a.name,
      });
      // On met à jour le record SANS toucher à `updatedAt` (ce n'est pas
      // une vraie modification : juste un upload). Si `updatedAt`
      // bougeait, on déclencherait une boucle de sync.
      await db.attachments.update(a.id, {
        driveFileId: result.driveFileId,
        contentHash: result.contentHash,
      });
      stats.uploadsSucceeded += 1;
    } catch (err) {
      stats.uploadsFailed += 1;
      console.warn(
        '[drive-sync] attachment blob upload failed',
        a.id,
        a.name,
        err,
      );
    }
  }

  const pieces = await db.bordereauPieces.toArray();
  for (const p of pieces) {
    if (!p.sourceBlob || p.id == null) continue;
    let currentHash: string;
    try {
      currentHash = await computeBlobHash(p.sourceBlob);
    } catch {
      continue;
    }
    if (p.driveFileId && p.contentHash === currentHash) continue;
    stats.uploadsAttempted += 1;
    try {
      const result = await uploadBlobToDrive(p.sourceBlob, {
        driveFileId: p.driveFileId,
        name: p.sourceFileName,
      });
      await db.bordereauPieces.update(p.id, {
        driveFileId: result.driveFileId,
        contentHash: result.contentHash,
      });
      stats.uploadsSucceeded += 1;
    } catch (err) {
      stats.uploadsFailed += 1;
      console.warn(
        '[drive-sync] bordereau piece blob upload failed',
        p.id,
        p.sourceFileName,
        err,
      );
    }
  }

  return stats;
}

// ─── Background download des blobs manquants ──────────────────────────────
//
// Après un merge, certains records peuvent avoir un `driveFileId` mais
// pas de blob local (typique sur un appareil neuf qui pull pour la
// première fois). On télécharge ces blobs en arrière-plan, séquentiellement
// pour ne pas saturer la bande passante.

let _backgroundDownloadInFlight: Promise<void> | null = null;

function fetchMissingBlobsBackground(): void {
  // Évite les downloads concurrents : si une passe est en cours,
  // on laisse celle-ci traiter les nouveaux records via une re-passe
  // à la fin (cf. boucle while ci-dessous).
  if (_backgroundDownloadInFlight) return;
  _backgroundDownloadInFlight = (async () => {
    try {
      let progressed = true;
      while (progressed) {
        progressed = false;

        const attachments = await db.attachments
          .where('driveFileId').above('')
          .toArray()
          .catch(() => [] as Attachment[]);
        for (const a of attachments) {
          if (a.blob || !a.driveFileId || a.id == null) continue;
          try {
            const blob = await downloadBlobFromDrive(a.driveFileId);
            if (blob) {
              await db.attachments.update(a.id, { blob });
              progressed = true;
            }
          } catch (err) {
            console.warn(
              '[drive-sync] attachment blob download failed',
              a.id,
              err,
            );
          }
        }

        const pieces = await db.bordereauPieces
          .where('driveFileId').above('')
          .toArray()
          .catch(() => [] as BordereauPiece[]);
        for (const p of pieces) {
          if (p.sourceBlob || !p.driveFileId || p.id == null) continue;
          try {
            const blob = await downloadBlobFromDrive(p.driveFileId);
            if (blob) {
              await db.bordereauPieces.update(p.id, { sourceBlob: blob });
              progressed = true;
            }
          } catch (err) {
            console.warn(
              '[drive-sync] bordereau piece blob download failed',
              p.id,
              err,
            );
          }
        }
      }
    } finally {
      _backgroundDownloadInFlight = null;
    }
  })();
}

// ─── Build / Merge principaux ───────────────────────────────────────────────

export async function buildBackup(): Promise<MylawBackup> {
  // Étape préalable : upload des blobs locaux modifiés ou non-uploadés.
  // On le fait AVANT la lecture des tables pour que les métadonnées qu'on
  // sérialise ensuite portent les `driveFileId` à jour.
  await ensureBlobsUploaded();

  const [
    documents, folders, snippets, deadlines,
    templates, tools, aiChats, bricks, infoLabels, fieldDefs, sessions,
    dossiers, contacts, dossierContacts, documentContacts,
    timeEntries, expenses, fixedFees, invoices,
    documentLinks, documentVersions, jots,
  ] = await Promise.all([
    db.documents.toArray(),
    db.folders.toArray(),
    db.table('snippets').toArray(),
    db.table('deadlines').toArray(),
    db.table('templates').toArray(),
    db.table('tools').toArray(),
    db.table('aiChats').toArray(),
    db.table('bricks').toArray(),
    db.table('infoLabels').toArray(),
    db.table('fieldDefs').toArray(),
    db.table('sessions').toArray(),
    db.dossiers.toArray(),
    db.contacts.toArray(),
    db.dossierContacts.toArray(),
    db.documentContacts.toArray(),
    db.timeEntries.toArray(),
    db.expenses.toArray(),
    db.fixedFees.toArray(),
    db.invoices.toArray(),
    db.documentLinks.toArray(),
    db.documentVersions.toArray(),
    db.table('jots').toArray().catch(() => []),
  ]);

  // v6 / v7 : tables d'outils ajoutées après coup. On les charge à part
  // pour que `buildBackup` reste robuste si l'utilisateur tourne sur une
  // base ancienne où la table n'existe pas encore.
  const interestCalculations = await db
    .table('interestCalculations').toArray().catch(() => []);
  const bordereaux = await db
    .table('bordereaux').toArray().catch(() => []);
  const stampSettings = await db
    .table('stampSettings').toArray().catch(() => []);

  // v8 : Attachments + BordereauPieces — on strippe les blobs avant
  // sérialisation. Les binaires ont déjà été uploadés au-dessus.
  const rawAttachments = await db.attachments.toArray().catch(() => []);
  const attachments = rawAttachments.map(stripAttachmentBlob);
  const rawPieces = await db.bordereauPieces.toArray().catch(() => []);
  const bordereauPieces = rawPieces.map(stripBordereauPieceBlob);

  // Settings : on EXCLUT les clés internes pour ne pas polluer les autres appareils.
  const settingsRows = await db.settings.toArray();
  const settings: Record<string, unknown> = {};
  for (const row of settingsRows) {
    if (!INTERNAL_SETTING_KEYS.has(row.key)) settings[row.key] = row.value;
  }

  return {
    version: 8,
    exportedAt: new Date().toISOString(),
    documents, folders, snippets, deadlines,
    templates, tools, aiChats,
    bricks, infoLabels, fieldDefs, sessions,
    dossiers, contacts, dossierContacts, documentContacts,
    timeEntries, expenses, fixedFees, invoices,
    documentLinks, documentVersions,
    jots,
    interestCalculations,
    bordereaux,
    stampSettings,
    attachments,
    bordereauPieces,
    settings,
  };
}

/**
 * Fusionne le backup distant dans Dexie sans clear-all.
 * Doit être appelé avec setRestoreInProgress(true) autour pour éviter
 * de re-déclencher une sync pendant l'import.
 */
export async function mergeFromBackup(
  backup: MylawBackup,
  localSyncedAtIso: string | null,
): Promise<void> {
  const opts: MergeOptions = {
    remoteExportedAt: backup.exportedAt ? Date.parse(backup.exportedAt) : 0,
    localSyncedAt:    localSyncedAtIso   ? Date.parse(localSyncedAtIso)  : 0,
  };

  // Chargement des tombstones locaux (suppressions en attente de push).
  // Indispensable pour empêcher la « résurrection » d'un record que
  // l'utilisateur vient de supprimer : le backup distant le contient
  // encore tant que notre push n'a pas été effectué.
  const ts = loadTombstonesByTable();
  if (ts.size > 0 && typeof console !== 'undefined' && console.debug) {
    console.debug(
      '[tombstone] merge with',
      Array.from(ts.entries()).map(([k, v]) => `${k}:${Array.from(v).join(',')}`),
    );
  }
  const T = (name: string): Set<number> | undefined => ts.get(name);

  await mergeTable(db.documents,              backup.documents,  opts, T('documents'));
  await mergeTable(db.folders,                backup.folders,    opts, T('folders'));
  await mergeTable(db.table('snippets'),      backup.snippets,   opts, T('snippets'));
  await mergeTable(db.table('deadlines'),     backup.deadlines,  opts, T('deadlines'));
  await mergeTable(db.table('templates'),     backup.templates,  opts, T('templates'));
  await mergeTable(db.table('tools'),         backup.tools,      opts, T('tools'));
  await mergeTable(db.table('aiChats'),       backup.aiChats,    opts, T('aiChats'));
  await mergeTable(db.table('bricks'),        backup.bricks,     opts, T('bricks'));
  await mergeTable(db.table('infoLabels'),    backup.infoLabels, opts, T('infoLabels'));
  await mergeTable(db.table('fieldDefs'),     backup.fieldDefs,  opts, T('fieldDefs'));
  await mergeTable(db.table('sessions'),      backup.sessions,   opts, T('sessions'));
  // v4 — onglet Dossiers
  await mergeTable(db.dossiers,           backup.dossiers,         opts, T('dossiers'));
  await mergeTable(db.contacts,           backup.contacts,         opts, T('contacts'));
  await mergeTable(db.dossierContacts,    backup.dossierContacts,  opts, T('dossierContacts'));
  await mergeTable(db.documentContacts,   backup.documentContacts, opts, T('documentContacts'));
  await mergeTable(db.timeEntries,        backup.timeEntries,      opts, T('timeEntries'));
  await mergeTable(db.expenses,           backup.expenses,         opts, T('expenses'));
  await mergeTable(db.fixedFees,          backup.fixedFees,        opts, T('fixedFees'));
  await mergeTable(db.invoices,           backup.invoices,         opts, T('invoices'));
  await mergeTable(db.documentLinks,      backup.documentLinks,    opts, T('documentLinks'));
  await mergeTable(db.documentVersions,   backup.documentVersions, opts, T('documentVersions'));
  // v5 — Jots / quick notes
  if (backup.jots) {
    await mergeTable(db.table('jots'), backup.jots, opts, T('jots'));
  }
  // v6 — Calculs d'intérêts au taux légal
  if (backup.interestCalculations) {
    await mergeTable(
      db.table('interestCalculations'),
      backup.interestCalculations,
      opts,
      T('interestCalculations'),
    );
  }
  // v7 — Bordereaux de pièces (projets + réglages du tampon)
  if (backup.bordereaux) {
    await mergeTable(
      db.table('bordereaux'),
      backup.bordereaux,
      opts,
      T('bordereaux'),
    );
  }
  if (backup.stampSettings) {
    await mergeTable(
      db.table('stampSettings'),
      backup.stampSettings,
      opts,
      T('stampSettings'),
    );
  }
  // v8 — Attachments et BordereauPieces (métadonnées seules, blobs en
  // fichiers Drive séparés). Suit l'opération : on déclenche le
  // téléchargement asynchrone des blobs manquants en tâche de fond.
  if (backup.attachments) {
    await mergeTable(
      db.attachments,
      backup.attachments,
      opts,
      T('attachments'),
    );
  }
  if (backup.bordereauPieces) {
    await mergeTable(
      db.bordereauPieces,
      backup.bordereauPieces,
      opts,
      T('bordereauPieces'),
    );
  }
  fetchMissingBlobsBackground();

  // Settings : clé par clé, on ne touche JAMAIS aux clés internes locales.
  const remoteSettings = backup.settings ?? {};
  for (const [key, value] of Object.entries(remoteSettings)) {
    if (INTERNAL_SETTING_KEYS.has(key)) continue;
    await db.settings.put({ key, value });
  }
  // Note : on ne supprime pas les settings locaux absents du backup. Les clés
  // user-editable sont créées/écrasées par l'utilisateur, jamais supprimées,
  // donc une absence distante ne signifie pas "à effacer".
}

// ─── Garbage collection des blobs Drive ────────────────────────────────────
//
// Quand un attachment ou une bordereauPiece est supprimé en local, on
// doit aussi retirer le fichier Drive associé. Ces helpers sont
// exportés pour être appelés depuis les wrappers `deleteAttachment` /
// `deleteBordereau` (cf. lib/db.ts).

export async function gcAttachmentDriveBlob(att: Attachment): Promise<void> {
  if (!att.driveFileId) return;
  await deleteBlobFromDrive(att.driveFileId);
}

export async function gcBordereauPieceDriveBlob(
  piece: BordereauPiece,
): Promise<void> {
  if (!piece.driveFileId) return;
  await deleteBlobFromDrive(piece.driveFileId);
}

// Utilitaire interne pour `deleteBordereau` (cf. lib/db.ts) — supprime
// le record local d'un Attachment et son blob Drive en une opération.
export async function deleteAttachmentWithDriveBlob(
  id: number,
): Promise<void> {
  const a = await db.attachments.get(id);
  if (a) await gcAttachmentDriveBlob(a);
  await deleteAttachmentRecord(id);
}
