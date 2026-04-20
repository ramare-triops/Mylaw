'use client';

/**
 * StructuredAddressFields
 *
 * Saisie d'adresse postale en 5 sous-champs structurés avec auto-complétion
 * BAN (Base Adresse Nationale, https://api-adresse.data.gouv.fr — données
 * publiques, pas de clé API) et cascade automatique de focus :
 *
 *   1. Code postal (5 chiffres)          → Entrée = passage à la commune
 *                                          auto-sélection si un seul résultat
 *   2. Commune                            → dès que 1 seule correspondance,
 *                                          auto-sélection + passage au N°
 *   3. Numéro de voie                     → Entrée/Tab = passage au suffixe
 *   4. Suffixe (bis/ter…)                 → Entrée/Tab = passage à la rue
 *   5. Rue                                → dès que 1 seule correspondance,
 *                                          auto-sélection
 *
 * Les cinq sous-champs sont renvoyés séparément à `onChange`, ce qui permet
 * de les stocker de manière structurée sur l'entité Contact et de les
 * réutiliser individuellement dans les variables de document.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StructuredAddress {
  addressNumber?: string;
  addressNumberSuffix?: string;
  addressStreet?: string;
  addressComplement?: string;
  addressPostalCode?: string;
  addressCity?: string;
}

interface Props {
  value: StructuredAddress;
  onChange: (patch: StructuredAddress) => void;
}

interface Suggestion {
  label: string;
  value: string;
}

const STOP_WORDS =
  /^(rue|avenue|allée|impasse|chemin|route|boulevard|place|domaine|hameau|lieu[\s-]dit|la|le|les|de|du|des|l'|d'|l’|d’)\s+/i;

const SUFFIX_OPTIONS = ['', 'bis', 'ter', 'quater', 'quinquies'];

function rueSignificantPart(s: string): string {
  return s.toLowerCase().replace(STOP_WORDS, '').trim();
}

function filterByPrefix(results: Suggestion[], query: string): Suggestion[] {
  if (!query.trim()) return results;
  const q = query.toLowerCase().trim();
  return results.filter((s) => s.value.toLowerCase().startsWith(q));
}

function filterRues(results: Suggestion[], query: string): Suggestion[] {
  if (!query.trim()) return results;
  const q = query.toLowerCase().trim();
  return results.filter((s) => {
    const full = s.value.toLowerCase();
    if (full.startsWith(q)) return true;
    const sig = rueSignificantPart(full);
    if (sig.startsWith(q)) return true;
    return false;
  });
}

async function fetchCommunesByCP(codePostal: string): Promise<Suggestion[]> {
  const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(
    codePostal
  )}&type=municipality&limit=20`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const seen = new Set<string>();
    const results: Suggestion[] = [];
    for (const feature of data.features ?? []) {
      const city: string = feature.properties?.city ?? '';
      const postcode: string = feature.properties?.postcode ?? '';
      if (city && postcode === codePostal && !seen.has(city.toLowerCase())) {
        seen.add(city.toLowerCase());
        results.push({ label: city, value: city });
      }
    }
    return results;
  } catch {
    return [];
  }
}

async function fetchRues(
  commune: string,
  codePostal: string,
  query: string
): Promise<Suggestion[]> {
  if (!query.trim()) return [];
  const q = `${query} ${commune}`;
  const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(
    q
  )}&postcode=${encodeURIComponent(codePostal)}&type=street&limit=8`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const seen = new Set<string>();
    const results: Suggestion[] = [];
    for (const feature of data.features ?? []) {
      const street: string =
        feature.properties?.street ?? feature.properties?.name ?? '';
      if (street && !seen.has(street.toLowerCase())) {
        seen.add(street.toLowerCase());
        results.push({ label: street, value: street });
      }
    }
    return results;
  } catch {
    return [];
  }
}

export function StructuredAddressFields({ value, onChange }: Props) {
  // ─── Refs pour la gestion du focus en cascade ───────────────────────────
  const cpRef = useRef<HTMLInputElement>(null);
  const cityRef = useRef<HTMLInputElement>(null);
  const numberRef = useRef<HTMLInputElement>(null);
  const suffixRef = useRef<HTMLSelectElement>(null);
  const streetRef = useRef<HTMLInputElement>(null);

  // ─── Etats suggestions ──────────────────────────────────────────────────
  const [communes, setCommunes] = useState<Suggestion[]>([]);
  const [streets, setStreets] = useState<Suggestion[]>([]);
  const [cpLoading, setCpLoading] = useState(false);
  const [streetLoading, setStreetLoading] = useState(false);
  const [cityFocused, setCityFocused] = useState(false);
  const [streetFocused, setStreetFocused] = useState(false);
  /** Index de la suggestion highlightée (pour navigation clavier). */
  const [cityHighlight, setCityHighlight] = useState(-1);
  const [streetHighlight, setStreetHighlight] = useState(-1);

  const cpDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streetDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoCompleteDebounce = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  /** Empêche l'auto-complétion commune de se re-déclencher après acceptation. */
  const justAcceptedCity = useRef(false);
  const justAcceptedStreet = useRef(false);

  // ─── CP change → fetch communes ─────────────────────────────────────────
  useEffect(() => {
    const cp = (value.addressPostalCode ?? '').replace(/\D/g, '');
    if (cp.length < 5) {
      setCommunes([]);
      return;
    }
    if (cpDebounce.current) clearTimeout(cpDebounce.current);
    setCpLoading(true);
    cpDebounce.current = setTimeout(async () => {
      const list = await fetchCommunesByCP(cp);
      setCommunes(list);
      setCpLoading(false);
      // Auto-sélection si une seule commune pour ce CP et pas encore de ville choisie
      if (list.length === 1 && !value.addressCity) {
        justAcceptedCity.current = true;
        onChange({ addressCity: list[0].value });
        // Focus automatique sur le numéro
        setTimeout(() => numberRef.current?.focus(), 40);
      }
    }, 250);
    return () => {
      if (cpDebounce.current) clearTimeout(cpDebounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.addressPostalCode]);

  // ─── Auto-complétion de la commune dès unicité ──────────────────────────
  useEffect(() => {
    if (justAcceptedCity.current) {
      justAcceptedCity.current = false;
      return;
    }
    if (!cityFocused) return;
    const q = (value.addressCity ?? '').trim();
    if (!q) return;
    const matches = filterByPrefix(communes, q);
    if (
      matches.length === 1 &&
      matches[0].value.toLowerCase() !== q.toLowerCase()
    ) {
      if (autoCompleteDebounce.current)
        clearTimeout(autoCompleteDebounce.current);
      autoCompleteDebounce.current = setTimeout(() => {
        justAcceptedCity.current = true;
        onChange({ addressCity: matches[0].value });
        setCommunes([]);
        setCityHighlight(-1);
        setTimeout(() => numberRef.current?.focus(), 40);
      }, 180);
    }
    return () => {
      if (autoCompleteDebounce.current)
        clearTimeout(autoCompleteDebounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.addressCity, communes, cityFocused]);

  // ─── Street query → fetch streets ───────────────────────────────────────
  useEffect(() => {
    const q = (value.addressStreet ?? '').trim();
    const cp = (value.addressPostalCode ?? '').trim();
    const city = (value.addressCity ?? '').trim();
    if (!q || q.length < 2 || !cp || !city || !streetFocused) {
      setStreets([]);
      return;
    }
    if (justAcceptedStreet.current) return;
    if (streetDebounce.current) clearTimeout(streetDebounce.current);
    setStreetLoading(true);
    streetDebounce.current = setTimeout(async () => {
      const raw = await fetchRues(city, cp, q);
      const filtered = filterRues(raw, q);
      const displayed = filtered.length > 0 ? filtered : raw;
      setStreets(displayed);
      setStreetLoading(false);
      // Auto-sélection si exactement 1 correspondance (par préfixe)
      if (filtered.length === 1) {
        const picked = filtered[0].value;
        if (picked.toLowerCase() !== q.toLowerCase()) {
          justAcceptedStreet.current = true;
          onChange({ addressStreet: picked });
          setStreets([]);
          setStreetHighlight(-1);
        }
      }
    }, 220);
    return () => {
      if (streetDebounce.current) clearTimeout(streetDebounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.addressStreet, value.addressPostalCode, value.addressCity, streetFocused]);

  // ─── Helpers ────────────────────────────────────────────────────────────
  const pickCommune = useCallback(
    (city: string) => {
      justAcceptedCity.current = true;
      onChange({ addressCity: city });
      setCommunes([]);
      setCityHighlight(-1);
      setTimeout(() => numberRef.current?.focus(), 30);
    },
    [onChange]
  );

  const pickStreet = useCallback(
    (street: string) => {
      justAcceptedStreet.current = true;
      onChange({ addressStreet: street });
      setStreets([]);
      setStreetHighlight(-1);
    },
    [onChange]
  );

  // ─── Handlers clavier par champ ─────────────────────────────────────────
  const onCpKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      cityRef.current?.focus();
    }
  };

  const visibleCommunes = filterByPrefix(communes, value.addressCity ?? '');

  const onCityKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCityHighlight((i) => Math.min(i + 1, visibleCommunes.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCityHighlight((i) => Math.max(i - 1, -1));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (cityHighlight >= 0 && visibleCommunes[cityHighlight]) {
        pickCommune(visibleCommunes[cityHighlight].value);
      } else if (visibleCommunes.length > 0) {
        pickCommune(visibleCommunes[0].value);
      } else if ((value.addressCity ?? '').trim()) {
        numberRef.current?.focus();
      }
    }
  };

  const onNumberKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      if (e.key === 'Enter') e.preventDefault();
      setTimeout(() => suffixRef.current?.focus(), 0);
    }
  };

  const onSuffixKeyDown = (e: React.KeyboardEvent<HTMLSelectElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      streetRef.current?.focus();
    }
  };

  const onStreetKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setStreetHighlight((i) => Math.min(i + 1, streets.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setStreetHighlight((i) => Math.max(i - 1, -1));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (streetHighlight >= 0 && streets[streetHighlight]) {
        pickStreet(streets[streetHighlight].value);
      } else if (streets.length > 0) {
        pickStreet(streets[0].value);
      }
    }
  };

  // Réinitialise les flags d'acceptation quand l'utilisateur retape
  function onCityChange(v: string) {
    justAcceptedCity.current = false;
    onChange({ addressCity: v });
  }
  function onStreetChange(v: string) {
    justAcceptedStreet.current = false;
    onChange({ addressStreet: v });
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Ligne 1 : CP + Commune */}
      <div className="grid grid-cols-[100px_1fr] gap-2 relative">
        <SubField label="Code postal">
          <input
            ref={cpRef}
            type="text"
            inputMode="numeric"
            maxLength={5}
            value={value.addressPostalCode ?? ''}
            onChange={(e) =>
              onChange({
                addressPostalCode: e.target.value.replace(/\D/g, ''),
              })
            }
            onKeyDown={onCpKeyDown}
            placeholder="75000"
            className={inputCls}
            autoComplete="off"
          />
        </SubField>
        <SubField label="Commune">
          <div className="relative">
            <input
              ref={cityRef}
              type="text"
              value={value.addressCity ?? ''}
              onChange={(e) => onCityChange(e.target.value)}
              onFocus={() => setCityFocused(true)}
              onBlur={() => setTimeout(() => setCityFocused(false), 150)}
              onKeyDown={onCityKeyDown}
              placeholder="Paris"
              className={inputCls}
              autoComplete="off"
              disabled={!value.addressPostalCode || value.addressPostalCode.length < 5}
            />
            {cpLoading && (
              <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-[var(--color-text-muted)]" />
            )}
          </div>
        </SubField>
        {cityFocused && visibleCommunes.length > 0 && (
          <div className="absolute left-[108px] right-0 top-full mt-1 z-20 rounded-md bg-[var(--color-surface)] border border-[var(--color-primary)] shadow-lg py-1 max-h-56 overflow-auto">
            {visibleCommunes.map((s, i) => (
              <button
                key={s.value}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pickCommune(s.value);
                }}
                onMouseEnter={() => setCityHighlight(i)}
                className={cn(
                  'w-full text-left px-3 py-1.5 text-sm',
                  i === cityHighlight
                    ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]'
                    : 'hover:bg-[var(--color-surface-raised)]'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Ligne 2 : N° + Bis/Ter + Rue */}
      <div className="grid grid-cols-[70px_90px_1fr] gap-2 relative">
        <SubField label="N°">
          <input
            ref={numberRef}
            type="text"
            value={value.addressNumber ?? ''}
            onChange={(e) =>
              onChange({
                addressNumber: e.target.value.replace(/[^\d]/g, ''),
              })
            }
            onKeyDown={onNumberKeyDown}
            placeholder="12"
            className={inputCls}
            autoComplete="off"
            inputMode="numeric"
          />
        </SubField>
        <SubField label="Suffixe">
          <select
            ref={suffixRef}
            value={value.addressNumberSuffix ?? ''}
            onChange={(e) =>
              onChange({ addressNumberSuffix: e.target.value || undefined })
            }
            onKeyDown={onSuffixKeyDown}
            className={inputCls}
          >
            {SUFFIX_OPTIONS.map((opt) => (
              <option key={opt || 'none'} value={opt}>
                {opt ? opt : '—'}
              </option>
            ))}
          </select>
        </SubField>
        <SubField label="Rue / voie">
          <div className="relative">
            <input
              ref={streetRef}
              type="text"
              value={value.addressStreet ?? ''}
              onChange={(e) => onStreetChange(e.target.value)}
              onFocus={() => setStreetFocused(true)}
              onBlur={() => setTimeout(() => setStreetFocused(false), 150)}
              onKeyDown={onStreetKeyDown}
              placeholder="Rue de la Paix"
              className={inputCls}
              autoComplete="off"
              disabled={
                !value.addressPostalCode?.trim() || !value.addressCity?.trim()
              }
            />
            {streetLoading && (
              <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-[var(--color-text-muted)]" />
            )}
          </div>
        </SubField>
        {streetFocused && streets.length > 0 && (
          <div className="absolute left-[172px] right-0 top-full mt-1 z-20 rounded-md bg-[var(--color-surface)] border border-[var(--color-primary)] shadow-lg py-1 max-h-56 overflow-auto">
            {streets.map((s, i) => (
              <button
                key={s.value}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pickStreet(s.value);
                }}
                onMouseEnter={() => setStreetHighlight(i)}
                className={cn(
                  'w-full text-left px-3 py-1.5 text-sm',
                  i === streetHighlight
                    ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]'
                    : 'hover:bg-[var(--color-surface-raised)]'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <SubField label="Complément (bâtiment, étage…)">
        <input
          type="text"
          value={value.addressComplement ?? ''}
          onChange={(e) => onChange({ addressComplement: e.target.value })}
          placeholder="Bâtiment A, 3e étage"
          className={inputCls}
          autoComplete="off"
        />
      </SubField>
    </div>
  );
}

function SubField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputCls = cn(
  'w-full px-3 py-2 text-sm rounded-md',
  'bg-[var(--color-surface-raised)] border border-[var(--color-border)]',
  'text-[var(--color-text)]',
  'focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]',
  'disabled:opacity-50 disabled:cursor-not-allowed'
);

/** Construit la chaîne d'adresse consolidée depuis les champs structurés. */
export function composeAddress(addr: StructuredAddress): string {
  const numWithSuffix = [addr.addressNumber, addr.addressNumberSuffix]
    .filter(Boolean)
    .join(' ')
    .trim();
  const line1 = [numWithSuffix, addr.addressStreet].filter(Boolean).join(' ').trim();
  const line2 = [addr.addressPostalCode, addr.addressCity?.toUpperCase()]
    .filter(Boolean)
    .join(' ')
    .trim();
  return [line1, addr.addressComplement, line2].filter(Boolean).join(', ').trim();
}
