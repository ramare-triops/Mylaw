'use client';

/**
 * StructuredAddressFields
 *
 * Saisie d'adresse postale en 4 champs structurés avec auto-complétion BAN
 * (Base Adresse Nationale, https://api-adresse.data.gouv.fr — données
 * publiques, pas de clé API).
 *
 * Cascade :
 *   1. Code postal (5 chiffres)  → propose la liste des communes
 *   2. Commune (auto-sélectionnée si une seule)
 *   3. Numéro de voie (libre, peut contenir bis/ter)
 *   4. Rue (suggestions dépendantes du CP + commune)
 *
 * Les quatre sous-champs sont renvoyés séparément à `onChange`, ce qui permet
 * de les stocker de manière structurée sur l'entité Contact et de les
 * réutiliser individuellement dans les variables de document.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StructuredAddress {
  addressNumber?: string;
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

function rueSignificantPart(s: string): string {
  return s.toLowerCase().replace(STOP_WORDS, '').trim();
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
  )}&type=municipality&limit=10`;
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
  const [cpSuggestions, setCpSuggestions] = useState<Suggestion[]>([]);
  const [streetSuggestions, setStreetSuggestions] = useState<Suggestion[]>([]);
  const [cpLoading, setCpLoading] = useState(false);
  const [streetLoading, setStreetLoading] = useState(false);
  const [cpFocused, setCpFocused] = useState(false);
  const [streetFocused, setStreetFocused] = useState(false);

  const cpDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streetDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── CP change → fetch communes ─────────────────────────────────────────
  useEffect(() => {
    const cp = (value.addressPostalCode ?? '').replace(/\D/g, '');
    if (cp.length < 5) {
      setCpSuggestions([]);
      return;
    }
    if (cpDebounce.current) clearTimeout(cpDebounce.current);
    setCpLoading(true);
    cpDebounce.current = setTimeout(async () => {
      const communes = await fetchCommunesByCP(cp);
      setCpSuggestions(communes);
      setCpLoading(false);
      // Auto-sélection si une seule commune pour ce CP et pas encore de ville
      if (communes.length === 1 && !value.addressCity) {
        onChange({ addressCity: communes[0].value });
      }
    }, 250);
    return () => {
      if (cpDebounce.current) clearTimeout(cpDebounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.addressPostalCode]);

  // ─── Street query change → fetch streets ────────────────────────────────
  useEffect(() => {
    const q = (value.addressStreet ?? '').trim();
    const cp = (value.addressPostalCode ?? '').trim();
    const city = (value.addressCity ?? '').trim();
    if (!q || q.length < 2 || !cp || !city || !streetFocused) {
      setStreetSuggestions([]);
      return;
    }
    if (streetDebounce.current) clearTimeout(streetDebounce.current);
    setStreetLoading(true);
    streetDebounce.current = setTimeout(async () => {
      const raw = await fetchRues(city, cp, q);
      const filtered = filterRues(raw, q);
      setStreetSuggestions(filtered.length > 0 ? filtered : raw);
      setStreetLoading(false);
    }, 250);
    return () => {
      if (streetDebounce.current) clearTimeout(streetDebounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.addressStreet, value.addressPostalCode, value.addressCity, streetFocused]);

  const pickCommune = useCallback(
    (city: string) => {
      onChange({ addressCity: city });
      setCpSuggestions([]);
      setCpFocused(false);
    },
    [onChange]
  );

  const pickStreet = useCallback(
    (street: string) => {
      onChange({ addressStreet: street });
      setStreetSuggestions([]);
      setStreetFocused(false);
    },
    [onChange]
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[90px_1fr] gap-2 relative">
        <SubField label="Code postal">
          <input
            type="text"
            inputMode="numeric"
            maxLength={5}
            value={value.addressPostalCode ?? ''}
            onChange={(e) =>
              onChange({
                addressPostalCode: e.target.value.replace(/\D/g, ''),
              })
            }
            onFocus={() => setCpFocused(true)}
            onBlur={() => setTimeout(() => setCpFocused(false), 150)}
            placeholder="75000"
            className={inputCls}
            autoComplete="off"
          />
        </SubField>
        <SubField label="Commune">
          <div className="relative">
            <input
              type="text"
              value={value.addressCity ?? ''}
              onChange={(e) => onChange({ addressCity: e.target.value })}
              onFocus={() => setCpFocused(true)}
              onBlur={() => setTimeout(() => setCpFocused(false), 150)}
              placeholder="Paris"
              className={inputCls}
              autoComplete="off"
            />
            {cpLoading && (
              <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-[var(--color-text-muted)]" />
            )}
          </div>
        </SubField>
        {cpFocused && cpSuggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1 z-20 rounded-md bg-[var(--color-surface)] border border-[var(--color-primary)] shadow-lg py-1 max-h-56 overflow-auto">
            {cpSuggestions.map((s) => (
              <button
                key={s.value}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pickCommune(s.value);
                }}
                className={cn(
                  'w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--color-surface-raised)]',
                  s.value === value.addressCity &&
                    'text-[var(--color-primary)] font-medium'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-[90px_1fr] gap-2 relative">
        <SubField label="N°">
          <input
            type="text"
            value={value.addressNumber ?? ''}
            onChange={(e) => onChange({ addressNumber: e.target.value })}
            placeholder="12 bis"
            className={inputCls}
            autoComplete="off"
          />
        </SubField>
        <SubField label="Rue / voie">
          <div className="relative">
            <input
              type="text"
              value={value.addressStreet ?? ''}
              onChange={(e) => onChange({ addressStreet: e.target.value })}
              onFocus={() => setStreetFocused(true)}
              onBlur={() => setTimeout(() => setStreetFocused(false), 150)}
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
        {streetFocused && streetSuggestions.length > 0 && (
          <div className="absolute left-[98px] right-0 top-full mt-1 z-20 rounded-md bg-[var(--color-surface)] border border-[var(--color-primary)] shadow-lg py-1 max-h-56 overflow-auto">
            {streetSuggestions.map((s) => (
              <button
                key={s.value}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pickStreet(s.value);
                }}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--color-surface-raised)]"
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

/** Construit la chaîne d'adresse consolidée depuis les 4 sous-champs. */
export function composeAddress(addr: StructuredAddress): string {
  const line1 = [addr.addressNumber, addr.addressStreet].filter(Boolean).join(' ').trim();
  const line2 = [addr.addressPostalCode, addr.addressCity?.toUpperCase()]
    .filter(Boolean)
    .join(' ')
    .trim();
  return [line1, addr.addressComplement, line2].filter(Boolean).join(', ').trim();
}
