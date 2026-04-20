/**
 * GET /api/open-office/[token]
 *   Sert le fichier Office associé au token. Appelé soit par le client
 *   (préflight) soit directement par Word/Excel/PowerPoint via le
 *   protocole ms-word/ms-excel/ms-powerpoint.
 *
 * Le token n'est PAS consommé après le premier GET : Word peut faire
 * plusieurs requêtes (HEAD + GET range) pour l'ouverture. Le TTL 5 min
 * du store limite naturellement la fenêtre d'exposition.
 */
import { NextRequest, NextResponse } from 'next/server';
import { tokenStore } from '../store';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } },
) {
  const entry = tokenStore.get(params.token);
  if (!entry) return new NextResponse('Not found', { status: 404 });
  if (entry.expires < Date.now()) {
    tokenStore.delete(params.token);
    return new NextResponse('Expired', { status: 410 });
  }

  const headers = new Headers();
  headers.set('Content-Type', entry.mime);
  headers.set(
    'Content-Disposition',
    `inline; filename*=UTF-8''${encodeURIComponent(entry.name)}`,
  );
  headers.set('Content-Length', String(entry.data.byteLength));
  // Word/Excel fetchent parfois depuis des contextes cross-origin ; on laisse passer.
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Cache-Control', 'no-store');

  // On passe un ArrayBuffer (BodyInit standard DOM) : on extrait la vue du
  // Buffer Node pour éviter les conflits de typage entre les deux API.
  const ab = entry.data.buffer.slice(
    entry.data.byteOffset,
    entry.data.byteOffset + entry.data.byteLength,
  ) as ArrayBuffer;
  return new NextResponse(ab, { status: 200, headers });
}

export async function HEAD(
  _req: NextRequest,
  { params }: { params: { token: string } },
) {
  const entry = tokenStore.get(params.token);
  if (!entry) return new NextResponse(null, { status: 404 });
  if (entry.expires < Date.now()) {
    tokenStore.delete(params.token);
    return new NextResponse(null, { status: 410 });
  }
  const headers = new Headers();
  headers.set('Content-Type', entry.mime);
  headers.set('Content-Length', String(entry.data.byteLength));
  headers.set('Access-Control-Allow-Origin', '*');
  return new NextResponse(null, { status: 200, headers });
}
