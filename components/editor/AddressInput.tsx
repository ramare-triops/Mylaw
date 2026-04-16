// components/editor/AddressInput.tsx
// Composant de saisie d'adresse postale avec autocomplétion BAN
// Machine d'état 4 phases : code postal → commune → rue → numéro
// API : https://api-adresse.data.gouv.fr (BAN — données publiques, sans clé)

'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = 'codePostal' | 'commune' | 'rue' | 'numero'

interface Suggestion {
  label: string
  value: string
}

interface AddressState {
  codePostal: string
  commune: string
  rue: string
  numero: string
}

export interface AddressInputProps {
  onConfirm: (address: string) => void
  onEscape: () => void
  onSkipNext: () => void
  onSkipPrev: () => void
  inputRef: React.RefObject<HTMLInputElement | null>
  /** Callback pour notifier la hauteur du dropdown (0 si fermé) */
  onDropdownHeightChange?: (height: number) => void
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const PHASES_LABELS: Record<Phase, string> = {
  codePostal: 'Code postal…',
  commune:    'Commune…',
  rue:        'Rue, avenue…',
  numero:     'Numéro…',
}

const DEBOUNCE_MS = 300

// ─── Helpers API BAN ──────────────────────────────────────────────────────────

/** Recherche les communes pour un code postal donné + texte partiel */
async function fetchCommunes(codePostal: string, query: string): Promise<Suggestion[]> {
  if (!query.trim()) return []
  const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&postcode=${encodeURIComponent(codePostal)}&type=municipality&limit=6`
  try {
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    const seen = new Set<string>()
    const results: Suggestion[] = []
    for (const feature of data.features ?? []) {
      const city: string = feature.properties?.city ?? ''
      if (city && !seen.has(city.toLowerCase())) {
        seen.add(city.toLowerCase())
        results.push({ label: city, value: city })
      }
    }
    return results
  } catch {
    return []
  }
}

/** Recherche les rues pour une commune + texte partiel */
async function fetchRues(commune: string, codePostal: string, query: string): Promise<Suggestion[]> {
  if (!query.trim()) return []
  const q = `${query} ${commune}`
  const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&postcode=${encodeURIComponent(codePostal)}&type=street&limit=6`
  try {
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    const seen = new Set<string>()
    const results: Suggestion[] = []
    for (const feature of data.features ?? []) {
      const street: string = feature.properties?.street ?? feature.properties?.name ?? ''
      if (street && !seen.has(street.toLowerCase())) {
        seen.add(street.toLowerCase())
        results.push({ label: street, value: street })
      }
    }
    return results
  } catch {
    return []
  }
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function AddressInput({
  onConfirm,
  onEscape,
  onSkipNext,
  onSkipPrev,
  inputRef,
  onDropdownHeightChange,
}: AddressInputProps) {
  const [phase, setPhase]               = useState<Phase>('codePostal')
  const [inputValue, setInputValue]     = useState('')
  const [address, setAddress]           = useState<AddressState>({ codePostal: '', commune: '', rue: '', numero: '' })
  const [suggestions, setSuggestions]   = useState<Suggestion[]>([])
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [loading, setLoading]           = useState(false)
  const debounceRef                     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dropdownRef                     = useRef<HTMLDivElement>(null)

  // Notifie la hauteur du dropdown au parent
  useEffect(() => {
    if (!onDropdownHeightChange) return
    if (suggestions.length === 0) {
      onDropdownHeightChange(0)
    } else {
      // 32px par item + 8px padding
      onDropdownHeightChange(suggestions.length * 32 + 8)
    }
  }, [suggestions, onDropdownHeightChange])

  // Reset l'état interne quand le composant est remonté (nouveau champ)
  useEffect(() => {
    setPhase('codePostal')
    setInputValue('')
    setAddress({ codePostal: '', commune: '', rue: '', numero: '' })
    setSuggestions([])
    setSelectedIndex(-1)
  }, [])

  // Debounce + appel API selon la phase
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (phase === 'commune') {
      if (!inputValue.trim()) { setSuggestions([]); return }
      setLoading(true)
      debounceRef.current = setTimeout(async () => {
        const results = await fetchCommunes(address.codePostal, inputValue)
        setSuggestions(results)
        setSelectedIndex(-1)
        setLoading(false)
        // Autocomplétion automatique si une seule suggestion correspond exactement au préfixe
        if (results.length === 1) {
          const single = results[0].value
          if (single.toLowerCase().startsWith(inputValue.toLowerCase()) && single.toLowerCase() !== inputValue.toLowerCase()) {
            // Ne pas auto-compléter, laisser l'utilisateur valider
          }
        }
      }, DEBOUNCE_MS)
    } else if (phase === 'rue') {
      if (!inputValue.trim()) { setSuggestions([]); return }
      setLoading(true)
      debounceRef.current = setTimeout(async () => {
        const results = await fetchRues(address.commune, address.codePostal, inputValue)
        setSuggestions(results)
        setSelectedIndex(-1)
        setLoading(false)
      }, DEBOUNCE_MS)
    } else {
      setSuggestions([])
    }

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue, phase])

