/**
 * GET /api/google-calendar/mylaw-calendar
 *
 * Renvoie l'identifiant du calendrier « Mylaw » dans le compte Google de
 * l'utilisateur. S'il n'existe pas encore, on le crée. Le client peut
 * mémoriser cet id pour éviter d'appeler la calendarList à chaque
 * échéance créée.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getGoogleAccessToken } from '@/lib/google-auth-server';

const CAL_LIST_URL = 'https://www.googleapis.com/calendar/v3/users/me/calendarList';
const CAL_CREATE_URL = 'https://www.googleapis.com/calendar/v3/calendars';

const MYLAW_SUMMARY = 'Mylaw';
const MYLAW_DESCRIPTION = 'Échéances et délais juridiques synchronisés depuis Mylaw.';

async function getAccessToken(req: NextRequest): Promise<string | null> {
  const result = await getGoogleAccessToken(req, 'productivity');
  return result.accessToken;
}

type ApiOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; reason: 'insufficient_scope' | 'failed'; detail?: string };

async function findMylawCalendar(access: string): Promise<ApiOutcome<string | null>> {
  const res = await fetch(CAL_LIST_URL, {
    headers: { Authorization: `Bearer ${access}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: 403, reason: 'insufficient_scope', detail: text };
    }
    return { ok: false, status: res.status, reason: 'failed', detail: text };
  }
  const data = await res.json();
  const items = Array.isArray(data?.items) ? data.items : [];
  const match = items.find(
    (c: any) =>
      typeof c?.summary === 'string' &&
      c.summary.trim().toLowerCase() === MYLAW_SUMMARY.toLowerCase(),
  );
  return { ok: true, value: match?.id ?? null };
}

async function createMylawCalendar(access: string): Promise<ApiOutcome<string>> {
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
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: 403, reason: 'insufficient_scope', detail: text };
    }
    return { ok: false, status: res.status, reason: 'failed', detail: text };
  }
  const data = await res.json();
  if (!data?.id) {
    return { ok: false, status: 500, reason: 'failed', detail: 'no_id' };
  }
  return { ok: true, value: data.id as string };
}

export async function GET(req: NextRequest) {
  const access = await getAccessToken(req);
  if (!access) {
    return NextResponse.json({ error: 'not_connected' }, { status: 401 });
  }

  // 1) Recherche du calendrier déjà existant.
  const found = await findMylawCalendar(access);
  if (!found.ok) {
    return NextResponse.json(
      { error: found.reason, detail: found.detail },
      { status: found.status },
    );
  }
  if (found.value) {
    return NextResponse.json({ calendarId: found.value, created: false });
  }

  // 2) Sinon création.
  const created = await createMylawCalendar(access);
  if (!created.ok) {
    return NextResponse.json(
      { error: created.reason, detail: created.detail },
      { status: created.status },
    );
  }
  return NextResponse.json({ calendarId: created.value, created: true });
}
