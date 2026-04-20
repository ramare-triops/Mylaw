'use client';

import { Euro, Clock, Wallet, Sparkles } from 'lucide-react';
import type { Dossier } from '@/types';

interface Props {
  dossier: Dossier;
}

export function DossierFinanceTab({ dossier: _dossier }: Props) {
  return (
    <div className="p-6">
      <div className="max-w-2xl mx-auto mt-8 border border-dashed border-[var(--color-border)] rounded-lg p-8 text-center bg-[var(--color-surface-raised)]/40">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[var(--color-primary-light)] mb-4">
          <Euro className="w-6 h-6 text-[var(--color-primary)]" />
        </div>
        <h2 className="text-base font-semibold text-[var(--color-text)]">
          Finances du dossier
        </h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-2 max-w-md mx-auto">
          Saisie des temps passés, débours, honoraires forfaitaires et
          pré-facturation. Module en cours de préparation.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 text-left">
          <FeatureCard
            icon={Clock}
            title="Temps passés"
            description="Saisie par document, par avocat et par activité (rédaction, audience, recherche…)"
          />
          <FeatureCard
            icon={Wallet}
            title="Débours"
            description="Huissier, greffe, traduction, copies, déplacements — refacturables ou non"
          />
          <FeatureCard
            icon={Sparkles}
            title="Pré-facturation"
            description="Agrégation des lignes non facturées, création de pro-forma, export Excel"
          />
        </div>

        <p className="text-xs text-[var(--color-text-muted)] mt-6">
          Les entités sous-jacentes <code className="text-[var(--color-primary)]">timeEntries</code>,{' '}
          <code className="text-[var(--color-primary)]">expenses</code>,{' '}
          <code className="text-[var(--color-primary)]">fixedFees</code> et{' '}
          <code className="text-[var(--color-primary)]">invoices</code> sont déjà
          provisionnées dans la base de données.
        </p>
      </div>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-[var(--color-primary)]" />
        <span className="text-sm font-medium">{title}</span>
      </div>
      <p className="text-xs text-[var(--color-text-muted)] leading-snug">
        {description}
      </p>
    </div>
  );
}
