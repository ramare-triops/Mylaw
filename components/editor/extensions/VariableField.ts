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
    return [
      'span',
      mergeAttributes(
        { 'data-variable-field': '', 'data-variable-name': node.attrs.name },
        this.options.HTMLAttributes,
        HTMLAttributes,
      ),
      `[${node.attrs.name}]`,
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
