/**
 * GET    /api/drive/blob/[id]  — Télécharge un blob Drive (AppData).
 * DELETE /api/drive/blob/[id]  — Supprime un blob Drive.
 *
 * Le paramètre `[id]` est le `driveFileId` rendu par POST /api/drive/blob.
 * Le GET retourne le binaire brut avec son `Content-Type` d'origine ; le
 * DELETE retourne `{ok: true}` ou un 404 si le fichier n'existe plus.
 */
import { NextRequest, NextResponse } from 'next/server';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const COOKIE_NAME = 'mylaw_drive_rt';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';

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

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const accessToken = await getAccessToken(req);
  if (!accessToken) {
    return NextResponse.json({ error: 'non_authentifie' }, { status: 401 });
  }
  const driveFileId = params.id;
  if (!driveFileId) {
    return NextResponse.json({ error: 'missing_id' }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${DRIVE_FILES_URL}/${encodeURIComponent(driveFileId)}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (res.status === 404) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (!res.ok) {
      console.error(
        '[drive/blob GET] download failed',
        driveFileId,
        res.status,
        await res.text().catch(() => ''),
      );
      return NextResponse.json({ error: 'download_failed' }, { status: 500 });
    }
    const arrayBuffer = await res.arrayBuffer();
    const contentType =
      res.headers.get('Content-Type') ?? 'application/octet-stream';
    return new NextResponse(arrayBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(arrayBuffer.byteLength),
        'Cache-Control': 'private, no-cache',
      },
    });
  } catch (err) {
    console.error('[drive/blob GET]', err);
    return NextResponse.json({ error: 'download_failed' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const accessToken = await getAccessToken(req);
  if (!accessToken) {
    return NextResponse.json({ error: 'non_authentifie' }, { status: 401 });
  }
  const driveFileId = params.id;
  if (!driveFileId) {
    return NextResponse.json({ error: 'missing_id' }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${DRIVE_FILES_URL}/${encodeURIComponent(driveFileId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    if (res.status === 404) {
      // Idempotent : si le fichier n'existe plus, on considère que c'est
      // déjà supprimé. On répond 200 pour que l'appelant n'ait pas à
      // gérer ce cas distinctement.
      return NextResponse.json({ ok: true, alreadyMissing: true });
    }
    if (!res.ok && res.status !== 204) {
      console.error(
        '[drive/blob DELETE] failed',
        driveFileId,
        res.status,
        await res.text().catch(() => ''),
      );
      return NextResponse.json({ error: 'delete_failed' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[drive/blob DELETE]', err);
    return NextResponse.json({ error: 'delete_failed' }, { status: 500 });
  }
}
