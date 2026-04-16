// components/editor/VariablePopup.tsx
// Pop-up flottante pour renseigner la valeur d'un champ variable [Nom] [Ville] etc.
// Supporte les variables conditionnelles : [M/Mme], [né/née] → liste de choix clavier

'use client'

import { useEffect, useRef, useState } from 'react'
import { Pencil, X, ChevronDown } from 'lucide-react'

interface VariablePopupProps {
  variableName: string | null
  anchorEl: HTMLElement | null
  onConfirm: (value: string) => void
  onClose: () => void
}

// Détecte si un nom de variable est une variable conditionnelle (ex: "M/Mme", "né/née")
// Retourne le tableau des choix, ou null si c'est une variable texte normale
function parseChoices(name: string): string[] | null {
  if (!name) return null
  // Syntaxe : "choix1/choix2[/choix3...]"
  // Doit contenir au moins un "/" et les parties ne doivent pas être vides
  const parts = name.split('/')
  if (parts.length >= 2 && parts.every(p => p.trim().length > 0)) {
    return parts.map(p => p.trim())
  }
  return null
}

// ─── Sous-composant : liste de choix ─────────────────────────────────────────

function ChoiceList({
  choices,
  onSelect,
}: {
  choices: string[]
  onSelect: (value: string) => void
}) {
  const [activeIdx, setActiveIdx] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  // Focus le container dès le montage pour capter les touches clavier
  useEffect(() => {
    listRef.current?.focus()
  }, [])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'Tab') {
      e.preventDefault()
      setActiveIdx(i => (i + 1) % choices.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => (i - 1 + choices.length) % choices.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      onSelect(choices[activeIdx])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      // Remonté via onClose du parent — on ne ferme pas ici directement
    }
  }

  return (
    <div
      ref={listRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{ outline: 'none' }}
    >
      {choices.map((choice, idx) => (
        <button
          key={choice}
          onClick={() => onSelect(choice)}
          onMouseEnter={() => setActiveIdx(idx)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            borderRadius: '6px',
            marginBottom: '3px',
            background: idx === activeIdx
              ? 'var(--color-primary)'
              : 'var(--color-surface-offset)',
            color: idx === activeIdx ? '#fff' : 'var(--color-text)',
            border: idx === activeIdx
              ? '1.5px solid var(--color-primary)'
              : '1.5px solid var(--color-border)',
            fontSize: '13px',
            fontWeight: idx === activeIdx ? 600 : 400,
            cursor: 'pointer',
            transition: 'all 0.1s',
            textAlign: 'left',
          }}
        >
          <span>{choice}</span>
          {idx === activeIdx && (
            <kbd style={{
              fontSize: '9px',
              padding: '1px 5px',
              borderRadius: '3px',
              background: 'rgba(255,255,255,0.25)',
              color: '#fff',
              fontFamily: 'monospace',
              fontWeight: 400,
            }}>↵</kbd>
          )}
        </button>
      ))}
      <p style={{
        fontSize: '10px',
        color: 'var(--color-text-faint)',
        marginTop: '6px',
        lineHeight: 1.4,
      }}>
        <kbd style={{ fontFamily: 'monospace', background: 'var(--color-surface-offset)', border: '1px solid var(--color-border)', borderRadius: '3px', padding: '0 4px' }}>↑↓</kbd>
        {' '}ou{' '}
        <kbd style={{ fontFamily: 'monospace', background: 'var(--color-surface-offset)', border: '1px solid var(--color-border)', borderRadius: '3px', padding: '0 4px' }}>Tab</kbd>
        {' '}pour naviguer ·{' '}
        <kbd style={{ fontFamily: 'monospace', background: 'var(--color-surface-offset)', border: '1px solid var(--color-border)', borderRadius: '3px', padding: '0 4px' }}>↵</kbd>
        {' '}pour choisir
      </p>
    </div>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function VariablePopup({ variableName, anchorEl, onConfirm, onClose }: VariablePopupProps) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const choices = variableName ? parseChoices(variableName) : null
  const isChoice = choices !== null

  // Reset & focus à chaque ouverture
  useEffect(() => {
    if (variableName) {
      setValue('')
      if (!isChoice) {
        setTimeout(() => inputRef.current?.focus(), 50)
      }
    }
  }, [variableName, isChoice])

  // Position flottante au-dessus / en-dessous du span cliqué
  const [style, setStyle] = useState<React.CSSProperties>({})
  useEffect(() => {
    if (!anchorEl || !variableName) return
    const rect = anchorEl.getBoundingClientRect()
    const popupH = isChoice ? 60 + (choices?.length ?? 2) * 44 : 110
    const spaceBelow = window.innerHeight - rect.bottom
    const top = spaceBelow >= popupH + 8
      ? rect.bottom + window.scrollY + 6
      : rect.top  + window.scrollY - popupH - 6
    setStyle({
      position: 'absolute',
      top,
      left: Math.min(rect.left + window.scrollX, window.innerWidth - 280),
      zIndex: 9999,
    })
  }, [anchorEl, variableName, isChoice, choices])

  if (!variableName) return null

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (value.trim()) onConfirm(value.trim())
    }
    if (e.key === 'Escape') onClose()
  }

  return (
    <>
      {/* Overlay transparent pour fermer en cliquant ailleurs */}
      <div className="fixed inset-0 z-[9998]" onClick={onClose} />

      <div
        style={style}
        className="w-64 rounded-[var(--radius-lg)] bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xl p-3 flex flex-col gap-2"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[var(--text-xs)] font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
            {isChoice ? <ChevronDown className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
            {variableName}
          </span>
          <button
            onClick={onClose}
            className="p-0.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-offset)] transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Contenu : liste de choix OU champ texte */}
        {isChoice ? (
          <ChoiceList
            choices={choices!}
            onSelect={(v) => onConfirm(v)}
          />
        ) : (
          <>
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Entrez ${variableName.toLowerCase()}\u2026`}
              className="w-full h-8 px-2.5 rounded-[var(--radius-md)] text-[var(--text-sm)] text-[var(--color-text)] bg-[var(--color-surface-offset)] border border-[var(--color-border)] outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]/20 transition-all placeholder:text-[var(--color-text-muted)]"
            />
            <p className="text-[10px] text-[var(--color-text-muted)] leading-tight">
              Appuyez sur <kbd className="font-mono bg-[var(--color-surface-offset)] border border-[var(--color-border)] rounded px-1">Entr&#233;e</kbd> pour confirmer
            </p>
          </>
        )}
      </div>
    </>
  )
}
