'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, FileText, X, Folder, User, Clock, FileCode,
} from 'lucide-react';
import { db, searchDocuments, contactDisplayName } from '@/lib/db';
import { cn } from '@/lib/utils';
import type { Document, Dossier, Contact, Deadline } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
}

// ─── Type unifié de résultat ──────────────────────────────────────────────────
// Chaque résultat porte le type d'entité + les champs nécessaires à l'affichage
// et à la navigation. Les résultats sont groupés par type dans le rendu.

type ResultKind = 'document' | 'dossier' | 'contact' | 'deadline' | 'template';

interface SearchResult {
  kind: ResultKind;
  id: number | string;
  title: string;
  subtitle?: string;
  href: string;
}

const KIND_ICONS: Record<ResultKind, React.ElementType> = {
  document: FileText,
  dossier:  Folder,
  contact:  User,
  deadline: Clock,
  template: FileCode,
};

const KIND_LABELS: Record<ResultKind, string> = {
  document: 'Documents',
  dossier:  'Dossiers',
  contact:  'Intervenants',
  deadline: 'Délais',
  template: 'Modèles',
};

// ─── Helpers de recherche ─────────────────────────────────────────────────────

async function searchDossiers(q: string): Promise<Dossier[]> {
  const lower = q.toLowerCase();
  return db.dossiers
    .filter((d) =>
      d.name.toLowerCase().includes(lower) ||
      (d.reference ?? '').toLowerCase().includes(lower) ||
      (d.description ?? '').toLowerCase().includes(lower) ||
      (d.clientName ?? '').toLowerCase().includes(lower) ||
      (d.tags ?? []).some((t) => t.toLowerCase().includes(lower))
    )
    .limit(5)
    .toArray();
}

async function searchContacts(q: string): Promise<Contact[]> {
  const lower = q.toLowerCase();
  return db.contacts
    .filter((c) =>
      (c.firstName ?? '').toLowerCase().includes(lower) ||
      (c.lastName ?? '').toLowerCase().includes(lower) ||
      (c.companyName ?? '').toLowerCase().includes(lower) ||
      (c.email ?? '').toLowerCase().includes(lower) ||
      (c.phone ?? '').toLowerCase().includes(lower) ||
      (c.profession ?? '').toLowerCase().includes(lower) ||
      (c.notes ?? '').toLowerCase().includes(lower)
    )
    .limit(5)
    .toArray();
}

async function searchDeadlines(q: string): Promise<Deadline[]> {
  const lower = q.toLowerCase();
  return db.deadlines
    .filter((d) =>
      d.title.toLowerCase().includes(lower) ||
      (d.dossier ?? '').toLowerCase().includes(lower) ||
      (d.notes ?? '').toLowerCase().includes(lower)
    )
    .limit(5)
    .toArray();
}

interface TemplateRow {
  id: number;
  name?: string;
  category?: string;
  description?: string;
  documentCategory?: string;
}

async function searchTemplates(q: string): Promise<TemplateRow[]> {
  const lower = q.toLowerCase();
  const rows = await db.table('templates').toArray() as TemplateRow[];
  return rows
    .filter((t) =>
      (t.name ?? '').toLowerCase().includes(lower) ||
      (t.description ?? '').toLowerCase().includes(lower) ||
      (t.category ?? '').toLowerCase().includes(lower) ||
      (t.documentCategory ?? '').toLowerCase().includes(lower)
    )
    .slice(0, 5);
}

function formatDeadlineDate(date: Date | string): string {
  try {
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function GlobalSearch({ open, onClose }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

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
    if (q.length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    // Lance toutes les recherches en parallèle et merge les résultats.
    const [docs, dossiers, contacts, deadlines, templates] = await Promise.all([
      searchDocuments(q).then((r) => r.slice(0, 5)),
      searchDossiers(q),
      searchContacts(q),
      searchDeadlines(q),
      searchTemplates(q),
    ]);
    const merged: SearchResult[] = [
      ...docs.map<SearchResult>((d: Document) => ({
        kind: 'document',
        id: d.id!,
        title: d.title,
        subtitle: (d.contentRaw ?? '').slice(0, 80),
        href: `/documents/${d.id}`,
      })),
      ...dossiers.map<SearchResult>((d) => ({
        kind: 'dossier',
        id: d.id!,
        title: d.name,
        subtitle: [d.reference, d.clientName].filter(Boolean).join(' · '),
        href: `/dossiers/${d.id}`,
      })),
      ...contacts.map<SearchResult>((c) => ({
        kind: 'contact',
        id: c.id!,
        title: contactDisplayName(c),
        subtitle: [c.email, c.phone, c.profession].filter(Boolean).join(' · '),
        // Les contacts n'ont pas de page dédiée ; on redirige vers la liste
        // des dossiers, depuis laquelle l'onglet Intervenants est accessible.
        href: `/dossiers`,
      })),
      ...deadlines.map<SearchResult>((d) => ({
        kind: 'deadline',
        id: d.id!,
        title: d.title,
        subtitle: [formatDeadlineDate(d.dueDate), d.dossier].filter(Boolean).join(' · '),
        href: `/tools/deadline-tracker`,
      })),
      ...templates.map<SearchResult>((t) => ({
        kind: 'template',
        id: t.id,
        title: t.name ?? 'Sans titre',
        subtitle: [t.category, t.documentCategory].filter(Boolean).join(' · '),
        href: `/templates`,
      })),
    ];
    setResults(merged);
    setLoading(false);
  }, []);

  if (!open) return null;

  // Groupement par kind pour l'affichage.
  const groups = (['document', 'dossier', 'contact', 'deadline', 'template'] as ResultKind[])
    .map((kind) => ({ kind, items: results.filter((r) => r.kind === kind) }))
    .filter((g) => g.items.length > 0);

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
            placeholder="Rechercher documents, dossiers, intervenants, délais, modèles…"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] outline-none"
          />
          <button onClick={onClose} aria-label="Fermer">
            <X className="w-4 h-4 text-[var(--color-text-muted)]" />
          </button>
        </div>

        {/* Résultats groupés */}
        {groups.length > 0 && (
          <div className="max-h-[60vh] overflow-y-auto py-2">
            {groups.map((g) => {
              const Icon = KIND_ICONS[g.kind];
              return (
                <section key={g.kind} className="mb-1">
                  <div className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-faint)]">
                    {KIND_LABELS[g.kind]}
                  </div>
                  <ul>
                    {g.items.map((r) => (
                      <li key={`${r.kind}-${r.id}`}>
                        <button
                          className={cn(
                            'w-full flex items-center gap-3 px-4 py-2 text-left',
                            'hover:bg-[var(--color-surface-raised)] transition-colors'
                          )}
                          onClick={() => { router.push(r.href); onClose(); }}
                        >
                          <Icon className="w-4 h-4 text-[var(--color-text-muted)] flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm text-[var(--color-text)] truncate">{r.title}</div>
                            {r.subtitle && (
                              <div className="text-xs text-[var(--color-text-muted)] truncate">
                                {r.subtitle}
                              </div>
                            )}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}

        {query.length >= 2 && !loading && results.length === 0 && (
          <div className="px-4 py-6 text-sm text-center text-[var(--color-text-muted)]">
            Aucun résultat pour « {query} »
          </div>
        )}

        {loading && results.length === 0 && (
          <div className="px-4 py-6 text-sm text-center text-[var(--color-text-muted)]">
            Recherche…
          </div>
        )}
      </div>
    </div>
  );
}
