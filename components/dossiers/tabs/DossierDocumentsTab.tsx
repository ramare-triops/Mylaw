'use client';

import { useState, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRouter } from 'next/navigation';
import JSZip from 'jszip';
import {
  Plus,
  FileText,
  Paperclip,
  Link as LinkIcon,
  Search,
  Trash2,
  Upload,
  Download,
  ExternalLink,
  X,
  FileType,
  FileSpreadsheet,
  Presentation,
  Image as ImageIcon,
  Music,
  Video,
  Archive,
  File as FileIcon,
  Scale,
} from 'lucide-react';
import {
  db,
  saveDocument,
  deleteDocument,
  saveAttachment,
  deleteAttachment,
  linkDocumentToDossier,
  unlinkDocumentFromDossier,
  logAudit,
  getDossierContactsWithRole,
  getSetting,
} from '@/lib/db';
import { buildDocxBlob } from '@/lib/export';
import { resolveIdentificationBlocks } from '@/lib/identification-blocks';
import {
  cabinetIdentityToContact,
  CABINET_IDENTITY_KEY,
  type CabinetIdentity,
} from '@/lib/cabinet-identity';
import type { Brick as DBBrick } from '@/types';
import type { FieldDef } from '@/types/field-def';
import { cn, formatDate, formatDateTime } from '@/lib/utils';
import { NewDocumentDialog, type DialogTemplate } from '@/components/documents/NewDocumentDialog';
import {
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUS_COLORS,
  DOCUMENT_CATEGORIES,
} from '../labels';
import type {
  Dossier,
  Document as MylawDocument,
  DocumentStatus,
  Attachment,
  DocumentLink,
} from '@/types';

interface Props {
  dossier: Dossier;
}

