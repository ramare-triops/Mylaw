/**
 * Enregistrement audio via MediaRecorder.
 *
 * Usage typique :
 *   const recorder = await startAudioRecording()
 *   // … plus tard …
 *   const { blob, mimeType, durationMs } = await recorder.stop()
 *
 * Le format dépend du navigateur :
 *   - Chrome / Edge / Firefox  → audio/webm;codecs=opus
 *   - Safari récent            → audio/mp4
 * `mimeType` du résultat reflète ce qui a réellement été utilisé.
 */

export interface AudioRecording {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

export interface ActiveRecording {
  /** Coupe l'enregistrement et retourne le blob final. */
  stop: () => Promise<AudioRecording>;
  /** Coupe et jette l'enregistrement (libère le micro). */
  cancel: () => void;
  /** Stream actif — utile pour brancher un VU-meter par ex. */
  stream: MediaStream;
}

const PREFERRED_MIMES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/ogg;codecs=opus',
];

function pickSupportedMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  for (const m of PREFERRED_MIMES) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return undefined;
}

export async function startAudioRecording(): Promise<ActiveRecording> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('Enregistrement audio non disponible dans ce navigateur.');
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = pickSupportedMime();
  const recorder = mimeType
    ? new MediaRecorder(stream, { mimeType })
    : new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const startedAt = Date.now();
  recorder.start(1000); // émet une `dataavailable` toutes les secondes

  const stop = (): Promise<AudioRecording> =>
    new Promise<AudioRecording>((resolve) => {
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const finalMime = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type: finalMime });
        resolve({
          blob,
          mimeType: finalMime,
          durationMs: Date.now() - startedAt,
        });
      };
      if (recorder.state !== 'inactive') recorder.stop();
      else stream.getTracks().forEach((t) => t.stop());
    });

  const cancel = () => {
    try {
      if (recorder.state !== 'inactive') recorder.stop();
    } catch { /* no-op */ }
    stream.getTracks().forEach((t) => t.stop());
  };

  return { stop, cancel, stream };
}

/** Extension de fichier suggérée à partir du mimeType retourné. */
export function extensionForMime(mime: string): string {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4')) return 'm4a';
  return 'audio';
}
