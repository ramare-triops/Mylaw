/**
 * GET  /api/drive/sync  — Télécharge le backup depuis Drive
 * POST /api/drive/sync  — Uploade le backup vers Drive
 */
import { NextRequest, NextResponse } from 'next/server';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const COOKIE_NAME = 'mylaw_drive_rt';
const DRIVE_FILE_NAME = 'mylaw-backup.json';
const DRIVE_LIST_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

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
  const data = await res.json();
  return data.access_token ?? null;
}

async function resolveFileId(accessToken: string): Promise<string | null> {
  const res = await fetch(
    `${DRIVE_LIST_URL}?spaces=appDataFolder&fields=files(id,name)&q=name+%3D+%27${DRIVE_FILE_NAME}%27`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  const files = data.files ?? [];
  return files.length > 0 ? files[0].id : null;
}

async function createFile(accessToken: string): Promise<string> {
  const boundary = 'mylaw_boundary_314159';
  // Fichier initial sans exportedAt — sera écrasé au premier vrai upload
  const emptyBackup = JSON.stringify({
    version: 2,
    documents: [], folders: [], snippets: [], deadlines: [],
    settings: {}, templates: [], tools: [], aiChats: [],
  });
  const body = [
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    JSON.stringify({ name: DRIVE_FILE_NAME, parents: ['appDataFolder'] }),
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    emptyBackup,
    `--${boundary}--`,
  ].join('\r\n');

  const res = await fetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  const data = await res.json();
  return data.id;
}

// GET — Télécharger le backup
// Retourne null (204) si le fichier n'existe pas encore sur Drive,
// pour éviter d'écraser Dexie avec un backup vide.
export async function GET(req: NextRequest) {
  const accessToken = await getAccessToken(req);
  if (!accessToken) return NextResponse.json({ error: 'non_authentifie' }, { status: 401 });

  try {
    const fileId = await resolveFileId(accessToken);
    if (!fileId) {
      // Pas de fichier sur Drive : signaler explicitement l'absence
      return new NextResponse(null, { status: 204 });
    }

    const res = await fetch(
      `${DRIVE_LIST_URL}/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const backup = await res.json();
    return NextResponse.json(backup);
  } catch (err) {
    console.error('[drive/sync GET]', err);
    return NextResponse.json({ error: 'Erreur téléchargement' }, { status: 500 });
  }
}

// POST — Uploader le backup
export async function POST(req: NextRequest) {
  const accessToken = await getAccessToken(req);
  if (!accessToken) return NextResponse.json({ error: 'non_authentifie' }, { status: 401 });

  try {
    const backup = await req.json();
    backup.exportedAt = new Date().toISOString();

    let fileId = await resolveFileId(accessToken);
    if (!fileId) fileId = await createFile(accessToken);

    await fetch(`${DRIVE_UPLOAD_URL}/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(backup),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[drive/sync POST]', err);
    return NextResponse.json({ error: 'Erreur upload' }, { status: 500 });
  }
}
