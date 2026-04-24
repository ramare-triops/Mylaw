'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Clock, Plus, Pencil, Trash2, AlertTriangle, CheckCircle, Calendar, Bell,
  CalendarCheck, Link as LinkIcon, X as CloseIcon,
} from 'lucide-react';
import { db, getSetting, setSetting } from '@/lib/db';
import type { Deadline as DBDeadline, DeadlineType as DBDeadlineType } from '@/types';

// UI conserve les libellés avec accents ; mapping vers les clés normalisées
// stockées en DB (types/index.ts).
type UIDeadlineType = 'péremption' | 'forclusion' | 'réponse' | 'audience' | 'autre';

const UI_TO_DB_TYPE: Record<UIDeadlineType, DBDeadlineType> = {
  'péremption': 'peremption',
  'forclusion': 'forclusion',
  'réponse':    'reponse',
  'audience':   'audience',
  'autre':      'other',
};
const DB_TO_UI_TYPE: Record<DBDeadlineType, UIDeadlineType> = {
  'peremption': 'péremption',
  'forclusion': 'forclusion',
  'reponse':    'réponse',
  'audience':   'audience',
  'appel':      'autre',
  'other':      'autre',
};

interface Deadline {
  id?: number;
  title: string;
  dueDate: Date;
  type: UIDeadlineType;
  folder?: string;
  notes?: string;
  done: boolean;
  createdAt: Date;
  googleEventId?: string;
  googleSyncedAt?: Date;
}

const DEADLINE_TYPES: Array<{ value: UIDeadlineType; label: string; color: string }> = [
  { value: 'péremption', label: 'Péremption', color: 'var(--color-error)' },
  { value: 'forclusion', label: 'Forclusion', color: 'var(--color-error)' },
  { value: 'réponse', label: 'Délai de réponse', color: 'var(--color-warning)' },
  { value: 'audience', label: 'Audience', color: 'var(--color-primary)' },
  { value: 'autre', label: 'Autre', color: 'var(--color-text-muted)' },
];

function getDaysUntil(date: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / 86400000);
}

function getAlertLevel(days: number, done: boolean): 'done' | 'overdue' | 'critical' | 'warning' | 'ok' {
  if (done) return 'done';
  if (days < 0) return 'overdue';
  if (days <= 1) return 'critical';
  if (days <= 7) return 'warning';
  return 'ok';
}

const ALERT_STYLES: Record<string, { bg: string; border: string; badge: string; label: string }> = {
  done: {
    bg: 'var(--color-surface)',
    border: 'var(--color-border)',
    badge: 'var(--color-success)',
    label: 'Fait',
  },
  overdue: {
    bg: 'oklch(from var(--color-error) l c h / 0.06)',
    border: 'var(--color-error)',
    badge: 'var(--color-error)',
    label: 'Dépassé',
  },
  critical: {
    bg: 'oklch(from var(--color-error) l c h / 0.04)',
    border: 'var(--color-error)',
    badge: 'var(--color-error)',
    label: 'Critique',
  },
  warning: {
    bg: 'oklch(from var(--color-warning) l c h / 0.04)',
    border: 'var(--color-warning)',
    badge: 'var(--color-warning)',
    label: 'Urgent',
  },
  ok: {
    bg: 'var(--color-surface)',
    border: 'var(--color-border)',
    badge: 'var(--color-primary)',
    label: 'En cours',
  },
};

