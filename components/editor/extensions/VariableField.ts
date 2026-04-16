// components/editor/extensions/VariableField.ts
// Extension TipTap : transforme [Variable] en nœuds inline cliquables
// Supporte les attributs bold / underline / italic pour restituer le
// formatage Markdown d'une brique (ex : **[Nom de la société]**).
// replaceVariable conserve ces marks lors de la substitution par du texte.

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
      bold: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-bold') === 'true',
        renderHTML: (attrs) => attrs.bold ? { 'data-bold': 'true' } : {},
      },
      underline: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-underline') === 'true',
        renderHTML: (attrs) => attrs.underline ? { 'data-underline': 'true' } : {},
      },
      italic: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-italic') === 'true',
        renderHTML: (attrs) => attrs.italic ? { 'data-italic': 'true' } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-variable-field]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const varType = getVariableType(node.attrs.name ?? '')

    const styleParts: string[] = []
    if (node.attrs.bold)      styleParts.push('font-weight:700')
    if (node.attrs.underline) styleParts.push('text-decoration:underline')
    if (node.attrs.italic)    styleParts.push('font-style:italic')
    const style = styleParts.length ? styleParts.join(';') : undefined

    return [
      'span',
      mergeAttributes(
        {
          'data-variable-field': '',
          'data-variable-name': node.attrs.name,
          'data-variable-type': varType,
          ...(style ? { style } : {}),
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
        ({ tr, dispatch, state }) => {
          const node = tr.doc.nodeAt(pos)
          if (!node || node.type.name !== this.name) return false
          if (dispatch) {
            // ── Lire les attributs de formatage du nœud variable ─────────────
            // et appliquer les marks ProseMirror correspondants sur le
            // texte de remplacement, pour que gras/souligné/italique
            // soient conservés après saisie.
            const schema = state.schema
            const marks: import('@tiptap/pm/model').Mark[] = []

            if (node.attrs.bold) {
              const m = schema.marks['bold']
              if (m) marks.push(m.create())
            }
            if (node.attrs.underline) {
              const m = schema.marks['underline']
              if (m) marks.push(m.create())
            }
            if (node.attrs.italic) {
              const m = schema.marks['italic']
              if (m) marks.push(m.create())
            }

            const textNode = marks.length > 0
              ? schema.text(value, marks)
              : schema.text(value)

            tr.replaceWith(pos, pos + node.nodeSize, textNode)
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
