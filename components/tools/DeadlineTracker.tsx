'use client';

import { useState, useEffect } from 'react';
import { Clock, Plus, Trash2, AlertTriangle, CheckCircle, Calendar, Bell } from 'lucide-react';
import { db } from '@/lib/db';

interface Deadline {
  id?: number;
  title: string;
  dueDate: Date;
  type: 'péremption' | 'forclusion' | 'réponse' | 'audience' | 'autre';
  folder?: string;
  notes?: string;
  done: boolean;
  createdAt: Date;
}

const DEADLINE_TYPES = [
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
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'done'>('upcoming');
  const [form, setForm] = useState<Omit<Deadline, 'id' | 'done' | 'createdAt'>>({
    title: '',
    dueDate: new Date(),
    type: 'autre',
    folder: '',
    notes: '',
  });

  useEffect(() => {
    loadDeadlines();
  }, []);

  async function loadDeadlines() {
    try {
      const rows = await db.table('sessions')
        .where('toolId').equals('deadline-tracker')
        .toArray();
      const mapped: Deadline[] = rows.map((r: any) => ({
        id: r.id,
        title: r.content?.title || '',
        dueDate: new Date(r.content?.dueDate || Date.now()),
        type: r.content?.type || 'autre',
        folder: r.content?.folder || '',
        notes: r.content?.notes || '',
        done: r.content?.done || false,
        createdAt: new Date(r.date),
      }));
      setDeadlines(mapped.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime()));
    } catch {}
  }

  async function addDeadline() {
    if (!form.title.trim()) return;
    const deadline: Deadline = { ...form, done: false, createdAt: new Date() };
    try {
      const id = await db.table('sessions').add({
        date: new Date(),
        toolId: 'deadline-tracker',
        content: { ...form, done: false },
        tags: [],
      });
      deadline.id = id as number;
      setDeadlines((prev) =>
        [...prev, deadline].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
      );
      setForm({ title: '', dueDate: new Date(), type: 'autre', folder: '', notes: '' });
      setShowForm(false);
    } catch {}
  }

  async function toggleDone(id: number) {
    const dl = deadlines.find((d) => d.id === id);
    if (!dl) return;
    const updated = { ...dl, done: !dl.done };
    try {
      await db.table('sessions').update(id, { content: { title: updated.title, dueDate: updated.dueDate, type: updated.type, folder: updated.folder, notes: updated.notes, done: updated.done } });
      setDeadlines((prev) => prev.map((d) => (d.id === id ? updated : d)));
    } catch {}
  }

  async function deleteDeadline(id: number) {
    try {
      await db.table('sessions').delete(id);
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
            onClick={() => setShowForm(true)}
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
              onClick={addDeadline}
              style={{
                padding: '6px 16px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-primary)',
                color: '#fff',
                fontSize: 'var(--text-sm)',
                fontWeight: 500,
              }}
            >
              Ajouter
            </button>
            <button
              onClick={() => setShowForm(false)}
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

              {/* Delete */}
              <button
                onClick={() => dl.id && deleteDeadline(dl.id)}
                aria-label="Supprimer le délai"
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
