'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useRouter } from 'next/navigation';
import { FileText, Clock, AlertTriangle, Plus, CalendarDays } from 'lucide-react';
import { db, saveDocument } from '@/lib/db';
import { formatDateTime, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { addDays, isBefore } from 'date-fns';
import type { Deadline, DeadlineType } from '@/types';

// Mapping type DB → libellé lisible + couleur (aligné avec DeadlineTracker).
const DEADLINE_TYPE_META: Record<DeadlineType, { label: string; color: string }> = {
  peremption: { label: 'Péremption',       color: 'var(--color-error)'       },
  forclusion: { label: 'Forclusion',       color: 'var(--color-error)'       },
  reponse:    { label: 'Délai de réponse', color: 'var(--color-warning)'     },
  audience:   { label: 'Audience',         color: 'var(--color-primary)'     },
  appel:      { label: 'Appel',            color: 'var(--color-primary)'     },
  other:      { label: 'Autre',            color: 'var(--color-text-muted)' },
};

function daysUntil(date: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
}

function formatRelative(days: number): { label: string; tone: 'overdue' | 'today' | 'soon' | 'ok' } {
  if (days < 0)   return { label: `J+${Math.abs(days)}`, tone: 'overdue' };
  if (days === 0) return { label: "Aujourd'hui",          tone: 'today'   };
  if (days <= 7)  return { label: `J-${days}`,            tone: 'soon'    };
  return            { label: `J-${days}`,                 tone: 'ok'      };
}

const TONE_COLORS: Record<'overdue' | 'today' | 'soon' | 'ok', string> = {
  overdue: 'var(--color-error)',
  today:   'var(--color-error)',
  soon:    'var(--color-warning)',
  ok:      'var(--color-text-muted)',
};

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

  // Toutes les échéances non terminées, triées par date croissante
  // (les plus proches en premier, past-due inclus car encore actionnables).
  const upcomingDeadlines = useLiveQuery(async () => {
    const all = await db.deadlines.toArray();
    return all
      .filter((d) => !d.done)
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
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
                    {d.dossier} • Échéance : {formatDate(d.dueDate)}
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

      {/* Prochaines échéances — toutes les non terminées, ordre chronologique */}
      <section className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-[var(--color-primary)]" />
            <h2 className="text-sm font-semibold text-[var(--color-text)]">
              Prochaines échéances
            </h2>
            {upcomingDeadlines && upcomingDeadlines.length > 0 && (
              <span className="text-xs text-[var(--color-text-muted)]">
                · {upcomingDeadlines.length}
              </span>
            )}
          </div>
          <button
            onClick={() => router.push('/tools/deadline-tracker')}
            className="text-xs text-[var(--color-primary)] hover:underline"
          >
            Voir tout
          </button>
        </div>
        <div className="rounded-md border border-[var(--color-border)] overflow-hidden">
          {upcomingDeadlines?.length === 0 && (
            <p className="text-xs text-[var(--color-text-muted)] py-6 text-center">
              Aucune échéance enregistrée.
            </p>
          )}
          {upcomingDeadlines?.map((d: Deadline, i: number) => {
            const days = daysUntil(new Date(d.dueDate));
            const rel  = formatRelative(days);
            const meta = DEADLINE_TYPE_META[d.type] ?? DEADLINE_TYPE_META.other;
            const isLast = i === upcomingDeadlines.length - 1;
            return (
              <button
                key={d.id}
                onClick={() => router.push('/tools/deadline-tracker')}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                  'hover:bg-[var(--color-surface-raised)]',
                  !isLast && 'border-b border-[var(--color-border)]',
                )}
              >
                <span
                  className="flex-shrink-0 w-1.5 h-8 rounded-full"
                  style={{ background: meta.color }}
                  aria-hidden
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--color-text)] truncate">
                      {d.title}
                    </span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap"
                      style={{ background: `${meta.color}18`, color: meta.color, fontWeight: 600 }}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--color-text-muted)] mt-0.5 truncate">
                    {formatDate(d.dueDate)}
                    {d.dossier && <> · {d.dossier}</>}
                  </div>
                </div>
                <span
                  className="flex-shrink-0 text-xs font-semibold tabular-nums"
                  style={{ color: TONE_COLORS[rel.tone] }}
                >
                  {rel.label}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
