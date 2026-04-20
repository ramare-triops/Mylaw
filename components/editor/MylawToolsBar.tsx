// components/editor/MylawToolsBar.tsx
// Onglet « Outils Mylaw » de la barre d'édition. Regroupe les actions
// spécifiques à Mylaw : remplissage guidé des variables, capture d'écran
// (insertion image dans le document) et enregistrement audio (sauvegardé
// comme pièce jointe du dossier).
'use client';

import { useEffect, useRef, useState } from 'react';
import {
  PencilLine,
  Camera,
  Mic,
  StopCircle,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Editor } from '@tiptap/react';
import { captureScreenshot, blobToDataUrl } from '@/lib/screen-capture';
import { startAudioRecording, extensionForMime, type ActiveRecording } from '@/lib/audio-record';
import { saveAttachment } from '@/lib/db';

interface MylawToolsBarProps {
  editor: Editor | null;
  /** Si fourni, dossier de rattachement des pièces jointes générées (audio, captures). */
  dossierId?: number;
  /** ID du document courant (utilisé pour le nommage / liaison de la pièce jointe). */
  documentId?: number;
  /** Combien de variables sont actuellement présentes dans le doc. */
  variableCount: number;
  /** Action « Renseigner les informations ». */
  onFillVariables: () => void;
}

