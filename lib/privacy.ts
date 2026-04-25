/**
 * Mode confidentialité / secret professionnel.
 *
 * Lorsque l'avocat travaille en public, ce module masque les données
 * sensibles affichées à l'écran :
 *  - Noms de dossiers : chaque partie du nom est ramenée à ses trois
 *    premières lettres + une ellipse + sa dernière lettre
 *    (ex. « Dupont » → « Dup...t », « Charpentier » → « Cha...r »).
 *    Quand le dossier nomme deux parties séparées par « / »
 *    (ex. « Dupont / Michel »), le format devient « Dup...t / Mic...l ».
 *  - Prénoms / noms : même règle de masquage.
 *  - Contenu des documents : les valeurs filles d'un FieldDef ou d'une
 *    brique sont restaurées en `[Label]`. Les noms / prénoms suivent
 *    le masquage par troncature.
 *
 * Le but est de pouvoir consulter et travailler sur un dossier en
 * audience ou dans les transports sans exposer l'identité du client.
 * Les chaînes ne sont jamais altérées en base : le masquage est
 * uniquement appliqué au moment du rendu.
 */

import type { Contact } from '@/types';
import type { FieldDef } from '@/types/field-def';
import { contactValueFromPath } from './contact-variables';

/** Préfixes de civilité reconnus en tête de partie de nom. */
const CIVILITY_PREFIXES = new Set([
  'monsieur',
  'madame',
  'mademoiselle',
  'maître',
  'maitre',
  'mr',
  'mme',
  'mlle',
  'me',
  'm.',
  'pr.',
  'dr.',
  'm',
]);

/**
 * Préfixes additionnels (formes juridiques, libellés cabinet) qui
 * sont conservés intacts en tête de partie ; le mot suivant reçoit le
 * masquage par troncature.
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
  'gie',
  'scop',
  'société',
  'societe',
  'cabinet',
  'affaire',
  'dossier',
  'succession',
]);

/** Marqueur d'ellipse pour les masques. */
const ELLIPSIS = '...';

/**
 * Tronque un mot en gardant ses trois premières lettres, une ellipse
 * et sa dernière lettre.
 *
 *   « Dupont »      → « Dup...t »
 *   « Charpentier » → « Cha...r »
 *   « Élise »       → « Éli...e »
 *
 * Pour les mots trop courts, on dégrade gracieusement :
 *   « Lo »  → « Lo »      (3 lettres ou moins : on laisse tel quel)
 *   « Léa » → « Léa »
 *   « Léon »→ « Léo...n »
 *   « Lou »→ « Lou »
 *
 * Tient compte des caractères non-alphabétiques en tête (apostrophes,
 * parenthèses) qui sont préservés.
 */
export function maskWord(token: string): string {
  if (!token) return '';
  // Sépare un éventuel préfixe non-alphabétique (apostrophes, ouvrant)
  // d'un éventuel suffixe (ponctuation finale) du corps alphabétique.
  const m = token.match(/^([^A-Za-zÀ-ÖØ-öø-ÿ]*)(.*?)([^A-Za-zÀ-ÖØ-öø-ÿ]*)$/);
  if (!m) return token;
  const prefix = m[1];
  const core = m[2];
  const suffix = m[3];
  if (!core) return token;

  const chars = Array.from(core);
  if (chars.length <= 3) return token;
  if (chars.length === 4) {
    // « Léon » → « Léo...n » (3 + ellipse + 1 = même longueur, mais
    // visuellement masqué).
    return `${prefix}${chars.slice(0, 3).join('')}${ELLIPSIS}${chars[chars.length - 1]}${suffix}`;
  }
  return `${prefix}${chars.slice(0, 3).join('')}${ELLIPSIS}${chars[chars.length - 1]}${suffix}`;
}

