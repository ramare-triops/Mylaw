'use client';

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRouter } from 'next/navigation';
import { addDays, differenceInCalendarDays } from 'date-fns';
import { Check } from 'lucide-react';
import { db } from '@/lib/db';
import { Badge, Button, Card, Eyebrow } from '@/components/ui';
import type { Deadline, DeadlineType } from '@/types';
import { PendingDossiersCard } from './PendingDossiersCard';
import { RecentDossiersCard } from './RecentDossiersCard';
import { JotCard } from './JotCard';
import { OutlookCard } from './OutlookCard';

const MONTH_ABBR_FR = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
];

const DEADLINE_TYPE_LABEL: Record<DeadlineType, string> = {
  peremption: 'Péremption',
  forclusion: 'Forclusion',
  reponse:    'Délai de réponse',
  audience:   'Audience',
  appel:      'Appel',
  other:      'Échéance',
};

type Tone = 'neutral' | 'info' | 'warning' | 'danger';

function toneForDeadline(days: number, type: DeadlineType): Tone {
  if (days < 0) return 'danger';
  if (type === 'peremption' || type === 'forclusion') return 'danger';
  if (days <= 3) return 'danger';
  if (days <= 7) return 'warning';
  return 'neutral';
}

function formatRelativeDays(days: number): string {
  if (days < 0)   return `J+${Math.abs(days)}`;
  if (days === 0) return "Aujourd'hui";
  return `${days} j.`;
}

