'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRouter } from 'next/navigation';
import { FolderKanban } from 'lucide-react';
import { db, getDossierLastOpenedMap, type DossierLastOpenedMap } from '@/lib/db';
import { Avatar, Card } from '@/components/ui';
import { DOSSIER_STATUS_LABELS } from '@/components/dossiers/labels';
import { usePrivacy } from '@/components/providers/PrivacyProvider';
import { maskDossierName, maskClientName } from '@/lib/privacy';

/**
 * Carte « Dossiers récents » : affiche les dossiers dans lesquels l'utilisateur
 * a travaillé récemment, triés par dernière ouverture (horodatage local
 * enregistré par `markDossierOpened`). Remplace l'ancienne carte « Activité
 * récente » qui listait toute modification documentaire.
 */
export function RecentDossiersCard() {
  const router = useRouter();
  const { privacyMode } = usePrivacy();
  const dossiers = useLiveQuery(() => db.dossiers.toArray(), []);
  const [openedMap, setOpenedMap] = useState<DossierLastOpenedMap>({});

  // Rafraîchit la map à chaque update des dossiers + au montage.
  useEffect(() => {
    let mounted = true;
    void getDossierLastOpenedMap().then((m) => {
      if (mounted) setOpenedMap(m);
    });
    return () => {
      mounted = false;
    };
  }, [dossiers]);

  const now = useMemo(() => new Date(), []);

  const items = useMemo(() => {
    const list = (dossiers ?? []).slice();
    // Fallback : si aucun horodatage d'ouverture, on utilise `updatedAt`.
    list.sort((a, b) => {
      const la = a.id != null && openedMap[a.id]
        ? new Date(openedMap[a.id]).getTime()
        : new Date(a.updatedAt).getTime();
      const lb = b.id != null && openedMap[b.id]
        ? new Date(openedMap[b.id]).getTime()
        : new Date(b.updatedAt).getTime();
      return lb - la;
    });
    return list.slice(0, 5);
  }, [dossiers, openedMap]);

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <FolderKanban className="w-4 h-4 text-[var(--color-primary)]" />
          Dossiers récents
        </span>
      }
      padding={0}
    >
      {items.length === 0 ? (
        <div
          className="px-5 py-8 text-center text-[var(--fg-secondary)]"
          style={{ fontFamily: 'var(--font-serif)', fontSize: 15 }}
        >
          Aucun dossier récent.
        </div>
      ) : (
        items.map((d, i) => {
          const lastOpened =
            d.id != null && openedMap[d.id]
              ? new Date(openedMap[d.id])
              : new Date(d.updatedAt);
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
              <Avatar
                initials={
                  privacyMode
                    ? initialsFrom(maskDossierName(d.name))
                    : initialsFrom(d.name)
                }
                size={28}
                variant={i % 2 === 0 ? 'brand' : 'steel'}
              />
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
                  {d.clientName
                    ? privacyMode
                      ? maskClientName(d.clientName)
                      : d.clientName
                    : DOSSIER_STATUS_LABELS[d.status]}
                </div>
              </div>
              <span className="flex-shrink-0 text-[11px] text-[var(--fg-tertiary)]">
                {relativeUpdate(lastOpened, now)}
              </span>
            </button>
          );
        })
      )}
    </Card>
  );
}

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '··';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function relativeUpdate(date: Date, now: Date): string {
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
