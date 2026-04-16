// components/editor/AddressInput.tsx
// Composant de saisie d'adresse postale avec autocomplétion BAN
// Machine d'état 4 phases : code postal → commune → rue → numéro
// API : https://api-adresse.data.gouv.fr (BAN — données publiques, sans clé)
//
// Comportement clé :
//   - Phase codePostal : dès 5 chiffres saisis → appel API immédiat → dropdown communes
//   - Phase commune    : si une seule suggestion → sélection auto → passage à la rue
//   - Phase rue        : si une seule suggestion après frappe → sélection auto → passage au n°

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

const DEBOUNCE_MS       = 250
const CP_MIN_LENGTH     = 5   // déclenche la recherche dès le 5e chiffre

// ─── Helpers API BAN ──────────────────────────────────────────────────────────

/** Retourne toutes les communes rattachées à un code postal (sans texte de recherche) */
async function fetchCommunesByCP(codePostal: string): Promise<Suggestion[]> {
  // On cherche avec le CP seul — l'API retourne les villes du code postal
  const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(codePostal)}&type=municipality&limit=10`
  try {
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    const seen = new Set<string>()
    const results: Suggestion[] = []
    for (const feature of data.features ?? []) {
      const city: string    = feature.properties?.city ?? ''
      const postcode: string = feature.properties?.postcode ?? ''
      // Ne garder que celles dont le code postal correspond exactement
      if (city && postcode === codePostal && !seen.has(city.toLowerCase())) {
        seen.add(city.toLowerCase())
        results.push({ label: city, value: city })
      }
    }
    return results
  } catch {
    return []
  }
}

/** Filtre les suggestions de communes selon le texte saisi (côté client) */
function filterCommunes(all: Suggestion[], query: string): Suggestion[] {
  if (!query.trim()) return all
  const q = query.toLowerCase()
  return all.filter(s => s.value.toLowerCase().startsWith(q))
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
  const [phase, setPhase]                   = useState<Phase>('codePostal')
  const [inputValue, setInputValue]         = useState('')
  const [address, setAddress]               = useState<AddressState>({ codePostal: '', commune: '', rue: '', numero: '' })
  const [suggestions, setSuggestions]       = useState<Suggestion[]>([])
  // Toutes les communes du CP (chargées une fois) — filtrées côté client ensuite
  const [allCommunes, setAllCommunes]       = useState<Suggestion[]>([])
  const [selectedIndex, setSelectedIndex]   = useState(-1)
  const [loading, setLoading]               = useState(false)
  const debounceRef                         = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dropdownRef                         = useRef<HTMLDivElement>(null)
  // Ref pour accéder à l'adresse courante dans les callbacks sans re-créer selectSuggestion
  const addressRef                          = useRef(address)
  useEffect(() => { addressRef.current = address }, [address])

  // Notifie la hauteur du dropdown au parent
  useEffect(() => {
    if (!onDropdownHeightChange) return
    onDropdownHeightChange(suggestions.length > 0 ? suggestions.length * 32 + 8 : 0)
  }, [suggestions, onDropdownHeightChange])

  // Reset l'état interne quand le composant est remonté (nouveau champ)
  useEffect(() => {
    setPhase('codePostal')
    setInputValue('')
    setAddress({ codePostal: '', commune: '', rue: '', numero: '' })
    setSuggestions([])
    setAllCommunes([])
    setSelectedIndex(-1)
  }, [])

  // ── Logique de sélection d'une suggestion ────────────────────────────────

  const selectSuggestion = useCallback((suggestion: Suggestion, currentPhase: Phase) => {
    if (currentPhase === 'commune') {
      setAddress(prev => ({ ...prev, commune: suggestion.value }))
      setInputValue('')
      setSuggestions([])
      setAllCommunes([])
      setPhase('rue')
      setTimeout(() => inputRef.current?.focus(), 30)
    } else if (currentPhase === 'rue') {
      setAddress(prev => ({ ...prev, rue: suggestion.value }))
      setInputValue('')
      setSuggestions([])
      setPhase('numero')
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [inputRef])

  // ── Phase codePostal : déclenche l'API dès 5 chiffres ────────────────────

  useEffect(() => {
    if (phase !== 'codePostal') return
    const digits = inputValue.replace(/\D/g, '')
    if (digits.length < CP_MIN_LENGTH) {
      setSuggestions([])
      setAllCommunes([])
      return
    }
    // CP complet : on charge les communes et on affiche le dropdown immédiatement
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      const communes = await fetchCommunesByCP(digits)
      setAllCommunes(communes)
      setSuggestions(communes)
      setSelectedIndex(-1)
      setLoading(false)
      // Si une seule commune → on bascule automatiquement en phase commune
      // avec le dropdown déjà ouvert, l'utilisateur n'a rien à saisir
      if (communes.length === 1) {
        // Pause courte pour que l'utilisateur voit le résultat
        setTimeout(() => {
          setAddress(prev => ({ ...prev, codePostal: digits, commune: communes[0].value }))
          setSuggestions([])
          setAllCommunes([])
          setInputValue('')
          setPhase('rue')
          setTimeout(() => inputRef.current?.focus(), 30)
        }, 600)
      } else {
        // Stocker le CP et passer en phase commune (le dropdown est déjà ouvert)
        setAddress(prev => ({ ...prev, codePostal: digits }))
        setInputValue('')
        setPhase('commune')
        setTimeout(() => inputRef.current?.focus(), 30)
      }
    }, DEBOUNCE_MS)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue, phase])

  // ── Phase commune : filtre côté client + auto-sélection si 1 seul résultat ─

  useEffect(() => {
    if (phase !== 'commune') return
    if (debounceRef.current) clearTimeout(debounceRef.current)

    const filtered = filterCommunes(allCommunes, inputValue)
    setSuggestions(filtered)
    setSelectedIndex(-1)

    // Auto-sélection si une seule commune correspond
    if (filtered.length === 1 && inputValue.trim().length > 0) {
      debounceRef.current = setTimeout(() => {
        selectSuggestion(filtered[0], 'commune')
      }, 150) // petite pause pour que l'utilisateur voie la sélection
    }

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue, phase, allCommunes])

  // ── Phase rue : debounce + appel API ────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'rue') return
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!inputValue.trim()) { setSuggestions([]); return }
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      const results = await fetchRues(addressRef.current.commune, addressRef.current.codePostal, inputValue)
      setSuggestions(results)
      setSelectedIndex(-1)
      setLoading(false)
      // Auto-sélection si une seule rue correspond
      if (results.length === 1) {
        setTimeout(() => selectSuggestion(results[0], 'rue'), 150)
      }
    }, DEBOUNCE_MS)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue, phase])

  // ── advancePhase (Entrée sans sélection dans le dropdown) ───────────────────

  const advancePhase = useCallback(() => {
    if (phase === 'codePostal') {
      // Rien à faire ici : le useEffect gère le passage automatique dès 5 chiffres
      return
    }
    if (phase === 'commune') {
      if (selectedIndex >= 0 && suggestions.length > 0) {
        selectSuggestion(suggestions[selectedIndex], 'commune')
      } else if (suggestions.length > 0) {
        selectSuggestion(suggestions[0], 'commune')
      } else if (inputValue.trim()) {
        setAddress(prev => ({ ...prev, commune: inputValue.trim() }))
        setInputValue('')
        setSuggestions([])
        setPhase('rue')
      }
    } else if (phase === 'rue') {
      if (selectedIndex >= 0 && suggestions.length > 0) {
        selectSuggestion(suggestions[selectedIndex], 'rue')
      } else if (suggestions.length > 0) {
        selectSuggestion(suggestions[0], 'rue')
      } else if (inputValue.trim()) {
        setAddress(prev => ({ ...prev, rue: inputValue.trim() }))
        setInputValue('')
        setSuggestions([])
        setPhase('numero')
      }
    } else if (phase === 'numero') {
      const numero = inputValue.trim()
      const cur = addressRef.current
      const finalAddress = [numero, cur.rue, cur.codePostal, cur.commune]
        .filter(Boolean).join(' ')
      onConfirm(finalAddress)
    }
  }, [phase, inputValue, suggestions, selectedIndex, selectSuggestion, onConfirm])

  // ── Clavier ─────────────────────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (selectedIndex >= 0 && suggestions.length > 0) {
        selectSuggestion(suggestions[selectedIndex], phase)
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
  }, [phase, selectedIndex, suggestions, selectSuggestion, advancePhase, onEscape, onSkipNext, onSkipPrev])

  // ── Résumé ──────────────────────────────────────────────────────────────────

  const buildSummary = () => {
    const parts: string[] = []
    if (address.codePostal) parts.push(address.codePostal)
    if (address.commune)    parts.push(address.commune)
    if (address.rue)        parts.push(address.rue)
    return parts.join(' · ')
  }

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
              onMouseDown={e => { e.preventDefault(); selectSuggestion(s, phase) }}
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
