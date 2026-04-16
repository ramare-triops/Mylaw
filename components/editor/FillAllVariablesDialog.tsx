// components/editor/FillAllVariablesDialog.tsx
// Bulle minimaliste : champ texte + croix uniquement.
// La bulle se déplace via transition CSS sur top/left — elle ne disparaît jamais
// entre deux champs, elle glisse directement vers le suivant.
// Pour les champs de type [Date] : masque JJ/MM/AAAA avec slashes permanents,
// auto-avancement et conversion en texte lors de la confirmation.
//
// Navigation clavier :
//   Entrée        → confirme la saisie et passe à la suivante
//   TAB           → skip (passe à la suivante sans renseigner)
//   ArrowRight    → passe à la suivante sans renseigner
//   ArrowLeft     → revient à la précédente sans renseigner
//   Escape        → ferme

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

const BUBBLE_WIDTH  = 240
const BUBBLE_HEIGHT = 44
const ARROW_H       = 8
const GAP           = 6
const VIEWPORT_PAD  = 12

// Noms de mois en français
const MOIS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

/** Détermine si la variable courante est un champ de type date */
function isDateVariable(name: string | null | undefined): boolean {
  if (!name) return false
  return /date/i.test(name)
}

/**
 * Formate une chaîne de chiffres bruts (max 8 chiffres) en JJ/MM/AAAA.
 * Ex : "0204" → "02/04", "02042026" → "02/04/2026"
 */
