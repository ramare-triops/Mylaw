'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Calculator,
  Plus,
  Trash2,
  Save,
  FileDown,
  FileSpreadsheet,
  RefreshCw,
  FolderOpen,
  AlertTriangle,
  Pencil,
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

export function LegalInterestCalculator({ dossier }: Props) {
  const [name, setName] = useState('Calcul des intérêts');
  const [creditorType, setCreditorType] = useState<CreditorType>('professionnel');
  const [drafts, setDrafts] = useState<DraftItem[]>([emptyDraft()]);
  const [result, setResult] = useState<InterestComputationResult | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const savedCalcs = useLiveQuery<InterestCalculation[]>(
    () =>
      dossier?.id
        ? db.interestCalculations.where('dossierId').equals(dossier.id).toArray()
        : db.interestCalculations.toArray(),
    [dossier?.id],
  );

  // Tri par date de mise à jour (plus récent en premier).
  const sortedSavedCalcs = useMemo(
    () =>
      (savedCalcs ?? [])
        .slice()
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        ),
    [savedCalcs],
  );

  const dernierTaux = LEGAL_INTEREST_RATES[LEGAL_INTEREST_RATES.length - 1];

  function resetToNew() {
    setEditingId(null);
    setName(`Calcul des intérêts du ${new Date().toLocaleDateString('fr-FR')}`);
    setCreditorType('professionnel');
    setDrafts([emptyDraft()]);
    setResult(null);
    setSavedAt(null);
    setError(null);
  }

  // Init du nom au premier rendu
  useEffect(() => {
    setName(`Calcul des intérêts du ${new Date().toLocaleDateString('fr-FR')}`);
  }, []);

  function addLine() {
    setDrafts((prev) => [...prev, emptyDraft()]);
  }

  function removeLine(id: string) {
    setDrafts((prev) => (prev.length === 1 ? prev : prev.filter((d) => d.id !== id)));
  }

  function updateLine(id: string, patch: Partial<DraftItem>) {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
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
    const r = computeAll(inputs, creditorType);
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
    const payload: InterestCalculation = {
      id: editingId ?? undefined,
      name: name.trim() || `Calcul du ${now.toLocaleDateString('fr-FR')}`,
      dossierId: dossier?.id,
      creditorType,
      items,
      result: resultToSnapshot(r),
      ratesSnapshot: LEGAL_INTEREST_RATES.map((rate) => ({
        year: rate.year,
        semester: rate.semester,
        particulier: rate.particulier,
        professionnel: rate.professionnel,
      })),
      createdAt: editingId ? (await db.interestCalculations.get(editingId))?.createdAt ?? now : now,
      updatedAt: now,
    };
    if (editingId) {
      await db.interestCalculations.update(editingId, payload);
      setSavedAt(now);
    } else {
      const id = await db.interestCalculations.add(payload);
      setEditingId(Number(id));
      setSavedAt(now);
    }
  }

  function openCalc(c: InterestCalculation) {
    setEditingId(c.id ?? null);
    setName(c.name);
    setCreditorType(c.creditorType);
    setDrafts(c.items.map(recordToDraft));
    setResult(c.result ? snapshotToResult(c.result) : null);
    setSavedAt(c.updatedAt ? new Date(c.updatedAt) : null);
    setShowLibrary(false);
    setError(null);
    // Recalcul automatique : si le résultat enregistré a été produit
    // avec une table de taux antérieure, on le rafraîchit silencieusement.
    setTimeout(() => {
      const inputs = draftsToInputs(c.items.map(recordToDraft));
      if (inputs.length > 0) {
        const fresh = computeAll(inputs, c.creditorType);
        if (
          !c.result ||
          fresh.totalAmount !== c.result.totalAmount ||
          fresh.hasExtrapolation !== c.result.hasExtrapolation
        ) {
          setResult(fresh);
        }
      }
    }, 0);
  }

  async function deleteCalc(id: number | undefined) {
    if (!id) return;
    if (!confirm('Supprimer définitivement ce calcul enregistré ?')) return;
    await db.interestCalculations.delete(id);
    if (editingId === id) resetToNew();
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

  return (
    <div className="px-6 py-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Calculator size={18} style={{ color: 'var(--color-primary)' }} />
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom du calcul"
            className={cn(
              'text-base font-semibold bg-transparent border-0 border-b border-transparent',
              'focus:outline-none focus:border-[var(--color-primary)]',
              'min-w-[260px] py-1',
            )}
            style={{ color: 'var(--color-text)' }}
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowLibrary((v) => !v)}
            title="Mes calculs enregistrés pour ce dossier"
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md',
              'bg-[var(--color-surface-raised)] border border-[var(--color-border)]',
              'hover:bg-[var(--color-border)]',
            )}
          >
            <FolderOpen size={13} />
            {sortedSavedCalcs.length > 0
              ? `Mes calculs (${sortedSavedCalcs.length})`
              : 'Mes calculs'}
          </button>
          <button
            onClick={resetToNew}
            title="Démarrer un nouveau calcul"
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md',
              'bg-[var(--color-surface-raised)] border border-[var(--color-border)]',
              'hover:bg-[var(--color-border)]',
            )}
          >
            <RefreshCw size={13} /> Nouveau
          </button>
        </div>
      </div>

      {/* Bibliothèque déroulante */}
      {showLibrary && (
        <div
          className="mb-4 rounded-md border"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
        >
          {sortedSavedCalcs.length === 0 ? (
            <div className="px-4 py-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Aucun calcul enregistré pour ce dossier.
            </div>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
              {sortedSavedCalcs.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <button
                    onClick={() => openCalc(c)}
                    className="flex-1 text-left hover:text-[var(--color-primary)] truncate"
                  >
                    <span className="font-medium">{c.name}</span>
                    <span
                      className="ml-2 text-xs"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      · {new Date(c.updatedAt).toLocaleDateString('fr-FR')}
                      {c.result
                        ? ` · ${fmtMoney.format(c.result.totalAmount)}`
                        : ''}
                    </span>
                  </button>
                  <button
                    onClick={() => openCalc(c)}
                    title="Ouvrir"
                    className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => deleteCalc(c.id)}
                    title="Supprimer"
                    className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-error)]"
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Bandeau profil créancier */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Profil créancier :
        </span>
        <div className="inline-flex rounded-md overflow-hidden border" style={{ borderColor: 'var(--color-border)' }}>
          {(['professionnel', 'particulier'] as CreditorType[]).map((t) => (
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
              {t === 'professionnel' ? 'Professionnel' : 'Particulier'}
            </button>
          ))}
        </div>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Dernier taux officiel connu : {dernierTaux.year} S{dernierTaux.semester} ·{' '}
          {dernierTaux[creditorType].toFixed(2).replace('.', ',')} %
        </span>
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
        {drafts.map((d) => (
          <div
            key={d.id}
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
            <input
              type="date"
              value={d.endDate}
              onChange={(e) => updateLine(d.id, { endDate: e.target.value })}
              className={lineInputCls}
            />
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

      {/* Résultat */}
      {result && (
        <div className="mt-5">
          {result.hasExtrapolation && (
            <div
              className="mb-3 px-3 py-2 rounded-md text-sm flex items-start gap-2"
              style={{
                background: 'oklch(from var(--color-warning) l c h / 0.08)',
                color: 'var(--color-text)',
              }}
            >
              <AlertTriangle size={14} style={{ color: 'var(--color-warning)', marginTop: 2 }} />
              <span>
                Au moins une période s'étend au-delà du dernier taux officiel
                publié. Le calcul applique le dernier taux connu — à
                vérifier dès la publication du nouvel arrêté.
              </span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <Stat label="Capital total" value={fmtMoney.format(result.totalCapital)} />
            <Stat label="Intérêts totaux" value={fmtMoney.format(result.totalInterest)} />
            <Stat
              label="Total dû"
              value={fmtMoney.format(result.totalAmount)}
              accent
            />
          </div>

          {/* Détail par segment */}
          <details className="mt-4 rounded-md border" style={{ borderColor: 'var(--color-border)' }}>
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
                        <td className="px-3 py-1.5">{new Date(s.from).toLocaleDateString('fr-FR')}</td>
                        <td className="px-3 py-1.5">{new Date(s.to).toLocaleDateString('fr-FR')}</td>
                        <td className="px-3 py-1.5">
                          {s.year} {s.semester === 1 ? 'S1' : 'S2'}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{s.days}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {s.rate.toFixed(2).replace('.', ',')} %
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {fmtMoney.format(s.interest)}
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

      {/* Actions */}
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
