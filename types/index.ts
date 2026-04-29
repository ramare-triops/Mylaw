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
  /**
   * Libellé du dossier rattaché (numéro, nom, ou les deux). Reste un texte
   * libre pour rester compatible avec les délais saisis avant la mise en
   * place du picker de dossier ; quand le dossier est retrouvé en base via
   * la barre de recherche, son id est aussi mémorisé dans `dossierId`.
   */
  dossier: string;
  /** Lien fort vers un Dossier de la base si l'utilisateur l'a sélectionné. */
  dossierId?: number;
  dueDate: Date;
  /**
   * Si `true`, l'échéance n'a pas d'heure précise — l'événement Google
   * Calendar correspondant est créé en « toute la journée » et apparaît
   * tout en haut de la journée dans l'agenda. Par défaut on considère
   * que les anciennes deadlines sans heure (00:00) sont all-day.
   */
  allDay?: boolean;
  /** Catégorie libre du délai (peut être une des valeurs DeadlineType ou un texte saisi). */
  typeLabel?: string;
  /** Lieu (audience, rendez-vous…) — transmis à Google Calendar. */
  location?: string;
  type: DeadlineType;
  triggerEvent?: string;
  notes?: string;
  done: boolean;
  createdAt: Date;
  /** ID de l'événement Google Calendar si la deadline y est synchronisée. */
  googleEventId?: string;
  /** ID du calendrier Google qui contient l'événement (par ex. le calendrier « Mylaw »). */
  googleCalendarId?: string;
  /** Dernière synchronisation vers Google Calendar. */
  googleSyncedAt?: Date;
}

// ─── Jot / Quick notes (to-do) ─────────────────────────────────────────────
/** Note rapide / to-do affichée sur le tableau de bord. Peut être poussée
 *  vers Google Tasks pour la retrouver dans l'écosystème Google. */
export interface Jot {
  id?: number;
  content: string;
  done: boolean;
  createdAt: Date;
  updatedAt: Date;
  /**
   * Horodatage du passage en « terminé ». Sert à filtrer les tâches
   * encore visibles dans le widget — seules les tâches cochées il y a
   * moins de 7 jours restent affichées. Renseigné à chaque toggle
   * vers `done=true`, effacé au passage à `done=false`.
   */
  completedAt?: Date;
  /** Identifiant de la tâche Google Tasks liée, si synchronisée. */
  googleTaskId?: string;
  /** Identifiant de la liste Google Tasks (généralement '@default'). */
  googleTaskListId?: string;
  /** Dernier push vers Google Tasks. */
  googleSyncedAt?: Date;
  /**
   * Tombstone : tâche supprimée localement mais qui reste à
   * propager vers Google Tasks lors de la prochaine synchronisation.
   * Une fois la suppression confirmée côté Google, l'enregistrement
   * est purgé.
   */
  pendingDelete?: boolean;
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
  /**
   * Marqueur qui identifie une brique comme variante d'identification. Les
   * blocs d'identification (cf. `lib/identification-blocks.ts`) repèrent
   * leurs deux variantes (personne physique / personne morale) via ce
   * champ, indépendamment du titre édité par l'utilisateur. Uniquement
   * posé sur les seeds.
   */
  identityKind?: 'physical' | 'moral';
  /**
   * Marqueur qui transforme une brique en « bloc d'identification » lié à
   * un rôle du dossier. Quand elle est insérée dans un modèle, la brique
   * ne dépose pas son contenu brut mais un placeholder qui sera résolu à
   * l'instanciation du modèle dans un dossier : les intervenants du
   * dossier portant ce rôle (avec leur variante physique / morale selon
   * `contact.type`) sont interpolés en lieu et place. Utilisé pour
   * « Client », « Partie adverse », « Avocat du cabinet », etc.
   */
  identityRole?: DossierRole;
  /**
   * Séparateur HTML posé entre deux intervenants quand le rôle en compte
   * plusieurs dans le dossier. Exclusivement pertinent quand
   * `identityRole` est défini. Par défaut : un retour à la ligne simple.
   */
  identitySeparator?: string;
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
  /** Note explicative affichée quand le dossier est en attente (ce que l'on attend, motif). */
  pendingNote?: string;
  /** Horodatage de la dernière mise en attente, pour tri/affichage sur le tableau de bord. */
  pendingSince?: Date;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
}

// ─── Contacts / Intervenants ───────────────────────────────────────────────
export type ContactType = 'physical' | 'moral';

/**
 * Catégorie professionnelle GLOBALE d'un intervenant — indépendante du
 * dossier. Sert de filtre aux pickers contextuels : choisir « A pour
 * avocat » sur une partie ne propose à l'autocomplete que les contacts
 * dont la `professionalCategory` est `lawyer`. Une même personne peut
 * tout à fait apparaître dans plusieurs dossiers avec des rôles
 * dossier-spécifiques différents (`ownCounsel`, `adversaryCounsel`),
 * mais sa catégorie professionnelle reste la même partout.
 */
