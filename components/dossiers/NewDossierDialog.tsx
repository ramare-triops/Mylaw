'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Dossier, DossierType, DossierStatus } from '@/types';
import {
  DOSSIER_TYPE_LABELS,
  DOSSIER_STATUS_LABELS,
} from './labels';
import { nextDossierReference } from '@/lib/db';

interface NewDossierDialogProps {
  open: boolean;
  initial?: Dossier;
  onClose: () => void;
  onSave: (dossier: Dossier) => void;
}

export function NewDossierDialog({
  open,
  initial,
  onClose,
  onSave,
}: NewDossierDialogProps) {
  const [reference, setReference] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<DossierType>('judiciary');
  const [status, setStatus] = useState<DossierStatus>('open');
  const [clientName, setClientName] = useState('');
  const [description, setDescription] = useState('');
  const [tagsInput, setTagsInput] = useState('');

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setReference(initial.reference);
      setName(initial.name);
      setType(initial.type);
      setStatus(initial.status);
      setClientName(initial.clientName ?? '');
      setDescription(initial.description ?? '');
      setTagsInput((initial.tags ?? []).join(', '));
    } else {
      // Suggestion immédiate (placeholder optimiste) puis valeur exacte
      // récupérée depuis Dexie via nextDossierReference().
      setReference('');
      setName('');
      setType('judiciary');
      setStatus('open');
      setClientName('');
      setDescription('');
      setTagsInput('');
      let cancelled = false;
      void nextDossierReference().then((ref) => {
        if (!cancelled) setReference(ref);
      });
      return () => { cancelled = true; };
    }
  }, [open, initial]);

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const now = new Date();
    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const payload: Dossier = {
      ...(initial ?? {}),
      reference: reference.trim() || `DOS-${Date.now()}`,
      name: name.trim() || 'Nouveau dossier',
      type,
      status,
      clientName: clientName.trim() || undefined,
      description: description.trim() || undefined,
      tags,
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    };
    onSave(payload);
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
        className="relative flex flex-col rounded-xl shadow-2xl w-[560px] max-w-[calc(100vw-32px)]"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
        }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-base font-semibold">
            {initial ? 'Modifier le dossier' : 'Nouveau dossier'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-[var(--color-surface-raised)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 px-6 py-5"
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Référence">
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="26001"
                className={inputCls}
                autoFocus
              />
            </Field>
            <Field label="Nom du dossier">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex. Dupont c/ SCI Martin"
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Client (libellé rapide)">
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Ex. M. Dupont"
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as DossierType)}
                className={inputCls}
              >
                {Object.entries(DOSSIER_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Statut">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as DossierStatus)}
                className={inputCls}
              >
                {Object.entries(DOSSIER_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={cn(inputCls, 'resize-none')}
              placeholder="Quelques lignes pour situer le dossier…"
            />
          </Field>

          <Field label="Tags (séparés par des virgules)">
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="urgent, expertise, pénal"
              className={inputCls}
            />
          </Field>

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
                'bg-[var(--color-primary)] hover:opacity-90'
              )}
            >
              {initial ? 'Enregistrer' : 'Créer le dossier'}
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
  'focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]'
);
