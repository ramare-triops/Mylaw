/**
 * GET  /api/google-tasks          → liste les tâches de la liste par défaut (@default)
 * POST /api/google-tasks          → crée une tâche { title, notes? } dans @default
 * PATCH /api/google-tasks?id=...  → met à jour (ex. { status: 'completed' | 'needsAction', title, notes })
 * DELETE /api/google-tasks?id=... → supprime la tâche
 *
 * Proxy serveur qui rafraîchit l'access_token via le cookie HttpOnly puis
 * appelle l'API Google Tasks v1. Le client n'a jamais accès au refresh_token.
 */
import { NextRequest, NextResponse } from 'next/server';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const COOKIE_NAME = 'mylaw_google_productivity_rt';
const TASKS_API = 'https://tasks.googleapis.com/tasks/v1/lists/@default/tasks';

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
  if (!access) return NextResponse.json({ error: 'not_connected' }, { status: 401 });
  const res = await fetch(`${TASKS_API}?maxResults=20&showCompleted=false`, {
    headers: { Authorization: `Bearer ${access}` },
  });
  if (!res.ok) return NextResponse.json({ error: 'tasks_fetch_failed' }, { status: res.status });
  const data = await res.json();
  return NextResponse.json({ items: data.items ?? [] });
}

export async function POST(req: NextRequest) {
  const access = await getAccessToken(req);
  if (!access) return NextResponse.json({ error: 'not_connected' }, { status: 401 });
  const { title, notes } = await req.json();
  if (!title || !String(title).trim()) {
    return NextResponse.json({ error: 'title_required' }, { status: 400 });
  }
  const res = await fetch(TASKS_API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: String(title).trim(), notes: notes || undefined }),
  });
  if (!res.ok) return NextResponse.json({ error: 'tasks_create_failed' }, { status: res.status });
  const data = await res.json();
  return NextResponse.json({ task: data });
}

export async function PATCH(req: NextRequest) {
  const access = await getAccessToken(req);
  if (!access) return NextResponse.json({ error: 'not_connected' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 });
  const body = await req.json();
  const res = await fetch(`${TASKS_API}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return NextResponse.json({ error: 'tasks_update_failed' }, { status: res.status });
  const data = await res.json();
  return NextResponse.json({ task: data });
}

export async function DELETE(req: NextRequest) {
  const access = await getAccessToken(req);
  if (!access) return NextResponse.json({ error: 'not_connected' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 });
  const res = await fetch(`${TASKS_API}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${access}` },
  });
  if (!res.ok && res.status !== 204) {
    return NextResponse.json({ error: 'tasks_delete_failed' }, { status: res.status });
  }
  return NextResponse.json({ ok: true });
}
