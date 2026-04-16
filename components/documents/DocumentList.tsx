'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRouter } from 'next/navigation';
import { Plus, FileText, Trash2, Search } from 'lucide-react';
import { db, saveDocument, deleteDocument } from '@/lib/db';
import { formatDateTime } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { NewDocumentDialog } from './NewDocumentDialog';
import type { Document } from '@/types';

/**
 * Convertit le contenu d'un modèle en contenu exploitable par l'éditeur TipTap.
 * - JSON TipTap ({"type":"doc"...}) → stocké tel quel (l'éditeur le parse directement)
 * - HTML ou texte brut → encapsulé en HTML simple
 * - Vide → chaîne vide
 */
function templateToEditorContent(raw: string): string {
  if (!raw || raw.trim() === '') return '';
  const trimmed = raw.trim();
  // JSON TipTap : on le passe directement, l'éditeur sait le parser
  if (trimmed.startsWith('{"type":"doc"')) return trimmed;
  // HTML : on le passe tel quel
  if (trimmed.startsWith('<')) return trimmed;
  // Texte brut : on encapsule proprement
  return `<p>${trimmed.replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;
}

export function DocumentList() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  const docs = useLiveQuery(
    () =>
      search
        ? db.documents
            .filter(
              (d) =>
                d.title.toLowerCase().includes(search.toLowerCase()) ||
                (d.contentRaw ?? '').toLowerCase().includes(search.toLowerCase())
            )
            .reverse()
            .sortBy('updatedAt')
        : db.documents.orderBy('updatedAt').reverse().toArray(),
    [search]
  );

  const handleCreate = async (title: string, templateContent: string) => {
    setDialogOpen(false);
    const now = new Date();
    const content = templateToEditorContent(templateContent);
    // wordCount : nombre de mots approximatif (sur le texte brut dépouillé de balises)
    const textForCount = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const wordCount = textForCount ? textForCount.split(' ').filter(Boolean).length : 0;
    const id = await saveDocument({
      title: title || 'Nouveau document',
      type: 'draft',
      content,
      contentRaw: templateContent,
      tags: [],
      createdAt: now,
      updatedAt: now,
      wordCount,
    });
    router.push(`/documents/${id}`);
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (confirm('Supprimer ce document ?')) await deleteDocument(id);
  };

  return (
    <>
      <div className="p-6 max-w-4xl">
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

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
          <input
            type="text"
            placeholder="Rechercher dans les documents…"
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

        <div className="space-y-1">
          {docs?.map((doc) => (
            <div
              key={doc.id}
              onClick={() => router.push(`/documents/${doc.id}`)}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-md cursor-pointer group',
                'hover:bg-[var(--color-surface-raised)] transition-colors'
              )}
            >
              <FileText className="w-4 h-4 text-[var(--color-text-muted)] flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-[var(--color-text)] truncate">
                  {doc.title}
                </div>
                <div className="text-xs text-[var(--color-text-muted)]">
                  {formatDateTime(doc.updatedAt)} • {doc.wordCount} mots
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => handleDelete(e, doc.id!)}
                  className="p-1.5 rounded hover:bg-red-100 hover:text-red-600 transition-colors"
                  aria-label="Supprimer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
          {docs?.length === 0 && (
            <div className="py-12 text-center text-[var(--color-text-muted)] text-sm">
              Aucun document. Créez votre premier document ci-dessus.
            </div>
          )}
        </div>
      </div>

      <NewDocumentDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreate={handleCreate}
      />
    </>
  );
}
