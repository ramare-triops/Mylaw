/**
 * POST /api/drive/blob — Uploade un blob binaire vers Google Drive (AppData).
 *
 * Format de requête : multipart/form-data
 *   - `file`         : le binaire à uploader
 *   - `driveFileId`  : (optionnel) si fourni, le fichier Drive existant est
 *                      PATCH-é (overwrite) ; sinon un nouveau fichier est créé.
 *   - `name`         : (optionnel) nom logique côté serveur (purement
 *                      informatif, Drive AppData ne l'expose pas ailleurs).
 *
 * Réponse : `{ driveFileId, modifiedTime, size }`.
 *
 * Modèle de stockage : chaque blob a son propre fichier dans le dossier
 * AppData de l'utilisateur, à côté du backup JSON `mylaw-backup.json`. Le
 * nom de stockage est `mylaw-blob-<uuid>.bin` pour éviter toute collision.
 *
 * Pourquoi pas inline dans le JSON ?  Les blobs (PDF, images, DOCX) sont
 * trop lourds pour rentrer dans un JSON unique (10–100 MB total facile).
 * Ce schéma permet une synchro fine, fichier par fichier, avec
 * compression Drive et dédup possible côté hash.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getGoogleAccessToken } from '@/lib/google-auth-server';

const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const BLOB_NAME_PREFIX = 'mylaw-blob-';

async function getAccessToken(req: NextRequest): Promise<string | null> {
  const result = await getGoogleAccessToken(req, 'drive');
  return result.accessToken;
}

function randomBlobName(): string {
  // Nom unique : pas de risque de collision même si l'utilisateur uploade
  // 100 fichiers en parallèle.
  const u = (globalThis.crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2) + Date.now().toString(36)) as string;
  return `${BLOB_NAME_PREFIX}${u}.bin`;
}

async function createBlobFile(
  accessToken: string,
  body: ArrayBuffer,
  contentType: string,
): Promise<{ id: string; modifiedTime: string | null }> {
  const boundary = `mylaw_blob_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  // Construction du body multipart côté Node sans dépendance externe :
  // on concatène header JSON + payload binaire dans un Buffer.
  const meta = JSON.stringify({
    name: randomBlobName(),
    parents: ['appDataFolder'],
  });
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${meta}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--\r\n`);

  const merged = new Uint8Array(head.byteLength + body.byteLength + tail.byteLength);
  merged.set(head, 0);
  merged.set(new Uint8Array(body), head.byteLength);
  merged.set(tail, head.byteLength + body.byteLength);

  const res = await fetch(
    `${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id,modifiedTime`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: merged,
    },
  );
  if (!res.ok) {
    throw new Error(`Drive blob upload (create) failed: ${res.status}`);
  }
  const data = await res.json();
  return {
    id: data.id as string,
    modifiedTime: (data.modifiedTime as string) ?? null,
  };
}

async function patchBlobFile(
  accessToken: string,
  driveFileId: string,
  body: ArrayBuffer,
  contentType: string,
): Promise<{ id: string; modifiedTime: string | null }> {
  const res = await fetch(
    `${DRIVE_UPLOAD_URL}/${driveFileId}?uploadType=media&fields=id,modifiedTime`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': contentType || 'application/octet-stream',
      },
      body,
    },
  );
  if (!res.ok) {
    // Si le fichier n'existe plus (404), l'appelant pourra recréer.
    if (res.status === 404) {
      throw Object.assign(new Error('not_found'), { code: 404 });
    }
    throw new Error(`Drive blob upload (patch) failed: ${res.status}`);
  }
  const data = await res.json();
  return {
    id: data.id as string,
    modifiedTime: (data.modifiedTime as string) ?? null,
  };
}

export async function POST(req: NextRequest) {
  const accessToken = await getAccessToken(req);
  if (!accessToken) {
    return NextResponse.json({ error: 'non_authentifie' }, { status: 401 });
  }

  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: 'missing_file' }, { status: 400 });
    }
    const driveFileId = (form.get('driveFileId') as string | null) || null;
    const contentType = file.type || 'application/octet-stream';
    const body = await file.arrayBuffer();

    let result: { id: string; modifiedTime: string | null };
    if (driveFileId) {
      try {
        result = await patchBlobFile(accessToken, driveFileId, body, contentType);
      } catch (err: unknown) {
        // Si le fichier a été supprimé côté Drive, on recrée.
        if ((err as { code?: number }).code === 404) {
          result = await createBlobFile(accessToken, body, contentType);
        } else {
          throw err;
        }
      }
    } else {
      result = await createBlobFile(accessToken, body, contentType);
    }

    return NextResponse.json({
      driveFileId: result.id,
      modifiedTime: result.modifiedTime,
      size: body.byteLength,
    });
  } catch (err) {
    console.error('[drive/blob POST]', err);
    return NextResponse.json({ error: 'upload_failed' }, { status: 500 });
  }
}
