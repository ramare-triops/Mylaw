/**
 * Capture d'écran via l'API navigateur `getDisplayMedia`.
 *
 * Sur Windows, le navigateur affiche le sélecteur natif d'écran/fenêtre/onglet
 * (le même que celui utilisé par les outils de partage d'écran type Teams) —
 * c'est le pendant web de l'outil Capture d'écran de Windows. L'utilisateur
 * choisit la source ; on capture une seule frame puis on coupe le flux.
 *
 * Renvoie un Blob image PNG (ou null si l'utilisateur a annulé).
 */
export async function captureScreenshot(): Promise<Blob | null> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('Capture d\'écran non disponible dans ce navigateur.');
  }

  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 1 },
      audio: false,
    });
  } catch (err) {
    // L'utilisateur a annulé la sélection ou refusé la permission.
    if ((err as Error).name === 'NotAllowedError' || (err as Error).name === 'AbortError') {
      return null;
    }
    throw err;
  }

  try {
    // On rattache le flux à une <video> hors-écran pour récupérer la première
    // frame une fois que la vidéo a chargé ses métadonnées.
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();

    // Attend une frame pour s'assurer que la vidéo a bien démarré.
    await new Promise<void>((resolve) => {
      if (video.readyState >= 2) resolve();
      else video.onloadeddata = () => resolve();
    });

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Impossible d\'obtenir un contexte canvas.');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    });
  } finally {
    // On coupe systématiquement le flux pour éviter le voyant rouge persistant.
    stream.getTracks().forEach((t) => t.stop());
  }
}

/** Convertit un Blob image en data URL pour insertion dans TipTap. */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
