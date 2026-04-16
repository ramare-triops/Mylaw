// components/editor/extensions/VariableField.ts
// Extension TipTap : transforme [Variable] en nœuds inline cliquables

import { Node, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

export interface VariableFieldOptions {
  HTMLAttributes: Record<string, unknown>
  onVariableClick?: (name: string, pos: number) => void
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    variableField: {
      insertVariable: (name: string) => ReturnType
      replaceVariable: (pos: number, value: string) => ReturnType
    }
  }
}

/**
 * Détermine la catégorie d'une variable à partir de son nom.
 * Utilisé pour appliquer une couleur CSS via data-variable-type.
 */
function getVariableType(name: string): string {
  const n = name.toLowerCase()
  if (/date|jour|mois|ann[eé]e|naissance|signature/.test(n)) return 'date'
  if (/prix|montant|somme|loyer|€|euro|tarif|co[uû]t|charges|caution/.test(n)) return 'price'
  if (/nom|pr[eé]nom|partie|client|locataire|bailleur|vendeur|acheteur|acqu[eé]reur|c[eé]dant|soci[eé]t[eé]|entreprise|personne|mandant|mandataire|repr[eé]sentant|avocat|notaire/.test(n)) return 'name'
  if (/adresse|ville|commune|d[eé]partement|r[eé]gion|pays|code.?postal|lieu|domicile|si[eè]ge/.test(n)) return 'address'
  if (/dur[eé]e|d[eé]lai|p[eé]riode|mois|semaine/.test(n)) return 'duration'
  if (/num[eé]ro|n°|r[eé]f[eé]rence|siret|siren|rcs|immatriculation|contrat|dossier/.test(n)) return 'reference'
  return 'default'
}

export const VariableField = Node.create<VariableFieldOptions>({
  name: 'variableField',

  group: 'inline',
  inline: true,
  selectable: true,
  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {},
      onVariableClick: undefined,
    }
  },

  addAttributes() {
    return {
      name: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-variable-name'),
        renderHTML: (attrs) => ({ 'data-variable-name': attrs.name }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-variable-field]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const varType = getVariableType(node.attrs.name ?? '')
    return [
      'span',
      mergeAttributes(
        {
          'data-variable-field': '',
          'data-variable-name': node.attrs.name,
          'data-variable-type': varType,
        },
        this.options.HTMLAttributes,
        HTMLAttributes,
      ),
      node.attrs.name,
    ]
  },

  addCommands() {
    return {
      insertVariable:
        (name: string) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { name },
          })
        },

      replaceVariable:
        (pos: number, value: string) =>
        ({ tr, dispatch }) => {
          const node = tr.doc.nodeAt(pos)
          if (!node || node.type.name !== this.name) return false
          if (dispatch) {
            tr.replaceWith(pos, pos + node.nodeSize, tr.doc.type.schema.text(value))
            dispatch(tr)
          }
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    const extensionThis = this
    return [
      new Plugin({
        key: new PluginKey('variableFieldClick'),
        props: {
          handleClick(view, pos, event) {
            const target = event.target as HTMLElement
            const span = target.closest('[data-variable-field]') as HTMLElement | null
            if (!span) return false
            const domPos = view.posAtDOM(span, 0)
            const nodePos = domPos - 1
            const node = view.state.doc.nodeAt(nodePos)
            if (!node || node.type.name !== 'variableField') return false
            extensionThis.options.onVariableClick?.(node.attrs.name as string, nodePos)
            return true
          },
        },
      }),
    ]
  },
})
