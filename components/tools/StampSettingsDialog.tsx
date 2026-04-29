'use client';

/**
 * Boîte de dialogue « Réglages du tampon ».
 *
 * Le tampon virtuel est composé :
 *   - d'une image (sceau du cabinet) importable en PNG, JPG ou SVG ;
 *     les SVG sont rastérisés en PNG dès l'import, car pdf-lib ne sait
 *     embarquer que du PNG ou du JPG dans un PDF ;
 *   - d'un numéro de pièce écrit dans la police choisie et dans la
 *     couleur choisie. La police, la taille (3 paliers), la position
 *     (grille 3 × 3), et le mode « première page seulement / toutes
 *     les pages » sont sauvegardés dans `stampSettings` (singleton).
 *
 * Tout est synchronisé via Drive (l'image en data URL base64, qui
 * reste petite pour un sceau de cabinet).
 */

import { useEffect, useRef, useState } from 'react';
import {
  Upload,
  X,
  Stamp,
  AlertTriangle,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getStampSettings, saveStampSettings, DEFAULT_STAMP_SETTINGS } from '@/lib/db';
import type { StampFont, StampPosition, StampSettings, StampSize } from '@/types';

const FONTS: { value: StampFont; label: string; css: string }[] = [
  { value: 'Helvetica', label: 'Helvetica', css: 'Helvetica, Arial, sans-serif' },
  { value: 'Times', label: 'Times', css: '"Times New Roman", Times, serif' },
  { value: 'Courier', label: 'Courier', css: '"Courier New", Courier, monospace' },
  { value: 'Georgia', label: 'Georgia', css: 'Georgia, serif' },
  { value: 'Inter', label: 'Inter', css: 'Inter, system-ui, sans-serif' },
];

export function fontCss(font: StampFont): string {
  return FONTS.find((f) => f.value === font)?.css ?? FONTS[0].css;
}

const SIZES: { value: StampSize; label: string; ratio: number }[] = [
  { value: 'small', label: 'Petite', ratio: 0.15 },
  { value: 'medium', label: 'Moyenne', ratio: 0.25 },
  { value: 'large', label: 'Grande', ratio: 0.35 },
];

export function sizeRatio(size: StampSize): number {
  return SIZES.find((s) => s.value === size)?.ratio ?? 0.25;
}

