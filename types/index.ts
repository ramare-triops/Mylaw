import type { LucideIcon } from 'lucide-react';

// ─── Documents ─────────────────────────────────────────────────────────────
export type DocumentType = 'draft' | 'template' | 'note' | 'analysis' | 'imported';

export type DocumentStatus =
  | 'draft'      // brouillon
  | 'review'     // en relecture
  | 'validated'  // validé
  | 'signed'     // signé
  | 'sent'       // envoyé
  | 'archived'   // archivé
  | 'cancelled'; // annulé

export interface DocumentVersion {
  id?: number;
  documentId: number;
  content: string;
  contentRaw?: string;
  wordCount?: number;
  label?: string;
  timestamp: Date;
}

export interface Document {
  id?: number;
  title: string;
  type: DocumentType;
  content: string;
  contentRaw?: string;
  folderId?: number;
  /** Rattachement principal au dossier (classeur principal). */
  dossierId?: number;
  /** Statut workflow (orthogonal au `type`). */
  status?: DocumentStatus;
  /** Catégorie documentaire principale (courrier, acte, pièce…). */
  category?: string;
  /** Sous-catégorie ou tags secondaires (en plus de `tags`). */
  subCategory?: string;
  /** Partage extranet (out-of-scope actuel mais flag conservé). */
  extranetShared?: boolean;
  tags: string[];
  variables?: Record<string, string>;
  templateId?: number;
  sourceFile?: string;
  createdAt: Date;
  updatedAt: Date;
  wordCount: number;
  versions?: DocumentVersion[];
}

// ─── Folders ───────────────────────────────────────────────────────────────
export interface Folder {
  id?: number;
  name: string;
  parentId?: number;
  color?: string;
  createdAt: Date;
}

// ─── Tools ─────────────────────────────────────────────────────────────────
export type ToolCategory =
  | 'writing'
  | 'research'
  | 'time'
  | 'correspondence'
  | 'organization';

export interface ToolRecord {
  id?: number;
  slug: string;
  name: string;
  pinned: boolean;
  order: number;
  config: Record<string, unknown>;
  lastUsedAt?: Date;
}

export interface MylexTool {
  slug: string;
  name: string;
  description: string;
  icon: LucideIcon;
  category: ToolCategory;
  component: React.ComponentType<ToolProps>;
  defaultConfig: Record<string, unknown>;
  aiCapabilities?: string[];
  exportFormats?: ExportFormat[];
}

export interface ToolProps {
  config: Record<string, unknown>;
  onConfigChange: (config: Record<string, unknown>) => void;
}

// ─── Templates ─────────────────────────────────────────────────────────────
export type TemplateCategory =
  | 'procedure'
  | 'correspondence'
  | 'contract'
  | 'conclusions'
  | 'orders'
  | 'other';

export type VariableType = 'text' | 'date' | 'number' | 'select' | 'boolean';

export interface TemplateVariable {
  name: string;
  type: VariableType;
  label?: string;
  defaultValue?: string;
  required?: boolean;
  options?: string[];
}

export interface Template {
  id?: number;
  name: string;
  category: TemplateCategory;
  content: string;
  variables: TemplateVariable[];
  createdAt: Date;
}

// ─── Sessions ──────────────────────────────────────────────────────────────
export interface Session {
  id?: number;
  date: Date;
  toolId?: number;
  content: string;
  tags: string[];
}

// ─── Snippets ──────────────────────────────────────────────────────────────
export interface Snippet {
  id?: number;
  trigger: string;
  expansion: string;
  category: string;
}

// ─── AI ────────────────────────────────────────────────────────────────────
export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: Date;
}

export interface AIChat {
  id?: number;
  documentId?: number;
  messages: AIMessage[];
  createdAt: Date;
}

export interface AIContext {
  systemPrompt: string;
  documentContent?: string;
  documentMetadata?: object;
  activeTool?: string;
  userProfile?: UserProfile;
  conversationHistory: AIMessage[];
}

