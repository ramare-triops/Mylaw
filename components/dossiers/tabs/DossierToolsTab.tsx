'use client';

import { useState } from 'react';
import {
  ArrowLeft,
  Calculator,
  FileStack,
  ChevronRight,
} from 'lucide-react';
import { LegalInterestCalculator } from '@/components/tools/LegalInterestCalculator';
import { PieceListTool } from '@/components/tools/PieceListTool';
import { cn } from '@/lib/utils';
import type { Dossier } from '@/types';

type DossierToolKey = 'piece-list' | 'legal-interest';

interface ToolDef {
  key: DossierToolKey;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Marquer un outil comme « à venir » → carte non cliquable. */
  comingSoon?: boolean;
}

const TOOLS: ToolDef[] = [
  {
    key: 'piece-list',
    title: 'Bordereau de pièces',
    description:
      'Importer des documents comme pièces, leur apposer un tampon virtuel (numéro et sceau du cabinet) et générer un bordereau de communication.',
    icon: FileStack,
  },
  {
    key: 'legal-interest',
    title: 'Calculateur d\'intérêts au taux légal',
    description:
      'Calcule automatiquement les intérêts d\'une ou plusieurs créances en appliquant les taux semestriels officiels. Export PDF / XLSX, sauvegarde dans le dossier.',
    icon: Calculator,
  },
];

export function DossierToolsTab({ dossier }: { dossier: Dossier }) {
  const [activeTool, setActiveTool] = useState<DossierToolKey | null>(null);

  // ── Vue outil actif ─────────────────────────────────────────────────
  if (activeTool) {
    const tool = TOOLS.find((t) => t.key === activeTool);
    return (
      <div>
        <div
          className="px-6 pt-4 pb-2 flex items-center gap-3 border-b"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <button
            onClick={() => setActiveTool(null)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md',
              'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
              'hover:bg-[var(--color-surface-raised)]',
            )}
          >
            <ArrowLeft size={12} /> Outils
          </button>
          {tool && (
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              <ChevronRight size={11} className="inline -mt-0.5 mr-1 opacity-50" />
              {tool.title}
            </span>
          )}
        </div>
        {activeTool === 'piece-list' && (
          <PieceListTool dossier={dossier} />
        )}
        {activeTool === 'legal-interest' && (
          <LegalInterestCalculator dossier={dossier} />
        )}
      </div>
    );
  }

  // ── Galerie d'outils ─────────────────────────────────────────────────
  return (
    <div className="px-6 py-6">
      <div className="mb-4">
        <h2
          className="text-base font-semibold"
          style={{ color: 'var(--color-text)' }}
        >
          Outils du dossier
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
          Outils disponibles pour ce dossier. D'autres seront ajoutés au fil
          du temps.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {TOOLS.map((t) => {
          const Icon = t.icon;
          const disabled = !!t.comingSoon;
          return (
            <button
              key={t.key}
              onClick={() => !disabled && setActiveTool(t.key)}
              disabled={disabled}
              className={cn(
                'text-left rounded-md border p-4 transition-all',
                'flex flex-col gap-2',
                disabled
                  ? 'opacity-60 cursor-not-allowed'
                  : 'hover:border-[var(--color-primary)] hover:shadow-sm cursor-pointer',
              )}
              style={{
                borderColor: 'var(--color-border)',
                background: 'var(--color-surface)',
              }}
            >
              <div className="flex items-center justify-between">
                <div
                  className="flex items-center justify-center w-9 h-9 rounded-md"
                  style={{
                    background: 'oklch(from var(--color-primary) l c h / 0.1)',
                    color: 'var(--color-primary)',
                  }}
                >
                  <Icon className="w-4 h-4" />
                </div>
                {disabled && (
                  <span
                    className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                    style={{
                      background: 'var(--color-surface-raised)',
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    À venir
                  </span>
                )}
              </div>
              <div
                className="text-sm font-semibold"
                style={{ color: 'var(--color-text)' }}
              >
                {t.title}
              </div>
              <div
                className="text-xs leading-relaxed"
                style={{ color: 'var(--color-text-muted)' }}
              >
                {t.description}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
