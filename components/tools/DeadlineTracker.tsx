'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Clock, Plus, Pencil, Trash2, AlertTriangle, CheckCircle, Calendar, Bell,
  CalendarCheck, Link as LinkIcon, X as CloseIcon, MapPin,
} from 'lucide-react';
import { db, getSetting, setSetting } from '@/lib/db';
import type { Deadline as DBDeadline, DeadlineType as DBDeadlineType } from '@/types';
import { DeadlineDialog, type DeadlineDraft } from './DeadlineDialog';
import {
  MYLAW_CAL_SETTING,
  ensureMylawCalendarId as resolveMylawCalendarId,
  clearCachedMylawCalendarId,
} from '@/lib/mylaw-calendar';

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

const PRESET_TYPE_VALUES: UIDeadlineType[] = [
  'péremption', 'forclusion', 'réponse', 'audience', 'autre',
];

interface Deadline {
  id?: number;
  title: string;
  dueDate: Date;
  /** Vrai = échéance toute la journée. */
  allDay: boolean;
  type: UIDeadlineType;
  /** Catégorie affichée (peut être un texte libre saisi par l'utilisateur). */
  typeLabel: string;
  folder?: string;
  folderId?: number;
  location?: string;
  notes?: string;
  done: boolean;
  createdAt: Date;
  googleEventId?: string;
  googleCalendarId?: string;
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

function categoryToType(label: string): UIDeadlineType {
  const trimmed = label.trim().toLowerCase();
  const match = PRESET_TYPE_VALUES.find((v) => v === trimmed);
  return match ?? 'autre';
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function combineDateTime(dateStr: string, timeStr: string): { date: Date; allDay: boolean } {
  // Construit une Date locale en évitant le décalage UTC du parser ISO.
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return { date: new Date(), allDay: true };
  if (timeStr) {
    const [hh, mm] = timeStr.split(':').map(Number);
    return {
      date: new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0),
      allDay: false,
    };
  }
  return { date: new Date(y, m - 1, d, 0, 0, 0, 0), allDay: true };
}

export function DeadlineTracker() {
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingInitial, setEditingInitial] = useState<Partial<DeadlineDraft> | undefined>(undefined);
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'done'>('upcoming');
  const [calendarConnected, setCalendarConnected] = useState<boolean | null>(null);
  const [syncingId, setSyncingId] = useState<number | null>(null);
  /**
   * Vrai quand l'utilisateur est connecté à Google mais que son token n'a
   * pas le scope `calendar` (full) requis pour créer le calendrier Mylaw.
   * Cas typique : l'utilisateur s'était connecté avant l'introduction du
   * calendrier dédié et son consentement initial ne couvrait que
   * `calendar.events`. On l'invite alors à reconnecter Google Agenda.
   */
  const [reauthNeeded, setReauthNeeded] = useState(false);

  const checkCalendar = useCallback(async () => {
    try {
      const res = await fetch('/api/google-productivity/token');
      setCalendarConnected(res.ok);
      // Si on est connecté mais qu'aucun id de calendrier n'est encore en
      // cache, on tente de le résoudre maintenant pour détecter un scope
      // OAuth insuffisant et proposer la reconnexion sans attendre la
      // création d'un délai.
      if (res.ok) {
        const cached = await getSetting<string>(MYLAW_CAL_SETTING, '');
        if (!cached) {
          const probe = await fetch('/api/google-calendar/mylaw-calendar');
          if (probe.status === 401 || probe.status === 403) {
            setReauthNeeded(true);
          } else if (probe.ok) {
            const data = await probe.json().catch(() => null);
            if (data?.calendarId) {
              await setSetting(MYLAW_CAL_SETTING, data.calendarId as string);
              setReauthNeeded(false);
            }
          }
        } else {
          setReauthNeeded(false);
        }
      }
    } catch {
      setCalendarConnected(false);
    }
  }, []);

  useEffect(() => {
    void migrateAndLoad();
    void checkCalendar();
  }, [checkCalendar]);

