// components/editor/FillAllVariablesDialog.tsx
// Bulle de saisie positionnée dynamiquement sur chaque champ variable.
// Pas d'overlay, pas de flou — juste une bulle avec flèche qui pointe sur le span,
// scroll automatique du document, input minimaliste + croix.

'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { X } from 'lucide-react'
import type { Editor } from '@tiptap/react'

interface VariableOccurrence {
  name: string
  pos: number
}

interface BubblePosition {
  top: number
  left: number
  arrowLeft: number
  arrowSide: 'top' | 'bottom' // la flèche pointe vers le haut (bulle en dessous) ou vers le bas (bulle au dessus)
}

interface FillAllVariablesDialogProps {
  open: boolean
  editor: Editor | null
  onClose: () => void
}

const BUBBLE_WIDTH  = 280
const BUBBLE_HEIGHT = 64  // hauteur estimée de la bulle
const ARROW_SIZE    = 8
const GAP           = 10  // espace entre la flèche et le span
const VIEWPORT_PAD  = 12  // marge par rapport aux bords de la fenêtre

/** Collecte toutes les occurrences de variableField dans l'ordre du document */
function collectVariables(editor: Editor): VariableOccurrence[] {
  const results: VariableOccurrence[] = []
  const seen = new Set<number>()
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'variableField') return
    if (seen.has(pos)) return
    seen.add(pos)
    results.push({ name: node.attrs.name as string, pos })
  })
  return results
}

/**
 * Calcule la position de la bulle par rapport au viewport.
 * La bulle essaie de se placer EN DESSOUS du span (flèche vers le haut),
 * et se rabat AU DESSUS si pas assez de place en bas.
 */
function computeBubblePosition(spanEl: HTMLElement): BubblePosition {
  const rect   = spanEl.getBoundingClientRect()
  const vw     = window.innerWidth
  const vh     = window.innerHeight

  // Centre horizontal idéal
  const idealLeft = rect.left + rect.width / 2 - BUBBLE_WIDTH / 2
  // Clamper pour rester dans le viewport
  const left = Math.max(VIEWPORT_PAD, Math.min(idealLeft, vw - BUBBLE_WIDTH - VIEWPORT_PAD))

  // Position de la flèche par rapport à la bulle
  const arrowCenter = rect.left + rect.width / 2
  const arrowLeft   = Math.max(12, Math.min(arrowCenter - left, BUBBLE_WIDTH - 12))

  // En dessous du span ?
  const spaceBelow = vh - rect.bottom - GAP
  const spaceAbove = rect.top - GAP

  if (spaceBelow >= BUBBLE_HEIGHT + ARROW_SIZE + 4) {
    // Bulle en dessous, flèche vers le haut (pointe vers le span)
    return {
      top: rect.bottom + GAP + ARROW_SIZE,
      left,
      arrowLeft,
      arrowSide: 'top',
    }
  } else {
    // Bulle au dessus, flèche vers le bas
    return {
      top: rect.top - GAP - ARROW_SIZE - BUBBLE_HEIGHT,
      left,
      arrowLeft,
      arrowSide: 'bottom',
    }
  }
}

