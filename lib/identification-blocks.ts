/**
 * Résolveur de blocs d'identification.
 *
 * Un bloc d'identification est un placeholder inline
 * `<span data-mylaw-identification-block>` (ou `<div>` pour les modèles
 * créés avant le passage en inline) posé dans un modèle — cf.
 * `components/editor/extensions/IdentificationBlock.ts`.
 *
 * À l'instanciation du modèle dans un dossier, ce résolveur remplace
 * chaque bloc par l'énoncé identitaire des intervenants du dossier
 * portant le rôle demandé :
 *
 *   - Lit `data-role` pour filtrer les `DossierContact` du dossier.
 *   - Choisit pour chaque intervenant la variante d'identité adaptée
 *     (brique `identityKind: 'physical' | 'moral'`) selon `contact.type`.
 *   - Applique le contact à la brique via `applyContactToBrickContent`
 *     (remplacement déterministe quand `FieldDef.contactPath` existe,
 *     sinon correspondance floue). Les variables inconnues restent
 *     affichées en `[Label]` pour complétion manuelle.
 *   - Stitche les variantes avec le séparateur HTML du bloc (attribut
 *     `data-separator`).
 *   - Cas `role === 'ownCounsel'` sans intervenant dans le dossier :
 *     fallback sur la fiche « Cabinet » des paramètres (voir
 *     `lib/cabinet-identity.ts`). Les champs du cabinet sont projetés en
 *     `Contact` virtuel avant passage au même rendu.
 *   - Si aucun intervenant et aucun fallback possible : `emptyFallback`
 *     explicite ou marqueur textuel pour alerter l'utilisateur.
 *
 * Gestion de l'emplacement inline : un placeholder inline peut vivre au
 * milieu d'un `<p>`. Quand son expansion contient des blocs (typiquement
 * un `<p>` par intervenant), on split le paragraphe parent pour que
 * l'expansion s'insère proprement en HTML valide — le texte avant reste
 * dans son `<p>`, l'expansion vit entre deux paragraphes, et le texte
 * après bascule dans un nouveau `<p>`.
 */

import type { Brick, Contact, DossierRole, ContactType } from '@/types';
import type { FieldDef } from '@/types/field-def';
import { applyContactToBrickContent } from './contact-variables';
import { brickContentToHtml } from '@/components/editor/DocumentBricksPanel';
import { IDENTIFICATION_BLOCK_DATA_ATTR } from '@/components/editor/extensions/IdentificationBlock';

export interface IdentificationContext {
  /** Intervenants du dossier, dans l'ordre de leur rattachement. */
  dossierContacts: Array<{ contact: Contact; role: DossierRole }>;
  /** Briques seed d'identité, une par `identityKind`. */
  identityBricks: { physical?: Brick; moral?: Brick };
  /** Catalogue des champs pour la résolution déterministe via contactPath. */
  fieldDefs: FieldDef[];
  /**
   * Contact virtuel représentant l'avocat / le cabinet qui utilise Mylaw,
   * issu des paramètres (onglet « Cabinet »). Utilisé comme fallback
   * quand un bloc d'identification demande `ownCounsel` et qu'aucun
   * `DossierContact` du dossier ne porte ce rôle.
   */
  ownCounselFallback?: Contact | null;
}

/**
 * Sélectionne la brique d'identité adaptée au type de contact. Retourne
 * `null` si la variante n'est pas présente en base (seed effacé, DB
 * fraîchement restaurée…). L'appelant rend alors un fallback visible.
 */
function pickBrickForContact(
  type: ContactType,
  bricks: { physical?: Brick; moral?: Brick }
): Brick | null {
  if (type === 'moral') return bricks.moral ?? null;
  return bricks.physical ?? null;
}

/**
 * Génère le fragment HTML d'identification d'UN contact en utilisant la
 * brique correspondant à son type.
 */
function renderContactIdentification(
  contact: Contact,
  ctx: IdentificationContext
): string {
  const brick = pickBrickForContact(contact.type, ctx.identityBricks);
  if (!brick) {
    const label = contact.type === 'moral' ? 'morale' : 'physique';
    return `<p><em>[Identité d'une personne ${label} — brique seed manquante]</em></p>`;
  }
  const { content: filled } = applyContactToBrickContent(
    contact,
    brick.content,
    ctx.fieldDefs
  );
  return brickContentToHtml(filled);
}

const DEFAULT_SEPARATOR_HTML = '<p>&nbsp;</p>';

/**
 * Liste des contacts à utiliser pour un rôle donné. Logique centrale :
 *   1. On prend tous les `DossierContact` du dossier qui portent ce rôle ;
 *   2. Si le rôle est `ownCounsel` et que rien ne matche, on bascule sur
 *      la fiche Cabinet des paramètres (projetée en `Contact` virtuel).
 */
function contactsForRole(
  role: DossierRole,
  ctx: IdentificationContext
): Contact[] {
  const matching = ctx.dossierContacts
    .filter((dc) => dc.role === role)
    .map((dc) => dc.contact);
  if (matching.length > 0) return matching;
  if (role === 'ownCounsel' && ctx.ownCounselFallback) {
    return [ctx.ownCounselFallback];
  }
  return [];
}

