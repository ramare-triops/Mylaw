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
} from '@/types';

type SettingsRecord = { key: string; value: unknown };

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
  }
}

export const db = new MyLexDatabase();

// ─── Settings helpers ────────────────────────────────────────────────────────
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const record = await db.settings.get(key);
  return record ? (record.value as T) : fallback;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}

// ─── Document helpers ────────────────────────────────────────────────────────
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