  const selectSuggestion = useCallback((suggestion: Suggestion) => {
    if (phase === 'commune') {
      setAddress(prev => ({ ...prev, commune: suggestion.value }))
      setInputValue('')
      setSuggestions([])
      setPhase('rue')
      setTimeout(() => inputRef.current?.focus(), 30)
    } else if (phase === 'rue') {
      setAddress(prev => ({ ...prev, rue: suggestion.value }))
      setInputValue('')
      setSuggestions([])
      setPhase('numero')
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [phase, inputRef])

  const advancePhase = useCallback(() => {
    if (phase === 'codePostal') {
      const cp = inputValue.trim()
      if (cp.length < 4) return
      setAddress(prev => ({ ...prev, codePostal: cp }))
      setInputValue('')
      setSuggestions([])
      setPhase('commune')
    } else if (phase === 'commune') {
      const idx = selectedIndex >= 0 ? selectedIndex : 0
      if (suggestions.length > 0) {
        selectSuggestion(suggestions[idx] ?? suggestions[0])
      } else if (inputValue.trim()) {
        setAddress(prev => ({ ...prev, commune: inputValue.trim() }))
        setInputValue('')
        setSuggestions([])
        setPhase('rue')
      }
    } else if (phase === 'rue') {
      const idx = selectedIndex >= 0 ? selectedIndex : 0
      if (suggestions.length > 0) {
        selectSuggestion(suggestions[idx] ?? suggestions[0])
      } else if (inputValue.trim()) {
        setAddress(prev => ({ ...prev, rue: inputValue.trim() }))
        setInputValue('')
        setSuggestions([])
        setPhase('numero')
      }
    } else if (phase === 'numero') {
      const numero = inputValue.trim()
      const finalAddress = [
        numero,
        address.rue,
        address.codePostal,
        address.commune,
      ].filter(Boolean).join(' ')
      onConfirm(finalAddress)
    }
  }, [phase, inputValue, suggestions, selectedIndex, address, selectSuggestion, onConfirm])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (selectedIndex >= 0 && suggestions.length > 0) {
        selectSuggestion(suggestions[selectedIndex])
      } else {
        advancePhase()
      }
      return
    }
    if (e.key === 'Escape') { e.preventDefault(); onEscape(); return }
    if (e.key === 'Tab') {
      e.preventDefault()
      if (e.shiftKey) onSkipPrev()
      else onSkipNext()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => Math.min(prev + 1, suggestions.length - 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => Math.max(prev - 1, -1))
      return
    }
    if (e.key === 'ArrowRight' && suggestions.length === 0) { e.preventDefault(); onSkipNext(); return }
    if (e.key === 'ArrowLeft'  && suggestions.length === 0) { e.preventDefault(); onSkipPrev(); return }
  }, [selectedIndex, suggestions, selectSuggestion, advancePhase, onEscape, onSkipNext, onSkipPrev])

  // Résumé de l'adresse en cours de construction
  const buildSummary = () => {
    const parts: string[] = []
    if (address.codePostal) parts.push(address.codePostal)
    if (address.commune)    parts.push(address.commune)
    if (address.rue)        parts.push(address.rue)
    return parts.join(' · ')
  }

  const summary = buildSummary()

  return (
    <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
      {/* Résumé des étapes précédentes */}
      {summary && (
        <div style={{
          fontSize: 10,
          color: '#01696f',
          marginBottom: 2,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: 260,
        }}>
          {summary}
        </div>
      )}

      {/* Champ de saisie */}
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="text"
        value={inputValue}
        onChange={e => { setInputValue(e.target.value); setSelectedIndex(-1) }}
        onKeyDown={handleKeyDown}
        placeholder={PHASES_LABELS[phase]}
        autoComplete="off" autoCorrect="off" spellCheck={false}
        style={{
          width: '100%',
          border: 'none',
          outline: 'none',
          background: 'transparent',
          fontSize: 13,
          color: 'var(--color-text, #28251d)',
          caretColor: '#01696f',
        }}
        aria-label={PHASES_LABELS[phase]}
        aria-autocomplete="list"
        aria-expanded={suggestions.length > 0}
      />

      {/* Indicateur de phase */}
      <div style={{
        display: 'flex',
        gap: 3,
        marginTop: 2,
      }}>
        {(['codePostal', 'commune', 'rue', 'numero'] as Phase[]).map((p, i) => (
          <div key={p} style={{
            height: 2,
            flex: 1,
            borderRadius: 1,
            background: p === phase
              ? '#01696f'
              : (['codePostal', 'commune', 'rue', 'numero'] as Phase[]).indexOf(phase) > i
                ? '#01696f'
                : '#e5e7eb',
            opacity: p === phase ? 1 : (['codePostal', 'commune', 'rue', 'numero'] as Phase[]).indexOf(phase) > i ? 0.4 : 0.3,
          }} />
        ))}
      </div>

      {/* Dropdown suggestions */}
      {suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          role="listbox"
          style={{
            position: 'absolute',
            top: '100%',
            left: -10,
            right: -10,
            marginTop: 6,
            background: 'var(--color-surface, #fff)',
            border: '1.5px solid #01696f',
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(1,105,111,0.15)',
            zIndex: 10001,
            overflow: 'hidden',
            padding: '4px 0',
          }}
        >
          {loading && (
            <div style={{ padding: '6px 12px', fontSize: 11, color: '#9ca3af' }}>Recherche…</div>
          )}
          {suggestions.map((s, i) => (
            <div
              key={s.value}
              role="option"
              aria-selected={i === selectedIndex}
              onMouseDown={e => { e.preventDefault(); selectSuggestion(s) }}
              onMouseEnter={() => setSelectedIndex(i)}
              style={{
                padding: '6px 12px',
                fontSize: 13,
                cursor: 'pointer',
                background: i === selectedIndex ? 'rgba(1,105,111,0.10)' : 'transparent',
                color: 'var(--color-text, #28251d)',
                transition: 'background 0.1s',
              }}
            >
              {s.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
