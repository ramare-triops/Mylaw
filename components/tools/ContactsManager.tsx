'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Search,
  Pencil,
  Trash2,
  User,
  UserCircle2,
  Filter,
  ArrowDownAZ,
  ArrowUpAZ,
  Plus,
} from 'lucide-react';
import { db, deleteContact, saveContact, contactDisplayName } from '@/lib/db';
import { cn } from '@/lib/utils';
import { ContactDialog } from '@/components/dossiers/tabs/DossierContactsTab';
import { PROFESSIONAL_CATEGORY_LABELS } from '@/components/dossiers/labels';
import type { Contact, ProfessionalCategory } from '@/types';

/**
 * Filtre du panneau « Gestion des intervenants ».
 *
 * On combine :
 *   - `'all'`     : tous les intervenants (par défaut)
 *   - `'client'`  : pseudo-catégorie regroupant les contacts sans
 *                   `professionalCategory` ou explicitement marqués
 *                   `other` — c'est typiquement un client.
 *   - chaque `ProfessionalCategory` : filtre direct sur la catégorie.
 */
type FilterKey = 'all' | 'client' | ProfessionalCategory;

const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: 'all',          label: 'Tous'                       },
  { key: 'client',       label: 'Clients'                    },
  { key: 'lawyer',       label: 'Avocats'                    },
  { key: 'expert',       label: 'Experts'                    },
  { key: 'bailiff',      label: 'Commissaires de justice'    },
  { key: 'judge',        label: 'Magistrats'                 },
  { key: 'court',        label: 'Juridictions'               },
  { key: 'witness',      label: 'Témoins'                    },
  { key: 'notary',       label: 'Notaires'                   },
  { key: 'collaborator', label: 'Collaborateurs'             },
  { key: 'trainee',      label: 'Stagiaires'                 },
  { key: 'assistant',    label: 'Assistants'                 },
  { key: 'other',        label: 'Autres'                     },
];

function matchFilter(contact: Contact, filter: FilterKey): boolean {
  if (filter === 'all') return true;
  if (filter === 'client') {
    // Un client : pas de catégorie professionnelle explicite, ou
    // la catégorie « other » qui est notre catch-all.
    return !contact.professionalCategory || contact.professionalCategory === 'other';
  }
  return contact.professionalCategory === filter;
}

function categoryLabelFor(c: Contact): string {
  if (!c.professionalCategory) return 'Client';
  return PROFESSIONAL_CATEGORY_LABELS[c.professionalCategory] ?? '';
}

/**
 * Clé de tri alphabétique : on prend le NOM de famille pour les
 * personnes physiques, la raison sociale pour les morales. Sans
 * accents et en minuscules pour un tri français correct.
 */
