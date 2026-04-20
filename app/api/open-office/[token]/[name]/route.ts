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

/**
 * MIME canonique basé sur l'extension — certains navigateurs ne savent pas
 * identifier les .docx correctement (on récupère `application/zip` ou rien).
 * Word refuse d'ouvrir un fichier si le Content-Type ne correspond pas à
 * ce qu'il attend.
 */
const OFFICE_CANONICAL_MIME: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc:  'application/msword',
  docm: 'application/vnd.ms-word.document.macroEnabled.12',
  dotx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls:  'application/vnd.ms-excel',
  xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt:  'application/vnd.ms-powerpoint',
  pptm: 'application/vnd.ms-powerpoint.presentation.macroEnabled.12',
};

function canonicalMime(nameFromPath: string, storedMime: string): string {
  const ext = nameFromPath.split('.').pop()?.toLowerCase() ?? '';
  return OFFICE_CANONICAL_MIME[ext] ?? storedMime;
}

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
  headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  headers.set('Access-Control-Allow-Headers', '*');
  headers.set('Cache-Control', 'no-store');
  // Certaines versions de Word inspectent ces headers pour accepter l'URL.
  headers.set('Accept-Ranges', 'bytes');
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
  const mime = canonicalMime(params.name, entry.mime);
  return new NextResponse(ab, {
    status: 200,
    headers: buildHeaders(mime, entry.name, entry.data.byteLength),
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
  const mime = canonicalMime(params.name, entry.mime);
  return new NextResponse(null, {
    status: 200,
    headers: buildHeaders(mime, entry.name, entry.data.byteLength),
  });
}

export async function OPTIONS() {
  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  headers.set('Access-Control-Allow-Headers', '*');
  return new NextResponse(null, { status: 204, headers });
}
