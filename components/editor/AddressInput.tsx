// components/editor/AddressInput.tsx
// Composant de saisie d'adresse postale avec autocomplétion BAN
// Machine d'état 4 phases : code postal → commune → rue → numéro
// API : https://api-adresse.data.gouv.fr (BAN — données publiques, sans clé)
//
// Comportements clés :
//   - Phase codePostal : dès 5 chiffres saisis → appel API → dropdown communes
//   - Phase commune    : filtre client, auto-sélection si 1 seul résultat
//   - Phase rue        : tolère "12 Rue de la Paix" (numéro en tête)
//                       si numéro détecté → skip phase numéro, confirmation directe
//                       auto-sélection si 1 seule rue correspond
//   - Phase numero     : saisie libre, confirmée par Entrée

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
  onDropdownHeightChange?: (height: number) => void
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const PHASES_LABELS: Record<Phase, string> = {
  codePostal: 'Code postal…',
  commune:    'Commune…',
  rue:        'Numéro + rue, ou juste la rue…',
  numero:     'Numéro…',
}

const DEBOUNCE_MS   = 250
const CP_MIN_LENGTH = 5

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Détecte si la saisie commence par un numéro suivi d'un espace ou de texte.
 * Ex : "12 Rue de la Paix" → { numero: "12", rueQuery: "Rue de la Paix" }
 *      "Rue de la Paix"    → { numero: "",   rueQuery: "Rue de la Paix" }
 *      "12bis Rue"         → { numero: "12bis", rueQuery: "Rue" }
 */
function parseRueInput(input: string): { numero: string; rueQuery: string } {
  const match = input.match(/^(\d+\s*(?:bis|ter|quater|quinquies|[a-zA-Z])?)[\s,]+(.+)$/i)
  if (match) {
    return { numero: match[1].trim(), rueQuery: match[2].trim() }
  }
  // Si que des chiffres (ex: "12" sans rue encore) → pas encore de séparation
  if (/^\d+$/.test(input.trim())) {
    return { numero: input.trim(), rueQuery: '' }
  }
  return { numero: '', rueQuery: input.trim() }
}