function currencyEUR(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDateFR(date: Date): string {
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function weekdayFR(date: Date): string {
  return date.toLocaleDateString('fr-FR', { weekday: 'long' });
}

export function Dashboard() {
  const router = useRouter();
  const now = useMemo(() => new Date(), []);

  const dossiers = useLiveQuery(() => db.dossiers.toArray(), []);
  const allDeadlines = useLiveQuery(() => db.deadlines.toArray(), []);
  const recentDocs = useLiveQuery(
    () => db.documents.orderBy('updatedAt').reverse().limit(4).toArray(),
    [],
  );

  const upcomingDeadlines = useMemo(() => {
    if (!allDeadlines) return [];
    return allDeadlines
      .filter((d) => !d.done)
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .slice(0, 5);
  }, [allDeadlines]);

  const kpis = useMemo(() => {
    const activeDossiers = (dossiers ?? []).filter(
      (d) => d.status === 'active' || d.status === 'pending',
    ).length;
    const weekEnd = addDays(now, 7);
    const openDeadlines = (allDeadlines ?? []).filter((d) => !d.done);
    const dueThisWeek = openDeadlines.filter(
      (d) => new Date(d.dueDate) <= weekEnd,
    ).length;
    const urgent = openDeadlines.filter((d) => {
      const days = differenceInCalendarDays(new Date(d.dueDate), now);
      return days <= 3;
    }).length;
    const signaturesPending = (recentDocs ?? []).filter((d) => d.status === 'review').length;

    return [
      {
        k: 'Dossiers actifs',
        v: activeDossiers.toString(),
        sub: `${(dossiers ?? []).length} au total`,
      },
      {
        k: 'Échéances ≤ 7 j',
        v: dueThisWeek.toString(),
        sub: urgent > 0 ? `${urgent} urgente${urgent > 1 ? 's' : ''}` : 'Aucune urgence',
      },
      {
        k: 'Honoraires · mois',
        v: currencyEUR(12_450),
        sub: '+8,4 % vs mois précédent',
      },
      {
        k: 'Actes à signer',
        v: signaturesPending.toString(),
        sub: signaturesPending === 0 ? 'Aucune signature en attente' : 'En attente',
      },
    ];
  }, [dossiers, allDeadlines, recentDocs, now]);

  async function markDeadlineDone(deadline: Deadline) {
    if (deadline.id == null) return;
    await db.deadlines.update(deadline.id, { done: true });
    // Si l'échéance était synchronisée avec Google Calendar, on supprime
    // aussi l'événement distant en best-effort (pas bloquant si offline).
    if (deadline.googleEventId) {
      try {
        await fetch(
          `/api/google-calendar?id=${encodeURIComponent(deadline.googleEventId)}`,
          { method: 'DELETE' },
        );
        await db.deadlines.update(deadline.id, {
          googleEventId: undefined,
          googleSyncedAt: undefined,
        });
      } catch { /* best-effort */ }
    }
  }

  const dateHeader = useMemo(() => {
    const weekday = weekdayFR(now);
    return `${formatDateFR(now)} · ${weekday}`;
  }, [now]);

  return (
    <div
      className="flex flex-col gap-6"
      style={{ padding: 'var(--content-pad)', maxWidth: 'var(--container-max)' }}
    >
      {/* Header */}
      <header>
        <Eyebrow>{dateHeader}</Eyebrow>
        <h1
          className="mt-1.5 font-semibold text-[var(--fg-primary)]"
          style={{
            fontSize: 28,
            lineHeight: 1.1,
            letterSpacing: 'var(--tracking-snug)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          Bonjour, Maître Moreau.
        </h1>
        <p
          className="mt-1.5 text-[var(--fg-secondary)]"
          style={{ fontSize: 14, lineHeight: 1.5 }}
        >
          Vous avez{' '}
          <strong className="font-semibold text-[var(--fg-primary)]">
            {kpis[1].v} échéance{Number(kpis[1].v) > 1 ? 's' : ''}
          </strong>{' '}
          cette semaine et{' '}
          <strong className="font-semibold text-[var(--fg-primary)]">
            {kpis[3].v} acte{Number(kpis[3].v) > 1 ? 's' : ''}
          </strong>{' '}
          en attente de signature.
        </p>
      </header>

      {/* KPI row */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.k} flat padding={18}>
            <Eyebrow>{kpi.k}</Eyebrow>
            <div
              className="mt-2.5 font-semibold text-[var(--fg-primary)] tabular-nums"
              style={{ fontSize: 26, lineHeight: 1, letterSpacing: 'var(--tracking-snug)' }}
            >
              {kpi.v}
            </div>
            <div
              className="mt-1.5 text-[var(--fg-secondary)]"
              style={{ fontSize: 12, lineHeight: 1.4 }}
            >
              {kpi.sub}
            </div>
          </Card>
        ))}
      </section>

      {/* Échéances à venir (avec cases à cocher) + Dossiers en attente */}
      <section className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card
          title="Échéances à venir"
          padding={0}
          actions={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/tools/deadline-tracker')}
            >
              Voir tout
            </Button>
          }
        >
          {upcomingDeadlines.length === 0 ? (
            <div
              className="px-5 py-8 text-center text-[var(--fg-secondary)]"
              style={{ fontFamily: 'var(--font-serif)', fontSize: 15 }}
            >
              Aucune échéance pour l’instant.
            </div>
          ) : (
            upcomingDeadlines.map((d, i) => {
              const due = new Date(d.dueDate);
              const days = differenceInCalendarDays(due, now);
              const tone = toneForDeadline(days, d.type);
              return (
                <DeadlineRow
                  key={d.id ?? i}
                  day={String(due.getDate()).padStart(2, '0')}
                  monthLabel={MONTH_ABBR_FR[due.getMonth()]}
                  title={d.title}
                  subtitle={`${DEADLINE_TYPE_LABEL[d.type]}${d.dossier ? ` · ${d.dossier}` : ''}`}
                  tone={tone}
                  rel={formatRelativeDays(days)}
                  isFirst={i === 0}
                  onOpen={() => router.push('/tools/deadline-tracker')}
                  onDone={() => markDeadlineDone(d)}
                />
              );
            })
          )}
        </Card>

        <PendingDossiersCard />
      </section>

      {/* Dossiers récents + Jot */}
      <section className="grid gap-4 lg:grid-cols-2">
        <RecentDossiersCard />
        <JotCard />
      </section>

      {/* Outlook sur toute la largeur */}
      <section>
        <OutlookCard />
      </section>
    </div>
  );
}

function DeadlineRow({
  day,
  monthLabel,
  title,
  subtitle,
  tone,
  rel,
  isFirst,
  onOpen,
  onDone,
}: {
  day: string;
  monthLabel: string;
  title: string;
  subtitle: string;
  tone: Tone;
  rel: string;
  isFirst: boolean;
  onOpen: () => void;
  onDone: () => void;
}) {
  const badgeVariant =
    tone === 'danger' ? 'danger'
    : tone === 'warning' ? 'warning'
    : tone === 'info' ? 'info'
    : 'neutral';

  return (
    <div
      className={
        'flex w-full items-center gap-4 px-5 py-3.5 transition-colors ' +
        'hover:bg-[var(--bg-surface-alt)] ' +
        (isFirst ? '' : 'border-t border-[var(--border-subtle)]')
      }
    >
      {/* Case à cocher pour marquer « terminé » */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDone();
        }}
        aria-label="Marquer l'échéance comme terminée"
        title="Marquer comme terminé"
        className={
          'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border ' +
          'border-[var(--border-default)] hover:border-emerald-500 hover:bg-emerald-50 ' +
          'transition-colors'
        }
      >
        <Check className="h-3.5 w-3.5 opacity-0 hover:opacity-100" />
      </button>

      <button onClick={onOpen} className="flex flex-1 items-center gap-4 text-left">
        <div className="w-14 shrink-0 text-center">
          <div
            className="font-semibold text-[var(--fg-primary)] tabular-nums"
            style={{ fontSize: 22, lineHeight: 1 }}
          >
            {day}
          </div>
          <div
            className="mt-1 uppercase text-[var(--fg-tertiary)]"
            style={{ fontSize: 11, letterSpacing: '0.04em', fontWeight: 500 }}
          >
            {monthLabel}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-[var(--fg-primary)]" style={{ fontSize: 14 }}>
            {title}
          </div>
          <div
            className="mt-0.5 truncate text-[var(--fg-secondary)]"
            style={{ fontSize: 12, lineHeight: 1.4 }}
          >
            {subtitle}
          </div>
        </div>
        <Badge variant={badgeVariant} dot>
          {rel}
        </Badge>
      </button>
    </div>
  );
}
