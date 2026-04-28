'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Calculator,
  Plus,
  Trash2,
  Save,
  FileDown,
  FileSpreadsheet,
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  Copy,
  ArrowDownUp,
} from 'lucide-react';
import { db } from '@/lib/db';
import { cn } from '@/lib/utils';
import {
  computeAll,
  type InterestItemInput,
  type InterestComputationResult,
} from '@/lib/legal-interest-calc';
import { LEGAL_INTEREST_RATES } from '@/lib/legal-interest-rates';
import {
  exportInterestPdf,
  exportInterestXlsx,
} from '@/lib/legal-interest-export';
import type {
  Dossier,
  InterestCalculation,
  InterestItemRecord,
  InterestResultSnapshot,
  CreditorType,
} from '@/types';

interface Props {
  dossier?: Dossier;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);
}

const fmtMoney = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
});

interface DraftItem {
  id: string;
  label: string;
  amount: string;
  startDate: string;
  endDate: string;
}

function emptyDraft(): DraftItem {
  const today = ymd(new Date());
  return { id: uuid(), label: '', amount: '', startDate: today, endDate: today };
}

function recordToDraft(r: InterestItemRecord): DraftItem {
  return {
    id: r.id,
    label: r.label,
    amount: String(r.amount),
    startDate: ymd(new Date(r.startDate)),
    endDate: ymd(new Date(r.endDate)),
  };
}

function draftsToInputs(drafts: DraftItem[]): InterestItemInput[] {
  return drafts
    .filter((d) => d.amount && d.startDate && d.endDate)
    .map((d) => ({
      id: d.id,
      label: d.label.trim() || 'Poste',
      amount: Number(d.amount.replace(',', '.')) || 0,
      startDate: parseYmd(d.startDate),
      endDate: parseYmd(d.endDate),
    }));
}

function resultToSnapshot(r: InterestComputationResult): InterestResultSnapshot {
  return {
    computedAt: r.computedAt,
    creditorType: r.creditorType,
    items: r.items.map((it) => ({
      itemId: it.itemId,
      label: it.label,
      amount: it.amount,
      startDate: it.startDate,
      endDate: it.endDate,
      segments: it.segments.map((s) => ({
        from: s.from,
        to: s.to,
        year: s.year,
        semester: s.semester,
        rate: s.rate,
        days: s.days,
        capital: s.capital,
        capitalizedAfter: s.capitalizedAfter,
        interest: s.interest,
      })),
      interest: it.interest,
      total: it.total,
      extrapolated: it.extrapolated,
    })),
    totalCapital: r.totalCapital,
    totalInterest: r.totalInterest,
    totalAmount: r.totalAmount,
    hasExtrapolation: r.hasExtrapolation,
  };
}

function snapshotToResult(s: InterestResultSnapshot): InterestComputationResult {
  return {
    computedAt: new Date(s.computedAt),
    creditorType: s.creditorType,
    items: s.items.map((it) => ({
      itemId: it.itemId,
      label: it.label,
      amount: it.amount,
      startDate: new Date(it.startDate),
      endDate: new Date(it.endDate),
      segments: it.segments.map((seg) => ({
        from: new Date(seg.from),
        to: new Date(seg.to),
        year: seg.year,
        semester: seg.semester,
        rate: seg.rate,
        days: seg.days,
        capital: seg.capital ?? it.amount,
        capitalizedAfter: seg.capitalizedAfter,
        interest: seg.interest,
        extrapolated: false,
      })),
      interest: it.interest,
      total: it.total,
      extrapolated: it.extrapolated,
    })),
    totalCapital: s.totalCapital,
    totalInterest: s.totalInterest,
    totalAmount: s.totalAmount,
    hasExtrapolation: s.hasExtrapolation,
  };
}

// ─── Composant principal ──────────────────────────────────────────────────