function renderIdentificationBlockInner(
  role: DossierRole,
  separator: string,
  emptyFallback: string | null,
  ctx: IdentificationContext
): string {
  const matching = contactsForRole(role, ctx);
  if (matching.length === 0) {
    return (
      emptyFallback ??
      `<p><em>[Aucun intervenant « ${role} » dans ce dossier]</em></p>`
    );
  }
  const parts = matching.map((c) => renderContactIdentification(c, ctx));
  const sep = separator || DEFAULT_SEPARATOR_HTML;
  return parts.join(sep);
}

/**
 * Est-ce qu'un fragment HTML contient au moins un élément block-level
 * (`<p>`, `<div>`, titres, listes) ? Utilisé pour décider si on doit
 * splitter le paragraphe parent du placeholder inline avant insertion.
 */
function htmlHasBlockElement(html: string): boolean {
  return /<\s*(p|div|ul|ol|li|h[1-6]|blockquote|pre|table)\b/i.test(html);
}

/**
 * Remplace un placeholder inline par une expansion potentiellement
 * multi-bloc, en splittant proprement le paragraphe parent.
 *
 * Cas traité :
 *   `<p>avant <span data-mylaw-identification-block /> après</p>`
 *   + expansion = `<p>X</p><p>Y</p>`
 *   → `<p>avant </p><p>X</p><p>Y</p><p> après</p>`
 *
 * Les `<p>` vides produits par le split (ex. placeholder en tête de
 * paragraphe) sont filtrés pour éviter une ligne blanche superflue.
 */
function replaceBlockInParagraph(
  doc: Document,
  block: HTMLElement,
  expansionHtml: string
): void {
  const parent = block.parentElement;
  if (!parent) return;

  const holder = doc.createElement('div');
  holder.innerHTML = expansionHtml;

  const parentTag = parent.tagName.toLowerCase();
  const isParentParagraph = parentTag === 'p';
  const hasBlockExpansion = htmlHasBlockElement(expansionHtml);

  if (!isParentParagraph || !hasBlockExpansion) {
    // Cas simple : remplacement en place, même parent.
    while (holder.firstChild) parent.insertBefore(holder.firstChild, block);
    parent.removeChild(block);
    return;
  }

  // Split : on duplique le `<p>` parent en deux — avant / après le bloc —
  // et on insère l'expansion multi-bloc entre les deux. Les `<p>` vides
  // sont retirés.
  const grandParent = parent.parentElement ?? parent.parentNode;
  if (!grandParent) return;

  const before = doc.createElement(parentTag);
  const after  = doc.createElement(parentTag);
  // Copie des attributs (style, align, etc.)
  for (const { name, value } of Array.from(parent.attributes)) {
    before.setAttribute(name, value);
    after.setAttribute(name, value);
  }

  // Dispatche les enfants en « avant / après » autour du block.
  let current: ChildNode | null = parent.firstChild;
  let seenBlock = false;
  while (current) {
    const next: ChildNode | null = current.nextSibling;
    if (current === block) {
      seenBlock = true;
    } else if (!seenBlock) {
      before.appendChild(current);
    } else {
      after.appendChild(current);
    }
    current = next;
  }

  const insertSeq: Node[] = [];
  if (before.textContent?.trim() || before.querySelector('img, br')) insertSeq.push(before);
  while (holder.firstChild) insertSeq.push(holder.firstChild);
  if (after.textContent?.trim() || after.querySelector('img, br')) insertSeq.push(after);

  for (const node of insertSeq) grandParent.insertBefore(node, parent);
  grandParent.removeChild(parent);
}

export function resolveIdentificationBlocks(
  templateHtml: string,
  ctx: IdentificationContext
): string {
  if (!templateHtml || typeof DOMParser === 'undefined') return templateHtml;

  // Diagnostic console : traçable si l'utilisateur ouvre devtools. On
  // reste silencieux en prod normale (pas d'erreur, juste debug).
  const debug = typeof window !== 'undefined' && (window as unknown as { __MYLAW_DEBUG_ID_BLOCKS__?: boolean }).__MYLAW_DEBUG_ID_BLOCKS__;
  if (debug) {
    // eslint-disable-next-line no-console
    console.log('[identification] incoming html length', templateHtml.length, 'has marker:', templateHtml.includes(IDENTIFICATION_BLOCK_DATA_ATTR));
  }

  if (!templateHtml.includes(IDENTIFICATION_BLOCK_DATA_ATTR)) return templateHtml;

  const doc = new DOMParser().parseFromString(
    `<!doctype html><body>${templateHtml}</body>`,
    'text/html'
  );
  const blocks = Array.from(
    doc.body.querySelectorAll<HTMLElement>(`[${IDENTIFICATION_BLOCK_DATA_ATTR}]`)
  );

  if (debug) {
    // eslint-disable-next-line no-console
    console.log('[identification] blocks found:', blocks.length, 'dossierContacts:', ctx.dossierContacts.length, 'bricks:', Object.keys(ctx.identityBricks));
  }

  for (const block of blocks) {
    const role = (block.getAttribute('data-role') ?? '').trim();
    const separator = block.getAttribute('data-separator') ?? '';
    const emptyFallback = block.getAttribute('data-empty-fallback');
    if (!role) continue;

    const innerHtml = renderIdentificationBlockInner(
      role as DossierRole,
      separator,
      emptyFallback,
      ctx
    );

    if (debug) {
      // eslint-disable-next-line no-console
      console.log('[identification] role=', role, 'expansion length=', innerHtml.length);
    }

    replaceBlockInParagraph(doc, block, innerHtml);
  }

  return doc.body.innerHTML;
}
