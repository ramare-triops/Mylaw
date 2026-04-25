'use client';

import { useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRouter } from 'next/navigation';
import { differenceInCalendarDays } from 'date-fns';
import { X, ExternalLink, AlertTriangle, Bell, Check } from 'lucide-react';
import { db } from '@/lib/db';
import { Button } from '@/components/ui';
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

type Tone = 'neutral' | 'info' | 'warning' | 'danger' | 'overdue';

function toneForDeadline(days: number, type: DeadlineType): Tone {
  if (days < 0) return 'overdue';
  if (days === 0) return 'overdue';
  if (days <= 1) return 'danger';
  if (type === 'peremption' || type === 'forclusion') {
    if (days <= 7) return 'danger';
    if (days <= 15) return 'warning';
  }
  if (days <= 3) return 'danger';
  if (days <= 7) return 'warning';
  return 'neutral';
}

function formatRelativeDays(days: number): string {
  if (days < 0)   return `J+${Math.abs(days)}`;
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return 'Demain';
  return `J-${days}`;
}

const TONE_STYLE: Record<
  Tone,
  { stripe: string; bg: string; hover: string; dayText: string; badgeBg: string; badgeText: string; icon: React.ElementType | null }
> = {
  overdue: {
    stripe: 'bg-red-600',
    bg: 'bg-red-50',
    hover: 'hover:bg-red-100',
    dayText: 'text-red-700',
    badgeBg: 'bg-red-600',
    badgeText: 'text-white',
    icon: AlertTriangle,
  },
  danger: {
    stripe: 'bg-red-500',
    bg: 'bg-red-50/60',
    hover: 'hover:bg-red-50',
    dayText: 'text-red-600',
    badgeBg: 'bg-red-500',
    badgeText: 'text-white',
    icon: Bell,
  },
  warning: {
    stripe: 'bg-amber-500',
    bg: 'bg-amber-50/60',
    hover: 'hover:bg-amber-50',
    dayText: 'text-amber-700',
    badgeBg: 'bg-amber-500',
    badgeText: 'text-white',
    icon: null,
  },
  info: {
    stripe: 'bg-sky-400',
    bg: 'bg-transparent',
    hover: 'hover:bg-[var(--bg-surface-alt)]',
    dayText: 'text-[var(--fg-primary)]',
    badgeBg: 'bg-sky-500',
    badgeText: 'text-white',
    icon: null,
  },
  neutral: {
    stripe: 'bg-transparent',
    bg: 'bg-transparent',
    hover: 'hover:bg-[var(--bg-surface-alt)]',
    dayText: 'text-[var(--fg-primary)]',
    badgeBg: 'bg-[var(--slate-100,#e5e7eb)]',
    badgeText: 'text-[var(--fg-secondary)]',
    icon: null,
  },
};

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Vue plein écran de toutes les échéances non terminées, en ordre
 * chronologique. Utilise la même grille visuelle (bandes colorées,
 * icônes d'alerte, badges J-N) que le widget « Échéances à venir »
 * du dashboard, mais sans limite de nombre.
 *
 * Esc pour fermer ; le scroll body est verrouillé tant que la vue
 * est ouverte.
 */
export function DeadlinesFullscreen({ open, onClose }: Props) {
  const router = useRouter();
  const allDeadlines = useLiveQuery<Deadline[]>(
    () => (open ? db.deadlines.toArray() : Promise.resolve([] as Deadline[])),
    [open],
  );

  const now = useMemo(() => new Date(), []);

  // Esc → close, body scroll lock
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  const sorted = useMemo(() => {
    return (allDeadlines ?? [])
      .filter((d) => !d.done)
      .sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate));
  }, [allDeadlines]);

  // Compteurs par tonalité pour la barre de stats du header.
  const stats = useMemo(() => {
    const s = { overdue: 0, danger: 0, warning: 0, neutral: 0 };
    for (const d of sorted) {
      const days = differenceInCalendarDays(new Date(d.dueDate), now);
      const tone = toneForDeadline(days, d.type);
      if (tone === 'overdue') s.overdue++;
      else if (tone === 'danger') s.danger++;
      else if (tone === 'warning') s.warning++;
      else s.neutral++;
    }
    return s;
  }, [sorted, now]);

  async function markDone(deadline: Deadline) {
    if (deadline.id == null) return;
    await db.deadlines.update(deadline.id, { done: true });
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[var(--bg-surface)]"
      role="dialog"
      aria-modal="true"
      aria-label="Toutes les échéances"
    >
      {/* Header */}
      <header className="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-4">
        <div className="flex items-center gap-4">
          <h2
            className="font-semibold text-[var(--fg-primary)]"
            style={{ fontSize: 22, letterSpacing: 'var(--tracking-snug)' }}
          >
            Toutes les échéances
          </h2>
          <div className="flex items-center gap-2 text-xs">
            {stats.overdue > 0 && (
              <span className="rounded-full bg-red-600 px-2 py-0.5 font-bold text-white">
                {stats.overdue} dépassée{stats.overdue > 1 ? 's' : ''}
              </span>
            )}
            {stats.danger > 0 && (
              <span className="rounded-full bg-red-500 px-2 py-0.5 font-bold text-white">
                {stats.danger} critique{stats.danger > 1 ? 's' : ''}
              </span>
            )}
            {stats.warning > 0 && (
              <span className="rounded-full bg-amber-500 px-2 py-0.5 font-bold text-white">
                {stats.warning} cette semaine
              </span>
            )}
            {stats.neutral > 0 && (
              <span className="rounded-full bg-[var(--slate-100,#e5e7eb)] px-2 py-0.5 font-medium text-[var(--fg-secondary)]">
                {stats.neutral} à venir
              </span>
            )}
            <span className="text-[var(--fg-tertiary)]">
              {sorted.length} au total
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<ExternalLink className="h-3.5 w-3.5" />}
            onClick={() => {
              onClose();
              router.push('/tools/deadline-tracker');
            }}
          >
            Ouvrir le tracker
          </Button>
          <button
            onClick={onClose}
            aria-label="Fermer"
            title="Fermer (Échap)"
            className="rounded-md p-2 text-[var(--fg-tertiary)] hover:bg-[var(--bg-surface-alt)] hover:text-[var(--fg-primary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Liste */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl py-4">
          {sorted.length === 0 ? (
            <div
              className="px-5 py-16 text-center text-[var(--fg-secondary)]"
              style={{ fontFamily: 'var(--font-serif)', fontSize: 17 }}
            >
              Aucune échéance enregistrée. Profitez du calme.
            </div>
          ) : (
            sorted.map((d, i) => {
              const due = new Date(d.dueDate);
              const days = differenceInCalendarDays(due, now);
              const tone = toneForDeadline(days, d.type);
              return (
                <FullscreenDeadlineRow
                  key={d.id ?? i}
                  day={String(due.getDate()).padStart(2, '0')}
                  monthLabel={MONTH_ABBR_FR[due.getMonth()]}
                  year={due.getFullYear()}
                  title={d.title}
                  subtitle={`${DEADLINE_TYPE_LABEL[d.type]}${d.dossier ? ` · ${d.dossier}` : ''}`}
                  tone={tone}
                  rel={formatRelativeDays(days)}
                  isFirst={i === 0}
                  onOpen={() => {
                    onClose();
                    router.push('/tools/deadline-tracker');
                  }}
                  onDone={() => markDone(d)}
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function FullscreenDeadlineRow({
  day, monthLabel, year, title, subtitle, tone, rel, isFirst, onOpen, onDone,
}: {
  day: string; monthLabel: string; year: number;
  title: string; subtitle: string; tone: Tone; rel: string;
  isFirst: boolean; onOpen: () => void; onDone: () => void;
}) {
  const s = TONE_STYLE[tone];
  const isUrgent = tone === 'overdue' || tone === 'danger';
  const Icon = s.icon;

  return (
    <div
      className={
        'relative flex w-full items-center gap-4 pl-5 pr-6 py-4 transition-colors ' +
        s.bg + ' ' + s.hover + ' ' +
        (isFirst ? '' : 'border-t border-[var(--border-subtle)]')
      }
    >
      <span
        aria-hidden
        className={'pointer-events-none absolute left-0 top-0 bottom-0 w-1.5 ' + s.stripe}
      />

      <button
        onClick={(e) => {
          e.stopPropagation();
          onDone();
        }}
        aria-label="Marquer comme terminé"
        title="Marquer comme terminé"
        className={
          'group flex h-6 w-6 flex-shrink-0 items-center justify-center rounded border ' +
          (isUrgent
            ? 'border-red-400 bg-white hover:border-emerald-500 hover:bg-emerald-50'
            : 'border-[var(--border-default)] hover:border-emerald-500 hover:bg-emerald-50') +
          ' transition-colors'
        }
      >
        <Check className="h-4 w-4 opacity-0 group-hover:opacity-100 text-emerald-600" />
      </button>

      <button onClick={onOpen} className="flex flex-1 items-center gap-5 text-left">
        <div className="w-20 shrink-0 text-center">
          <div
            className={'font-bold tabular-nums ' + s.dayText}
            style={{ fontSize: 32, lineHeight: 1 }}
          >
            {day}
          </div>
          <div
            className={
              'mt-1 uppercase ' +
              (isUrgent ? 'text-red-600 font-semibold' : 'text-[var(--fg-tertiary)] font-medium')
            }
            style={{ fontSize: 12, letterSpacing: '0.04em' }}
          >
            {monthLabel} {year}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {Icon && (
              <Icon
                className={
                  'h-5 w-5 flex-shrink-0 ' +
                  (tone === 'overdue' ? 'text-red-600 animate-pulse' : 'text-red-500')
                }
              />
            )}
            <div
              className="truncate font-semibold text-[var(--fg-primary)]"
              style={{ fontSize: 16 }}
            >
              {title}
            </div>
          </div>
          <div
            className={
              'mt-1 truncate ' +
              (isUrgent ? 'text-red-700/80' : 'text-[var(--fg-secondary)]')
            }
            style={{ fontSize: 13, lineHeight: 1.4 }}
          >
            {subtitle}
          </div>
        </div>

        <span
          className={
            'inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 ' +
            'text-[12px] font-bold uppercase tracking-wide whitespace-nowrap ' +
            s.badgeBg + ' ' + s.badgeText
          }
        >
          {rel}
        </span>
      </button>
    </div>
  );
}
