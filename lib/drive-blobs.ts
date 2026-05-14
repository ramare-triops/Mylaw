/**
 * Helpers client pour la synchronisation des blobs binaires (pièces
 * jointes, sources de bordereau) via les routes `/api/drive/blob`.
 *
 * Un blob est un fichier Drive AppData séparé du backup JSON principal.
 * On suit son identité par `driveFileId` (rendu par Drive à la création)
 * et son intégrité par `contentHash` (SHA-256 hex du contenu local).
 * Tant que le hash local correspond au hash uploadé, on saute le push.
 */

export interface UploadBlobResult {
  /** Identifiant Drive du fichier (à stocker en DB). */
  driveFileId: string;
  /** SHA-256 hex du contenu uploadé (à stocker en DB). */
  contentHash: string;
}

/**
 * Calcule le hash SHA-256 hexadécimal d'un Blob. Utilisé pour détecter
 * les modifications locales et éviter les ré-uploads inutiles.
 */
export async function computeBlobHash(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Uploade un blob vers Drive. Si `driveFileId` est fourni, le fichier
 * existant est écrasé (PATCH) ; sinon un nouveau fichier Drive est créé.
 * Retourne le `driveFileId` final et le `contentHash` calculé.
 *
 * Le hash retourné est le SHA-256 du contenu envoyé : l'appelant doit
 * persister ces deux valeurs sur le record local pour que le prochain
 * cycle de sync sache qu'il n'y a rien à ré-uploader.
 */
export async function uploadBlobToDrive(
  blob: Blob,
  options: { driveFileId?: string; name?: string } = {},
): Promise<UploadBlobResult> {
  const hash = await computeBlobHash(blob);
  const form = new FormData();
  form.append('file', blob);
  if (options.driveFileId) form.append('driveFileId', options.driveFileId);
  if (options.name) form.append('name', options.name);

  const res = await fetch('/api/drive/blob', { method: 'POST', body: form });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Blob upload failed (${res.status}): ${detail}`);
  }
  const data = (await res.json()) as { driveFileId: string };
  return { driveFileId: data.driveFileId, contentHash: hash };
}

/**
 * Télécharge un blob depuis Drive et retourne son contenu sous forme
 * de Blob. Retourne `null` si le fichier n'existe plus côté Drive
 * (404), pour permettre à l'appelant de marquer le record local
 * comme orphelin sans faire crasher la sync.
 */
export async function downloadBlobFromDrive(
  driveFileId: string,
): Promise<Blob | null> {
  const res = await fetch(`/api/drive/blob/${encodeURIComponent(driveFileId)}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Blob download failed (${res.status})`);
  }
  return await res.blob();
}

/**
 * Supprime un blob côté Drive. Best-effort : on ne lance pas si le
 * fichier n'existe déjà plus, ni si Drive est temporairement
 * indisponible. La métadonnée locale (record sans `driveFileId`) est
 * la source de vérité pour le prochain cycle de sync.
 */
export async function deleteBlobFromDrive(
  driveFileId: string,
): Promise<void> {
  try {
    await fetch(`/api/drive/blob/${encodeURIComponent(driveFileId)}`, {
      method: 'DELETE',
    });
  } catch {
    // ignoré : l'appelant a déjà retiré le record en local, le ramasse-
    // miettes Drive sera ré-essayé au prochain cycle si besoin.
  }
}
