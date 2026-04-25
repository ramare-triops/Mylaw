'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  X,
  FolderKanban,
  Tag,
  Users,
  GitBranch,
  Plus,
  Trash2,
  RotateCcw,
  User,
  Building2,
  Info,
} from 'lucide-react';
import {
  db,
  saveDocument,
  attachContactToDocument,
  detachContactFromDocument,
  contactDisplayName,
  snapshotDocumentVersion,
  restoreDocumentVersion,
} from '@/lib/db';
import { cn, formatDateTime } from '@/lib/utils';
import { usePrivacy } from '@/components/providers/PrivacyProvider';
import { maskDossierName } from '@/lib/privacy';
import {
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUS_COLORS,
  DOCUMENT_CATEGORIES,
  DOCUMENT_ROLE_LABELS,
} from '@/components/dossiers/labels';
import type {
  Document as MylawDocument,
  DocumentStatus,
  DocumentRole,
  Contact,
  Dossier,
  DocumentContact,
  DocumentVersion,
  DossierContact,
} from '@/types';

interface Props {
  open: boolean;
  document: MylawDocument;
  onClose: () => void;
  onSaved?: (doc: MylawDocument) => void;
}

type PanelTab = 'meta' | 'intervenants' | 'versions';

const TABS: { key: PanelTab; label: string; icon: React.ElementType }[] = [
  { key: 'meta', label: 'Propriétés', icon: Info },
  { key: 'intervenants', label: 'Intervenants', icon: Users },
  { key: 'versions', label: 'Versions', icon: GitBranch },
];

