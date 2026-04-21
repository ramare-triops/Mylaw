'use client';

/**
 * Dialog de configuration d'un bloc d'identification inséré dans un
 * modèle. L'auteur choisit :
 *   - le rôle du dossier à aller chercher (client, partie adverse, avocat
 *     plaidant…),
 *   - le séparateur inséré entre deux intervenants quand le rôle en
 *     compte plusieurs — texte brut à ce stade, suffisant pour les cas
 *     courants (« et », « ainsi que », « ,\net »…).
 *
 * Le HTML effectivement stocké pour le séparateur encapsule le texte
 * dans un `<p>` pour rester conforme au schéma TipTap bloc-par-bloc.
 */

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { DossierRole } from '@/types';

export interface IdentificationBlockPayload {
  role: DossierRole;
  /** HTML prêt à être stocké dans `data-separator`. */
  separator: string;
}

const ROLE_OPTIONS: Array<{ value: DossierRole; label: string }> = [
  { value: 'client',           label: 'Client' },
  { value: 'adversary',        label: 'Partie adverse' },
  { value: 'ownCounsel',       label: 'Avocat du cabinet' },
  { value: 'adversaryCounsel', label: 'Confrère adverse' },
  { value: 'expert',           label: 'Expert' },
  { value: 'bailiff',          label: 'Commissaire de justice' },
  { value: 'judge',            label: 'Magistrat' },
  { value: 'court',            label: 'Juridiction' },
  { value: 'witness',          label: 'Témoin' },
  { value: 'collaborator',     label: 'Collaborateur' },
  { value: 'trainee',          label: 'Stagiaire' },
  { value: 'assistant',        label: 'Assistant(e)' },
  { value: 'other',            label: 'Autre' },
];

export function separatorTextToHtml(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  // Escape minimal pour éviter l'injection de balises arbitraires par
  // collage. On autorise uniquement les retours à la ligne → <br>.
  const safe = trimmed
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<p>${safe.replace(/\n/g, '<br>')}</p>`;
}

export function separatorHtmlToText(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?p[^>]*>/gi, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

interface Props {
  open: boolean;
  initial?: { role?: DossierRole; separator?: string };
  onClose: () => void;
  onSubmit: (payload: IdentificationBlockPayload) => void;
}

export function IdentificationBlockDialog({ open, initial, onClose, onSubmit }: Props) {
  const [role, setRole] = useState<DossierRole>(initial?.role ?? 'client');
  const [separator, setSeparator] = useState<string>(
    separatorHtmlToText(initial?.separator) || 'et'
  );

  // Réinitialise quand on réouvre le dialog pour un nouvel insert.
  useEffect(() => {
    if (!open) return;
    setRole(initial?.role ?? 'client');
    setSeparator(separatorHtmlToText(initial?.separator) || 'et');
  }, [open, initial?.role, initial?.separator]);

  if (!open) return null;

  function submit() {
    onSubmit({ role, separator: separatorTextToHtml(separator) });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl w-[460px] max-w-[92vw]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)]">
          <h3 className="text-sm font-semibold">Bloc d'identification</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--color-surface-raised)]" title="Fermer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--color-text-muted)]">
              Rôle du dossier à aller chercher
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as DossierRole)}
              className="w-full px-3 py-2 text-sm rounded-md bg-[var(--color-surface-raised)] border border-[var(--color-border)]"
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <p className="text-[11px] text-[var(--color-text-faint)]">
              À l'instanciation du modèle dans un dossier, le bloc est
              remplacé par les mentions légales de l'intervenant
              correspondant. Personne physique ou personne morale : la
              variante est choisie automatiquement selon le contact.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--color-text-muted)]">
              Séparateur entre plusieurs intervenants du même rôle
            </label>
            <textarea
              value={separator}
              onChange={(e) => setSeparator(e.target.value)}
              rows={2}
              placeholder="ex : et ; ainsi que ; , son épouse ;"
              className="w-full px-3 py-2 text-sm rounded-md bg-[var(--color-surface-raised)] border border-[var(--color-border)]"
            />
            <p className="text-[11px] text-[var(--color-text-faint)]">
              Inséré entre deux blocs quand le dossier a plusieurs
              intervenants du même rôle (co-clients, etc.). Laissez vide
              pour une simple ligne vide.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-[var(--color-border)]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md bg-[var(--color-surface-raised)] hover:bg-[var(--color-border)]"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            className="px-4 py-2 text-sm rounded-md font-medium text-white bg-[var(--color-primary)] hover:opacity-90"
          >
            Insérer
          </button>
        </div>
      </div>
    </div>
  );
}
