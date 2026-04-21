/**
 * Drive backup / restore — stratégie de merge record-par-record.
 *
 * Remplace le clear-all + bulkAdd précédent par un merge qui :
 *   - conserve la version la plus récente (updatedAt/createdAt) quand un record
 *     existe localement ET sur Drive
 *   - propage les suppressions distantes : si un record connu au dernier sync
 *     n'existe plus sur Drive, il est supprimé localement
 *   - conserve les créations locales postérieures au dernier sync
 *
 * Ainsi deux appareils actifs en même temps ne peuvent plus écraser mutuellement
 * leurs modifications : la synchro pull-merge-push fusionne les deux états.
 */

import type { Table } from 'dexie';
import { db } from './db';
import type { MylawBackup } from './drive-sync';

// ─── Clés internes à exclure du backup ──────────────────────────────────────
// Ces clés vivent dans db.settings mais représentent l'état de sync local de
// l'appareil : elles NE doivent PAS voyager via Drive sinon elles corrompent
// l'état des autres appareils (boucle de sync, faux "déjà connecté"…).
export const INTERNAL_SETTING_KEYS = new Set<string>([
  'drive_connected',
  'last_synced_at',
  'last_sync_error',
  'last_sync_success_at',
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
 *   updatedAt > lastUsedAt > createdAt > date.
 * Permet au merge de comparer des entités qui n'ont pas toutes la même forme.
 */
export function recordTime(r: any): number {
  return (
    toTime(r?.updatedAt) ||
    toTime(r?.lastUsedAt) ||
    toTime(r?.createdAt) ||
    toTime(r?.date) ||
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

async function mergeTable<T extends { id?: number }>(
  table: Table<T>,
  remoteRecords: T[] | undefined,
  opts: MergeOptions,
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
      if (recordTime(r) > recordTime(l)) toPut.push(r);
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

  // Parcours distant : on ajoute les records absents localement.
  for (const [id, r] of Array.from(remoteById.entries())) {
    if (!localById.has(id)) toPut.push(r);
  }

  if (toPut.length) await table.bulkPut(toPut);
  if (toDelete.length) await table.bulkDelete(toDelete);
}

// ─── Build / Merge principaux ───────────────────────────────────────────────

export async function buildBackup(): Promise<MylawBackup> {
  const [
    documents, folders, snippets, deadlines,
    templates, tools, aiChats, bricks, infoLabels, fieldDefs, sessions,
    dossiers, contacts, dossierContacts, documentContacts,
    timeEntries, expenses, fixedFees, invoices,
    documentLinks, documentVersions,
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
  ]);

  // Settings : on EXCLUT les clés internes pour ne pas polluer les autres appareils.
  const settingsRows = await db.settings.toArray();
  const settings: Record<string, unknown> = {};
  for (const row of settingsRows) {
    if (!INTERNAL_SETTING_KEYS.has(row.key)) settings[row.key] = row.value;
  }

  return {
    version: 4,
    exportedAt: new Date().toISOString(),
    documents, folders, snippets, deadlines,
    templates, tools, aiChats,
    bricks, infoLabels, fieldDefs, sessions,
    dossiers, contacts, dossierContacts, documentContacts,
    timeEntries, expenses, fixedFees, invoices,
    documentLinks, documentVersions,
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

  await mergeTable(db.documents,              backup.documents,  opts);
  await mergeTable(db.folders,                backup.folders,    opts);
  await mergeTable(db.table('snippets'),      backup.snippets,   opts);
  await mergeTable(db.table('deadlines'),     backup.deadlines,  opts);
  await mergeTable(db.table('templates'),     backup.templates,  opts);
  await mergeTable(db.table('tools'),         backup.tools,      opts);
  await mergeTable(db.table('aiChats'),       backup.aiChats,    opts);
  await mergeTable(db.table('bricks'),        backup.bricks,     opts);
  await mergeTable(db.table('infoLabels'),    backup.infoLabels, opts);
  await mergeTable(db.table('fieldDefs'),     backup.fieldDefs,  opts);
  await mergeTable(db.table('sessions'),      backup.sessions,   opts);
  // v4 — onglet Dossiers
  await mergeTable(db.dossiers,           backup.dossiers,         opts);
  await mergeTable(db.contacts,           backup.contacts,         opts);
  await mergeTable(db.dossierContacts,    backup.dossierContacts,  opts);
  await mergeTable(db.documentContacts,   backup.documentContacts, opts);
  await mergeTable(db.timeEntries,        backup.timeEntries,      opts);
  await mergeTable(db.expenses,           backup.expenses,         opts);
  await mergeTable(db.fixedFees,          backup.fixedFees,        opts);
  await mergeTable(db.invoices,           backup.invoices,         opts);
  await mergeTable(db.documentLinks,      backup.documentLinks,    opts);
  await mergeTable(db.documentVersions,   backup.documentVersions, opts);

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
