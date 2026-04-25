'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRouter } from 'next/navigation';
import { addDays, differenceInCalendarDays } from 'date-fns';
import { Check, AlertTriangle, Bell, Maximize2 } from 'lucide-react';
import { db } from '@/lib/db';
import { isValidDossier } from '@/lib/dossier-validation';
import { Button, Card, Eyebrow } from '@/components/ui';
import { useCabinetIdentity } from '@/lib/hooks/useCabinetIdentity';
import type { Deadline, DeadlineType } from '@/types';
import { PendingDossiersCard } from './PendingDossiersCard';
import { RecentDossiersCard } from './RecentDossiersCard';
import { JotCard } from './JotCard';
import { OutlookCard } from './OutlookCard';
import { DeadlinesFullscreen } from './DeadlinesFullscreen';

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
    // Péremption/forclusion : critique même à moyenne distance.
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
  const identity = useCabinetIdentity();
  const [deadlinesFullscreen, setDeadlinesFullscreen] = useState(false);

  const dossiers = useLiveQuery(() => db.dossiers.toArray(), []);
  const allDeadlines = useLiveQuery(() => db.deadlines.toArray(), []);

  const upcomingDeadlines = useMemo(() => {
    if (!allDeadlines) return [];
    return allDeadlines
      .filter((d) => !d.done)
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .slice(0, 5);
  }, [allDeadlines]);

  // ── KPIs ────────────────────────────────────────────────────────────────
  // Tous les compteurs lisent en direct depuis Dexie via `useLiveQuery`.
  // Toute mutation (changement de statut de dossier, ajout d'échéance, etc.)
  // déclenche automatiquement un re-render — pas de cache à invalider.
  const kpis = useMemo(() => {
    // Même filtre de validité que la liste Dossiers (cf. /lib/dossier-validation.ts)
    // pour garantir un compteur aligné avec « N dossiers au cabinet ».
    const all = (dossiers ?? []).filter(isValidDossier);

    // « Dossiers ouverts » : tous les dossiers vivants, c.-à-d. tout
    // sauf 'archived' et 'closed'. Cela inclut donc les statuts 'open',
    // 'active' et 'pending' — ce que l'utilisateur compte réellement
    // dans son activité quotidienne.
    const openDossiers = all.filter(
      (d) => d.status !== 'archived' && d.status !== 'closed',
    );
    const active = openDossiers.filter((d) => d.status === 'active');
    const pending = openDossiers.filter((d) => d.status === 'pending');
    const openCount = openDossiers.length;

    // « Échéances ≤ 7 j » : nombre de délais non terminés dont la date
    // d'échéance tombe dans la fenêtre [now, now + 7 jours].
    const weekEnd = addDays(now, 7);
    const openDeadlines = (allDeadlines ?? []).filter((d) => !d.done);
    const dueThisWeek = openDeadlines.filter((d) => {
      const due = new Date(d.dueDate);
      return due <= weekEnd && due >= startOfDay(now);
    });
    const urgent = dueThisWeek.filter((d) => {
      const days = differenceInCalendarDays(new Date(d.dueDate), now);
      return days <= 3;
    }).length;

    return [
      {
        key: 'dossiers',
        k: 'Dossiers ouverts',
        v: openCount.toString(),
        sub:
          openCount === 0
            ? 'Aucun dossier ouvert'
            : [
                active.length > 0 && `${active.length} en cours`,
                pending.length > 0 && `${pending.length} en attente`,
              ]
                .filter(Boolean)
                .join(' · ') || 'Au cabinet',
        onClick: () => router.push('/dossiers'),
      },
      {
        key: 'deadlines',
        k: 'Échéances ≤ 7 j',
        v: dueThisWeek.length.toString(),
        sub: dueThisWeek.length === 0
          ? 'Aucune urgence'
          : urgent > 0
            ? `${urgent} urgente${urgent > 1 ? 's' : ''}`
            : `${dueThisWeek.length} cette semaine`,
        onClick: () => router.push('/tools/deadline-tracker'),
      },
      {
        key: 'fees',
        // Reset volontaire : la donnée statique 12 450 € a été retirée.
        // Le widget est branché sur 0 le temps que la facturation soit
        // câblée à la base. Voir `computeMonthlyFees` ci-dessous pour le
        // point d'ancrage API.
        k: 'Honoraires · mois',
        v: currencyEUR(computeMonthlyFees(/* dossierId? */)),
        sub: 'Donnée à venir — branché sur les factures',
        onClick: undefined as undefined | (() => void),
      },
      {
        key: 'signatures',
        k: 'Actes à signer',
        v: '0',
        sub: 'Aucune signature en attente',
        onClick: undefined as undefined | (() => void),
      },
    ];
  }, [dossiers, allDeadlines, now, router]);

  async function markDeadlineDone(deadline: Deadline) {
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

  const dateHeader = useMemo(() => {
    const weekday = weekdayFR(now);
    return `${formatDateFR(now)} · ${weekday}`;
  }, [now]);

  const dueThisWeekCount = Number(kpis.find((k) => k.key === 'deadlines')?.v ?? '0');

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
          Bonjour {identity.displayName}.
        </h1>
        <p
          className="mt-1.5 text-[var(--fg-secondary)]"
          style={{ fontSize: 14, lineHeight: 1.5 }}
        >
          Vous avez{' '}
          <strong className="font-semibold text-[var(--fg-primary)]">
            {dueThisWeekCount} échéance{dueThisWeekCount > 1 ? 's' : ''}
          </strong>{' '}
          cette semaine.
        </p>
      </header>

      {/* KPI row */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {kpis.map((kpi) => {
          const Tag = kpi.onClick ? 'button' : 'div';
          return (
            <Tag
              key={kpi.key}
              onClick={kpi.onClick}
              className={
                kpi.onClick
                  ? 'text-left transition-colors hover:bg-[var(--bg-surface-alt)]'
                  : ''
              }
              style={{ display: 'block', width: '100%' }}
            >
              <Card flat padding={18}>
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
            </Tag>
          );
        })}
      </section>

      {/* Grille principale (2 colonnes sur desktop) :
       *   ┌─────────────────────┬─────────────────────┐
       *   │ Échéances à venir   │ Jot / Notes rapides │
       *   ├─────────────────────┼─────────────────────┤
       *   │ Dossiers en attente │ Dossiers récents    │
       *   └─────────────────────┴─────────────────────┘
       *   Boîte Outlook (toute la largeur)
       */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Card
            title="Échéances à venir"
            padding={0}
            actions={
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setDeadlinesFullscreen(true)}
                  title="Voir toutes les échéances en plein écran"
                  aria-label="Plein écran"
                  className="rounded-sm p-1.5 text-[var(--fg-secondary)] hover:bg-[var(--bg-surface-alt)] hover:text-[var(--fg-primary)] transition-colors"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push('/tools/deadline-tracker')}
                >
                  Voir tout
                </Button>
              </div>
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
        </div>

        <div className="flex flex-col gap-4">
          <JotCard />
          <RecentDossiersCard />
        </div>
      </section>

      {/* Outlook sur toute la largeur */}
      <section>
        <OutlookCard />
      </section>

      {/* Plein écran des échéances — overlay rendu au-dessus du dashboard. */}
      <DeadlinesFullscreen
        open={deadlinesFullscreen}
        onClose={() => setDeadlinesFullscreen(false)}
      />
    </div>
  );
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Honoraires du mois.
 *
 * 🔌 Point d'ancrage API future : ce calcul doit additionner les factures
 * (`db.invoices`) émises ou payées dans le mois en cours, ventilées par
 * dossier. Les helpers existants `computeDossierFinanceTotals(dossierId)`
 * dans `lib/db.ts` exposent déjà :
 *   - billableAmount / billedAmount par dossier,
 *   - expenseTotal / feeTotal,
 *   - billableMinutes / billedMinutes.
 *
 * Implémentation cible :
 *   const start = startOfMonth(now);
 *   const invoices = await db.invoices
 *     .where('date').between(start, now).toArray();
 *   return invoices
 *     .filter((i) => i.status === 'issued' || i.status === 'paid')
 *     .reduce((sum, i) => sum + (i.amount ?? 0), 0);
 *
 * Tant que la connexion factures ↔ dashboard n'est pas câblée côté UI,
 * la fonction renvoie 0 pour ne pas afficher de chiffre fictif.
 */
function computeMonthlyFees(_dossierId?: number): number {
  // TODO: brancher sur db.invoices + computeDossierFinanceTotals().
  return 0;
}

// ─── Palette des tonalités ────────────────────────────────────────────
// Chaque niveau d'urgence pilote simultanément :
//   - la bande verticale de gauche (4 px, très visible)
//   - le fond de la ligne (légère teinte colorée)
//   - la couleur du numéro du jour
//   - le badge J-N avec son icône
// On accentue franchement le rouge pour attirer l'œil sur les échéances
// dépassées ou imminentes.
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
  const s = TONE_STYLE[tone];
  const isUrgent = tone === 'overdue' || tone === 'danger';
  const Icon = s.icon;

  return (
    <div
      className={
        'relative flex w-full items-center gap-4 pl-4 pr-5 py-3.5 transition-colors ' +
        s.bg + ' ' + s.hover + ' ' +
        (isFirst ? '' : 'border-t border-[var(--border-subtle)]')
      }
    >
      {/* Bande verticale de gauche (stripe) */}
      <span
        aria-hidden
        className={'pointer-events-none absolute left-0 top-0 bottom-0 w-1 ' + s.stripe}
      />

      <button
        onClick={(e) => {
          e.stopPropagation();
          onDone();
        }}
        aria-label="Marquer l'échéance comme terminée"
        title="Marquer comme terminé"
        className={
          'group flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border ' +
          (isUrgent
            ? 'border-red-400 bg-white hover:border-emerald-500 hover:bg-emerald-50'
            : 'border-[var(--border-default)] hover:border-emerald-500 hover:bg-emerald-50') +
          ' transition-colors'
        }
      >
        <Check className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 text-emerald-600" />
      </button>

      <button onClick={onOpen} className="flex flex-1 items-center gap-4 text-left">
        <div className="w-14 shrink-0 text-center">
          <div
            className={'font-bold tabular-nums ' + s.dayText}
            style={{ fontSize: 26, lineHeight: 1 }}
          >
            {day}
          </div>
          <div
            className={
              'mt-1 uppercase ' +
              (isUrgent ? 'text-red-600 font-semibold' : 'text-[var(--fg-tertiary)] font-medium')
            }
            style={{ fontSize: 11, letterSpacing: '0.04em' }}
          >
            {monthLabel}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {Icon && (
              <Icon
                className={
                  'h-4 w-4 flex-shrink-0 ' +
                  (tone === 'overdue' ? 'text-red-600 animate-pulse' : 'text-red-500')
                }
              />
            )}
            <div
              className={
                'truncate font-semibold ' +
                (isUrgent ? 'text-[var(--fg-primary)]' : 'text-[var(--fg-primary)]')
              }
              style={{ fontSize: 14 }}
            >
              {title}
            </div>
          </div>
          <div
            className={
              'mt-0.5 truncate ' +
              (isUrgent ? 'text-red-700/80' : 'text-[var(--fg-secondary)]')
            }
            style={{ fontSize: 12, lineHeight: 1.4 }}
          >
            {subtitle}
          </div>
        </div>

        {/* Badge relatif — plus grand et plus contrasté */}
        <span
          className={
            'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 ' +
            'text-[11px] font-bold uppercase tracking-wide whitespace-nowrap ' +
            s.badgeBg + ' ' + s.badgeText
          }
        >
          {rel}
        </span>
      </button>
    </div>
  );
}