// ─── Settings ──────────────────────────────────────────────────────────────
export interface UserProfile {
  fullName: string;
  firm: string;
  address: string;
  bar: string;
  specialties: string[];
  jurisdictions: string[];
  email: string;
  hourlyRates: Record<string, number>;
}

export interface AppSettings {
  // Profile
  profile: UserProfile;
  // AI
  openaiApiKey?: string;
  preferredModel: 'gpt-4o' | 'gpt-4o-mini';
  customSystemPrompt?: string;
  outputLanguage: string;
  // Appearance
  theme: 'light' | 'dark' | 'system';
  density: 'normal' | 'compact';
  editorFont: string;
  sidebarWidth: number;
  // Backup
  backupFrequency: 'daily' | 'weekly' | 'manual';
  backupPath?: string;
  backupEncryption?: string;
}

// ─── History ───────────────────────────────────────────────────────────────
export interface HistoryEntry {
  id?: number;
  action: string;
  entityId: number;
  entityType: 'document' | 'template' | 'tool' | 'snippet';
  timestamp: Date;
}

// ─── Export ────────────────────────────────────────────────────────────────
export type ExportFormat = 'docx' | 'pdf' | 'html' | 'markdown' | 'txt';

// ─── Deadlines ─────────────────────────────────────────────────────────────
export type DeadlineType =
  | 'peremption'
  | 'forclusion'
  | 'reponse'
  | 'audience'
  | 'appel'
  | 'other';

export interface Deadline {
  id?: number;
  title: string;
  dossier: string;
  dueDate: Date;
  type: DeadlineType;
  triggerEvent?: string;
  notes?: string;
  done: boolean;
  createdAt: Date;
}

// ─── UI State ──────────────────────────────────────────────────────────────
export interface OpenTab {
  id: string;
  type: 'document' | 'tool' | 'template';
  entityId: number;
  title: string;
}

export interface UIState {
  openTabs: OpenTab[];
  activeTabId: string | null;
  sidebarCollapsed: boolean;
  activeDocumentScrollY: number;
}

// ─── Briques ───────────────────────────────────────────────────────────────
// Une brique est un bloc de contenu juridique réutilisable (clause, paragraphe,
// formule type…) que l'on peut insérer dans un document.
export type BrickCategory =
  | 'clause'
  | 'introduction'
  | 'conclusion'
  | 'motivation'
  | 'dispositif'
  | 'formule'
  | 'other';

export interface Brick {
  id?: number;
  title: string;
  content: string;
  /** Catégorie fonctionnelle de la brique */
  category: BrickCategory;
  /** Tags libres pour la recherche */
  tags: string[];
  /** Référence à une étiquette structurée (optionnel) */
  infoLabelId?: number;
  /**
   * Type de contact attendu pour remplir les variables de cette brique.
   * Si défini, un bouton "Depuis un intervenant" apparaît et ne propose
   * que les contacts du type correspondant.
   */
  targetContactType?: ContactType;
  /**
   * Rôles dossier requis (intersection avec targetContactType).
   * Si vide/absent, tous les rôles sont acceptés.
   */
  targetRoles?: DossierRole[];
  createdAt: Date;
  updatedAt: Date;
}

// ─── Étiquettes d'information ──────────────────────────────────────────────
// Une étiquette est un label structuré (couleur + texte) que l'on associe
// à des briques ou à des documents pour les classifier.
export type InfoLabelColor =
  | 'gray'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple'
  | 'pink';

export interface InfoLabel {
  id?: number;
  name: string;
  color: InfoLabelColor;
  description?: string;
  createdAt: Date;
}

// ─── Dossiers ──────────────────────────────────────────────────────────────
export type DossierType =
  | 'judiciary'   // contentieux
  | 'advisory'    // conseil
  | 'contract'    // contrat
  | 'audit'       // audit / revue
  | 'criminal'    // pénal
  | 'family'      // famille
  | 'social'      // social
  | 'commercial'  // commercial
  | 'other';

export type DossierStatus =
  | 'open'
  | 'active'
  | 'pending'
  | 'archived'
  | 'closed';

