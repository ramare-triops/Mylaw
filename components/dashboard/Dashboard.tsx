'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useRouter } from 'next/navigation';
import { FileText, Clock, AlertTriangle, Plus } from 'lucide-react';
import { db, saveDocument } from '@/lib/db';
import { formatDateTime, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { addDays, isAfter, isBefore } from 'date-fns';

export function Dashboard() {
  const router = useRouter();

  const recentDocs = useLiveQuery(() =>
    db.documents.orderBy('updatedAt').reverse().limit(5).toArray()
  );

  const urgentDeadlines = useLiveQuery(() => {
    const in7days = addDays(new Date(), 7);
    return db.deadlines
      .filter((d) => !d.done && isBefore(new Date(d.dueDate), in7days))
      .toArray();
  });

  const createDocument = async () => {
    const now = new Date();
    const id = await saveDocument({
      title: 'Nouveau document',
      type: 'draft',
      content: '',
      contentRaw: '',
      tags: [],
      createdAt: now,
      updatedAt: now,
      wordCount: 0,
    });
    router.push(`/documents/${id}`);
  };

  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-[var(--color-text)] capitalize">{today}</h1>
        <p className="text-[var(--color-text-muted)] text-sm mt-1">Bienvenue sur Mylex</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Urgent deadlines */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-[var(--color-warning)]" />
            <h2 className="text-sm font-semibold text-[var(--color-text)]">Délais urgents</h2>
          </div>
          <div className="space-y-2">
            {urgentDeadlines?.length === 0 && (
              <p className="text-xs text-[var(--color-text-muted)] py-4">
                Aucun délai urgent dans les 7 prochains jours. ✓
              </p>
            )}
            {urgentDeadlines?.map((d) => (
              <div
                key={d.id}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-md',
                  'bg-[var(--color-surface-raised)] border border-[var(--color-border)]'
                )}
              >
                <Clock className="w-4 h-4 text-[var(--color-warning)] mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[var(--color-text)] truncate">{d.title}</div>
                  <div className="text-xs text-[var(--color-text-muted)]">
                    {d.dossier} • Échéance : {formatDate(d.dueDate)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Recent documents */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-[var(--color-primary)]" />
              <h2 className="text-sm font-semibold text-[var(--color-text)]">Documents récents</h2>
            </div>
            <button
              onClick={createDocument}
              className="flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline"
            >
              <Plus className="w-3.5 h-3.5" />
              Nouveau
            </button>
          </div>
          <div className="space-y-1">
            {recentDocs?.length === 0 && (
              <p className="text-xs text-[var(--color-text-muted)] py-4">
                Aucun document encore. Créez votre premier document.
              </p>
            )}
            {recentDocs?.map((doc) => (
              <button
                key={doc.id}
                onClick={() => router.push(`/documents/${doc.id}`)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-md text-left',
                  'hover:bg-[var(--color-surface-raised)] transition-colors'
                )}
              >
                <FileText className="w-3.5 h-3.5 text-[var(--color-text-muted)] flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm text-[var(--color-text)] truncate">{doc.title}</div>
                  <div className="text-xs text-[var(--color-text-muted)]">
                    {formatDateTime(doc.updatedAt)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
