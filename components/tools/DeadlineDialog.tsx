'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { db } from '@/lib/db';
import type { Dossier } from '@/types';

export type DeadlineCategory =
  | 'péremption'
  | 'forclusion'
  | 'réponse'
  | 'audience'
  | 'autre';

export interface DeadlineDraft {
  title: string;
  /** Date (YYYY-MM-DD). */
  date: string;
  /** Heure (HH:MM) — vide = toute la journée. */
  time: string;
  /** Catégorie : valeur de la liste ou texte libre saisi. */
  category: string;
  /** Référence du dossier (texte affiché). */
  dossier: string;
  /** ID du dossier sélectionné en autocomplete (si trouvé en base). */
  dossierId?: number;
  location: string;
  notes: string;
}

const PRESET_CATEGORIES: Array<{ value: DeadlineCategory; label: string }> = [
  { value: 'péremption', label: 'Péremption' },
  { value: 'forclusion', label: 'Forclusion' },
  { value: 'réponse', label: 'Délai de réponse' },
  { value: 'audience', label: 'Audience' },
  { value: 'autre', label: 'Autre' },
];

interface Props {
  open: boolean;
  initial?: Partial<DeadlineDraft>;
  editing: boolean;
  onClose: () => void;
  onSave: (draft: DeadlineDraft) => void;
}

