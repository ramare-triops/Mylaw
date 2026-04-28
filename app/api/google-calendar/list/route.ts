/**
 * GET /api/google-calendar/list
 *
 * Renvoie la liste des calendriers accessibles à l'utilisateur connecté
 * (champ `id`, `summary`, `primary`, `backgroundColor`). Sert à
 * construire l'iframe d'embed Google Agenda dans /agenda et à retrouver
 * l'email du calendrier principal (qui sert d'`src` pour le primary).
 */
import { NextRequest, NextResponse } from 'next/server';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const COOKIE_NAME = 'mylaw_google_productivity_rt';
const CAL_LIST_URL = 'https://www.googleapis.com/calendar/v3/users/me/calendarList';

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

export async function GET(req: NextRequest) {
  const access = await getAccessToken(req);
  if (!access) {
    return NextResponse.json({ error: 'not_connected' }, { status: 401 });
  }
  const res = await fetch(CAL_LIST_URL, {
    headers: { Authorization: `Bearer ${access}` },
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      return NextResponse.json({ error: 'insufficient_scope' }, { status: 403 });
    }
    return NextResponse.json({ error: 'calendar_list_failed' }, { status: res.status });
  }
  const data = await res.json();
  const items = Array.isArray(data?.items) ? data.items : [];
  const calendars = items.map((c: any) => ({
    id: c.id as string,
    summary: c.summary as string,
    primary: Boolean(c.primary),
    backgroundColor: c.backgroundColor as string | undefined,
    selected: c.selected !== false,
  }));
  return NextResponse.json({ calendars });
}