export function DeadlineTracker() {
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'done'>('upcoming');
  const [form, setForm] = useState<Omit<Deadline, 'id' | 'done' | 'createdAt'>>({
    title: '',
    dueDate: new Date(),
    type: 'autre',
    folder: '',
    notes: '',
  });
  const [calendarConnected, setCalendarConnected] = useState<boolean | null>(null);
  const [syncingId, setSyncingId] = useState<number | null>(null);

  const checkCalendar = useCallback(async () => {
    try {
      const res = await fetch('/api/google-productivity/token');
      setCalendarConnected(res.ok);
    } catch {
      setCalendarConnected(false);
    }
  }, []);

  useEffect(() => {
    void migrateAndLoad();
    void checkCalendar();
  }, [checkCalendar]);

  // Retour OAuth : rafraîchir l'état de connexion.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('gprod')) {
      void checkCalendar();
      sp.delete('gprod');
      sp.delete('reason');
      const clean = sp.toString();
      const url = window.location.pathname + (clean ? '?' + clean : '');
      window.history.replaceState({}, '', url);
    }
  }, [checkCalendar]);

  function connectCalendar() {
    const returnTo = typeof window !== 'undefined' ? window.location.pathname : '/';
    window.location.href =
      `/api/google-productivity/start?return=${encodeURIComponent(returnTo)}`;
  }

  async function disconnectCalendar() {
    await fetch('/api/google-productivity/logout', { method: 'POST' });
    setCalendarConnected(false);
  }

  async function pushToCalendar(dl: Deadline) {
    if (!dl.id || !calendarConnected) return;
    setSyncingId(dl.id);
    try {
      const description = [
        dl.folder ? `Dossier : ${dl.folder}` : null,
        dl.notes || null,
      ].filter(Boolean).join('\n\n');
      const body = {
        summary: `[${DEADLINE_TYPES.find(t => t.value === dl.type)?.label ?? 'Échéance'}] ${dl.title}`,
        description: description || undefined,
        dueDate: dl.dueDate.toISOString(),
      };
      const url = dl.googleEventId
        ? `/api/google-calendar?id=${encodeURIComponent(dl.googleEventId)}`
        : '/api/google-calendar';
      const res = await fetch(url, {
        method: dl.googleEventId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) return;
      const data = await res.json();
      const eventId = data.event?.id ?? dl.googleEventId;
      const patch: Partial<DBDeadline> = {
        googleEventId: eventId,
        googleSyncedAt: new Date(),
      };
      await db.deadlines.update(dl.id, patch);
      setDeadlines((prev) =>
        prev.map((x) => (x.id === dl.id ? { ...x, ...patch } as Deadline : x)),
      );
    } finally {
      setSyncingId(null);
    }
  }

  async function removeFromCalendar(dl: Deadline) {
    if (!dl.id || !dl.googleEventId) return;
    setSyncingId(dl.id);
    try {
      await fetch(
        `/api/google-calendar?id=${encodeURIComponent(dl.googleEventId)}`,
        { method: 'DELETE' },
      );
      const patch: Partial<DBDeadline> = {
        googleEventId: undefined,
        googleSyncedAt: undefined,
      };
      await db.deadlines.update(dl.id, patch);
      setDeadlines((prev) =>
        prev.map((x) =>
          x.id === dl.id
            ? { ...x, googleEventId: undefined, googleSyncedAt: undefined }
            : x,
        ),
      );
    } finally {
      setSyncingId(null);
    }
  }

  /**
   * Migration one-shot : les anciens délais étaient stockés dans `db.sessions`
   * avec toolId='deadline-tracker', ce qui empêchait le dashboard de les voir
   * (il lit `db.deadlines`). On les déplace vers la bonne table puis on
   * marque la migration comme effectuée pour ne la refaire qu'une fois.
   */
  async function migrateAndLoad() {
    try {
      const done = await getSetting<boolean>('deadlines_migrated_v1', false);
      if (!done) {
        const legacy = await db.table('sessions').where('toolId').equals('deadline-tracker').toArray();
        if (legacy.length > 0) {
          const now = new Date();
          const toAdd: Omit<DBDeadline, 'id'>[] = legacy.map((r: any) => ({
            title:      r.content?.title     || 'Délai sans titre',
            dossier:    r.content?.folder    || '',
            dueDate:    new Date(r.content?.dueDate || now),
            type:       UI_TO_DB_TYPE[(r.content?.type as UIDeadlineType) ?? 'autre'] ?? 'other',
            notes:      r.content?.notes     || undefined,
            done:       Boolean(r.content?.done),
            createdAt:  new Date(r.date || now),
          }));
          await db.deadlines.bulkAdd(toAdd as DBDeadline[]);
          // On retire les anciennes entrées sessions pour ne pas dupliquer
          await Promise.all(legacy.map((r: any) => db.table('sessions').delete(r.id)));
        }
        await setSetting('deadlines_migrated_v1', true);
      }
    } catch {}
    await loadDeadlines();
  }

  async function loadDeadlines() {
    try {
      const rows = await db.deadlines.toArray();
      const mapped: Deadline[] = rows.map((r) => ({
        id:             r.id,
        title:          r.title,
        dueDate:        new Date(r.dueDate),
        type:           DB_TO_UI_TYPE[r.type] ?? 'autre',
        folder:         r.dossier,
        notes:          r.notes,
        done:           r.done,
        createdAt:      new Date(r.createdAt),
        googleEventId:  r.googleEventId,
        googleSyncedAt: r.googleSyncedAt ? new Date(r.googleSyncedAt) : undefined,
      }));
      setDeadlines(mapped.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime()));
    } catch {}
  }

  function resetForm() {
    setForm({ title: '', dueDate: new Date(), type: 'autre', folder: '', notes: '' });
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(dl: Deadline) {
    if (dl.id == null) return;
    setEditingId(dl.id);
    setForm({
      title: dl.title,
      dueDate: dl.dueDate,
      type: dl.type,
      folder: dl.folder ?? '',
      notes: dl.notes ?? '',
    });
    setShowForm(true);
  }

  async function submitDeadline() {
    if (!form.title.trim()) return;
    try {
      if (editingId != null) {
        // ── Mode édition : on met à jour l'enregistrement existant ──
        const existing = deadlines.find((d) => d.id === editingId);
        const patch: Partial<DBDeadline> = {
          title:   form.title.trim(),
          dossier: form.folder ?? '',
          dueDate: form.dueDate,
          type:    UI_TO_DB_TYPE[form.type],
          notes:   form.notes || undefined,
        };
        await db.deadlines.update(editingId, patch);
        const updated: Deadline = {
          id:        editingId,
          title:     patch.title!,
          dueDate:   patch.dueDate!,
          type:      form.type,
          folder:    patch.dossier,
          notes:     patch.notes,
          done:      existing?.done ?? false,
          createdAt: existing?.createdAt ?? new Date(),
        };
        setDeadlines((prev) =>
          prev
            .map((d) => (d.id === editingId ? updated : d))
            .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
        );
        resetForm();
        return;
      }
      // ── Mode création ──
      const now = new Date();
      const record: Omit<DBDeadline, 'id'> = {
        title:     form.title.trim(),
        dossier:   form.folder ?? '',
        dueDate:   form.dueDate,
        type:      UI_TO_DB_TYPE[form.type],
        notes:     form.notes || undefined,
        done:      false,
        createdAt: now,
      };
      const id = await db.deadlines.add(record as DBDeadline);
      const deadline: Deadline = {
        id: Number(id),
        title: record.title,
        dueDate: record.dueDate,
        type: form.type,
        folder: record.dossier,
        notes: record.notes,
        done: false,
        createdAt: now,
      };
      setDeadlines((prev) =>
        [...prev, deadline].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
      );
      resetForm();
    } catch {}
  }

  async function toggleDone(id: number) {
    const dl = deadlines.find((d) => d.id === id);
    if (!dl) return;
    const wasPushed = !!dl.googleEventId;
    const nowDone = !dl.done;
    const updated = { ...dl, done: nowDone, googleEventId: nowDone ? undefined : dl.googleEventId };
    try {
      // Si on coche comme terminé, on retire l'événement distant en best-effort.
      if (nowDone && wasPushed) {
        try {
          await fetch(
            `/api/google-calendar?id=${encodeURIComponent(dl.googleEventId!)}`,
            { method: 'DELETE' },
          );
        } catch { /* best-effort */ }
      }
      await db.deadlines.update(id, {
        done: nowDone,
        googleEventId: nowDone ? undefined : dl.googleEventId,
        googleSyncedAt: nowDone ? undefined : dl.googleSyncedAt,
      });
      setDeadlines((prev) => prev.map((d) => (d.id === id ? updated : d)));
    } catch {}
  }

  async function deleteDeadline(id: number) {
    const dl = deadlines.find((d) => d.id === id);
    try {
      // Nettoyage Google Calendar si la deadline y est liée.
      if (dl?.googleEventId) {
        try {
          await fetch(
            `/api/google-calendar?id=${encodeURIComponent(dl.googleEventId)}`,
            { method: 'DELETE' },
          );
        } catch { /* best-effort */ }
      }
      await db.deadlines.delete(id);
      setDeadlines((prev) => prev.filter((d) => d.id !== id));
    } catch {}
  }

  const filtered = deadlines.filter((d) => {
    if (filter === 'upcoming') return !d.done;
    if (filter === 'done') return d.done;
    return true;
  });

  const overdue = filtered.filter((d) => !d.done && getDaysUntil(d.dueDate) < 0);
  const critical = filtered.filter((d) => !d.done && getDaysUntil(d.dueDate) >= 0 && getDaysUntil(d.dueDate) <= 1);
  const warning = filtered.filter((d) => !d.done && getDaysUntil(d.dueDate) > 1 && getDaysUntil(d.dueDate) <= 7);
  const ok = filtered.filter((d) => !d.done && getDaysUntil(d.dueDate) > 7);
  const done = filtered.filter((d) => d.done);

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: 'var(--color-bg)', fontFamily: 'var(--font-body, Inter, sans-serif)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4 border-b"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
      >
        <div className="flex items-center gap-2">
          <Clock size={18} style={{ color: 'var(--color-primary)' }} />
          <h1
            style={
              { fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-text)' }
            }
          >
            Suivi des délais
          </h1>
          {overdue.length > 0 && (
            <span
              style={{
                fontSize: 'var(--text-xs)',
                background: 'var(--color-error)',
                color: '#fff',
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
                fontWeight: 600,
              }}
            >
              {overdue.length} dépassé{overdue.length > 1 ? 's' : ''}
            </span>
          )}
          {critical.length > 0 && (
            <span
              style={{
                fontSize: 'var(--text-xs)',
                background: 'var(--color-warning)',
                color: '#fff',
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
                fontWeight: 600,
              }}
            >
              J-1 : {critical.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Google Calendar connect/disconnect */}
          {calendarConnected ? (
            <button
              onClick={disconnectCalendar}
              title="Déconnecter Google Agenda"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: 'var(--text-xs)',
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                background: 'oklch(from var(--color-success) l c h / 0.1)',
                color: 'var(--color-success)',
                fontWeight: 500,
              }}
            >
              <CalendarCheck size={13} /> Google Agenda
              <CloseIcon size={12} />
            </button>
          ) : (
            <button
              onClick={connectCalendar}
              title="Connecter Google Agenda pour synchroniser les échéances"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: 'var(--text-xs)',
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-surface-offset)',
                color: 'var(--color-text-muted)',
                fontWeight: 500,
              }}
            >
              <LinkIcon size={13} /> Connecter Google Agenda
            </button>
          )}

          {/* Filter tabs */}
          {(['upcoming', 'all', 'done'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                fontSize: 'var(--text-xs)',
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                background: filter === f ? 'var(--color-primary)' : 'var(--color-surface-offset)',
                color: filter === f ? '#fff' : 'var(--color-text-muted)',
                fontWeight: filter === f ? 600 : 400,
                transition: 'all var(--transition-interactive)',
              }}
            >
              {f === 'upcoming' ? 'En cours' : f === 'all' ? 'Tous' : 'Terminés'}
            </button>
          ))}
          <button
            onClick={() => {
              setEditingId(null);
              setForm({ title: '', dueDate: new Date(), type: 'autre', folder: '', notes: '' });
              setShowForm(true);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: 'var(--text-xs)',
              padding: '4px 12px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-primary)',
              color: '#fff',
              fontWeight: 500,
            }}
          >
            <Plus size={13} /> Nouveau délai
          </button>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <div
          className="px-6 py-4 border-b"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
        >
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              placeholder="Intitulé du délai *"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              style={inputStyle}
            />
            <input
              type="date"
              value={form.dueDate instanceof Date ? form.dueDate.toISOString().split('T')[0] : ''}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: new Date(e.target.value) }))}
              style={{ ...inputStyle, width: '160px' }}
            />
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as Deadline['type'] }))}
              style={{ ...inputStyle, width: '170px' }}
            >
              {DEADLINE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Dossier"
              value={form.folder}
              onChange={(e) => setForm((f) => ({ ...f, folder: e.target.value }))}
              style={{ ...inputStyle, width: '140px' }}
            />
            <button
              onClick={submitDeadline}
              style={{
                padding: '6px 16px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-primary)',
                color: '#fff',
                fontSize: 'var(--text-sm)',
                fontWeight: 500,
              }}
            >
              {editingId != null ? 'Enregistrer' : 'Ajouter'}
            </button>
            <button
              onClick={resetForm}
              style={{
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-surface-offset)',
                color: 'var(--color-text-muted)',
                fontSize: 'var(--text-sm)',
              }}
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto p-6">
        {filtered.length === 0 && (
          <div
            className="flex flex-col items-center justify-center py-20"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <Clock size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
            <p style={{ fontSize: 'var(--text-base)' }}>Aucun délai{filter === 'upcoming' ? ' en cours' : filter === 'done' ? ' terminé' : ''}</p>
            <button
              onClick={() => setShowForm(true)}
              style={{
                marginTop: '12px',
                fontSize: 'var(--text-sm)',
                color: 'var(--color-primary)',
                textDecoration: 'underline',
              }}
            >
              Ajouter un délai
            </button>
          </div>
        )}

        {[...overdue, ...critical, ...warning, ...ok, ...done].map((dl) => {
          const days = getDaysUntil(dl.dueDate);
          const level = getAlertLevel(days, dl.done);
          const style = ALERT_STYLES[level];
          const typeInfo = DEADLINE_TYPES.find((t) => t.value === dl.type);
          return (
            <div
              key={dl.id ?? dl.title}
              className="flex items-center gap-4 mb-3 px-4 py-3 rounded"
              style={{
                background: style.bg,
                border: `1px solid ${style.border}`,
                borderRadius: 'var(--radius-md)',
                opacity: dl.done ? 0.6 : 1,
                transition: 'all var(--transition-interactive)',
              }}
            >
              {/* Checkbox */}
              <button
                onClick={() => dl.id && toggleDone(dl.id)}
                aria-label={dl.done ? 'Marquer non terminé' : 'Marquer terminé'}
                style={{ flexShrink: 0, color: dl.done ? 'var(--color-success)' : style.badge }}
              >
                <CheckCircle size={20} />
              </button>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    style={{
                      fontSize: 'var(--text-sm)',
                      fontWeight: 600,
                      color: 'var(--color-text)',
                      textDecoration: dl.done ? 'line-through' : 'none',
                    }}
                  >
                    {dl.title}
                  </span>
                  <span
                    style={{
                      fontSize: 'var(--text-xs)',
                      padding: '1px 7px',
                      borderRadius: 'var(--radius-full)',
                      background: style.badge,
                      color: '#fff',
                      fontWeight: 500,
                    }}
                  >
                    {dl.done
                      ? 'Terminé'
                      : days < 0
                      ? `J+${Math.abs(days)}`
                      : days === 0
                      ? "Aujourd'hui"
                      : `J-${days}`}
                  </span>
                  {typeInfo && (
                    <span
                      style={{
                        fontSize: 'var(--text-xs)',
                        color: 'var(--color-text-muted)',
                        border: '1px solid var(--color-border)',
                        padding: '1px 7px',
                        borderRadius: 'var(--radius-full)',
                      }}
                    >
                      {typeInfo.label}
                    </span>
                  )}
                </div>
                <div
                  className="flex items-center gap-3 mt-1"
                  style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}
                >
                  <span className="flex items-center gap-1">
                    <Calendar size={11} />
                    {dl.dueDate.toLocaleDateString('fr-FR', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                  {dl.folder && (
                    <span>
                      Dossier : <strong>{dl.folder}</strong>
                    </span>
                  )}
                </div>
              </div>

              {/* Alert icon */}
              {level === 'overdue' && (
                <AlertTriangle size={16} style={{ color: 'var(--color-error)', flexShrink: 0 }} />
              )}
              {level === 'critical' && (
                <Bell size={16} style={{ color: 'var(--color-error)', flexShrink: 0 }} />
              )}

              {/* Calendar sync */}
              {calendarConnected && !dl.done && (
                dl.googleEventId ? (
                  <button
                    onClick={() => removeFromCalendar(dl)}
                    disabled={syncingId === dl.id}
                    aria-label="Retirer de Google Agenda"
                    title="Retirer de Google Agenda"
                    style={{
                      flexShrink: 0,
                      color: 'var(--color-success)',
                      opacity: syncingId === dl.id ? 0.5 : 1,
                    }}
                  >
                    <CalendarCheck size={14} />
                  </button>
                ) : (
                  <button
                    onClick={() => pushToCalendar(dl)}
                    disabled={syncingId === dl.id}
                    aria-label="Ajouter à Google Agenda"
                    title="Ajouter à Google Agenda"
                    style={{
                      flexShrink: 0,
                      color: 'var(--color-text-muted)',
                      opacity: syncingId === dl.id ? 0.5 : 1,
                    }}
                  >
                    <Calendar size={14} />
                  </button>
                )
              )}

              {/* Edit */}
              <button
                onClick={() => startEdit(dl)}
                aria-label="Modifier le délai"
                title="Modifier"
                style={{ flexShrink: 0, color: 'var(--color-text-muted)' }}
              >
                <Pencil size={14} />
              </button>

              {/* Delete */}
              <button
                onClick={() => dl.id && deleteDeadline(dl.id)}
                aria-label="Supprimer le délai"
                title="Supprimer"
                style={{ flexShrink: 0, color: 'var(--color-text-faint)' }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: '180px',
  padding: '6px 10px',
  fontSize: 'var(--text-sm)',
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--color-text)',
  outline: 'none',
};
