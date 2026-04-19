/**
 * GET  /api/drive/sync  — Télécharge le backup depuis Drive
 * POST /api/drive/sync  — Uploade le backup vers Drive
 *
 * Optimisations :
 *   - Compression gzip server-side avant upload Drive (réduit ~10× la taille
 *     d'un backup JSON moyen).
 *   - Détection automatique du format au download (gzip ou JSON brut) pour la
 *     rétro-compatibilité avec les anciens backups.
 *   - ETag / modifiedTime remontés au client pour détecter les changements
 *     distants sans re-télécharger tout le backup.
 */
import { NextRequest, NextResponse } from 'next/server';
import { gzipSync, gunzipSync } from 'node:zlib';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const COOKIE_NAME = 'mylaw_drive_rt';
const DRIVE_FILE_NAME = 'mylaw-backup.json';
const DRIVE_LIST_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

// ─── OAuth ─────────────────────────────────────────────────────────────────

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

// ─── File resolution ───────────────────────────────────────────────────────

interface DriveFileMeta {
  id: string;
  modifiedTime?: string;
}

async function resolveFileMeta(accessToken: string): Promise<DriveFileMeta | null> {
  const res = await fetch(
    `${DRIVE_LIST_URL}?spaces=appDataFolder&fields=files(id,name,modifiedTime)&q=name+%3D+%27${DRIVE_FILE_NAME}%27`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const data = await res.json();
  const files = data.files ?? [];
  if (files.length === 0) return null;
  return { id: files[0].id, modifiedTime: files[0].modifiedTime };
}

async function createFile(accessToken: string): Promise<string> {
  const boundary = 'mylaw_boundary_314159';
  // Backup initial à la version courante, avec TOUTES les tables, pour éviter
  // que le premier upload ne parte d'un schéma incomplet (v2 sans bricks/labels).
  const emptyBackup = JSON.stringify({
    version: 3,
    exportedAt: new Date().toISOString(),
    documents: [], folders: [], snippets: [], deadlines: [],
    settings: {}, templates: [], tools: [], aiChats: [],
    bricks: [], infoLabels: [], sessions: [],
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

// ─── Gzip helpers ──────────────────────────────────────────────────────────

function isGzip(buf: Buffer): boolean {
  return buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b;
}

// ─── GET /api/drive/sync ───────────────────────────────────────────────────
// Retourne le backup (décompressé si nécessaire).
// Header `?metaOnly=1` : retourne uniquement {modifiedTime, size} pour le polling
// (économise la bande passante quand aucun changement distant).

export async function GET(req: NextRequest) {
  const accessToken = await getAccessToken(req);
  if (!accessToken) return NextResponse.json({ error: 'non_authentifie' }, { status: 401 });

  const metaOnly = req.nextUrl.searchParams.get('metaOnly') === '1';

  try {
    const meta = await resolveFileMeta(accessToken);
    if (!meta) return new NextResponse(null, { status: 204 });

    if (metaOnly) {
      return NextResponse.json({ modifiedTime: meta.modifiedTime ?? null });
    }

    const res = await fetch(
      `${DRIVE_LIST_URL}/${meta.id}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const buf = Buffer.from(await res.arrayBuffer());
    const json = isGzip(buf) ? gunzipSync(buf).toString('utf-8') : buf.toString('utf-8');
    const backup = JSON.parse(json);

    const response = NextResponse.json(backup);
    if (meta.modifiedTime) response.headers.set('X-Drive-Modified-Time', meta.modifiedTime);
    return response;
  } catch (err) {
    console.error('[drive/sync GET]', err);
    return NextResponse.json({ error: 'Erreur téléchargement' }, { status: 500 });
  }
}

// ─── POST /api/drive/sync ──────────────────────────────────────────────────
// Uploade le backup compressé en gzip. Retourne le modifiedTime final du fichier
// pour que le client puisse détecter ses propres uploads et les ignorer au poll.

export async function POST(req: NextRequest) {
  const accessToken = await getAccessToken(req);
  if (!accessToken) return NextResponse.json({ error: 'non_authentifie' }, { status: 401 });

  try {
    const backup = await req.json();
    backup.exportedAt = new Date().toISOString();

    const meta = await resolveFileMeta(accessToken);
    const fileId = meta?.id ?? await createFile(accessToken);

    const json = JSON.stringify(backup);
    const gzipped = gzipSync(json);

    const patchRes = await fetch(
      `${DRIVE_UPLOAD_URL}/${fileId}?uploadType=media&fields=id,modifiedTime`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          // On stocke en gzip. Le GET détecte via magic bytes.
          'Content-Type': 'application/gzip',
        },
        body: gzipped,
      },
    );

    if (!patchRes.ok) {
      console.error('[drive/sync POST] patch failed', patchRes.status, await patchRes.text().catch(() => ''));
      return NextResponse.json({ error: 'Erreur upload' }, { status: 500 });
    }
    const patchData = await patchRes.json().catch(() => ({}));

    return NextResponse.json({
      ok: true,
      modifiedTime: patchData.modifiedTime ?? null,
      exportedAt: backup.exportedAt,
      bytes: gzipped.length,
    });
  } catch (err) {
    console.error('[drive/sync POST]', err);
    return NextResponse.json({ error: 'Erreur upload' }, { status: 500 });
  }
}
