/**
 * POST /api/google-calendar               → crée un événement { summary, description?, dueDate (ISO), durationMinutes? }
 * PATCH /api/google-calendar?id=<eventId> → met à jour un événement existant
 * DELETE /api/google-calendar?id=...      → supprime l'événement
 *
 * Calendrier ciblé : primary. Les events créés sont all-day si aucune
 * `durationMinutes` n'est fournie (cas typique d'un délai juridique).
 */
import { NextRequest, NextResponse } from 'next/server';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const COOKIE_NAME = 'mylaw_google_productivity_rt';
const CAL_API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

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

function buildEventBody(input: {
  summary: string;
  description?: string;
  dueDate: string;
  durationMinutes?: number;
}) {
  const start = new Date(input.dueDate);
  if (Number.isNaN(start.getTime())) throw new Error('invalid_due_date');
  if (input.durationMinutes && input.durationMinutes > 0) {
    const end = new Date(start.getTime() + input.durationMinutes * 60_000);
    return {
      summary: input.summary,
      description: input.description || undefined,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
    };
  }
  // All-day event : Google attend { date: 'YYYY-MM-DD' } en UTC date only.
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, '0');
  const d = String(start.getDate()).padStart(2, '0');
  const day = `${y}-${m}-${d}`;
  // Pour all-day, end = jour suivant (convention Google).
  const next = new Date(start);
  next.setDate(next.getDate() + 1);
  const y2 = next.getFullYear();
  const m2 = String(next.getMonth() + 1).padStart(2, '0');
  const d2 = String(next.getDate()).padStart(2, '0');
  return {
    summary: input.summary,
    description: input.description || undefined,
    start: { date: day },
    end: { date: `${y2}-${m2}-${d2}` },
  };
}

export async function POST(req: NextRequest) {
  const access = await getAccessToken(req);
  if (!access) return NextResponse.json({ error: 'not_connected' }, { status: 401 });
  let body;
  try {
    const input = await req.json();
    body = buildEventBody(input);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'invalid_input' }, { status: 400 });
  }
  const res = await fetch(CAL_API, {
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
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 });
  let body;
  try {
    const input = await req.json();
    body = buildEventBody(input);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'invalid_input' }, { status: 400 });
  }
  const res = await fetch(`${CAL_API}/${encodeURIComponent(id)}`, {
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
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 });
  const res = await fetch(`${CAL_API}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${access}` },
  });
  if (!res.ok && res.status !== 204 && res.status !== 410) {
    return NextResponse.json({ error: 'calendar_delete_failed' }, { status: res.status });
  }
  return NextResponse.json({ ok: true });
}