export function FillAllVariablesDialog({ open, editor, onClose }: FillAllVariablesDialogProps) {
  const [variables, setVariables]     = useState<VariableOccurrence[]>([])
  const [currentIdx, setCurrentIdx]   = useState(0)
  const [value, setValue]             = useState('')
  const [bubblePos, setBubblePos]     = useState<BubblePosition | null>(null)
  const inputRef  = useRef<HTMLInputElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)

  // ── Charger les variables à l'ouverture ───────────────────────────────────
  useEffect(() => {
    if (!open || !editor) return
    const vars = collectVariables(editor)
    setVariables(vars)
    setCurrentIdx(0)
    setValue('')
    setBubblePos(null)
  }, [open, editor])

  // ── Scroll + positionner la bulle à chaque nouveau champ ─────────────────
  useEffect(() => {
    if (!open || variables.length === 0) return
    const current = variables[currentIdx]
    if (!current) return

    // Trouver le span DOM dans l'ordre d'apparition
    const findAndPosition = () => {
      const editorDom = window.document.querySelector('.mylex-editor-content')
      if (!editorDom) return
      const allSpans = Array.from(
        editorDom.querySelectorAll('[data-variable-field]')
      ) as HTMLElement[]
      const target = allSpans[currentIdx]
      if (!target) return

      // Scroll pour que le span soit visible (avec marge pour que la bulle tienne)
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })

      // Attendre la fin du scroll avant de mesurer
      setTimeout(() => {
        setBubblePos(computeBubblePosition(target))
        // Focus input
        setTimeout(() => inputRef.current?.focus(), 40)
      }, 350)
    }

    findAndPosition()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx, open, variables])

  // ── Recalculer la position lors d'un scroll ou resize ────────────────────
  useEffect(() => {
    if (!open || variables.length === 0) return

    const reposition = () => {
      const editorDom = window.document.querySelector('.mylex-editor-content')
      if (!editorDom) return
      const allSpans = Array.from(
        editorDom.querySelectorAll('[data-variable-field]')
      ) as HTMLElement[]
      const target = allSpans[currentIdx]
      if (target) setBubblePos(computeBubblePosition(target))
    }

    // Le conteneur scrollable de l'éditeur
    const scrollContainer = window.document.querySelector('.mylex-editor-content')?.closest('.overflow-y-auto')
    scrollContainer?.addEventListener('scroll', reposition, { passive: true })
    window.addEventListener('resize', reposition, { passive: true })
    return () => {
      scrollContainer?.removeEventListener('scroll', reposition)
      window.removeEventListener('resize', reposition)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx, open, variables])

  // ── Confirmer la valeur et passer au suivant ──────────────────────────────
  const handleConfirm = useCallback(() => {
    if (!editor || !value.trim()) return
    const current = variables[currentIdx]
    if (!current) return

    // Relire les positions après les remplacements précédents
    const freshVars = collectVariables(editor)
    const target = freshVars.find((v) => v.name === current.name)
    if (target) editor.commands.replaceVariable(target.pos, value.trim())

    const next = currentIdx + 1
    if (next >= variables.length) {
      onClose()
    } else {
      setCurrentIdx(next)
      setValue('')
      setBubblePos(null)
    }
  }, [editor, value, currentIdx, variables, onClose])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter')  { e.preventDefault(); handleConfirm() }
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  if (!open || variables.length === 0) return null

  const current = variables[currentIdx]
  const total   = variables.length

  return (
    <>
      {/* Highlight du span ciblé via CSS global injecté */}
      <style>{`
        .mylex-editor-content [data-variable-field]:nth-child(${currentIdx + 1}),
        .fill-bubble-target {
          outline: 2px solid #01696f !important;
          outline-offset: 2px !important;
          background: rgba(1,105,111,0.14) !important;
        }
      `}</style>

      {bubblePos && current && (
        <div
          ref={bubbleRef}
          role="dialog"
          aria-label={`Renseigner ${current.name}`}
          style={{
            position: 'fixed',
            top:  bubblePos.top,
            left: bubblePos.left,
            width: BUBBLE_WIDTH,
            zIndex: 9999,
            // Animation d'apparition
            animation: 'bubblePop 0.18s cubic-bezier(0.34,1.56,0.64,1) both',
          }}
        >
          {/* Flèche pointant VERS le span — côté supérieur */}
          {bubblePos.arrowSide === 'top' && (
            <div
              style={{
                position: 'absolute',
                top: -ARROW_SIZE,
                left: bubblePos.arrowLeft - ARROW_SIZE,
                width: 0,
                height: 0,
                borderLeft:   `${ARROW_SIZE}px solid transparent`,
                borderRight:  `${ARROW_SIZE}px solid transparent`,
                borderBottom: `${ARROW_SIZE}px solid #01696f`,
                filter: 'drop-shadow(0 -1px 0 rgba(0,0,0,0.08))',
              }}
            />
          )}

          {/* Corps de la bulle */}
          <div
            style={{
              background: 'var(--color-surface)',
              border: '2px solid #01696f',
              borderRadius: 10,
              boxShadow: '0 4px 24px rgba(1,105,111,0.18), 0 1px 4px rgba(0,0,0,0.10)',
              padding: '8px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {/* Label du champ */}
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              color: '#01696f',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              letterSpacing: '0.01em',
            }}>
              {current.name}
            </span>

            {/* Séparateur */}
            <div style={{ width: 1, height: 16, background: 'var(--color-border)', flexShrink: 0 }} />

            {/* Input */}
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="…"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              style={{
                flex: 1,
                minWidth: 0,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: 13,
                color: 'var(--color-text)',
                caretColor: '#01696f',
              }}
            />

            {/* Compteur */}
            <span style={{
              fontSize: 10,
              color: 'var(--color-text-muted)',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}>
              {currentIdx + 1}/{total}
            </span>

            {/* Croix */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 20,
                height: 20,
                borderRadius: 4,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--color-text-muted)',
                flexShrink: 0,
                padding: 0,
                transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
            >
              <X style={{ width: 12, height: 12 }} />
            </button>
          </div>

          {/* Flèche pointant VERS le span — côté inférieur (bulle au dessus) */}
          {bubblePos.arrowSide === 'bottom' && (
            <div
              style={{
                position: 'absolute',
                bottom: -ARROW_SIZE,
                left: bubblePos.arrowLeft - ARROW_SIZE,
                width: 0,
                height: 0,
                borderLeft:  `${ARROW_SIZE}px solid transparent`,
                borderRight: `${ARROW_SIZE}px solid transparent`,
                borderTop:   `${ARROW_SIZE}px solid #01696f`,
                filter: 'drop-shadow(0 1px 0 rgba(0,0,0,0.08))',
              }}
            />
          )}
        </div>
      )}

      {/* Keyframe d'animation */}
      <style>{`
        @keyframes bubblePop {
          from { opacity: 0; transform: scale(0.88); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </>
  )
}
