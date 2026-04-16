import type { LucideIcon } from 'lucide-react';

// ─── Documents ─────────────────────────────────────────────────────────────
export type DocumentType = 'draft' | 'template' | 'note' | 'analysis' | 'imported';

export interface DocumentVersion {
  id?: number;
  documentId: number;
  content: string;
  timestamp: Date;
}

export interface Document {
  id?: number;
  title: string;
  type: DocumentType;
  content: string;
  contentRaw?: string;
  folderId?: number;
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
