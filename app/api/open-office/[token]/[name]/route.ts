/**
 * GET /api/open-office/[token]/[name]
 *   Sert le fichier Office associé au token. Le segment `[name]` n'est pas
 *   utilisé pour la recherche (seul le token identifie l'entrée) ; il sert
 *   uniquement à donner une extension `.docx` / `.xlsx` / `.pptx` à l'URL
 *   publique. Word/Excel/PowerPoint refusent d'ouvrir une URL sans
 *   extension reconnue (« Office ne reconnaît pas la commande »).
 *
 * Le token n'est PAS consommé après le premier GET : Office peut faire
 * plusieurs requêtes (HEAD + GET range, etc.). Le TTL du store limite
 * naturellement la fenêtre d'exposition.
 */
import { NextRequest, NextResponse } from 'next/server';
import { tokenStore } from '../../store';

export const runtime = 'nodejs';

function buildHeaders(mime: string, name: string, length: number): Headers {
  const headers = new Headers();
  headers.set('Content-Type', mime);
  headers.set(
    'Content-Disposition',
    `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
  );
  headers.set('Content-Length', String(length));
  // Office fetch parfois depuis un contexte cross-origin : on autorise.
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Cache-Control', 'no-store');
  return headers;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string; name: string } },
) {
  const entry = tokenStore.get(params.token);
  if (!entry) return new NextResponse('Not found', { status: 404 });
  if (entry.expires < Date.now()) {
    tokenStore.delete(params.token);
    return new NextResponse('Expired', { status: 410 });
  }
  const ab = entry.data.buffer.slice(
    entry.data.byteOffset,
    entry.data.byteOffset + entry.data.byteLength,
  ) as ArrayBuffer;
  return new NextResponse(ab, {
    status: 200,
    headers: buildHeaders(entry.mime, entry.name, entry.data.byteLength),
  });
}

export async function HEAD(
  _req: NextRequest,
  { params }: { params: { token: string; name: string } },
) {
  const entry = tokenStore.get(params.token);
  if (!entry) return new NextResponse(null, { status: 404 });
  if (entry.expires < Date.now()) {
    tokenStore.delete(params.token);
    return new NextResponse(null, { status: 410 });
  }
  return new NextResponse(null, {
    status: 200,
    headers: buildHeaders(entry.mime, entry.name, entry.data.byteLength),
  });
}

export async function OPTIONS() {
  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  headers.set('Access-Control-Allow-Headers', '*');
  return new NextResponse(null, { status: 204, headers });
}
