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
import type { ContactFieldPath, FieldDef } from '@/types/field-def';
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

/**
 * Résout une variable depuis un contact via un `ContactFieldPath`
 * déterministe. Utilisé par les blocs d'identification quand un
 * `FieldDef.contactPath` est défini : on évite la correspondance floue et
 * on va droit à la propriété.
 *
 * Retourne `undefined` si la propriété est absente / vide.
 */
export function contactValueFromPath(
  contact: Contact,
  path: ContactFieldPath
): string | undefined {
  switch (path) {
    case 'civility':             return contact.civility ?? undefined;
    case 'firstName':            return contact.firstName ?? undefined;
    case 'lastName':             return (contact.lastName ?? '').toUpperCase() || undefined;
    case 'fullName': {
      const parts = [contact.firstName, (contact.lastName ?? '').toUpperCase()]
        .filter(Boolean)
        .join(' ');
      return parts || contact.companyName || undefined;
    }
    case 'birthDate':            return formatDateFR(contact.birthDate) || undefined;
    case 'birthPlace':           return contact.birthPlace ?? undefined;
    case 'nationality':          return contact.nationality ?? undefined;
    case 'profession':           return contact.profession ?? undefined;
    case 'companyName':          return contact.companyName ?? undefined;
    case 'legalForm':            return contact.legalForm ?? undefined;
    case 'capital':              return contact.capital != null ? contact.capital.toLocaleString('fr-FR') : undefined;
    case 'siret':                return contact.siret ?? undefined;
    case 'rcs':                  return contact.rcs ?? undefined;
    case 'rcsCity':              return contact.rcsCity ?? undefined;
    case 'representative':       return contact.representative ?? undefined;
    case 'representativeRole':   return contact.representativeRole ?? undefined;
    case 'email':                return contact.email ?? undefined;
    case 'phone':                return contact.phone ?? undefined;
    case 'address':              return contact.address ?? undefined;
    case 'addressComposed': {
      const composed = composeAddress({
        addressNumber: contact.addressNumber,
        addressStreet: contact.addressStreet,
        addressComplement: contact.addressComplement,
        addressPostalCode: contact.addressPostalCode,
        addressCity: contact.addressCity,
      });
      return composed || contact.address || undefined;
    }
    case 'addressNumber':        return contact.addressNumber ?? undefined;
    case 'addressStreet':        return contact.addressStreet ?? undefined;
    case 'addressComplement':    return contact.addressComplement ?? undefined;
    case 'addressPostalCode':    return contact.addressPostalCode ?? undefined;
    case 'addressCity':          return (contact.addressCity ?? '').toUpperCase() || undefined;
    case 'addressCountry':       return contact.addressCountry ?? undefined;
  }
  return undefined;
}

/** Résout une variable depuis un contact. Retourne undefined si aucune correspondance. */
export function contactVariableValue(
  contact: Contact,
  varName: string,
  fieldDefs?: FieldDef[]
): string | undefined {
  // ── 1. Correspondance déterministe via FieldDef.contactPath ─────────
  // Priorité au binding explicite : le plus robuste et surtout celui que
  // les blocs d'identification doivent utiliser. Match sur `name` (slug)
  // ou sur `label`, insensible à la casse / aux accents.
  if (fieldDefs && fieldDefs.length > 0) {
    const normalized = norm(varName);
    const def = fieldDefs.find(
      (f) => norm(f.name) === normalized || norm(f.label) === normalized
    );
    if (def?.contactPath) {
      const v = contactValueFromPath(contact, def.contactPath);
      if (v !== undefined && v !== '') return v;
      // Chemin déterministe mais valeur vide côté contact : on laisse la
      // suite tenter un dernier recours via la correspondance floue
      // héritée, au cas où le contact a rempli un champ synonyme.
    }
  }

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
 *
 * Quand `fieldDefs` est fourni, les bindings déterministes
 * (`FieldDef.contactPath`) sont utilisés en priorité avant la
 * correspondance floue.
 */
export function applyContactToBrickContent(
  contact: Contact,
  content: string,
  fieldDefs?: FieldDef[]
): { content: string; filled: string[]; unfilled: string[] } {
  const filled: string[] = [];
  const unfilled: string[] = [];
  const out = content.replace(/\[([^\]]+)\]/g, (match, varName: string) => {
    const val = contactVariableValue(contact, varName, fieldDefs);
    if (val != null && val !== '') {
      filled.push(varName);
      return val;
    }
    unfilled.push(varName);
    return match;
  });
  return { content: out, filled, unfilled };
}