export type ProfessionalCategory =
  | 'lawyer'        // Avocat
  | 'expert'        // Expert (judiciaire ou amiable)
  | 'bailiff'       // Commissaire de justice
  | 'judge'         // Magistrat
  | 'court'         // Juridiction (personne morale)
  | 'witness'       // Témoin
  | 'notary'        // Notaire
  | 'collaborator'  // Collaborateur du cabinet
  | 'trainee'       // Stagiaire du cabinet
  | 'assistant'     // Assistant(e) du cabinet
  | 'other';        // Autre profession

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
  /**
   * Catégorie professionnelle globale de l'intervenant. Utilisée pour
   * filtrer les autocomplete contextuels (ex. « A pour avocat » →
   * uniquement les contacts dont la catégorie est `lawyer`).
   */
  professionalCategory?: ProfessionalCategory;
  /**
   * Barreau d'inscription pour les avocats. Champ libre — l'avocat
   * saisit le nom de son barreau (ex. « Paris », « Lyon »).
   */
  barreau?: string;
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
  /**
   * Référence du dossier propre à cet intervenant DANS LE DOSSIER COURANT
   * (ex. la référence interne du confrère adverse pour ce dossier). Le
   * même contact peut intervenir dans plusieurs dossiers avec des
   * références différentes — c'est pour cela que le champ vit ici, sur
   * le lien dossier↔contact, et non sur le `Contact` lui-même.
   */
  fileRef?: string;
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

// ─── Calcul des intérêts au taux légal ────────────────────────────────────
export type CreditorType = 'particulier' | 'professionnel';

export interface InterestItemRecord {
  /** Identifiant local stable (uuid v4 — stable entre saves). */
  id: string;
  label: string;
  amount: number;
  startDate: Date;
  endDate: Date;
}

export interface InterestRateSnapshot {
  year: number;
  semester: 1 | 2;
  particulier: number;
  professionnel: number;
}

export interface InterestSegmentSnapshot {
  from: Date;
  to: Date;
  year: number;
  semester: 1 | 2;
  rate: number;
  days: number;
  /** Capital servant de base au calcul du segment (utile en cas de
   *  capitalisation : il évolue d'année en année). */
  capital?: number;
  /** Vrai si le segment se termine sur un anniversaire de la date de
   *  capitalisation : les intérêts cumulés depuis la dernière
   *  capitalisation viennent d'être ajoutés au capital. */
  capitalizedAfter?: boolean;
  interest: number;
}

export interface InterestComputedItem {
  itemId: string;
  label: string;
  amount: number;
  startDate: Date;
  endDate: Date;
  segments: InterestSegmentSnapshot[];
  interest: number;
  total: number;
  extrapolated: boolean;
}

export interface InterestResultSnapshot {
  computedAt: Date;
  creditorType: CreditorType;
  items: InterestComputedItem[];
  totalCapital: number;
  totalInterest: number;
  totalAmount: number;
  hasExtrapolation: boolean;
  capitalize?: boolean;
  capitalizationStartDate?: Date;
  capitalizationPeriodMonths?: number;
  increasedRate?: boolean;
  judgmentNotificationDate?: Date;
}

