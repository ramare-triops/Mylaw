/**
 * IdentificationBlock — extension TipTap (nœud inline atomique)
 *
 * Bloc d'identification d'un ou plusieurs intervenants d'un dossier. Posé
 * dans un modèle au moment de la rédaction, il reste un placeholder
 * visuel (petit chip coloré, façon « variable ») jusqu'à l'instanciation :
 * c'est au moment où un document est créé depuis le modèle dans un
 * dossier que le bloc est remplacé par l'énoncé des mentions légales de
 * chaque intervenant porteur du rôle demandé — cf.
 * `lib/identification-blocks.ts::resolveIdentificationBlocks`.
 *
 * Inline + atom : le placeholder peut se poser n'importe où (milieu de
 * phrase, début de paragraphe…), comme n'importe quelle variable. À la
 * résolution, le résolveur gère le cas où l'expansion est multi-paragraphe
 * en splittant le `<p>` contenant le marqueur.
 *
 * Attributs :
 *  - role              : rôle du dossier à aller chercher (« client »,
 *                         « adversary »…). Obligatoire.
 *  - separator         : HTML inséré entre deux sous-blocs quand le rôle
 *                         a plusieurs intervenants (ex. « <p>et</p> »).
 *  - emptyFallback     : HTML à rendre si aucun intervenant ne porte le
 *                         rôle. Par défaut le bloc reste visible pour
 *                         signaler à l'utilisateur qu'il manque un
 *                         intervenant côté dossier.
 *  - label             : libellé court à afficher dans le chip (ex.
 *                         « Client »). Optionnel, dérivé du rôle quand
 *                         absent.
 */

import { Node } from '@tiptap/core';
import type { DossierRole } from '@/types';

export interface IdentificationBlockAttrs {
  role: DossierRole | null;
  separator: string | null;
  emptyFallback: string | null;
  label: string | null;
}

export const IDENTIFICATION_BLOCK_DATA_ATTR = 'data-mylaw-identification-block';

const ROLE_LABELS: Record<string, string> = {
  client:           'Client',
  adversary:        'Partie adverse',
  ownCounsel:       'Avocat du cabinet',
  adversaryCounsel: 'Confrère adverse',
  collaborator:     'Collaborateur',
  trainee:          'Stagiaire',
  assistant:        'Assistant(e)',
  expert:           'Expert',
  bailiff:          'Commissaire de justice',
  judge:            'Magistrat',
  court:            'Juridiction',
  witness:          'Témoin',
  other:            'Autre',
};

export function roleLabel(role: string | null | undefined): string {
  if (!role) return '—';
  return ROLE_LABELS[role] ?? role;
}

export const IdentificationBlock = Node.create({
  name: 'identificationBlock',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      role: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-role'),
        renderHTML: (attrs) => (attrs.role ? { 'data-role': attrs.role } : {}),
      },
      separator: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-separator'),
        renderHTML: (attrs) =>
          attrs.separator ? { 'data-separator': attrs.separator } : {},
      },
      emptyFallback: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-empty-fallback'),
        renderHTML: (attrs) =>
          attrs.emptyFallback
            ? { 'data-empty-fallback': attrs.emptyFallback }
            : {},
      },
      label: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-label'),
        renderHTML: (attrs) => (attrs.label ? { 'data-label': attrs.label } : {}),
      },
    };
  },

  parseHTML() {
    return [
      // Priorité haute pour battre toute règle générique qui matcherait
      // `span` (TextStyle, etc.) sur l'attribut `style` ou `class`. Les
      // deux formes (span inline, div bloc historique) sont acceptées
      // pour les modèles déjà enregistrés avant le passage à inline.
      {
        tag: `span[${IDENTIFICATION_BLOCK_DATA_ATTR}]`,
        priority: 1000,
      },
      {
        tag: `div[${IDENTIFICATION_BLOCK_DATA_ATTR}]`,
        priority: 1000,
      },
    ];
  },

  renderHTML({ node }) {
    // On construit les attributs HTML à la main, sans passer par
    // `mergeAttributes` ni `HTMLAttributes` dérivés de `addAttributes`.
    // Plus direct, plus prévisible : on est certain que `data-mylaw-
    // identification-block` se retrouvera bien dans la sortie, que le
    // résolveur pourra détecter après un round-trip `getHTML()`.
    const role          = node.attrs.role as string | null;
    const separator     = node.attrs.separator as string | null;
    const emptyFallback = node.attrs.emptyFallback as string | null;
    const attrLabel     = node.attrs.label as string | null;
    const label         = attrLabel || roleLabel(role);

    const attrs: Record<string, string> = {
      [IDENTIFICATION_BLOCK_DATA_ATTR]: 'true',
      class: 'mylaw-identification-block',
      contenteditable: 'false',
      style: [
        'display:inline-flex',
        'align-items:center',
        'gap:4px',
        'padding:1px 8px',
        'margin:0 1px',
        'border-radius:999px',
        'border:1px solid var(--color-primary)',
        'background:rgba(1,105,111,0.08)',
        'color:var(--color-primary)',
        'font-size:0.85em',
        'font-weight:600',
        'font-family:var(--font-ui)',
        'line-height:1.4',
        'user-select:none',
        'cursor:default',
        'white-space:nowrap',
      ].join(';'),
    };
    if (role)          attrs['data-role']           = role;
    if (separator)     attrs['data-separator']      = separator;
    if (emptyFallback) attrs['data-empty-fallback'] = emptyFallback;
    if (attrLabel)     attrs['data-label']          = attrLabel;

    return ['span', attrs, `¶ ${label}`];
  },
});

/**
 * Produit le HTML brut d'un marqueur de bloc d'identification, prêt à
 * être injecté via `editor.insertContent(html)`. Utilisé par le panneau
 * de briques quand l'utilisateur clique sur une brique de type
 * « Dossier » dans un modèle.
 */
export function makeIdentificationBlockHtml(
  role: DossierRole,
  separator?: string | null,
  emptyFallback?: string | null,
  label?: string | null,
): string {
  const attrs: string[] = [
    `${IDENTIFICATION_BLOCK_DATA_ATTR}="true"`,
    `data-role="${escapeAttr(role)}"`,
  ];
  if (separator)      attrs.push(`data-separator="${escapeAttr(separator)}"`);
  if (emptyFallback)  attrs.push(`data-empty-fallback="${escapeAttr(emptyFallback)}"`);
  if (label)          attrs.push(`data-label="${escapeAttr(label)}"`);
  return `<span ${attrs.join(' ')}>​</span>`;
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
