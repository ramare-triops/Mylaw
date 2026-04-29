'use client';

/**
 * Outil « Bordereau de pièces ».
 *
 * Architecture identique au calculateur d'intérêts :
 *   - Vue liste : projets de bordereau enregistrés sur le dossier ouvert ;
 *   - Vue détail : éditeur du bordereau (réglages tampon, sélection des
 *     pièces, génération, suppression).
 */

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft,
  FileStack,
  Plus,
  Trash2,
  Settings2,
  Upload,
  FolderOpen,
  GripVertical,
  Eye,
  X,
  AlertTriangle,
  FileCheck2,
} from 'lucide-react';
import { db, deleteBordereau } from '@/lib/db';
import { cn } from '@/lib/utils';
import {
  buildStampedPreview,
  clearGeneratedBordereau,
  generateBordereau,
  type GenerationProgress,
} from '@/lib/piece-list/generate';
import { StampSettingsDialog } from './StampSettingsDialog';
import type {
  Bordereau,
  BordereauPiece,
  Dossier,
  Document,
} from '@/types';

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const ACCEPTED_EXTENSIONS = '.pdf,.docx,.png,.jpg,.jpeg';
const ACCEPTED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'image/png',
  'image/jpeg',
  'image/jpg',
]);

function looksLikeDocx(name: string): boolean {
  return /\.docx?$/i.test(name);
}

function looksLikePdf(name: string): boolean {
  return /\.pdf$/i.test(name);
}

function looksLikeImage(name: string): boolean {
  return /\.(png|jpe?g)$/i.test(name);
}

/**
 * Détermine un type MIME exploitable pour la pièce, à partir du blob
 * et du nom de fichier (certains explorateurs ne fournissent pas de
 * type MIME pour les .docx).
 */
function resolveMime(blobType: string, name: string): string {
  if (blobType && ACCEPTED_MIME.has(blobType)) return blobType;
  if (looksLikePdf(name)) return 'application/pdf';
  if (looksLikeDocx(name))
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (/\.png$/i.test(name)) return 'image/png';
  if (/\.jpe?g$/i.test(name)) return 'image/jpeg';
  return blobType || 'application/octet-stream';
}

function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

interface Props {
  dossier?: Dossier;
}

export function PieceListTool({ dossier }: Props) {
  const [openId, setOpenId] = useState<number | null>(null);

  if (!dossier?.id) {
    return (
      <div
        className="px-6 py-12 text-center text-sm"
        style={{ color: 'var(--color-text-muted)' }}
      >
        Cet outil ne peut être utilisé qu&apos;à l&apos;intérieur d&apos;un dossier.
      </div>
    );
  }

  if (openId !== null) {
    return (
      <BordereauDetail
        key={openId}
        dossier={dossier}
        bordereauId={openId}
        onBack={() => setOpenId(null)}
      />
    );
  }

  return <BordereauList dossier={dossier} onOpen={setOpenId} />;
}

// ─── Liste des bordereaux ──────────────────────────────────────────────────

