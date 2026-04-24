'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Euro, Clock, Wallet, Sparkles, Plus, Trash2, FileText,
  Check, X, Receipt,
} from 'lucide-react';
import {
  db,
  saveTimeEntry, deleteTimeEntry,
  saveExpense, deleteExpense,
  saveFixedFee, deleteFixedFee,
  saveInvoice,
  computeDossierFinanceTotals, type DossierFinanceTotals,
} from '@/lib/db';
import { cn, formatDate } from '@/lib/utils';
import {
  TIME_ACTIVITY_LABELS,
  EXPENSE_CATEGORY_LABELS,
  FIXED_FEE_KIND_LABELS,
  INVOICE_STATUS_LABELS,
  formatMinutes, formatMoney,
} from '@/components/dossiers/labels';
import type {
  Dossier, TimeEntry, TimeActivity,
  Expense, ExpenseCategory,
  FixedFee, FixedFeeKind,
  Invoice, InvoiceStatus,
} from '@/types';

const DEFAULT_VAT_RATE = 20; // %

interface Props {
  dossier: Dossier;
}

export function DossierFinanceTab({ dossier }: Props) {
  const dossierId = dossier.id!;

  const timeEntries = useLiveQuery(
    () => db.timeEntries.where('dossierId').equals(dossierId).toArray(),
    [dossierId],
  );
  const expenses = useLiveQuery(
    () => db.expenses.where('dossierId').equals(dossierId).toArray(),
    [dossierId],
  );
  const fixedFees = useLiveQuery(
    () => db.fixedFees.where('dossierId').equals(dossierId).toArray(),
    [dossierId],
  );
  const invoices = useLiveQuery(
    () => db.invoices.where('dossierId').equals(dossierId).toArray(),
    [dossierId],
  );

  const [totals, setTotals] = useState<DossierFinanceTotals | null>(null);

  // Recalcule les totaux sur chaque mutation d'une des tables finance.
  useMemo(() => {
    void computeDossierFinanceTotals(dossierId).then(setTotals);
  }, [dossierId, timeEntries, expenses, fixedFees, invoices]);

  const unbilled = useMemo(() => {
    const t = (timeEntries ?? []).filter((x) => x.billable && !x.billed);
    const e = (expenses ?? []).filter((x) => x.rebillable && !x.billed);
    const f = (fixedFees ?? []).filter((x) => !x.billed);
    const totalHT =
      t.reduce((s, x) => s + (x.minutes / 60) * (x.hourlyRate ?? 0), 0) +
      e.reduce((s, x) => s + x.amount, 0) +
      f.reduce((s, x) => s + x.amount, 0);
    return { t, e, f, totalHT };
  }, [timeEntries, expenses, fixedFees]);

  return (
    <div className="p-6 flex flex-col gap-6">
      {/* ── Synthèse ────────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard
          icon={Clock}
          label="Temps saisi"
          value={totals ? formatMinutes(totals.billableMinutes) : '—'}
          sub={totals ? `${formatMoney(totals.billableAmount)} facturables` : ''}
        />
        <SummaryCard
          icon={Euro}
          label="À facturer"
          value={formatMoney(unbilled.totalHT)}
          sub={
            unbilled.t.length + unbilled.e.length + unbilled.f.length > 0
              ? `${unbilled.t.length + unbilled.e.length + unbilled.f.length} ligne${
                  unbilled.t.length + unbilled.e.length + unbilled.f.length > 1 ? 's' : ''
                } en attente`
              : 'Tout est facturé'
          }
        />
        <SummaryCard
          icon={Wallet}
          label="Débours"
          value={totals ? formatMoney(totals.expenseTotal) : '—'}
          sub={totals ? `${formatMoney(totals.expenseRebillable)} refacturables` : ''}
        />
        <SummaryCard
          icon={Sparkles}
          label="Forfaits"
          value={totals ? formatMoney(totals.feeTotal) : '—'}
          sub={(fixedFees ?? []).length + ' ligne' + ((fixedFees ?? []).length > 1 ? 's' : '')}
        />
      </section>

      {/* ── Temps passés ─────────────────────────────────────────────── */}
      <TimeEntriesSection
        dossierId={dossierId}
        entries={timeEntries ?? []}
      />

      {/* ── Débours ──────────────────────────────────────────────────── */}
      <ExpensesSection
        dossierId={dossierId}
        entries={expenses ?? []}
      />

      {/* ── Honoraires forfaitaires ──────────────────────────────────── */}
      <FixedFeesSection
        dossierId={dossierId}
        entries={fixedFees ?? []}
      />

      {/* ── Pré-facturation / Factures ───────────────────────────────── */}
      <InvoicesSection
        dossier={dossier}
        invoices={invoices ?? []}
        unbilled={unbilled}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Synthèse
// ─────────────────────────────────────────────────────────────────────

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-[var(--color-text)]">
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">{sub}</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Temps passés
// ─────────────────────────────────────────────────────────────────────

function TimeEntriesSection({
  dossierId,
  entries,
}: {
  dossierId: number;
  entries: TimeEntry[];
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    date: todayIso(),
    activity: 'drafting' as TimeActivity,
    minutes: 30,
    hourlyRate: 180,
    description: '',
    billable: true,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const now = new Date();
    await saveTimeEntry({
      dossierId,
      date: new Date(form.date),
      activity: form.activity,
      minutes: Math.max(0, Math.round(form.minutes)),
      hourlyRate: form.hourlyRate || undefined,
      description: form.description.trim() || undefined,
      billable: form.billable,
      billed: false,
      createdAt: now,
      updatedAt: now,
    });
    setForm((f) => ({ ...f, minutes: 30, description: '' }));
    setOpen(false);
  }

  const sorted = entries.slice().sort((a, b) => +new Date(b.date) - +new Date(a.date));

  return (
    <Section
      title="Temps passés"
      icon={Clock}
      count={entries.length}
      onAdd={() => setOpen((o) => !o)}
      adding={open}
    >
      {open && (
        <form
          onSubmit={submit}
          className="grid grid-cols-2 gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)]/40 px-3 py-3 md:grid-cols-7 md:items-end"
        >
          <Field label="Date">
            <input
              type="date" value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Activité">
            <select
              value={form.activity}
              onChange={(e) => setForm({ ...form, activity: e.target.value as TimeActivity })}
              className={inputCls}
            >
              {Object.entries(TIME_ACTIVITY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Durée (min)">
            <input
              type="number" min={0} step={5} value={form.minutes}
              onChange={(e) => setForm({ ...form, minutes: Number(e.target.value) })}
              className={inputCls}
            />
          </Field>
          <Field label="Taux horaire (€)">
            <input
              type="number" min={0} step={10} value={form.hourlyRate}
              onChange={(e) => setForm({ ...form, hourlyRate: Number(e.target.value) })}
              className={inputCls}
            />
          </Field>
          <Field label="Description" span={2}>
            <input
              type="text" value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Rédaction conclusions, analyse dossier…"
              className={inputCls}
            />
          </Field>
          <Field label="Facturable">
            <label className="flex h-[34px] items-center gap-2 text-sm">
              <input
                type="checkbox" checked={form.billable}
                onChange={(e) => setForm({ ...form, billable: e.target.checked })}
              />
              Oui
            </label>
          </Field>
          <FormButtons onCancel={() => setOpen(false)} />
        </form>
      )}
      {sorted.length === 0 ? (
        <EmptyRow label="Aucun temps saisi pour ce dossier." />
      ) : (
        <div className="divide-y divide-[var(--color-border)]">
          {sorted.map((t) => (
            <div key={t.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="w-20 text-xs text-[var(--color-text-muted)] tabular-nums">
                {formatDate(t.date)}
              </span>
              <span className="w-28 truncate text-[var(--color-text)]">
                {TIME_ACTIVITY_LABELS[t.activity]}
              </span>
              <span className="w-16 text-right tabular-nums">
                {formatMinutes(t.minutes)}
              </span>
              <span className="w-24 text-right tabular-nums text-[var(--color-text-muted)]">
                {t.hourlyRate ? `${t.hourlyRate} €/h` : '—'}
              </span>
              <span className="min-w-0 flex-1 truncate text-[var(--color-text-muted)]">
                {t.description || '—'}
              </span>
              <span className="w-24 text-right tabular-nums font-medium">
                {formatMoney((t.minutes / 60) * (t.hourlyRate ?? 0))}
              </span>
              <StatusPill billed={t.billed} billable={t.billable} />
              <DeleteBtn onClick={() => t.id != null && deleteTimeEntry(t.id)} />
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Débours
// ─────────────────────────────────────────────────────────────────────

function ExpensesSection({
  dossierId,
  entries,
}: {
  dossierId: number;
  entries: Expense[];
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    date: todayIso(),
    category: 'clerk' as ExpenseCategory,
    amount: 0,
    description: '',
    rebillable: true,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.amount <= 0) return;
    const now = new Date();
    await saveExpense({
      dossierId,
      date: new Date(form.date),
      category: form.category,
      amount: form.amount,
      description: form.description.trim() || undefined,
      rebillable: form.rebillable,
      billed: false,
      createdAt: now,
      updatedAt: now,
    });
    setForm({ ...form, amount: 0, description: '' });
    setOpen(false);
  }

  const sorted = entries.slice().sort((a, b) => +new Date(b.date) - +new Date(a.date));

  return (
    <Section
      title="Débours"
      icon={Wallet}
      count={entries.length}
      onAdd={() => setOpen((o) => !o)}
      adding={open}
    >
      {open && (
        <form
          onSubmit={submit}
          className="grid grid-cols-2 gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)]/40 px-3 py-3 md:grid-cols-6 md:items-end"
        >
          <Field label="Date">
            <input
              type="date" value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Catégorie">
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}
              className={inputCls}
            >
              {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Montant (€)">
            <input
              type="number" min={0} step={0.01} value={form.amount}
              onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
              className={inputCls}
            />
          </Field>
          <Field label="Description" span={2}>
            <input
              type="text" value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Ex. Frais de greffe citation"
              className={inputCls}
            />
          </Field>
          <Field label="Refacturable">
            <label className="flex h-[34px] items-center gap-2 text-sm">
              <input
                type="checkbox" checked={form.rebillable}
                onChange={(e) => setForm({ ...form, rebillable: e.target.checked })}
              />
              Oui
            </label>
          </Field>
          <FormButtons onCancel={() => setOpen(false)} />
        </form>
      )}
      {sorted.length === 0 ? (
        <EmptyRow label="Aucun débours pour ce dossier." />
      ) : (
        <div className="divide-y divide-[var(--color-border)]">
          {sorted.map((x) => (
            <div key={x.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="w-20 text-xs text-[var(--color-text-muted)] tabular-nums">
                {formatDate(x.date)}
              </span>
              <span className="w-32 truncate text-[var(--color-text)]">
                {EXPENSE_CATEGORY_LABELS[x.category]}
              </span>
              <span className="min-w-0 flex-1 truncate text-[var(--color-text-muted)]">
                {x.description || '—'}
              </span>
              <span className="w-24 text-right tabular-nums font-medium">
                {formatMoney(x.amount)}
              </span>
              <StatusPill billed={x.billed} billable={x.rebillable} />
              <DeleteBtn onClick={() => x.id != null && deleteExpense(x.id)} />
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Honoraires forfaitaires
// ─────────────────────────────────────────────────────────────────────

function FixedFeesSection({
  dossierId,
  entries,
}: {
  dossierId: number;
  entries: FixedFee[];
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    date: todayIso(),
    kind: 'forfait' as FixedFeeKind,
    amount: 0,
    description: '',
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.amount <= 0) return;
    const now = new Date();
    await saveFixedFee({
      dossierId,
      date: new Date(form.date),
      kind: form.kind,
      amount: form.amount,
      description: form.description.trim() || undefined,
      billed: false,
      createdAt: now,
      updatedAt: now,
    });
    setForm({ ...form, amount: 0, description: '' });
    setOpen(false);
  }

  const sorted = entries.slice().sort((a, b) => +new Date(b.date) - +new Date(a.date));

  return (
    <Section
      title="Honoraires forfaitaires"
      icon={Sparkles}
      count={entries.length}
      onAdd={() => setOpen((o) => !o)}
      adding={open}
    >
      {open && (
        <form
          onSubmit={submit}
          className="grid grid-cols-2 gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)]/40 px-3 py-3 md:grid-cols-5 md:items-end"
        >
          <Field label="Date">
            <input
              type="date" value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Type">
            <select
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as FixedFeeKind })}
              className={inputCls}
            >
              {Object.entries(FIXED_FEE_KIND_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Montant (€)">
            <input
              type="number" min={0} step={0.01} value={form.amount}
              onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
              className={inputCls}
            />
          </Field>
          <Field label="Description">
            <input
              type="text" value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Convention d'honoraires, forfait conseil…"
              className={inputCls}
            />
          </Field>
          <FormButtons onCancel={() => setOpen(false)} />
        </form>
      )}
      {sorted.length === 0 ? (
        <EmptyRow label="Aucun honoraire forfaitaire." />
      ) : (
        <div className="divide-y divide-[var(--color-border)]">
          {sorted.map((f) => (
            <div key={f.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="w-20 text-xs text-[var(--color-text-muted)] tabular-nums">
                {formatDate(f.date)}
              </span>
              <span className="w-28 truncate text-[var(--color-text)]">
                {FIXED_FEE_KIND_LABELS[f.kind]}
              </span>
              <span className="min-w-0 flex-1 truncate text-[var(--color-text-muted)]">
                {f.description || '—'}
              </span>
              <span className="w-24 text-right tabular-nums font-medium">
                {formatMoney(f.amount)}
              </span>
              <StatusPill billed={f.billed} billable />
              <DeleteBtn onClick={() => f.id != null && deleteFixedFee(f.id)} />
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Factures (pré-facturation)
// ─────────────────────────────────────────────────────────────────────

function InvoicesSection({
  dossier,
  invoices,
  unbilled,
}: {
  dossier: Dossier;
  invoices: Invoice[];
  unbilled: {
    t: TimeEntry[];
    e: Expense[];
    f: FixedFee[];
    totalHT: number;
  };
}) {
  const [busy, setBusy] = useState(false);

  async function createProforma() {
    if (unbilled.totalHT <= 0) return;
    setBusy(true);
    try {
      const now = new Date();
      const vatRate = DEFAULT_VAT_RATE;
      const totalHT = Math.round(unbilled.totalHT * 100) / 100;
      const totalTTC = Math.round(totalHT * (1 + vatRate / 100) * 100) / 100;
      const reference = await nextInvoiceReference(dossier.id!);
      const invoiceId = await saveInvoice({
        dossierId: dossier.id!,
        reference,
        date: now,
        status: 'proforma',
        totalHT,
        totalTTC,
        vatRate,
        notes: `Pro-forma — ${dossier.name}`,
        createdAt: now,
        updatedAt: now,
      });
      // Agrège : chaque ligne non facturée est marquée billed + rattachée à la facture.
      await Promise.all([
        ...unbilled.t.map((x) =>
          x.id != null
            ? db.timeEntries.update(x.id, { billed: true, invoiceId })
            : Promise.resolve(),
        ),
        ...unbilled.e.map((x) =>
          x.id != null
            ? db.expenses.update(x.id, { billed: true, invoiceId })
            : Promise.resolve(),
        ),
        ...unbilled.f.map((x) =>
          x.id != null
            ? db.fixedFees.update(x.id, { billed: true, invoiceId })
            : Promise.resolve(),
        ),
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(inv: Invoice, status: InvoiceStatus) {
    if (inv.id == null) return;
    await db.invoices.update(inv.id, { status, updatedAt: new Date() });
  }

  async function removeInvoice(inv: Invoice) {
    if (inv.id == null) return;
    if (!confirm(`Annuler la facture ${inv.reference} ? Les lignes redeviendront « à facturer ».`)) return;
    // Détacher lignes : voir deleteInvoice dans lib/db.ts qui fait ce travail.
    const { deleteInvoice } = await import('@/lib/db');
    await deleteInvoice(inv.id);
  }

  const sorted = invoices.slice().sort((a, b) => +new Date(b.date) - +new Date(a.date));

  return (
    <Section
      title="Pré-facturation"
      icon={Receipt}
      count={invoices.length}
      customAction={
        <button
          onClick={createProforma}
          disabled={busy || unbilled.totalHT <= 0}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium',
            unbilled.totalHT > 0
              ? 'bg-[var(--color-primary)] text-white hover:opacity-90'
              : 'bg-[var(--color-surface-raised)] text-[var(--color-text-muted)] cursor-not-allowed',
          )}
          title={
            unbilled.totalHT > 0
              ? `Créer une pro-forma agrégeant ${formatMoney(unbilled.totalHT)} HT`
              : 'Aucune ligne à facturer'
          }
        >
          <Plus className="w-3.5 h-3.5" />
          Créer une pro-forma
          {unbilled.totalHT > 0 && ` (${formatMoney(unbilled.totalHT)} HT)`}
        </button>
      }
    >
      {sorted.length === 0 ? (
        <EmptyRow label="Aucune facture. Utilisez « Créer une pro-forma » pour agréger les lignes non facturées." />
      ) : (
        <div className="divide-y divide-[var(--color-border)]">
          {sorted.map((inv) => (
            <div key={inv.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <FileText className="w-4 h-4 text-[var(--color-text-muted)] shrink-0" />
              <span className="w-28 font-mono text-xs">{inv.reference}</span>
              <span className="w-20 text-xs text-[var(--color-text-muted)]">
                {formatDate(inv.date)}
              </span>
              <span className="min-w-0 flex-1 truncate text-[var(--color-text-muted)]">
                {inv.notes || '—'}
              </span>
              <span className="w-24 text-right tabular-nums">
                {formatMoney(inv.totalHT)} HT
              </span>
              <span className="w-28 text-right tabular-nums font-semibold">
                {formatMoney(inv.totalTTC)} TTC
              </span>
              <select
                value={inv.status}
                onChange={(e) => setStatus(inv, e.target.value as InvoiceStatus)}
                className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-xs"
              >
                {Object.entries(INVOICE_STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <DeleteBtn onClick={() => removeInvoice(inv)} />
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

/**
 * Génère la prochaine référence de facture au format `YYYY-NNN` pour un
 * dossier donné. Utilise le max des références `^YYYY-\d+$` existantes sur
 * tous les dossiers afin d'avoir un compteur unique par année.
 */
async function nextInvoiceReference(_dossierId: number): Promise<string> {
  const year = new Date().getFullYear();
  const all = await db.invoices.toArray();
  const re = new RegExp(`^${year}-(\\d+)$`);
  let max = 0;
  for (const inv of all) {
    const m = (inv.reference ?? '').match(re);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${year}-${String(max + 1).padStart(3, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────────────────────────────

function Section({
  title, icon: Icon, count, onAdd, adding, customAction, children,
}: {
  title: string;
  icon: React.ElementType;
  count: number;
  onAdd?: () => void;
  adding?: boolean;
  customAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
      <header className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-[var(--color-primary)]" />
          <h3 className="text-sm font-semibold">{title}</h3>
          <span className="rounded-full bg-[var(--color-surface-raised)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-text-muted)]">
            {count}
          </span>
        </div>
        {customAction ?? (
          onAdd && (
            <button
              onClick={onAdd}
              className="inline-flex items-center gap-1 rounded-md bg-[var(--color-primary)] px-2.5 py-1 text-xs font-medium text-white hover:opacity-90"
            >
              {adding ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
              {adding ? 'Fermer' : 'Ajouter'}
            </button>
          )
        )}
      </header>
      {children}
    </section>
  );
}

function Field({
  label, children, span,
}: {
  label: string;
  children: React.ReactNode;
  span?: number;
}) {
  return (
    <label className={cn('flex flex-col gap-1', span === 2 && 'md:col-span-2')}>
      <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function FormButtons({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="flex items-end justify-end gap-1.5">
      <button
        type="button"
        onClick={onCancel}
        className="rounded-md bg-[var(--color-surface-raised)] px-3 py-1.5 text-xs hover:bg-[var(--color-border)]"
      >
        Annuler
      </button>
      <button
        type="submit"
        className="inline-flex items-center gap-1 rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
      >
        <Check className="w-3 h-3" /> Enregistrer
      </button>
    </div>
  );
}

function StatusPill({ billed, billable }: { billed: boolean; billable: boolean }) {
  if (!billable) {
    return (
      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
        Non facturable
      </span>
    );
  }
  if (billed) {
    return (
      <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
        Facturé
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
      À facturer
    </span>
  );
}

function DeleteBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Supprimer"
      className="shrink-0 rounded p-1 text-[var(--color-text-muted)] transition-colors hover:bg-red-50 hover:text-red-600"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  );
}

function EmptyRow({ label }: { label: string }) {
  return (
    <div className="px-3 py-6 text-center text-sm text-[var(--color-text-muted)]">
      {label}
    </div>
  );
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const inputCls = cn(
  'w-full rounded-md px-2 py-1.5 text-sm',
  'bg-[var(--color-surface-raised)] border border-[var(--color-border)]',
  'text-[var(--color-text)]',
  'focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]',
);
