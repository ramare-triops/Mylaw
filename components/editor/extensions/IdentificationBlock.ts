/**
 * IdentificationBlock — extension TipTap (nœud block atomique)
 *
 * Bloc d'identification d'un ou plusieurs intervenants d'un dossier. Posé
 * dans un modèle au moment de la rédaction, il reste un placeholder
 * visuel jusqu'à l'instanciation : c'est au moment où un document est
 * créé depuis le modèle dans un dossier que le bloc est remplacé par
 * l'énoncé des mentions légales de chaque intervenant porteur du rôle
 * demandé — cf. `lib/identification-blocks.ts::resolveIdentificationBlocks`.
 *
 * Pourquoi block et pas inline
 * ────────────────────────────
 * La toute première itération de cette feature utilisait un nœud
 * block-level et tout le round-trip (insertion via spec → `getHTML` →
 * re-parse → résolveur DOM) fonctionnait sans accroc. Un refactor
 * intermédiaire est passé en `inline: true` pour permettre au
 * placeholder de se poser au milieu d'une phrase, mais cette forme a
 * silencieusement cassé la persistance des attributs côté Tiptap.
 * On revient donc à la forme block qui marche — le placeholder
 * occupe sa propre ligne comme un bloc, l'expansion à la résolution
 * (paragraphes d'identité) est de toute façon block-level elle aussi.
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
 *
 * Le nœud est `atom: true` : son contenu interne est scellé, on ne peut
 * pas venir y éditer. Le placeholder est dessiné via `renderHTML`.
 */

import { Node, mergeAttributes } from '@tiptap/core';
import type { DossierRole } from '@/types';

export interface IdentificationBlockAttrs {
  role: DossierRole | null;
  separator: string | null;
  emptyFallback: string | null;
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
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

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
    };
  },

  parseHTML() {
    return [
      // Accepte les deux formes pour rester compatible avec les modèles
      // qui auraient été enregistrés durant la parenthèse inline
      // (`<span data-mylaw-identification-block>`). Après parse, le
      // nœud est toujours block — ProseMirror s'occupe de replacer
      // proprement à l'endroit attendu.
      { tag: `div[${IDENTIFICATION_BLOCK_DATA_ATTR}]` },
      { tag: `span[${IDENTIFICATION_BLOCK_DATA_ATTR}]` },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    const role = (node.attrs.role as string | null) ?? null;
    const sep = (node.attrs.separator as string | null) ?? '';
    const label = `Bloc d'identification — ${roleLabel(role)}`;
    const sepHint = sep
      ? `Séparateur : ${stripHtml(sep)}`
      : 'Séparateur par défaut';
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        [IDENTIFICATION_BLOCK_DATA_ATTR]: 'true',
        class: 'mylaw-identification-block',
        style: [
          'display:inline-flex',
          'align-items:baseline',
          'gap:8px',
          'padding:4px 10px',
          'margin:6px 0',
          'border:1px solid var(--color-primary)',
          'border-radius:999px',
          'background:rgba(1,105,111,0.06)',
          'color:var(--color-primary)',
          'font-size:12px',
          'font-family:var(--font-ui)',
          'user-select:none',
        ].join(';'),
        contenteditable: 'false',
      }),
      ['span', { style: 'font-weight:600;' }, label],
      ['span', { style: 'opacity:0.6; font-size:11px;' }, sepHint],
    ];
  },
});

/**
 * Petit util pour résumer le séparateur HTML en texte brut à l'intention
 * du placeholder visuel. Volontairement simple — les cas complexes
 * (listes, tableaux dans un séparateur) sont rarissimes.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>(\s*)/gi, ' ')
    .replace(/<\/?p[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
