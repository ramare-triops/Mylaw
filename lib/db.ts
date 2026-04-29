import Dexie, { type Table } from 'dexie';
// Re-export `Document` so legacy imports `from '@/lib/db'` continue to work.
export type { Document } from '@/types';
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
  Jot,
  InterestCalculation,
  Bordereau,
  BordereauPiece,
  StampSettings,
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
  // Horodatages « dernière ouverture » par dossier — strictement locaux,
  // par appareil. Ne pas propager via Drive.
  'dossier_last_opened_v1',
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
  fieldDefs!: Table<import('@/types/field-def').FieldDef>;
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
  /** Notes rapides / to-do du tableau de bord (synchronisable Google Tasks). */
  jots!: Table<Jot>;
  /** Calculs d'intérêts au taux légal (outil dossier). */
  interestCalculations!: Table<InterestCalculation>;
  /** Projets de bordereau de pièces (outil dossier). */
  bordereaux!: Table<Bordereau>;
  /** Pièces d'un bordereau (fichier source binaire — non synchronisé). */
  bordereauPieces!: Table<BordereauPiece>;
  /** Réglages du tampon virtuel (singleton id = 1). */
  stampSettings!: Table<StampSettings>;

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

    // ─── Version 4 : table des définitions de champs réutilisables ────────
    // Ajoute `fieldDefs` (catalogue global de champs : label, type, couleur,
    // catégorie, options conditionnelles…) utilisée par le panneau Champs
    // de l'éditeur de modèle. Les anciennes tables restent inchangées.
    this.version(4).stores({
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
      fieldDefs: '++id, name, type, category, updatedAt',
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

    // ─── Version 5 : Jots / quick notes (dashboard) ────────────────────────
    // Notes rapides connectables à Google Tasks. Les anciennes tables restent
    // inchangées ; seule la table `jots` est ajoutée.
    this.version(5).stores({
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
      fieldDefs: '++id, name, type, category, updatedAt',
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
      jots: '++id, createdAt, done, googleTaskId',
    });

    // ─── Version 6 : Calculs d'intérêts (outil dossier) ────────────────────
    // Ajoute uniquement la table interestCalculations ; toutes les autres
    // sont strictement copiées de la v5.
    this.version(6).stores({
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
      fieldDefs: '++id, name, type, category, updatedAt',
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
      jots: '++id, createdAt, done, googleTaskId',
      interestCalculations:
        '++id, dossierId, name, updatedAt',
    });

    // ─── Version 7 : Bordereau de pièces (outil dossier) ───────────────────
    // Trois tables ajoutées :
    //  - bordereaux       : projets de bordereau (synchronisé)
    //  - bordereauPieces  : pièces d'un bordereau, contiennent un Blob du
    //                       fichier source (NON synchronisé via Drive,
    //                       traité comme la table `attachments`).
    //  - stampSettings    : singleton (id = 1) avec l'image du sceau et
    //                       les réglages du tampon (synchronisé).
    this.version(7).stores({
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
      fieldDefs: '++id, name, type, category, updatedAt',
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
      jots: '++id, createdAt, done, googleTaskId',
      interestCalculations:
        '++id, dossierId, name, updatedAt',
      bordereaux:
        '++id, dossierId, name, updatedAt',
      bordereauPieces:
        '++id, bordereauId, order, uid',
      stampSettings:
        '++id, updatedAt',
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
            //  - bordereauPieces : contiennent les fichiers sources (Blob)
            //    importés par l'utilisateur dans l'outil bordereau ; trop
            //    lourds eux aussi pour un JSON Drive. Seuls le projet de
            //    bordereau (table `bordereaux`) et les réglages du tampon
            //    (table `stampSettings`) voyagent par Drive.
            if (
              tableName === 'history' ||
              tableName === 'auditLog' ||
              tableName === 'attachments' ||
              tableName === 'bordereauPieces'
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

/**
 * Calcule la prochaine référence libre pour un dossier au format `YYNNN`,
 * où YY = deux derniers chiffres de l'année et NNN = compteur séquentiel
 * (3 chiffres minimum, plus si nécessaire). On prend le max des références
 * existantes pour l'année donnée et on incrémente — les anciennes références
 * dans d'autres formats (ex. `2026-1234`) sont ignorées par le filtre regex.
 *
 * Exemples : 26001, 26002, 26003, …, 26999, 261000.
 */
export async function nextDossierReference(year: number = new Date().getFullYear()): Promise<string> {
  const yy = String(year % 100).padStart(2, '0');
  const re = new RegExp(`^${yy}(\\d+)$`);
  const all = await db.dossiers.toArray();
  let maxN = 0;
  for (const d of all) {
    const m = (d.reference ?? '').match(re);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > maxN) maxN = n;
  }
  const next = maxN + 1;
  return `${yy}${String(next).padStart(3, '0')}`;
}

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

/**
 * Liste les intervenants d'un dossier avec leur rôle, prêts à être
 * exploités par les blocs d'identification. Renvoie un tableau plat
 * `{ contact, role, parentDossierContactId }` dans l'ordre d'insertion
 * des `DossierContact`. Les contacts introuvables (intégrité cassée)
 * sont filtrés silencieusement.
 */
export interface DossierContactWithRole {
  dossierContact: DossierContact;
  contact: Contact;
}

export async function getDossierContactsWithRole(
  dossierId: number
): Promise<DossierContactWithRole[]> {
  const links = await db.dossierContacts.where('dossierId').equals(dossierId).toArray();
  if (links.length === 0) return [];
  const contacts = await db.contacts.bulkGet(links.map((l) => l.contactId));
  const out: DossierContactWithRole[] = [];
  for (let i = 0; i < links.length; i++) {
    const c = contacts[i];
    if (c) out.push({ dossierContact: links[i], contact: c });
  }
  return out;
}

/**
 * Horodatages « dernière ouverture » par dossier, stockés localement en
 * `db.settings` sous la clé `dossier_last_opened_v1` (map id → ISO
 * string). Cette clé est dans `INTERNAL_SETTING_KEYS` : elle ne voyage
 * pas via Drive, chaque appareil conserve son propre historique d'accès.
 */
const DOSSIER_LAST_OPENED_KEY = 'dossier_last_opened_v1';
export type DossierLastOpenedMap = Record<number, string>;

export async function getDossierLastOpenedMap(): Promise<DossierLastOpenedMap> {
  const v = await getSetting<unknown>(DOSSIER_LAST_OPENED_KEY, null);
  if (!v || typeof v !== 'object') return {};
  return v as DossierLastOpenedMap;
}

export async function markDossierOpened(id: number, when: Date = new Date()): Promise<void> {
  const map = await getDossierLastOpenedMap();
  map[id] = when.toISOString();
  await setSetting(DOSSIER_LAST_OPENED_KEY, map);
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
  // Nettoyage de l'horodatage local d'ouverture pour ce dossier.
  const openedMap = await getDossierLastOpenedMap();
  if (openedMap[id] !== undefined) {
    delete openedMap[id];
    await setSetting(DOSSIER_LAST_OPENED_KEY, openedMap);
  }
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
  parentDossierContactId?: number,
  fileRef?: string,
): Promise<number> {
  const existing = await db.dossierContacts
    .where('[dossierId+contactId]').equals([dossierId, contactId]).first();
  if (existing?.id) {
    // Si le contact est déjà rattaché au dossier avec un rôle racine et
    // qu'on demande un rattachement à un parent, on met à jour le lien.
    await db.dossierContacts.put({
      ...existing, role, permissions,
      parentDossierContactId: parentDossierContactId ?? existing.parentDossierContactId,
      fileRef: fileRef !== undefined ? fileRef : existing.fileRef,
    });
    return existing.id;
  }
  const id = await db.dossierContacts.add({
    dossierId, contactId, role, permissions,
    parentDossierContactId,
    fileRef: fileRef || undefined,
    createdAt: new Date(),
  } as DossierContact);
  await logAudit({
    dossierId,
    entityType: 'contact',
    entityId: contactId,
    action: 'attach',
    details: JSON.stringify({ role, parentDossierContactId }),
  });
  return Number(id);
}

/**
 * Met à jour la référence dossier (champ par-dossier de
 * `DossierContact.fileRef`) sans toucher au reste du lien.
 * Utilisé quand l'avocat modifie un intervenant déjà rattaché et
 * change uniquement la référence adverse spécifique au dossier.
 */
export async function setDossierContactFileRef(
  dossierId: number,
  contactId: number,
  fileRef: string | undefined,
): Promise<void> {
  const link = await db.dossierContacts
    .where('[dossierId+contactId]').equals([dossierId, contactId]).first();
  if (!link?.id) return;
  await db.dossierContacts.put({
    ...link,
    fileRef: fileRef && fileRef.trim() ? fileRef.trim() : undefined,
  });
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

// ─── Jots / Quick notes ───────────────────────────────────────────────────
export async function saveJot(jot: Jot): Promise<number> {
  const now = new Date();
  const payload: Jot = {
    ...jot,
    updatedAt: now,
    createdAt: jot.createdAt ?? now,
  };
  const id = await db.jots.put(payload);
  return Number(id);
}

export async function deleteJot(id: number): Promise<void> {
  await db.jots.delete(id);
}

export async function toggleJotDone(id: number): Promise<void> {
  const j = await db.jots.get(id);
  if (!j) return;
  const willBeDone = !j.done;
  const now = new Date();
  // On enregistre `completedAt` au passage en terminé pour pouvoir
  // appliquer la fenêtre de visibilité à 7 jours côté UI. Au retour
  // en `needsAction`, on l'efface.
  await db.jots.update(id, {
    done: willBeDone,
    updatedAt: now,
    completedAt: willBeDone ? now : undefined,
  });
}

// ─── Stamp settings helpers (singleton id = 1) ─────────────────────────────

const STAMP_SETTINGS_ID = 1;

export const DEFAULT_STAMP_SETTINGS: StampSettings = {
  id: STAMP_SETTINGS_ID,
  font: 'Helvetica',
  size: 'medium',
  position: 'top-right',
  numberColor: '#c81e1e',
  allPages: false,
  updatedAt: new Date(0),
};

export async function getStampSettings(): Promise<StampSettings> {
  const existing = await db.stampSettings.get(STAMP_SETTINGS_ID);
  if (existing) return existing;
  return { ...DEFAULT_STAMP_SETTINGS, updatedAt: new Date(0) };
}

export async function saveStampSettings(
  patch: Partial<StampSettings>,
): Promise<void> {
  const current = await getStampSettings();
  const merged: StampSettings = {
    ...current,
    ...patch,
    id: STAMP_SETTINGS_ID,
    updatedAt: new Date(),
  };
  await db.stampSettings.put(merged);
}

// ─── Bordereau helpers ─────────────────────────────────────────────────────

export async function deleteBordereau(id: number): Promise<void> {
  // Supprime le projet ET toutes ses pièces sources locales.
  const pieces = await db.bordereauPieces
    .where('bordereauId')
    .equals(id)
    .toArray();
  if (pieces.length) {
    await db.bordereauPieces.bulkDelete(
      pieces.map((p) => p.id!).filter((x) => x != null),
    );
  }
  await db.bordereaux.delete(id);
}
