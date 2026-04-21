/**
 * ClauseBlock — TipTap block extension (wrapper de contenu)
 *
 * Délimite une clause contractuelle dans un modèle. Le nœud est un bloc qui
 * enveloppe du contenu de bloc (paragraphes, titres, listes, tableaux,
 * blockquotes…) et porte les métadonnées permettant au dialog « Nouveau
 * document » de décider si la clause est incluse ou non lors de la création
 * d'un document à partir du modèle.
 *
 * Attributs :
 *   - clauseId            : identifiant stable (slug) au sein du modèle.
 *   - clauseLabel         : libellé humain (affiché dans l'éditeur et le dialog).
 *   - clauseType          : 'required' | 'optional' | 'conditional'.
 *   - defaultChecked      : pour 'optional' — état initial de la case à cocher.
 *   - dependsOn           : JSON stringifié d'une expression booléenne évaluée
 *                           contre l'ensemble des clauses incluses. Schéma :
 *                             { kind: 'ref', clauseId: string }
 *                             { kind: 'and' | 'or', terms: Expr[] }
 *                             { kind: 'not', term: Expr }
 *                           L'UI actuelle n'expose qu'une seule dépendance de
 *                           type 'ref' ; AND/OR/NOT est géré par le moteur et
 *                           peut être ouvert plus tard côté UI sans migration.
 *
 * Rendu HTML :
 *   <section class="mylaw-clause-block"
 *            data-clause-id="..."
 *            data-clause-type="..."
 *            data-clause-label="..."
 *            data-clause-default-checked="..."
 *            data-clause-depends-on="..."> … </section>
 */

import { Node, mergeAttributes } from '@tiptap/core';

export type ClauseType = 'required' | 'optional' | 'conditional';

export type ClauseDependencyExpr =
  | { kind: 'ref'; clauseId: string }
  | { kind: 'and'; terms: ClauseDependencyExpr[] }
  | { kind: 'or'; terms: ClauseDependencyExpr[] }
  | { kind: 'not'; term: ClauseDependencyExpr };

export interface ClauseBlockAttrs {
  clauseId: string | null;
  clauseLabel: string | null;
  clauseType: ClauseType;
  defaultChecked: boolean;
  dependsOn: string | null;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    clauseBlock: {
      wrapInClauseBlock: (attrs: Partial<ClauseBlockAttrs>) => ReturnType;
      unwrapClauseBlock: () => ReturnType;
      updateClauseBlockAttrs: (attrs: Partial<ClauseBlockAttrs>) => ReturnType;
    };
  }
}

export const ClauseBlock = Node.create({
  name: 'clauseBlock',
  group: 'block',
  content: 'block+',
  defining: true,
  // Permet d'entourer un sélection multi-blocs.
  priority: 50,

  addAttributes() {
    return {
      clauseId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-clause-id'),
        renderHTML: (attrs) =>
          attrs.clauseId ? { 'data-clause-id': attrs.clauseId } : {},
      },
      clauseLabel: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-clause-label'),
        renderHTML: (attrs) =>
          attrs.clauseLabel ? { 'data-clause-label': attrs.clauseLabel } : {},
      },
      clauseType: {
        default: 'required' as ClauseType,
        parseHTML: (el) => {
          const v = el.getAttribute('data-clause-type');
          return v === 'optional' || v === 'conditional' || v === 'required'
            ? v
            : 'required';
        },
        renderHTML: (attrs) => ({ 'data-clause-type': attrs.clauseType ?? 'required' }),
      },
      defaultChecked: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-clause-default-checked') === 'true',
        renderHTML: (attrs) =>
          attrs.defaultChecked ? { 'data-clause-default-checked': 'true' } : {},
      },
      dependsOn: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-clause-depends-on'),
        renderHTML: (attrs) =>
          attrs.dependsOn ? { 'data-clause-depends-on': attrs.dependsOn } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'section[data-clause-id]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'section',
      mergeAttributes(HTMLAttributes, { class: 'mylaw-clause-block' }),
      0,
    ];
  },

  addCommands() {
    return {
      wrapInClauseBlock:
        (attrs) =>
        ({ commands }) =>
          commands.wrapIn(this.name, attrs as Record<string, unknown>),
      unwrapClauseBlock:
        () =>
        ({ commands }) =>
          commands.lift(this.name),
      updateClauseBlockAttrs:
        (attrs) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, attrs as Record<string, unknown>),
    };
  },
});
