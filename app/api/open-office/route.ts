/**
 * POST /api/open-office
 *   Accepte un fichier Office (multipart/form-data, champ "file") et le
 *   stocke en mémoire avec un token à usage unique (TTL 5 min). Retourne
 *   { token } que le client utilise pour construire une URL ms-word:/
 *   ms-excel:/ms-powerpoint: via le GET /[token] ci-contre.
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { tokenStore, TOKEN_TTL_MS, MAX_UPLOAD_BYTES } from './store';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: 'missing_file' }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'file_too_large' }, { status: 413 });
    }
    const name = (formData.get('name') as string | null) ?? (file as File).name ?? 'document';
    const mime = file.type || 'application/octet-stream';

    const token = randomBytes(18).toString('base64url');
    const buf = Buffer.from(await file.arrayBuffer());

    tokenStore.set(token, {
      data: buf,
      mime,
      name,
      expires: Date.now() + TOKEN_TTL_MS,
    });

    return NextResponse.json({ token, expiresIn: TOKEN_TTL_MS });
  } catch (err) {
    return NextResponse.json(
      { error: 'internal_error', message: (err as Error).message },
      { status: 500 },
    );
  }
}
