'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, setSetting, getSetting } from '@/lib/db';
import { CABINET_IDENTITY_KEY, type CabinetIdentity } from '@/lib/cabinet-identity';

/**
 * Identité affichée par le Sidebar et l'en-tête du Tableau de bord.
 *
 * S'appuie sur la clé `cabinet_identity_v1` de `db.settings` (déjà
 * synchronisée par Drive — la clé n'est pas dans INTERNAL_SETTING_KEYS,
 * donc tout `setSetting` déclenche un push automatique). Toute édition
 * via la page Paramètres se propage en temps réel à tous les appareils
 * connectés au même Drive.
 *
 * Au tout premier lancement (settings vides), on initialise une fois
 * pour toutes l'identité avec « Quatreguer Galan » afin que le Sidebar
 * et le Dashboard ne tombent pas sur un libellé vide.
 */
export const DEFAULT_DISPLAY_IDENTITY = {
  civility: 'Maître',
  firstName: 'Quatreguer',
  lastName: 'Galan',
  cabinet: '',
} as const;

const SEED_KEY = 'cabinet_identity_seeded_v1';

export interface DisplayIdentity {
  civility: string;
  firstName: string;
  lastName: string;
  cabinet: string;
  /** Format pré-calculé : "Maître Quatreguer Galan" */
  displayName: string;
  /** Format court pour l'avatar : "QG" */
  initials: string;
  /** Pour les phrases de salutation : "Maître Galan" si nom dispo, sinon displayName. */
  salutation: string;
}

function buildDisplay(c: Partial<CabinetIdentity> | null | undefined): DisplayIdentity {
  const civility = (c?.civility || '').trim() || 'Maître';
  const firstName = (c?.firstName || '').trim();
  const lastName = (c?.lastName || '').trim();
  const cabinet = (c?.cabinet || '').trim();

  const hasName = firstName || lastName;
  const fallback = !hasName;
  const f = fallback ? DEFAULT_DISPLAY_IDENTITY.firstName : firstName;
  const l = fallback ? DEFAULT_DISPLAY_IDENTITY.lastName : lastName;
  const civ = fallback ? DEFAULT_DISPLAY_IDENTITY.civility : civility;

  const fullName = `${f} ${l}`.trim();
  const displayName = `${civ} ${fullName}`.trim();
  const salutation = `${civ} ${l || f}`.trim();
  const initials =
    ((f[0] ?? '') + (l[0] ?? '')).toUpperCase() || (fullName.slice(0, 2).toUpperCase() || '··');

  return {
    civility: civ,
    firstName: f,
    lastName: l,
    cabinet,
    displayName,
    initials,
    salutation,
  };
}

export function useCabinetIdentity(): DisplayIdentity {
  const row = useLiveQuery(() => db.settings.get(CABINET_IDENTITY_KEY), []);
  const [seeded, setSeeded] = useState(false);

  // Au premier lancement (aucune identité enregistrée), on persiste la
  // valeur par défaut une seule fois dans Dexie ; le middleware Drive
  // s'occupe de la propager aux autres appareils.
  useEffect(() => {
    if (seeded) return;
    let cancelled = false;
    void (async () => {
      const already = await getSetting<boolean>(SEED_KEY, false);
      if (already) {
        if (!cancelled) setSeeded(true);
        return;
      }
      const existing = await db.settings.get(CABINET_IDENTITY_KEY);
      const isEmpty =
        !existing ||
        !existing.value ||
        (typeof existing.value === 'object' &&
          !((existing.value as any).firstName || '').trim() &&
          !((existing.value as any).lastName || '').trim());
      if (isEmpty) {
        await setSetting(CABINET_IDENTITY_KEY, {
          civility: DEFAULT_DISPLAY_IDENTITY.civility,
          firstName: DEFAULT_DISPLAY_IDENTITY.firstName,
          lastName: DEFAULT_DISPLAY_IDENTITY.lastName,
          birthDate: '', birthPlace: '', nationality: '',
          profession: 'Avocat', barreau: '', cabinet: '',
          structureType: '', capital: '', siret: '', rcs: '',
          rcsCity: '', vatNumber: '', toque: '',
          email: '', phone: '', fax: '', website: '',
          addressStreet: '', addressComplement: '',
          addressPostalCode: '', addressCity: '',
          addressCountry: 'France',
        });
      }
      await setSetting(SEED_KEY, true);
      if (!cancelled) setSeeded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [seeded]);

  return buildDisplay((row?.value as CabinetIdentity) ?? null);
}
