'use client';

import { useEffect, useState } from 'react';
import { X, PauseCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Dossier } from '@/types';

interface PendingStatusDialogProps {
  open: boolean;
  dossier: Dossier;
  onClose: () => void;
  onConfirm: (note: string) => void | Promise<void>;
}

export function PendingStatusDialog({
  open,
  dossier,
  onClose,
  onConfirm,
}: PendingStatusDialogProps) {
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) setNote(dossier.pendingNote ?? '');
  }, [open, dossier.pendingNote]);

  if (!open) return null;

  const isEditingExisting = dossier.status === 'pending';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative flex flex-col rounded-xl shadow-2xl w-[520px] max-w-[calc(100vw-32px)]"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
        }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <PauseCircle className="w-4 h-4 text-amber-600" />
            {isEditingExisting
              ? 'Modifier la note de mise en attente'
              : 'Mettre le dossier en attente'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-[var(--color-surface-raised)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onConfirm(note);
          }}
          className="flex flex-col gap-4 px-6 py-5"
        >
          <p className="text-sm text-[var(--color-text-muted)]">
            Précisez ce qui est attendu ou la raison de la mise en attente. La
            note s'affichera dans le dossier et sur le tableau de bord.
          </p>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-[var(--color-text-muted)]">
              Raison / ce qui est attendu
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              autoFocus
              placeholder="Ex. En attente du RIB du client, réponse du Greffe, retour de l'expert, signature du bordereau…"
              className={cn(
                'w-full px-3 py-2 text-sm rounded-md resize-none',
                'bg-[var(--color-surface-raised)] border border-[var(--color-border)]',
                'text-[var(--color-text)]',
                'focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]'
              )}
            />
          </label>

          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
            <button
              type="button"
              onClick={onClose}
              className={cn(
                'px-4 py-2 text-sm rounded-md',
                'bg-[var(--color-surface-raised)] hover:bg-[var(--color-border)]'
              )}
            >
              Annuler
            </button>
            <button
              type="submit"
              className={cn(
                'px-4 py-2 text-sm rounded-md font-medium text-white',
                'bg-amber-600 hover:bg-amber-700'
              )}
            >
              {isEditingExisting ? 'Enregistrer la note' : 'Mettre en attente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