export interface Dossier {
  id?: number;
  /** Numéro ou référence interne (ex. 2026-0123). */
  reference: string;
  name: string;
  type: DossierType;
  status: DossierStatus;
  description?: string;
  /** Nom rapide du client (libellé d'affichage — le contact détaillé est dans dossierContacts). */
  clientName?: string;
  tags: string[];
  color?: string;
  /** IDs d'autres dossiers liés (liens croisés / copies de pièces). */
  linkedDossierIds?: number[];
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
}

// ─── Contacts / Intervenants ───────────────────────────────────────────────
export type ContactType = 'physical' | 'moral';

/** Civilités usuelles (personne physique) */
export type Civility = 'M.' | 'Mme' | 'Mlle' | 'Me' | 'Pr.' | 'Dr.';

export interface Contact {
  id?: number;
  type: ContactType;

  // ── Identité (personne physique) ─────────────────────────────
  civility?: Civility;
  firstName?: string;
  lastName?: string;
  birthDate?: Date;
  birthPlace?: string;
  nationality?: string;
  profession?: string;

  // ── Identité (personne morale) ───────────────────────────────
  /** Raison sociale pour une personne morale. */
  companyName?: string;
  /** Forme juridique (SARL, SAS, SCI, SA…). */
  legalForm?: string;
  /** Capital social en euros. */
  capital?: number;
  /** Numéro SIRET (14 chiffres). */
  siret?: string;
  /** Numéro RCS (sans la ville). */
  rcs?: string;
  /** Ville du RCS (ex. Paris B). */
  rcsCity?: string;
  /** Représentant légal — libellé libre (ex. "M. Jean DUPONT, Président"). */
  representative?: string;
  /** Qualité du représentant (Président, Gérant…). */
  representativeRole?: string;

  // ── Coordonnées ─────────────────────────────────────────────
  /** Adresse email principale. */
  email?: string;
  /** Adresses email supplémentaires (perso, pro…). */
  additionalEmails?: string[];
  /** Numéro principal. */
  phone?: string;
  /** Numéros supplémentaires (portable, bureau, domicile…). */
  additionalPhones?: string[];

  /** Adresse libre (compat + affichage groupé). Reste synchronisée avec les champs structurés. */
  address?: string;
  /** Numéro de voie (12, 12bis…). */
  addressNumber?: string;
  /** Suffixe du numéro (bis, ter, quater…). */
  addressNumberSuffix?: string;
  /** Nom de la rue / voie. */
  addressStreet?: string;
  /** Complément d'adresse (bâtiment, étage, résidence…). */
  addressComplement?: string;
  /** Code postal (5 chiffres en France). */
  addressPostalCode?: string;
  /** Commune / ville. */
  addressCity?: string;
  /** Pays (par défaut implicite FR). */
  addressCountry?: string;

