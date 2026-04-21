/**
 * Résolveur de blocs d'identification.
 *
 * Un bloc d'identification est un placeholder `<div data-mylaw-identification-block>`
 * posé dans un modèle — cf. `components/editor/extensions/IdentificationBlock.ts`.
 * À l'instanciation du modèle dans un dossier, ce résolveur remplace
 * chaque bloc par l'énoncé identitaire des intervenants du dossier
 * portant le rôle demandé :
 *
 *   - Lit `data-role` pour filtrer les `DossierContact` du dossier.
 *   - Choisit pour chaque intervenant la variante d'identité adaptée
 *     (brique `identityKind: 'physical' | 'moral'`) selon `contact.type`.
 *   - Applique le contact à la brique via `applyContactToBrickContent`
 *     (remplacement déterministe quand `FieldDef.contactPath` existe, sinon
 *     correspondance floue). Les variables inconnues restent affichées en
 *     `[Label]` pour que l'utilisateur les complète manuellement.
 *   - Stitche les variantes avec le séparateur HTML du bloc (attribut
 *     `data-separator`).
 *   - Si aucun intervenant ne porte le rôle, rend le `data-empty-fallback`
 *     ou — à défaut — un commentaire inerte pour que l'utilisateur soit
 *     averti qu'il manque un intervenant côté dossier.
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
    // Aucune variante disponible pour ce type — on rend un placeholder
    // explicite plutôt que d'effacer silencieusement l'intervenant.
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

/**
 * Séparateur par défaut si l'auteur du modèle n'en a pas choisi un. Un
 * simple retour à la ligne, le moins opiniâtre qu'on puisse faire.
 */
const DEFAULT_SEPARATOR_HTML = '<p>&nbsp;</p>';

/**
 * Rend le HTML substitué au bloc d'identification pour un rôle donné et
 * un ensemble d'intervenants du dossier matchant.
 */
function renderIdentificationBlockInner(
  role: DossierRole,
  separator: string,
  emptyFallback: string | null,
  ctx: IdentificationContext
): string {
  const matching = ctx.dossierContacts.filter((dc) => dc.role === role);
  if (matching.length === 0) {
    return (
      emptyFallback ??
      `<p><em>[Aucun intervenant « ${role} » dans ce dossier]</em></p>`
    );
  }
  const parts = matching.map((m) => renderContactIdentification(m.contact, ctx));
  const sep = separator || DEFAULT_SEPARATOR_HTML;
  return parts.join(sep);
}

/**
 * Point d'entrée côté navigateur : parse le HTML du modèle, remplace
 * tous les blocs d'identification, renvoie le HTML expansé.
 *
 * Si `DOMParser` n'est pas disponible (exécution côté serveur lors d'un
 * SSR), on renvoie le HTML inchangé — la résolution est de toute façon
 * une étape de préparation à l'édition, pas de rendu.
 */
export function resolveIdentificationBlocks(
  templateHtml: string,
  ctx: IdentificationContext
): string {
  if (!templateHtml || typeof DOMParser === 'undefined') return templateHtml;
  // Si le template ne contient aucun bloc, on coupe court — pas de parse.
  if (!templateHtml.includes(IDENTIFICATION_BLOCK_DATA_ATTR)) return templateHtml;

  const doc = new DOMParser().parseFromString(
    `<!doctype html><body>${templateHtml}</body>`,
    'text/html'
  );
  const blocks = Array.from(
    doc.body.querySelectorAll<HTMLElement>(
      `[${IDENTIFICATION_BLOCK_DATA_ATTR}]`
    )
  );

  for (const block of blocks) {
    const role = (block.getAttribute('data-role') ?? '').trim();
    const separator = block.getAttribute('data-separator') ?? '';
    const emptyFallback = block.getAttribute('data-empty-fallback');

    if (!role) {
      // Bloc mal configuré : on le laisse en place pour que l'utilisateur
      // le voie et corrige le modèle.
      continue;
    }

    const innerHtml = renderIdentificationBlockInner(
      role as DossierRole,
      separator,
      emptyFallback,
      ctx
    );

    // `outerHTML =` ne fonctionne pas pour remplacer par un fragment
    // multi-élément fiable : on passe par un conteneur intermédiaire.
    const holder = doc.createElement('div');
    holder.innerHTML = innerHtml;
    const parent = block.parentNode;
    if (!parent) continue;
    while (holder.firstChild) parent.insertBefore(holder.firstChild, block);
    parent.removeChild(block);
  }

  return doc.body.innerHTML;
}
