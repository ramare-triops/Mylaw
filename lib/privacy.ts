/**
 * Mode confidentialité / secret professionnel.
 *
 * Lorsque l'avocat travaille en public, ce module masque les données
 * sensibles affichées à l'écran :
 *  - Noms de dossiers : remplacés par la civilité + initiale du nom
 *    de famille (ex. « Monsieur Dupont » → « Monsieur D. »).
 *  - Prénoms / noms : remplacés par leur initiale suivie d'une ellipse
 *    (ex. « Philippe » → « P… », « COUDERT » → « C… »).
 *  - Contenu des documents : les valeurs filles d'un FieldDef ou d'une
 *    brique sont restaurées en `[Label]`. Les noms / prénoms suivent
 *    le masquage par initiale.
 *
 * Le but est de pouvoir consulter et travailler sur un dossier en
 * audience ou dans les transports sans exposer l'identité du client.
 * Les chaînes ne sont jamais altérées en base : le masquage est
 * uniquement appliqué au moment du rendu.
 */

import type { Contact } from '@/types';
import type { FieldDef, ContactFieldPath } from '@/types/field-def';
import { contactValueFromPath } from './contact-variables';

/** Préfixes de civilité reconnus en tête de nom de dossier. */
const CIVILITY_PREFIXES = [
  'Monsieur',
  'Madame',
  'Mademoiselle',
  'Maître',
  'Maitre',
  'Mr',
  'Mme',
  'Mlle',
  'Me',
  'M.',
  'Pr.',
  'Dr.',
  'M',
];

/**
 * Préfixes additionnels (formes juridiques, libellés cabinet) pour
 * lesquels on conserve le premier mot et on masque le suivant. Permet
 * p. ex. à « SARL TechCorp » de devenir « SARL T. ».
 */
const EXTRA_PREFIXES = new Set([
  'sarl',
  'sas',
  'sasu',
  'sa',
  'sci',
  'eurl',
  'snc',
  'sel',
  'selarl',
  'selafa',
  'sci',
  'gie',
  'scop',
  'société',
  'societe',
  'cabinet',
  'affaire',
  'dossier',
  'succession',
]);

/** Marqueur d'ellipse pour les masques (« P… »). */
const ELLIPSIS = '…';

/**
 * Masque un nom de dossier en conservant la civilité et la première
 * lettre du nom de famille (point final).
 *
 * Exemples :
 *   « Monsieur Dupont »     → « Monsieur D. »
 *   « Madame Michèle »      → « Madame M. »
 *   « SARL TechCorp »       → « SARL T. »
 *   « Affaire Untel c/ X »  → « Affaire U. »
 *   « Dupont »              → « D. »
 */
export function maskDossierName(name: string | null | undefined): string {
  if (!name) return '';
  const trimmed = name.trim();
  if (!trimmed) return '';

  const tokens = trimmed.split(/\s+/);
  if (tokens.length === 0) return '';
  if (tokens.length === 1) {
    return firstLetterDot(tokens[0]);
  }

  const head = tokens[0];
  const headLower = head.toLowerCase();
  const isPrefix =
    CIVILITY_PREFIXES.some((p) => p.toLowerCase() === headLower) ||
    EXTRA_PREFIXES.has(headLower);

  if (isPrefix) {
    return `${head} ${firstLetterDot(tokens[1])}`;
  }

  // Pas de préfixe reconnu : on prend l'initiale du premier mot.
  return firstLetterDot(head);
}

/**
 * Renvoie la première lettre majuscule d'un mot suivie d'un point
 * (ex. « Dupont » → « D. »). Tient compte des accents en utilisant
 * le caractère natif (« Élise » → « É. »).
 */
function firstLetterDot(token: string): string {
  const letter = firstLetter(token);
  return letter ? `${letter}.` : '';
}

/**
 * Renvoie la première lettre d'un mot, en majuscule, sans diacritiques
 * supprimés (préserve « É », « Â »…). Filtre les caractères non
 * alphabétiques en tête (apostrophe, parenthèse, etc.).
 */
function firstLetter(token: string): string {
  if (!token) return '';
  for (const ch of token) {
    if (/[a-zA-ZÀ-ÖØ-öø-ÿ]/.test(ch)) return ch.toUpperCase();
  }
  return '';
}

/**
 * Masque un prénom en initiale + ellipse : « Philippe » → « P… ».
 * Utilisé dans le contenu des documents (briques d'identification)
 * où la spec demande de conserver l'initiale plutôt que le label
 * `[Prénom]`.
 */
export function maskFirstName(firstName: string | null | undefined): string {
  if (!firstName) return '';
  const letter = firstLetter(firstName);
  return letter ? `${letter}${ELLIPSIS}` : '';
}