export function LegalInterestCalculator({ dossier }: Props) {
  const [openId, setOpenId] = useState<number | null>(null);

  if (openId !== null) {
    return (
      <CalculatorDetail
        key={openId}
        dossier={dossier}
        calcId={openId}
        onBack={() => setOpenId(null)}
      />
    );
  }

  return <CalculatorList dossier={dossier} onOpen={setOpenId} />;
}

// ─── Liste des calculs enregistrés ────────────────────────────────────────

function CalculatorList({
  dossier,
  onOpen,
}: {
  dossier?: Dossier;
  onOpen: (id: number) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState('');

  const savedCalcs = useLiveQuery<InterestCalculation[]>(
    () =>
      dossier?.id
        ? db.interestCalculations.where('dossierId').equals(dossier.id).toArray()
        : db.interestCalculations.toArray(),
    [dossier?.id],
  );

  const sorted = useMemo(
    () =>
      (savedCalcs ?? [])
        .slice()
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        ),
    [savedCalcs],
  );

  async function createCalc() {
    const name = draftName.trim() || `Calcul du ${new Date().toLocaleDateString('fr-FR')}`;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const payload: InterestCalculation = {
      name,
      dossierId: dossier?.id,
      creditorType: 'particulier',
      items: [
        {
          id: uuid(),
          label: '',
          amount: 0,
          startDate: today,
          endDate: today,
        },
      ],
      capitalize: false,
      ratesSnapshot: LEGAL_INTEREST_RATES.map((r) => ({
        year: r.year,
        semester: r.semester,
        particulier: r.particulier,
        professionnel: r.professionnel,
      })),
      createdAt: now,
      updatedAt: now,
    };
    const id = await db.interestCalculations.add(payload);
    setCreating(false);
    setDraftName('');
    onOpen(Number(id));
  }

  async function deleteCalc(id: number | undefined) {
    if (!id) return;
    if (!confirm('Supprimer définitivement ce calcul enregistré ?')) return;
    await db.interestCalculations.delete(id);
  }

  return (
    <div className="px-6 py-6">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Calculator size={18} style={{ color: 'var(--color-primary)' }} />
          <h2
            className="text-base font-semibold"
            style={{ color: 'var(--color-text)' }}
          >
            Calculs d'intérêts au taux légal
          </h2>
        </div>
        <button
          onClick={() => {
            setCreating(true);
            setDraftName('');
          }}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md font-medium text-white',
            'bg-[var(--color-primary)] hover:opacity-90',
          )}
        >
          <Plus size={13} /> Nouveau calcul
        </button>
      </div>

      {creating && (
        <div
          className="mb-4 rounded-md border p-3 flex items-center gap-2 flex-wrap"
          style={{
            borderColor: 'var(--color-primary)',
            background: 'oklch(from var(--color-primary) l c h / 0.04)',
          }}
        >
          <input
            type="text"
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void createCalc();
              if (e.key === 'Escape') {
                setCreating(false);
                setDraftName('');
              }
            }}
            placeholder="Ex. Indemnité d'occupation, Prestation compensatoire…"
            className={cn(
              'flex-1 min-w-[260px] px-3 py-1.5 text-sm rounded-md',
              'bg-[var(--color-surface)] border border-[var(--color-border)]',
              'text-[var(--color-text)]',
              'focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]',
            )}
          />
          <button
            onClick={createCalc}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md font-medium text-white',
              'bg-[var(--color-primary)] hover:opacity-90',
            )}
          >
            Créer
          </button>
          <button
            onClick={() => {
              setCreating(false);
              setDraftName('');
            }}
            className={cn(
              'px-3 py-1.5 text-sm rounded-md',
              'bg-[var(--color-surface-raised)] hover:bg-[var(--color-border)]',
            )}
          >
            Annuler
          </button>
        </div>
      )}

      {sorted.length === 0 && !creating && (
        <div
          className="rounded-md border border-dashed py-12 px-4 text-center"
          style={{
            borderColor: 'var(--color-border)',
            color: 'var(--color-text-muted)',
          }}
        >
          <Calculator size={32} className="mx-auto opacity-25 mb-3" />
          <p className="text-sm mb-3">
            Aucun calcul enregistré pour ce dossier.
          </p>
          <button
            onClick={() => {
              setCreating(true);
              setDraftName('');
            }}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md',
              'bg-[var(--color-primary)] text-white hover:opacity-90',
            )}
          >
            <Plus size={13} /> Créer un calcul
          </button>
        </div>
      )}

      {sorted.length > 0 && (
        <ul
          className="rounded-md border overflow-hidden"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
        >
          {sorted.map((c, idx) => (
            <li
              key={c.id}
              className={cn(
                'flex items-center gap-3 px-4 py-3',
                idx > 0 && 'border-t',
              )}
              style={{ borderColor: 'var(--color-border)' }}
            >
              <button
                onClick={() => c.id && onOpen(c.id)}
                className="flex-1 min-w-0 text-left"
              >
                <div
                  className="text-sm font-semibold truncate"
                  style={{ color: 'var(--color-text)' }}
                >
                  {c.name}
                </div>
                <div
                  className="text-xs mt-0.5"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  Mis à jour le {new Date(c.updatedAt).toLocaleDateString('fr-FR')}
                  {' · '}
                  {c.creditorType === 'particulier' ? 'Particulier' : 'Professionnel'}
                  {' · '}
                  {c.items.length} ligne{c.items.length > 1 ? 's' : ''}
                  {c.result && (
                    <>
                      {' · '}
                      Total : <strong>{fmtMoney.format(c.result.totalAmount)}</strong>
                    </>
                  )}
                </div>
              </button>
              <button
                onClick={() => deleteCalc(c.id)}
                title="Supprimer"
                className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-error)]"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Vue détail / éditeur d'un calcul ─────────────────────────────────────

function CalculatorDetail({
  dossier,
  calcId,
  onBack,
}: {
  dossier?: Dossier;
  calcId: number;
  onBack: () => void;
}) {
  const [name, setName] = useState('');
  const [creditorType, setCreditorType] = useState<CreditorType>('particulier');
  const [drafts, setDrafts] = useState<DraftItem[]>([emptyDraft()]);
  const [capitalize, setCapitalize] = useState(false);
  const [capitalizationStartDate, setCapitalizationStartDate] = useState<string>('');
  const [result, setResult] = useState<InterestComputationResult | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const dernierTaux = LEGAL_INTEREST_RATES[LEGAL_INTEREST_RATES.length - 1];

  // Charge le calcul une fois au montage. L'éditeur travaille ensuite
  // sur l'état local pour ne pas être écrasé par les écritures Drive.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const c = await db.interestCalculations.get(calcId);
      if (cancelled || !c) return;
      setName(c.name);
      setCreditorType(c.creditorType);
      setDrafts(
        c.items.length > 0 ? c.items.map(recordToDraft) : [emptyDraft()],
      );
      const cap = !!c.capitalize;
      const capDate = c.capitalizationStartDate
        ? ymd(new Date(c.capitalizationStartDate))
        : '';
      setCapitalize(cap);
      setCapitalizationStartDate(capDate);
      // Recalcul automatique à l'ouverture (auto-update demandé par
      // le cahier des charges si la table de taux a évolué).
      const inputs = draftsToInputs(
        c.items.map(recordToDraft),
      );
      if (inputs.length > 0) {
        try {
          setResult(
            computeAll(inputs, c.creditorType, {
              capitalize: cap,
              capitalizationStartDate: capDate ? parseYmd(capDate) : undefined,
            }),
          );
        } catch {
          setResult(c.result ? snapshotToResult(c.result) : null);
        }
      } else if (c.result) {
        setResult(snapshotToResult(c.result));
      }
      setSavedAt(c.updatedAt ? new Date(c.updatedAt) : null);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [calcId]);

  function addLine() {
    setDrafts((prev) => [...prev, emptyDraft()]);
  }
  function removeLine(id: string) {
    setDrafts((prev) => (prev.length === 1 ? prev : prev.filter((d) => d.id !== id)));
  }
  function updateLine(id: string, patch: Partial<DraftItem>) {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }
  /** Duplique la ligne juste en dessous, avec un nouvel identifiant. */
  function duplicateLine(id: string) {
    setDrafts((prev) => {
      const idx = prev.findIndex((d) => d.id === id);
      if (idx < 0) return prev;
      const copy: DraftItem = { ...prev[idx], id: uuid() };
      return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
    });
  }
  /**
   * Recopie la valeur d'un champ entre deux lignes adjacentes (idx et
   * idx + 1) lorsque l'une des deux est vide. Si elles sont toutes les
   * deux remplies (ou toutes les deux vides), le bouton n'est de
   * toute façon pas affiché.
   */
  function copyBetweenLines(idx: number, key: keyof DraftItem) {
    setDrafts((prev) => {
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const a = prev[idx];
      const b = prev[idx + 1];
      const aFilled = !!a[key];
      const bFilled = !!b[key];
      if (aFilled === bFilled) return prev; // les deux pleins ou les deux vides
      return prev.map((d, i) => {
        if (aFilled && i === idx + 1) return { ...d, [key]: a[key] };
        if (bFilled && i === idx) return { ...d, [key]: b[key] };
        return d;
      });
    });
  }

  function compute(): InterestComputationResult | null {
    setError(null);
    const inputs = draftsToInputs(drafts);
    if (inputs.length === 0) {
      setError('Renseignez au moins une ligne avec un capital et des dates.');
      return null;
    }
    for (const it of inputs) {
      if (!Number.isFinite(it.amount) || it.amount <= 0) {
        setError(`Capital invalide pour « ${it.label} ».`);
        return null;
      }
      if (it.endDate < it.startDate) {
        setError(`La date de fin précède la date de début pour « ${it.label} ».`);
        return null;
      }
    }
    if (capitalize && !capitalizationStartDate) {
      setError("Indiquez la date à compter de laquelle la capitalisation est ordonnée.");
      return null;
    }
    const r = computeAll(inputs, creditorType, {
      capitalize,
      capitalizationStartDate: capitalize && capitalizationStartDate
        ? parseYmd(capitalizationStartDate)
        : undefined,
    });
    setResult(r);
    return r;
  }

  async function saveCalc() {
    const r = result ?? compute();
    if (!r) return;
    const items: InterestItemRecord[] = draftsToInputs(drafts).map((it) => ({
      id: it.id,
      label: it.label,
      amount: it.amount,
      startDate: it.startDate,
      endDate: it.endDate,
    }));
    const now = new Date();
    const existing = await db.interestCalculations.get(calcId);
    const payload: Partial<InterestCalculation> = {
      name: name.trim() || `Calcul du ${now.toLocaleDateString('fr-FR')}`,
      creditorType,
      items,
      capitalize,
      capitalizationStartDate:
        capitalize && capitalizationStartDate
          ? parseYmd(capitalizationStartDate)
          : undefined,
      result: resultToSnapshot(r),
      ratesSnapshot: LEGAL_INTEREST_RATES.map((rate) => ({
        year: rate.year,
        semester: rate.semester,
        particulier: rate.particulier,
        professionnel: rate.professionnel,
      })),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await db.interestCalculations.update(calcId, payload);
    setSavedAt(now);
  }

  function handleExportPdf() {
    const r = result ?? compute();
    if (!r) return;
    exportInterestPdf({
      name,
      result: r,
      dossierLabel: dossier ? `${dossier.reference} — ${dossier.name}` : undefined,
    });
  }

  function handleExportXlsx() {
    const r = result ?? compute();
    if (!r) return;
    exportInterestXlsx({
      name,
      result: r,
      dossierLabel: dossier ? `${dossier.reference} — ${dossier.name}` : undefined,
    });
  }

  if (!loaded) {
    return (
      <div className="px-6 py-12 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
        Chargement du calcul…
      </div>
    );
  }

  return (
    <div className="px-6 py-6">
      {/* Barre haute : retour + nom éditable */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <button
          onClick={onBack}
          title="Retour aux calculs"
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md',
            'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
            'hover:bg-[var(--color-surface-raised)]',
          )}
        >
          <ArrowLeft size={12} /> Calculs
        </button>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nom du calcul"
          className={cn(
            'text-base font-semibold bg-transparent border-0 border-b border-transparent',
            'focus:outline-none focus:border-[var(--color-primary)]',
            'flex-1 min-w-[260px] py-1',
          )}
          style={{ color: 'var(--color-text)' }}
        />
      </div>

      {/* Bandeau profil créancier */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Profil créancier :
        </span>
        <div
          className="inline-flex rounded-md overflow-hidden border"
          style={{ borderColor: 'var(--color-border)' }}
        >
          {(['particulier', 'professionnel'] as CreditorType[]).map((t) => (
            <button
              key={t}
              onClick={() => setCreditorType(t)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-colors',
                creditorType === t
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-[var(--color-surface-raised)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
              )}
            >
              {t === 'particulier' ? 'Particulier' : 'Professionnel'}
            </button>
          ))}
        </div>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Dernier taux officiel connu : {dernierTaux.year} S{dernierTaux.semester} ·{' '}
          {dernierTaux[creditorType].toFixed(2).replace('.', ',')} %
        </span>
      </div>

      {/* Capitalisation des intérêts (anatocisme — art. 1343-2 C. civ.) */}
      <div
        className="mb-3 rounded-md border px-3 py-2 flex items-center gap-3 flex-wrap"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
      >
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={capitalize}
            onChange={(e) => setCapitalize(e.target.checked)}
            className="w-4 h-4 accent-[var(--color-primary)]"
          />
          <span style={{ color: 'var(--color-text)' }}>
            Capitalisation des intérêts
          </span>
          <span
            className="text-xs"
            style={{ color: 'var(--color-text-muted)' }}
          >
            (anatocisme — à cocher si ordonné par le juge)
          </span>
        </label>
        {capitalize && (
          <div className="flex items-center gap-2">
            <CalendarClock size={13} style={{ color: 'var(--color-text-muted)' }} />
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              à compter du :
            </span>
            <input
              type="date"
              value={capitalizationStartDate}
              onChange={(e) => setCapitalizationStartDate(e.target.value)}
              className={lineInputCls}
              style={{
                width: 160,
                // Tant que l'utilisateur n'a pas choisi de date, le format
                // « jj/mm/aaaa » du champ s'affiche en couleur estompée
                // pour ressembler à un placeholder.
                color: capitalizationStartDate
                  ? 'var(--color-text)'
                  : 'var(--color-text-muted)',
              }}
            />
          </div>
        )}
      </div>

      {/* Lignes */}
      <div
        className="rounded-md border overflow-hidden"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div
          className="grid grid-cols-[1.6fr_1fr_1fr_1fr_auto] gap-2 px-3 py-2 text-xs font-medium"
          style={{ background: 'var(--color-surface-raised)', color: 'var(--color-text-muted)' }}
        >
          <div>Poste</div>
          <div>Capital (€)</div>
          <div>Date de départ</div>
          <div>Date de fin</div>
          <div></div>
        </div>
        {drafts.map((d, idx) => (
          <Fragment key={d.id}>
            <div
              className="grid grid-cols-[1.6fr_1fr_1fr_1fr_auto] gap-2 px-3 py-2 border-t items-center"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <input
                type="text"
                value={d.label}
                onChange={(e) => updateLine(d.id, { label: e.target.value })}
                placeholder="Ex. Capital dû, Indemnité, Solde…"
                className={lineInputCls}
              />
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={d.amount}
                onChange={(e) => updateLine(d.id, { amount: e.target.value })}
                placeholder="0,00"
                className={lineInputCls}
              />
              <input
                type="date"
                value={d.startDate}
                onChange={(e) => updateLine(d.id, { startDate: e.target.value })}
                className={lineInputCls}
              />
              <div className="flex items-center gap-1 min-w-0">
                <input
                  type="date"
                  value={d.endDate}
                  onChange={(e) => updateLine(d.id, { endDate: e.target.value })}
                  className={cn(lineInputCls, 'flex-1 min-w-0')}
                />
                <button
                  onClick={() => updateLine(d.id, { endDate: ymd(new Date()) })}
                  title="Définir la date de fin sur aujourd'hui"
                  className={cn(
                    'shrink-0 px-2 py-1 text-[11px] rounded-md',
                    'bg-[var(--color-surface-raised)] border border-[var(--color-border)]',
                    'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-border)]',
                  )}
                >
                  Aujourd&apos;hui
                </button>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => duplicateLine(d.id)}
                  title="Dupliquer la ligne"
                  className={cn(
                    'p-1.5 rounded-md',
                    'text-[var(--color-text-muted)] hover:text-[var(--color-primary)]',
                  )}
                >
                  <Copy size={14} />
                </button>
                <button
                  onClick={() => removeLine(d.id)}
                  disabled={drafts.length === 1}
                  title="Supprimer la ligne"
                  className={cn(
                    'p-1.5 rounded-md',
                    drafts.length === 1
                      ? 'text-[var(--color-text-faint)] cursor-not-allowed'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-error)]',
                  )}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            {idx < drafts.length - 1 && (
              <LineConnector
                prev={d}
                next={drafts[idx + 1]}
                onCopy={(key) => copyBetweenLines(idx, key)}
              />
            )}
          </Fragment>
        ))}
        <div
          className="px-3 py-2 border-t flex items-center justify-between"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <button
            onClick={addLine}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md',
              'text-[var(--color-primary)] hover:bg-[var(--color-surface-raised)]',
            )}
          >
            <Plus size={13} /> Ajouter une ligne
          </button>
          <button
            onClick={() => compute()}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md font-medium text-white',
              'bg-[var(--color-primary)] hover:opacity-90',
            )}
          >
            <Calculator size={13} /> Calculer
          </button>
        </div>
      </div>

      {error && (
        <div
          className="mt-3 px-3 py-2 rounded-md text-sm flex items-center gap-2"
          style={{
            background: 'oklch(from var(--color-error) l c h / 0.08)',
            color: 'var(--color-error)',
          }}
        >
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {result && (
        <div className="mt-5">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Capital total" value={fmtMoney.format(result.totalCapital)} />
            <Stat label="Intérêts totaux" value={fmtMoney.format(result.totalInterest)} />
            <Stat
              label="Total dû"
              value={fmtMoney.format(result.totalAmount)}
              accent
            />
          </div>

          <details
            className="mt-4 rounded-md border"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <summary
              className="cursor-pointer px-3 py-2 text-sm font-medium select-none"
              style={{ color: 'var(--color-text)' }}
            >
              Détail par période de taux
            </summary>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr style={{ color: 'var(--color-text-muted)' }}>
                    <th className="text-left px-3 py-1.5">Poste</th>
                    <th className="text-left px-3 py-1.5">Du</th>
                    <th className="text-left px-3 py-1.5">Au</th>
                    <th className="text-left px-3 py-1.5">Période</th>
                    <th className="text-right px-3 py-1.5">Jours</th>
                    <th className="text-right px-3 py-1.5">Capital</th>
                    <th className="text-right px-3 py-1.5">Taux</th>
                    <th className="text-right px-3 py-1.5">Intérêts</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.flatMap((it) =>
                    it.segments.map((s, i) => (
                      <tr
                        key={`${it.itemId}-${i}`}
                        style={{ borderTop: '1px solid var(--color-border)' }}
                      >
                        <td className="px-3 py-1.5">{it.label}</td>
                        <td className="px-3 py-1.5">
                          {new Date(s.from).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="px-3 py-1.5">
                          {new Date(s.to).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="px-3 py-1.5">
                          {s.year} {s.semester === 1 ? 'S1' : 'S2'}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {s.days}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {fmtMoney.format(s.capital ?? it.amount)}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {s.rate.toFixed(2).replace('.', ',')} %
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {fmtMoney.format(s.interest)}
                          {s.capitalizedAfter && (
                            <span
                              className="ml-1 text-[10px] font-medium"
                              style={{ color: 'var(--color-primary)' }}
                              title="Intérêts capitalisés à la fin de cette période"
                            >
                              ↻
                            </span>
                          )}
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}

      <div className="mt-5 flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {savedAt
            ? `Enregistré le ${savedAt.toLocaleString('fr-FR')}`
            : 'Non enregistré'}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={saveCalc}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md',
              'bg-[var(--color-surface-raised)] border border-[var(--color-border)]',
              'hover:bg-[var(--color-border)]',
            )}
          >
            <Save size={13} /> Enregistrer
          </button>
          <button
            onClick={handleExportPdf}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md',
              'bg-[var(--color-surface-raised)] border border-[var(--color-border)]',
              'hover:bg-[var(--color-border)]',
            )}
          >
            <FileDown size={13} /> Exporter PDF
          </button>
          <button
            onClick={handleExportXlsx}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md',
              'bg-[var(--color-surface-raised)] border border-[var(--color-border)]',
              'hover:bg-[var(--color-border)]',
            )}
          >
            <FileSpreadsheet size={13} /> Exporter XLSX
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className="rounded-md border px-3 py-2"
      style={{
        borderColor: accent ? 'var(--color-primary)' : 'var(--color-border)',
        background: accent
          ? 'oklch(from var(--color-primary) l c h / 0.06)'
          : 'var(--color-surface)',
      }}
    >
      <div
        className="text-[10px] uppercase tracking-wider"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {label}
      </div>
      <div
        className="text-base font-semibold tabular-nums mt-0.5"
        style={{ color: 'var(--color-text)' }}
      >
        {value}
      </div>
    </div>
  );
}

