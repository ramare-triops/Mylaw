// components/editor/FillAllVariablesDialog.tsx
// Bulle minimaliste : champ texte + croix uniquement.
// La bulle se déplace via transition CSS sur top/left — elle ne disparaît jamais
// entre deux champs, elle glisse directement vers le suivant.

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

const BUBBLE_WIDTH  = 220
const BUBBLE_HEIGHT = 44
const ARROW_H       = 8
const GAP           = 6
const VIEWPORT_PAD  = 12

function countVariables(editor: Editor): number {
  let count = 0
  editor.state.doc.descendants((node) => { if (node.type.name === 'variableField') count++ })
  return count
}

function getFirstRemainingSpan(): HTMLElement | null {
  const editorDom = window.document.querySelector('.mylex-editor-content')
  if (!editorDom) return null
  const spans = Array.from(editorDom.querySelectorAll('[data-variable-field]')) as HTMLElement[]
  if (spans.length === 0) return null
  spans.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
  return spans[0]
}

function getPosFromSpan(editor: Editor, span: HTMLElement): number | null {
  try {
    const domPos  = editor.view.posAtDOM(span, 0)
    const nodePos = domPos - 1
    const node    = editor.state.doc.nodeAt(nodePos)
    if (node && node.type.name === 'variableField') return nodePos
    for (let o = -2; o <= 2; o++) {
      const p = nodePos + o
      if (p < 0) continue
      const n = editor.state.doc.nodeAt(p)
      if (n && n.type.name === 'variableField') return p
    }
    return null
  } catch { return null }
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
  const [total, setTotal]           = useState(0)
  const [remaining, setRemaining]   = useState(0)
  const [value, setValue]           = useState('')
  // bubblePos = null uniquement avant le 1er positionnement
  // Après, on met toujours à jour sans remettre à null → transition CSS glisse
  const [bubblePos, setBubblePos]   = useState<BubblePosition | null>(null)
  const [targetSpan, setTargetSpan] = useState<HTMLElement | null>(null)
  const inputRef  = useRef<HTMLInputElement>(null)
  const activeRef = useRef(false)
  const isFirstRef = useRef(true)  // 1er positionnement : on attend le scroll

  const pointToFirstSpan = useCallback(async (isActive: () => boolean, waitScroll: boolean) => {
    if (!editor) return
    const span = getFirstRemainingSpan()
    if (!span || !isActive()) return

    // Retirer l'ancien highlight
    window.document.querySelectorAll('[data-fill-active]')
      .forEach((el) => delete (el as HTMLElement).dataset.fillActive)
    span.dataset.fillActive = 'true'
    setTargetSpan(span)

    if (waitScroll) {
      // Première fois ou saut éloigné : scroll puis mesure
      await scrollToSpanAndWait(span)
      if (!isActive()) return
    }
    // Mesurer et glisser immédiatement (la transition CSS fait le reste)
    setBubblePos(computePosition(span))
    setValue('')
    setTimeout(() => inputRef.current?.focus(), 30)
  }, [editor])

  // Initialisation à l'ouverture
  useEffect(() => {
    if (!open || !editor) return
    activeRef.current = true
    isFirstRef.current = true
    const t = countVariables(editor)
    setTotal(t)
    setRemaining(t)
    setValue('')
    setBubblePos(null)
    setTargetSpan(null)
    let cancelled = false
    void pointToFirstSpan(() => !cancelled && activeRef.current, true)
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

    delete targetSpan.dataset.fillActive
    const pos = getPosFromSpan(editor, targetSpan)
    if (pos !== null) editor.commands.replaceVariable(pos, value.trim())

    const newRemaining = remaining - 1
    setRemaining(newRemaining)

    if (newRemaining <= 0) { onClose(); return }

    // Passer au suivant sans remettre bubblePos à null
    // → la bulle glisse via transition CSS
    activeRef.current = true
    let cancelled = false
    // Scroll uniquement si le prochain span est hors de la zone visible
    const nextSpan = getFirstRemainingSpan()
    const needsScroll = nextSpan ? (() => {
      const r = nextSpan.getBoundingClientRect()
      return r.top < 80 || r.bottom > window.innerHeight - 80
    })() : false
    await pointToFirstSpan(() => !cancelled && activeRef.current, needsScroll)
    return () => { cancelled = true }
  }, [editor, value, targetSpan, remaining, onClose, pointToFirstSpan])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter')  { e.preventDefault(); void handleConfirm() }
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

    if (!open || total === 0) return null

  return (
    <>
      <style>{`
        [data-fill-active="true"] {
          outline: 2.5px solid #01696f !important;
          outline-offset: 2px !important;
          background: rgba(1,105,111,0.18) !important;
        }
        .fill-bubble {
          transition: top 0.22s cubic-bezier(0.4,0,0.2,1),
                      left 0.22s cubic-bezier(0.4,0,0.2,1);
        }
      `}</style>

      {bubblePos && (
        <div
          className="fill-bubble"
          role="dialog"
          style={{
            position: 'fixed',
            top:    bubblePos.top,
            left:   bubblePos.left,
            width:  BUBBLE_WIDTH,
            zIndex: 9999,
            pointerEvents: 'auto',
          }}
        >
          {/* Flèche vers le haut */}
          {bubblePos.arrowSide === 'top' && (
            <svg width={ARROW_H * 2} height={ARROW_H} viewBox={`0 0 ${ARROW_H * 2} ${ARROW_H}`}
              style={{ position: 'absolute', top: -ARROW_H, left: bubblePos.arrowLeft - ARROW_H, display: 'block', overflow: 'visible', transition: 'left 0.22s cubic-bezier(0.4,0,0.2,1)' }}
            >
              <polygon points={`0,${ARROW_H} ${ARROW_H},0 ${ARROW_H * 2},${ARROW_H}`} fill="#01696f" />
              <polygon points={`2,${ARROW_H} ${ARROW_H},2 ${ARROW_H * 2 - 2},${ARROW_H}`} fill="var(--color-surface, #fff)" />
            </svg>
          )}

          {/* Corps */}
          <div style={{
            background: 'var(--color-surface, #fff)',
            border: '2px solid #01696f',
            borderRadius: 10,
            boxShadow: '0 4px 20px rgba(1,105,111,0.20), 0 1px 6px rgba(0,0,0,0.10)',
            padding: '6px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            height: BUBBLE_HEIGHT,
            boxSizing: 'border-box',
          }}>
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Saisir…"
              autoComplete="off" autoCorrect="off" spellCheck={false}
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
            <span style={{ fontSize: 10, color: 'var(--color-text-muted, #9ca3af)', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {total - remaining + 1}/{total}
            </span>
            <button type="button" onClick={onClose} aria-label="Fermer"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: 4, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-muted, #9ca3af)', flexShrink: 0, padding: 0 }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#01696f')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted, #9ca3af)')}
            >
              <X style={{ width: 11, height: 11 }} />
            </button>
          </div>

          {/* Flèche vers le bas */}
          {bubblePos.arrowSide === 'bottom' && (
            <svg width={ARROW_H * 2} height={ARROW_H} viewBox={`0 0 ${ARROW_H * 2} ${ARROW_H}`}
              style={{ position: 'absolute', bottom: -ARROW_H, left: bubblePos.arrowLeft - ARROW_H, display: 'block', overflow: 'visible', transition: 'left 0.22s cubic-bezier(0.4,0,0.2,1)' }}
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
