import Dexie, { type Table } from 'dexie';
import type {
  Document,
  DocumentVersion,
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
  Dossier,
  Contact,
  DossierContact,
  DocumentContact,
  TimeEntry,
  Expense,
  FixedFee,
  Invoice,
  Attachment,
  DocumentLink,
  AuditEntry,
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
  documentVersions!: Table<DocumentVersion>;
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
  // ─── v3 : onglet Dossiers ──────────────────────────────────────────────
  dossiers!: Table<Dossier>;
  contacts!: Table<Contact>;
  dossierContacts!: Table<DossierContact>;
  documentContacts!: Table<DocumentContact>;
  timeEntries!: Table<TimeEntry>;
  expenses!: Table<Expense>;
  fixedFees!: Table<FixedFee>;
  invoices!: Table<Invoice>;
  attachments!: Table<Attachment>;
  documentLinks!: Table<DocumentLink>;
  auditLog!: Table<AuditEntry>;

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

    // ─── Version 3 : Dossiers, Contacts, Finance, Versions, Audit ─────────
    this.version(3).stores({
      documents:
        '++id, title, type, folderId, dossierId, status, category, updatedAt, tags, *searchTokens',
      documentVersions: '++id, documentId, timestamp',
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
      dossiers:
        '++id, reference, name, type, status, updatedAt, createdAt, *tags',
      contacts:
        '++id, type, lastName, companyName, email, updatedAt, *tags',
      dossierContacts:
        '++id, dossierId, contactId, role, [dossierId+contactId]',
      documentContacts:
        '++id, documentId, contactId, role, [documentId+contactId]',
      timeEntries:
        '++id, dossierId, documentId, contactId, date, billable, billed, invoiceId',
      expenses:
        '++id, dossierId, documentId, date, category, billed, invoiceId',
      fixedFees:
        '++id, dossierId, documentId, date, kind, billed, invoiceId',
      invoices:
        '++id, dossierId, reference, date, status',
      attachments:
        '++id, dossierId, documentId, name, mimeType, uploadedAt, *tags',
      documentLinks:
        '++id, documentId, dossierId, [documentId+dossierId]',
      auditLog:
        '++id, dossierId, entityType, entityId, action, timestamp',
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
            // Tables jamais synchronisées vers Drive (locales pures) :
            //  - history / auditLog : journaux internes
            //  - attachments : blobs binaires, trop lourds pour un JSON Drive
            if (
              tableName === 'history' ||
              tableName === 'auditLog' ||
              tableName === 'attachments'
            ) return table;
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

// ─── Audit helpers ────────────────────────────────────────────────────────
export async function logAudit(entry: Omit<AuditEntry, 'id' | 'timestamp'> & { timestamp?: Date }): Promise<void> {
  await db.auditLog.add({
    ...entry,
    timestamp: entry.timestamp ?? new Date(),
  } as AuditEntry);
}

// ─── Dossier helpers ──────────────────────────────────────────────────────
export async function saveDossier(dossier: Dossier): Promise<number> {
  const now = new Date();
  const payload: Dossier = {
    ...dossier,
    updatedAt: now,
    createdAt: dossier.createdAt ?? now,
  };
  const isUpdate = dossier.id != null;
  const id = await db.dossiers.put(payload);
  await logAudit({
    dossierId: Number(id),
    entityType: 'dossier',
    entityId: Number(id),
    action: isUpdate ? 'update' : 'create',
  });
  return Number(id);
}

export async function deleteDossier(id: number): Promise<void> {
  // On détache les documents mais on ne les supprime pas (ils restent dans la GED).
  const docs = await db.documents.where('dossierId').equals(id).toArray();
  await Promise.all(
    docs.map((d) =>
      db.documents.put({ ...d, dossierId: undefined, updatedAt: new Date() })
    )
  );
  // Suppression cascade des entités exclusivement rattachées au dossier.
  await db.dossierContacts.where('dossierId').equals(id).delete();
  await db.timeEntries.where('dossierId').equals(id).delete();
  await db.expenses.where('dossierId').equals(id).delete();
  await db.fixedFees.where('dossierId').equals(id).delete();
  await db.invoices.where('dossierId').equals(id).delete();
  await db.attachments.where('dossierId').equals(id).delete();
  await db.documentLinks.where('dossierId').equals(id).delete();
  await db.dossiers.delete(id);
  await logAudit({
    dossierId: id,
    entityType: 'dossier',
    entityId: id,
    action: 'delete',
  });
}

// ─── Contact helpers ──────────────────────────────────────────────────────
export async function saveContact(contact: Contact): Promise<number> {
  const now = new Date();
  const payload: Contact = {
    ...contact,
    updatedAt: now,
    createdAt: contact.createdAt ?? now,
  };
  const isUpdate = contact.id != null;
  const id = await db.contacts.put(payload);
  await logAudit({
    entityType: 'contact',
    entityId: Number(id),
    action: isUpdate ? 'update' : 'create',
  });
  return Number(id);
}

export async function deleteContact(id: number): Promise<void> {
  await db.dossierContacts.where('contactId').equals(id).delete();
  await db.documentContacts.where('contactId').equals(id).delete();
  await db.contacts.delete(id);
  await logAudit({ entityType: 'contact', entityId: id, action: 'delete' });
}

export function contactDisplayName(c: Pick<Contact, 'type' | 'firstName' | 'lastName' | 'companyName'>): string {
  if (c.type === 'moral') return c.companyName || '—';
  const name = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
  return name || c.companyName || '—';
}

// ─── DossierContact helpers ───────────────────────────────────────────────
export async function attachContactToDossier(
  dossierId: number,
  contactId: number,
  role: DossierContact['role'],
  permissions: DossierContact['permissions'] = ['read'],
): Promise<number> {
  const existing = await db.dossierContacts
    .where('[dossierId+contactId]').equals([dossierId, contactId]).first();
  if (existing?.id) {
    await db.dossierContacts.put({ ...existing, role, permissions });
    return existing.id;
  }
  const id = await db.dossierContacts.add({
    dossierId, contactId, role, permissions,
    createdAt: new Date(),
  } as DossierContact);
  await logAudit({
    dossierId,
    entityType: 'contact',
    entityId: contactId,
    action: 'attach',
    details: JSON.stringify({ role }),
  });
  return Number(id);
}

export async function detachContactFromDossier(dossierContactId: number): Promise<void> {
  const rec = await db.dossierContacts.get(dossierContactId);
  await db.dossierContacts.delete(dossierContactId);
  if (rec) {
    await logAudit({
      dossierId: rec.dossierId,
      entityType: 'contact',
      entityId: rec.contactId,
      action: 'detach',
    });
  }
}

// ─── DocumentContact helpers ──────────────────────────────────────────────
export async function attachContactToDocument(
  documentId: number,
  contactId: number,
  role: DocumentContact['role'],
): Promise<number> {
  const existing = await db.documentContacts
    .where('[documentId+contactId]').equals([documentId, contactId]).first();
  if (existing?.id) {
    await db.documentContacts.put({ ...existing, role });
    return existing.id;
  }
  const id = await db.documentContacts.add({
    documentId, contactId, role,
    createdAt: new Date(),
  } as DocumentContact);
  return Number(id);
}

export async function detachContactFromDocument(documentContactId: number): Promise<void> {
  await db.documentContacts.delete(documentContactId);
}

// ─── Time entries ─────────────────────────────────────────────────────────
export async function saveTimeEntry(entry: TimeEntry): Promise<number> {
  const now = new Date();
  const payload: TimeEntry = {
    ...entry,
    updatedAt: now,
    createdAt: entry.createdAt ?? now,
  };
  const isUpdate = entry.id != null;
  const id = await db.timeEntries.put(payload);
  await logAudit({
    dossierId: entry.dossierId,
    entityType: 'time',
    entityId: Number(id),
    action: isUpdate ? 'update' : 'create',
  });
  return Number(id);
}

export async function deleteTimeEntry(id: number): Promise<void> {
  const rec = await db.timeEntries.get(id);
  await db.timeEntries.delete(id);
  if (rec) await logAudit({
    dossierId: rec.dossierId,
    entityType: 'time',
    entityId: id,
    action: 'delete',
  });
}

// ─── Expenses ─────────────────────────────────────────────────────────────
export async function saveExpense(expense: Expense): Promise<number> {
  const now = new Date();
  const payload: Expense = {
    ...expense,
    updatedAt: now,
    createdAt: expense.createdAt ?? now,
  };
  const isUpdate = expense.id != null;
  const id = await db.expenses.put(payload);
  await logAudit({
    dossierId: expense.dossierId,
    entityType: 'expense',
    entityId: Number(id),
    action: isUpdate ? 'update' : 'create',
  });
  return Number(id);
}

export async function deleteExpense(id: number): Promise<void> {
  const rec = await db.expenses.get(id);
  await db.expenses.delete(id);
  if (rec) await logAudit({
    dossierId: rec.dossierId,
    entityType: 'expense',
    entityId: id,
    action: 'delete',
  });
}

// ─── Fixed fees ───────────────────────────────────────────────────────────
export async function saveFixedFee(fee: FixedFee): Promise<number> {
  const now = new Date();
  const payload: FixedFee = {
    ...fee,
    updatedAt: now,
    createdAt: fee.createdAt ?? now,
  };
  const isUpdate = fee.id != null;
  const id = await db.fixedFees.put(payload);
  await logAudit({
    dossierId: fee.dossierId,
    entityType: 'fee',
    entityId: Number(id),
    action: isUpdate ? 'update' : 'create',
  });
  return Number(id);
}

export async function deleteFixedFee(id: number): Promise<void> {
  const rec = await db.fixedFees.get(id);
  await db.fixedFees.delete(id);
  if (rec) await logAudit({
    dossierId: rec.dossierId,
    entityType: 'fee',
    entityId: id,
    action: 'delete',
  });
}

// ─── Invoices ─────────────────────────────────────────────────────────────
export async function saveInvoice(invoice: Invoice): Promise<number> {
  const now = new Date();
  const payload: Invoice = {
    ...invoice,
    updatedAt: now,
    createdAt: invoice.createdAt ?? now,
  };
  const isUpdate = invoice.id != null;
  const id = await db.invoices.put(payload);
  await logAudit({
    dossierId: invoice.dossierId,
    entityType: 'invoice',
    entityId: Number(id),
    action: isUpdate ? 'update' : 'create',
  });
  return Number(id);
}

export async function deleteInvoice(id: number): Promise<void> {
  const rec = await db.invoices.get(id);
  // Détacher toutes les lignes financières rattachées
  await db.timeEntries.where('invoiceId').equals(id).modify({
    invoiceId: undefined as unknown as number, billed: false,
  });
  await db.expenses.where('invoiceId').equals(id).modify({
    invoiceId: undefined as unknown as number, billed: false,
  });
  await db.fixedFees.where('invoiceId').equals(id).modify({
    invoiceId: undefined as unknown as number, billed: false,
  });
  await db.invoices.delete(id);
  if (rec) await logAudit({
    dossierId: rec.dossierId,
    entityType: 'invoice',
    entityId: id,
    action: 'delete',
  });
}

// ─── Attachments ──────────────────────────────────────────────────────────
export async function saveAttachment(att: Attachment): Promise<number> {
  const id = await db.attachments.put({
    ...att,
    uploadedAt: att.uploadedAt ?? new Date(),
  });
  await logAudit({
    dossierId: att.dossierId,
    entityType: 'attachment',
    entityId: Number(id),
    action: 'import',
    details: JSON.stringify({ name: att.name, size: att.size }),
  });
  return Number(id);
}

export async function deleteAttachment(id: number): Promise<void> {
  const rec = await db.attachments.get(id);
  await db.attachments.delete(id);
  if (rec) await logAudit({
    dossierId: rec.dossierId,
    entityType: 'attachment',
    entityId: id,
    action: 'delete',
    details: JSON.stringify({ name: rec.name }),
  });
}

// ─── DocumentLinks (liens inter-dossiers) ─────────────────────────────────
export async function linkDocumentToDossier(
  documentId: number,
  dossierId: number,
  note?: string,
): Promise<number> {
  const existing = await db.documentLinks
    .where('[documentId+dossierId]').equals([documentId, dossierId]).first();
  if (existing?.id) return existing.id;
  const id = await db.documentLinks.add({
    documentId, dossierId, note,
    createdAt: new Date(),
  } as DocumentLink);
  await logAudit({
    dossierId,
    entityType: 'link',
    entityId: Number(id),
    action: 'attach',
    details: JSON.stringify({ documentId }),
  });
  return Number(id);
}

export async function unlinkDocumentFromDossier(linkId: number): Promise<void> {
  const rec = await db.documentLinks.get(linkId);
  await db.documentLinks.delete(linkId);
  if (rec) await logAudit({
    dossierId: rec.dossierId,
    entityType: 'link',
    entityId: linkId,
    action: 'detach',
  });
}

// ─── Document versions ────────────────────────────────────────────────────
export async function snapshotDocumentVersion(
  doc: Document,
  label?: string,
): Promise<number | null> {
  if (!doc.id) return null;
  const id = await db.documentVersions.add({
    documentId: doc.id,
    content: doc.content,
    contentRaw: doc.contentRaw,
    wordCount: doc.wordCount,
    label,
    timestamp: new Date(),
  } as DocumentVersion);
  return Number(id);
}

export async function restoreDocumentVersion(versionId: number): Promise<void> {
  const v = await db.documentVersions.get(versionId);
  if (!v) return;
  const doc = await db.documents.get(v.documentId);
  if (!doc) return;
  // Snapshot de l'état courant avant restauration.
  await snapshotDocumentVersion(doc, 'Avant restauration');
  await db.documents.put({
    ...doc,
    content: v.content,
    contentRaw: v.contentRaw,
    wordCount: v.wordCount ?? doc.wordCount,
    updatedAt: new Date(),
  });
  await logAudit({
    dossierId: doc.dossierId,
    entityType: 'document',
    entityId: doc.id!,
    action: 'restore_version',
    details: JSON.stringify({ versionId }),
  });
}

// ─── Stats finance d'un dossier ───────────────────────────────────────────
export interface DossierFinanceTotals {
  billableMinutes: number;
  billedMinutes: number;
  billableAmount: number; // HT
  billedAmount: number;
  expenseTotal: number;
  expenseRebillable: number;
  feeTotal: number;
}

export async function computeDossierFinanceTotals(dossierId: number): Promise<DossierFinanceTotals> {
  const [times, exps, fees] = await Promise.all([
    db.timeEntries.where('dossierId').equals(dossierId).toArray(),
    db.expenses.where('dossierId').equals(dossierId).toArray(),
    db.fixedFees.where('dossierId').equals(dossierId).toArray(),
  ]);
  let billableMinutes = 0, billedMinutes = 0, billableAmount = 0, billedAmount = 0;
  for (const t of times) {
    if (t.billable) {
      billableMinutes += t.minutes;
      billableAmount += (t.minutes / 60) * (t.hourlyRate ?? 0);
    }
    if (t.billed) {
      billedMinutes += t.minutes;
      billedAmount += (t.minutes / 60) * (t.hourlyRate ?? 0);
    }
  }
  let expenseTotal = 0, expenseRebillable = 0;
  for (const e of exps) {
    expenseTotal += e.amount;
    if (e.rebillable) expenseRebillable += e.amount;
  }
  const feeTotal = fees.reduce((acc, f) => acc + f.amount, 0);
  return {
    billableMinutes, billedMinutes,
    billableAmount, billedAmount,
    expenseTotal, expenseRebillable,
    feeTotal,
  };
}
