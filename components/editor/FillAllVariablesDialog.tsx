// components/editor/FillAllVariablesDialog.tsx
// Bulle minimaliste : champ texte + croix uniquement.
// La bulle se déplace via transition CSS sur top/left — elle ne disparaît jamais
// entre deux champs, elle glisse directement vers le suivant.
// Pour les champs de type [Date] : masque JJ/MM/AAAA avec slashes permanents,
// auto-avancement et conversion en texte lors de la confirmation.
// Pour les champs de type [Adresse] : autocomplétion BAN en 4 phases
// (code postal → commune → rue → numéro)
// Pour les champs de type [Prénom] : capitalise automatiquement chaque mot
// Pour les champs de type [Nom]    : injecté en MAJUSCULES
// Pour les champs conditionnels [M/Mme], [né/née] … : sélecteur à choix multiples
// (pas de saisie libre), navigation par Tab / flèches, validation par Entrée.
//
// Navigation clavier :
//   Entrée        → confirme la saisie et passe à la suivante
//   TAB           → skip (passe à la suivante sans renseigner)
//                   (pour une variable conditionnelle : cycle entre les options)
//   ArrowRight    → passe à la suivante sans renseigner
//                   (pour une variable conditionnelle : option suivante)
//   ArrowLeft     → revient à la précédente sans renseigner
//                   (pour une variable conditionnelle : option précédente)
//   Escape        → ferme

'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { X } from 'lucide-react'
import type { Editor } from '@tiptap/react'
import { AddressInput } from './AddressInput'

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

const BUBBLE_WIDTH         = 240
const BUBBLE_WIDTH_ADDRESS = 320
const BUBBLE_HEIGHT        = 60
const BUBBLE_HEIGHT_BASE   = 44

// Largeur adaptée au sélecteur conditionnel : calcule ~8px par caractère
// (marge incluse) pour chaque option et borne entre 220 et 360 px.
function computeConditionalWidth(options: string[]): number {
  if (options.length === 0) return BUBBLE_WIDTH
  const totalChars = options.reduce((sum, opt) => sum + opt.length, 0)
  const estimated  = totalChars * 8 + options.length * 24 + 80
  return Math.max(220, Math.min(360, estimated))
}
const ARROW_H              = 8
const GAP                  = 6
const VIEWPORT_PAD         = 12

const MOIS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

// ─── Détection du type de variable ───────────────────────────────────────────────

function isDateVariable(name: string | null | undefined): boolean {
  if (!name) return false
  return /date/i.test(name)
}

function isAddressVariable(name: string | null | undefined): boolean {
  if (!name) return false
  return /adresse|address/i.test(name)
}

/**
 * Détecte les variables prénom.
 * Matche : prénom, prenom, firstname, first_name, given_name
 */
function isFirstNameVariable(name: string | null | undefined): boolean {
  if (!name) return false
  return /pr[eé]nom|firstname|first_name|given_name/i.test(name)
}

/**
 * Détecte les variables nom de famille.
 * Matche : nom_de_famille, lastname, last_name, surname, family_name,
 *          et \bnom\b isolé (sans matcher « numero », « commune », « prenom »...)
 */
function isLastNameVariable(name: string | null | undefined): boolean {
  if (!name) return false
  // Exclure d'abord les prénoms pour éviter les faux positifs
  if (isFirstNameVariable(name)) return false
  return /\bnom\b|nom_de_famille|nom_famille|lastname|last_name|surname|family_name/i.test(name)
}

/**
 * Détecte les variables conditionnelles : le nom contient au moins un « / »
 * et, une fois découpé, donne plusieurs options non vides.
 * Ex: "M/Mme", "né/née", "inscrit / inscrite", "le/la/les"
 */
function isConditionalVariable(name: string | null | undefined): boolean {
  if (!name) return false
  if (!name.includes('/')) return false
  return getConditionalOptions(name).length >= 2
}

/**
 * Découpe un nom de variable conditionnelle en options.
 * Ex: "M / Mme" → ["M", "Mme"]
 *     "né/née"  → ["né", "née"]
 */
function getConditionalOptions(name: string): string[] {
  return name.split('/').map(s => s.trim()).filter(s => s.length > 0)
}

// ─── Transformations de casse ─────────────────────────────────────────────────

/**
 * Capitalise chaque mot d'un prénom (gestion des prénoms composés).
 * Ex: "jean-baptiste" → "Jean-Baptiste"
 *     "marie claire"  → "Marie Claire"
 */
function capitalizeFirstName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/(^|[\s-])([a-zà-ÿ])/g, (_, sep, letter) => sep + letter.toUpperCase())
}

// ─── Helpers date ──────────────────────────────────────────────────────────────

