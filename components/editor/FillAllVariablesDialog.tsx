// components/editor/FillAllVariablesDialog.tsx
// Pop-up centrale pour renseigner tous les champs [Variable] les uns après les autres.
// - Navigation automatique après chaque saisie (touche Entrée)
// - Affichage de la phrase contextuelle issue du document
// - Fermeture auto après le dernier champ
// - Croix pour fermer à tout moment

'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { X, ChevronRight, CheckCircle2 } from 'lucide-react'
import type { Editor } from '@tiptap/react'

interface VariableOccurrence {
  name: string
  pos: number
  context: string // phrase ou fragment de texte autour du champ
}

interface FillAllVariablesDialogProps {
  open: boolean
  editor: Editor | null
  onClose: () => void
}

/** Extrait toutes les occurrences de variableField dans le document */
function collectVariables(editor: Editor): VariableOccurrence[] {
  const results: VariableOccurrence[] = []
  const seen = new Set<number>()

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'variableField') return
    if (seen.has(pos)) return
    seen.add(pos)

    // Chercher le texte du paragraphe parent pour le contexte
    let context = ''
    editor.state.doc.nodesBetween(
      Math.max(0, pos - 200),
      Math.min(editor.state.doc.content.size, pos + 200),
      (n, p) => {
        if (n.isBlock) {
          // Reconstituer le texte du bloc avec des placeholders pour les variables
          let blockText = ''
          n.forEach((child) => {
            if (child.type.name === 'variableField') {
              blockText += `[${child.attrs.name as string}]`
            } else if (child.isText) {
              blockText += child.text ?? ''
            }
          })
          // Ne garder que les blocs qui contiennent cette variable
          if (blockText.includes(`[${node.attrs.name as string}]`) && p <= pos) {
            context = blockText.trim()
          }
        }
      }
    )

    // Tronquer le contexte si trop long
    if (context.length > 120) {
      const idx = context.indexOf(`[${node.attrs.name as string}]`)
      const start = Math.max(0, idx - 50)
      const end   = Math.min(context.length, idx + 70)
      context = (start > 0 ? '…' : '') + context.slice(start, end) + (end < context.length ? '…' : '')
    }

    results.push({ name: node.attrs.name as string, pos, context })
  })

  return results
}

