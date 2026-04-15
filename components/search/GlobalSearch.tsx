'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, FileText, Wrench, X } from 'lucide-react';
import { searchDocuments } from '@/lib/db';
import { cn } from '@/lib/utils';
import type { Document } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function GlobalSearch({ open, onClose }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Document[]>([]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        // handled by parent
      }
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    if (!open) { setQuery(''); setResults([]); }
  }, [open]);

  const handleSearch = useCallback(async (q: string) => {
    setQuery(q);
    if (q.length < 2) { setResults([]); return; }
    const docs = await searchDocuments(q);
    setResults(docs.slice(0, 8));
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24"
      onClick={onClose}
    >
      <div
        className={cn(
          'w-full max-w-lg rounded-xl shadow-2xl animate-fade-in',
          'bg-[var(--color-surface)] border border-[var(--color-border)]'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-border)]">
          <Search className="w-4 h-4 text-[var(--color-text-muted)]" />
          <input
            autoFocus
            type="text"
            placeholder="Rechercher des documents, outils…"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] outline-none"
          />
          <button onClick={onClose} aria-label="Fermer">
            <X className="w-4 h-4 text-[var(--color-text-muted)]" />
          </button>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <ul className="py-2">
            {results.map((doc) => (
              <li key={doc.id}>
                <button
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-2.5 text-left',
                    'hover:bg-[var(--color-surface-raised)] transition-colors'
                  )}
                  onClick={() => { router.push(`/documents/${doc.id}`); onClose(); }}
                >
                  <FileText className="w-4 h-4 text-[var(--color-text-muted)] flex-shrink-0" />
                  <div>
                    <div className="text-sm text-[var(--color-text)]">{doc.title}</div>
                    <div className="text-xs text-[var(--color-text-muted)] truncate max-w-xs">
                      {doc.contentRaw?.slice(0, 80)}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        {query.length >= 2 && results.length === 0 && (
          <div className="px-4 py-6 text-sm text-center text-[var(--color-text-muted)]">
            Aucun résultat pour « {query} »
          </div>
        )}
      </div>
    </div>
  );
}
