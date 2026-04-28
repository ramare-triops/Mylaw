'use client';

import { LegalInterestCalculator } from '@/components/tools/LegalInterestCalculator';
import type { Dossier } from '@/types';

/**
 * Onglet « Outils » d'un dossier ouvert. Premier outil branché : le
 * calculateur d'intérêts au taux légal. D'autres outils viendront
 * s'ajouter ici au fil du temps.
 */
export function DossierToolsTab({ dossier }: { dossier: Dossier }) {
  return (
    <div className="py-2">
      <LegalInterestCalculator dossier={dossier} />
    </div>
  );
}