function formatDateInput(digits: string): string {
  const d = digits.slice(0, 8)
  if (d.length <= 2) return d
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`
}

function dateToText(formatted: string): string {
  const match = formatted.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return formatted
  const day   = match[1]
  const month = parseInt(match[2], 10)
  const year  = match[3]
  if (month < 1 || month > 12) return formatted
  return `${day} ${MOIS_FR[month - 1]} ${year}`
}

function extractDigits(value: string): string {
  return value.replace(/\D/g, '')
}

// ─── Helpers DOM ──────────────────────────────────────────────────────────────

function countVariables(editor: Editor): number {
  let count = 0
  editor.state.doc.descendants((node) => { if (node.type.name === 'variableField') count++ })
  return count
}

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

function computePosition(
  span: HTMLElement,
  bubbleWidth: number,
  bubbleHeight: number,
  dropdownHeight = 0,
): BubblePosition {
  const rect = span.getBoundingClientRect()
  const vw   = window.innerWidth
  const vh   = window.innerHeight
  const totalHeight = bubbleHeight + ARROW_H + dropdownHeight
  const idealLeft = rect.left + rect.width / 2 - bubbleWidth / 2
  const left      = Math.max(VIEWPORT_PAD, Math.min(idealLeft, vw - bubbleWidth - VIEWPORT_PAD))
  const arrowLeft = Math.max(12, Math.min(rect.left + rect.width / 2 - left, bubbleWidth - 12))
  const canGoBelow = vh - rect.bottom - GAP >= totalHeight + 4
  if (canGoBelow) return { top: rect.bottom + GAP, left, arrowLeft, arrowSide: 'top' }
  return { top: rect.top - GAP - ARROW_H - bubbleHeight, left, arrowLeft, arrowSide: 'bottom' }
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

// ─── Composant DateInput ────────────────────────────────────────────────────────

interface DateInputProps {
  value: string
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
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="text"
        inputMode="numeric"
        value={formatDateInput(extractDigits(value))}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        autoComplete="off" autoCorrect="off" spellCheck={false}
        style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'text', zIndex: 1 }}
        aria-label="Saisir une date JJ/MM/AAAA"
      />
      <span style={{ display: 'flex', alignItems: 'center', fontVariantNumeric: 'tabular-nums', fontSize: 13, letterSpacing: '0.02em', userSelect: 'none', pointerEvents: 'none', color: 'var(--color-text, #28251d)' }}>
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

// ─── Composant ConditionalSelect ──────────────────────────────────────────────
// Sélecteur à options pour les variables conditionnelles (ex: « M / Mme »,
// « né / née »). L'utilisateur ne saisit pas de texte : il choisit une option
// au clavier (Tab ou flèches) ou à la souris, puis confirme avec Entrée.

interface ConditionalSelectProps {
  options: string[]
  selectedIndex: number
  onSelect: (index: number) => void
  onConfirm: () => void
  onEscape: () => void
  inputRef: React.RefObject<HTMLInputElement | null>
}

function ConditionalSelect({
  options,
  selectedIndex,
  onSelect,
  onConfirm,
  onEscape,
  inputRef,
}: ConditionalSelectProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter')  { e.preventDefault(); onConfirm(); return }
    if (e.key === 'Escape') { e.preventDefault(); onEscape();  return }
    if (e.key === 'Tab' || e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      onSelect((selectedIndex + 1) % options.length)
      return
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      onSelect((selectedIndex - 1 + options.length) % options.length)
      return
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, gap: 4, position: 'relative' }}>
      {/* Input invisible qui capture le focus clavier sans intercepter les clics */}
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="text"
        value=""
        readOnly
        onChange={() => { /* lecture seule, géré via clavier */ }}
        onKeyDown={handleKeyDown}
        autoComplete="off" autoCorrect="off" spellCheck={false}
        aria-label="Choisir une option"
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          border: 'none',
          outline: 'none',
          background: 'transparent',
        }}
      />
      {options.map((opt, i) => {
        const active = i === selectedIndex
        return (
          <button
            key={`${opt}-${i}`}
            type="button"
            tabIndex={-1}
            onMouseDown={(e) => {
              e.preventDefault()
              onSelect(i)
              inputRef.current?.focus()
            }}
            onDoubleClick={(e) => { e.preventDefault(); onConfirm() }}
            title="Cliquer pour sélectionner · Double-clic ou Entrée pour valider"
            style={{
              flex: 1,
              minWidth: 0,
              padding: '4px 8px',
              borderRadius: 6,
              border: active ? '1.5px solid #01696f' : '1.5px solid transparent',
              background: active ? 'rgba(1,105,111,0.14)' : 'rgba(1,105,111,0.04)',
              color: active ? '#01696f' : 'var(--color-text, #28251d)',
              fontSize: 13,
              fontWeight: active ? 600 : 500,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              userSelect: 'none',
              transition: 'background 0.12s ease, border 0.12s ease, color 0.12s ease',
            }}
          >
            {opt}
          </button>
        )
      })}
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
  const [dropdownHeight, setDropdownHeight] = useState(0)
  const [conditionalIndex, setConditionalIndex] = useState(0)
  const inputRef    = useRef<HTMLInputElement>(null)
  const activeRef   = useRef(false)
  const isFirstRef  = useRef(true)
  const navIndexRef = useRef(0)
  const [addressKey, setAddressKey] = useState(0)

  const isDate        = isDateVariable(currentVarName)
  const isAddress     = isAddressVariable(currentVarName)
  const isFirstName   = isFirstNameVariable(currentVarName)
  const isLastName    = isLastNameVariable(currentVarName)
  const isConditional = isConditionalVariable(currentVarName)
  const conditionalOptions = isConditional && currentVarName
    ? getConditionalOptions(currentVarName)
    : []

  const currentBubbleWidth  = isAddress     ? BUBBLE_WIDTH_ADDRESS
                            : isConditional ? computeConditionalWidth(conditionalOptions)
                            :                 BUBBLE_WIDTH
  const currentBubbleHeight = isAddress ? BUBBLE_HEIGHT : BUBBLE_HEIGHT_BASE

  // Placeholder et badge casse selon le type de variable
  const inputPlaceholder = isLastName  ? 'NOM…'
                         : isFirstName ? 'Prénom…'
                         : 'Saisir…'

  // Badge visuel dans la bulle pour signaler la casse attendue
  const caseBadge = isLastName  ? { label: 'AA', title: 'Sera injecté en MAJUSCULES' }
                  : isFirstName ? { label: 'Aa', title: 'Sera capitalisé' }
                  : null

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
    setDropdownHeight(0)
    const varName = span.getAttribute('data-variable-name')
    setCurrentVarName(varName)
    setAddressKey(k => k + 1)
    setConditionalIndex(0)
    if (waitScroll) {
      await scrollToSpanAndWait(span)
      if (!isActive()) return
    }
    const widthForNext = isAddressVariable(varName)
      ? BUBBLE_WIDTH_ADDRESS
      : isConditionalVariable(varName)
        ? computeConditionalWidth(getConditionalOptions(varName as string))
        : BUBBLE_WIDTH
    const heightForNext = isAddressVariable(varName) ? BUBBLE_HEIGHT : BUBBLE_HEIGHT_BASE
    setBubblePos(computePosition(span, widthForNext, heightForNext, 0))
    setValue('')
    setTimeout(() => inputRef.current?.focus(), 30)
  }, [editor])

  const pointToFirstSpan = useCallback(async (isActive: () => boolean, waitScroll: boolean) => {
    navIndexRef.current = 0
    await pointToSpanAtIndex(0, isActive, waitScroll)
  }, [pointToSpanAtIndex])

  useEffect(() => {
    if (!targetSpan || !isAddress) return
    setBubblePos(computePosition(targetSpan, currentBubbleWidth, currentBubbleHeight, dropdownHeight))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dropdownHeight, isAddress])

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
    setDropdownHeight(0)
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
    const reposition = () => {
      if (activeRef.current)
        setBubblePos(computePosition(targetSpan, currentBubbleWidth, currentBubbleHeight, dropdownHeight))
    }
    const container = targetSpan.closest('.overflow-y-auto')
    container?.addEventListener('scroll', reposition, { passive: true })
    window.addEventListener('resize', reposition, { passive: true })
    return () => {
      container?.removeEventListener('scroll', reposition)
      window.removeEventListener('resize', reposition)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, targetSpan, currentBubbleWidth, currentBubbleHeight])

  useEffect(() => {
    if (open) return
    activeRef.current = false
    window.document.querySelectorAll('[data-fill-active]')
      .forEach((el) => delete (el as HTMLElement).dataset.fillActive)
    setBubblePos(null)
    setTargetSpan(null)
    setCurrentVarName(null)
    setDropdownHeight(0)
  }, [open])

  // ── Confirmation — applique la transformation selon le type ─────────────────

  const handleConfirm = useCallback(async () => {
    if (!editor || !targetSpan) return

    let finalValue: string
    if (isConditional) {
      if (conditionalOptions.length === 0) return
      const safeIndex = Math.max(0, Math.min(conditionalIndex, conditionalOptions.length - 1))
      finalValue = conditionalOptions[safeIndex]
    } else if (isDate) {
      const digits = extractDigits(value)
      if (digits.length < 8) return
      finalValue = dateToText(formatDateInput(digits))
    } else {
      if (!value.trim()) return
      const trimmed = value.trim()
      if (isLastName)       finalValue = trimmed.toUpperCase()
      else if (isFirstName) finalValue = capitalizeFirstName(trimmed)
      else                  finalValue = trimmed
    }

    delete targetSpan.dataset.fillActive
    const pos = getPosFromSpan(editor, targetSpan)
    if (pos !== null) editor.commands.replaceVariable(pos, finalValue)

    const newRemaining = remaining - 1
    setRemaining(newRemaining)
    if (newRemaining <= 0) { onClose(); return }

    activeRef.current = true
    let cancelled = false
    navIndexRef.current = 0
    const nextSpan = getFirstRemainingSpan()
    const needsScroll = nextSpan ? (() => {
      const r = nextSpan.getBoundingClientRect()
      return r.top < 80 || r.bottom > window.innerHeight - 80
    })() : false
    await pointToFirstSpan(() => !cancelled && activeRef.current, needsScroll)
    return () => { cancelled = true }
  }, [editor, value, targetSpan, remaining, isDate, isFirstName, isLastName, isConditional, conditionalOptions, conditionalIndex, onClose, pointToFirstSpan])

  const handleAddressConfirm = useCallback(async (address: string) => {
    if (!editor || !targetSpan) return
    delete targetSpan.dataset.fillActive
    const pos = getPosFromSpan(editor, targetSpan)
    if (pos !== null) editor.commands.replaceVariable(pos, address)
    const newRemaining = remaining - 1
    setRemaining(newRemaining)
    if (newRemaining <= 0) { onClose(); return }
    activeRef.current = true
    let cancelled = false
    navIndexRef.current = 0
    const nextSpan = getFirstRemainingSpan()
    const needsScroll = nextSpan ? (() => {
      const r = nextSpan.getBoundingClientRect()
      return r.top < 80 || r.bottom > window.innerHeight - 80
    })() : false
    await pointToFirstSpan(() => !cancelled && activeRef.current, needsScroll)
    return () => { cancelled = true }
  }, [editor, targetSpan, remaining, onClose, pointToFirstSpan])

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
                      left 0.22s cubic-bezier(0.4,0,0.2,1),
                      width 0.18s cubic-bezier(0.4,0,0.2,1);
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
            width:  currentBubbleWidth,
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
            padding: isAddress ? '8px 10px' : '6px 10px',
            display: 'flex',
            alignItems: isAddress ? 'flex-start' : 'center',
            gap: 6,
            minHeight: currentBubbleHeight,
            boxSizing: 'border-box',
          }}>
            {isConditional ? (
              <ConditionalSelect
                options={conditionalOptions}
                selectedIndex={conditionalIndex}
                onSelect={setConditionalIndex}
                onConfirm={() => void handleConfirm()}
                onEscape={onClose}
                inputRef={inputRef}
              />
            ) : isDate ? (
              <DateInput
                value={value}
                onChange={setValue}
                onConfirm={() => void handleConfirm()}
                onEscape={onClose}
                onSkipNext={() => void handleSkipNext()}
                onSkipPrev={() => void handleSkipPrev()}
                inputRef={inputRef}
              />
            ) : isAddress ? (
              <AddressInput
                key={addressKey}
                onConfirm={(addr) => void handleAddressConfirm(addr)}
                onEscape={onClose}
                onSkipNext={() => void handleSkipNext()}
                onSkipPrev={() => void handleSkipPrev()}
                inputRef={inputRef}
                onDropdownHeightChange={setDropdownHeight}
              />
            ) : (
              <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={inputPlaceholder}
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
                  // Casse visuelle en temps réel selon le type
                  textTransform: isLastName ? 'uppercase' : 'none',
                }}
              />
            )}

            {/* Badge casse : AA pour nom, Aa pour prénom */}
            {caseBadge && (
              <span
                title={caseBadge.title}
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  color: '#01696f',
                  background: 'rgba(1,105,111,0.10)',
                  borderRadius: 3,
                  padding: '1px 4px',
                  flexShrink: 0,
                  userSelect: 'none',
                  cursor: 'default',
                  lineHeight: 1.5,
                }}
              >
                {caseBadge.label}
              </span>
            )}

            <span style={{ fontSize: 10, color: 'var(--color-text-muted, #9ca3af)', whiteSpace: 'nowrap', flexShrink: 0, marginTop: isAddress ? 4 : 0 }}>
              {total - remaining + 1}/{total}
            </span>
            <button type="button" onClick={onClose} aria-label="Fermer"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: 4, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-muted, #9ca3af)', flexShrink: 0, padding: 0, marginTop: isAddress ? 2 : 0 }}
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
