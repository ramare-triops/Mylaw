import Dexie, { type Table } from 'dexie';
import type {
  Document,
  Folder,
  ToolRecord,
  Template,
  Session,
  Snippet,
  AIChat,
  HistoryEntry,
  Deadline,
  Brick,
  InfoLabel,
} from '@/types';

type SettingsRecord = { key: string; value: unknown };

// ─── Clés internes au moteur de sync ───────────────────────────────────────
// Leur mutation ne doit PAS déclencher un nouveau cycle de sync (sinon boucle).
// Doit rester aligné avec INTERNAL_SETTING_KEYS dans lib/drive-merge.ts.
const INTERNAL_SETTING_KEYS_DB = new Set<string>([
  'drive_connected',
  'last_synced_at',
  'last_sync_error',
  'last_sync_success_at',
]);

/**
 * Retourne true si la mutation Dexie concerne UNIQUEMENT des clés internes
 * de la table `settings`. Dans ce cas on n'ouvre pas de nouveau cycle de sync.
 */
function isInternalSettingsMutation(tableName: string, req: any): boolean {
  if (tableName !== 'settings') return false;
  if (!req) return false;
  // Dexie dbcore : req.type = 'add' | 'put' | 'delete' | 'deleteRange'
  if (req.type === 'add' || req.type === 'put') {
    const values = Array.isArray(req.values) ? req.values : [];
    if (values.length === 0) return false;
    return values.every((v: any) => v && INTERNAL_SETTING_KEYS_DB.has(v.key));
  }
  if (req.type === 'delete') {
    const keys = Array.isArray(req.keys) ? req.keys : [];
    if (keys.length === 0) return false;
    return keys.every((k: any) => INTERNAL_SETTING_KEYS_DB.has(k));
  }
  return false;
}

// ─── Callback de sync ─────────────────────────────────────────────────────────────────
// Enregistre un callback que le DriveSyncProvider branche au démarrage.
// Appelé automatiquement à chaque écriture Dexie (add, put, delete, clear).
let _driveScheduleSync: (() => void) | null = null;

export function registerDriveSyncCallback(fn: () => void) {
  _driveScheduleSync = fn;
}

export function triggerDriveSync() {
  _driveScheduleSync?.();
}

// ─── Base de données ───────────────────────────────────────────────────────────────────

export class MyLexDatabase extends Dexie {
  documents!: Table<Document>;
  folders!: Table<Folder>;
  tools!: Table<ToolRecord>;
  templates!: Table<Template>;
  sessions!: Table<Session>;
  snippets!: Table<Snippet>;
  aiChats!: Table<AIChat>;
  settings!: Table<SettingsRecord>;
  history!: Table<HistoryEntry>;
  deadlines!: Table<Deadline>;
  bricks!: Table<Brick>;
  infoLabels!: Table<InfoLabel>;

  constructor() {
    super('MyLexDB');

    this.version(1).stores({
      documents:
        '++id, title, type, folderId, updatedAt, tags, *searchTokens',
      folders: '++id, name, parentId, color, createdAt',
      tools: '++id, slug, name, pinned, order, config, lastUsedAt',
      templates: '++id, name, category, content, variables, createdAt',
      sessions: '++id, date, toolId, content, tags',
      snippets: '++id, trigger, expansion, category',
      aiChats: '++id, documentId, messages, createdAt',
      settings: 'key',
      history: '++id, action, entityId, entityType, timestamp',
      deadlines: '++id, title, dossier, dueDate, type, done, createdAt',
    });

    // ─── Version 2 : ajout des briques et des étiquettes d'information ────
    this.version(2).stores({
      documents:
        '++id, title, type, folderId, updatedAt, tags, *searchTokens',
      folders: '++id, name, parentId, color, createdAt',
      tools: '++id, slug, name, pinned, order, config, lastUsedAt',
      templates: '++id, name, category, content, variables, createdAt',
      sessions: '++id, date, toolId, content, tags',
      snippets: '++id, trigger, expansion, category',
      aiChats: '++id, documentId, messages, createdAt',
      settings: 'key',
      history: '++id, action, entityId, entityType, timestamp',
      deadlines: '++id, title, dossier, dueDate, type, done, createdAt',
      bricks: '++id, title, category, infoLabelId, updatedAt, *tags',
      infoLabels: '++id, name, color, createdAt',
    });

    // ─── Middleware : déclenche le sync Drive sur toute mutation ───
    // On intercepte add, put, delete, clear sur toutes les tables sauf :
    //   - 'history' (audit log interne, jamais synchronisé)
    //   - Les écritures sur db.settings dont la clé est interne au moteur
    //     de sync lui-même (drive_connected, last_synced_at, last_sync_error,
    //     last_sync_success_at). Sans cette exclusion, chaque sync écrit
    //     last_synced_at, ce qui retrigger une sync, ce qui réécrit, etc. →
    //     boucle infinie.
    this.use({
      stack: 'dbcore',
      name: 'drive-auto-sync',
      create(downlevel) {
        return {
          ...downlevel,
          table(tableName: string) {
            const table = downlevel.table(tableName);
            if (tableName === 'history') return table;
            return {
              ...table,
              mutate(req: any) {
                const result = table.mutate(req);
                // Décide si la mutation doit déclencher un sync.
                const shouldTrigger = !isInternalSettingsMutation(tableName, req);
                result.then(() => {
                  if (shouldTrigger && !_restoreInProgress) triggerDriveSync();
                }).catch(() => {});
                return result;
              },
            };
          },
        };
      },
    });
  }
}

