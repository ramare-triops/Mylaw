// components/editor/FillAllVariablesDialog.tsx
// Bulle de saisie positionnée directement sur le span variable ciblé.
// Stratégie : à chaque étape on prend TOUJOURS le 1er span DOM restant
// (trié par position verticale). Pas d'index stocké qui se désynchronise
// après chaque remplacement.

'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { X } from 'lucide-react'
import type { Editor } from '@tiptap/react'

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

const BUBBLE_WIDTH  = 280
const BUBBLE_HEIGHT = 52
const ARROW_H       = 8
const GAP           = 6
const VIEWPORT_PAD  = 12

/** Compte les nœuds variableField restants dans le doc */
function countVariables(editor: Editor): number {
  let count = 0
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'variableField') count++
  })
  return count
}

/**
 * Retourne le 1er span DOM de variable encore présent,
 * trié par position verticale (haut → bas).
 */
function getFirstRemainingSpan(): HTMLElement | null {
  const editorDom = window.document.querySelector('.mylex-editor-content')
  if (!editorDom) return null
  const spans = Array.from(
    editorDom.querySelectorAll('[data-variable-field]')
  ) as HTMLElement[]
  if (spans.length === 0) return null
  spans.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
  return spans[0]
}

/**
 * Trouve la position ProseMirror d'un span DOM via posAtDOM.
 */
function getPosFromSpan(editor: Editor, span: HTMLElement): number | null {
  try {
    const view    = editor.view
    const domPos  = view.posAtDOM(span, 0)
    const nodePos = domPos - 1
    const node    = editor.state.doc.nodeAt(nodePos)
    if (node && node.type.name === 'variableField') return nodePos
    for (let offset = -2; offset <= 2; offset++) {
      const p = nodePos + offset
      if (p < 0) continue
      const n = editor.state.doc.nodeAt(p)
      if (n && n.type.name === 'variableField') return p
    }
    return null
  } catch {
    return null
  }
}

function computePosition(span: HTMLElement): BubblePosition {
  const rect = span.getBoundingClientRect()
  const vw   = window.innerWidth
  const vh   = window.innerHeight
  const idealLeft = rect.left + rect.width / 2 - BUBBLE_WIDTH / 2
  const left      = Math.max(VIEWPORT_PAD, Math.min(idealLeft, vw - BUBBLE_WIDTH - VIEWPORT_PAD))
  const arrowLeft = Math.max(12, Math.min(rect.left + rect.width / 2 - left, BUBBLE_WIDTH - 12))
  const canGoBelow = vh - rect.bottom - GAP >= BUBBLE_HEIGHT + ARROW_H + 4
  if (canGoBelow) return { top: rect.bottom + GAP, left, arrowLeft, arrowSide: 'top' }
  return { top: rect.top - GAP - ARROW_H - BUBBLE_HEIGHT, left, arrowLeft, arrowSide: 'bottom' }
}

function scrollToSpanAndWait(span: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    const container = span.closest('.overflow-y-auto') as HTMLElement | null
    if (!container) {
      span.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setTimeout(resolve, 500)
      return
    }
    const containerRect = container.getBoundingClientRect()
    const spanRect      = span.getBoundingClientRect()
    const spanOffsetTop = container.scrollTop + spanRect.top - containerRect.top
    const targetScroll  = spanOffsetTop - containerRect.height / 2 + spanRect.height / 2
    container.scrollTo({ top: targetScroll, behavior: 'smooth' })
    let timer: ReturnType<typeof setTimeout>
    const onScroll = () => {
      clearTimeout(timer)
      timer = setTimeout(() => { container.removeEventListener('scroll', onScroll); resolve() }, 120)
    }
    container.addEventListener('scroll', onScroll, { passive: true })
    timer = setTimeout(() => { container.removeEventListener('scroll', onScroll); resolve() }, 500)
  })
}