export function DocumentPropertiesDialog({
  open,
  document,
  onClose,
  onSaved,
}: Props) {
  const { privacyMode } = usePrivacy();
  const [tab, setTab] = useState<PanelTab>('meta');

  const [dossierId, setDossierId] = useState<number | ''>('');
  const [status, setStatus] = useState<DocumentStatus>('draft');
  const [category, setCategory] = useState('');
  const [subCategory, setSubCategory] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [extranetShared, setExtranetShared] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDossierId(document.dossierId ?? '');
    setStatus(document.status ?? 'draft');
    setCategory(document.category ?? '');
    setSubCategory(document.subCategory ?? '');
    setTagsInput(document.tags.join(', '));
    setExtranetShared(document.extranetShared ?? false);
    setTab('meta');
  }, [open, document]);

  const dossiers = useLiveQuery<Dossier[]>(
    () =>
      open
        ? db.dossiers.orderBy('updatedAt').reverse().toArray()
        : Promise.resolve([] as Dossier[]),
    [open]
  );

  if (!open) return null;

  async function handleSave() {
    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const patch: MylawDocument = {
      ...document,
      dossierId: dossierId === '' ? undefined : Number(dossierId),
      status,
      category: category || undefined,
      subCategory: subCategory || undefined,
      tags,
      extranetShared,
      updatedAt: new Date(),
    };
    await saveDocument(patch);
    onSaved?.(patch);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end"
      style={{ background: 'rgba(0,0,0,0.40)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-[520px] max-w-full h-full bg-[var(--color-surface)] border-l border-[var(--color-border)] shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)] flex-shrink-0">
          <h2 className="text-sm font-semibold">Propriétés du document</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-[var(--color-surface-raised)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex border-b border-[var(--color-border)] px-3 pt-2 gap-1 flex-shrink-0">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-sm rounded-t-md border-b-2 -mb-px',
                tab === key
                  ? 'border-[var(--color-primary)] text-[var(--color-primary)] font-medium'
                  : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
              )}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto">
          {tab === 'meta' && (
            <div className="p-5 space-y-4">
              <Field label="Dossier de rattachement">
                <div className="flex items-center gap-2">
                  <FolderKanban className="w-4 h-4 text-[var(--color-primary)] flex-shrink-0" />
                  <select
                    value={dossierId}
                    onChange={(e) =>
                      setDossierId(
                        e.target.value === '' ? '' : Number(e.target.value)
                      )
                    }
                    className={inputCls}
                  >
                    <option value="">— Aucun dossier —</option>
                    {dossiers?.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.reference} · {privacyMode ? maskDossierName(d.name) : d.name}
                      </option>
                    ))}
                  </select>
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Statut">
                  <select
                    value={status}
                    onChange={(e) =>
                      setStatus(e.target.value as DocumentStatus)
                    }
                    className={cn(
                      inputCls,
                      'font-medium',
                      DOCUMENT_STATUS_COLORS[status]
                    )}
                  >
                    {Object.entries(DOCUMENT_STATUS_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Catégorie">
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">— Aucune —</option>
                    {DOCUMENT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Sous-catégorie">
                <input
                  type="text"
                  value={subCategory}
                  onChange={(e) => setSubCategory(e.target.value)}
                  placeholder="Ex. Conclusions récapitulatives"
                  className={inputCls}
                />
              </Field>

              <Field label="Tags (séparés par des virgules)">
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-[var(--color-text-muted)] flex-shrink-0" />
                  <input
                    type="text"
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </Field>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={extranetShared}
                  onChange={(e) => setExtranetShared(e.target.checked)}
                  className="w-4 h-4 accent-[var(--color-primary)]"
                />
                <span className="text-sm">
                  Partageable via extranet (flag uniquement — l&apos;extranet
                  nécessite un backend)
                </span>
              </label>
            </div>
          )}

          {tab === 'intervenants' && (
            <DocumentIntervenantsSection document={document} />
          )}

          {tab === 'versions' && (
            <DocumentVersionsSection document={document} />
          )}
        </div>

        {tab === 'meta' && (
          <div className="flex justify-end gap-2 px-5 py-3 border-t border-[var(--color-border)] flex-shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-md bg-[var(--color-surface-raised)] hover:bg-[var(--color-border)]"
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm rounded-md font-medium text-white bg-[var(--color-primary)] hover:opacity-90"
            >
              Enregistrer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Section Intervenants du document ──────────────────────────────────────
function DocumentIntervenantsSection({
  document,
}: {
  document: MylawDocument;
}) {
  const [addOpen, setAddOpen] = useState(false);

  const documentContacts = useLiveQuery<DocumentContact[]>(
    () =>
      document.id
        ? db.documentContacts.where('documentId').equals(document.id).toArray()
        : Promise.resolve([] as DocumentContact[]),
    [document.id]
  );

  const contactIds = documentContacts?.map((dc) => dc.contactId) ?? [];
  const contacts = useLiveQuery<(Contact | undefined)[]>(
    () =>
      contactIds.length > 0
        ? db.contacts.bulkGet(contactIds)
        : Promise.resolve([] as (Contact | undefined)[]),
    [JSON.stringify(contactIds)]
  );

  async function updateRole(dcId: number, role: DocumentRole) {
    const rec = await db.documentContacts.get(dcId);
    if (rec) await db.documentContacts.put({ ...rec, role });
  }

  return (
    <div className="p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--color-text-muted)]">
          Auteur, relecteur, signataire, destinataires…
        </p>
        <button
          onClick={() => setAddOpen(true)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-medium',
            'bg-[var(--color-primary)] text-white hover:opacity-90'
          )}
        >
          <Plus className="w-3.5 h-3.5" /> Ajouter
        </button>
      </div>

      {!documentContacts || documentContacts.length === 0 ? (
        <div className="py-8 text-center text-sm text-[var(--color-text-muted)] border border-dashed border-[var(--color-border)] rounded-md">
          Aucun intervenant attribué à ce document.
        </div>
      ) : (
        <div className="border border-[var(--color-border)] rounded-md divide-y divide-[var(--color-border)]">
          {documentContacts.map((dc, idx) => {
            const c = contacts?.[idx];
            if (!c) return null;
            return (
              <div
                key={dc.id}
                className="flex items-center gap-2 px-3 py-2 text-sm"
              >
                {c.type === 'physical' ? (
                  <User className="w-4 h-4 text-[var(--color-text-muted)]" />
                ) : (
                  <Building2 className="w-4 h-4 text-[var(--color-text-muted)]" />
                )}
                <span className="flex-1 truncate font-medium">
                  {contactDisplayName(c)}
                </span>
                <select
                  value={dc.role}
                  onChange={(e) =>
                    updateRole(dc.id!, e.target.value as DocumentRole)
                  }
                  className="text-xs px-2 py-1 rounded bg-transparent border border-transparent hover:border-[var(--color-border)] focus:border-[var(--color-primary)] focus:outline-none"
                >
                  {Object.entries(DOCUMENT_ROLE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => detachContactFromDocument(dc.id!)}
                  className="p-1 rounded hover:bg-red-100"
                  title="Retirer"
                >
                  <X className="w-3.5 h-3.5 text-red-500" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <AddDocumentContactDialog
        open={addOpen}
        documentId={document.id!}
        dossierId={document.dossierId}
        excludedIds={contactIds}
        onClose={() => setAddOpen(false)}
      />
    </div>
  );
}

function AddDocumentContactDialog({
  open,
  documentId,
  dossierId,
  excludedIds,
  onClose,
}: {
  open: boolean;
  documentId: number;
  dossierId?: number;
  excludedIds: number[];
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<DocumentRole>('recipient');
  const contacts = useLiveQuery<Contact[]>(
    () =>
      open
        ? db.contacts.toArray()
        : Promise.resolve([] as Contact[]),
    [open]
  );
  // Contacts déjà dans le dossier (pour les mettre en tête)
  const dossierContacts = useLiveQuery<DossierContact[]>(
    () =>
      open && dossierId
        ? db.dossierContacts.where('dossierId').equals(dossierId).toArray()
        : Promise.resolve([] as DossierContact[]),
    [open, dossierId]
  );

  if (!open) return null;

  const dossierContactIds = new Set(dossierContacts?.map((dc) => dc.contactId));
  const q = search.toLowerCase();
  const filtered = (contacts ?? [])
    .filter((c) => !excludedIds.includes(c.id!))
    .filter(
      (c) =>
        !q ||
        contactDisplayName(c).toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q)
    )
    .sort((a, b) => {
      const aIn = dossierContactIds.has(a.id!) ? 0 : 1;
      const bIn = dossierContactIds.has(b.id!) ? 0 : 1;
      return aIn - bIn;
    });

  async function attach(c: Contact) {
    await attachContactToDocument(documentId, c.id!, role);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.40)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl w-[480px] max-w-[90vw] max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <h3 className="text-sm font-semibold">Ajouter un intervenant</h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--color-surface-raised)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3 flex flex-col flex-1 overflow-hidden">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Rechercher…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              className="flex-1 px-3 py-2 text-sm rounded-md bg-[var(--color-surface-raised)] border border-[var(--color-border)]"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as DocumentRole)}
              className="px-3 py-2 text-sm rounded-md bg-[var(--color-surface-raised)] border border-[var(--color-border)]"
            >
              {Object.entries(DOCUMENT_ROLE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 overflow-auto border border-[var(--color-border)] rounded-md divide-y divide-[var(--color-border)]">
            {filtered.length === 0 ? (
              <div className="text-sm text-center py-6 text-[var(--color-text-muted)]">
                Aucun contact disponible. Créez-le depuis le dossier.
              </div>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => attach(c)}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-[var(--color-surface-raised)] text-left"
                >
                  {c.type === 'physical' ? (
                    <User className="w-4 h-4 text-[var(--color-text-muted)]" />
                  ) : (
                    <Building2 className="w-4 h-4 text-[var(--color-text-muted)]" />
                  )}
                  <span className="flex-1 truncate font-medium">
                    {contactDisplayName(c)}
                  </span>
                  {dossierContactIds.has(c.id!) && (
                    <span className="text-xs text-[var(--color-primary)]">
                      · dossier
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Section Versions du document ─────────────────────────────────────────
function DocumentVersionsSection({
  document,
}: {
  document: MylawDocument;
}) {
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);

  const versions = useLiveQuery<DocumentVersion[]>(
    () =>
      document.id
        ? db.documentVersions
            .where('documentId')
            .equals(document.id)
            .reverse()
            .sortBy('timestamp')
            .then((rows) => rows.reverse())
        : Promise.resolve([] as DocumentVersion[]),
    [document.id]
  );

  async function createSnapshot() {
    setCreating(true);
    const fresh = document.id ? await db.documents.get(document.id) : null;
    if (fresh) {
      await snapshotDocumentVersion(fresh, label || undefined);
    }
    setLabel('');
    setCreating(false);
  }

  async function handleRestore(vid: number) {
    if (
      !confirm(
        'Restaurer cette version ? Le contenu courant sera sauvegardé comme nouvelle version avant la restauration.'
      )
    )
      return;
    await restoreDocumentVersion(vid);
    alert('Version restaurée. Rechargez le document pour voir le contenu.');
  }

  async function handleDelete(vid: number) {
    if (!confirm('Supprimer définitivement cette version ?')) return;
    await db.documentVersions.delete(vid);
  }

  return (
    <div className="p-5 space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Libellé (ex. Avant validation client)"
          className="flex-1 px-3 py-2 text-sm rounded-md bg-[var(--color-surface-raised)] border border-[var(--color-border)]"
        />
        <button
          onClick={createSnapshot}
          disabled={creating}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 text-sm rounded-md font-medium text-white',
            'bg-[var(--color-primary)] hover:opacity-90 disabled:opacity-50'
          )}
        >
          <GitBranch className="w-3.5 h-3.5" /> Créer une version
        </button>
      </div>

      {!versions || versions.length === 0 ? (
        <div className="py-8 text-center text-sm text-[var(--color-text-muted)] border border-dashed border-[var(--color-border)] rounded-md">
          Aucune version enregistrée.
        </div>
      ) : (
        <div className="border border-[var(--color-border)] rounded-md divide-y divide-[var(--color-border)]">
          {versions.map((v) => (
            <div
              key={v.id}
              className="flex items-center gap-3 px-3 py-2.5 text-sm"
            >
              <GitBranch className="w-4 h-4 text-[var(--color-text-muted)]" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">
                  {v.label || 'Sans libellé'}
                </div>
                <div className="text-xs text-[var(--color-text-muted)]">
                  {formatDateTime(v.timestamp)}
                  {v.wordCount != null && ` · ${v.wordCount} mots`}
                </div>
              </div>
              <button
                onClick={() => handleRestore(v.id!)}
                className="p-1.5 rounded hover:bg-[var(--color-surface-raised)]"
                title="Restaurer cette version"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleDelete(v.id!)}
                className="p-1.5 rounded hover:bg-red-100"
                title="Supprimer"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-500" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-[var(--color-text-muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputCls = cn(
  'w-full px-3 py-2 text-sm rounded-md',
  'bg-[var(--color-surface-raised)] border border-[var(--color-border)]',
  'text-[var(--color-text)]',
  'focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]'
);