export const db = new MyLexDatabase();

// ─── Flag anti-boucle pour le restore ────────────────────────────────────────────────
// Pendant un restoreFromBackup, on désactive le middleware pour ne pas
// re-uploader immédiatement les données qu'on vient de télécharger.
let _restoreInProgress = false;

export function setRestoreInProgress(v: boolean) {
  _restoreInProgress = v;
}

// ─── Settings helpers ───────────────────────────────────────────────────────────────────
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const record = await db.settings.get(key);
  return record ? (record.value as T) : fallback;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}

// ─── Document helpers ───────────────────────────────────────────────────────────────────
export async function saveDocument(doc: Document): Promise<number> {
  const id = await db.documents.put(doc);
  await db.history.add({
    action: doc.id ? 'update' : 'create',
    entityId: Number(id),
    entityType: 'document',
    timestamp: new Date(),
  });
  return Number(id);
}

export async function deleteDocument(id: number): Promise<void> {
  await db.documents.delete(id);
  await db.history.add({
    action: 'delete',
    entityId: id,
    entityType: 'document',
    timestamp: new Date(),
  });
}

export async function searchDocuments(query: string): Promise<Document[]> {
  const lower = query.toLowerCase();
  return db.documents
    .filter(
      (d) =>
        d.title.toLowerCase().includes(lower) ||
        (d.contentRaw ?? '').toLowerCase().includes(lower) ||
        d.tags.some((t) => t.toLowerCase().includes(lower))
    )
    .toArray();
}

// ─── Brick helpers ─────────────────────────────────────────────────────────────────────
export async function saveBrick(brick: Brick): Promise<number> {
  const now = new Date();
  const payload: Brick = { ...brick, updatedAt: now, createdAt: brick.createdAt ?? now };
  const id = await db.bricks.put(payload);
  return Number(id);
}

export async function deleteBrick(id: number): Promise<void> {
  await db.bricks.delete(id);
}

export async function searchBricks(query: string): Promise<Brick[]> {
  const lower = query.toLowerCase();
  return db.bricks
    .filter(
      (b) =>
        b.title.toLowerCase().includes(lower) ||
        b.content.toLowerCase().includes(lower) ||
        b.tags.some((t) => t.toLowerCase().includes(lower))
    )
    .toArray();
}

// ─── InfoLabel helpers ─────────────────────────────────────────────────────────────────
export async function saveInfoLabel(label: InfoLabel): Promise<number> {
  const id = await db.infoLabels.put(label);
  return Number(id);
}

export async function deleteInfoLabel(id: number): Promise<void> {
  // Détacher les briques qui référençaient cette étiquette
  const linked = await db.bricks.where('infoLabelId').equals(id).toArray();
  await Promise.all(
    linked.map((b) => db.bricks.put({ ...b, infoLabelId: undefined }))
  );
  await db.infoLabels.delete(id);
}