/**
 * Masque un nom de famille : « COUDERT » → « C… ». Conserve la casse
 * d'origine de l'initiale (les noms en SHOUT case restent en majuscule).
 */
export function maskLastName(lastName: string | null | undefined): string {
  if (!lastName) return '';
  for (const ch of lastName) {
    if (/[a-zA-ZÀ-ÖØ-öø-ÿ]/.test(ch)) {
      return `${ch}${ELLIPSIS}`;
    }
  }
  return '';
}

/**
 * Masque un nom client / personnel libre (sans civilité). Si le nom
 * ressemble à un nom complet « Prénom NOM », on conserve l'ordre et on
 * masque chaque partie. Sinon on prend l'initiale du dernier mot.
 *
 * Exemples :
 *   « Jean Dupont »   → « J… D… »
 *   « Dupont »        → « D… »
 */
export function maskClientName(name: string | null | undefined): string {
  if (!name) return '';
  const trimmed = name.trim();
  if (!trimmed) return '';
  const tokens = trimmed.split(/\s+/);
  if (tokens.length === 1) {
    const l = firstLetter(tokens[0]);
    return l ? `${l}${ELLIPSIS}` : '';
  }
  return tokens
    .map((t) => {
      const l = firstLetter(t);
      return l ? `${l}${ELLIPSIS}` : '';
    })
    .filter(Boolean)
    .join(' ');
}

/**
 * Construit une table de remplacement (valeur → label) à appliquer au
 * contenu d'un document pour le masquage.
 *
 * Pour chaque contact du dossier, on parcourt les `FieldDef` qui
 * possèdent un `contactPath` et on associe la valeur résolue au label
 * du field. Les noms et prénoms reçoivent un traitement spécifique :
 * leur valeur n'est pas remplacée par leur label mais par leur
 * masquage (initiale + ellipse) afin que le document reste lisible.
 */
export interface MaskingEntry {
  /** Valeur à chercher dans le texte (telle qu'elle a été insérée). */
  value: string;
  /** Chaîne de remplacement (ex. « [Date de naissance] » ou « P… »). */
  replacement: string;
}

/**
 * Assemble les entrées de masquage pour un document attaché à un
 * dossier. L'ordre du tableau reflète la priorité de remplacement :
 * les chaînes les plus longues d'abord, pour éviter qu'une sous-chaîne
 * (ex. nom de ville) capture un superset (ex. adresse complète).
 */
export function buildMaskingEntries(
  contacts: Contact[],
  fieldDefs: FieldDef[],
): MaskingEntry[] {
  const entries: MaskingEntry[] = [];
  const seen = new Set<string>();

  // Chemins traités de façon spéciale (initiale + ellipse au lieu du label).
  const NAME_PATHS: ContactFieldPath[] = ['firstName', 'lastName', 'fullName'];

  for (const contact of contacts) {
    // 1. Bindings déterministes via FieldDef.contactPath.
    for (const def of fieldDefs) {
      if (!def.contactPath) continue;
      const value = contactValueFromPath(contact, def.contactPath);
      if (!value) continue;

      let replacement: string;
      if (def.contactPath === 'firstName') {
        replacement = maskFirstName(value);
      } else if (def.contactPath === 'lastName') {
        replacement = maskLastName(value);
      } else if (def.contactPath === 'fullName') {
        replacement = `${maskFirstName(contact.firstName)} ${maskLastName(contact.lastName)}`.trim();
      } else {
        replacement = `[${def.label}]`;
      }
      pushEntry(entries, seen, value, replacement);
    }

    // 2. Filet de sécurité : noms / prénoms et raison sociale du
    //    contact, même sans FieldDef explicite (cas brique seed
    //    d'identité où le label est codé en dur dans le contenu).
    if (contact.firstName) {
      pushEntry(entries, seen, contact.firstName, maskFirstName(contact.firstName));
    }
    if (contact.lastName) {
      const upper = contact.lastName.toUpperCase();
      pushEntry(entries, seen, upper, maskLastName(upper));
      pushEntry(entries, seen, contact.lastName, maskLastName(contact.lastName));
    }
    if (contact.companyName) {
      pushEntry(entries, seen, contact.companyName, `[${'Nom de la société'}]`);
    }

    // Évite l'oubli des paths de naissance / coordonnées même si le
    // FieldDef n'expose pas le contactPath dans la base courante.
    pushIfPresent(entries, seen, contact.birthPlace, '[Lieu de naissance]');
    pushIfPresent(entries, seen, contact.nationality, '[Nationalité]');
    pushIfPresent(entries, seen, contact.profession, '[Profession]');
    pushIfPresent(entries, seen, contact.email, '[Email]');
    pushIfPresent(entries, seen, contact.phone, '[Téléphone]');
    pushIfPresent(entries, seen, contact.address, '[Adresse]');
    pushIfPresent(entries, seen, contact.addressStreet, '[Rue]');
    pushIfPresent(entries, seen, contact.addressNumber, '[Numéro]');
    pushIfPresent(entries, seen, contact.addressComplement, "[Complément d'adresse]");
    pushIfPresent(entries, seen, contact.addressPostalCode, '[Code postal]');
    pushIfPresent(entries, seen, contact.addressCity, '[Ville]');
    pushIfPresent(
      entries,
      seen,
      contact.addressCity ? contact.addressCity.toUpperCase() : undefined,
      '[Ville]',
    );
    pushIfPresent(entries, seen, contact.addressCountry, '[Pays]');
    pushIfPresent(entries, seen, contact.legalForm, '[Forme juridique]');
    pushIfPresent(entries, seen, contact.siret, '[SIRET]');
    pushIfPresent(entries, seen, contact.rcs, '[RCS]');
    pushIfPresent(entries, seen, contact.rcsCity, '[Ville RCS]');
    pushIfPresent(entries, seen, contact.representative, '[Représentant légal]');
    pushIfPresent(entries, seen, contact.representativeRole, '[Qualité]');
    if (contact.capital != null) {
      pushIfPresent(
        entries,
        seen,
        contact.capital.toLocaleString('fr-FR'),
        '[Capital social]',
      );
    }
    if (contact.birthDate) {
      const formatted = formatDate(contact.birthDate);
      if (formatted) pushEntry(entries, seen, formatted, '[Date de naissance]');
    }
  }

  // Tri décroissant par longueur : on remplace d'abord les chaînes
  // les plus spécifiques. Évite p.ex. qu'« Paris » mange un fragment
  // d'adresse contenant aussi « Paris ».
  entries.sort((a, b) => b.value.length - a.value.length);
  return entries;
}

