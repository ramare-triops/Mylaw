// components/editor/FillAllVariablesDialog.tsx
// Bulle de saisie positionnée directement sur le span variable ciblé.
// - Scroll du document jusqu'au span, puis mesure après stabilisation
// - Bulle en dessous ou au dessus selon l'espace disponible
// - Flèche BD qui pointe sur le span
// - Input minimaliste + croix

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
  arrowSide: 'top' | 'bottom'
}

interface FillAllVariablesDialogProps {
  open: boolean
  editor: Editor | null
  onClose: () => void
}

const BUBBLE_WIDTH = 280
const BUBBLE_HEIGHT = 52
const ARROW_H = 8
const GAP = 6          // espace entre la pointe de la flèche et le span
const VIEWPORT_PAD = 12

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
 * Récupère le span DOM correspondant à l'index courant.
 * On cherche par attribut data-variable-name ET par ordre d'apparition
 * pour être sûr de pointer le bon élément.
 */
function getTargetSpan(currentIdx: number): HTMLElement | null {
  const editorDom = window.document.querySelector('.mylex-editor-content')
  if (!editorDom) return null
  const allSpans = Array.from(
    editorDom.querySelectorAll('[data-variable-field]')
  ) as HTMLElement[]
  return allSpans[currentIdx] ?? null
}

/**
 * Calcule la position de la bulle par rapport au viewport
 * en prenant comme référence le BoundingClientRect du span.
 * La bulle est toujours centrée horizontalement sur le span.
 */
function computePosition(span: HTMLElement): BubblePosition {
  const rect = span.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight

  // Centrage horizontal sur le span
  const idealLeft = rect.left + rect.width / 2 - BUBBLE_WIDTH / 2
  const left = Math.max(VIEWPORT_PAD, Math.min(idealLeft, vw - BUBBLE_WIDTH - VIEWPORT_PAD))

  // Position de la pointe de flèche relativement à la bulle
  const spanCenter = rect.left + rect.width / 2
  const arrowLeft  = Math.max(12, Math.min(spanCenter - left, BUBBLE_WIDTH - 12))

  const spaceBelow = vh - rect.bottom - GAP
  const canGoBelow = spaceBelow >= BUBBLE_HEIGHT + ARROW_H + 4

  if (canGoBelow) {
    return {
      top: rect.bottom + GAP,       // bulle juste sous le span
      left,
      arrowLeft,
      arrowSide: 'top',             // flèche pointe vers le haut (vers le span)
    }
  } else {
    return {
      top: rect.top - GAP - ARROW_H - BUBBLE_HEIGHT,
      left,
      arrowLeft,
      arrowSide: 'bottom',
    }
  }
}

/**
 * Scroll le conteneur de l'éditeur jusqu'au span,
 * puis résout la Promise quand le scroll est stabilisé.
 */
function scrollToSpanAndWait(span: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    // Trouver le conteneur scrollable (div.overflow-y-auto autour du document)
    const container = span.closest('.overflow-y-auto') as HTMLElement | null

    if (!container) {
      span.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setTimeout(resolve, 450)
      return
    }

    const spanRect      = span.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()

    // Centre du conteneur en coordonnées absolues
    const containerCenter = container.scrollTop + containerRect.height / 2
    // Offset du span dans le conteneur
    const spanOffsetTop   = container.scrollTop + spanRect.top - containerRect.top
    // Scroll cible : span au centre du conteneur, avec une marge en haut pour la bulle
    const targetScroll    = spanOffsetTop - containerRect.height / 2 + spanRect.height / 2

    container.scrollTo({ top: targetScroll, behavior: 'smooth' })

    // Détection de stabilisation : on écoute scroll et on attend 120 ms sans événement
    let timer: ReturnType<typeof setTimeout>
    const onScroll = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        container.removeEventListener('scroll', onScroll)
        resolve()
      }, 120)
    }
    container.addEventListener('scroll', onScroll, { passive: true })
    // Fallback si le scroll ne déclenche pas d'événement (déjà visible)
    timer = setTimeout(() => {
      container.removeEventListener('scroll', onScroll)
      resolve()
    }, 500)
  })
}