function formatDateInput(digits: string): string {
  const d = digits.slice(0, 8)
  if (d.length <= 2) return d
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`
}

/**
 * Convertit une date formatée JJ/MM/AAAA en texte lisible.
 * Ex : "02/04/2026" → "02 avril 2026"
 */
function dateToText(formatted: string): string {
  const match = formatted.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return formatted
  const day   = match[1]
  const month = parseInt(match[2], 10)
  const year  = match[3]
  if (month < 1 || month > 12) return formatted
  return `${day} ${MOIS_FR[month - 1]} ${year}`
}

/** Extrait uniquement les chiffres d'une valeur formatée JJ/MM/AAAA */
function extractDigits(value: string): string {
  return value.replace(/\D/g, '')
}

function countVariables(editor: Editor): number {
  let count = 0
  editor.state.doc.descendants((node) => { if (node.type.name === 'variableField') count++ })
  return count
}

/** Retourne toutes les spans de variables encore présentes, triées par position verticale */
function getAllRemainingSpans(): HTMLElement[] {
  const editorDom = window.document.querySelector('.mylex-editor-content')
  if (!editorDom) return []
  const spans = Array.from(editorDom.querySelectorAll('[data-variable-field]')) as HTMLElement[]
  spans.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
  return spans
}

function getFirstRemainingSpan(): HTMLElement | null {
  const spans = getAllRemainingSpans()
  return spans.length > 0 ? spans[0] : null
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

// ─── Composant input date masqué ──────────────────────────────────────────────

interface DateInputProps {
  value: string            // valeur formatée : "02/04/2026" ou partielle
  onChange: (formatted: string) => void
  onConfirm: () => void
  onEscape: () => void
  onSkipNext: () => void
  onSkipPrev: () => void
  inputRef: React.RefObject<HTMLInputElement | null>
}

function DateInput({ value, onChange, onConfirm, onEscape, onSkipNext, onSkipPrev, inputRef }: DateInputProps) {
  const digits = extractDigits(value)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter')  { e.preventDefault(); onConfirm() }
    if (e.key === 'Escape') { e.preventDefault(); onEscape() }
    if (e.key === 'Tab') {
      e.preventDefault()
      if (e.shiftKey) onSkipPrev()
      else onSkipNext()
    }
    if (e.key === 'ArrowRight') { e.preventDefault(); onSkipNext() }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); onSkipPrev() }
    if (e.key === 'Backspace') {
      e.preventDefault()
      const d = extractDigits(value)
      onChange(formatDateInput(d.slice(0, -1)))
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    const newDigits = extractDigits(raw).slice(0, 8)
    onChange(formatDateInput(newDigits))
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, position: 'relative' }}>
      {/* Input caché pour capter la saisie */}
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="text"
        inputMode="numeric"
        value={formatDateInput(extractDigits(value))}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        autoComplete="off" autoCorrect="off" spellCheck={false}
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0,
          width: '100%',
          height: '100%',
          cursor: 'text',
          zIndex: 1,
        }}
        aria-label="Saisir une date JJ/MM/AAAA"
      />
      {/* Affichage visuel du masque — pas de curseur, le placeholder suffit */}
      <span style={{
        display: 'flex',
        alignItems: 'center',
        fontVariantNumeric: 'tabular-nums',
        fontSize: 13,
        letterSpacing: '0.02em',
        userSelect: 'none',
        pointerEvents: 'none',
        color: 'var(--color-text, #28251d)',
      }}>
        <span style={{ color: digits.length >= 1 ? 'var(--color-text, #28251d)' : '#c0bdb5', minWidth: '1ch' }}>{digits[0] ?? 'J'}</span>
        <span style={{ color: digits.length >= 2 ? 'var(--color-text, #28251d)' : '#c0bdb5', minWidth: '1ch' }}>{digits[1] ?? 'J'}</span>
        <span style={{ color: '#28251d', fontWeight: 600 }}>/</span>
        <span style={{ color: digits.length >= 3 ? 'var(--color-text, #28251d)' : '#c0bdb5', minWidth: '1ch' }}>{digits[2] ?? 'M'}</span>
        <span style={{ color: digits.length >= 4 ? 'var(--color-text, #28251d)' : '#c0bdb5', minWidth: '1ch' }}>{digits[3] ?? 'M'}</span>
        <span style={{ color: '#28251d', fontWeight: 600 }}>/</span>
        <span style={{ color: digits.length >= 5 ? 'var(--color-text, #28251d)' : '#c0bdb5', minWidth: '1ch' }}>{digits[4] ?? 'A'}</span>
        <span style={{ color: digits.length >= 6 ? 'var(--color-text, #28251d)' : '#c0bdb5', minWidth: '1ch' }}>{digits[5] ?? 'A'}</span>
        <span style={{ color: digits.length >= 7 ? 'var(--color-text, #28251d)' : '#c0bdb5', minWidth: '1ch' }}>{digits[6] ?? 'A'}</span>
        <span style={{ color: digits.length >= 8 ? 'var(--color-text, #28251d)' : '#c0bdb5', minWidth: '1ch' }}>{digits[7] ?? 'A'}</span>
      </span>
    </div>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function FillAllVariablesDialog({ open, editor, onClose }: FillAllVariablesDialogProps) {
  const [total, setTotal]           = useState(0)
  const [remaining, setRemaining]   = useState(0)
  const [value, setValue]           = useState('')
  const [currentVarName, setCurrentVarName] = useState<string | null>(null)
  const [bubblePos, setBubblePos]   = useState<BubblePosition | null>(null)
  const [targetSpan, setTargetSpan] = useState<HTMLElement | null>(null)
  const inputRef    = useRef<HTMLInputElement>(null)
  const activeRef   = useRef(false)
  const isFirstRef  = useRef(true)
  // Index de navigation dans la liste des spans restantes (pour flèches / TAB)
  const navIndexRef = useRef(0)

  const isDate = isDateVariable(currentVarName)

  /** Pointe vers la span à l'index donné parmi les spans restantes */
  const pointToSpanAtIndex = useCallback(async (
    index: number,
    isActive: () => boolean,
    waitScroll: boolean,
  ) => {
    if (!editor) return
    const spans = getAllRemainingSpans()
    if (spans.length === 0 || !isActive()) return

    const clampedIndex = Math.max(0, Math.min(index, spans.length - 1))
    navIndexRef.current = clampedIndex
    const span = spans[clampedIndex]

    window.document.querySelectorAll('[data-fill-active]')
      .forEach((el) => delete (el as HTMLElement).dataset.fillActive)
    span.dataset.fillActive = 'true'
    setTargetSpan(span)

    const varName = span.getAttribute('data-variable-name')
    setCurrentVarName(varName)

    if (waitScroll) {
      await scrollToSpanAndWait(span)
      if (!isActive()) return
    }
    setBubblePos(computePosition(span))
    setValue('')
    setTimeout(() => inputRef.current?.focus(), 30)
  }, [editor])

  const pointToFirstSpan = useCallback(async (isActive: () => boolean, waitScroll: boolean) => {
    navIndexRef.current = 0
    await pointToSpanAtIndex(0, isActive, waitScroll)
  }, [pointToSpanAtIndex])

  useEffect(() => {
    if (!open || !editor) return
    activeRef.current = true
    isFirstRef.current = true
    navIndexRef.current = 0
    const t = countVariables(editor)
    setTotal(t)
    setRemaining(t)
    setValue('')
    setCurrentVarName(null)
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

  useEffect(() => {
    if (open) return
    activeRef.current = false
    window.document.querySelectorAll('[data-fill-active]')
      .forEach((el) => delete (el as HTMLElement).dataset.fillActive)
    setBubblePos(null)
    setTargetSpan(null)
    setCurrentVarName(null)
  }, [open])

  const handleConfirm = useCallback(async () => {
    if (!editor || !targetSpan) return

    let finalValue: string
    if (isDate) {
      const digits = extractDigits(value)
      if (digits.length < 8) return
      const formatted = formatDateInput(digits)
      finalValue = dateToText(formatted)
    } else {
      if (!value.trim()) return
      finalValue = value.trim()
    }

    delete targetSpan.dataset.fillActive
    const pos = getPosFromSpan(editor, targetSpan)
    if (pos !== null) editor.commands.replaceVariable(pos, finalValue)

    const newRemaining = remaining - 1
    setRemaining(newRemaining)

    if (newRemaining <= 0) { onClose(); return }

    activeRef.current = true
    let cancelled = false
    // Après confirmation, on repositionne l'index à 0 (première restante)
    navIndexRef.current = 0
    const nextSpan = getFirstRemainingSpan()
    const needsScroll = nextSpan ? (() => {
      const r = nextSpan.getBoundingClientRect()
      return r.top < 80 || r.bottom > window.innerHeight - 80
    })() : false
    await pointToFirstSpan(() => !cancelled && activeRef.current, needsScroll)
    return () => { cancelled = true }
  }, [editor, value, targetSpan, remaining, isDate, onClose, pointToFirstSpan])

  /** Skip vers l'étiquette suivante sans renseigner */
  const handleSkipNext = useCallback(async () => {
    if (!editor) return
    const spans = getAllRemainingSpans()
    if (spans.length === 0) return
    const nextIndex = (navIndexRef.current + 1) % spans.length
    let cancelled = false
    const span = spans[nextIndex]
    const needsScroll = (() => {
      const r = span.getBoundingClientRect()
      return r.top < 80 || r.bottom > window.innerHeight - 80
    })()
    await pointToSpanAtIndex(nextIndex, () => !cancelled && activeRef.current, needsScroll)
    return () => { cancelled = true }
  }, [editor, pointToSpanAtIndex])

  /** Revient à l'étiquette précédente sans renseigner */
  const handleSkipPrev = useCallback(async () => {
    if (!editor) return
    const spans = getAllRemainingSpans()
    if (spans.length === 0) return
    const prevIndex = (navIndexRef.current - 1 + spans.length) % spans.length
    let cancelled = false
    const span = spans[prevIndex]
    const needsScroll = (() => {
      const r = span.getBoundingClientRect()
      return r.top < 80 || r.bottom > window.innerHeight - 80
    })()
    await pointToSpanAtIndex(prevIndex, () => !cancelled && activeRef.current, needsScroll)
    return () => { cancelled = true }
  }, [editor, pointToSpanAtIndex])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter')  { e.preventDefault(); void handleConfirm() }
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
    if (e.key === 'Tab') {
      e.preventDefault()
      if (e.shiftKey) void handleSkipPrev()
      else void handleSkipNext()
    }
    if (e.key === 'ArrowRight') { e.preventDefault(); void handleSkipNext() }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); void handleSkipPrev() }
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
          {bubblePos.arrowSide === 'top' && (
            <svg width={ARROW_H * 2} height={ARROW_H} viewBox={`0 0 ${ARROW_H * 2} ${ARROW_H}`}
              style={{ position: 'absolute', top: -ARROW_H, left: bubblePos.arrowLeft - ARROW_H, display: 'block', overflow: 'visible', transition: 'left 0.22s cubic-bezier(0.4,0,0.2,1)' }}
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
            padding: '6px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            height: BUBBLE_HEIGHT,
            boxSizing: 'border-box',
          }}>
            {isDate ? (
              <DateInput
                value={value}
                onChange={setValue}
                onConfirm={() => void handleConfirm()}
                onEscape={onClose}
                onSkipNext={() => void handleSkipNext()}
                onSkipPrev={() => void handleSkipPrev()}
                inputRef={inputRef}
              />
            ) : (
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
            )}
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
