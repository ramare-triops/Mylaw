'use client';

import { useState, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRouter } from 'next/navigation';
import {
  Plus,
  FileText,
  Paperclip,
  Link as LinkIcon,
  Search,
  Trash2,
  Upload,
  Download,
  ExternalLink,
  X,
} from 'lucide-react';
import {
  db,
  saveDocument,
  deleteDocument,
  saveAttachment,
  deleteAttachment,
  linkDocumentToDossier,
  unlinkDocumentFromDossier,
  logAudit,
} from '@/lib/db';
import { cn, formatDate, formatDateTime } from '@/lib/utils';
import { NewDocumentDialog } from '@/components/documents/NewDocumentDialog';
import {
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUS_COLORS,
  DOCUMENT_CATEGORIES,
} from '../labels';
import type {
  Dossier,
  Document as MylawDocument,
  DocumentStatus,
  Attachment,
  DocumentLink,
} from '@/types';

interface Props {
  dossier: Dossier;
}

function templateToEditorContent(raw: string): string {
  if (!raw || raw.trim() === '') return '';
  const t = raw.trim();
  if (t.startsWith('{"type":"doc"')) return t;
  if (t.startsWith('<')) return t;
  return `<p>${t.replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function DossierDocumentsTab({ dossier }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [newDocOpen, setNewDocOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const docs = useLiveQuery<MylawDocument[]>(
    () =>
      db.documents
        .where('dossierId')
        .equals(dossier.id!)
        .toArray(),
    [dossier.id]
  );
  const attachments = useLiveQuery<Attachment[]>(
    () =>
      db.attachments
        .where('dossierId')
        .equals(dossier.id!)
        .toArray(),
    [dossier.id]
  );
  const links = useLiveQuery<DocumentLink[]>(
    () =>
      db.documentLinks
        .where('dossierId')
        .equals(dossier.id!)
        .toArray(),
    [dossier.id]
  );
  const linkedDocs = useLiveQuery<(MylawDocument | undefined)[]>(async () => {
    if (!links || links.length === 0) return [];
    return db.documents.bulkGet(links.map((l) => l.documentId));
  }, [links]);

  const filteredDocs = (() => {
    if (!docs) return [];
    let list = docs;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          (d.contentRaw ?? '').toLowerCase().includes(q) ||
          (d.category ?? '').toLowerCase().includes(q) ||
          d.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    if (statusFilter !== 'all')
      list = list.filter((d) => (d.status ?? 'draft') === statusFilter);
    if (categoryFilter !== 'all')
      list = list.filter((d) => d.category === categoryFilter);
    return [...list].sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  })();

  async function handleCreate(title: string, templateContent: string) {
    setNewDocOpen(false);
    const now = new Date();
    const content = templateToEditorContent(templateContent);
    const textForCount = content
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const wordCount = textForCount
      ? textForCount.split(' ').filter(Boolean).length
      : 0;
    const id = await saveDocument({
      title: title || 'Nouveau document',
      type: 'draft',
      status: 'draft',
      dossierId: dossier.id!,
      content,
      contentRaw: templateContent,
      tags: [],
      createdAt: now,
      updatedAt: now,
      wordCount,
    });
    router.push(`/documents/${id}`);
  }

  async function handleUpdateStatus(doc: MylawDocument, status: DocumentStatus) {
    await saveDocument({ ...doc, status, updatedAt: new Date() });
    await logAudit({
      dossierId: dossier.id,
      entityType: 'document',
      entityId: doc.id!,
      action: 'status_change',
      details: JSON.stringify({ from: doc.status, to: status }),
    });
  }

  async function handleUpdateCategory(doc: MylawDocument, category: string) {
    await saveDocument({
      ...doc,
      category: category || undefined,
      updatedAt: new Date(),
    });
  }

  async function handleDelete(e: React.MouseEvent, doc: MylawDocument) {
    e.stopPropagation();
    if (!confirm(`Supprimer le document "${doc.title}" ?`)) return;
    await deleteDocument(doc.id!);
  }

  async function handleFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      await saveAttachment({
        dossierId: dossier.id!,
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        blob: file,
        tags: [],
        uploadedAt: new Date(),
      });
    }
  }

  function handleDownloadAttachment(attId: number, name: string) {
    db.attachments.get(attId).then((a) => {
      if (!a) return;
      const url = URL.createObjectURL(a.blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
      logAudit({
        dossierId: dossier.id,
        entityType: 'attachment',
        entityId: attId,
        action: 'download',
      });
    });
  }

  return (
    <>
      <div
        className="p-6 space-y-6"
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
        }}
      >
        {dragActive && (
          <div className="fixed inset-0 z-40 bg-[var(--color-primary)]/10 border-4 border-dashed border-[var(--color-primary)] flex items-center justify-center pointer-events-none">
            <div className="bg-[var(--color-surface)] px-6 py-4 rounded-lg shadow-lg flex items-center gap-3">
              <Upload className="w-5 h-5 text-[var(--color-primary)]" />
              <span className="font-medium text-sm">
                Déposer les fichiers pour les importer dans ce dossier
              </span>
            </div>
          </div>
        )}

        {/* Action bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setNewDocOpen(true)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium',
              'bg-[var(--color-primary)] text-white hover:opacity-90'
            )}
          >
            <Plus className="w-4 h-4" /> Nouveau document
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-md text-sm',
              'bg-[var(--color-surface-raised)] border border-[var(--color-border)]',
              'hover:bg-[var(--color-border)]'
            )}
          >
            <Upload className="w-4 h-4" /> Importer des fichiers
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleFiles(e.target.files);
              e.currentTarget.value = '';
            }}
          />
          <button
            onClick={() => setAttachOpen(true)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-md text-sm',
              'bg-[var(--color-surface-raised)] border border-[var(--color-border)]',
              'hover:bg-[var(--color-border)]'
            )}
          >
            <FileText className="w-4 h-4" /> Rattacher un document
          </button>
          <button
            onClick={() => setLinkOpen(true)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-md text-sm',
              'bg-[var(--color-surface-raised)] border border-[var(--color-border)]',
              'hover:bg-[var(--color-border)]'
            )}
          >
            <LinkIcon className="w-4 h-4" /> Lien inter-dossiers
          </button>

          <div className="flex-1 min-w-[180px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
            <input
              type="text"
              placeholder="Rechercher dans ce dossier…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(
                'w-full pl-9 pr-4 py-2 text-sm rounded-md',
                'bg-[var(--color-surface-raised)] border border-[var(--color-border)]'
              )}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as DocumentStatus | 'all')
            }
            className="px-3 py-2 text-sm rounded-md bg-[var(--color-surface-raised)] border border-[var(--color-border)]"
          >
            <option value="all">Tous les statuts</option>
            {Object.entries(DOCUMENT_STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 text-sm rounded-md bg-[var(--color-surface-raised)] border border-[var(--color-border)]"
          >
            <option value="all">Toutes catégories</option>
            {DOCUMENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Documents of the dossier */}
        <section>
          <h3 className="text-sm font-semibold mb-2 text-[var(--color-text)]">
            Documents ({docs?.length ?? 0})
          </h3>
          <div className="border border-[var(--color-border)] rounded-md overflow-hidden">
            <div className="grid grid-cols-[1fr_120px_120px_100px_130px_70px] gap-3 px-4 py-2 text-xs text-[var(--color-text-muted)] font-medium border-b border-[var(--color-border)] bg-[var(--color-surface-raised)]">
              <span>Titre</span>
              <span>Catégorie</span>
              <span>Statut</span>
              <span className="text-right">Mots</span>
              <span className="text-right">Modifié</span>
              <span />
            </div>
            {filteredDocs.length === 0 ? (
              <div className="py-10 text-center text-sm text-[var(--color-text-muted)]">
                Aucun document rattaché. Créez-en un, importez des fichiers ou
                rattachez un document existant.
              </div>
            ) : (
              filteredDocs.map((d) => (
                <div
                  key={d.id}
                  onClick={() => router.push(`/documents/${d.id}`)}
                  className="grid grid-cols-[1fr_120px_120px_100px_130px_70px] gap-3 px-4 py-2.5 text-sm items-center hover:bg-[var(--color-surface-raised)] cursor-pointer border-b border-[var(--color-border)] last:border-b-0 group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 flex-shrink-0 text-[var(--color-text-muted)]" />
                    <span className="truncate font-medium">{d.title}</span>
                  </div>
                  <select
                    value={d.category ?? ''}
                    onChange={(e) => handleUpdateCategory(d, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs px-2 py-1 rounded bg-transparent border border-transparent hover:border-[var(--color-border)] focus:border-[var(--color-primary)] focus:outline-none"
                  >
                    <option value="">—</option>
                    {DOCUMENT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <select
                    value={d.status ?? 'draft'}
                    onChange={(e) =>
                      handleUpdateStatus(d, e.target.value as DocumentStatus)
                    }
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                      'text-xs px-2 py-0.5 rounded border border-transparent font-medium',
                      DOCUMENT_STATUS_COLORS[d.status ?? 'draft']
                    )}
                  >
                    {Object.entries(DOCUMENT_STATUS_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-right tabular-nums text-[var(--color-text-muted)]">
                    {d.wordCount ?? 0}
                  </span>
                  <span className="text-xs text-right text-[var(--color-text-muted)]">
                    {formatDateTime(d.updatedAt)}
                  </span>
                  <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100">
                    <button
                      onClick={(e) => handleDelete(e, d)}
                      className="p-1 rounded hover:bg-red-100"
                      title="Supprimer"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Attachments */}
        {attachments && attachments.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold mb-2 text-[var(--color-text)]">
              Pièces jointes importées ({attachments.length})
            </h3>
            <div className="border border-[var(--color-border)] rounded-md divide-y divide-[var(--color-border)]">
              {attachments.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-3 px-4 py-2 text-sm group"
                >
                  <Paperclip className="w-4 h-4 text-[var(--color-text-muted)] flex-shrink-0" />
                  <span className="flex-1 truncate font-medium">{a.name}</span>
                  <span className="text-xs text-[var(--color-text-muted)] tabular-nums">
                    {formatBytes(a.size)}
                  </span>
                  <span className="text-xs text-[var(--color-text-muted)] w-28 text-right">
                    {formatDate(a.uploadedAt)}
                  </span>
                  <button
                    onClick={() => handleDownloadAttachment(a.id!, a.name)}
                    className="p-1 rounded hover:bg-[var(--color-border)]"
                    title="Télécharger"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Supprimer la pièce jointe "${a.name}" ?`))
                        deleteAttachment(a.id!);
                    }}
                    className="p-1 rounded hover:bg-red-100"
                    title="Supprimer"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Inter-dossier links */}
        {links && links.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold mb-2 text-[var(--color-text)]">
              Liens inter-dossiers ({links.length})
            </h3>
            <div className="border border-[var(--color-border)] rounded-md divide-y divide-[var(--color-border)]">
              {links.map((l, idx) => {
                const doc = linkedDocs?.[idx];
                return (
                  <div
                    key={l.id}
                    className="flex items-center gap-3 px-4 py-2 text-sm"
                  >
                    <ExternalLink className="w-4 h-4 text-[var(--color-text-muted)]" />
                    <span className="flex-1 truncate">
                      {doc?.title ?? '(document supprimé)'}
                    </span>
                    {l.note && (
                      <span className="text-xs text-[var(--color-text-muted)]">
                        {l.note}
                      </span>
                    )}
                    {doc && (
                      <button
                        onClick={() => router.push(`/documents/${doc.id}`)}
                        className="p-1 rounded hover:bg-[var(--color-border)]"
                        title="Ouvrir"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => unlinkDocumentFromDossier(l.id!)}
                      className="p-1 rounded hover:bg-red-100"
                      title="Retirer le lien"
                    >
                      <X className="w-3.5 h-3.5 text-red-500" />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

      <NewDocumentDialog
        open={newDocOpen}
        onClose={() => setNewDocOpen(false)}
        onCreate={handleCreate}
      />

      <AttachExistingDialog
        open={attachOpen}
        dossierId={dossier.id!}
        onClose={() => setAttachOpen(false)}
      />

      <LinkDocumentDialog
        open={linkOpen}
        dossierId={dossier.id!}
        onClose={() => setLinkOpen(false)}
      />
    </>
  );
}

// ─── Dialog : rattacher un document existant (change dossierId) ─────────────
function AttachExistingDialog({
  open,
  dossierId,
  onClose,
}: {
  open: boolean;
  dossierId: number;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const candidates = useLiveQuery<MylawDocument[]>(
    () =>
      open
        ? db.documents
            .filter((d) => d.dossierId !== dossierId)
            .toArray()
        : Promise.resolve([] as MylawDocument[]),
    [open, dossierId]
  );

  if (!open) return null;

  const filtered = (candidates ?? []).filter((d) =>
    d.title.toLowerCase().includes(search.toLowerCase())
  );

  async function attach(doc: MylawDocument) {
    await saveDocument({
      ...doc,
      dossierId,
      updatedAt: new Date(),
    });
    await logAudit({
      dossierId,
      entityType: 'document',
      entityId: doc.id!,
      action: 'attach',
    });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl w-[560px] max-w-[90vw] max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)]">
          <h3 className="text-sm font-semibold">Rattacher un document</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--color-surface-raised)]">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3 overflow-hidden flex flex-col flex-1">
          <input
            type="text"
            placeholder="Rechercher un document…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-md bg-[var(--color-surface-raised)] border border-[var(--color-border)]"
            autoFocus
          />
          <div className="flex-1 overflow-auto border border-[var(--color-border)] rounded-md divide-y divide-[var(--color-border)]">
            {filtered.length === 0 ? (
              <div className="text-sm text-center py-6 text-[var(--color-text-muted)]">
                Aucun document disponible.
              </div>
            ) : (
              filtered.map((d) => (
                <button
                  key={d.id}
                  onClick={() => attach(d)}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-[var(--color-surface-raised)] text-left"
                >
                  <FileText className="w-4 h-4 text-[var(--color-text-muted)]" />
                  <span className="flex-1 truncate">{d.title}</span>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {formatDate(d.updatedAt)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Dialog : créer un lien inter-dossiers ──────────────────────────────────
function LinkDocumentDialog({
  open,
  dossierId,
  onClose,
}: {
  open: boolean;
  dossierId: number;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [note, setNote] = useState('');
  const [selected, setSelected] = useState<MylawDocument | null>(null);
  const all = useLiveQuery<MylawDocument[]>(
    () => (open ? db.documents.toArray() : Promise.resolve([] as MylawDocument[])),
    [open]
  );

  if (!open) return null;

  const filtered = (all ?? []).filter(
    (d) =>
      d.dossierId !== dossierId &&
      d.title.toLowerCase().includes(search.toLowerCase())
  );

  async function createLink() {
    if (!selected) return;
    await linkDocumentToDossier(selected.id!, dossierId, note || undefined);
    setSelected(null);
    setNote('');
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl w-[560px] max-w-[90vw] max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)]">
          <h3 className="text-sm font-semibold">Lien inter-dossiers</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--color-surface-raised)]">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3 overflow-hidden flex flex-col flex-1">
          <p className="text-xs text-[var(--color-text-muted)]">
            Le document reste rattaché à son dossier principal mais apparaît
            également ici comme copie-lien.
          </p>
          <input
            type="text"
            placeholder="Rechercher…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-md bg-[var(--color-surface-raised)] border border-[var(--color-border)]"
          />
          <div className="flex-1 overflow-auto border border-[var(--color-border)] rounded-md divide-y divide-[var(--color-border)]">
            {filtered.length === 0 ? (
              <div className="text-sm text-center py-6 text-[var(--color-text-muted)]">
                Aucun document.
              </div>
            ) : (
              filtered.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setSelected(d)}
                  className={cn(
                    'w-full flex items-center gap-2 px-4 py-2 text-sm text-left',
                    selected?.id === d.id
                      ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                      : 'hover:bg-[var(--color-surface-raised)]'
                  )}
                >
                  <FileText className="w-4 h-4 text-[var(--color-text-muted)]" />
                  <span className="flex-1 truncate">{d.title}</span>
                </button>
              ))
            )}
          </div>
          <input
            type="text"
            placeholder="Note (ex. copie de pièce pour procédure parallèle)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-md bg-[var(--color-surface-raised)] border border-[var(--color-border)]"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-md bg-[var(--color-surface-raised)] hover:bg-[var(--color-border)]"
            >
              Annuler
            </button>
            <button
              onClick={createLink}
              disabled={!selected}
              className={cn(
                'px-4 py-2 text-sm rounded-md font-medium text-white',
                'bg-[var(--color-primary)] hover:opacity-90 disabled:opacity-40'
              )}
            >
              Créer le lien
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