function sortKey(c: Contact): string {
  const raw = c.type === 'moral'
    ? (c.companyName ?? '')
    : (c.lastName ?? c.firstName ?? c.companyName ?? '');
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function ContactsManager() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [editTarget, setEditTarget] = useState<Contact | null>(null);
  const [creating, setCreating] = useState(false);

  const contacts = useLiveQuery(() => db.contacts.toArray(), []);

  const filtered = useMemo(() => {
    if (!contacts) return [] as Contact[];
    const q = search.trim().toLowerCase();
    let list = contacts.filter((c) => matchFilter(c, filter));
    if (q) {
      list = list.filter((c) => {
        const blob = [
          contactDisplayName(c),
          c.firstName,
          c.lastName,
          c.companyName,
          c.email,
          c.phone,
          c.barreau,
          c.profession,
          c.fileRef,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return blob.includes(q);
      });
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const ka = sortKey(a);
      const kb = sortKey(b);
      return ka.localeCompare(kb, 'fr') * dir;
    });
  }, [contacts, search, filter, sortDir]);

  async function handleDelete(c: Contact) {
    if (c.id == null) return;
    if (
      !confirm(
        `Supprimer définitivement « ${contactDisplayName(c)} » ?\n\n` +
          'Cette action retire le contact de tous les dossiers et documents ' +
          'auxquels il est rattaché. Les dossiers et documents eux-mêmes ' +
          'sont conservés.',
      )
    )
      return;
    await deleteContact(c.id);
  }

  async function handleSave(updated: Contact) {
    await saveContact(updated);
    setEditTarget(null);
    setCreating(false);
  }

  return (
    <div className="flex flex-col h-full max-w-5xl mx-auto p-6 gap-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text)]">
            Gestion des intervenants
          </h1>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            {contacts?.length ?? 0} intervenant{(contacts?.length ?? 0) > 1 ? 's' : ''} au cabinet,
            tous dossiers confondus.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium',
            'bg-[var(--color-primary)] text-white hover:opacity-90',
          )}
        >
          <Plus className="w-4 h-4" /> Nouvel intervenant
        </button>
      </header>

      {/* Toolbar : recherche + filtre + tri */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
          <input
            type="text"
            placeholder="Rechercher (nom, prénom, email, barreau…)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn(
              'w-full pl-9 pr-4 py-2 text-sm rounded-md',
              'bg-[var(--color-surface-raised)] border border-[var(--color-border)]',
              'text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)]',
              'focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]',
            )}
          />
        </div>

        <div className="flex items-center gap-1.5">
          <Filter className="w-4 h-4 text-[var(--color-text-muted)]" />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as FilterKey)}
            className={cn(
              'px-3 py-2 text-sm rounded-md',
              'bg-[var(--color-surface-raised)] border border-[var(--color-border)]',
              'text-[var(--color-text)]',
              'focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]',
            )}
          >
            {FILTER_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          title={
            sortDir === 'asc'
              ? 'Tri alphabétique A → Z (cliquer pour inverser)'
              : 'Tri alphabétique Z → A (cliquer pour inverser)'
          }
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 text-sm rounded-md',
            'bg-[var(--color-surface-raised)] border border-[var(--color-border)]',
            'hover:bg-[var(--color-border)]',
          )}
        >
          {sortDir === 'asc' ? (
            <ArrowDownAZ className="w-4 h-4" />
          ) : (
            <ArrowUpAZ className="w-4 h-4" />
          )}
          A → Z
        </button>
      </div>

      {/* Liste */}
      <div className="flex-1 overflow-auto rounded-md border border-[var(--color-border)]">
        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-sm text-center text-[var(--color-text-muted)]">
            {search || filter !== 'all'
              ? 'Aucun intervenant ne correspond à ces critères.'
              : 'Aucun intervenant enregistré.'}
          </div>
        ) : (
          <ul className="divide-y divide-[var(--color-border)]">
            {filtered.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-3 px-4 py-3 group hover:bg-[var(--color-surface-raised)] transition-colors"
              >
                {c.type === 'moral' ? (
                  <UserCircle2 className="w-5 h-5 text-[var(--color-text-muted)] flex-shrink-0" />
                ) : (
                  <User className="w-5 h-5 text-[var(--color-text-muted)] flex-shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium truncate">
                      {contactDisplayName(c)}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)]">
                      {categoryLabelFor(c)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--color-text-muted)] mt-0.5">
                    {c.email && <span className="truncate">{c.email}</span>}
                    {c.phone && <span>{c.phone}</span>}
                    {c.barreau && <span>Barreau de {c.barreau}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => setEditTarget(c)}
                    className="p-2 rounded hover:bg-[var(--color-border)]"
                    title="Modifier l'intervenant"
                    aria-label="Modifier l'intervenant"
                  >
                    <Pencil className="w-4 h-4 text-[var(--color-text-muted)]" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(c)}
                    className="p-2 rounded hover:bg-red-100"
                    title="Supprimer l'intervenant"
                    aria-label="Supprimer l'intervenant"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ContactDialog
        open={editTarget !== null || creating}
        initial={editTarget ?? undefined}
        onClose={() => {
          setEditTarget(null);
          setCreating(false);
        }}
        onSave={handleSave}
        onDelete={
          editTarget
            ? () => {
                void handleDelete(editTarget).then(() => setEditTarget(null));
              }
            : undefined
        }
      />
    </div>
  );
}