  // ── Métadonnées cabinet ─────────────────────────────────────
  /** Référence dossier mail (interne au cabinet). */
  fileRef?: string;
  /** Avocat désigné (ID d'un autre Contact, rôle ownCounsel/adversaryCounsel). */
  counselId?: number;
  notes?: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export type DossierRole =
  | 'client'
  | 'adversary'           // partie adverse
  | 'adversaryCounsel'    // confrère adverse
  | 'ownCounsel'          // avocat du cabinet
  | 'collaborator'
  | 'trainee'             // stagiaire
  | 'assistant'
  | 'expert'
  | 'bailiff'             // huissier
  | 'judge'
  | 'court'               // juridiction
  | 'witness'
  | 'other';

export type DossierPermission = 'read' | 'readWrite' | 'extranet';

export interface DossierContact {
  id?: number;
  dossierId: number;
  contactId: number;
  role: DossierRole;
  permissions: DossierPermission[];
  /**
   * Lien hiérarchique : si défini, cet intervenant est rattaché à un autre
   * intervenant du même dossier (son « parent »). Exemple : un
   * « confrère adverse » rattaché à la « partie adverse » ; un « expert »
   * rattaché au « client », etc. L'UI affiche les enfants indentés sous
   * leur parent.
   */
  parentDossierContactId?: number;
  notes?: string;
  createdAt: Date;
}

export type DocumentRole =
  | 'author'
  | 'drafter'
  | 'reviewer'
  | 'validator'
  | 'signer'
  | 'recipient'            // destinataire principal
  | 'ccRecipient'          // en copie
  | 'clientRecipient'
  | 'adversaryRecipient'
  | 'charge'               // en charge du suivi
  | 'other';

export interface DocumentContact {
  id?: number;
  documentId: number;
  contactId: number;
  role: DocumentRole;
  createdAt: Date;
}

// ─── Finance ───────────────────────────────────────────────────────────────
export type TimeActivity =
  | 'drafting'
  | 'review'
  | 'research'
  | 'negotiation'
  | 'meeting'
  | 'hearing'
  | 'signature'
  | 'analysis'
  | 'ai'
  | 'travel'
  | 'other';

export interface TimeEntry {
  id?: number;
  dossierId: number;
  documentId?: number;
  contactId?: number;       // l'avocat/collaborateur ayant saisi le temps
  date: Date;
  minutes: number;
  hourlyRate?: number;      // snapshot du taux au moment de la saisie
  activity: TimeActivity;
  description?: string;
  billable: boolean;
  billed: boolean;
  invoiceId?: number;
  createdAt: Date;
  updatedAt: Date;
}

export type ExpenseCategory =
  | 'bailiff'         // huissier
  | 'signification'   // frais de signification
  | 'translation'
  | 'clerk'           // greffe
  | 'postal'
  | 'travel'
  | 'copies'
  | 'expertise'
  | 'other';

export interface Expense {
  id?: number;
  dossierId: number;
  documentId?: number;
  date: Date;
  category: ExpenseCategory;
  amount: number;
  description?: string;
  rebillable: boolean;
  billed: boolean;
  invoiceId?: number;
  createdAt: Date;
  updatedAt: Date;
}

export type FixedFeeKind =
  | 'forfait'
  | 'audit'
  | 'act'
  | 'consultation'
  | 'other';

export interface FixedFee {
  id?: number;
  dossierId: number;
  documentId?: number;
  date: Date;
  kind: FixedFeeKind;
  amount: number;
  description?: string;
  billed: boolean;
  invoiceId?: number;
  createdAt: Date;
  updatedAt: Date;
}

export type InvoiceStatus = 'proforma' | 'issued' | 'paid' | 'cancelled';

export interface Invoice {
  id?: number;
  dossierId: number;
  reference: string;
  date: Date;
  status: InvoiceStatus;
  totalHT: number;
  totalTTC: number;
  vatRate?: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Attachments (fichiers binaires importés) ──────────────────────────────
export interface Attachment {
  id?: number;
  dossierId: number;
  documentId?: number;     // si associé à un document TipTap
  name: string;
  mimeType: string;
  size: number;
  /** Blob stocké en IndexedDB (ne voyage PAS via Drive JSON). */
  blob: Blob;
  category?: string;
  tags: string[];
  uploadedAt: Date;
}

// ─── Liens inter-dossiers ──────────────────────────────────────────────────
export interface DocumentLink {
  id?: number;
  documentId: number;
  /** Dossier additionnel auquel on rattache une copie-lien du document. */
  dossierId: number;
  note?: string;
  createdAt: Date;
}

// ─── Audit trail (journal d'actions) ───────────────────────────────────────
export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'view'
  | 'download'
  | 'share'
  | 'restore_version'
  | 'status_change'
  | 'attach'
  | 'detach'
  | 'import'
  | 'export';

export type AuditEntityType =
  | 'dossier'
  | 'document'
  | 'contact'
  | 'time'
  | 'expense'
  | 'fee'
  | 'invoice'
  | 'attachment'
  | 'link'
  | 'version';

export interface AuditEntry {
  id?: number;
  dossierId?: number;
  entityType: AuditEntityType;
  entityId: number;
  action: AuditAction;
  timestamp: Date;
  /** JSON-serializable détails (old→new values, nom fichier…). */
  details?: string;
}