export interface InterestCalculation {
  id?: number;
  /** Nom donné au calcul (sert de titre dans les listes / exports). */
  name: string;
  /** Dossier auquel le calcul est rattaché — nul si calcul libre. */
  dossierId?: number;
  creditorType: CreditorType;
  /** Lignes saisies par l'utilisateur. */
  items: InterestItemRecord[];
  /**
   * Capitalisation des intérêts (anatocisme — art. 1343-2 du Code
   * civil) : à activer uniquement quand une décision de justice
   * l'ordonne. Les intérêts accumulés au moins pour une année entière
   * à compter de `capitalizationStartDate` sont alors ajoutés au
   * capital à chaque anniversaire et produisent eux-mêmes intérêt.
   */
  capitalize?: boolean;
  capitalizationStartDate?: Date;
  /**
   * Périodicité de la capitalisation, exprimée en mois. Par défaut
   * 12 mois (l'art. 1343-2 du Code civil exige « au moins une année
   * entière »). Le juge ou le contrat peuvent fixer un intervalle
   * plus long.
   */
  capitalizationPeriodMonths?: number;
  /**
   * Majoration de plein droit du taux légal (art. L.313-3 du Code
   * monétaire et financier) : en cas de condamnation pécuniaire par
   * décision de justice, le taux est majoré de cinq points à
   * l'expiration d'un délai de deux mois à compter de la signification
   * du jugement (ou du jour où la décision est devenue exécutoire).
   */
  increasedRate?: boolean;
  /** Date de signification du jugement. La majoration s'applique
   *  2 mois après cette date. */
  judgmentNotificationDate?: Date;
  /** Résultat de la dernière exécution. */
  result?: InterestResultSnapshot;
  /** Snapshot des taux utilisés au moment du calcul. */
  ratesSnapshot?: InterestRateSnapshot[];
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Bordereau de pièces (outil dossier) ──────────────────────────────────

/**
 * Position du tampon sur la page selon une grille 3×3. Chaque clé
 * combine une position verticale et une position horizontale.
 */
export type StampPosition =
  | 'top-left' | 'top-center' | 'top-right'
  | 'middle-left' | 'middle-center' | 'middle-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

/** Trois tailles relatives à la largeur de la page. */
export type StampSize = 'small' | 'medium' | 'large';

/** Polices web sûres autorisées pour le numéro du tampon. */
export type StampFont =
  | 'Helvetica'
  | 'Times'
  | 'Courier'
  | 'Georgia'
  | 'Inter';

/**
 * Réglages du tampon virtuel apposé sur les pièces. Il existe un
 * unique enregistrement (singleton id = 1). L'image du sceau est
 * stockée en base64 pour permettre la synchronisation Drive.
 */
export interface StampSettings {
  id?: number;
  /** Image du sceau encodée en data URL (data:image/png;base64,…). */
  imageDataUrl?: string;
  /** Type MIME originel de l'image importée. */
  imageMimeType?: 'image/png' | 'image/svg+xml' | 'image/jpeg';
  /** Police utilisée pour écrire le numéro de pièce. */
  font: StampFont;
  /** Taille de l'image du sceau (relative à la largeur de page). */
  size: StampSize;
  /**
   * Taille du numéro inscrit au centre du sceau (relative à la
   * largeur de page). Indépendante de la taille de l'image, ce
   * qui permet par exemple un grand sceau avec un numéro plus
   * discret, ou l'inverse.
   */
  textSize?: StampSize;
  /** Position du tampon sur la page. */
  position: StampPosition;
  /** Couleur du numéro de pièce (hex, ex. #d22). */
  numberColor: string;
  /** Vrai = tampon sur toutes les pages, faux = première page seulement. */
  allPages: boolean;
  updatedAt: Date;
}

/**
 * Une pièce au sein d'un bordereau. Conserve le fichier source
 * binaire (pdf/docx/png/jpeg) ainsi que les choix utilisateur :
 * numéro de pièce et nom personnalisé. La table `bordereauPieces`
 * n'est PAS synchronisée via Drive (les blobs sources sont locaux).
 */
export interface BordereauPiece {
  id?: number;
  bordereauId: number;
  /** Position dans le bordereau (utilisée pour l'ordre d'affichage). */
  order: number;
  /** Numéro de pièce affiché et inscrit sur le tampon (ex. "1", "2 bis"). */
  pieceNumber: string;
  /** Nom donné à la pièce par l'utilisateur (ex. « Attestation de Mme X »). */
  customName: string;
  /** Nom du fichier source (avant renommage). */
  sourceFileName: string;
  /** Type MIME du fichier source. */
  sourceMimeType: string;
  /** Contenu binaire du fichier source. Stocké localement uniquement. */
  sourceBlob: Blob;
  /** Référence vers le Document du dossier d'où la pièce a été tirée
   *  (sélection « depuis le dossier »). Non rempli si import disque. */
  sourceDocumentId?: number;
  /** Identifiant local stable (uuid) pour le tracking côté UI. */
  uid: string;
}

/**
 * Projet de bordereau de pièces, rattaché à un dossier. Le projet
 * en lui-même est synchronisé (métadonnées). Les blobs des pièces
 * sources vivent dans `bordereauPieces` et restent locaux.
 */
export interface Bordereau {
  id?: number;
  dossierId: number;
  name: string;
  /** Numérotation automatique 1, 2, 3… (avec drag-drop pour réordonner)
   *  ou numérotation libre saisie par l'utilisateur. */
  autoNumbering: boolean;
  /**
   * Identifiants des pièces jointes (table `attachments`) générées
   * par la dernière exécution de « Générer le bordereau ». Les PDF
   * tamponnés sont stockés comme Attachments du dossier afin de
   * s'ouvrir directement comme PDF (et non dans l'éditeur Tiptap).
   * Permet de les supprimer en bloc via « Supprimer le bordereau ».
   */
  generatedAttachmentIds?: number[];
  /** Identifiant de la pièce jointe « bordereau de communication de
   *  pièces » récapitulative, générée à la dernière exécution. */
  generatedRecapAttachmentId?: number;
  /** Date de la dernière génération réussie. */
  lastGeneratedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type { FieldDef, FieldDefType } from './field-def';