export function FillAllVariablesDialog({ open, editor, onClose }: FillAllVariablesDialogProps) {
  const [total, setTotal]             = useState(0)
  const [remaining, setRemaining]     = useState(0)
  const [currentName, setCurrentName] = useState('')
  const [value, setValue]             = useState('')
  const [bubblePos, setBubblePos]     = useState<BubblePosition | null>(null)
  const [targetSpan, setTargetSpan]   = useState<HTMLElement | null>(null)
  const inputRef  = useRef<HTMLInputElement>(null)
  const activeRef = useRef(false)

  /** Pointe la bulle sur le 1er span DOM restant */
  const pointToFirstSpan = useCallback(async (isActive: () => boolean) => {
    if (!editor) return
    setBubblePos(null)
    const span = getFirstRemainingSpan()
    if (!span || !isActive()) return
    const name = span.getAttribute('data-variable-name') ?? ''
    setCurrentName(name)
    setTargetSpan(span)
    span.dataset.fillActive = 'true'
    await scrollToSpanAndWait(span)
    if (!isActive()) return
    setBubblePos(computePosition(span))
    setTimeout(() => inputRef.current?.focus(), 40)
  }, [editor])

  // Initialisation à l'ouverture
  useEffect(() => {
    if (!open || !editor) return
    activeRef.current = true
    const t = countVariables(editor)
    setTotal(t)
    setRemaining(t)
    setValue('')
    setBubblePos(null)
    setTargetSpan(null)
    let cancelled = false
    void pointToFirstSpan(() => !cancelled && activeRef.current)
    return () => {
      cancelled = true
      activeRef.current = false
      window.document.querySelectorAll('[data-fill-active]')
        .forEach((el) => delete (el as HTMLElement).dataset.fillActive)
    }
  }, [open, editor, pointToFirstSpan])

  // Repositionnement sur scroll / resize
  useEffect(() => {
    if (!open || !targetSpan) return
    const reposition = () => { if (activeRef.current) setBubblePos(computePosition(targetSpan)) }
    const container = targetSpan.closest('.overflow-y-auto')
    container?.addEventListener('scroll', reposition, { passive: true })
    window.addEventListener('resize', reposition, { passive: true })
    return () => {
      container?.removeEventListener('scroll', reposition)
      window.removeEventListener('resize', reposition)
    }
  }, [open, targetSpan])

  // Nettoyage à la fermeture
  useEffect(() => {
    if (open) return
    activeRef.current = false
    window.document.querySelectorAll('[data-fill-active]')
      .forEach((el) => delete (el as HTMLElement).dataset.fillActive)
    setBubblePos(null)
    setTargetSpan(null)
  }, [open])

  const handleConfirm = useCallback(async () => {
    if (!editor || !value.trim() || !targetSpan) return

    // Retirer le highlight du span courant
    delete targetSpan.dataset.fillActive

    // Remplacer via la position PM réelle du span (toujours fraîche)
    const pos = getPosFromSpan(editor, targetSpan)
    if (pos !== null) editor.commands.replaceVariable(pos, value.trim())

    const newRemaining = remaining - 1
    setRemaining(newRemaining)
    setValue('')
    setBubblePos(null)
    setTargetSpan(null)

    if (newRemaining <= 0) { onClose(); return }

    // Pointer immédiatement sur le nouveau 1er span restant
    activeRef.current = true
    let cancelled = false
    await pointToFirstSpan(() => !cancelled && activeRef.current)
    return () => { cancelled = true }
  }, [editor, value, targetSpan, remaining, onClose, pointToFirstSpan])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter')  { e.preventDefault(); void handleConfirm() }
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  if (!open || total === 0) return null

  const done = total - remaining

  return (
    <>
      <style>{`
        [data-fill-active="true"] {
          outline: 2.5px solid #01696f !important;
          outline-offset: 2px !important;
          background: rgba(1,105,111,0.18) !important;
        }
        @keyframes bubblePop {
          from { opacity: 0; transform: scale(0.90) translateY(-4px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>

      {bubblePos && currentName && (
        <div
          role="dialog"
          aria-label={`Renseigner ${currentName}`}
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
          {bubblePos.arrowSide === 'top' && (
            <svg width={ARROW_H * 2} height={ARROW_H} viewBox={`0 0 ${ARROW_H * 2} ${ARROW_H}`}
              style={{ position: 'absolute', top: -ARROW_H, left: bubblePos.arrowLeft - ARROW_H, display: 'block', overflow: 'visible' }}
            >
              <polygon points={`0,${ARROW_H} ${ARROW_H},0 ${ARROW_H * 2},${ARROW_H}`} fill="#01696f" />
              <polygon points={`2,${ARROW_H} ${ARROW_H},2 ${ARROW_H * 2 - 2},${ARROW_H}`} fill="var(--color-surface, #fff)" />
            </svg>
          )}

          <div style={{
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
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#01696f', whiteSpace: 'nowrap', flexShrink: 0, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
              {currentName}
            </span>
            <div style={{ width: 1, height: 18, background: '#01696f', opacity: 0.25, flexShrink: 0 }} />
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="…"
              autoComplete="off" autoCorrect="off" spellCheck={false}
              style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: 'var(--color-text, #28251d)', caretColor: '#01696f' }}
            />
            <span style={{ fontSize: 10, color: 'var(--color-text-muted, #9ca3af)', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {done + 1}/{total}
            </span>
            <button type="button" onClick={onClose} aria-label="Fermer"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: 4, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-muted, #9ca3af)', flexShrink: 0, padding: 0 }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#01696f')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted, #9ca3af)')}
            >
              <X style={{ width: 11, height: 11 }} />
            </button>
          </div>

          {bubblePos.arrowSide === 'bottom' && (
            <svg width={ARROW_H * 2} height={ARROW_H} viewBox={`0 0 ${ARROW_H * 2} ${ARROW_H}`}
              style={{ position: 'absolute', bottom: -ARROW_H, left: bubblePos.arrowLeft - ARROW_H, display: 'block', overflow: 'visible' }}
            >
              <polygon points={`0,0 ${ARROW_H * 2},0 ${ARROW_H},${ARROW_H}`} fill="#01696f" />
              <polygon points={`2,0 ${ARROW_H * 2 - 2},0 ${ARROW_H},${ARROW_H - 2}`} fill="var(--color-surface, #fff)" />
            </svg>
          )}
        </div>
      )}
    </>
  )
}
