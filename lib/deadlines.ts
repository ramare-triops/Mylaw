/**
 * Helpers de persistance des délais (suivi des délais & raccourci
 * « Ajouter un délai » depuis un dossier ouvert). Centralise la logique
 * commune à plusieurs surfaces UI :
 *   1. insère le délai dans Dexie ;
 *   2. pousse l'événement dans Google Calendar (calendrier « Mylaw »)
 *      si l'utilisateur y est connecté avec un scope suffisant.
 */
import { db } from '@/lib/db';
import type { Deadline, DeadlineType } from '@/types';
import { ensureMylawCalendarId } from '@/lib/mylaw-calendar';
import type { DeadlineDraft } from '@/components/tools/DeadlineDialog';

const UI_TO_DB_TYPE: Record<string, DeadlineType> = {
  'péremption': 'peremption',
  'forclusion': 'forclusion',
  'réponse':    'reponse',
  'audience':   'audience',
  'autre':      'other',
};

const PRESET_LABELS: Record<string, string> = {
  'péremption': 'Péremption',
  'forclusion': 'Forclusion',
  'réponse':    'Délai de réponse',
  'audience':   'Audience',
  'autre':      'Autre',
};

function categoryToDbType(label: string): DeadlineType {
  return UI_TO_DB_TYPE[label.trim().toLowerCase()] ?? 'other';
}

function categoryToLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return 'Autre';
  return PRESET_LABELS[trimmed.toLowerCase()] ?? trimmed;
}

function combineDateTime(dateStr: string, timeStr: string): { date: Date; allDay: boolean } {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return { date: new Date(), allDay: true };
  if (timeStr) {
    const [hh, mm] = timeStr.split(':').map(Number);
    return { date: new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0), allDay: false };
  }
  return { date: new Date(y, m - 1, d, 0, 0, 0, 0), allDay: true };
}

export interface CreateDeadlineResult {
  id: number;
  pushedToCalendar: boolean;
}

/**
 * Persiste un délai en base puis le pousse dans Google Calendar si
 * possible. Best-effort pour la partie Google : un échec côté agenda
 * ne fait pas échouer la création locale.
 */
export async function createDeadlineFromDraft(draft: DeadlineDraft): Promise<CreateDeadlineResult> {
  const { date, allDay } = combineDateTime(draft.date, draft.time);
  const dbType = categoryToDbType(draft.category);
  const typeLabel = categoryToLabel(draft.category);

  const now = new Date();
  const record: Omit<Deadline, 'id'> = {
    title:     draft.title.trim(),
    dossier:   draft.dossier.trim(),
    dossierId: draft.dossierId,
    dueDate:   date,
    allDay,
    type:      dbType,
    typeLabel,
    location:  draft.location.trim() || undefined,
    notes:     draft.notes.trim() || undefined,
    done:      false,
    createdAt: now,
  };
  const newId = Number(await db.deadlines.add(record as Deadline));

  let pushedToCalendar = false;
  try {
    const tokenRes = await fetch('/api/google-productivity/token');
    if (!tokenRes.ok) return { id: newId, pushedToCalendar };
    const { id: calendarId } = await ensureMylawCalendarId();
    if (!calendarId) return { id: newId, pushedToCalendar };

    const description = [
      record.dossier ? `Dossier : ${record.dossier}` : null,
      typeLabel ? `Catégorie : ${typeLabel}` : null,
      record.notes || null,
    ].filter(Boolean).join('\n\n');

    const res = await fetch('/api/google-calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: `[${typeLabel || 'Échéance'}] ${record.title}`,
        description: description || undefined,
        location: record.location || undefined,
        dueDate: record.dueDate.toISOString(),
        allDay,
        calendarId,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const eventId = data.event?.id as string | undefined;
      if (eventId) {
        await db.deadlines.update(newId, {
          googleEventId: eventId,
          googleCalendarId: calendarId,
          googleSyncedAt: new Date(),
        });
        pushedToCalendar = true;
      }
    }
  } catch { /* best-effort */ }

  return { id: newId, pushedToCalendar };
}