const EMPTY_DRAFT: DeadlineDraft = {
  title: '',
  date: '',
  time: '',
  category: 'autre',
  dossier: '',
  dossierId: undefined,
  location: '',
  notes: '',
};

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function DeadlineDialog({
  open,
  initial,
  editing,
  onClose,
  onSave,
}: Props) {
  const [draft, setDraft] = useState<DeadlineDraft>(EMPTY_DRAFT);
  const [dossierResults, setDossierResults] = useState<Dossier[]>([]);
  const [showDossierResults, setShowDossierResults] = useState(false);
  const dossierBoxRef = useRef<HTMLDivElement | null>(null);

  // Init / reset à chaque ouverture
  useEffect(() => {
    if (!open) return;
    setDraft({
      ...EMPTY_DRAFT,
      date: ymd(new Date()),
      ...(initial ?? {}),
    });
    setShowDossierResults(false);
  }, [open, initial]);

  // Autocomplete dossier : on filtre sur le nom, la référence, le client.
  const queryDossier = draft.dossier.trim();
  useEffect(() => {
    if (!open) return;
    if (queryDossier.length === 0) {
      setDossierResults([]);
      return;
    }
    let cancelled = false;
    const lower = queryDossier.toLowerCase();
    void db.dossiers
      .filter(
        (d) =>
          d.name.toLowerCase().includes(lower) ||
          (d.reference ?? '').toLowerCase().includes(lower) ||
          (d.clientName ?? '').toLowerCase().includes(lower) ||
          (d.tags ?? []).some((t) => t.toLowerCase().includes(lower)),
      )
      .limit(8)
      .toArray()
      .then((rows) => {
        if (!cancelled) setDossierResults(rows);
      })
      .catch(() => {
        if (!cancelled) setDossierResults([]);
      });
    return () => {
      cancelled = true;
    };
  }, [queryDossier, open]);

  // Cliquer hors de la zone résultats ferme la liste
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!dossierBoxRef.current) return;
      if (!dossierBoxRef.current.contains(e.target as Node)) {
        setShowDossierResults(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const isCustomCategory = useMemo(
    () => !PRESET_CATEGORIES.some((c) => c.value === draft.category),
    [draft.category],
  );

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.title.trim() || !draft.date) return;
    onSave({
      ...draft,
      title: draft.title.trim(),
      category: draft.category.trim() || 'autre',
      dossier: draft.dossier.trim(),
      location: draft.location.trim(),
      notes: draft.notes.trim(),
    });
  }

  function pickDossier(d: Dossier) {
    const label = d.reference ? `${d.reference} — ${d.name}` : d.name;
    setDraft((prev) => ({ ...prev, dossier: label, dossierId: d.id }));
    setShowDossierResults(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative flex flex-col rounded-xl shadow-2xl w-[560px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] overflow-hidden"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
        }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-base font-semibold">
            {editing ? 'Modifier le délai' : 'Nouveau délai'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-[var(--color-surface-raised)]"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 px-6 py-5 overflow-y-auto"
        >
          <Field label="Intitulé *">
            <input
              type="text"
              value={draft.title}
              onChange={(e) =>
                setDraft((d) => ({ ...d, title: e.target.value }))
              }
              placeholder="Ex. Conclusions adverses, audience de mise en état…"
              className={inputCls}
              autoFocus
              required
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Date *">
              <input
                type="date"
                value={draft.date}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, date: e.target.value }))
                }
                className={inputCls}
                required
              />
            </Field>
            <Field label="Heure (optionnel)">
              <input
                type="time"
                value={draft.time}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, time: e.target.value }))
                }
                placeholder="—"
                className={inputCls}
              />
            </Field>
          </div>
          <p className="-mt-2 text-xs text-[var(--color-text-muted)]">
            Sans heure, le délai apparaît tout en haut de la journée dans
            Google Agenda (événement « toute la journée »).
          </p>

          <Field label="Catégorie">
            <div className="flex items-center gap-2">
              <select
                value={isCustomCategory ? '__custom__' : draft.category}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '__custom__') {
                    setDraft((d) => ({ ...d, category: '' }));
                  } else {
                    setDraft((d) => ({ ...d, category: v }));
                  }
                }}
                className={cn(inputCls, 'max-w-[200px]')}
              >
                {PRESET_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
                <option value="__custom__">Personnalisée…</option>
              </select>
              <input
                type="text"
                value={isCustomCategory ? draft.category : ''}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, category: e.target.value }))
                }
                placeholder={
                  isCustomCategory
                    ? 'Saisissez une catégorie'
                    : 'ou tapez votre propre catégorie'
                }
                onFocus={() => {
                  if (!isCustomCategory) {
                    setDraft((d) => ({ ...d, category: '' }));
                  }
                }}
                className={inputCls}
              />
            </div>
          </Field>

          <Field label="Dossier (numéro ou nom)">
            <div className="relative" ref={dossierBoxRef}>
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-muted)] pointer-events-none"
                />
                <input
                  type="text"
                  value={draft.dossier}
                  onChange={(e) => {
                    setDraft((d) => ({
                      ...d,
                      dossier: e.target.value,
                      dossierId: undefined,
                    }));
                    setShowDossierResults(true);
                  }}
                  onFocus={() => setShowDossierResults(true)}
                  placeholder="Rechercher par numéro, nom ou client…"
                  className={cn(inputCls, 'pl-8')}
                  autoComplete="off"
                />
              </div>
              {showDossierResults && dossierResults.length > 0 && (
                <ul
                  className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-md border shadow-lg"
                  style={{
                    background: 'var(--color-surface)',
                    borderColor: 'var(--color-border)',
                  }}
                >
                  {dossierResults.map((d) => (
                    <li key={d.id}>
                      <button
                        type="button"
                        onClick={() => pickDossier(d)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-surface-raised)] flex flex-col"
                      >
                        <span className="font-medium">
                          {d.reference ? `${d.reference} — ` : ''}
                          {d.name}
                        </span>
                        {d.clientName && (
                          <span className="text-xs text-[var(--color-text-muted)]">
                            {d.clientName}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Field>

          <Field label="Lieu (optionnel)">
            <input
              type="text"
              value={draft.location}
              onChange={(e) =>
                setDraft((d) => ({ ...d, location: e.target.value }))
              }
              placeholder="Ex. TGI de Paris, salle 4·02"
              className={inputCls}
            />
          </Field>

          <Field label="Notes (optionnel)">
            <textarea
              value={draft.notes}
              onChange={(e) =>
                setDraft((d) => ({ ...d, notes: e.target.value }))
              }
              rows={3}
              className={cn(inputCls, 'resize-none')}
              placeholder="Détails utiles, pièces à préparer…"
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
            <button
              type="button"
              onClick={onClose}
              className={cn(
                'px-4 py-2 text-sm rounded-md',
                'bg-[var(--color-surface-raised)] hover:bg-[var(--color-border)]',
              )}
            >
              Annuler
            </button>
            <button
              type="submit"
              className={cn(
                'px-4 py-2 text-sm rounded-md font-medium text-white',
                'bg-[var(--color-primary)] hover:opacity-90',
              )}
            >
              {editing ? 'Enregistrer' : 'Créer le délai'}
            </button>
          </div>
        </form>
      </div>
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
  'focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]',
);
