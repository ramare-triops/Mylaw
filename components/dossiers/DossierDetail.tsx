'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  FileText,
  Users,
  Euro,
  History,
  Pencil,
  Trash2,
  FolderKanban,
  PauseCircle,
  PlayCircle,
  Clock,
} from 'lucide-react';
import { db, deleteDossier, saveDossier } from '@/lib/db';
import { cn, formatDate } from '@/lib/utils';
import { usePrivacy } from '@/components/providers/PrivacyProvider';
import { maskDossierName, maskClientName } from '@/lib/privacy';
import { NewDossierDialog } from './NewDossierDialog';
import { PendingStatusDialog } from './PendingStatusDialog';
import { DossierDocumentsTab } from './tabs/DossierDocumentsTab';
import { DossierContactsTab } from './tabs/DossierContactsTab';
import { DossierFinanceTab } from './tabs/DossierFinanceTab';
import { DossierAuditTab } from './tabs/DossierAuditTab';
import {
  DOSSIER_TYPE_LABELS,
  DOSSIER_STATUS_LABELS,
  DOSSIER_STATUS_COLORS,
} from './labels';
import type { Dossier } from '@/types';

type TabKey = 'documents' | 'contacts' | 'finance' | 'audit';

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'contacts', label: 'Intervenants', icon: Users },
  { key: 'finance', label: 'Finances', icon: Euro },
  { key: 'audit', label: 'Journal', icon: History },
];

export function DossierDetail({ dossierId }: { dossierId: number }) {
  const router = useRouter();
  const { privacyMode } = usePrivacy();
  const dossier = useLiveQuery(
    () => db.dossiers.get(dossierId),
    [dossierId]
  );
  const [activeTab, setActiveTab] = useState<TabKey>('documents');
  const [editOpen, setEditOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);

  if (!dossier) return null;

  async function handleEdit(d: Dossier) {
    await saveDossier(d);
    setEditOpen(false);
  }

  async function togglePending(note?: string) {
    if (!dossier) return;
    const now = new Date();
    if (dossier.status === 'pending') {
      // Reprise : retour au statut "active" et purge de la note.
      await saveDossier({
        ...dossier,
        status: 'active',
        pendingNote: undefined,
        pendingSince: undefined,
      });
    } else {
      await saveDossier({
        ...dossier,
        status: 'pending',
        pendingNote: (note ?? '').trim() || undefined,
        pendingSince: now,
      });
    }
    setPendingOpen(false);
  }

  async function handleDelete() {
    if (
      !confirm(
        `Supprimer définitivement le dossier "${dossier!.name}" ? Les documents seront détachés mais conservés.`
      )
    )
      return;
    await deleteDossier(dossierId);
    router.push('/dossiers');
  }

  const isPending = dossier.status === 'pending';

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="max-w-6xl mx-auto px-6 pt-4 pb-3">
            <button
              onClick={() => router.push('/dossiers')}
              className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] mb-3"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Tous les dossiers
            </button>

            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <FolderKanban className="w-5 h-5 text-[var(--color-primary)]" />
                  <span className="font-mono text-xs text-[var(--color-text-muted)]">
                    {dossier.reference}
                  </span>
                  <span
                    className={cn(
                      'inline-block px-2 py-0.5 text-xs font-medium rounded-full border',
                      DOSSIER_STATUS_COLORS[dossier.status]
                    )}
                  >
                    {DOSSIER_STATUS_LABELS[dossier.status]}
                  </span>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {DOSSIER_TYPE_LABELS[dossier.type]}
                  </span>
                </div>
                <h1 className="text-lg font-semibold text-[var(--color-text)] truncate">
                  {privacyMode ? maskDossierName(dossier.name) : dossier.name}
                </h1>
                {dossier.clientName && (
                  <div className="text-sm text-[var(--color-text-muted)] mt-0.5">
                    Client :{' '}
                    {privacyMode
                      ? maskClientName(dossier.clientName)
                      : dossier.clientName}
                  </div>
                )}
                {dossier.description && (
                  <p className="text-sm text-[var(--color-text-muted)] mt-2 max-w-2xl">
                    {dossier.description}
                  </p>
                )}
                {dossier.tags.length > 0 && (
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    {dossier.tags.map((t) => (
                      <span
                        key={t}
                        className="px-2 py-0.5 text-xs rounded bg-[var(--color-surface-raised)] text-[var(--color-text-muted)]"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
                <div className="text-xs text-[var(--color-text-muted)] mt-3">
                  Créé le {formatDate(dossier.createdAt)} · Mis à jour le{' '}
                  {formatDate(dossier.updatedAt)}
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button
                  onClick={() => (isPending ? togglePending() : setPendingOpen(true))}
                  title={isPending ? 'Reprendre le dossier' : 'Mettre le dossier en attente'}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border transition-colors',
                    isPending
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                      : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
                  )}
                >
                  {isPending ? (
                    <>
                      <PlayCircle className="w-3.5 h-3.5" /> Reprendre
                    </>
                  ) : (
                    <>
                      <PauseCircle className="w-3.5 h-3.5" /> Mettre en attente
                    </>
                  )}
                </button>
                <button
                  onClick={() => setEditOpen(true)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md',
                    'bg-[var(--color-surface-raised)] border border-[var(--color-border)]',
                    'hover:bg-[var(--color-border)] transition-colors'
                  )}
                >
                  <Pencil className="w-3.5 h-3.5" /> Modifier
                </button>
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Supprimer
                </button>
              </div>
            </div>

            {/* Bandeau "En attente" */}
            {isPending && (
              <div className="mt-4 flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
                <PauseCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-800">
                    Dossier en attente
                    {dossier.pendingSince && (
                      <span className="flex items-center gap-1 font-normal text-amber-700">
                        <Clock className="w-3 h-3" />
                        depuis le {formatDate(dossier.pendingSince)}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-sm text-amber-900 whitespace-pre-wrap">
                    {dossier.pendingNote?.trim() || 'Aucun motif renseigné.'}
                  </div>
                </div>
                <button
                  onClick={() => setPendingOpen(true)}
                  className="flex-shrink-0 text-xs text-amber-700 hover:text-amber-900 underline"
                >
                  Modifier la note
                </button>
              </div>
            )}

            {/* Sub-tabs */}
            <div className="flex gap-1 mt-5 -mb-3">
              {TABS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 text-sm rounded-t-md border-b-2 -mb-px transition-colors',
                    activeTab === key
                      ? 'border-[var(--color-primary)] text-[var(--color-primary)] font-medium'
                      : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-auto">
          <div className="max-w-6xl mx-auto">
            {activeTab === 'documents' && (
              <DossierDocumentsTab dossier={dossier} />
            )}
            {activeTab === 'contacts' && (
              <DossierContactsTab dossier={dossier} />
            )}
            {activeTab === 'finance' && (
              <DossierFinanceTab dossier={dossier} />
            )}
            {activeTab === 'audit' && <DossierAuditTab dossier={dossier} />}
          </div>
        </div>
      </div>

      <NewDossierDialog
        open={editOpen}
        initial={dossier}
        onClose={() => setEditOpen(false)}
        onSave={handleEdit}
      />

      <PendingStatusDialog
        open={pendingOpen}
        dossier={dossier}
        onClose={() => setPendingOpen(false)}
        onConfirm={togglePending}
      />
    </>
  );
}
