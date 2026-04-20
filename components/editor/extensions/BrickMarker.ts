/**
 * BrickMarker — TipTap inline extension (nœud invisible)
 *
 * Marqueur posé au début d'un bloc de contenu inséré depuis une brique de la
 * bibliothèque. Porte les métadonnées nécessaires à l'outillage lié aux
 * intervenants :
 *   - brickId            : identifiant unique du marqueur (par insertion)
 *   - brickTitle         : libellé d'origine de la brique
 *   - targetContactType  : 'physical' | 'moral' | null
 *   - targetRoles        : rôles dossier séparés par virgules (ou null)
 *
 * Le marqueur est un atom inline non-sélectionnable, rendu comme un span
 * de largeur 0 : il n'apparaît pas visuellement dans le document. Un overlay
 * React (BrickMarginIcons) parcourt ensuite le DOM de l'éditeur, retrouve
 * ces marqueurs, et positionne des icônes d'accès aux intervenants dans la
 * marge à la hauteur correspondante.
 */

import { Node, mergeAttributes } from '@tiptap/core';

export interface BrickMarkerAttrs {
  brickId: string | null;
  brickTitle: string | null;
  targetContactType: 'physical' | 'moral' | null;
  targetRoles: string | null;
}

export const BrickMarker = Node.create({
  name: 'brickMarker',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,
  draggable: false,

  addAttributes() {
    return {
      brickId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-mylaw-brick-id'),
        renderHTML: (attrs) =>
          attrs.brickId ? { 'data-mylaw-brick-id': attrs.brickId } : {},
      },
      brickTitle: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-brick-title'),
        renderHTML: (attrs) =>
          attrs.brickTitle ? { 'data-brick-title': attrs.brickTitle } : {},
      },
      targetContactType: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-brick-target-type'),
        renderHTML: (attrs) =>
          attrs.targetContactType
            ? { 'data-brick-target-type': attrs.targetContactType }
            : {},
      },
      targetRoles: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-brick-target-roles'),
        renderHTML: (attrs) =>
          attrs.targetRoles
            ? { 'data-brick-target-roles': attrs.targetRoles }
            : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-mylaw-brick-id]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: 'mylaw-brick-marker',
        style:
          'display:inline-block;width:0;height:0;overflow:hidden;user-select:none;',
        'aria-hidden': 'true',
      }),
    ];
  },
});
