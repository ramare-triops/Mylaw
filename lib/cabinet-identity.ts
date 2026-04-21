/**
 * Identité du cabinet — fiche d'intervenant virtuel pour l'avocat qui
 * utilise Mylaw.
 *
 * Utilisée par le résolveur de blocs d'identification
 * (cf. `lib/identification-blocks.ts`) comme fallback du rôle
 * `ownCounsel` : si un modèle réclame l'identification de l'avocat du
 * cabinet et qu'aucun `DossierContact` ne porte ce rôle, on bascule
 * sur ces informations configurées une fois pour toutes dans les
 * paramètres (onglet « Cabinet »).
 *
 * Le type vit ici pour éviter toute dépendance circulaire entre
 * `lib/...` et `components/settings/...`, et pour que d'autres modules
 * (les futurs export/backup, le picker d'intervenant…) puissent
 * l'importer sans tirer toute la page Settings.
 */

import type { Contact } from '@/types';

export const CABINET_IDENTITY_KEY = 'cabinet_identity_v1';

export interface CabinetIdentity {
  // Personne physique — l'avocat
  civility:      string;
  firstName:     string;
  lastName:      string;
  birthDate:     string;
  birthPlace:    string;
  nationality:   string;
  profession:    string;
  // Structure d'exercice
  barreau:       string;
  cabinet:       string;
  structureType: string;
  capital:       string;
  siret:         string;
  rcs:           string;
  rcsCity:       string;
  vatNumber:     string;
  toque:         string;
  // Coordonnées
  email:         string;
  phone:         string;
  fax:           string;
  website:       string;
  // Adresse postale
  addressStreet:     string;
  addressComplement: string;
  addressPostalCode: string;
  addressCity:       string;
  addressCountry:    string;
}

/**
 * Projette une `CabinetIdentity` sur la forme `Contact` pour pouvoir
 * nourrir le résolveur de blocs d'identification avec les mêmes fonctions
 * que pour un vrai contact du dossier. Le contact produit est de type
 * `physical` (l'avocat est une personne physique) avec la structure
 * d'exercice exposée via les champs `companyName`, `legalForm`, `capital`,
 * `siret`, `rcs`, `rcsCity`.
 *
 * Renvoie `null` quand la fiche cabinet est vide (ni nom, ni cabinet) —
 * on évite ainsi de produire un bloc d'identification famélique pour
 * un utilisateur qui n'a pas encore renseigné ses paramètres.
 */
export function cabinetIdentityToContact(
  c: CabinetIdentity | null | undefined
): Contact | null {
  if (!c) return null;
  const hasSubstantialData = Boolean(
    (c.firstName || '').trim() ||
    (c.lastName  || '').trim() ||
    (c.cabinet   || '').trim()
  );
  if (!hasSubstantialData) return null;

  const now = new Date();
  // Civility typing is loose here — `Contact.civility` est un union typé
  // (`'M.' | 'Mme' | 'Mlle'`) mais la saisie libre en settings peut
  // contenir autre chose. On cast explicitement et on laisse Dexie
  // tolérer — ces données ne sont jamais persistées en Contact réel.
  const civility = (c.civility && c.civility.trim()) || undefined;

  return {
    type: 'physical',
    civility: civility as Contact['civility'],
    firstName: c.firstName || undefined,
    lastName:  c.lastName  || undefined,
    birthDate: c.birthDate ? new Date(c.birthDate) : undefined,
    birthPlace: c.birthPlace || undefined,
    nationality: c.nationality || undefined,
    profession: c.profession || undefined,

    companyName: c.cabinet       || undefined,
    legalForm:   c.structureType || undefined,
    capital:     c.capital ? parseFrenchCapital(c.capital) : undefined,
    siret:       c.siret   || undefined,
    rcs:         c.rcs     || undefined,
    rcsCity:     c.rcsCity || undefined,
    representative:     c.cabinet ? `${(c.civility ?? '').trim()} ${c.firstName ?? ''} ${c.lastName ?? ''}`.replace(/\s+/g, ' ').trim() : undefined,
    representativeRole: c.cabinet ? 'Avocat' : undefined,

    email: c.email || undefined,
    phone: c.phone || undefined,

    addressStreet:     c.addressStreet     || undefined,
    addressComplement: c.addressComplement || undefined,
    addressPostalCode: c.addressPostalCode || undefined,
    addressCity:       c.addressCity       || undefined,
    addressCountry:    c.addressCountry    || undefined,

    tags: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Parse « 10 000 » ou « 10000,50 » en nombre. Tolérant : renvoie
 * undefined si la chaîne n'est pas interprétable comme nombre.
 */
function parseFrenchCapital(raw: string): number | undefined {
  const cleaned = raw
    .replace(/[\s ]+/g, '')
    .replace(/[€]/g, '')
    .replace(/,/g, '.')
    .trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}
