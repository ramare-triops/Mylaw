/**
 * GET /api/google-calendar/mylaw-calendar
 *
 * Renvoie l'identifiant du calendrier « Mylaw » dans le compte Google de
 * l'utilisateur. S'il n'existe pas encore, on le crée. Le client peut
 * mémoriser cet id pour éviter d'appeler la calendarList à chaque
 * échéance créée.
 */
import { NextRequest, NextResponse } from 'next/server';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const COOKIE_NAME = 'mylaw_google_productivity_rt';
const CAL_LIST_URL = 'https://www.googleapis.com/calendar/v3/users/me/calendarList';
const CAL_CREATE_URL = 'https://www.googleapis.com/calendar/v3/calendars';

const MYLAW_SUMMARY = 'Mylaw';
const MYLAW_DESCRIPTION = 'Échéances et délais juridiques synchronisés depuis Mylaw.';

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

async function findMylawCalendar(access: string): Promise<string | null> {
  const res = await fetch(CAL_LIST_URL, {
    headers: { Authorization: `Bearer ${access}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const items = Array.isArray(data?.items) ? data.items : [];
  const match = items.find(
    (c: any) =>
      typeof c?.summary === 'string' &&
      c.summary.trim().toLowerCase() === MYLAW_SUMMARY.toLowerCase(),
  );
  return match?.id ?? null;
}

async function createMylawCalendar(access: string): Promise<string | null> {
  const res = await fetch(CAL_CREATE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${access}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: MYLAW_SUMMARY,
      description: MYLAW_DESCRIPTION,
      timeZone: 'Europe/Paris',
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.id ?? null;
}

export async function GET(req: NextRequest) {
  const access = await getAccessToken(req);
  if (!access) {
    return NextResponse.json({ error: 'not_connected' }, { status: 401 });
  }

  const existing = await findMylawCalendar(access);
  if (existing) {
    return NextResponse.json({ calendarId: existing, created: false });
  }

  const created = await createMylawCalendar(access);
  if (!created) {
    return NextResponse.json({ error: 'calendar_create_failed' }, { status: 500 });
  }
  return NextResponse.json({ calendarId: created, created: true });
}
