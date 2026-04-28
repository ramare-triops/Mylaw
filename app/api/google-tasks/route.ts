/**
 * GET     /api/google-tasks            → liste les tâches de la liste MyLaw
 * POST    /api/google-tasks            → crée { title, notes? } dans MyLaw
 * PATCH   /api/google-tasks?id=...     → met à jour une tâche (status, title…)
 * DELETE  /api/google-tasks?id=...     → supprime la tâche
 *
 * Toutes les opérations ciblent une liste Google Tasks dédiée intitulée
 * « MyLaw ». Si elle n'existe pas chez l'utilisateur, elle est créée
 * automatiquement à la première écriture.
 *
 * Pour la rétro-compatibilité (jots déjà synchronisés sur @default avant
 * cette migration), chaque endpoint accepte un paramètre `?listId=` qui
 * force l'opération sur une liste précise.
 */
import { NextRequest, NextResponse } from 'next/server';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const COOKIE_NAME = 'mylaw_google_productivity_rt';
const TASKLISTS_API = 'https://tasks.googleapis.com/tasks/v1/users/@me/lists';
const MYLAW_LIST_TITLE = 'MyLaw';

function tasksApi(listId: string): string {
  return `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks`;
}

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

/**
 * Trouve la liste « MyLaw » chez l'utilisateur, ou la crée si elle n'existe
 * pas encore. Cache en mémoire process (éphémère) pour éviter un round-trip
 * supplémentaire sur chaque requête dans la même session serveur.
 */
const listIdCache = new Map<string, { id: string; at: number }>();
const LIST_CACHE_TTL = 10 * 60_000; // 10 minutes

async function getOrCreateMylawListId(
  accessToken: string,
  cacheKey: string,
): Promise<string | null> {
  const cached = listIdCache.get(cacheKey);
  if (cached && Date.now() - cached.at < LIST_CACHE_TTL) return cached.id;

  // Pagination défensive : Google Tasks renvoie au max 100 listes par
  // page. Inutile en pratique mais garantit qu'on ne crée pas de
  // doublon parce que la liste « MyLaw » serait sur la page 2.
  let pageToken: string | undefined;
  const allLists: { id?: string; title?: string }[] = [];
  for (let i = 0; i < 5; i++) {
    const url = new URL(TASKLISTS_API);
    url.searchParams.set('maxResults', '100');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const listRes = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!listRes.ok) return null;
    const data = await listRes.json();
    for (const item of data.items ?? []) allLists.push(item);
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  // Match insensible à la casse + trim. On a vu apparaître chez des
  // utilisateurs des listes « Mylaw », « MyLaw » ou « MyLaw  » (avec
  // espace final) : sans normalisation, le `===` strict d'origine
  // échouait et on créait une nouvelle liste à chaque ajout.
  const target = MYLAW_LIST_TITLE.trim().toLowerCase();
  const existing = allLists.find(
    (l) =>
      typeof l?.title === 'string' &&
      l.title.trim().toLowerCase() === target,
  );
  if (existing?.id) {
    listIdCache.set(cacheKey, { id: existing.id, at: Date.now() });
    return existing.id;
  }

  const createRes = await fetch(TASKLISTS_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: MYLAW_LIST_TITLE }),
  });
  if (!createRes.ok) return null;
  const created = await createRes.json();
  if (!created?.id) return null;
  listIdCache.set(cacheKey, { id: created.id, at: Date.now() });
  return created.id;
}

/**
 * Résout la liste cible d'une requête : soit ?listId= (override explicite
 * pour les opérations sur d'anciennes tâches @default), soit la liste MyLaw
 * dédiée. Renvoie aussi l'ID MyLaw résolu pour exposition au client.
 */
async function resolveListIds(
  req: NextRequest,
  accessToken: string,
): Promise<{ targetListId: string | null; mylawListId: string | null }> {
  const refreshToken = req.cookies.get(COOKIE_NAME)?.value ?? '';
  const cacheKey = refreshToken.slice(-24); // clé courte, unique par utilisateur
  const mylawListId = await getOrCreateMylawListId(accessToken, cacheKey);
  const override = req.nextUrl.searchParams.get('listId');
  return { targetListId: override || mylawListId, mylawListId };
}

export async function GET(req: NextRequest) {
  const access = await getAccessToken(req);
  if (!access) return NextResponse.json({ error: 'not_connected' }, { status: 401 });
  const { targetListId, mylawListId } = await resolveListIds(req, access);
  if (!targetListId) {
    return NextResponse.json({ error: 'list_resolve_failed' }, { status: 500 });
  }
  // Le client peut demander explicitement les tâches terminées pour
  // permettre la synchronisation bidirectionnelle (Google → Mylaw)
  // des cases cochées et des suppressions. Quand le paramètre est
  // présent, on remonte aussi les `hidden` (tâches que Google masque
  // automatiquement après complétion). Default conservateur : on ne
  // remonte que les tâches actives, pour ne pas changer le contrat
  // historique des autres consommateurs.
  const showCompleted = req.nextUrl.searchParams.get('showCompleted') === 'true';
  const url = new URL(tasksApi(targetListId));
  url.searchParams.set('maxResults', '100');
  if (showCompleted) {
    url.searchParams.set('showCompleted', 'true');
    url.searchParams.set('showHidden', 'true');
    // On limite aux tâches mises à jour ces 14 derniers jours pour
    // éviter de remonter une historique massive ; le client filtre
    // ensuite à 7 jours pour l'affichage.
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    url.searchParams.set('updatedMin', fourteenDaysAgo.toISOString());
  } else {
    url.searchParams.set('showCompleted', 'false');
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${access}` },
  });
  if (!res.ok) return NextResponse.json({ error: 'tasks_fetch_failed' }, { status: res.status });
  const data = await res.json();
  return NextResponse.json({ items: data.items ?? [], listId: mylawListId });
}

export async function POST(req: NextRequest) {
  const access = await getAccessToken(req);
  if (!access) return NextResponse.json({ error: 'not_connected' }, { status: 401 });
  const { title, notes } = await req.json();
  if (!title || !String(title).trim()) {
    return NextResponse.json({ error: 'title_required' }, { status: 400 });
  }
  const { targetListId, mylawListId } = await resolveListIds(req, access);
  if (!targetListId) {
    return NextResponse.json({ error: 'list_resolve_failed' }, { status: 500 });
  }
  const res = await fetch(tasksApi(targetListId), {
    method: 'POST',
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: String(title).trim(), notes: notes || undefined }),
  });
  if (!res.ok) return NextResponse.json({ error: 'tasks_create_failed' }, { status: res.status });
  const data = await res.json();
  return NextResponse.json({ task: data, listId: mylawListId });
}

export async function PATCH(req: NextRequest) {
  const access = await getAccessToken(req);
  if (!access) return NextResponse.json({ error: 'not_connected' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 });
  const { targetListId } = await resolveListIds(req, access);
  if (!targetListId) {
    return NextResponse.json({ error: 'list_resolve_failed' }, { status: 500 });
  }
  const body = await req.json();
  const res = await fetch(`${tasksApi(targetListId)}/${encodeURIComponent(id)}`, {
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
  const { targetListId } = await resolveListIds(req, access);
  if (!targetListId) {
    return NextResponse.json({ error: 'list_resolve_failed' }, { status: 500 });
  }
  const res = await fetch(`${tasksApi(targetListId)}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${access}` },
  });
  if (!res.ok && res.status !== 204 && res.status !== 404) {
    return NextResponse.json({ error: 'tasks_delete_failed' }, { status: res.status });
  }
  return NextResponse.json({ ok: true });
}
