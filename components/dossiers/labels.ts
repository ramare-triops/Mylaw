import type {
  DossierType,
  DossierStatus,
  DossierRole,
  DocumentRole,
  DocumentStatus,
  TimeActivity,
  ExpenseCategory,
  FixedFeeKind,
  AuditAction,
  AuditEntityType,
  InvoiceStatus,
  ContactType,
  DossierPermission,
} from '@/types';

export const DOSSIER_TYPE_LABELS: Record<DossierType, string> = {
  judiciary: 'Contentieux',
  advisory: 'Conseil',
  contract: 'Contrat',
  audit: 'Audit / Revue',
  criminal: 'Pénal',
  family: 'Famille',
  social: 'Social',
  commercial: 'Commercial',
  other: 'Autre',
};

export const DOSSIER_STATUS_LABELS: Record<DossierStatus, string> = {
  open: 'Ouvert',
  active: 'En cours',
  pending: 'En attente',
  archived: 'Archivé',
  closed: 'Clôturé',
};

export const DOSSIER_STATUS_COLORS: Record<DossierStatus, string> = {
  open: 'bg-blue-100 text-blue-700 border-blue-200',
  active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  archived: 'bg-gray-100 text-gray-700 border-gray-200',
  closed: 'bg-slate-200 text-slate-600 border-slate-300',
};

export const DOSSIER_ROLE_LABELS: Record<DossierRole, string> = {
  client: 'Client',
  adversary: 'Partie adverse',
  adversaryCounsel: 'Confrère adverse',
  ownCounsel: 'Avocat du cabinet',
  collaborator: 'Collaborateur',
  trainee: 'Stagiaire',
  assistant: 'Assistant(e)',
  expert: 'Expert',
  bailiff: 'Commissaire de justice',
  judge: 'Magistrat',
  court: 'Juridiction',
  witness: 'Témoin',
  other: 'Autre',
};

export const DOCUMENT_ROLE_LABELS: Record<DocumentRole, string> = {
  author: 'Auteur',
  drafter: 'Rédacteur',
  reviewer: 'Relecteur',
  validator: 'Valideur',
  signer: 'Signataire',
  recipient: 'Destinataire principal',
  ccRecipient: 'En copie',
  clientRecipient: 'Destinataire client',
  adversaryRecipient: 'Destinataire adverse',
  charge: 'En charge du suivi',
  other: 'Autre',
};

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  draft: 'Brouillon',
  review: 'En relecture',
  validated: 'Validé',
  signed: 'Signé',
  sent: 'Envoyé',
  archived: 'Archivé',
  cancelled: 'Annulé',
};

export const DOCUMENT_STATUS_COLORS: Record<DocumentStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  review: 'bg-amber-100 text-amber-700',
  validated: 'bg-emerald-100 text-emerald-700',
  signed: 'bg-indigo-100 text-indigo-700',
  sent: 'bg-blue-100 text-blue-700',
  archived: 'bg-slate-100 text-slate-600',
  cancelled: 'bg-red-100 text-red-700',
};

export const DOCUMENT_CATEGORIES = [
  'Courrier',
  'Acte',
  'Pièce',
  'Conclusions',
  'Contrat',
  'Email',
  'Note interne',
  'Pièce adverse',
  'Audit',
  'Autre',
];

export const TIME_ACTIVITY_LABELS: Record<TimeActivity, string> = {
  drafting: 'Rédaction',
  review: 'Relecture',
  research: 'Recherche',
  negotiation: 'Négociation',
  meeting: 'Rendez-vous',
  hearing: 'Audience',
  signature: 'Signature',
  analysis: 'Analyse',
  ai: 'Analyse IA',
  travel: 'Déplacement',
  other: 'Autre',
};

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  bailiff: 'Commissaire de justice',
  signification: 'Signification',
  translation: 'Traduction',
  clerk: 'Greffe',
  postal: 'Affranchissement',
  travel: 'Déplacement',
  copies: 'Copies',
  expertise: 'Expertise',
  other: 'Autre',
};

export const FIXED_FEE_KIND_LABELS: Record<FixedFeeKind, string> = {
  forfait: 'Forfait',
  audit: 'Audit',
  act: 'Acte',
  consultation: 'Consultation',
  other: 'Autre',
};

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  create: 'Création',
  update: 'Modification',
  delete: 'Suppression',
  view: 'Consultation',
  download: 'Téléchargement',
  share: 'Partage',
  restore_version: 'Restauration de version',
  status_change: 'Changement de statut',
  attach: 'Rattachement',
  detach: 'Détachement',
  import: 'Import',
  export: 'Export',
};

export const AUDIT_ENTITY_LABELS: Record<AuditEntityType, string> = {
  dossier: 'Dossier',
  document: 'Document',
  contact: 'Intervenant',
  time: 'Temps',
  expense: 'Débours',
  fee: 'Honoraire',
  invoice: 'Facture',
  attachment: 'Pièce jointe',
  link: 'Lien inter-dossiers',
  version: 'Version',
};

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  proforma: 'Pro-forma',
  issued: 'Émise',
  paid: 'Payée',
  cancelled: 'Annulée',
};

export const CONTACT_TYPE_LABELS: Record<ContactType, string> = {
  physical: 'Personne physique',
  moral: 'Personne morale',
};

export const PERMISSION_LABELS: Record<DossierPermission, string> = {
  read: 'Lecture',
  readWrite: 'Lecture / écriture',
  extranet: 'Extranet',
};

export function formatMinutes(mins: number): string {
  if (!mins) return '0h';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, '0')}`;
}

export function formatMoney(amount: number, currency = '€'): string {
  return `${amount.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}