function pushEntry(
  entries: MaskingEntry[],
  seen: Set<string>,
  value: string,
  replacement: string,
): void {
  const v = value.trim();
  if (!v || v.length < 2) return;
  if (seen.has(v)) return;
  seen.add(v);
  entries.push({ value: v, replacement });
}

function pushIfPresent(
  entries: MaskingEntry[],
  seen: Set<string>,
  value: string | undefined | null,
  replacement: string,
): void {
  if (value && value.trim()) pushEntry(entries, seen, value, replacement);
}

function formatDate(d: Date | string | undefined): string {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Échappe une chaîne pour qu'elle puisse être utilisée comme littéral
 * dans une expression régulière.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Applique une liste d'entrées de masquage à un texte brut. Les
 * remplacements sont appliqués dans l'ordre du tableau (déjà trié par
 * longueur décroissante via `buildMaskingEntries`).
 *
 * Le matching est insensible à la casse et utilise des frontières de
 * mot quand la valeur commence et finit par un caractère de mot —
 * on évite ainsi de couper « Marseille » en cherchant « rs ».
 */
export function maskText(text: string, entries: MaskingEntry[]): string {
  if (!text || entries.length === 0) return text;
  let out = text;
  for (const { value, replacement } of entries) {
    if (!value) continue;
    const startsWord = /^\w/.test(value);
    const endsWord = /\w$/.test(value);
    const left = startsWord ? '\\b' : '';
    const right = endsWord ? '\\b' : '';
    const re = new RegExp(`${left}${escapeRegex(value)}${right}`, 'gi');
    out = out.replace(re, replacement);
  }
  return out;
}

/**
 * Applique le masquage à un contenu HTML. Walks la structure du DOM
 * et n'altère que les nœuds texte, en préservant balises / attributs.
 *
 * Si `DOMParser` n'est pas disponible (SSR), retourne le HTML brut
 * — le composant appelant est censé être rendu côté client (`'use
 * client'`).
 */
export function maskHtml(html: string, entries: MaskingEntry[]): string {
  if (!html || entries.length === 0) return html;
  if (typeof DOMParser === 'undefined') return html;

  const doc = new DOMParser().parseFromString(
    `<!doctype html><body>${html}</body>`,
    'text/html',
  );

  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const targets: Text[] = [];
  let current: Node | null = walker.currentNode;
  while ((current = walker.nextNode())) {
    targets.push(current as Text);
  }
  for (const node of targets) {
    const before = node.nodeValue ?? '';
    const after = maskText(before, entries);
    if (after !== before) node.nodeValue = after;
  }

  return doc.body.innerHTML;
}