  // Retour OAuth : rafraîchir l'état de connexion. Si le user vient de se
  // (re)connecter, on essaie immédiatement de résoudre le calendrier Mylaw
  // pour basculer le flag `reauthNeeded` à false dès qu'il est accordé.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('gprod')) {
      const justConnected = sp.get('gprod') === 'connected';
      void checkCalendar();
      if (justConnected) {
        setReauthNeeded(false);
        // Tente de résoudre / créer le calendrier Mylaw maintenant que le
        // nouveau scope est accordé. Ne pas bloquer le rendu.
        void (async () => {
          const { id, reauth } = await resolveMylawCalendarId();
          if (reauth) setReauthNeeded(true);
          else if (!id) setReauthNeeded(false);
        })();
      }
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
    setReauthNeeded(false);
    // On oublie l'id du calendrier Mylaw : il sera re-résolu après re-connexion
    // (le calendrier côté Google subsiste mais on le retrouvera par son nom).
    await clearCachedMylawCalendarId();
  }

  /**
   * Déconnecte puis relance immédiatement le flow OAuth, ce qui forcera
   * Google à présenter à nouveau l'écran de consentement et à accorder le
   * scope `calendar` (nécessaire pour créer le calendrier Mylaw).
   */
  async function reconnectCalendar() {
    await fetch('/api/google-productivity/logout', { method: 'POST' });
    await clearCachedMylawCalendarId();
    connectCalendar();
  }

  async function pushToCalendar(dl: Deadline): Promise<{ eventId: string; calendarId: string } | null> {
    if (!calendarConnected) return null;
    // Si on n'a pas un événement déjà rattaché à un calendrier (édition),
    // on exige le calendrier Mylaw — on ne retombe PAS sur `primary` pour
    // éviter de polluer l'agenda principal de l'utilisateur.
    const targetCalendarId = dl.googleCalendarId || (await (async () => {
      const { id, reauth } = await resolveMylawCalendarId();
      if (reauth) setReauthNeeded(true);
      return id;
    })());
    if (!targetCalendarId) return null;
    const calendarId = targetCalendarId;
    const description = [
      dl.folder ? `Dossier : ${dl.folder}` : null,
      dl.typeLabel ? `Catégorie : ${dl.typeLabel}` : null,
      dl.notes || null,
    ].filter(Boolean).join('\n\n');
    const summary = `[${dl.typeLabel || 'Échéance'}] ${dl.title}`;
    const body = {
      summary,
      description: description || undefined,
      location: dl.location || undefined,
      dueDate: dl.dueDate.toISOString(),
      allDay: dl.allDay,
      calendarId,
    };
    const url = dl.googleEventId
      ? `/api/google-calendar?id=${encodeURIComponent(dl.googleEventId)}&calendarId=${encodeURIComponent(dl.googleCalendarId || calendarId)}`
      : '/api/google-calendar';
    const res = await fetch(url, {
      method: dl.googleEventId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const eventId = data.event?.id ?? dl.googleEventId;
    if (!eventId) return null;
    return { eventId, calendarId: dl.googleCalendarId || calendarId };
  }

  async function syncToCalendar(dl: Deadline) {
    if (!dl.id || !calendarConnected) return;
    setSyncingId(dl.id);
    try {
      const result = await pushToCalendar(dl);
      if (!result) return;
      const patch: Partial<DBDeadline> = {
        googleEventId: result.eventId,
        googleCalendarId: result.calendarId,
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
      const calendarId = dl.googleCalendarId || 'primary';
      await fetch(
        `/api/google-calendar?id=${encodeURIComponent(dl.googleEventId)}&calendarId=${encodeURIComponent(calendarId)}`,
        { method: 'DELETE' },
      );
      const patch: Partial<DBDeadline> = {
        googleEventId: undefined,
        googleCalendarId: undefined,
        googleSyncedAt: undefined,
      };
      await db.deadlines.update(dl.id, patch);
      setDeadlines((prev) =>
        prev.map((x) =>
          x.id === dl.id
            ? { ...x, googleEventId: undefined, googleCalendarId: undefined, googleSyncedAt: undefined }
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
      const mapped: Deadline[] = rows.map((r) => {
        const due = new Date(r.dueDate);
        const inferredAllDay = r.allDay ?? (due.getHours() === 0 && due.getMinutes() === 0);
        const uiType = DB_TO_UI_TYPE[r.type] ?? 'autre';
        return {
          id:               r.id,
          title:            r.title,
          dueDate:          due,
          allDay:           inferredAllDay,
          type:             uiType,
          typeLabel:        r.typeLabel || DEADLINE_TYPES.find((t) => t.value === uiType)?.label || 'Autre',
          folder:           r.dossier,
          folderId:         r.dossierId,
          location:         r.location,
          notes:            r.notes,
          done:             r.done,
          createdAt:        new Date(r.createdAt),
          googleEventId:    r.googleEventId,
          googleCalendarId: r.googleCalendarId,
          googleSyncedAt:   r.googleSyncedAt ? new Date(r.googleSyncedAt) : undefined,
        };
      });
      setDeadlines(mapped.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime()));
    } catch {}
  }

  function openCreate() {
    setEditingId(null);
    setEditingInitial({
      date: ymd(new Date()),
      time: '',
      category: 'autre',
    });
    setShowDialog(true);
  }

  function startEdit(dl: Deadline) {
    if (dl.id == null) return;
    setEditingId(dl.id);
    const draft: Partial<DeadlineDraft> = {
      title:     dl.title,
      date:      ymd(dl.dueDate),
      time:      dl.allDay
        ? ''
        : `${String(dl.dueDate.getHours()).padStart(2, '0')}:${String(dl.dueDate.getMinutes()).padStart(2, '0')}`,
      category:  dl.typeLabel || dl.type,
      dossier:   dl.folder ?? '',
      dossierId: dl.folderId,
      location:  dl.location ?? '',
      notes:     dl.notes ?? '',
    };
    setEditingInitial(draft);
    setShowDialog(true);
  }

  async function saveDraft(draft: DeadlineDraft) {
    const { date, allDay } = combineDateTime(draft.date, draft.time);
    const uiType = categoryToType(draft.category);
    const typeLabel = draft.category.trim() || DEADLINE_TYPES.find((t) => t.value === uiType)?.label || 'Autre';

    try {
      let saved: Deadline;
      if (editingId != null) {
        const existing = deadlines.find((d) => d.id === editingId);
        const patch: Partial<DBDeadline> = {
          title:        draft.title,
          dossier:      draft.dossier,
          dossierId:    draft.dossierId,
          dueDate:      date,
          allDay,
          type:         UI_TO_DB_TYPE[uiType],
          typeLabel,
          location:     draft.location || undefined,
          notes:        draft.notes || undefined,
        };
        await db.deadlines.update(editingId, patch);
        saved = {
          id:               editingId,
          title:            draft.title,
          dueDate:          date,
          allDay,
          type:             uiType,
          typeLabel,
          folder:           draft.dossier,
          folderId:         draft.dossierId,
          location:         draft.location || undefined,
          notes:            draft.notes || undefined,
          done:             existing?.done ?? false,
          createdAt:        existing?.createdAt ?? new Date(),
          googleEventId:    existing?.googleEventId,
          googleCalendarId: existing?.googleCalendarId,
          googleSyncedAt:   existing?.googleSyncedAt,
        };
      } else {
        const now = new Date();
        const record: Omit<DBDeadline, 'id'> = {
          title:     draft.title,
          dossier:   draft.dossier,
          dossierId: draft.dossierId,
          dueDate:   date,
          allDay,
          type:      UI_TO_DB_TYPE[uiType],
          typeLabel,
          location:  draft.location || undefined,
          notes:     draft.notes || undefined,
          done:      false,
          createdAt: now,
        };
        const newId = await db.deadlines.add(record as DBDeadline);
        saved = {
          id:        Number(newId),
          title:     record.title,
          dueDate:   record.dueDate,
          allDay,
          type:      uiType,
          typeLabel,
          folder:    record.dossier,
          folderId:  record.dossierId,
          location:  record.location,
          notes:     record.notes,
          done:      false,
          createdAt: now,
        };
      }

      // Pousse (ou met à jour) automatiquement vers Google Agenda si connecté.
      if (calendarConnected && saved.id != null && !saved.done) {
        const result = await pushToCalendar(saved);
        if (result) {
          saved.googleEventId    = result.eventId;
          saved.googleCalendarId = result.calendarId;
          saved.googleSyncedAt   = new Date();
          await db.deadlines.update(saved.id, {
            googleEventId:    saved.googleEventId,
            googleCalendarId: saved.googleCalendarId,
            googleSyncedAt:   saved.googleSyncedAt,
          });
        }
      }

      setDeadlines((prev) => {
        const without = prev.filter((d) => d.id !== saved.id);
        return [...without, saved].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
      });
    } catch {}
    setShowDialog(false);
    setEditingId(null);
    setEditingInitial(undefined);
  }

  async function toggleDone(id: number) {
    const dl = deadlines.find((d) => d.id === id);
    if (!dl) return;
    const wasPushed = !!dl.googleEventId;
    const nowDone = !dl.done;
    const updated = {
      ...dl,
      done: nowDone,
      googleEventId: nowDone ? undefined : dl.googleEventId,
      googleCalendarId: nowDone ? undefined : dl.googleCalendarId,
    };
    try {
      // Si on coche comme terminé, on retire l'événement distant en best-effort.
      if (nowDone && wasPushed) {
        try {
          const calendarId = dl.googleCalendarId || 'primary';
          await fetch(
            `/api/google-calendar?id=${encodeURIComponent(dl.googleEventId!)}&calendarId=${encodeURIComponent(calendarId)}`,
            { method: 'DELETE' },
          );
        } catch { /* best-effort */ }
      }
      await db.deadlines.update(id, {
        done: nowDone,
        googleEventId: nowDone ? undefined : dl.googleEventId,
        googleCalendarId: nowDone ? undefined : dl.googleCalendarId,
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
          const calendarId = dl.googleCalendarId || 'primary';
          await fetch(
            `/api/google-calendar?id=${encodeURIComponent(dl.googleEventId)}&calendarId=${encodeURIComponent(calendarId)}`,
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
            onClick={openCreate}
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

      {/* Bannière re-connexion : le user est connecté à Google mais avec
          l'ancien scope `calendar.events`, qui n'autorise pas la création
          du calendrier dédié « Mylaw ». On lui propose de se reconnecter
          pour accorder le scope complet. */}
      {calendarConnected && reauthNeeded && (
        <div
          className="flex items-center justify-between gap-3 px-6 py-3 border-b"
          style={{
            background: 'oklch(from var(--color-warning) l c h / 0.08)',
            borderColor: 'var(--color-border)',
            color: 'var(--color-text)',
            fontSize: 'var(--text-sm)',
          }}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} style={{ color: 'var(--color-warning)' }} />
            <span>
              Reconnectez Google Agenda pour créer le calendrier dédié
              « Mylaw » et y ranger vos délais (sinon ils sont ignorés).
            </span>
          </div>
          <button
            onClick={reconnectCalendar}
            style={{
              fontSize: 'var(--text-xs)',
              padding: '4px 12px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-primary)',
              color: '#fff',
              fontWeight: 500,
            }}
          >
            Reconnecter Google Agenda
          </button>
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
              onClick={openCreate}
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
                  {dl.typeLabel && (
                    <span
                      style={{
                        fontSize: 'var(--text-xs)',
                        color: 'var(--color-text-muted)',
                        border: '1px solid var(--color-border)',
                        padding: '1px 7px',
                        borderRadius: 'var(--radius-full)',
                      }}
                    >
                      {dl.typeLabel}
                    </span>
                  )}
                </div>
                <div
                  className="flex items-center gap-3 mt-1 flex-wrap"
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
                    {!dl.allDay && (
                      <>
                        {' · '}
                        {dl.dueDate.toLocaleTimeString('fr-FR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </>
                    )}
                  </span>
                  {dl.folder && (
                    <span>
                      Dossier : <strong>{dl.folder}</strong>
                    </span>
                  )}
                  {dl.location && (
                    <span className="flex items-center gap-1">
                      <MapPin size={11} />
                      {dl.location}
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
                    onClick={() => syncToCalendar(dl)}
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

      {/* Dialog */}
      <DeadlineDialog
        open={showDialog}
        editing={editingId != null}
        initial={editingInitial}
        onClose={() => {
          setShowDialog(false);
          setEditingId(null);
          setEditingInitial(undefined);
        }}
        onSave={saveDraft}
      />
    </div>
  );
}