function templateToEditorContent(raw: string): string {
  if (!raw || raw.trim() === '') return '';
  const t = raw.trim();
  if (t.startsWith('{"type":"doc"')) return t;
  if (t.startsWith('<')) return t;
  return `<p>${t.replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;
}

// ─── Office URI Scheme (ms-word:, ms-excel:, ms-powerpoint:) ─────────────────
// Microsoft permet à une page web de demander au système d'ouvrir un fichier
// directement dans Word/Excel/PowerPoint via une URL de la forme :
//     ms-word:ofe|u|<URL_HTTP_DU_FICHIER>
// Le protocole exige une URL HTTP(S) accessible par l'application Office —
// pas de blob:/data:. On passe donc par un upload temporaire côté serveur
// (/api/open-office) qui renvoie un token à usage court.

type OfficeApp = 'word' | 'excel' | 'powerpoint';

const OFFICE_MIME: Record<string, OfficeApp> = {
  'application/msword': 'word',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'word',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.template': 'word',
  'application/vnd.ms-word.document.macroEnabled.12': 'word',
  'application/vnd.ms-excel': 'excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.template': 'excel',
  'application/vnd.ms-excel.sheet.macroEnabled.12': 'excel',
  'application/vnd.ms-powerpoint': 'powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.slideshow': 'powerpoint',
  'application/vnd.ms-powerpoint.presentation.macroEnabled.12': 'powerpoint',
};

const OFFICE_EXT: Record<string, OfficeApp> = {
  doc: 'word', docx: 'word', dot: 'word', dotx: 'word', docm: 'word', rtf: 'word',
  xls: 'excel', xlsx: 'excel', xlsm: 'excel', xlt: 'excel', xltx: 'excel', csv: 'excel',
  ppt: 'powerpoint', pptx: 'powerpoint', pps: 'powerpoint', ppsx: 'powerpoint', pptm: 'powerpoint',
};

function detectOfficeApp(filename: string, mimeType: string): OfficeApp | null {
  if (mimeType && OFFICE_MIME[mimeType]) return OFFICE_MIME[mimeType];
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return OFFICE_EXT[ext] ?? null;
}

/** Extension canonique pour l'URL publique (Office refuse les URL sans extension). */
function defaultExtFor(app: OfficeApp, filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext && OFFICE_EXT[ext] === app) return ext;
  return app === 'word' ? 'docx' : app === 'excel' ? 'xlsx' : 'pptx';
}

// ─── Icônes par type de fichier ──────────────────────────────────────────────
// Associe une icône lucide + couleur caractéristique à chaque type de fichier.
// Pour les documents créés dans Mylaw, on utilise l'icône `Scale` (balance)
// avec la couleur primary du thème — c'est le marquage "Mylaw".

type FileKind = 'mylaw' | 'word' | 'excel' | 'powerpoint' | 'pdf' | 'image' | 'audio' | 'video' | 'archive' | 'text' | 'other';

const FILE_KIND_BY_EXT: Record<string, FileKind> = {
  // Word
  doc: 'word', docx: 'word', dot: 'word', dotx: 'word', docm: 'word', rtf: 'word', odt: 'word',
  // Excel
  xls: 'excel', xlsx: 'excel', xlsm: 'excel', xlt: 'excel', xltx: 'excel', csv: 'excel', ods: 'excel',
  // PowerPoint
  ppt: 'powerpoint', pptx: 'powerpoint', pps: 'powerpoint', ppsx: 'powerpoint', pptm: 'powerpoint', odp: 'powerpoint',
  // PDF
  pdf: 'pdf',
  // Image
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', svg: 'image', webp: 'image', bmp: 'image', heic: 'image', tiff: 'image',
  // Audio
  mp3: 'audio', wav: 'audio', ogg: 'audio', m4a: 'audio', aac: 'audio', flac: 'audio',
  // Video
  mp4: 'video', mov: 'video', avi: 'video', mkv: 'video', webm: 'video',
  // Archive
  zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive', gz: 'archive',
  // Text
  txt: 'text', md: 'text', log: 'text', json: 'text', xml: 'text',
};

function detectFileKind(filename: string, mimeType: string): FileKind {
  if (mimeType.startsWith('image/'))  return 'image';
  if (mimeType.startsWith('audio/'))  return 'audio';
  if (mimeType.startsWith('video/'))  return 'video';
  if (mimeType === 'application/pdf') return 'pdf';
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return FILE_KIND_BY_EXT[ext] ?? 'other';
}

interface FileTypeIconProps {
  kind: FileKind;
  size?: number;
  className?: string;
}

function FileTypeIcon({ kind, size = 16, className }: FileTypeIconProps) {
  const common = { className: cn('flex-shrink-0', className), style: { width: size, height: size } };
  switch (kind) {
    case 'mylaw':      return <Scale {...common} style={{ ...common.style, color: 'var(--color-primary)' }} />;
    case 'word':       return <FileType {...common} style={{ ...common.style, color: '#2b5797' }} />;
    case 'excel':      return <FileSpreadsheet {...common} style={{ ...common.style, color: '#1d6f42' }} />;
    case 'powerpoint': return <Presentation {...common} style={{ ...common.style, color: '#c94f00' }} />;
    case 'pdf':        return <FileText {...common} style={{ ...common.style, color: '#d32f2f' }} />;
    case 'image':      return <ImageIcon {...common} style={{ ...common.style, color: '#6d28d9' }} />;
    case 'audio':      return <Music {...common} style={{ ...common.style, color: '#db2777' }} />;
    case 'video':      return <Video {...common} style={{ ...common.style, color: '#0891b2' }} />;
    case 'archive':    return <Archive {...common} style={{ ...common.style, color: '#a16207' }} />;
    case 'text':       return <FileText {...common} style={{ ...common.style, color: 'var(--color-text-muted)' }} />;
    default:           return <FileIcon {...common} style={{ ...common.style, color: 'var(--color-text-muted)' }} />;
  }
}

/**
 * Upload la pièce jointe vers un endpoint temporaire et déclenche le
 * protocole Office correspondant. Retourne une Promise qui se résout à
 * `true` si on détecte qu'Office a pris la main (la fenêtre perd le focus
 * rapidement), ou à `false` si Office n'a pas répondu — ce qui permet à
 * l'appelant de déclencher un téléchargement de secours.
 */
async function openInOfficeApp(
  blob: Blob,
  name: string,
  app: OfficeApp,
): Promise<boolean> {
  const form = new FormData();
  form.append('file', blob, name);
  form.append('name', name);
  const res = await fetch('/api/open-office', { method: 'POST', body: form });
  if (!res.ok) throw new Error(`upload_failed_${res.status}`);
  const { token } = (await res.json()) as { token: string };
  if (!token) throw new Error('missing_token');

  const scheme = app === 'word' ? 'ms-word' : app === 'excel' ? 'ms-excel' : 'ms-powerpoint';
  const ext = defaultExtFor(app, name);
  // Nom d'URL safe — Office parse le path pour détecter l'extension. On évite
  // les espaces / caractères exotiques qui pourraient casser la reconnaissance.
  const safeName = name.replace(/[^A-Za-z0-9._-]/g, '_');
  const namePart = safeName.toLowerCase().endsWith(`.${ext}`) ? safeName : `${safeName}.${ext}`;
  const httpUrl = `${window.location.origin}/api/open-office/${token}/${encodeURIComponent(namePart)}`;
  // `ofe` = Open For Editing. Les `|` doivent rester littéraux (pas encodés),
  // sans quoi Word répond « Office ne reconnaît pas la commande ».
  const schemeUrl = `${scheme}:ofe|u|${httpUrl}`;

  // On utilise une iframe cachée plutôt que `a.click()` : certains navigateurs
  // normalisent l'URL en encodant les `|` en `%7C` quand on affecte `a.href`,
  // ce qui empêche Office de parser les paramètres. Une iframe dont on règle
  // `src` directement passe la chaîne telle quelle au handler OS.
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.setAttribute('src', schemeUrl);
  document.body.appendChild(iframe);

  // Heuristique de détection de succès : si Office prend la main, le
  // navigateur perd le focus (blur) ou devient caché (visibilitychange).
  // À l'inverse, si on reste focus pendant ~2.5 s, c'est que Word a
  // soit refusé (ex : URL HTTP localhost bloquée), soit affiché une erreur
  // que l'utilisateur a fermée immédiatement. On considère alors l'échec.
  const launched = await new Promise<boolean>((resolve) => {
    let resolved = false;
    const succeed = () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(true);
    };
    const fail = () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(false);
    };
    const onBlur = () => succeed();
    const onVisibility = () => { if (document.hidden) succeed(); };
    const cleanup = () => {
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
    };
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    setTimeout(fail, 2500);
  });

  // Retrait de l'iframe après coup.
  setTimeout(() => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  }, 4000);

  return launched;
}

export function DossierDocumentsTab({ dossier }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [newDocOpen, setNewDocOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const docs = useLiveQuery<MylawDocument[]>(
    () =>
      db.documents
        .where('dossierId')
        .equals(dossier.id!)
        .toArray(),
    [dossier.id]
  );
  const attachments = useLiveQuery<Attachment[]>(
    () =>
      db.attachments
        .where('dossierId')
        .equals(dossier.id!)
        .toArray(),
    [dossier.id]
  );
  const links = useLiveQuery<DocumentLink[]>(
    () =>
      db.documentLinks
        .where('dossierId')
        .equals(dossier.id!)
        .toArray(),
    [dossier.id]
  );
  const linkedDocs = useLiveQuery<(MylawDocument | undefined)[]>(async () => {
    if (!links || links.length === 0) return [];
    return db.documents.bulkGet(links.map((l) => l.documentId));
  }, [links]);

  // ─── Liste fusionnée : documents Mylaw + pièces jointes importées ─────────
  // Les deux types cohabitent dans un seul tableau trié chronologiquement
  // (plus récent en haut). On distingue la source via `kind` pour adapter
  // l'ouverture (éditeur interne vs viewer blob) et les colonnes affichées.
  type UnifiedItem =
    | { kind: 'doc'; id: number; title: string; updatedAt: Date; category?: string; status?: DocumentStatus; wordCount?: number; doc: MylawDocument }
    | { kind: 'attachment'; id: number; title: string; updatedAt: Date; mimeType: string; size: number; attachment: Attachment };

  const unified: UnifiedItem[] = (() => {
    const items: UnifiedItem[] = [];
    for (const d of docs ?? []) {
      if (d.id == null) continue;
      items.push({
        kind: 'doc',
        id: d.id,
        title: d.title,
        updatedAt: new Date(d.updatedAt),
        category: d.category,
        status: d.status,
        wordCount: d.wordCount,
        doc: d,
      });
    }
    for (const a of attachments ?? []) {
      if (a.id == null) continue;
      items.push({
        kind: 'attachment',
        id: a.id,
        title: a.name,
        updatedAt: new Date(a.uploadedAt),
        mimeType: a.mimeType,
        size: a.size,
        attachment: a,
      });
    }
    return items;
  })();

  const filteredItems = (() => {
    let list = unified;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((it) => {
        if (it.kind === 'doc') {
          return (
            it.title.toLowerCase().includes(q) ||
            (it.doc.contentRaw ?? '').toLowerCase().includes(q) ||
            (it.category ?? '').toLowerCase().includes(q) ||
            it.doc.tags.some((t) => t.toLowerCase().includes(q))
          );
        }
        return it.title.toLowerCase().includes(q);
      });
    }
    if (statusFilter !== 'all') {
      list = list.filter((it) => it.kind === 'doc' && (it.status ?? 'draft') === statusFilter);
    }
    if (categoryFilter !== 'all') {
      list = list.filter((it) => it.kind === 'doc' && it.category === categoryFilter);
    }
    return [...list].sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    );
  })();

  async function handleCreate(title: string, template: DialogTemplate | null) {
    setNewDocOpen(false);
    const now = new Date();
    const templateContent = template?.content ?? '';
    const normalized = templateToEditorContent(templateContent);
    // Expansion des blocs d'identification : chaque placeholder du modèle
    // est remplacé par l'énoncé des intervenants du dossier portant le
    // rôle demandé, avec la variante physique / morale choisie selon
    // `contact.type`. Les variables de contact connues sont pré-remplies ;
    // les inconnues (champs vides côté intervenant) restent en `[Label]`
    // pour que l'utilisateur les complète dans l'éditeur.
    const content = await expandIdentificationBlocksInContent(
      normalized,
      dossier.id!
    );
    const textForCount = content
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const wordCount = textForCount
      ? textForCount.split(' ').filter(Boolean).length
      : 0;
    const id = await saveDocument({
      title: title || 'Nouveau document',
      type: 'draft',
      status: 'draft',
      dossierId: dossier.id!,
      category: template?.documentCategory,
      content,
      contentRaw: templateContent,
      tags: [],
      createdAt: now,
      updatedAt: now,
      wordCount,
    });
    router.push(`/documents/${id}`);
  }

  /**
   * Assemble le contexte d'expansion (intervenants du dossier, briques
   * d'identité seed, catalogue de champs) et délègue à
   * `resolveIdentificationBlocks`. Best-effort : si la résolution échoue
   * pour une raison quelconque, on retombe sur le contenu brut du modèle
   * pour ne pas bloquer la création du document.
   */
  async function expandIdentificationBlocksInContent(
    html: string,
    dossierId: number
  ): Promise<string> {
    try {
      const [dossierContacts, bricks, fieldDefs, cabinet] = await Promise.all([
        getDossierContactsWithRole(dossierId),
        db.bricks.toArray() as Promise<DBBrick[]>,
        db.fieldDefs.toArray() as Promise<FieldDef[]>,
        getSetting<CabinetIdentity | null>(CABINET_IDENTITY_KEY, null),
      ]);
      const physical = bricks.find((b) => b.identityKind === 'physical');
      const moral = bricks.find((b) => b.identityKind === 'moral');
      return resolveIdentificationBlocks(html, {
        dossierContacts: dossierContacts.map((dc) => ({
          contact: dc.contact,
          role: dc.dossierContact.role,
        })),
        identityBricks: { physical, moral },
        fieldDefs,
        ownCounselFallback: cabinetIdentityToContact(cabinet),
      });
    } catch (e) {
      // Log visible en devtools pour diagnostiquer : on n'a pas de
      // remontée d'erreur côté UI dans ce flow (création de document).
      // eslint-disable-next-line no-console
      console.warn('[identification] expansion failed, falling back to raw template', e);
      return html;
    }
  }

  async function handleUpdateStatus(doc: MylawDocument, status: DocumentStatus) {
    await saveDocument({ ...doc, status, updatedAt: new Date() });
    await logAudit({
      dossierId: dossier.id,
      entityType: 'document',
      entityId: doc.id!,
      action: 'status_change',
      details: JSON.stringify({ from: doc.status, to: status }),
    });
  }

  async function handleUpdateCategory(doc: MylawDocument, category: string) {
    await saveDocument({
      ...doc,
      category: category || undefined,
      updatedAt: new Date(),
    });
  }

  async function handleDelete(e: React.MouseEvent, doc: MylawDocument) {
    e.stopPropagation();
    if (!confirm(`Supprimer le document "${doc.title}" ?`)) return;
    await deleteDocument(doc.id!);
  }

  async function handleFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      await saveAttachment({
        dossierId: dossier.id!,
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        blob: file,
        tags: [],
        uploadedAt: new Date(),
      });
    }
  }

  function handleDownloadAttachment(attId: number, name: string) {
    db.attachments.get(attId).then((a) => {
      if (!a) return;
      const url = URL.createObjectURL(a.blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
      logAudit({
        dossierId: dossier.id,
        entityType: 'attachment',
        entityId: attId,
        action: 'download',
      });
    });
  }

  /**
   * Ouvre une pièce jointe en fonction de son type :
   *   - Fichiers Office (Word/Excel/PowerPoint) : upload temporaire côté
   *     serveur + redirection via le protocole "Office URI Scheme"
   *     (ms-word:ofe|u|…), ce qui lance l'application de bureau installée
   *     sur la machine de l'utilisateur plutôt que de télécharger le fichier.
   *   - PDF, images, etc. : ouverture blob URL dans un nouvel onglet
   *     (viewer natif du navigateur).
   *   - Fallback : téléchargement si rien ne peut être ouvert.
   */
  async function handleOpenAttachment(att: Attachment) {
    if (att.id == null) return;
    const fresh = await db.attachments.get(att.id);
    const blob = fresh?.blob ?? att.blob;
    if (!blob) return;

    logAudit({
      dossierId: dossier.id,
      entityType: 'attachment',
      entityId: att.id,
      action: 'view',
    });

    const office = detectOfficeApp(att.name, att.mimeType);
    if (office) {
      try {
        const launched = await openInOfficeApp(blob, att.name, office);
        if (!launched) {
          // Office n'a pas pris la main dans les 2.5 s (typique : HTTP
          // localhost bloqué par la politique de sécurité Office). On
          // déclenche un téléchargement automatique, l'utilisateur peut
          // alors ouvrir le fichier d'un clic depuis sa barre d'onglets.
          handleDownloadAttachment(att.id, att.name);
        }
      } catch {
        handleDownloadAttachment(att.id, att.name);
      }
      return;
    }

    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    // Révocation retardée : laisse le temps au nouvel onglet de charger.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function handleDeleteAttachment(e: React.MouseEvent, att: Attachment) {
    e.stopPropagation();
    if (att.id == null) return;
    if (!confirm(`Supprimer la pièce jointe "${att.name}" ?`)) return;
    await deleteAttachment(att.id);
  }

  // ─── Sélection multiple & actions groupées ──────────────────────────────────

  function keyFor(item: UnifiedItem): string {
    return `${item.kind}-${item.id}`;
  }

  function toggleSelection(key: string, selected: boolean) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (selected) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function toggleSelectAll(selected: boolean) {
    if (!selected) {
      setSelectedKeys(new Set());
      return;
    }
    setSelectedKeys(new Set(filteredItems.map(keyFor)));
  }

  function clearSelection() {
    setSelectedKeys(new Set());
  }

  // Noms de fichier dé-dupliqués pour l'archive ZIP : en cas de collision,
  // on suffixe avec "(2)", "(3)", etc., avant l'extension.
  function uniquify(names: Set<string>, candidate: string): string {
    if (!names.has(candidate)) {
      names.add(candidate);
      return candidate;
    }
    const dot = candidate.lastIndexOf('.');
    const base = dot > 0 ? candidate.slice(0, dot) : candidate;
    const ext = dot > 0 ? candidate.slice(dot) : '';
    let i = 2;
    while (names.has(`${base} (${i})${ext}`)) i++;
    const name = `${base} (${i})${ext}`;
    names.add(name);
    return name;
  }

  function triggerBlobDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleBulkDownload() {
    if (selectedKeys.size === 0 || bulkBusy) return;
    const selected = filteredItems.filter((it) => selectedKeys.has(keyFor(it)));
    if (selected.length === 0) return;

    setBulkBusy(true);
    try {
      // Un seul élément → téléchargement direct dans son format natif.
      if (selected.length === 1) {
        const it = selected[0];
        if (it.kind === 'doc') {
          const blob = await buildDocxBlob(it.doc.contentRaw ?? it.doc.content ?? '');
          triggerBlobDownload(blob, `${it.title}.docx`);
          await logAudit({
            dossierId: dossier.id,
            entityType: 'document',
            entityId: it.id,
            action: 'download',
          });
        } else {
          handleDownloadAttachment(it.id, it.title);
        }
        return;
      }

      // Plusieurs éléments → archive ZIP.
      const zip = new JSZip();
      const usedNames = new Set<string>();
      for (const it of selected) {
        if (it.kind === 'doc') {
          const blob = await buildDocxBlob(it.doc.contentRaw ?? it.doc.content ?? '');
          const name = uniquify(usedNames, `${it.title}.docx`);
          zip.file(name, blob);
        } else {
          const fresh = await db.attachments.get(it.id);
          const blob = fresh?.blob ?? it.attachment.blob;
          if (!blob) continue;
          const name = uniquify(usedNames, it.title);
          zip.file(name, blob);
        }
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const stamp = new Date().toISOString().slice(0, 10);
      const safeRef = (dossier.reference || 'documents').replace(/[^A-Za-z0-9._-]+/g, '-');
      triggerBlobDownload(zipBlob, `${safeRef}-documents-${stamp}.zip`);

      for (const it of selected) {
        await logAudit({
          dossierId: dossier.id,
          entityType: it.kind === 'doc' ? 'document' : 'attachment',
          entityId: it.id,
          action: 'download',
        });
      }
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkDelete() {
    if (selectedKeys.size === 0 || bulkBusy) return;
    const selected = filteredItems.filter((it) => selectedKeys.has(keyFor(it)));
    if (selected.length === 0) return;
    const count = selected.length;
    if (!confirm(`Supprimer définitivement ${count} élément${count > 1 ? 's' : ''} ?`)) return;

    setBulkBusy(true);
    try {
      for (const it of selected) {
        if (it.kind === 'doc') await deleteDocument(it.id);
        else await deleteAttachment(it.id);
      }
      clearSelection();
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <>
      <div
        className="flex h-full min-h-0"
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
        }}
      >
        {dragActive && (
          <div className="fixed inset-0 z-40 bg-[var(--color-primary)]/10 border-4 border-dashed border-[var(--color-primary)] flex items-center justify-center pointer-events-none">
            <div className="bg-[var(--color-surface)] px-6 py-4 rounded-lg shadow-lg flex items-center gap-3">
              <Upload className="w-5 h-5 text-[var(--color-primary)]" />
              <span className="font-medium text-sm">
                Déposer les fichiers pour les importer dans ce dossier
              </span>
            </div>
          </div>
        )}

        {/* ─── Zone principale : liste des documents ─── */}
        <div className="flex-1 min-w-0 overflow-auto p-6 space-y-6">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleFiles(e.target.files);
              e.currentTarget.value = '';
            }}
          />

          {/* Liste unifiée : documents Mylaw et pièces jointes importées */}
        <section>
          <h3 className="text-sm font-semibold mb-2 text-[var(--color-text)]">
            Documents ({(docs?.length ?? 0) + (attachments?.length ?? 0)})
          </h3>
          {selectedKeys.size > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 mb-2 rounded-md bg-[var(--color-primary-light)] text-[var(--color-primary)] text-sm">
              <span className="font-medium">
                {selectedKeys.size} sélectionné{selectedKeys.size > 1 ? 's' : ''}
              </span>
              <button
                onClick={clearSelection}
                disabled={bulkBusy}
                className="text-xs underline hover:opacity-80 disabled:opacity-50"
              >
                Annuler la sélection
              </button>
              <div className="flex-1" />
              <button
                onClick={handleBulkDownload}
                disabled={bulkBusy}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium',
                  'bg-[var(--color-primary)] text-white hover:opacity-90 disabled:opacity-50'
                )}
                title={selectedKeys.size > 1 ? 'Télécharger (ZIP)' : 'Télécharger'}
              >
                <Download className="w-3.5 h-3.5" />
                Télécharger{selectedKeys.size > 1 ? ' (ZIP)' : ''}
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkBusy}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium',
                  'bg-red-500 text-white hover:bg-red-600 disabled:opacity-50'
                )}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Supprimer
              </button>
            </div>
          )}
          <div className="border border-[var(--color-border)] rounded-md overflow-hidden">
            <div className="grid grid-cols-[28px_minmax(0,1fr)_160px_110px_110px_80px] gap-3 px-4 py-2 text-xs text-[var(--color-text-muted)] font-medium border-b border-[var(--color-border)] bg-[var(--color-surface-raised)]">
              <input
                type="checkbox"
                aria-label="Tout sélectionner"
                checked={
                  filteredItems.length > 0 &&
                  filteredItems.every((it) => selectedKeys.has(keyFor(it)))
                }
                ref={(el) => {
                  if (!el) return;
                  const someSelected = filteredItems.some((it) => selectedKeys.has(keyFor(it)));
                  const allSelected = filteredItems.length > 0 && filteredItems.every((it) => selectedKeys.has(keyFor(it)));
                  el.indeterminate = someSelected && !allSelected;
                }}
                onChange={(e) => toggleSelectAll(e.target.checked)}
                className="cursor-pointer"
              />
              <span>Titre</span>
              <span>Catégorie</span>
              <span>Statut</span>
              <span className="text-right">Modifié</span>
              <span />
            </div>
            {filteredItems.length === 0 ? (
              <div className="py-10 text-center text-sm text-[var(--color-text-muted)]">
                Aucun document rattaché. Créez-en un, importez des fichiers ou
                rattachez un document existant.
              </div>
            ) : (
              filteredItems.map((item) => {
                const key = keyFor(item);
                const isSelected = selectedKeys.has(key);
                if (item.kind === 'doc') {
                  const d = item.doc;
                  return (
                    <div
                      key={`doc-${item.id}`}
                      onClick={() => router.push(`/documents/${item.id}`)}
                      className={cn(
                        'grid grid-cols-[28px_minmax(0,1fr)_160px_110px_110px_80px] gap-3 px-4 py-2.5 text-sm items-center cursor-pointer border-b border-[var(--color-border)] last:border-b-0 group',
                        isSelected
                          ? 'bg-[var(--color-primary-light)]/40'
                          : 'hover:bg-[var(--color-surface-raised)]'
                      )}
                    >
                      <input
                        type="checkbox"
                        aria-label={`Sélectionner ${item.title}`}
                        checked={isSelected}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => toggleSelection(key, e.target.checked)}
                        className="cursor-pointer"
                      />
                      <div className="flex items-center gap-2 min-w-0">
                        <FileTypeIcon kind="mylaw" size={16} />
                        <span className="truncate font-medium">{item.title}</span>
                      </div>
                      <select
                        value={item.category ?? ''}
                        onChange={(e) => handleUpdateCategory(d, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full min-w-0 text-xs px-2 py-1 rounded bg-transparent border border-transparent hover:border-[var(--color-border)] focus:border-[var(--color-primary)] focus:outline-none"
                      >
                        <option value="">—</option>
                        {DOCUMENT_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <select
                        value={item.status ?? 'draft'}
                        onChange={(e) =>
                          handleUpdateStatus(d, e.target.value as DocumentStatus)
                        }
                        onClick={(e) => e.stopPropagation()}
                        className={cn(
                          'text-xs px-2 py-0.5 rounded border border-transparent font-medium',
                          DOCUMENT_STATUS_COLORS[item.status ?? 'draft']
                        )}
                      >
                        {Object.entries(DOCUMENT_STATUS_LABELS).map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                      <span className="text-xs text-right text-[var(--color-text-muted)]">
                        {formatDateTime(item.updatedAt)}
                      </span>
                      <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100">
                        <button
                          onClick={(e) => handleDelete(e, d)}
                          className="p-1 rounded hover:bg-red-100"
                          title="Supprimer"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </button>
                      </div>
                    </div>
                  );
                }
                // Pièce jointe : clic = ouverture dans un nouvel onglet.
                const a = item.attachment;
                return (
                  <div
                    key={`att-${item.id}`}
                    onClick={() => handleOpenAttachment(a)}
                    className={cn(
                      'grid grid-cols-[28px_minmax(0,1fr)_160px_110px_110px_80px] gap-3 px-4 py-2.5 text-sm items-center cursor-pointer border-b border-[var(--color-border)] last:border-b-0 group',
                      isSelected
                        ? 'bg-[var(--color-primary-light)]/40'
                        : 'hover:bg-[var(--color-surface-raised)]'
                    )}
                  >
                    <input
                      type="checkbox"
                      aria-label={`Sélectionner ${item.title}`}
                      checked={isSelected}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => toggleSelection(key, e.target.checked)}
                      className="cursor-pointer"
                    />
                    <div className="flex items-center gap-2 min-w-0">
                      <FileTypeIcon kind={detectFileKind(item.title, item.mimeType)} size={16} />
                      <span className="truncate font-medium">{item.title}</span>
                    </div>
                    <span className="text-xs text-[var(--color-text-muted)] truncate">
                      Importé
                    </span>
                    <span className="text-xs text-[var(--color-text-muted)] truncate">
                      {item.mimeType || '—'}
                    </span>
                    <span className="text-xs text-right text-[var(--color-text-muted)]">
                      {formatDateTime(item.updatedAt)}
                    </span>
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadAttachment(item.id, item.title);
                        }}
                        className="p-1 rounded hover:bg-[var(--color-border)]"
                        title="Télécharger"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleDeleteAttachment(e, a)}
                        className="p-1 rounded hover:bg-red-100"
                        title="Supprimer"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Inter-dossier links */}
        {links && links.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold mb-2 text-[var(--color-text)]">
              Liens inter-dossiers ({links.length})
            </h3>
            <div className="border border-[var(--color-border)] rounded-md divide-y divide-[var(--color-border)]">
              {links.map((l, idx) => {
                const doc = linkedDocs?.[idx];
                return (
                  <div
                    key={l.id}
                    className="flex items-center gap-3 px-4 py-2 text-sm"
                  >
                    <ExternalLink className="w-4 h-4 text-[var(--color-text-muted)]" />
                    <span className="flex-1 truncate">
                      {doc?.title ?? '(document supprimé)'}
                    </span>
                    {l.note && (
                      <span className="text-xs text-[var(--color-text-muted)]">
                        {l.note}
                      </span>
                    )}
                    {doc && (
                      <button
                        onClick={() => router.push(`/documents/${doc.id}`)}
                        className="p-1 rounded hover:bg-[var(--color-border)]"
                        title="Ouvrir"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => unlinkDocumentFromDossier(l.id!)}
                      className="p-1 rounded hover:bg-red-100"
                      title="Retirer le lien"
                    >
                      <X className="w-3.5 h-3.5 text-red-500" />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}
        </div>

        {/* ─── Volet latéral droit : actions, recherche, filtres ─── */}
        <aside
          className="flex flex-col flex-shrink-0 w-[280px] border-l border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden"
          aria-label="Actions et filtres"
        >
          <div className="px-4 pt-3 pb-2 border-b border-[var(--color-border)] flex-shrink-0">
            <div className="flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-[var(--color-primary)]" />
              <span className="text-sm font-semibold text-[var(--color-text)]">
                Actions
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {/* Section : Ajouter */}
            <div className="space-y-1.5">
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-faint)] mb-2">
                Ajouter
              </h4>
              <button
                onClick={() => setNewDocOpen(true)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium',
                  'bg-[var(--color-primary)] text-white hover:opacity-90'
                )}
              >
                <Plus className="w-4 h-4" /> Nouveau document
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm',
                  'bg-[var(--color-surface-raised)] border border-[var(--color-border)]',
                  'hover:bg-[var(--color-border)]'
                )}
              >
                <Upload className="w-4 h-4" /> Importer des fichiers
              </button>
              <button
                onClick={() => setAttachOpen(true)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm',
                  'bg-[var(--color-surface-raised)] border border-[var(--color-border)]',
                  'hover:bg-[var(--color-border)]'
                )}
              >
                <FileText className="w-4 h-4" /> Rattacher un document
              </button>
              <button
                onClick={() => setLinkOpen(true)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm',
                  'bg-[var(--color-surface-raised)] border border-[var(--color-border)]',
                  'hover:bg-[var(--color-border)]'
                )}
              >
                <LinkIcon className="w-4 h-4" /> Lien inter-dossiers
              </button>
            </div>

            {/* Section : Recherche & filtres */}
            <div className="space-y-2 pt-2 border-t border-[var(--color-border)]">
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-faint)] mb-2">
                Recherche & filtres
              </h4>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
                <input
                  type="text"
                  placeholder="Rechercher dans ce dossier…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={cn(
                    'w-full pl-9 pr-3 py-2 text-sm rounded-md',
                    'bg-[var(--color-surface-raised)] border border-[var(--color-border)]'
                  )}
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as DocumentStatus | 'all')
                }
                className="w-full px-3 py-2 text-sm rounded-md bg-[var(--color-surface-raised)] border border-[var(--color-border)]"
              >
                <option value="all">Tous les statuts</option>
                {Object.entries(DOCUMENT_STATUS_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-md bg-[var(--color-surface-raised)] border border-[var(--color-border)]"
              >
                <option value="all">Toutes catégories</option>
                {DOCUMENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </aside>
      </div>

      <NewDocumentDialog
        open={newDocOpen}
        onClose={() => setNewDocOpen(false)}
        onCreate={handleCreate}
      />

      <AttachExistingDialog
        open={attachOpen}
        dossierId={dossier.id!}
        onClose={() => setAttachOpen(false)}
      />

      <LinkDocumentDialog
        open={linkOpen}
        dossierId={dossier.id!}
        onClose={() => setLinkOpen(false)}
      />
    </>
  );
}

// ─── Dialog : rattacher un document existant (change dossierId) ─────────────
function AttachExistingDialog({
  open,
  dossierId,
  onClose,
}: {
  open: boolean;
  dossierId: number;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const candidates = useLiveQuery<MylawDocument[]>(
    () =>
      open
        ? db.documents
            .filter((d) => d.dossierId !== dossierId)
            .toArray()
        : Promise.resolve([] as MylawDocument[]),
    [open, dossierId]
  );

  if (!open) return null;

  const filtered = (candidates ?? []).filter((d) =>
    d.title.toLowerCase().includes(search.toLowerCase())
  );

  async function attach(doc: MylawDocument) {
    await saveDocument({
      ...doc,
      dossierId,
      updatedAt: new Date(),
    });
    await logAudit({
      dossierId,
      entityType: 'document',
      entityId: doc.id!,
      action: 'attach',
    });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl w-[560px] max-w-[90vw] max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)]">
          <h3 className="text-sm font-semibold">Rattacher un document</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--color-surface-raised)]">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3 overflow-hidden flex flex-col flex-1">
          <input
            type="text"
            placeholder="Rechercher un document…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-md bg-[var(--color-surface-raised)] border border-[var(--color-border)]"
            autoFocus
          />
          <div className="flex-1 overflow-auto border border-[var(--color-border)] rounded-md divide-y divide-[var(--color-border)]">
            {filtered.length === 0 ? (
              <div className="text-sm text-center py-6 text-[var(--color-text-muted)]">
                Aucun document disponible.
              </div>
            ) : (
              filtered.map((d) => (
                <button
                  key={d.id}
                  onClick={() => attach(d)}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-[var(--color-surface-raised)] text-left"
                >
                  <FileText className="w-4 h-4 text-[var(--color-text-muted)]" />
                  <span className="flex-1 truncate">{d.title}</span>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {formatDate(d.updatedAt)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Dialog : créer un lien inter-dossiers ──────────────────────────────────
function LinkDocumentDialog({
  open,
  dossierId,
  onClose,
}: {
  open: boolean;
  dossierId: number;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [note, setNote] = useState('');
  const [selected, setSelected] = useState<MylawDocument | null>(null);
  const all = useLiveQuery<MylawDocument[]>(
    () => (open ? db.documents.toArray() : Promise.resolve([] as MylawDocument[])),
    [open]
  );

  if (!open) return null;

  const filtered = (all ?? []).filter(
    (d) =>
      d.dossierId !== dossierId &&
      d.title.toLowerCase().includes(search.toLowerCase())
  );

  async function createLink() {
    if (!selected) return;
    await linkDocumentToDossier(selected.id!, dossierId, note || undefined);
    setSelected(null);
    setNote('');
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl w-[560px] max-w-[90vw] max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)]">
          <h3 className="text-sm font-semibold">Lien inter-dossiers</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--color-surface-raised)]">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3 overflow-hidden flex flex-col flex-1">
          <p className="text-xs text-[var(--color-text-muted)]">
            Le document reste rattaché à son dossier principal mais apparaît
            également ici comme copie-lien.
          </p>
          <input
            type="text"
            placeholder="Rechercher…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-md bg-[var(--color-surface-raised)] border border-[var(--color-border)]"
          />
          <div className="flex-1 overflow-auto border border-[var(--color-border)] rounded-md divide-y divide-[var(--color-border)]">
            {filtered.length === 0 ? (
              <div className="text-sm text-center py-6 text-[var(--color-text-muted)]">
                Aucun document.
              </div>
            ) : (
              filtered.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setSelected(d)}
                  className={cn(
                    'w-full flex items-center gap-2 px-4 py-2 text-sm text-left',
                    selected?.id === d.id
                      ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                      : 'hover:bg-[var(--color-surface-raised)]'
                  )}
                >
                  <FileText className="w-4 h-4 text-[var(--color-text-muted)]" />
                  <span className="flex-1 truncate">{d.title}</span>
                </button>
              ))
            )}
          </div>
          <input
            type="text"
            placeholder="Note (ex. copie de pièce pour procédure parallèle)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-md bg-[var(--color-surface-raised)] border border-[var(--color-border)]"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-md bg-[var(--color-surface-raised)] hover:bg-[var(--color-border)]"
            >
              Annuler
            </button>
            <button
              onClick={createLink}
              disabled={!selected}
              className={cn(
                'px-4 py-2 text-sm rounded-md font-medium text-white',
                'bg-[var(--color-primary)] hover:opacity-90 disabled:opacity-40'
              )}
            >
              Créer le lien
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
