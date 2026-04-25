'use client';

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRouter } from 'next/navigation';
import { PauseCircle, Clock } from 'lucide-react';
import { db } from '@/lib/db';
import { Button, Card } from '@/components/ui';
import { usePrivacy } from '@/components/providers/PrivacyProvider';
import { maskDossierName } from '@/lib/privacy';

function relativeDuration(from: Date, to: Date): string {
  const ms = Math.max(0, to.getTime() - from.getTime());
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) return "aujourd'hui";
  if (days === 1) return 'depuis hier';
  if (days < 7) return `depuis ${days} j`;
  if (days < 30) return `depuis ${Math.floor(days / 7)} sem.`;
  if (days < 365) return `depuis ${Math.floor(days / 30)} mois`;
  return `depuis ${Math.floor(days / 365)} an${days >= 730 ? 's' : ''}`;
}

export function PendingDossiersCard() {
  const router = useRouter();
  const { privacyMode } = usePrivacy();
  const now = useMemo(() => new Date(), []);
  const pending = useLiveQuery(
    () => db.dossiers.where('status').equals('pending').toArray(),
    [],
  );

  const items = useMemo(
    () =>
      (pending ?? [])
        .slice()
        .sort((a, b) => {
          const ta = a.pendingSince ? new Date(a.pendingSince).getTime() : new Date(a.updatedAt).getTime();
          const tb = b.pendingSince ? new Date(b.pendingSince).getTime() : new Date(b.updatedAt).getTime();
          return tb - ta;
        })
        .slice(0, 5),
    [pending],
  );

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <PauseCircle className="w-4 h-4 text-amber-600" />
          Dossiers en attente
          {(pending?.length ?? 0) > 0 && (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
              {pending!.length}
            </span>
          )}
        </span>
      }
      padding={0}
      actions={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/dossiers')}
        >
          Voir tout
        </Button>
      }
    >
      {items.length === 0 ? (
        <div
          className="px-5 py-8 text-center text-[var(--fg-secondary)]"
          style={{ fontFamily: 'var(--font-serif)', fontSize: 15 }}
        >
          Aucun dossier en attente.
        </div>
      ) : (
        items.map((d, i) => {
          const since = d.pendingSince ? new Date(d.pendingSince) : new Date(d.updatedAt);
          return (
            <button
              key={d.id}
              onClick={() => d.id && router.push(`/dossiers/${d.id}`)}
              className={
                'flex w-full items-start gap-3 px-5 py-3 text-left transition-colors ' +
                'hover:bg-[var(--bg-surface-alt)] ' +
                (i === 0 ? '' : 'border-t border-[var(--border-subtle)]')
              }
            >
              <PauseCircle className="mt-0.5 w-4 h-4 flex-shrink-0 text-amber-600" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className="truncate font-semibold text-[var(--fg-primary)]"
                    style={{ fontSize: 13 }}
                  >
                    {privacyMode ? maskDossierName(d.name) : d.name}
                  </span>
                  <span className="font-mono text-[11px] text-[var(--fg-tertiary)]">
                    {d.reference}
                  </span>
                </div>
                <div
                  className="mt-0.5 truncate text-[var(--fg-secondary)]"
                  style={{ fontSize: 12, lineHeight: 1.4 }}
                >
                  {d.pendingNote?.trim() || 'Aucune note — cliquer pour compléter.'}
                </div>
                <div className="mt-1 flex items-center gap-1 text-[11px] text-[var(--fg-tertiary)]">
                  <Clock className="h-3 w-3" />
                  {relativeDuration(since, now)}
                </div>
              </div>
            </button>
          );
        })
      )}
    </Card>
  );
}
