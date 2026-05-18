/**
 * GET /api/google-calendar/list
 *
 * Renvoie la liste des calendriers accessibles à l'utilisateur connecté
 * (champ `id`, `summary`, `primary`, `backgroundColor`). Sert à
 * construire l'iframe d'embed Google Agenda dans /agenda et à retrouver
 * l'email du calendrier principal (qui sert d'`src` pour le primary).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getGoogleAccessToken } from '@/lib/google-auth-server';

const CAL_LIST_URL = 'https://www.googleapis.com/calendar/v3/users/me/calendarList';

async function getAccessToken(req: NextRequest): Promise<string | null> {
  const result = await getGoogleAccessToken(req, 'productivity');
  return result.accessToken;
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
