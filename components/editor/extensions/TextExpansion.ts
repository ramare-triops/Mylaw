// components/editor/extensions/TextExpansion.ts
// Extension TipTap : remplace automatiquement une abréviation par son expansion
// quand l'utilisateur tape Espace ou Entrée après le raccourci.

import { Extension } from '@tiptap/core'
import type { Editor } from '@tiptap/core'

export interface TextExpansionEntry {
  abbreviation: string
  expansion: string
}

export interface TextExpansionOptions {
  expansions: TextExpansionEntry[]
  /** Caractères déclencheurs (défaut : espace et entrée) */
  triggers: string[]
}

/**
 * Recherche l'abréviation la plus longue qui termine le texte courant avant le curseur.
 * Retourne { entry, from } ou null.
 */
function findMatchingExpansion(
  editor: Editor,
  expansions: TextExpansionEntry[]
): { entry: TextExpansionEntry; from: number } | null {
  const { state } = editor
  const { selection } = state
  const { $from } = selection

  // Texte du début du nœud jusqu'au curseur
  const textBefore = $from.nodeBefore?.text ?? $from.parent.textContent.slice(0, $from.parentOffset)
  if (!textBefore) return null

  // Trier par longueur décroissante pour matcher la plus longue en premier
  const sorted = [...expansions].sort((a, b) => b.abbreviation.length - a.abbreviation.length)

  for (const entry of sorted) {
    if (!entry.abbreviation || !entry.expansion) continue
    if (textBefore.endsWith(entry.abbreviation)) {
      const from = $from.pos - entry.abbreviation.length
      return { entry, from }
    }
  }
  return null
}

export const TextExpansion = Extension.create<TextExpansionOptions>({
  name: 'textExpansion',

  addOptions() {
    return {
      expansions: [],
      triggers: [' ', 'Enter'],
    }
  },

  addKeyboardShortcuts() {
    const handleTrigger = (triggerChar: string) => (): boolean => {
      const { expansions, triggers } = this.options
      if (!expansions.length || !triggers.includes(triggerChar)) return false

      const match = findMatchingExpansion(this.editor, expansions)
      if (!match) return false

      const { entry, from } = match
      const to = this.editor.state.selection.from

      // Remplace l'abréviation + insère le caractère déclencheur après l'expansion
      this.editor
        .chain()
        .focus()
        .deleteRange({ from, to })
        .insertContentAt(from, entry.expansion + (triggerChar === 'Enter' ? '' : triggerChar))
        .run()

      return true
    }

    return {
      Space: handleTrigger(' '),
      Enter: handleTrigger('Enter'),
    }
  },
})