function BordereauList({
  dossier,
  onOpen,
}: {
  dossier: Dossier;
  onOpen: (id: number) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState('');

  const saved = useLiveQuery<Bordereau[]>(
    () =>
      dossier.id
        ? db.bordereaux.where('dossierId').equals(dossier.id).toArray()
        : Promise.resolve([] as Bordereau[]),
    [dossier.id],
  );

  const sorted = useMemo(
    () =>
      (saved ?? [])
        .slice()
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() -
            new Date(a.updatedAt).getTime(),
        ),
    [saved],
  );

  async function createBordereau() {
    if (!dossier.id) return;
    const name =
      draftName.trim() ||
      `Bordereau du ${new Date().toLocaleDateString('fr-FR')}`;
    const now = new Date();
    const payload: Bordereau = {
      dossierId: dossier.id,
      name,
      autoNumbering: true,
      generatedDocumentIds: [],
      createdAt: now,
      updatedAt: now,
    };
    const id = await db.bordereaux.add(payload);
    setCreating(false);
    setDraftName('');
    onOpen(Number(id));
  }

  async function handleDelete(id: number | undefined) {
    if (!id) return;
    if (
      !confirm(
        'Supprimer définitivement ce bordereau ? Les pièces sources importées seront perdues. Les documents PDF déjà générés dans le dossier ne seront pas affectés (utilisez plutôt « Supprimer le bordereau » dans l\'éditeur pour les retirer aussi).',
      )
    ) {
      return;
    }
    await deleteBordereau(id);
  }

  return (
    <div className="px-6 py-6">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <FileStack
            size={18}
            style={{ color: 'var(--color-primary)' }}
          />
          <h2
            className="text-base font-semibold"
            style={{ color: 'var(--color-text)' }}
          >
            Bordereaux de pièces
          </h2>
        </div>
        <button
          onClick={() => {
            setCreating(true);
            setDraftName('');
          }}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md font-medium text-white',
            'bg-[var(--color-primary)] hover:opacity-90',
          )}
        >
          <Plus size={13} /> Nouveau bordereau
        </button>
      </div>

      {creating && (
        <div
          className="mb-4 rounded-md border p-3 flex items-center gap-2 flex-wrap"
          style={{
            borderColor: 'var(--color-primary)',
            background: 'oklch(from var(--color-primary) l c h / 0.04)',
          }}
        >
          <input
            type="text"
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void createBordereau();
              if (e.key === 'Escape') {
                setCreating(false);
                setDraftName('');
              }
            }}
            placeholder="Nom du bordereau (ex. « Bordereau de communication n°1 »)"
            className={cn(
              'flex-1 min-w-[260px] px-2 py-1.5 text-sm rounded-md',
              'bg-[var(--color-surface)] border border-[var(--color-border)]',
              'text-[var(--color-text)] placeholder:text-[var(--color-text-faint)]',
              'focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]',
            )}
          />
          <button
            onClick={() => void createBordereau()}
            className={cn(
              'px-3 py-1.5 text-sm rounded-md font-medium text-white',
              'bg-[var(--color-primary)] hover:opacity-90',
            )}
          >
            Créer
          </button>
          <button
            onClick={() => {
              setCreating(false);
              setDraftName('');
            }}
            className={cn(
              'px-3 py-1.5 text-sm rounded-md',
              'bg-[var(--color-surface-raised)] border border-[var(--color-border)]',
              'hover:bg-[var(--color-border)]',
            )}
          >
            Annuler
          </button>
        </div>
      )}

      {sorted.length === 0 ? (
        <div
          className="rounded-md border px-4 py-8 text-center text-sm"
          style={{
            borderColor: 'var(--color-border)',
            color: 'var(--color-text-muted)',
            background: 'var(--color-surface)',
          }}
        >
          Aucun bordereau pour ce dossier. Cliquez sur « Nouveau bordereau »
          pour en créer un.
        </div>
      ) : (
        <ul
          className="rounded-md border overflow-hidden"
          style={{ borderColor: 'var(--color-border)' }}
        >
          {sorted.map((b) => (
            <li
              key={b.id}
              className="flex items-center gap-3 px-3 py-2 border-t first:border-t-0"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <button
                onClick={() => onOpen(b.id!)}
                className="flex-1 min-w-0 text-left flex items-center gap-3"
              >
                <FileStack
                  size={14}
                  style={{ color: 'var(--color-text-muted)' }}
                />
                <span
                  className="truncate text-sm"
                  style={{ color: 'var(--color-text)' }}
                >
                  {b.name}
                </span>
                <span
                  className="text-xs whitespace-nowrap"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {new Date(b.updatedAt).toLocaleDateString('fr-FR')}
                </span>
              </button>
              <button
                onClick={() => handleDelete(b.id)}
                title="Supprimer"
                className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-error)]"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Vue détail d'un bordereau ─────────────────────────────────────────────
//
// Squelette pour la phase 1 : affiche le nom (éditable) et trois sections
// vides qui seront remplies par les phases suivantes :
//   - Réglages du tampon (Phase 2)
//   - Pièces (Phase 3 + 4)
//   - Génération / suppression (Phase 5 + 6)

function BordereauDetail({
  dossier,
  bordereauId,
  onBack,
}: {
  dossier: Dossier;
  bordereauId: number;
  onBack: () => void;
}) {
  const bordereau = useLiveQuery<Bordereau | undefined>(
    () => db.bordereaux.get(bordereauId),
    [bordereauId],
  );
  const pieces = useLiveQuery<BordereauPiece[]>(
    () =>
      db.bordereauPieces
        .where('bordereauId')
        .equals(bordereauId)
        .toArray(),
    [bordereauId],
  );
  const [stampOpen, setStampOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewPiece, setPreviewPiece] = useState<BordereauPiece | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<string | null>(null);
  const [generationDone, setGenerationDone] = useState<string | null>(null);

  const sortedPieces = useMemo(
    () => (pieces ?? []).slice().sort((a, b) => a.order - b.order),
    [pieces],
  );

  async function rename(newName: string) {
    if (!bordereau) return;
    await db.bordereaux.update(bordereauId, {
      name: newName,
      updatedAt: new Date(),
    });
  }

  async function setAutoNumbering(value: boolean) {
    if (!bordereau) return;
    await db.bordereaux.update(bordereauId, {
      autoNumbering: value,
      updatedAt: new Date(),
    });
    if (value) {
      await renumberAuto();
    }
  }

  async function renumberAuto() {
    const list = await db.bordereauPieces
      .where('bordereauId')
      .equals(bordereauId)
      .toArray();
    list.sort((a, b) => a.order - b.order);
    await Promise.all(
      list.map((p, idx) =>
        db.bordereauPieces.update(p.id!, {
          order: idx,
          pieceNumber: String(idx + 1),
        }),
      ),
    );
  }

  async function addPiecesFromFiles(files: FileList | File[]) {
    setError(null);
    const arr = Array.from(files);
    const existing = await db.bordereauPieces
      .where('bordereauId')
      .equals(bordereauId)
      .toArray();
    let order = existing.length;
    let pieceNumber = order;
    const auto = !!bordereau?.autoNumbering;
    for (const file of arr) {
      const mime = resolveMime(file.type, file.name);
      if (
        !looksLikePdf(file.name) &&
        !looksLikeDocx(file.name) &&
        !looksLikeImage(file.name)
      ) {
        setError(
          `Le fichier « ${file.name} » est ignoré (formats acceptés : PDF, DOCX, PNG, JPG).`,
        );
        continue;
      }
      pieceNumber += 1;
      const piece: BordereauPiece = {
        bordereauId,
        order: order++,
        pieceNumber: auto ? String(pieceNumber) : '',
        customName: stripExtension(file.name),
        sourceFileName: file.name,
        sourceMimeType: mime,
        sourceBlob: file,
        uid: uuid(),
      };
      await db.bordereauPieces.add(piece);
    }
    await db.bordereaux.update(bordereauId, { updatedAt: new Date() });
  }

  async function addPiecesFromDossier(docs: Document[]) {
    const existing = await db.bordereauPieces
      .where('bordereauId')
      .equals(bordereauId)
      .toArray();
    let order = existing.length;
    let pieceNumber = order;
    const auto = !!bordereau?.autoNumbering;
    for (const d of docs) {
      if (!d.fileBlob) continue;
      pieceNumber += 1;
      const piece: BordereauPiece = {
        bordereauId,
        order: order++,
        pieceNumber: auto ? String(pieceNumber) : '',
        customName: d.title || 'Pièce',
        sourceFileName:
          d.title + (d.fileMimeType?.includes('pdf') ? '.pdf' : ''),
        sourceMimeType: d.fileMimeType ?? 'application/pdf',
        sourceBlob: d.fileBlob,
        sourceDocumentId: d.id,
        uid: uuid(),
      };
      await db.bordereauPieces.add(piece);
    }
    await db.bordereaux.update(bordereauId, { updatedAt: new Date() });
  }

  async function deletePiece(id: number | undefined) {
    if (!id) return;
    await db.bordereauPieces.delete(id);
    if (bordereau?.autoNumbering) {
      await renumberAuto();
    }
    await db.bordereaux.update(bordereauId, { updatedAt: new Date() });
  }

  async function updatePieceNumber(id: number, value: string) {
    await db.bordereauPieces.update(id, { pieceNumber: value });
  }

  async function updatePieceName(id: number, value: string) {
    await db.bordereauPieces.update(id, { customName: value });
  }

  async function handleGenerate() {
    if (!bordereau || !dossier) return;
    if (sortedPieces.length === 0) {
      setError('Ajoutez au moins une pièce avant de générer le bordereau.');
      return;
    }
    setError(null);
    setGenerationDone(null);
    setGenerating(true);
    try {
      const onProgress = (p: GenerationProgress) => {
        if (p.step === 'cleanup') setGenerationStatus('Nettoyage…');
        else if (p.step === 'piece')
          setGenerationStatus(
            `Pièce ${(p.index ?? 0) + 1}/${p.total} — ${p.pieceLabel ?? ''}`,
          );
        else if (p.step === 'recap')
          setGenerationStatus('Génération du bordereau récapitulatif…');
        else if (p.step === 'finalize') setGenerationStatus('Finalisation…');
      };
      const r = await generateBordereau(bordereau, dossier, onProgress);
      setGenerationDone(
        `${r.generatedDocumentIds.length} pièce${r.generatedDocumentIds.length > 1 ? 's' : ''} générée${r.generatedDocumentIds.length > 1 ? 's' : ''} + 1 bordereau récapitulatif ajoutés au dossier.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
      setGenerationStatus(null);
    }
  }

  async function handleClearGenerated() {
    if (!bordereau) return;
    const count =
      (bordereau.generatedDocumentIds?.length ?? 0) +
      (bordereau.generatedRecapDocumentId != null ? 1 : 0);
    if (count === 0) {
      setError("Ce bordereau n'a pas encore été généré.");
      return;
    }
    if (
      !confirm(
        `Supprimer les ${count} document${count > 1 ? 's' : ''} PDF généré${count > 1 ? 's' : ''} dans le dossier ? Le projet de bordereau (pièces, numéros, désignations) est conservé.`,
      )
    ) {
      return;
    }
    setError(null);
    setGenerationDone(null);
    await clearGeneratedBordereau(bordereau);
  }

  async function reorderPieces(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx) return;
    const list = sortedPieces.slice();
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    await Promise.all(
      list.map((p, idx) =>
        db.bordereauPieces.update(p.id!, {
          order: idx,
          pieceNumber: bordereau?.autoNumbering
            ? String(idx + 1)
            : p.pieceNumber,
        }),
      ),
    );
  }

  if (!bordereau) {
    return (
      <div
        className="px-6 py-12 text-center text-sm"
        style={{ color: 'var(--color-text-muted)' }}
      >
        Chargement du bordereau…
      </div>
    );
  }

  return (
    <div className="px-6 py-6">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <button
          onClick={onBack}
          title="Retour aux bordereaux"
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md',
            'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
            'hover:bg-[var(--color-surface-raised)]',
          )}
        >
          <ArrowLeft size={12} /> Bordereaux
        </button>
        <input
          type="text"
          value={bordereau.name}
          onChange={(e) => void rename(e.target.value)}
          placeholder="Nom du bordereau"
          className={cn(
            'text-base font-semibold bg-transparent border-0 border-b border-transparent',
            'focus:outline-none focus:border-[var(--color-primary)]',
            'flex-1 min-w-[260px] py-1',
          )}
          style={{ color: 'var(--color-text)' }}
        />
        <button
          onClick={() => setStampOpen(true)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md',
            'bg-[var(--color-surface-raised)] border border-[var(--color-border)]',
            'hover:bg-[var(--color-border)]',
          )}
        >
          <Settings2 size={13} /> Réglages du tampon
        </button>
      </div>

      {/* Bandeau options bordereau */}
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={bordereau.autoNumbering}
            onChange={(e) => void setAutoNumbering(e.target.checked)}
            className="w-4 h-4 accent-[var(--color-primary)]"
          />
          <span style={{ color: 'var(--color-text)' }}>
            Numérotation automatique
          </span>
          <span
            className="text-xs"
            style={{ color: 'var(--color-text-muted)' }}
          >
            (1, 2, 3…)
          </span>
        </label>
        <span
          className="text-xs"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {bordereau.autoNumbering
            ? 'Glissez les lignes pour réordonner — les numéros sont recalculés automatiquement.'
            : 'Saisissez librement le numéro (ex. « 3 bis », « 3.4.2 »). L\'ordre d\'affichage suit le glisser-déposer.'}
        </span>
      </div>

      {/* Boutons d'ajout de pièces */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <button
          onClick={() => setPickerOpen(true)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md',
            'bg-[var(--color-surface-raised)] border border-[var(--color-border)]',
            'hover:bg-[var(--color-border)]',
          )}
        >
          <FolderOpen size={13} /> Depuis le dossier
        </button>
        <label
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md cursor-pointer',
            'bg-[var(--color-surface-raised)] border border-[var(--color-border)]',
            'hover:bg-[var(--color-border)]',
          )}
        >
          <Upload size={13} /> Depuis l&apos;ordinateur
          <input
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) {
                void addPiecesFromFiles(e.target.files);
              }
              e.target.value = '';
            }}
          />
        </label>
        <span
          className="text-xs"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Formats : PDF, DOCX, PNG, JPG.
        </span>
      </div>

      {error && (
        <div
          className="mb-3 px-3 py-2 rounded-md text-sm flex items-center gap-2"
          style={{
            background: 'oklch(from var(--color-error) l c h / 0.08)',
            color: 'var(--color-error)',
          }}
        >
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* Tableau des pièces */}
      <PieceTable
        pieces={sortedPieces}
        autoNumbering={bordereau.autoNumbering}
        onChangeNumber={updatePieceNumber}
        onChangeName={updatePieceName}
        onPreview={setPreviewPiece}
        onDelete={deletePiece}
        onReorder={reorderPieces}
      />

      {/* Bandeau de génération */}
      <div className="mt-4 flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {sortedPieces.length} pièce{sortedPieces.length > 1 ? 's' : ''}
          {' '}sur ce bordereau.
          {bordereau.lastGeneratedAt && (
            <>
              {' '}Dernière génération&nbsp;:{' '}
              {new Date(bordereau.lastGeneratedAt).toLocaleString('fr-FR')}.
            </>
          )}
          {generationStatus && (
            <span
              className="ml-2 italic"
              style={{ color: 'var(--color-primary)' }}
            >
              {generationStatus}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void handleClearGenerated()}
            disabled={
              generating ||
              !bordereau.generatedDocumentIds?.length
            }
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md',
              'bg-[var(--color-surface-raised)] border border-[var(--color-border)]',
              'hover:bg-[var(--color-border)]',
              (generating || !bordereau.generatedDocumentIds?.length) &&
                'opacity-50 cursor-not-allowed',
            )}
          >
            Supprimer le bordereau
          </button>
          <button
            onClick={() => void handleGenerate()}
            disabled={generating || sortedPieces.length === 0}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md font-medium text-white',
              'bg-[var(--color-primary)] hover:opacity-90',
              (generating || sortedPieces.length === 0) &&
                'opacity-50 cursor-not-allowed',
            )}
          >
            <FileCheck2 size={13} />
            {generating ? 'Génération…' : 'Générer le bordereau'}
          </button>
        </div>
      </div>

      {generationDone && (
        <div
          className="mt-3 px-3 py-2 rounded-md text-sm flex items-center gap-2"
          style={{
            background: 'oklch(from var(--color-primary) l c h / 0.08)',
            color: 'var(--color-primary)',
          }}
        >
          <FileCheck2 size={14} /> {generationDone}
        </div>
      )}

      {/* Dialog : choisir des documents du dossier */}
      {pickerOpen && (
        <DossierFilesPickerDialog
          dossier={dossier}
          alreadyAddedDocIds={
            new Set(
              sortedPieces
                .map((p) => p.sourceDocumentId)
                .filter((x): x is number => typeof x === 'number'),
            )
          }
          onClose={() => setPickerOpen(false)}
          onAdd={async (docs) => {
            await addPiecesFromDossier(docs);
            setPickerOpen(false);
          }}
        />
      )}

      <StampSettingsDialog
        open={stampOpen}
        onClose={() => setStampOpen(false)}
      />

      {previewPiece && (
        <PiecePreviewDialog
          piece={previewPiece}
          onClose={() => setPreviewPiece(null)}
        />
      )}
    </div>
  );
}

// ─── Tableau des pièces ────────────────────────────────────────────────────

function PieceTable({
  pieces,
  autoNumbering,
  onChangeNumber,
  onChangeName,
  onPreview,
  onDelete,
  onReorder,
}: {
  pieces: BordereauPiece[];
  autoNumbering: boolean;
  onChangeNumber: (id: number, value: string) => void;
  onChangeName: (id: number, value: string) => void;
  onPreview: (piece: BordereauPiece) => void;
  onDelete: (id: number | undefined) => void;
  onReorder: (fromIdx: number, toIdx: number) => void;
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  if (pieces.length === 0) {
    return (
      <div
        className="rounded-md border px-4 py-8 text-center text-sm"
        style={{
          borderColor: 'var(--color-border)',
          color: 'var(--color-text-muted)',
          background: 'var(--color-surface)',
        }}
      >
        Aucune pièce. Ajoutez des fichiers depuis le dossier ou depuis
        votre ordinateur.
      </div>
    );
  }

  return (
    <div
      className="rounded-md border overflow-hidden"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <div
        className="grid grid-cols-[24px_90px_1fr_1.5fr_auto_auto] gap-2 px-3 py-2 text-xs font-medium"
        style={{
          background: 'var(--color-surface-raised)',
          color: 'var(--color-text-muted)',
        }}
      >
        <div></div>
        <div>N°</div>
        <div>Document source</div>
        <div>Nom de la pièce</div>
        <div></div>
        <div></div>
      </div>
      {pieces.map((p, idx) => (
        <Fragment key={p.id}>
          <div
            draggable
            onDragStart={(e) => {
              setDragIdx(idx);
              e.dataTransfer.effectAllowed = 'move';
              try {
                e.dataTransfer.setData('text/plain', String(idx));
              } catch {
                // certains navigateurs imposent setData
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setOverIdx(idx);
            }}
            onDragLeave={() => {
              setOverIdx((cur) => (cur === idx ? null : cur));
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIdx !== null && dragIdx !== idx) {
                onReorder(dragIdx, idx);
              }
              setDragIdx(null);
              setOverIdx(null);
            }}
            onDragEnd={() => {
              setDragIdx(null);
              setOverIdx(null);
            }}
            className="grid grid-cols-[24px_90px_1fr_1.5fr_auto_auto] gap-2 px-3 py-2 border-t items-center"
            style={{
              borderColor: 'var(--color-border)',
              background:
                overIdx === idx && dragIdx !== null && dragIdx !== idx
                  ? 'oklch(from var(--color-primary) l c h / 0.05)'
                  : 'var(--color-surface)',
              opacity: dragIdx === idx ? 0.5 : 1,
              cursor: 'grab',
            }}
          >
            <GripVertical
              size={14}
              style={{ color: 'var(--color-text-muted)' }}
            />
            <input
              type="text"
              value={p.pieceNumber}
              onChange={(e) =>
                p.id != null && onChangeNumber(p.id, e.target.value)
              }
              disabled={autoNumbering}
              placeholder={autoNumbering ? '' : 'ex. 3 bis'}
              className={cn(
                'w-full px-2 py-1 text-sm rounded-md text-center font-medium',
                'bg-[var(--color-surface)] border border-[var(--color-border)]',
                'text-[var(--color-text)]',
                'focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]',
                autoNumbering && 'opacity-90 cursor-not-allowed',
              )}
              title={
                autoNumbering
                  ? 'Numérotation automatique active. Décochez pour saisir manuellement.'
                  : ''
              }
            />
            <div
              className="text-xs truncate"
              style={{ color: 'var(--color-text-muted)' }}
              title={p.sourceFileName}
            >
              {p.sourceFileName}
            </div>
            <input
              type="text"
              value={p.customName}
              onChange={(e) =>
                p.id != null && onChangeName(p.id, e.target.value)
              }
              placeholder="Désignation de la pièce"
              className={cn(
                'w-full px-2 py-1 text-sm rounded-md',
                'bg-[var(--color-surface)] border border-[var(--color-border)]',
                'text-[var(--color-text)]',
                'focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]',
              )}
            />
            <button
              onClick={() => onPreview(p)}
              title="Aperçu"
              className={cn(
                'p-1.5 rounded-md',
                'text-[var(--color-text-muted)] hover:text-[var(--color-primary)]',
              )}
            >
              <Eye size={14} />
            </button>
            <button
              onClick={() => onDelete(p.id)}
              title="Retirer"
              className={cn(
                'p-1.5 rounded-md',
                'text-[var(--color-text-muted)] hover:text-[var(--color-error)]',
              )}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </Fragment>
      ))}
    </div>
  );
}

// ─── Sélecteur de documents du dossier ─────────────────────────────────────

function DossierFilesPickerDialog({
  dossier,
  alreadyAddedDocIds,
  onClose,
  onAdd,
}: {
  dossier: Dossier;
  alreadyAddedDocIds: Set<number>;
  onClose: () => void;
  onAdd: (docs: Document[]) => Promise<void> | void;
}) {
  const docs = useLiveQuery<Document[]>(
    () =>
      dossier.id
        ? db.documents.where('dossierId').equals(dossier.id).toArray()
        : Promise.resolve([] as Document[]),
    [dossier.id],
  );
  const filtered = useMemo(
    () => (docs ?? []).filter((d) => !!d.fileBlob),
    [docs],
  );
  const [selected, setSelected] = useState<Set<number>>(new Set());

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[80vh] overflow-hidden rounded-md border shadow-lg flex flex-col"
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
          <h3
            className="text-sm font-semibold"
            style={{ color: 'var(--color-text)' }}
          >
            Sélectionner depuis le dossier
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-raised)]"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {filtered.length === 0 ? (
            <div
              className="text-sm py-8 text-center"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Aucun fichier importé dans ce dossier.
              <br />
              Utilisez « Depuis l&apos;ordinateur » pour importer des
              pièces directement.
            </div>
          ) : (
            <ul className="space-y-1">
              {filtered.map((d) => {
                const already =
                  d.id != null && alreadyAddedDocIds.has(d.id);
                return (
                  <li key={d.id}>
                    <label
                      className={cn(
                        'flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer',
                        already
                          ? 'opacity-50'
                          : 'hover:bg-[var(--color-surface-raised)]',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={d.id != null && selected.has(d.id)}
                        onChange={() => d.id != null && toggle(d.id)}
                        disabled={already}
                        className="w-4 h-4 accent-[var(--color-primary)]"
                      />
                      <span
                        className="text-sm flex-1 truncate"
                        style={{ color: 'var(--color-text)' }}
                      >
                        {d.title}
                      </span>
                      <span
                        className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                        style={{
                          background: 'var(--color-surface-raised)',
                          color: 'var(--color-text-muted)',
                        }}
                      >
                        {d.fileMimeType?.split('/')[1] ?? 'fichier'}
                      </span>
                      {already && (
                        <span
                          className="text-xs"
                          style={{ color: 'var(--color-text-muted)' }}
                        >
                          déjà ajouté
                        </span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div
          className="flex items-center justify-between px-4 py-3 border-t"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <span
            className="text-xs"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {selected.size} sélectionné{selected.size > 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className={cn(
                'px-3 py-1.5 text-sm rounded-md',
                'bg-[var(--color-surface-raised)] border border-[var(--color-border)]',
                'hover:bg-[var(--color-border)]',
              )}
            >
              Annuler
            </button>
            <button
              disabled={selected.size === 0}
              onClick={() => {
                const chosen = filtered.filter(
                  (d) => d.id != null && selected.has(d.id),
                );
                void onAdd(chosen);
              }}
              className={cn(
                'px-3 py-1.5 text-sm rounded-md font-medium text-white',
                'bg-[var(--color-primary)] hover:opacity-90',
                selected.size === 0 && 'opacity-50 cursor-not-allowed',
              )}
            >
              Ajouter {selected.size > 0 ? `(${selected.size})` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Aperçu d'une pièce (brut ou tamponné) ─────────────────────────────────

function PiecePreviewDialog({
  piece,
  onClose,
}: {
  piece: BordereauPiece;
  onClose: () => void;
}) {
  const [stamped, setStamped] = useState(false);
  const [rawUrl, setRawUrl] = useState<string | null>(null);
  const [stampedUrl, setStampedUrl] = useState<string | null>(null);
  const [stampedLoading, setStampedLoading] = useState(false);
  const [stampedError, setStampedError] = useState<string | null>(null);

  // URL brute (recréée si la pièce change)
  useEffect(() => {
    const u = URL.createObjectURL(piece.sourceBlob);
    setRawUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [piece.uid, piece.sourceBlob]);

  // URL tamponnée (générée à la demande)
  useEffect(() => {
    if (!stamped) return;
    if (stampedUrl) return;
    let cancelled = false;
    setStampedLoading(true);
    setStampedError(null);
    void (async () => {
      try {
        const blob = await buildStampedPreview(piece);
        if (cancelled) return;
        const u = URL.createObjectURL(blob);
        setStampedUrl(u);
      } catch (err) {
        if (!cancelled) setStampedError((err as Error).message);
      } finally {
        if (!cancelled) setStampedLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stamped, stampedUrl, piece]);

  // Libère l'URL tamponnée à la fermeture / au démontage
  useEffect(() => {
    return () => {
      if (stampedUrl) URL.revokeObjectURL(stampedUrl);
    };
  }, [stampedUrl]);

  const previewUrl = stamped ? stampedUrl : rawUrl;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl h-[85vh] overflow-hidden rounded-md border shadow-lg flex flex-col"
        style={{
          background: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between gap-3 px-4 py-2 border-b"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div className="min-w-0 flex-1">
            <div
              className="text-sm font-semibold truncate"
              style={{ color: 'var(--color-text)' }}
            >
              {piece.customName || piece.sourceFileName}
            </div>
            <div
              className="text-xs truncate"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {piece.sourceFileName}
              {piece.pieceNumber && ` — n° ${piece.pieceNumber}`}
            </div>
          </div>
          <div
            className="inline-flex rounded-md overflow-hidden border shrink-0"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <button
              onClick={() => setStamped(false)}
              className={cn(
                'px-3 py-1 text-xs font-medium',
                !stamped
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-[var(--color-surface-raised)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
              )}
            >
              Brut
            </button>
            <button
              onClick={() => setStamped(true)}
              className={cn(
                'px-3 py-1 text-xs font-medium',
                stamped
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-[var(--color-surface-raised)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
              )}
            >
              Avec tampon
            </button>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-raised)]"
          >
            <X size={14} />
          </button>
        </div>
        <div
          className="flex-1 overflow-hidden relative"
          style={{ background: '#444' }}
        >
          {stamped && stampedLoading && (
            <div className="absolute inset-0 flex items-center justify-center text-white text-sm">
              Application du tampon…
            </div>
          )}
          {stamped && stampedError && (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
              <div
                className="px-4 py-3 rounded-md text-sm"
                style={{
                  background: 'oklch(from var(--color-error) l c h / 0.12)',
                  color: 'var(--color-error)',
                }}
              >
                <AlertTriangle size={14} className="inline mr-1" />
                {stampedError}
              </div>
            </div>
          )}
          {previewUrl && !(stamped && stampedLoading) && !stampedError && (
            <iframe
              src={previewUrl}
              title={piece.customName || piece.sourceFileName}
              className="w-full h-full"
              style={{ border: 0, background: 'white' }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