const lineInputCls = cn(
  'w-full px-2 py-1 text-sm rounded-md',
  'bg-[var(--color-surface)] border border-[var(--color-border)]',
  'text-[var(--color-text)]',
  'focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]',
);

/**
 * Petite barre intercalaire entre deux lignes adjacentes : pour chaque
 * colonne (poste, capital, date de départ, date de fin), une icône de
 * recopie apparaît si exactement l'une des deux cellules est remplie.
 * Cliquer recopie la valeur dans la cellule vide. Si les deux sont
 * remplies (ou les deux vides), aucune icône n'est affichée.
 */
function LineConnector({
  prev,
  next,
  onCopy,
}: {
  prev: DraftItem;
  next: DraftItem;
  onCopy: (key: keyof DraftItem) => void;
}) {
  const fields: { key: keyof DraftItem; label: string }[] = [
    { key: 'label', label: 'le poste' },
    { key: 'amount', label: 'le capital' },
    { key: 'startDate', label: 'la date de départ' },
    { key: 'endDate', label: 'la date de fin' },
  ];
  return (
    <div
      className="grid grid-cols-[1.6fr_1fr_1fr_1fr_auto] gap-2 px-3 -my-1"
      aria-hidden={false}
    >
      {fields.map((f) => {
        const aFilled = !!prev[f.key];
        const bFilled = !!next[f.key];
        const visible = aFilled !== bFilled;
        return (
          <div key={f.key} className="flex justify-center">
            {visible && (
              <button
                onClick={() => onCopy(f.key)}
                title={`Recopier ${f.label} dans la ligne vide`}
                className={cn(
                  'flex items-center justify-center rounded-full',
                  'w-5 h-5 -my-0.5',
                  'bg-[var(--color-surface-raised)] border border-[var(--color-border)]',
                  'text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:border-[var(--color-primary)]',
                )}
              >
                <ArrowDownUp size={11} />
              </button>
            )}
          </div>
        );
      })}
      {/* Spacer pour la colonne d'actions (aligne la grille). */}
      <div />
    </div>
  );
}
