/**
 * POST   /api/google-calendar
 *   { summary, description?, dueDate (ISO), durationMinutes?, allDay?, location?, calendarId? }
 * PATCH  /api/google-calendar?id=<eventId>&calendarId=<id>
 * DELETE /api/google-calendar?id=<eventId>&calendarId=<id>
 *
 * Quand `allDay` vaut `true` (par défaut si aucune heure n'est fournie), on
 * crée un événement « toute la journée ». Sinon on crée un événement timé
 * (durée par défaut 30 minutes si `durationMinutes` n'est pas fourni).
 *
 * `calendarId` est optionnel. Par défaut on retombe sur `primary`. Le
 * dialogue de création de délai pousse au calendrier « Mylaw » résolu via
 * /api/google-calendar/mylaw-calendar.
 */
import { NextRequest, NextResponse } from 'next/server';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const COOKIE_NAME = 'mylaw_google_productivity_rt';
const CAL_API_BASE = 'https://www.googleapis.com/calendar/v3/calendars';

async function getAccessToken(req: NextRequest): Promise<string | null> {
  const refreshToken = req.cookies.get(COOKIE_NAME)?.value;
  if (!refreshToken) return null;
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  });
  const tokens = await res.json();
  if (tokens.error) return null;
  return tokens.access_token as string;
}

function eventsUrl(calendarId: string | undefined): string {
  const id = encodeURIComponent(calendarId && calendarId.trim() ? calendarId : 'primary');
  return `${CAL_API_BASE}/${id}/events`;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function buildEventBody(input: {
  summary: string;
  description?: string;
  dueDate: string;
  durationMinutes?: number;
  allDay?: boolean;
  location?: string;
}) {
  const start = new Date(input.dueDate);
  if (Number.isNaN(start.getTime())) throw new Error('invalid_due_date');

  const isAllDay = input.allDay !== false
    && (input.allDay === true || (start.getHours() === 0 && start.getMinutes() === 0));

  // ── Événement timé ──
  if (!isAllDay) {
    const duration = input.durationMinutes && input.durationMinutes > 0
      ? input.durationMinutes
      : 30;
    const end = new Date(start.getTime() + duration * 60_000);
    return {
      summary: input.summary,
      description: input.description || undefined,
      location: input.location || undefined,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
    };
  }

  // ── Événement toute la journée ──
  // Google attend des dates `YYYY-MM-DD` (sans timezone), end = jour suivant.
  const next = new Date(start);
  next.setDate(next.getDate() + 1);
  return {
    summary: input.summary,
    description: input.description || undefined,
    location: input.location || undefined,
    start: { date: ymd(start) },
    end: { date: ymd(next) },
  };
}

export async function POST(req: NextRequest) {
  const access = await getAccessToken(req);
  if (!access) return NextResponse.json({ error: 'not_connected' }, { status: 401 });
  let body;
  let calendarId: string | undefined;
  try {
    const input = await req.json();
    calendarId = input.calendarId;
    body = buildEventBody(input);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'invalid_input' }, { status: 400 });
  }
  const res = await fetch(eventsUrl(calendarId), {
    method: 'POST',
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errTxt = await res.text().catch(() => '');
    return NextResponse.json({ error: 'calendar_create_failed', detail: errTxt }, { status: res.status });
  }
  const data = await res.json();
  return NextResponse.json({ event: data });
}

export async function PATCH(req: NextRequest) {
  const access = await getAccessToken(req);
  if (!access) return NextResponse.json({ error: 'not_connected' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  const calendarIdParam = req.nextUrl.searchParams.get('calendarId') || undefined;
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 });
  let body;
  let calendarId: string | undefined = calendarIdParam;
  try {
    const input = await req.json();
    calendarId = input.calendarId || calendarId;
    body = buildEventBody(input);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'invalid_input' }, { status: 400 });
  }
  const res = await fetch(`${eventsUrl(calendarId)}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return NextResponse.json({ error: 'calendar_update_failed' }, { status: res.status });
  const data = await res.json();
  return NextResponse.json({ event: data });
}

export async function DELETE(req: NextRequest) {
  const access = await getAccessToken(req);
  if (!access) return NextResponse.json({ error: 'not_connected' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  const calendarId = req.nextUrl.searchParams.get('calendarId') || undefined;
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 });
  const res = await fetch(`${eventsUrl(calendarId)}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${access}` },
  });
  if (!res.ok && res.status !== 204 && res.status !== 410) {
    return NextResponse.json({ error: 'calendar_delete_failed' }, { status: res.status });
  }
  return NextResponse.json({ ok: true });
}
