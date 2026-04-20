'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { db } from '@/lib/db';
import { DossierDetail } from '@/components/dossiers/DossierDetail';
import type { Dossier } from '@/types';

export default function DossierDetailPage() {
  const params = useParams();
  const dossierId = Number(params.id);

  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!dossierId || isNaN(dossierId)) {
      setError('Identifiant de dossier invalide.');
      setLoading(false);
      return;
    }
    db.dossiers
      .get(dossierId)
      .then((d) => {
        if (!d) setError('Dossier introuvable.');
        else setDossier(d);
      })
      .catch(() => setError('Impossible de charger le dossier.'))
      .finally(() => setLoading(false));
  }, [dossierId]);

  if (loading)
    return (
      <AppShell>
        <div className="flex items-center justify-center h-full gap-3 text-[var(--color-text-muted)]">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Chargement du dossier…</span>
        </div>
      </AppShell>
    );

  if (error || !dossier)
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center h-full gap-2">
          <p className="text-sm text-red-500">
            {error ?? 'Dossier introuvable.'}
          </p>
          <a
            href="/dossiers"
            className="text-sm text-[var(--color-primary)] hover:underline"
          >
            ← Retour aux dossiers
          </a>
        </div>
      </AppShell>
    );

  return (
    <AppShell>
      <DossierDetail dossierId={dossier.id!} />
    </AppShell>
  );
}
