'use client';

/**
 * Outil « Bordereau de pièces » — squelette (Phase 1).
 *
 * Architecture identique au calculateur d'intérêts :
 *   - Vue liste : projets de bordereau enregistrés sur le dossier ouvert,
 *     bouton « Nouveau bordereau » qui ouvre une boîte de saisie du nom.
 *   - Vue détail : éditeur du bordereau (réglages tampon, sélection des
 *     pièces, génération). Le contenu interne est ajouté par les phases
 *     suivantes du plan.
 */

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft,
  FileStack,
  Plus,
  Trash2,
  Stamp,
  Settings2,
} from 'lucide-react';
import { db, deleteBordereau } from '@/lib/db';
import { cn } from '@/lib/utils';
import { StampSettingsDialog } from './StampSettingsDialog';
import type { Bordereau, Dossier } from '@/types';

interface Props {
  dossier?: Dossier;
}

export function PieceListTool({ dossier }: Props) {
  const [openId, setOpenId] = useState<number | null>(null);

  if (!dossier?.id) {
    return (
      <div
        className="px-6 py-12 text-center text-sm"
        style={{ color: 'var(--color-text-muted)' }}
      >
        Cet outil ne peut être utilisé qu&apos;à l&apos;intérieur d&apos;un dossier.
      </div>
    );
  }

  if (openId !== null) {
    return (
      <BordereauDetail
        key={openId}
        dossier={dossier}
        bordereauId={openId}
        onBack={() => setOpenId(null)}
      />
    );
  }

  return <BordereauList dossier={dossier} onOpen={setOpenId} />;
}

// ─── Liste des bordereaux ──────────────────────────────────────────────────