export function FillAllVariablesDialog({ open, editor, onClose }: FillAllVariablesDialogProps) {
  const [variables, setVariables]   = useState<VariableOccurrence[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [value, setValue]           = useState('')
  const [bubblePos, setBubblePos]   = useState<BubblePosition | null>(null)
  const [targetSpan, setTargetSpan] = useState<HTMLElement | null>(null)
  const inputRef  = useRef<HTMLInputElement>(null)
  const activeRef = useRef(true)  // pour annuler les effets asynchrones si fermé

  // Charger les variables à l'ouverture
  useEffect(() => {
    if (!open || !editor) return
    activeRef.current = true
    const vars = collectVariables(editor)
    setVariables(vars)
    setCurrentIdx(0)
    setValue('')
    setBubblePos(null)
    setTargetSpan(null)
    return () => { activeRef.current = false }
  }, [open, editor])

  // Scroll + positionnement à chaque changement de champ
  useEffect(() => {
    if (!open || variables.length === 0) return
    const current = variables[currentIdx]
    if (!current) return

    activeRef.current = true
    setBubblePos(null)  // cache la bulle pendant le scroll

    const run = async () => {
      const span = getTargetSpan(currentIdx)
      if (!span || !activeRef.current) return

      setTargetSpan(span)

      // Appliquer le highlight avant le scroll pour que l'utilisateur voie où on va
      span.dataset.fillActive = 'true'

      await scrollToSpanAndWait(span)
      if (!activeRef.current) return

      // Mesurer APRES que le scroll soit stabilisé
      const pos = computePosition(span)
      setBubblePos(pos)
      setTimeout(() => inputRef.current?.focus(), 40)
    }

    void run()

    return () => {
      activeRef.current = false
      // Nettoyer le highlight sur l'ancien span
      const old = getTargetSpan(currentIdx)
      if (old) delete old.dataset.fillActive
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx, open, variables])

  // Nettoyage du highlight à la fermeture
  useEffect(() => {
    if (open) return
    activeRef.current = false
    window.document
      .querySelectorAll('[data-fill-active]')
      .forEach((el) => delete (el as HTMLElement).dataset.fillActive)
  }, [open])

  // Repositionnement sur scroll ou resize
  useEffect(() => {
    if (!open || !targetSpan) return
    const reposition = () => {
      if (!activeRef.current) return
      setBubblePos(computePosition(targetSpan))
    }
    const container = targetSpan.closest('.overflow-y-auto')
    container?.addEventListener('scroll', reposition, { passive: true })
    window.addEventListener('resize', reposition, { passive: true })
    return () => {
      container?.removeEventListener('scroll', reposition)
      window.removeEventListener('resize', reposition)
    }
  }, [open, targetSpan])

  const handleConfirm = useCallback(() => {
    if (!editor || !value.trim()) return
    const current = variables[currentIdx]
    if (!current) return

    // Nettoyer le highlight
    if (targetSpan) delete targetSpan.dataset.fillActive

    const freshVars = collectVariables(editor)
    const target = freshVars.find((v) => v.name === current.name)
    if (target) editor.commands.replaceVariable(target.pos, value.trim())

    const next = currentIdx + 1
    if (next >= variables.length) {
      onClose()
    } else {
      activeRef.current = true
      setCurrentIdx(next)
      setValue('')
      setBubblePos(null)
    }
  }, [editor, value, currentIdx, variables, onClose, targetSpan])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter')  { e.preventDefault(); handleConfirm() }
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  if (!open || variables.length === 0) return null

  const current = variables[currentIdx]
  const total   = variables.length

  return (
    <>
      {/* Highlight CSS du span actif */}
      <style>{`
        [data-fill-active="true"] {
          outline: 2.5px solid #01696f !important;
          outline-offset: 2px !important;
          background: rgba(1,105,111,0.18) !important;
        }
        @keyframes bubblePop {
          from { opacity: 0; transform: scale(0.90) translateY(-4px); }
          to   { opacity: 1; transform: scale(1)   translateY(0); }
        }
      `}</style>

      {bubblePos && current && (
        <div
          role="dialog"
          aria-label={`Renseigner ${current.name}`}
          style={{
            position: 'fixed',
            top:    bubblePos.top,
            left:   bubblePos.left,
            width:  BUBBLE_WIDTH,
            zIndex: 9999,
            pointerEvents: 'auto',
            animation: 'bubblePop 0.18s cubic-bezier(0.34,1.56,0.64,1) both',
          }}
        >
          {/* Flèche vers le haut — bulle en dessous du span */}
          {bubblePos.arrowSide === 'top' && (
            <svg
              width={ARROW_H * 2}
              height={ARROW_H}
              viewBox={`0 0 ${ARROW_H * 2} ${ARROW_H}`}
              style={{
                position: 'absolute',
                top: -ARROW_H,
                left: bubblePos.arrowLeft - ARROW_H,
                display: 'block',
                overflow: 'visible',
              }}
            >
              {/* Bordure de la flèche */}
              <polygon
                points={`0,${ARROW_H} ${ARROW_H},0 ${ARROW_H * 2},${ARROW_H}`}
                fill="#01696f"
              />
              {/* Remplissage intérieur (cache la bordure du rect) */}
              <polygon
                points={`2,${ARROW_H} ${ARROW_H},2 ${ARROW_H * 2 - 2},${ARROW_H}`}
                fill="var(--color-surface, #fff)"
              />
            </svg>
          )}

          {/* Corps de la bulle */}
          <div
            style={{
              background: 'var(--color-surface, #fff)',
              border: '2px solid #01696f',
              borderRadius: 10,
              boxShadow: '0 4px 20px rgba(1,105,111,0.20), 0 1px 6px rgba(0,0,0,0.10)',
              padding: '7px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              height: BUBBLE_HEIGHT,
              boxSizing: 'border-box',
            }}
          >
            {/* Nom du champ */}
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#01696f',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
            }}>
              {current.name}
            </span>

            {/* Séparateur */}
            <div style={{
              width: 1, height: 18,
              background: '#01696f',
              opacity: 0.25,
              flexShrink: 0,
            }} />

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
                color: 'var(--color-text, #28251d)',
                caretColor: '#01696f',
              }}
            />

            {/* Compteur discret */}
            <span style={{
              fontSize: 10,
              color: 'var(--color-text-muted, #9ca3af)',
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
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 18, height: 18,
                borderRadius: 4,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--color-text-muted, #9ca3af)',
                flexShrink: 0,
                padding: 0,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#01696f')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted, #9ca3af)')}
            >
              <X style={{ width: 11, height: 11 }} />
            </button>
          </div>

          {/* Flèche vers le bas — bulle au dessus du span */}
          {bubblePos.arrowSide === 'bottom' && (
            <svg
              width={ARROW_H * 2}
              height={ARROW_H}
              viewBox={`0 0 ${ARROW_H * 2} ${ARROW_H}`}
              style={{
                position: 'absolute',
                bottom: -ARROW_H,
                left: bubblePos.arrowLeft - ARROW_H,
                display: 'block',
                overflow: 'visible',
              }}
            >
              <polygon
                points={`0,0 ${ARROW_H * 2},0 ${ARROW_H},${ARROW_H}`}
                fill="#01696f"
              />
              <polygon
                points={`2,0 ${ARROW_H * 2 - 2},0 ${ARROW_H},${ARROW_H - 2}`}
                fill="var(--color-surface, #fff)"
              />
            </svg>
          )}
        </div>
      )}
    </>
  )
}