async function fetchCommunesByCP(codePostal: string): Promise<Suggestion[]> {
  const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(codePostal)}&type=municipality&limit=10`
  try {
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    const seen = new Set<string>()
    const results: Suggestion[] = []
    for (const feature of data.features ?? []) {
      const city: string     = feature.properties?.city ?? ''
      const postcode: string = feature.properties?.postcode ?? ''
      if (city && postcode === codePostal && !seen.has(city.toLowerCase())) {
        seen.add(city.toLowerCase())
        results.push({ label: city, value: city })
      }
    }
    return results
  } catch { return [] }
}

function filterCommunes(all: Suggestion[], query: string): Suggestion[] {
  if (!query.trim()) return all
  const q = query.toLowerCase()
  return all.filter(s => s.value.toLowerCase().startsWith(q))
}

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
  } catch { return [] }
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
  const [phase, setPhase]                 = useState<Phase>('codePostal')
  const [inputValue, setInputValue]       = useState('')
  const [address, setAddress]             = useState<AddressState>({ codePostal: '', commune: '', rue: '', numero: '' })
  const [suggestions, setSuggestions]     = useState<Suggestion[]>([])
  const [allCommunes, setAllCommunes]     = useState<Suggestion[]>([])
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [loading, setLoading]             = useState(false)
  const debounceRef                       = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dropdownRef                       = useRef<HTMLDivElement>(null)
  const addressRef                        = useRef(address)
  useEffect(() => { addressRef.current = address }, [address])

  // Notifie la hauteur du dropdown au parent
  useEffect(() => {
    if (!onDropdownHeightChange) return
    onDropdownHeightChange(suggestions.length > 0 ? suggestions.length * 32 + 8 : 0)
  }, [suggestions, onDropdownHeightChange])

  // Reset quand le composant est remonté (nouveau champ)
  useEffect(() => {
    setPhase('codePostal')
    setInputValue('')
    setAddress({ codePostal: '', commune: '', rue: '', numero: '' })
    setSuggestions([])
    setAllCommunes([])
    setSelectedIndex(-1)
  }, [])

  // ── Helper : construit et déclenche la confirmation finale ───────────────────

  const confirmAddress = useCallback((overrides: Partial<AddressState> = {}) => {
    const cur = { ...addressRef.current, ...overrides }
    const finalAddress = [cur.numero, cur.rue, cur.codePostal, cur.commune]
      .filter(Boolean).join(' ')
    onConfirm(finalAddress)
  }, [onConfirm])

  // ── Sélection d'une suggestion ───────────────────────────────────────────

  const selectSuggestion = useCallback((
    suggestion: Suggestion,
    currentPhase: Phase,
    /**
     * Numéro détecté dans la saisie (si l'utilisateur a tapé "12 Rue de la Paix")
     * S'il est renseigné, on skip la phase numéro et on confirme directement.
     */
    detectedNumero = '',
  ) => {
    if (currentPhase === 'commune') {
      setAddress(prev => ({ ...prev, commune: suggestion.value }))
      setInputValue('')
      setSuggestions([])
      setAllCommunes([])
      setPhase('rue')
      setTimeout(() => inputRef.current?.focus(), 30)

    } else if (currentPhase === 'rue') {
      const newAddress = {
        ...addressRef.current,
        rue: suggestion.value,
        ...(detectedNumero ? { numero: detectedNumero } : {}),
      }
      setAddress(newAddress)
      setSuggestions([])
      setInputValue('')

      if (detectedNumero) {
        // L'utilisateur avait déjà saisi le numéro → confirmation directe
        setTimeout(() => confirmAddress({ rue: suggestion.value, numero: detectedNumero }), 80)
      } else {
        // Pas de numéro détecté → on passe à la phase numéro normalement
        setPhase('numero')
        setTimeout(() => inputRef.current?.focus(), 30)
      }
    }
  }, [inputRef, confirmAddress])

  // ── Phase codePostal ──────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'codePostal') return
    const digits = inputValue.replace(/\D/g, '')
    if (digits.length < CP_MIN_LENGTH) { setSuggestions([]); setAllCommunes([]); return }

    if (debounceRef.current) clearTimeout(debounceRef.current)
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      const communes = await fetchCommunesByCP(digits)
      setAllCommunes(communes)
      setSuggestions(communes)
      setSelectedIndex(-1)
      setLoading(false)
      if (communes.length === 1) {
        setTimeout(() => {
          setAddress(prev => ({ ...prev, codePostal: digits, commune: communes[0].value }))
          setSuggestions([])
          setAllCommunes([])
          setInputValue('')
          setPhase('rue')
          setTimeout(() => inputRef.current?.focus(), 30)
        }, 600)
      } else {
        setAddress(prev => ({ ...prev, codePostal: digits }))
        setInputValue('')
        setPhase('commune')
        setTimeout(() => inputRef.current?.focus(), 30)
      }
    }, DEBOUNCE_MS)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue, phase])

  // ── Phase commune ───────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'commune') return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const filtered = filterCommunes(allCommunes, inputValue)
    setSuggestions(filtered)
    setSelectedIndex(-1)
    if (filtered.length === 1 && inputValue.trim().length > 0) {
      debounceRef.current = setTimeout(() => selectSuggestion(filtered[0], 'commune'), 150)
    }
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue, phase, allCommunes])

  // ── Phase rue ───────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'rue') return
    if (debounceRef.current) clearTimeout(debounceRef.current)

    // Parse : sépare un éventuel numéro en tête du nom de rue
    const { numero: detectedNumero, rueQuery } = parseRueInput(inputValue)

    // Pas encore de nom de rue saisi (l'utilisateur tape juste le numéro)
    if (!rueQuery) { setSuggestions([]); return }

    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      const results = await fetchRues(
        addressRef.current.commune,
        addressRef.current.codePostal,
        rueQuery,
      )
      setSuggestions(results)
      setSelectedIndex(-1)
      setLoading(false)
      // Auto-sélection si une seule rue correspond
      if (results.length === 1) {
        setTimeout(() => selectSuggestion(results[0], 'rue', detectedNumero), 150)
      }
    }, DEBOUNCE_MS)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue, phase])

  // ── advancePhase (Entrée manuelle) ──────────────────────────────────────

  const advancePhase = useCallback(() => {
    if (phase === 'codePostal') return // géré par useEffect

    if (phase === 'commune') {
      const candidate = selectedIndex >= 0 ? suggestions[selectedIndex] : suggestions[0]
      if (candidate) {
        selectSuggestion(candidate, 'commune')
      } else if (inputValue.trim()) {
        setAddress(prev => ({ ...prev, commune: inputValue.trim() }))
        setInputValue('')
        setSuggestions([])
        setPhase('rue')
      }

    } else if (phase === 'rue') {
      const { numero: detectedNumero, rueQuery } = parseRueInput(inputValue)
      const candidate = selectedIndex >= 0 ? suggestions[selectedIndex] : suggestions[0]
      if (candidate) {
        selectSuggestion(candidate, 'rue', detectedNumero)
      } else if (rueQuery || inputValue.trim()) {
        // L'utilisateur valide manuellement sans suggestion
        const rue = rueQuery || inputValue.trim()
        if (detectedNumero) {
          // Numéro en tête → skip phase numéro
          const newState = { ...addressRef.current, rue, numero: detectedNumero }
          setAddress(newState)
          confirmAddress({ rue, numero: detectedNumero })
        } else {
          setAddress(prev => ({ ...prev, rue }))
          setInputValue('')
          setSuggestions([])
          setPhase('numero')
        }
      }

    } else if (phase === 'numero') {
      const numero = inputValue.trim()
      confirmAddress({ numero })
    }
  }, [phase, inputValue, suggestions, selectedIndex, selectSuggestion, confirmAddress])

  // ── Clavier ─────────────────────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (selectedIndex >= 0 && suggestions.length > 0) {
        const { numero: detectedNumero } = parseRueInput(inputValue)
        selectSuggestion(suggestions[selectedIndex], phase, phase === 'rue' ? detectedNumero : '')
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
  }, [phase, inputValue, selectedIndex, suggestions, selectSuggestion, advancePhase, onEscape, onSkipNext, onSkipPrev])

  // ── Rendu ─────────────────────────────────────────────────────────────────

  const buildSummary = () => {
    const parts: string[] = []
    if (address.codePostal) parts.push(address.codePostal)
    if (address.commune)    parts.push(address.commune)
    if (address.rue)        parts.push(address.rue)
    return parts.join(' · ')
  }

  // Dans le dropdown rue, on met en valeur le nom de rue en gras et le numéro détecté en préfixe
  const { numero: previewNumero } = phase === 'rue' ? parseRueInput(inputValue) : { numero: '' }

  const summary = buildSummary()
  const PHASES: Phase[] = ['codePostal', 'commune', 'rue', 'numero']
  const phaseIndex = PHASES.indexOf(phase)

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
          maxWidth: 270,
        }}>
          {summary}
        </div>
      )}

      {/* Champ de saisie */}
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="text"
        inputMode={phase === 'codePostal' || phase === 'numero' ? 'numeric' : 'text'}
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

      {/* Indicateur de phase (4 segments) */}
      <div style={{ display: 'flex', gap: 3, marginTop: 2 }}>
        {PHASES.map((p, i) => (
          <div key={p} style={{
            height: 2,
            flex: 1,
            borderRadius: 1,
            background: i <= phaseIndex ? '#01696f' : '#e5e7eb',
            opacity:    i < phaseIndex ? 0.4 : i === phaseIndex ? 1 : 0.3,
          }} />
        ))}
      </div>

      {/* Dropdown suggestions */}
      {(suggestions.length > 0 || loading) && (
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
          {loading && suggestions.length === 0 && (
            <div style={{ padding: '6px 12px', fontSize: 11, color: '#9ca3af' }}>Recherche…</div>
          )}
          {suggestions.map((s, i) => (
            <div
              key={s.value}
              role="option"
              aria-selected={i === selectedIndex}
              onMouseDown={e => {
                e.preventDefault()
                selectSuggestion(s, phase, phase === 'rue' ? previewNumero : '')
              }}
              onMouseEnter={() => setSelectedIndex(i)}
              style={{
                padding: '6px 12px',
                fontSize: 13,
                cursor: 'pointer',
                background: i === selectedIndex ? 'rgba(1,105,111,0.10)' : 'transparent',
                color: 'var(--color-text, #28251d)',
                transition: 'background 0.1s',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {/* Affiche le numéro détecté en préfixe grisé si présent */}
              {phase === 'rue' && previewNumero && (
                <span style={{ color: '#9ca3af', fontSize: 12, flexShrink: 0 }}>
                  {previewNumero}
                </span>
              )}
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
