/**
 * Résolution contact → valeur de variable.
 *
 * Permet de remplir automatiquement les variables `[Nom]`, `[Prénom]`, etc.
 * d'un document (brique ou modèle) à partir d'un Contact sélectionné.
 *
 * La correspondance est faite par normalisation du nom de variable
 * (minuscules, sans diacritiques, mots-clés simples) puis lookup dans une
 * table de règles. L'ordre d'évaluation préfère les libellés les plus
 * spécifiques ("Nom du client" avant "Nom").
 */

import type { Contact, Civility } from '@/types';
import { composeAddress } from '@/components/dossiers/StructuredAddressFields';

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/['’`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatDateFR(d: Date | string | undefined): string {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function conditional(varName: string, civility?: Civility): string | undefined {
  // Variables "M/Mme" etc. : trouve la variante correspondant à la civilité.
  const trimmed = varName.trim();
  if (!trimmed.includes('/')) return undefined;
  const options = trimmed.split('/').map((s) => s.trim()).filter(Boolean);
  if (options.length < 2) return undefined;
  const pick = (matcher: (opt: string) => boolean) =>
    options.find(matcher);

  if (civility === 'Mme' || civility === 'Mlle') {
    // On privilégie la 2e variante (féminin) par convention.
    const fem = pick((o) => /mme|madame|née|la|de la|inscrite/i.test(o));
    if (fem) return fem;
    return options[1] ?? options[0];
  }
  if (civility === 'M.') {
    const masc = pick((o) => /^m\.?$|monsieur|^né$|^le$|^du$|^inscrit$/i.test(o));
    if (masc) return masc;
    return options[0];
  }
  return undefined;
}

/** Résout une variable depuis un contact. Retourne undefined si aucune correspondance. */
export function contactVariableValue(
  contact: Contact,
  varName: string
): string | undefined {
  const v = norm(varName);

  // ── Variables conditionnelles (M/Mme, né/née, etc.) ──────────────────
  const cond = conditional(varName, contact.civility);
  if (cond !== undefined) return cond;

  // ── Personne physique ─────────────────────────────────────────────────
  if (v.includes('civilite') || v === 'm' || v === 'mme' || v === 'm mme')
    return contact.civility ?? '';

  if (
    v === 'nom' ||
    v === 'nom de famille' ||
    v.includes('nom du client') ||
    v.includes('nom de l adversaire') ||
    v.includes('nom du defendeur') ||
    v.includes('nom du demandeur') ||
    v === 'nom complet' // surface uppercased
  ) {
    if (v === 'nom complet') {
      const parts = [contact.firstName, (contact.lastName ?? '').toUpperCase()]
        .filter(Boolean)
        .join(' ');
      return parts || contact.companyName || '';
    }
    return (contact.lastName ?? '').toUpperCase();
  }

  if (v === 'prenom' || v.includes('prenom du client') || v.includes('prenom')) {
    return contact.firstName ?? '';
  }

  if (v.includes('naissance')) {
    if (v.includes('lieu')) return contact.birthPlace ?? '';
    if (v.includes('date')) return formatDateFR(contact.birthDate);
  }

  if (v.includes('nationalite')) return contact.nationality ?? '';
  if (v.includes('profession') || v === 'metier')
    return contact.profession ?? '';

  // ── Personne morale ──────────────────────────────────────────────────
  if (
    v.includes('raison sociale') ||
    v.includes('nom de la societe') ||
    v === 'societe'
  )
    return contact.companyName ?? '';

  if (v.includes('forme juridique')) return contact.legalForm ?? '';

  if (v.includes('capital social') || v === 'capital') {
    if (contact.capital == null) return '';
    return contact.capital.toLocaleString('fr-FR');
  }

  if (v === 'siret' || v.includes('numero siret')) return contact.siret ?? '';

  if (v === 'rcs' || v.includes('numero rcs')) return contact.rcs ?? '';
  if (v.includes('ville rcs')) return contact.rcsCity ?? '';

  if (v.includes('representant legal') || v === 'representant')
    return contact.representative ?? '';
  if (v.includes('qualite du representant') || v === 'qualite')
    return contact.representativeRole ?? '';

  // ── Coordonnées ──────────────────────────────────────────────────────
  if (v === 'email' || v === 'mail' || v === 'courriel')
    return contact.email ?? '';
  if (
    v === 'telephone' ||
    v === 'tel' ||
    v === 'portable' ||
    v === 'mobile'
  )
    return contact.phone ?? '';

  // ── Adresse ──────────────────────────────────────────────────────────
  if (v.includes('code postal')) return contact.addressPostalCode ?? '';
  if (v === 'ville' || v === 'commune')
    return (contact.addressCity ?? '').toUpperCase();
  if (v === 'rue' || v === 'voie') return contact.addressStreet ?? '';
  if (v.includes('numero de voie') || v === 'numero')
    return contact.addressNumber ?? '';
  if (v.includes('complement')) return contact.addressComplement ?? '';
  if (v.includes('pays')) return contact.addressCountry ?? '';

  if (
    v === 'adresse' ||
    v.includes('domicile') ||
    v.includes('adresse du siege') ||
    v.includes('adresse postale') ||
    v.includes('adresse du cabinet')
  ) {
    const composed = composeAddress({
      addressNumber: contact.addressNumber,
      addressStreet: contact.addressStreet,
      addressComplement: contact.addressComplement,
      addressPostalCode: contact.addressPostalCode,
      addressCity: contact.addressCity,
    });
    return composed || contact.address || '';
  }

  // ── Référence interne ────────────────────────────────────────────────
  if (v.includes('reference') && v.includes('dossier'))
    return contact.fileRef ?? '';

  // ── Sans correspondance
  return undefined;
}

/**
 * Retourne la liste des variables présentes dans un contenu TipTap/markdown
 * avec syntax `[Variable]`, dé-dupliquée.
 */
export function extractBrickVariables(content: string): string[] {
  const re = /\[([^\]]+)\]/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

/**
 * Applique un contact à un contenu de brique : remplace chaque [Variable]
 * connue par la valeur correspondante, laisse les inconnues intactes.
 * Retourne le contenu modifié + la liste des variables remplies / non remplies.
 */
export function applyContactToBrickContent(
  contact: Contact,
  content: string
): { content: string; filled: string[]; unfilled: string[] } {
  const filled: string[] = [];
  const unfilled: string[] = [];
  const out = content.replace(/\[([^\]]+)\]/g, (match, varName: string) => {
    const val = contactVariableValue(contact, varName);
    if (val != null && val !== '') {
      filled.push(varName);
      return val;
    }
    unfilled.push(varName);
    return match;
  });
  return { content: out, filled, unfilled };
}
