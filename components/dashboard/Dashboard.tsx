'use client';

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRouter } from 'next/navigation';
import { addDays, differenceInCalendarDays } from 'date-fns';
import { db } from '@/lib/db';
import { Avatar, Badge, Button, Card, Eyebrow } from '@/components/ui';
import type { Deadline, DeadlineType } from '@/types';

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
      .slice(0, 3);
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

      {/* Échéances + Activité */}
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
                  onClick={() => router.push('/tools/deadline-tracker')}
                />
              );
            })
          )}
        </Card>

        <Card title="Activité récente" padding={0}>
          {(recentDocs ?? []).length === 0 ? (
            <div
              className="px-5 py-8 text-center text-[var(--fg-secondary)]"
              style={{ fontFamily: 'var(--font-serif)', fontSize: 15 }}
            >
              Aucune activité pour l’instant.
            </div>
          ) : (
            (recentDocs ?? []).map((doc, i) => {
              const updated = new Date(doc.updatedAt);
              const relative = formatUpdatedRelative(updated, now);
              return (
                <ActivityRow
                  key={doc.id ?? i}
                  variant={i % 2 === 0 ? 'brand' : 'steel'}
                  who="CM"
                  headline={
                    <>
                      <strong className="font-semibold text-[var(--fg-primary)]">
                        Vous
                      </strong>{' '}
                      avez mis à jour <em className="not-italic font-medium">{doc.title}</em>
                    </>
                  }
                  when={relative}
                  isFirst={i === 0}
                  onClick={() => doc.id && router.push(`/documents/${doc.id}`)}
                />
              );
            })
          )}
        </Card>
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
  onClick,
}: {
  day: string;
  monthLabel: string;
  title: string;
  subtitle: string;
  tone: Tone;
  rel: string;
  isFirst: boolean;
  onClick: () => void;
}) {
  const badgeVariant =
    tone === 'danger' ? 'danger'
    : tone === 'warning' ? 'warning'
    : tone === 'info' ? 'info'
    : 'neutral';

  return (
    <button
      onClick={onClick}
      className={
        'flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors ' +
        'hover:bg-[var(--bg-surface-alt)] ' +
        (isFirst ? '' : 'border-t border-[var(--border-subtle)]')
      }
    >
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
  );
}

function ActivityRow({
  variant,
  who,
  headline,
  when,
  isFirst,
  onClick,
}: {
  variant: 'brand' | 'steel';
  who: string;
  headline: React.ReactNode;
  when: string;
  isFirst: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        'flex w-full items-start gap-3 px-5 py-3 text-left transition-colors ' +
        'hover:bg-[var(--bg-surface-alt)] ' +
        (isFirst ? '' : 'border-t border-[var(--border-subtle)]')
      }
    >
      <Avatar initials={who} size={28} variant={variant} />
      <div className="min-w-0 flex-1">
        <div className="text-[var(--fg-primary)]" style={{ fontSize: 13, lineHeight: 1.4 }}>
          {headline}
        </div>
        <div className="mt-1 text-[var(--fg-tertiary)]" style={{ fontSize: 11 }}>
          {when}
        </div>
      </div>
    </button>
  );
}

function formatUpdatedRelative(date: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'hier';
  if (days < 7) return `il y a ${days} jours`;
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}
