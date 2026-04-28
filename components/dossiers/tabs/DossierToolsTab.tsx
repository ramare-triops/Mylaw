'use client';

import { Wrench } from 'lucide-react';
import type { Dossier } from '@/types';

/**
 * Onglet « Outils » d'un dossier ouvert. Placeholder en attente du
 * contenu réel — l'utilisateur indiquera quels outils brancher ici.
 */
export function DossierToolsTab({ dossier: _dossier }: { dossier: Dossier }) {
  return (
    <div className="px-6 py-10">
      <div
        className="flex flex-col items-center justify-center text-center py-16 rounded-md border border-dashed"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
      >
        <Wrench className="w-8 h-8 mb-3 opacity-30" />
        <p className="text-sm">Outils dédiés au dossier — à venir.</p>
      </div>
    </div>
  );
}