export function FillAllVariablesDialog({ open, editor, onClose }: FillAllVariablesDialogProps) {
  const [variables, setVariables]   = useState<VariableOccurrence[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [value, setValue]           = useState('')
  const [done, setDone]             = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Charger les variables à l'ouverture
  useEffect(() => {
    if (!open || !editor) return
    const vars = collectVariables(editor)
    setVariables(vars)
    setCurrentIdx(0)
    setValue('')
    setDone(false)
  }, [open, editor])

  // Focus input à chaque changement de champ
  useEffect(() => {
    if (open && !done) {
      setTimeout(() => inputRef.current?.focus(), 60)
    }
  }, [currentIdx, open, done])

  // Scroll & highlight dans l'éditeur au champ courant
  useEffect(() => {
    if (!open || !editor || done || variables.length === 0) return
    const current = variables[currentIdx]
    if (!current) return

    // Sélectionner le nœud dans ProseMirror pour le mettre en évidence
    const { tr } = editor.state
    const newTr = tr.setSelection(
      // NodeSelection autour du nœud
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (editor.state.selection.constructor as any).near
        ? editor.state.selection
        : editor.state.selection
    )
    void newTr // pas d'action ici, juste scroll

    // Scroll vers l'élément DOM du champ
    requestAnimationFrame(() => {
      const editorDom = window.document.querySelector('.mylex-editor-content')
      if (!editorDom) return
      const allSpans = editorDom.querySelectorAll('[data-variable-field]')
      // Trouver le span correspondant à cette position dans l'ordre d'apparition
      const target = allSpans[currentIdx] as HTMLElement | undefined
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' })
        // Highlight temporaire
        target.style.outline = '2.5px solid #01696f'
        target.style.outlineOffset = '2px'
        const timer = setTimeout(() => {
          target.style.outline = ''
          target.style.outlineOffset = ''
        }, 2000)
        return () => clearTimeout(timer)
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx, open, done])

  const handleConfirm = useCallback(() => {
    if (!editor || !value.trim()) return
    const current = variables[currentIdx]
    if (!current) return

    // Recalculer la position réelle (les remplacements précédents décalent les positions)
    // On relit les variables actuelles dans le doc
    const freshVars = collectVariables(editor)
    // Trouver la première occurrence du même nom dans les vars restantes
    const target = freshVars.find((v) => v.name === current.name)
    if (target) {
      editor.commands.replaceVariable(target.pos, value.trim())
    }

    const next = currentIdx + 1
    if (next >= variables.length) {
      setDone(true)
      setTimeout(() => onClose(), 1200)
    } else {
      setCurrentIdx(next)
      setValue('')
    }
  }, [editor, value, currentIdx, variables, onClose])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleConfirm() }
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  const handleSkip = () => {
    const next = currentIdx + 1
    if (next >= variables.length) { onClose(); return }
    setCurrentIdx(next)
    setValue('')
  }

  if (!open) return null

  const current  = variables[currentIdx]
  const total    = variables.length
  const progress = total > 0 ? ((currentIdx) / total) * 100 : 0

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Overlay semi-transparent */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[3px]" />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-lg bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-xl,12px)] shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[var(--color-border)]">
          <div>
            <h2 className="text-[var(--text-base)] font-semibold text-[var(--color-text)]">
              Renseigner les informations
            </h2>
            <p className="text-[var(--text-xs)] text-[var(--color-text-muted)] mt-0.5">
              {done
                ? 'Tous les champs ont été renseignés'
                : total === 0
                  ? 'Aucun champ à renseigner dans ce document'
                  : `Champ ${currentIdx + 1} sur ${total}`
              }
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-offset)] transition-colors"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Barre de progression */}
        {total > 0 && (
          <div className="h-1 bg-[var(--color-surface-offset)]">
            <div
              className="h-full bg-[var(--color-primary)] transition-all duration-300"
              style={{ width: `${done ? 100 : progress}%` }}
            />
          </div>
        )}

        {/* Corps */}
        <div className="px-6 py-5 flex flex-col gap-4">

          {done ? (
            /* État terminé */
            <div className="flex flex-col items-center gap-3 py-4">
              <CheckCircle2 className="w-10 h-10 text-[var(--color-success)]" />
              <p className="text-[var(--text-sm)] font-medium text-[var(--color-text)]">Tous les champs sont renseignés !</p>
            </div>
          ) : total === 0 ? (
            /* Aucun champ */
            <div className="flex flex-col items-center gap-3 py-4">
              <p className="text-[var(--text-sm)] text-[var(--color-text-muted)] text-center">
                Ce document ne contient aucun champ variable <span className="font-mono">[...]</span> à renseigner.
              </p>
              <button
                onClick={onClose}
                className="h-9 px-4 rounded-[var(--radius-md)] text-[var(--text-sm)] font-medium bg-[var(--color-primary)] text-[var(--color-text-inverse)] hover:bg-[var(--color-primary-hover)] transition-colors"
              >
                Fermer
              </button>
            </div>
          ) : current ? (
            <>
              {/* Nom du champ */}
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[var(--text-xs)] font-semibold border-[1.5px] border-dashed border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-primary)]/6">
                  {current.name}
                </span>
                <span className="text-[var(--text-xs)] text-[var(--color-text-muted)]">
                  {currentIdx + 1} / {total}
                </span>
              </div>

              {/* Contexte — phrase du document */}
              {current.context && (
                <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-offset)] border border-[var(--color-border)] px-4 py-3">
                  <p className="text-[var(--text-xs)] text-[var(--color-text-muted)] mb-1 uppercase tracking-wide font-medium">Contexte dans le document</p>
                  <p className="text-[var(--text-sm)] text-[var(--color-text)] leading-relaxed">
                    {renderContextWithHighlight(current.context, current.name)}
                  </p>
                </div>
              )}

              {/* Input */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[var(--text-xs)] font-medium text-[var(--color-text-muted)]">
                  Valeur pour <strong className="text-[var(--color-text)]">{current.name}</strong>
                </label>
                <input
                  ref={inputRef}
                  type="text"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Entrez ${current.name.toLowerCase()}…`}
                  className="w-full h-10 px-3 rounded-[var(--radius-md)] text-[var(--text-sm)] text-[var(--color-text)] bg-[var(--color-surface-offset)] border border-[var(--color-border)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 transition-all placeholder:text-[var(--color-text-muted)]"
                  autoComplete="off"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between gap-3 pt-1">
                <button
                  onClick={handleSkip}
                  className="text-[var(--text-xs)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors underline underline-offset-2"
                >
                  Passer ce champ
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={!value.trim()}
                  className="inline-flex items-center gap-2 h-9 px-4 rounded-[var(--radius-md)] text-[var(--text-sm)] font-medium bg-[var(--color-primary)] text-[var(--color-text-inverse)] hover:bg-[var(--color-primary-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {currentIdx + 1 < total ? (
                    <>
                      Suivant
                      <ChevronRight className="w-3.5 h-3.5" />
                    </>
                  ) : (
                    <>
                      Terminer
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>

              {/* Raccourci clavier */}
              <p className="text-[10px] text-[var(--color-text-muted)] text-center -mt-1">
                Appuyez sur{' '}
                <kbd className="font-mono bg-[var(--color-surface-offset)] border border-[var(--color-border)] rounded px-1 py-0.5">Entrée</kbd>
                {' '}pour confirmer et passer au suivant
              </p>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/** Rend le texte de contexte en mettant le champ variable en surbrillance */
function renderContextWithHighlight(context: string, name: string): React.ReactNode {
  const marker = `[${name}]`
  const idx = context.indexOf(marker)
  if (idx === -1) return context
  return (
    <>
      {context.slice(0, idx)}
      <span className="inline-flex items-center px-1 py-0.5 rounded border-[1.5px] border-dashed border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-primary)]/10 font-medium mx-0.5">
        {marker}
      </span>
      {context.slice(idx + marker.length)}
    </>
  )
}
