/**
 * Filtre de validité d'un Dossier — partagé entre la liste Dossiers et
 * le tableau de bord pour garantir que les deux affichent le même
 * compteur. Un dossier est considéré valide s'il porte les champs
 * structurels minimums (référence, nom, type connu, statut connu, tags
 * en tableau). Cela protège contre une table `dossiers` qui aurait été
 * polluée par d'autres entités lors d'un ancien bug de sync.
 */

import type { Dossier } from '@/types';
import {
  DOSSIER_TYPE_LABELS,
  DOSSIER_STATUS_LABELS,
} from '@/components/dossiers/labels';

export function isValidDossier(d: unknown): d is Dossier {
  if (!d || typeof d !== 'object') return false;
  const r = d as Partial<Dossier>;
  return (
    typeof r.reference === 'string' &&
    r.reference.length > 0 &&
    typeof r.name === 'string' &&
    typeof r.type === 'string' &&
    r.type in DOSSIER_TYPE_LABELS &&
    typeof r.status === 'string' &&
    r.status in DOSSIER_STATUS_LABELS &&
    Array.isArray(r.tags)
  );
}