const POSITIONS: { value: StampPosition; label: string }[] = [
  { value: 'top-left', label: '↖' },
  { value: 'top-center', label: '↑' },
  { value: 'top-right', label: '↗' },
  { value: 'middle-left', label: '←' },
  { value: 'middle-center', label: '·' },
  { value: 'middle-right', label: '→' },
  { value: 'bottom-left', label: '↙' },
  { value: 'bottom-center', label: '↓' },
  { value: 'bottom-right', label: '↘' },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function StampSettingsDialog({ open, onClose }: Props) {
  const [settings, setSettings] = useState<StampSettings>(DEFAULT_STAMP_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingAt, setSavingAt] = useState<Date | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const s = await getStampSettings();
      if (!cancelled) {
        setSettings(s);
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  async function update(patch: Partial<StampSettings>) {
    const next: StampSettings = {
      ...settings,
      ...patch,
      updatedAt: new Date(),
    };
    setSettings(next);
    await saveStampSettings(patch);
    setSavingAt(new Date());
  }

  async function onPickFile(file: File) {
    setError(null);
    if (!file.type.match(/^image\/(png|jpe?g|svg\+xml)$/)) {
      setError('Format non supporté. Utilisez PNG, JPG ou SVG.');
      return;
    }
    const dataUrl = await readAsDataUrl(file);
    let finalDataUrl = dataUrl;
    let finalMime: StampSettings['imageMimeType'] = file.type as StampSettings['imageMimeType'];
    if (file.type === 'image/svg+xml') {
      // Rastérise le SVG en PNG : pdf-lib n'embarque pas de SVG.
      try {
        finalDataUrl = await rasterizeSvgToPng(dataUrl, 512);
        finalMime = 'image/png';
      } catch {
        setError("Impossible de rastériser le SVG. Essayez un PNG.");
        return;
      }
    }
    await update({ imageDataUrl: finalDataUrl, imageMimeType: finalMime });
  }

  async function clearImage() {
    await update({ imageDataUrl: undefined, imageMimeType: undefined });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-md border shadow-lg"
        style={{
          background: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-center gap-2">
            <Stamp size={16} style={{ color: 'var(--color-primary)' }} />
            <h3
              className="text-sm font-semibold"
              style={{ color: 'var(--color-text)' }}
            >
              Réglages du tampon
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-raised)]"
            title="Fermer"
          >
            <X size={14} />
          </button>
        </div>

        {!loaded ? (
          <div className="px-4 py-12 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Chargement…
          </div>
        ) : (
          <div className="px-4 py-4 space-y-5">
            {/* ─── Image du sceau ─────────────────────────────────────── */}
            <Section title="Sceau du cabinet">
              <div className="flex items-start gap-4 flex-wrap">
                <StampPreview settings={settings} />
                <div className="flex-1 min-w-[220px] flex flex-col gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void onPickFile(f);
                      // Permet de réimporter le même fichier
                      e.target.value = '';
                    }}
                  />
                  <button
                    onClick={() => fileRef.current?.click()}
                    className={cn(
                      'flex items-center justify-center gap-2 px-3 py-1.5 text-sm rounded-md',
                      'bg-[var(--color-surface-raised)] border border-[var(--color-border)]',
                      'hover:bg-[var(--color-border)]',
                    )}
                  >
                    <Upload size={13} />
                    {settings.imageDataUrl ? 'Remplacer l\'image' : 'Importer une image'}
                  </button>
                  {settings.imageDataUrl && (
                    <button
                      onClick={() => void clearImage()}
                      className={cn(
                        'flex items-center justify-center gap-2 px-3 py-1.5 text-sm rounded-md',
                        'text-[var(--color-error)] hover:bg-[var(--color-surface-raised)]',
                      )}
                    >
                      <Trash2 size={13} /> Retirer l&apos;image
                    </button>
                  )}
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    Formats acceptés : PNG, JPG, SVG. Les SVG sont
                    rastérisés en PNG à l&apos;import (le PDF n&apos;embarque
                    que du PNG / JPG).
                  </p>
                  {error && (
                    <p
                      className="text-xs flex items-center gap-1.5"
                      style={{ color: 'var(--color-error)' }}
                    >
                      <AlertTriangle size={12} /> {error}
                    </p>
                  )}
                </div>
              </div>
            </Section>

            {/* ─── Police du numéro ───────────────────────────────────── */}
            <Section title="Police du numéro de pièce">
              <div className="flex items-center gap-2 flex-wrap">
                {FONTS.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => void update({ font: f.value })}
                    className={cn(
                      'px-3 py-1.5 text-sm rounded-md border',
                      settings.font === f.value
                        ? 'border-[var(--color-primary)] bg-[oklch(from_var(--color-primary)_l_c_h_/_0.08)]'
                        : 'border-[var(--color-border)] bg-[var(--color-surface-raised)] hover:bg-[var(--color-border)]',
                    )}
                    style={{ fontFamily: f.css }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </Section>

            {/* ─── Taille ─────────────────────────────────────────────── */}
            <Section title="Taille">
              <div className="inline-flex rounded-md overflow-hidden border" style={{ borderColor: 'var(--color-border)' }}>
                {SIZES.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => void update({ size: s.value })}
                    className={cn(
                      'px-3 py-1.5 text-xs font-medium',
                      settings.size === s.value
                        ? 'bg-[var(--color-primary)] text-white'
                        : 'bg-[var(--color-surface-raised)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
                    )}
                  >
                    {s.label} ({Math.round(s.ratio * 100)} %)
                  </button>
                ))}
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                Largeur du tampon en proportion de la largeur de la page.
              </p>
            </Section>

            {/* ─── Position ───────────────────────────────────────────── */}
            <Section title="Emplacement sur la page">
              <div
                className="inline-grid grid-cols-3 gap-1 p-1 rounded-md border"
                style={{ borderColor: 'var(--color-border)' }}
              >
                {POSITIONS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => void update({ position: p.value })}
                    className={cn(
                      'w-10 h-10 rounded text-base font-medium',
                      settings.position === p.value
                        ? 'bg-[var(--color-primary)] text-white'
                        : 'bg-[var(--color-surface-raised)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-border)]',
                    )}
                    title={p.value}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </Section>

            {/* ─── Couleur du numéro ──────────────────────────────────── */}
            <Section title="Couleur du numéro">
              <div className="flex items-center gap-3 flex-wrap">
                <input
                  type="color"
                  value={settings.numberColor}
                  onChange={(e) => void update({ numberColor: e.target.value })}
                  className="w-10 h-9 rounded cursor-pointer border"
                  style={{ borderColor: 'var(--color-border)' }}
                />
                <code
                  className="text-xs px-2 py-1 rounded"
                  style={{
                    background: 'var(--color-surface-raised)',
                    color: 'var(--color-text)',
                  }}
                >
                  {settings.numberColor}
                </code>
                <span
                  className="ml-2 text-base font-semibold"
                  style={{
                    color: settings.numberColor,
                    fontFamily: fontCss(settings.font),
                  }}
                >
                  Pièce n°1
                </span>
              </div>
            </Section>

            {/* ─── Pages tamponnées ───────────────────────────────────── */}
            <Section title="Pages tamponnées">
              <div className="inline-flex rounded-md overflow-hidden border" style={{ borderColor: 'var(--color-border)' }}>
                <button
                  onClick={() => void update({ allPages: false })}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium',
                    !settings.allPages
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'bg-[var(--color-surface-raised)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
                  )}
                >
                  Première page seulement
                </button>
                <button
                  onClick={() => void update({ allPages: true })}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium',
                    settings.allPages
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'bg-[var(--color-surface-raised)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
                  )}
                >
                  Toutes les pages
                </button>
              </div>
            </Section>
          </div>
        )}

        <div
          className="flex items-center justify-between px-4 py-3 border-t text-xs"
          style={{
            borderColor: 'var(--color-border)',
            color: 'var(--color-text-muted)',
          }}
        >
          <span>
            {savingAt
              ? `Enregistré ${savingAt.toLocaleTimeString('fr-FR')}`
              : 'Les modifications sont enregistrées automatiquement.'}
          </span>
          <button
            onClick={onClose}
            className={cn(
              'px-3 py-1.5 text-sm rounded-md font-medium text-white',
              'bg-[var(--color-primary)] hover:opacity-90',
            )}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sous-composants ────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        className="text-[10px] uppercase tracking-wider mb-2 font-semibold"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function StampPreview({ settings }: { settings: StampSettings }) {
  // Une feuille A4 miniature, avec le tampon visualisé à sa position.
  const ratio = sizeRatio(settings.size);
  const PAGE_W = 160;
  const PAGE_H = (PAGE_W * 297) / 210;
  const stampSize = PAGE_W * ratio;
  const placement = positionStyles(settings.position, PAGE_W, PAGE_H, stampSize);
  return (
    <div
      className="rounded shadow-sm relative shrink-0"
      style={{
        width: PAGE_W,
        height: PAGE_H,
        background: 'white',
        border: '1px solid var(--color-border)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: placement.x,
          top: placement.y,
          width: stampSize,
          height: stampSize,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {settings.imageDataUrl ? (
          <img
            src={settings.imageDataUrl}
            alt="sceau"
            style={{
              maxWidth: '100%',
              maxHeight: '70%',
              objectFit: 'contain',
            }}
          />
        ) : (
          <div
            style={{
              width: '70%',
              height: '70%',
              borderRadius: '50%',
              border: '1.5px dashed #999',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#999',
              fontSize: 9,
            }}
          >
            sceau
          </div>
        )}
        <span
          style={{
            color: settings.numberColor,
            fontFamily: fontCss(settings.font),
            fontSize: stampSize * 0.18,
            fontWeight: 600,
            lineHeight: 1,
          }}
        >
          n° 1
        </span>
      </div>
    </div>
  );
}

export function positionStyles(
  position: StampPosition,
  pageW: number,
  pageH: number,
  stampSize: number,
): { x: number; y: number } {
  // Marges intérieures (5 % de la dimension)
  const mx = pageW * 0.05;
  const my = pageH * 0.05;
  const xLeft = mx;
  const xCenter = (pageW - stampSize) / 2;
  const xRight = pageW - stampSize - mx;
  const yTop = my;
  const yMiddle = (pageH - stampSize) / 2;
  const yBottom = pageH - stampSize - my;
  const map: Record<StampPosition, { x: number; y: number }> = {
    'top-left': { x: xLeft, y: yTop },
    'top-center': { x: xCenter, y: yTop },
    'top-right': { x: xRight, y: yTop },
    'middle-left': { x: xLeft, y: yMiddle },
    'middle-center': { x: xCenter, y: yMiddle },
    'middle-right': { x: xRight, y: yMiddle },
    'bottom-left': { x: xLeft, y: yBottom },
    'bottom-center': { x: xCenter, y: yBottom },
    'bottom-right': { x: xRight, y: yBottom },
  };
  return map[position];
}

// ─── Helpers fichier ────────────────────────────────────────────────────────

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Rastérise un SVG (data URL) en PNG (data URL). Le SVG est dessiné
 * sur un canvas de `maxSize` × `maxSize` en respectant le ratio
 * d'aspect intrinsèque s'il existe.
 */
async function rasterizeSvgToPng(svgDataUrl: string, maxSize = 512): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || maxSize;
      const h = img.naturalHeight || maxSize;
      const scale = Math.min(maxSize / w, maxSize / h, 1);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas indisponible'));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('SVG illisible'));
    img.src = svgDataUrl;
  });
}
