// components/editor/VariablePopup.tsx
// Pop-up flottante pour renseigner la valeur d'un champ variable [Nom] [Ville] etc.

'use client'

import { useEffect, useRef, useState } from 'react'
import { Pencil, X } from 'lucide-react'

interface VariablePopupProps {
  variableName: string | null
  anchorEl: HTMLElement | null
  onConfirm: (value: string) => void
  onClose: () => void
}

export function VariablePopup({ variableName, anchorEl, onConfirm, onClose }: VariablePopupProps) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset & focus à chaque ouverture
  useEffect(() => {
    if (variableName) {
      setValue('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [variableName])

  // Position flottante au-dessus / en-dessous du bouton cliqué
  const [style, setStyle] = useState<React.CSSProperties>({})
  useEffect(() => {
    if (!anchorEl || !variableName) return
    const rect = anchorEl.getBoundingClientRect()
    const popupH = 110
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
  }, [anchorEl, variableName])

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
            <Pencil className="w-3 h-3" />
            {variableName}
          </span>
          <button
            onClick={onClose}
            className="p-0.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-offset)] transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Entrez ${variableName.toLowerCase()}…`}
          className="w-full h-8 px-2.5 rounded-[var(--radius-md)] text-[var(--text-sm)] text-[var(--color-text)] bg-[var(--color-surface-offset)] border border-[var(--color-border)] outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]/20 transition-all placeholder:text-[var(--color-text-muted)]"
        />

        {/* Hint */}
        <p className="text-[10px] text-[var(--color-text-muted)] leading-tight">
          Appuyez sur <kbd className="font-mono bg-[var(--color-surface-offset)] border border-[var(--color-border)] rounded px-1">Entrée</kbd> pour confirmer
        </p>
      </div>
    </>
  )
}
