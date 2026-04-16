'use client';

import { useState, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRouter } from 'next/navigation';
import {
  Plus, FileText, Trash2, Search, SortAsc, SortDesc,
  Filter, Download, CheckSquare, Square, Pencil, Check, X,
  ChevronDown, FileDown
} from 'lucide-react';
import { db, saveDocument, deleteDocument } from '@/lib/db';
import { formatDateTime } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { NewDocumentDialog } from './NewDocumentDialog';
import { DocumentPreviewPanel } from './DocumentPreviewPanel';
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

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadDocAsTxt(doc: Document) {
  const text = (doc.content ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  downloadBlob(new Blob([text], { type: 'text/plain' }), `${doc.title}.txt`);
}

function downloadDocAsHtml(doc: Document) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${doc.title}</title></head><body>${doc.content ?? ''}</body></html>`;
  downloadBlob(new Blob([html], { type: 'text/html' }), `${doc.title}.html`);
}

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'updatedAt', label: 'Date de modification' },
  { value: 'createdAt', label: 'Date de cr\u00e9ation' },
  { value: 'title', label: 'Titre (A\u2011Z)' },
  { value: 'wordCount', label: 'Nombre de mots' },
];

const FILTER_OPTIONS: { value: FilterType; label: string }[] = [
  { value: 'all', label: 'Tous les types' },
  { value: 'draft', label: 'Brouillons' },
  { value: 'final', label: 'Finalis\u00e9s' },
  { value: 'contract', label: 'Contrats' },
];

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
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [showDownloadDropdown, setShowDownloadDropdown] = useState(false);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(filteredAndSorted.map((d) => d.id!)));
  };

  const toggleSelect = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const handleCreate = async (title: string, templateContent: string) => {
    setDialogOpen(false);
    const now = new Date();
    const content = templateToEditorContent(templateContent);
    const textForCount = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const wordCount = textForCount ? textForCount.split(' ').filter(Boolean).length : 0;
    const id = await saveDocument({
      title: title || 'Nouveau document', type: 'draft', content,
      contentRaw: templateContent, tags: [], createdAt: now, updatedAt: now, wordCount,
    });
    router.push(`/documents/${id}`);
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (confirm('Supprimer ce document ?')) {
      await deleteDocument(id);
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
      if (previewDoc?.id === id) setPreviewDoc(null);
    }
  };

  const handleDeleteSelected = async () => {
    if (!confirm(`Supprimer ${selectedIds.size} document(s) ?`)) return;
    for (const id of selectedIds) await deleteDocument(id);
    setSelectedIds(new Set());
    if (previewDoc && selectedIds.has(previewDoc.id!)) setPreviewDoc(null);
  };

  const handleDownloadSelected = (format: 'txt' | 'html') => {
    if (!docs) return;
    docs.filter((d) => selectedIds.has(d.id!)).forEach((d) => format === 'txt' ? downloadDocAsTxt(d) : downloadDocAsHtml(d));
    setShowDownloadDropdown(false);
  };

  const startRename = (e: React.MouseEvent, doc: Document) => {
    e.stopPropagation();
    setRenamingId(doc.id!);
    setRenameValue(doc.title);
  };

  const commitRename = async (doc: Document) => {
    if (renameValue.trim() && renameValue !== doc.title) {
      await saveDocument({ ...doc, title: renameValue.trim(), updatedAt: new Date() });
      if (previewDoc?.id === doc.id) setPreviewDoc({ ...doc, title: renameValue.trim() });
    }
    setRenamingId(null);
  };

  const handleMouseEnter = (doc: Document) => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    hoverTimeout.current = setTimeout(() => setPreviewDoc(doc), 400);
  };

  const handleMouseLeave = () => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
  };

  return (
    <>
      {/* Two-column layout 60 / 40 */}
      <div className="flex h-full">

        {/* ── Left: document list ── 60% */}
        <div className="basis-[60%] shrink-0 min-w-0 overflow-auto p-6">

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
              <Plus className="w-4 h-4" />
              Nouveau document
            </button>
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
              <input
                type="text"
                placeholder="Rechercher\u2026"
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
                Trier
                <ChevronDown className="w-3 h-3 opacity-60" />
              </button>
              {showSortDropdown && (
                <div className={cn(
                  'absolute top-full mt-1 right-0 z-20 w-52 rounded-md shadow-lg',
                  'bg-[var(--color-surface)] border border-[var(--color-border)] py-1'
                )}>
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
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
                      {sortDir === 'asc' ? 'Croissant' : 'D\u00e9croissant'}
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
                <Filter className="w-4 h-4" />
                Filtrer
                <ChevronDown className="w-3 h-3 opacity-60" />
              </button>
              {showFilterDropdown && (
                <div className={cn(
                  'absolute top-full mt-1 right-0 z-20 w-48 rounded-md shadow-lg',
                  'bg-[var(--color-surface)] border border-[var(--color-border)] py-1'
                )}>
                  {FILTER_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
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
                {selectedIds.size} s\u00e9lectionn\u00e9{selectedIds.size > 1 ? 's' : ''}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <div className="relative">
                  <button
                    onClick={() => setShowDownloadDropdown((v) => !v)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md',
                      'bg-[var(--color-surface-raised)] border border-[var(--color-border)]',
                      'text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors'
                    )}
                  >
                    <Download className="w-3.5 h-3.5" /> T\u00e9l\u00e9charger
                    <ChevronDown className="w-3 h-3 opacity-60" />
                  </button>
                  {showDownloadDropdown && (
                    <div className={cn(
                      'absolute top-full mt-1 right-0 z-20 w-40 rounded-md shadow-lg',
                      'bg-[var(--color-surface)] border border-[var(--color-border)] py-1'
                    )}>
                      <button onClick={() => handleDownloadSelected('txt')} className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--color-surface-raised)] transition-colors flex items-center gap-2">
                        <FileDown className="w-4 h-4" /> Texte (.txt)
                      </button>
                      <button onClick={() => handleDownloadSelected('html')} className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--color-surface-raised)] transition-colors flex items-center gap-2">
                        <FileDown className="w-4 h-4" /> HTML (.html)
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
              <span className="w-32 text-right">Modifi\u00e9 le</span>
              <span className="w-16 text-right">Mots</span>
              <span className="w-16" />
            </div>
          )}

          {/* Rows */}
          <div className="space-y-0.5">
            {filteredAndSorted.map((doc) => (
              <div
                key={doc.id}
                onMouseEnter={() => handleMouseEnter(doc)}
                onMouseLeave={handleMouseLeave}
                onClick={() => renamingId !== doc.id && router.push(`/documents/${doc.id}`)}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-md cursor-pointer group transition-colors',
                  'hover:bg-[var(--color-surface-raised)]',
                  selectedIds.has(doc.id!) && 'bg-[var(--color-primary)]/5',
                  previewDoc?.id === doc.id && 'bg-[var(--color-surface-raised)]'
                )}
              >
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
                      <div className="text-xs text-[var(--color-text-muted)]">{formatDateTime(doc.updatedAt)} \u2022 {doc.wordCount} mots</div>
                    </>
                  )}
                </div>

                <div className="text-xs text-[var(--color-text-muted)] w-32 text-right flex-shrink-0">{formatDateTime(doc.updatedAt)}</div>
                <div className="text-xs text-[var(--color-text-muted)] w-16 text-right flex-shrink-0">{doc.wordCount} mots</div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity w-16 justify-end flex-shrink-0">
                  <button onClick={(e) => startRename(e, doc)} className="p-1.5 rounded hover:bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] transition-colors" title="Renommer">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); downloadDocAsTxt(doc); }} className="p-1.5 rounded hover:bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] transition-colors" title="T\u00e9l\u00e9charger">
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={(e) => handleDelete(e, doc.id!)} className="p-1.5 rounded hover:bg-red-100 hover:text-red-600 transition-colors" title="Supprimer">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}

            {filteredAndSorted.length === 0 && (
              <div className="py-12 text-center text-[var(--color-text-muted)] text-sm">
                {search || filterType !== 'all'
                  ? 'Aucun document ne correspond aux crit\u00e8res.'
                  : 'Aucun document. Cr\u00e9ez votre premier document ci-dessus.'}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: preview panel ── 40% */}
        <DocumentPreviewPanel doc={previewDoc} />
      </div>

      <NewDocumentDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onCreate={handleCreate} />
    </>
  );
}