/**
 * Masque une « partie » de nom de dossier (un côté du « / »).
 *
 * Logique :
 *   - Conserve un éventuel préfixe (civilité ou forme juridique) tel
 *     quel, masque le mot suivant.
 *   - Sinon, masque le premier mot avec `maskWord`.
 *
 * Exemples :
 *   « Dupont »            → « Dup...t »
 *   « Monsieur Dupont »   → « Monsieur Dup...t »
 *   « Madame Charpentier »→ « Madame Cha...r »
 *   « SARL TechCorp »     → « SARL Tec...p »
 */
export function maskNamePart(part: string | null | undefined): string {
  if (!part) return '';
  const trimmed = part.trim();
  if (!trimmed) return '';
  const tokens = trimmed.split(/\s+/);
  if (tokens.length === 0) return '';

  if (tokens.length === 1) {
    return maskWord(tokens[0]);
  }

  const head = tokens[0];
  const headLower = head.toLowerCase();
  const isPrefix =
    CIVILITY_PREFIXES.has(headLower) ||
    CIVILITY_PREFIXES.has(headLower.replace(/\.$/, '')) ||
    EXTRA_PREFIXES.has(headLower);

  if (isPrefix) {
    return `${head} ${maskWord(tokens[1])}`;
  }

  // Pas de préfixe reconnu : on masque uniquement le premier mot,
  // ce qui suffit à protéger l'identité dans la plupart des cas.
  return maskWord(head);
}

/**
 * Masque un nom de dossier complet, en gérant le séparateur « / »
 * couramment utilisé pour opposer deux parties.
 *
 * Exemples :
 *   « Dupont »                → « Dup...t »
 *   « Dupont / Michel »       → « Dup...t / Mic...l »
 *   « Monsieur D. c/ SARL X » → « Monsieur D. c/ SARL X » (préservé,
 *     mais la partie nominale est masquée si reconnue)
 */
export function maskDossierName(name: string | null | undefined): string {
  if (!name) return '';
  const trimmed = name.trim();
  if (!trimmed) return '';

  // Sépare sur « / » entouré ou non d'espaces. Conserve le séparateur
  // d'origine pour ré-assembler à l'identique. Les formes « c/ » ou
  // « C/ » très courtes sont traitées comme un séparateur normal.
  const segments = trimmed.split(/\s*\/\s*/);
  return segments.map(maskNamePart).join(' / ');
}

/**
 * Masque un prénom : « Philippe » → « Phi...e ». Utilisé dans le
 * contenu des documents pour les valeurs identifiées comme prénoms,
 * où la spec impose la troncature plutôt que le label `[Prénom]`.
 */
export function maskFirstName(firstName: string | null | undefined): string {
  if (!firstName) return '';
  return maskWord(firstName.trim());
}

/**
 * Masque un nom de famille : « COUDERT » → « COU...T ». Conserve la
 * casse d'origine (les noms en SHOUT case restent en majuscule dans
 * la troncature).
 */
export function maskLastName(lastName: string | null | undefined): string {
  if (!lastName) return '';
  return maskWord(lastName.trim());
}

/**
 * Masque un nom client / personnel libre. Applique `maskWord` à
 * chaque mot du nom, en préservant les espaces.
 *
 *   « Jean Dupont » → « Jean Dup...t » (« Jean » fait 4 lettres → « Jea...n » ?
 *   non, on préfère ne masquer QUE le nom de famille — on conserve donc
 *   les prénoms intacts et on tronque uniquement le dernier mot.)
 *
 *   « Dupont »      → « Dup...t »
 *   « Jean Dupont » → « Jean Dup...t »
 */
export function maskClientName(name: string | null | undefined): string {
  if (!name) return '';
  const trimmed = name.trim();
  if (!trimmed) return '';
  // On délègue à `maskNamePart` qui sait gérer civilité + nom et qui
  // ne masque que la composante identifiante. Adapté à un libellé court.
  return maskNamePart(trimmed);
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
  /** Chaîne de remplacement (ex. « [Date de naissance] » ou « Phi...e »). */
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