export function MylawToolsBar({
  editor,
  dossierId,
  documentId,
  variableCount,
  onFillVariables,
}: MylawToolsBarProps) {
  const [capturing, setCapturing] = useState(false);
  const [recording, setRecording] = useState<ActiveRecording | null>(null);
  const [recordingMs, setRecordingMs] = useState(0);
  const [savingAudio, setSavingAudio] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Met à jour le compteur de durée pendant l'enregistrement.
  useEffect(() => {
    if (!recording) {
      if (tickerRef.current) {
        clearInterval(tickerRef.current);
        tickerRef.current = null;
      }
      setRecordingMs(0);
      return;
    }
    const startedAt = Date.now();
    tickerRef.current = setInterval(() => setRecordingMs(Date.now() - startedAt), 250);
    return () => {
      if (tickerRef.current) clearInterval(tickerRef.current);
    };
  }, [recording]);

  // Raccrochage propre si on démonte pendant un enregistrement (navigation,
  // changement d'onglet, etc.).
  useEffect(() => {
    return () => {
      recording?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCapture() {
    if (capturing) return;
    setError(null);
    setCapturing(true);
    try {
      const blob = await captureScreenshot();
      if (!blob) return; // utilisateur a annulé la sélection
      // Insertion immédiate dans le document via l'extension Image de TipTap.
      if (editor) {
        const dataUrl = await blobToDataUrl(blob);
        editor.chain().focus().setImage({ src: dataUrl, alt: 'Capture d\'écran' }).run();
      }
      // Sauvegarde aussi comme pièce jointe du dossier si rattachement présent.
      if (dossierId != null) {
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        await saveAttachment({
          dossierId,
          documentId,
          name: `Capture-${stamp}.png`,
          mimeType: 'image/png',
          size: blob.size,
          blob,
          tags: ['capture'],
          uploadedAt: new Date(),
        });
      }
    } catch (e) {
      setError((e as Error).message || 'Échec de la capture.');
    } finally {
      setCapturing(false);
    }
  }

  async function handleStartRecording() {
    if (recording) return;
    setError(null);
    try {
      const rec = await startAudioRecording();
      setRecording(rec);
    } catch (e) {
      const err = e as Error;
      setError(
        err.name === 'NotAllowedError'
          ? 'Permission micro refusée.'
          : err.message || 'Impossible de démarrer l\'enregistrement.',
      );
    }
  }

  async function handleStopRecording() {
    if (!recording) return;
    setSavingAudio(true);
    try {
      const result = await recording.stop();
      setRecording(null);
      const ext = extensionForMime(result.mimeType);
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const name = `Enregistrement-${stamp}.${ext}`;
      if (dossierId != null) {
        await saveAttachment({
          dossierId,
          documentId,
          name,
          mimeType: result.mimeType,
          size: result.blob.size,
          blob: result.blob,
          tags: ['audio'],
          uploadedAt: new Date(),
        });
      } else {
        // Pas de dossier : on propose le téléchargement direct.
        const url = URL.createObjectURL(result.blob);
        const a = window.document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      setError((e as Error).message || 'Échec de la sauvegarde audio.');
    } finally {
      setSavingAudio(false);
    }
  }

  const canFill = variableCount > 0;

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-surface)] border-b border-[var(--color-border)] overflow-x-auto"
      role="toolbar"
      aria-label="Outils Mylaw"
    >
      {/* Renseigner les informations */}
      <button
        type="button"
        onClick={onFillVariables}
        disabled={!canFill}
        className={cn(
          'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[var(--radius-sm)] text-[var(--text-xs)] font-medium border transition-all flex-shrink-0',
          canFill
            ? 'text-[var(--color-primary)] bg-[var(--color-primary)]/8 hover:bg-[var(--color-primary)]/16 border-[var(--color-primary)]/30 hover:border-[var(--color-primary)]/60'
            : 'text-[var(--color-text-faint)] bg-transparent border-[var(--color-border)] cursor-not-allowed',
        )}
        title={canFill
          ? 'Renseigner les informations du document'
          : 'Aucune variable à renseigner dans ce document'}
      >
        <PencilLine className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="whitespace-nowrap">
          Renseigner les informations
          {canFill && <span className="ml-1 opacity-70">({variableCount})</span>}
        </span>
      </button>

      <ToolbarDivider />

      {/* Capture d'écran */}
      <button
        type="button"
        onClick={handleCapture}
        disabled={capturing}
        className={cn(
          'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[var(--radius-sm)] text-[var(--text-xs)] font-medium',
          'border border-[var(--color-border)] bg-[var(--color-surface-offset)] text-[var(--color-text)]',
          'hover:bg-[var(--color-border)] transition-colors flex-shrink-0',
          capturing && 'opacity-50 cursor-wait',
        )}
        title="Capturer une zone, une fenêtre ou un écran (insertion dans le document)"
      >
        {capturing
          ? <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
          : <Camera className="w-3.5 h-3.5 flex-shrink-0" />}
        <span className="whitespace-nowrap">Capture d&apos;écran</span>
      </button>

      <ToolbarDivider />

      {/* Enregistrement audio */}
      {recording ? (
        <button
          type="button"
          onClick={handleStopRecording}
          disabled={savingAudio}
          className={cn(
            'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[var(--radius-sm)] text-[var(--text-xs)] font-medium',
            'border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 transition-colors flex-shrink-0',
            savingAudio && 'opacity-50 cursor-wait',
          )}
          title="Arrêter l'enregistrement"
        >
          {savingAudio
            ? <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
            : (
              <span className="relative inline-flex w-3.5 h-3.5 items-center justify-center flex-shrink-0">
                <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-60 animate-ping" />
                <StopCircle className="relative w-3.5 h-3.5" />
              </span>
            )}
          <span className="whitespace-nowrap">
            Arrêter · {formatDuration(recordingMs)}
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={handleStartRecording}
          className={cn(
            'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[var(--radius-sm)] text-[var(--text-xs)] font-medium',
            'border border-[var(--color-border)] bg-[var(--color-surface-offset)] text-[var(--color-text)]',
            'hover:bg-[var(--color-border)] transition-colors flex-shrink-0',
          )}
          title={dossierId != null
            ? 'Enregistrer un mémo audio (sauvegardé en pièce jointe du dossier)'
            : 'Enregistrer un mémo audio (téléchargé localement)'}
        >
          <Mic className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="whitespace-nowrap">Enregistrer un audio</span>
        </button>
      )}

      {error && (
        <span
          className="ml-2 text-[var(--text-xs)] text-[var(--color-error)] truncate"
          title={error}
        >
          {error}
        </span>
      )}
    </div>
  );
}

function ToolbarDivider() {
  return <span className="w-px h-5 bg-[var(--color-border)] flex-shrink-0" aria-hidden />;
}

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
