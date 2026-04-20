'use client';

import { useState, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRouter } from 'next/navigation';
import {
  Plus, FileText, Trash2, Search, SortAsc, SortDesc,
  Filter, Download, CheckSquare, Square, Pencil, Check, X,
  ChevronDown, FileDown, FileType, FileType2
} from 'lucide-react';
import { db, saveDocument, deleteDocument } from '@/lib/db';
import { formatDateTime } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { exportDocx, exportPdf } from '@/lib/export';
import { NewDocumentDialog } from './NewDocumentDialog';
import { DocumentHoverPreview } from './DocumentHoverPreview';
import type { Document } from '@/types';

type SortField = 'updatedAt' | 'createdAt' | 'title' | 'wordCount';
type SortDir = 'asc' | 'desc';
type FilterType = 'all' | 'draft' | 'final' | 'contract';

function templateToEditorContent(raw: string): string {
  if (!raw || raw.trim() === '') return '';
  const trimmed = raw.trim();
  if (trimmed.startsWith('{"type":"doc"')) return trimmed;
  if (trimmed.startsWith('<')) return trimmed;
  return `<p>${trimmed.replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;
}

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'updatedAt', label: 'Date de modification' },
  { value: 'createdAt', label: 'Date de création' },
  { value: 'title', label: 'Titre (A‑Z)' },
  { value: 'wordCount', label: 'Nombre de mots' },
];

const FILTER_OPTIONS: { value: FilterType; label: string }[] = [
  { value: 'all', label: 'Tous les types' },
  { value: 'draft', label: 'Brouillons' },
  { value: 'final', label: 'Finalisés' },
  { value: 'contract', label: 'Contrats' },
];

// ─── Mini dropdown export par document ───────────────────────────────────────

function DocExportMenu({ doc, onClose }: { doc: Document; onClose: () => void }) {
  const html = doc.content ?? '';

  const handleDocx = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await exportDocx(doc.title, html);
    onClose();
  };

  const handlePdf = (e: React.MouseEvent) => {
    e.stopPropagation();
    exportPdf(doc.title, html);
    onClose();
  };

  return (
    <div
      className={cn(
        'absolute right-0 top-full mt-1 z-30 w-36 rounded-md shadow-lg py-1',
        'bg-[var(--color-surface)] border border-[var(--color-border)]'
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={handleDocx}
        className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--color-surface-raised)] transition-colors flex items-center gap-2"
      >
        <FileType className="w-3.5 h-3.5 text-blue-600" /> Word (.docx)
      </button>
      <button
        onClick={handlePdf}
        className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--color-surface-raised)] transition-colors flex items-center gap-2"
      >
        <FileType2 className="w-3.5 h-3.5 text-red-500" /> PDF (.pdf)
      </button>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function DocumentList() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sortField, setSortField] = useState<SortField>('updatedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  const [previewAnchor, setPreviewAnchor] = useState<{ top: number; left: number } | null>(null);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [showBulkDownloadDropdown, setShowBulkDownloadDropdown] = useState(false);
  const [exportMenuDocId, setExportMenuDocId] = useState<number | null>(null);

  const docs = useLiveQuery(() => db.documents.orderBy('updatedAt').reverse().toArray(), []);

  const filteredAndSorted = (() => {
    if (!docs) return [];
    let list = [...docs];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (d) => d.title.toLowerCase().includes(q) || (d.contentRaw ?? '').toLowerCase().includes(q)
      );
    }
    if (filterType !== 'all') list = list.filter((d) => d.type === filterType);
    list.sort((a, b) => {
      let va: string | number | Date = a[sortField] ?? '';
      let vb: string | number | Date = b[sortField] ?? '';
      if (sortField === 'title') { va = (va as string).toLowerCase(); vb = (vb as string).toLowerCase(); }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  })();

  const allSelected = filteredAndSorted.length > 0 && filteredAndSorted.every((d) => selectedIds.has(d.id!));

  const toggleSelectAll = () =>
    setSelectedIds(allSelected ? new Set() : new Set(filteredAndSorted.map((d) => d.id!)));

  const toggleSelect = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const handleCreate = async (
    title: string,
    template: import('./NewDocumentDialog').DialogTemplate | null,
  ) => {
    setDialogOpen(false);
    const now = new Date();
    const templateContent = template?.content ?? '';
    const content = templateToEditorContent(templateContent);
    const textForCount = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const wordCount = textForCount ? textForCount.split(' ').filter(Boolean).length : 0;
    const id = await saveDocument({
      title: title || 'Nouveau document', type: 'draft', content,
      contentRaw: templateContent, tags: [], createdAt: now, updatedAt: now, wordCount,
      category: template?.documentCategory,
    });
    router.push(`/documents/${id}`);
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (confirm('Supprimer ce document ?')) {
      await deleteDocument(id);
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
      if (previewDoc?.id === id) { setPreviewDoc(null); setPreviewAnchor(null); }
    }
  };

  const handleDeleteSelected = async () => {
    if (!confirm(`Supprimer ${selectedIds.size} document(s) ?`)) return;
    for (const id of selectedIds) await deleteDocument(id);
    setSelectedIds(new Set());
    setPreviewDoc(null); setPreviewAnchor(null);
  };

  const handleBulkDownload = async (format: 'docx' | 'pdf') => {
    if (!docs) return;
    const selected = docs.filter((d) => selectedIds.has(d.id!));
    for (const d of selected) {
      if (format === 'docx') await exportDocx(d.title, d.content ?? '');
      else exportPdf(d.title, d.content ?? '');
    }
    setShowBulkDownloadDropdown(false);
  };

  const startRename = (e: React.MouseEvent, doc: Document) => {
    e.stopPropagation();
    setRenamingId(doc.id!);
    setRenameValue(doc.title);
  };

  const commitRename = async (doc: Document) => {
    if (renameValue.trim() && renameValue !== doc.title)
      await saveDocument({ ...doc, title: renameValue.trim(), updatedAt: new Date() });
    setRenamingId(null);
  };

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>, doc: Document) => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    const rect = e.currentTarget.getBoundingClientRect();
    hoverTimeout.current = setTimeout(() => {
      setPreviewDoc(doc);
      setPreviewAnchor({ top: rect.top, left: rect.right + 12 });
    }, 500);
  };

  const handleMouseLeave = () => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    setPreviewDoc(null);
    setPreviewAnchor(null);
  };

  return (
    <>
      <div className="p-6 max-w-4xl" onClick={() => setExportMenuDocId(null)}>

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-[var(--color-text)]">Documents</h1>
          <button
            onClick={() => setDialogOpen(true)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium',
              'bg-[var(--color-primary)] text-white hover:opacity-90 transition-opacity'
            )}
          >
            <Plus className="w-4 h-4" /> Nouveau document
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
            <input
              type="text"
              placeholder="Rechercher…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(
                'w-full pl-9 pr-4 py-2 text-sm rounded-md',
                'bg-[var(--color-surface-raised)] border border-[var(--color-border)]',
                'text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)]',
                'focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]'
              )}
            />
          </div>

          {/* Sort */}
          <div className="relative">
            <button
              onClick={() => { setShowSortDropdown((v) => !v); setShowFilterDropdown(false); }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-sm rounded-md border',
                'border-[var(--color-border)] bg-[var(--color-surface-raised)]',
                'text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors'
              )}
            >
              {sortDir === 'asc' ? <SortAsc className="w-4 h-4" /> : <SortDesc className="w-4 h-4" />}
              Trier <ChevronDown className="w-3 h-3 opacity-60" />
            </button>
            {showSortDropdown && (
              <div className={cn(
                'absolute top-full mt-1 right-0 z-20 w-52 rounded-md shadow-lg',
                'bg-[var(--color-surface)] border border-[var(--color-border)] py-1'
              )}>
                {SORT_OPTIONS.map((opt) => (
                  <button key={opt.value}
                    onClick={() => { setSortField(opt.value); setShowSortDropdown(false); }}
                    className={cn(
                      'w-full text-left px-4 py-2 text-sm hover:bg-[var(--color-surface-raised)] transition-colors',
                      sortField === opt.value && 'text-[var(--color-primary)] font-medium'
                    )}
                  >{opt.label}</button>
                ))}
                <div className="border-t border-[var(--color-border)] mt-1 pt-1">
                  <button
                    onClick={() => { setSortDir((d) => d === 'asc' ? 'desc' : 'asc'); setShowSortDropdown(false); }}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--color-surface-raised)] transition-colors flex items-center gap-2"
                  >
                    {sortDir === 'asc' ? <SortAsc className="w-4 h-4" /> : <SortDesc className="w-4 h-4" />}
                    {sortDir === 'asc' ? 'Croissant' : 'Décroissant'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Filter */}
          <div className="relative">
            <button
              onClick={() => { setShowFilterDropdown((v) => !v); setShowSortDropdown(false); }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-sm rounded-md border transition-colors',
                'border-[var(--color-border)] bg-[var(--color-surface-raised)]',
                'text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]',
                filterType !== 'all' && 'border-[var(--color-primary)] text-[var(--color-primary)]'
              )}
            >
              <Filter className="w-4 h-4" /> Filtrer <ChevronDown className="w-3 h-3 opacity-60" />
            </button>
            {showFilterDropdown && (
              <div className={cn(
                'absolute top-full mt-1 right-0 z-20 w-48 rounded-md shadow-lg',
                'bg-[var(--color-surface)] border border-[var(--color-border)] py-1'
              )}>
                {FILTER_OPTIONS.map((opt) => (
                  <button key={opt.value}
                    onClick={() => { setFilterType(opt.value); setShowFilterDropdown(false); }}
                    className={cn(
                      'w-full text-left px-4 py-2 text-sm hover:bg-[var(--color-surface-raised)] transition-colors',
                      filterType === opt.value && 'text-[var(--color-primary)] font-medium'
                    )}
                  >{opt.label}</button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className={cn(
            'flex items-center gap-3 px-4 py-2.5 mb-3 rounded-md text-sm',
            'bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20'
          )}>
            <span className="text-[var(--color-primary)] font-medium">
              {selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <div className="relative">
                <button
                  onClick={() => setShowBulkDownloadDropdown((v) => !v)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md',
                    'bg-[var(--color-surface-raised)] border border-[var(--color-border)]',
                    'text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors'
                  )}
                >
                  <Download className="w-3.5 h-3.5" /> Télécharger <ChevronDown className="w-3 h-3 opacity-60" />
                </button>
                {showBulkDownloadDropdown && (
                  <div className={cn(
                    'absolute top-full mt-1 right-0 z-20 w-40 rounded-md shadow-lg',
                    'bg-[var(--color-surface)] border border-[var(--color-border)] py-1'
                  )}>
                    <button onClick={() => handleBulkDownload('docx')} className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--color-surface-raised)] transition-colors flex items-center gap-2">
                      <FileType className="w-4 h-4 text-blue-600" /> Word (.docx)
                    </button>
                    <button onClick={() => handleBulkDownload('pdf')} className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--color-surface-raised)] transition-colors flex items-center gap-2">
                      <FileType2 className="w-4 h-4 text-red-500" /> PDF (.pdf)
                    </button>
                  </div>
                )}
              </div>
              <button
                onClick={handleDeleteSelected}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" /> Supprimer
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="p-1.5 rounded hover:bg-[var(--color-surface-raised)] text-[var(--color-text-muted)] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Column header */}
        {filteredAndSorted.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-1.5 mb-1 text-xs text-[var(--color-text-muted)] font-medium select-none">
            <button onClick={toggleSelectAll} className="flex-shrink-0">
              {allSelected
                ? <CheckSquare className="w-4 h-4 text-[var(--color-primary)]" />
                : <Square className="w-4 h-4" />}
            </button>
            <span className="flex-1">Titre</span>
            <span className="w-36 text-right hidden sm:block">Modifié le</span>
            <span className="w-20 text-right hidden sm:block">Mots</span>
            <span className="w-24 hidden sm:block" />
          </div>
        )}

        {/* Rows */}
        <div className="space-y-0.5">
          {filteredAndSorted.map((doc) => (
            <div
              key={doc.id}
              onMouseEnter={(e) => handleMouseEnter(e, doc)}
              onMouseLeave={handleMouseLeave}
              onClick={() => { setExportMenuDocId(null); renamingId !== doc.id && router.push(`/documents/${doc.id}`); }}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-md cursor-pointer group transition-colors',
                'hover:bg-[var(--color-surface-raised)]',
                selectedIds.has(doc.id!) && 'bg-[var(--color-primary)]/5'
              )}
            >
              {/* Checkbox */}
              <button
                onClick={(e) => toggleSelect(e, doc.id!)}
                style={selectedIds.has(doc.id!) ? { opacity: 1 } : undefined}
                className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                {selectedIds.has(doc.id!)
                  ? <CheckSquare className="w-4 h-4 text-[var(--color-primary)]" />
                  : <Square className="w-4 h-4 text-[var(--color-text-muted)]" />}
              </button>

              <FileText className="w-4 h-4 text-[var(--color-text-muted)] flex-shrink-0" />

              {/* Titre */}
              <div className="flex-1 min-w-0" onClick={(e) => renamingId === doc.id && e.stopPropagation()}>
                {renamingId === doc.id ? (
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename(doc);
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                      className={cn(
                        'flex-1 text-sm px-2 py-0.5 rounded border',
                        'border-[var(--color-primary)] bg-[var(--color-surface-raised)]',
                        'text-[var(--color-text)] focus:outline-none'
                      )}
                    />
                    <button onClick={() => commitRename(doc)} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setRenamingId(null)} className="p-1 text-red-500 hover:bg-red-50 rounded"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ) : (
                  <>
                    <div className="text-sm font-medium text-[var(--color-text)] truncate">{doc.title}</div>
                    <div className="text-xs text-[var(--color-text-muted)] sm:hidden">{formatDateTime(doc.updatedAt)} • {doc.wordCount} mots</div>
                  </>
                )}
              </div>

              {/* Date */}
              <div className="text-xs text-[var(--color-text-muted)] w-36 text-right hidden sm:block flex-shrink-0">
                {formatDateTime(doc.updatedAt)}
              </div>

              {/* Mots */}
              <div className="text-xs text-[var(--color-text-muted)] w-20 text-right hidden sm:block flex-shrink-0">
                {doc.wordCount ?? 0} mots
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-0.5 w-24 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity relative">
                <button
                  onClick={(e) => startRename(e, doc)}
                  className="p-1.5 rounded hover:bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] transition-colors"
                  title="Renommer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>

                {/* Bouton télécharger avec dropdown docx/pdf */}
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setExportMenuDocId(exportMenuDocId === doc.id ? null : doc.id!);
                    }}
                    className="p-1.5 rounded hover:bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] transition-colors"
                    title="Télécharger"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  {exportMenuDocId === doc.id && (
                    <DocExportMenu doc={doc} onClose={() => setExportMenuDocId(null)} />
                  )}
                </div>

                <button
                  onClick={(e) => handleDelete(e, doc.id!)}
                  className="p-1.5 rounded hover:bg-red-100 hover:text-red-600 transition-colors text-[var(--color-text-muted)]"
                  title="Supprimer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}

          {filteredAndSorted.length === 0 && (
            <div className="py-12 text-center text-[var(--color-text-muted)] text-sm">
              {search || filterType !== 'all'
                ? 'Aucun document ne correspond aux critères.'
                : 'Aucun document. Créez votre premier document ci-dessus.'}
            </div>
          )}
        </div>
      </div>

      {previewDoc && previewAnchor && (
        <DocumentHoverPreview doc={previewDoc} anchor={previewAnchor} />
      )}

      <NewDocumentDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onCreate={handleCreate} />
    </>
  );
}