function BordereauList({
  dossier,
  onOpen,
}: {
  dossier: Dossier;
  onOpen: (id: number) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState('');

  const saved = useLiveQuery<Bordereau[]>(
    () =>
      dossier.id
        ? db.bordereaux.where('dossierId').equals(dossier.id).toArray()
        : Promise.resolve([] as Bordereau[]),
    [dossier.id],
  );

  const sorted = useMemo(
    () =>
      (saved ?? [])
        .slice()
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() -
            new Date(a.updatedAt).getTime(),
        ),
    [saved],
  );

  async function createBordereau() {
    if (!dossier.id) return;
    const name =
      draftName.trim() ||
      `Bordereau du ${new Date().toLocaleDateString('fr-FR')}`;
    const now = new Date();
    const payload: Bordereau = {
      dossierId: dossier.id,
      name,
      autoNumbering: true,
      generatedDocumentIds: [],
      createdAt: now,
      updatedAt: now,
    };
    const id = await db.bordereaux.add(payload);
    setCreating(false);
    setDraftName('');
    onOpen(Number(id));
  }

  async function handleDelete(id: number | undefined) {
    if (!id) return;
    if (
      !confirm(
        'Supprimer définitivement ce bordereau ? Les pièces sources importées seront perdues. Les documents PDF déjà générés dans le dossier ne seront pas affectés (utilisez plutôt « Supprimer le bordereau » dans l\'éditeur pour les retirer aussi).',
      )
    ) {
      return;
    }
    await deleteBordereau(id);
  }

  return (
    <div className="px-6 py-6">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <FileStack
            size={18}
            style={{ color: 'var(--color-primary)' }}
          />
          <h2
            className="text-base font-semibold"
            style={{ color: 'var(--color-text)' }}
          >
            Bordereaux de pièces
          </h2>
        </div>
        <button
          onClick={() => {
            setCreating(true);
            setDraftName('');
          }}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md font-medium text-white',
            'bg-[var(--color-primary)] hover:opacity-90',
          )}
        >
          <Plus size={13} /> Nouveau bordereau
        </button>
      </div>

      {creating && (
        <div
          className="mb-4 rounded-md border p-3 flex items-center gap-2 flex-wrap"
          style={{
            borderColor: 'var(--color-primary)',
            background: 'oklch(from var(--color-primary) l c h / 0.04)',
          }}
        >
          <input
            type="text"
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void createBordereau();
              if (e.key === 'Escape') {
                setCreating(false);
                setDraftName('');
              }
            }}
            placeholder="Nom du bordereau (ex. « Bordereau de communication n°1 »)"
            className={cn(
              'flex-1 min-w-[260px] px-2 py-1.5 text-sm rounded-md',
              'bg-[var(--color-surface)] border border-[var(--color-border)]',
              'text-[var(--color-text)] placeholder:text-[var(--color-text-faint)]',
              'focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]',
            )}
          />
          <button
            onClick={() => void createBordereau()}
            className={cn(
              'px-3 py-1.5 text-sm rounded-md font-medium text-white',
              'bg-[var(--color-primary)] hover:opacity-90',
            )}
          >
            Créer
          </button>
          <button
            onClick={() => {
              setCreating(false);
              setDraftName('');
            }}
            className={cn(
              'px-3 py-1.5 text-sm rounded-md',
              'bg-[var(--color-surface-raised)] border border-[var(--color-border)]',
              'hover:bg-[var(--color-border)]',
            )}
          >
            Annuler
          </button>
        </div>
      )}

      {sorted.length === 0 ? (
        <div
          className="rounded-md border px-4 py-8 text-center text-sm"
          style={{
            borderColor: 'var(--color-border)',
            color: 'var(--color-text-muted)',
            background: 'var(--color-surface)',
          }}
        >
          Aucun bordereau pour ce dossier. Cliquez sur « Nouveau bordereau »
          pour en créer un.
        </div>
      ) : (
        <ul
          className="rounded-md border overflow-hidden"
          style={{ borderColor: 'var(--color-border)' }}
        >
          {sorted.map((b) => (
            <li
              key={b.id}
              className="flex items-center gap-3 px-3 py-2 border-t first:border-t-0"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <button
                onClick={() => onOpen(b.id!)}
                className="flex-1 min-w-0 text-left flex items-center gap-3"
              >
                <FileStack
                  size={14}
                  style={{ color: 'var(--color-text-muted)' }}
                />
                <span
                  className="truncate text-sm"
                  style={{ color: 'var(--color-text)' }}
                >
                  {b.name}
                </span>
                <span
                  className="text-xs whitespace-nowrap"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {new Date(b.updatedAt).toLocaleDateString('fr-FR')}
                </span>
              </button>
              <button
                onClick={() => handleDelete(b.id)}
                title="Supprimer"
                className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-error)]"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Vue détail d'un bordereau ─────────────────────────────────────────────
//
// Squelette pour la phase 1 : affiche le nom (éditable) et trois sections
// vides qui seront remplies par les phases suivantes :
//   - Réglages du tampon (Phase 2)
//   - Pièces (Phase 3 + 4)
//   - Génération / suppression (Phase 5 + 6)

function BordereauDetail({
  dossier,
  bordereauId,
  onBack,
}: {
  dossier: Dossier;
  bordereauId: number;
  onBack: () => void;
}) {
  const bordereau = useLiveQuery<Bordereau | undefined>(
    () => db.bordereaux.get(bordereauId),
    [bordereauId],
  );
  const [stampOpen, setStampOpen] = useState(false);

  async function rename(newName: string) {
    if (!bordereau) return;
    await db.bordereaux.update(bordereauId, {
      name: newName,
      updatedAt: new Date(),
    });
  }

  if (!bordereau) {
    return (
      <div
        className="px-6 py-12 text-center text-sm"
        style={{ color: 'var(--color-text-muted)' }}
      >
        Chargement du bordereau…
      </div>
    );
  }

  return (
    <div className="px-6 py-6">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <button
          onClick={onBack}
          title="Retour aux bordereaux"
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md',
            'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
            'hover:bg-[var(--color-surface-raised)]',
          )}
        >
          <ArrowLeft size={12} /> Bordereaux
        </button>
        <input
          type="text"
          value={bordereau.name}
          onChange={(e) => void rename(e.target.value)}
          placeholder="Nom du bordereau"
          className={cn(
            'text-base font-semibold bg-transparent border-0 border-b border-transparent',
            'focus:outline-none focus:border-[var(--color-primary)]',
            'flex-1 min-w-[260px] py-1',
          )}
          style={{ color: 'var(--color-text)' }}
        />
        <button
          onClick={() => setStampOpen(true)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md',
            'bg-[var(--color-surface-raised)] border border-[var(--color-border)]',
            'hover:bg-[var(--color-border)]',
          )}
        >
          <Settings2 size={13} /> Réglages du tampon
        </button>
      </div>

      <div
        className="rounded-md border px-4 py-6"
        style={{
          borderColor: 'var(--color-border)',
          background: 'var(--color-surface)',
          color: 'var(--color-text-muted)',
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Stamp size={16} />
          <span
            className="text-sm font-medium"
            style={{ color: 'var(--color-text)' }}
          >
            Bordereau « {bordereau.name} »
          </span>
        </div>
        <p className="text-sm leading-relaxed">
          La gestion des pièces et la génération des PDF tamponnés
          seront ajoutées dans les prochaines phases.
        </p>
        <p className="text-xs mt-3">
          Dossier : {dossier.reference} — {dossier.name}
        </p>
      </div>

      <StampSettingsDialog
        open={stampOpen}
        onClose={() => setStampOpen(false)}
      />
    </div>
  );
}
