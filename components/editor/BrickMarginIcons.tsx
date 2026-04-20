'use client';

/**
 * BrickMarginIcons
 *
 * Overlay affiché par-dessus la page éditeur TipTap. Pour chaque brique
 * insérée (marqueur invisible <span data-mylaw-brick-id>) qui contient
 * encore des variables non-remplies et qui cible un intervenant, une petite
 * icône carrée type « commentaire Word » est épinglée dans la marge gauche,
 * dans l'alignement vertical de la brique.
 *
 * L'icône reste affichée tant que la brique contient au moins un
 * <span data-variable-field> non rempli. Dès que tout est rempli, elle
 * disparaît automatiquement.
 *
 * Clic sur l'icône → ouvre le BrickIntervenantPicker pour remplir d'un coup
 * tous les champs restants depuis un contact.
 *
 * Pour fiabiliser le remplissage, on s'appuie sur l'identifiant unique
 * (brickId) porté par le marqueur : on retrouve la plage PM correspondante
 * en traversant le document ProseMirror plutôt qu'en utilisant les positions
 * retournées par posAtDOM sur des nœuds atomiques (approche fragile).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Users } from 'lucide-react';
import type { Editor } from '@tiptap/react';
import { BrickIntervenantPicker } from './BrickIntervenantPicker';
import { contactVariableValue } from '@/lib/contact-variables';
import type { Contact, ContactType, DossierRole } from '@/types';

interface MarkerInfo {
  brickId: string;
  brickTitle: string;
  targetContactType?: ContactType;
  targetRoles: DossierRole[];
  unfilledCount: number;   // nombre de [data-variable-field] restants dans la portée
  top: number;             // Y viewport (du marqueur dans la page scalée)
}

interface Props {
  editor: Editor | null;
  /** Élément de page (div.mylex-editor-content ancêtre) utilisé pour aligner la colonne d'icônes sur sa marge gauche. */
  pageRef: React.RefObject<HTMLDivElement | null>;
  dossierId?: number;
}

export function BrickMarginIcons({ editor, pageRef, dossierId }: Props) {
  const [markers, setMarkers] = useState<MarkerInfo[]>([]);
  const [picker, setPicker] = useState<{
    marker: MarkerInfo;
    rect: { top: number; left: number };
  } | null>(null);
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Scan du DOM pour retrouver les marqueurs + unfilled vars ────────────
  const scan = useCallback(() => {
    if (!editor) {
      setMarkers([]);
      return;
    }
    const editorEl = editor.view.dom as HTMLElement;
    const markerNodes = Array.from(
      editorEl.querySelectorAll<HTMLElement>('[data-mylaw-brick-id]')
    );
    if (markerNodes.length === 0) {
      setMarkers([]);
      return;
    }

    const infos: MarkerInfo[] = [];
    for (let i = 0; i < markerNodes.length; i++) {
      const el = markerNodes[i];
      const brickId = el.getAttribute('data-mylaw-brick-id') ?? '';
      const brickTitle = el.getAttribute('data-brick-title') ?? '';
      const targetType =
        (el.getAttribute('data-brick-target-type') as ContactType | null) ??
        undefined;
      const rolesStr = el.getAttribute('data-brick-target-roles') ?? '';
      const targetRoles = rolesStr
        ? (rolesStr.split(',').filter(Boolean) as DossierRole[])
        : [];

      // Compte des variables non remplies dans la plage DOM [el, nextEl)
      const nextEl = markerNodes[i + 1];
      const range = document.createRange();
      range.setStartAfter(el);
      if (nextEl) range.setEndBefore(nextEl);
      else range.setEndAfter(editorEl);
      const frag = range.cloneContents();
      const unfilled = frag.querySelectorAll('[data-variable-field]').length;

      // Rect du marqueur : comme le span a width:0;height:0, on prend le
      // rect du parent (paragraphe) pour obtenir une ligne exploitable.
      const probe =
        el.getBoundingClientRect().height === 0
          ? (el.parentElement ?? el)
          : el;
      const rect = probe.getBoundingClientRect();

      infos.push({
        brickId,
        brickTitle,
        targetContactType: targetType ?? undefined,
        targetRoles,
        unfilledCount: unfilled,
        top: rect.top,
      });
    }

    setMarkers(infos);
  }, [editor]);

  const scheduleScan = useCallback(() => {
    if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
    scanTimeoutRef.current = setTimeout(() => {
      scan();
    }, 50);
  }, [scan]);

  // ─── Abonnement aux événements pertinents ────────────────────────────────
  useEffect(() => {
    if (!editor) return;
    scheduleScan();
    const onUpdate = () => scheduleScan();
    const onTransaction = () => scheduleScan();
    editor.on('update', onUpdate);
    editor.on('transaction', onTransaction);
    const onWindow = () => scheduleScan();
    window.addEventListener('scroll', onWindow, true);
    window.addEventListener('resize', onWindow);
    return () => {
      editor.off('update', onUpdate);
      editor.off('transaction', onTransaction);
      window.removeEventListener('scroll', onWindow, true);
      window.removeEventListener('resize', onWindow);
    };
  }, [editor, scheduleScan]);

  // ─── Application d'un contact à la brique identifiée par brickId ────────
  const applyContactToMarker = useCallback(
    (marker: MarkerInfo, contact: Contact) => {
      if (!editor) return;
      applyContactToBrickId(editor, marker.brickId, contact);
      setPicker(null);
      scheduleScan();
    },
    [editor, scheduleScan]
  );

  // ─── Rendu ───────────────────────────────────────────────────────────────
  // Seules les briques avec target* + au moins une variable non renseignée
  // méritent une icône. Les autres disparaissent silencieusement.
  const visible = markers.filter(
    (m) =>
      m.unfilledCount > 0 &&
      (m.targetContactType || m.targetRoles.length > 0)
  );

  // Position X : bord gauche de la page, avec un petit retrait pour être
  // clairement « dans la marge ».
  const pageRect = pageRef.current?.getBoundingClientRect();
  const iconLeft = pageRect ? Math.max(8, pageRect.left - 36) : 8;

  return (
    <>
      {visible.map((m) => (
        <button
          key={m.brickId}
          type="button"
          onClick={(e) => {
            const rect = (
              e.currentTarget as HTMLButtonElement
            ).getBoundingClientRect();
            setPicker({
              marker: m,
              rect: { top: rect.bottom + 4, left: rect.right + 6 },
            });
          }}
          title={`Pré-remplir « ${m.brickTitle} » depuis un intervenant (${m.unfilledCount} champ${m.unfilledCount > 1 ? 's' : ''} restant${m.unfilledCount > 1 ? 's' : ''})`}
          aria-label={`Pré-remplir depuis un intervenant (${m.unfilledCount} champ${
            m.unfilledCount > 1 ? 's' : ''
          } à remplir)`}
          style={{
            position: 'fixed',
            top: m.top,
            left: iconLeft,
            width: 26,
            height: 26,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 6,
            border: '1.5px solid var(--color-primary)',
            background: 'var(--color-surface)',
            color: 'var(--color-primary)',
            cursor: 'pointer',
            boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
            zIndex: 60,
            transition: 'transform 0.12s, background 0.12s',
            padding: 0,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform =
              'scale(1.08)';
            (e.currentTarget as HTMLButtonElement).style.background =
              'var(--color-primary-light, rgba(1,105,111,0.08))';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
            (e.currentTarget as HTMLButtonElement).style.background =
              'var(--color-surface)';
          }}
        >
          <Users size={14} />
          <span
            style={{
              position: 'absolute',
              top: -6,
              right: -6,
              minWidth: 14,
              height: 14,
              padding: '0 3px',
              borderRadius: 7,
              background: 'var(--color-primary)',
              color: '#fff',
              fontSize: 9,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
          >
            {m.unfilledCount}
          </span>
        </button>
      ))}

      {picker && (
        <BrickIntervenantPicker
          brick={{
            title: picker.marker.brickTitle,
            targetContactType: picker.marker.targetContactType,
            targetRoles: picker.marker.targetRoles,
          }}
          dossierId={dossierId}
          anchorRect={picker.rect}
          onPick={(contact) => applyContactToMarker(picker.marker, contact)}
          onClose={() => setPicker(null)}
        />
      )}
    </>
  );
}

// ─── Helpers exportés ─────────────────────────────────────────────────────

/**
 * Retrouve la plage PM [start, end) occupée par une brique (identifiée par
 * son brickId) en traversant le document ProseMirror. Plus fiable que
 * posAtDOM() sur des nœuds atomiques inline.
 *
 * Retourne null si le brickMarker n'est pas trouvé.
 */
export function findBrickRangeByBrickId(
  editor: Editor,
  brickId: string
): { start: number; end: number } | null {
  let start = -1;
  let end = editor.state.doc.content.size;
  let seenStart = false;

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'brickMarker') return true;
    if (seenStart) {
      // Premier marqueur rencontré après le nôtre : fin de plage.
      end = pos;
      return false;
    }
    if (node.attrs.brickId === brickId) {
      start = pos + node.nodeSize; // juste après le marqueur
      seenStart = true;
    }
    return true;
  });

  if (start < 0) return null;
  return { start, end };
}

/**
 * Remplit les variableField d'une brique donnée (par brickId) à partir d'un
 * contact, en conservant formatage et positions. Utilisé à la fois par
 * BrickMarginIcons et par le popup posé au drop d'une brique.
 *
 * Retourne le nombre de variables effectivement remplacées.
 */
export function applyContactToBrickId(
  editor: Editor,
  brickId: string,
  contact: Contact
): number {
  const range = findBrickRangeByBrickId(editor, brickId);
  if (!range) return 0;

  const replacements: Array<{ pos: number; value: string }> = [];
  editor.state.doc.nodesBetween(range.start, range.end, (node, pos) => {
    if (node.type.name !== 'variableField') return true;
    const name = node.attrs.name as string | null;
    if (!name) return false;
    const value = contactVariableValue(contact, name);
    if (value != null && value !== '') {
      replacements.push({ pos, value });
    }
    return false;
  });

  // Appliquer en ordre décroissant pour ne pas invalider les positions.
  replacements
    .sort((a, b) => b.pos - a.pos)
    .forEach((r) => editor.commands.replaceVariable(r.pos, r.value));

  return replacements.length;
}

// Re-export utilitaire pour wrapper un HTML de brique avec un marqueur
// invisible. Utilisé depuis DocumentEditorWrapper au moment de l'insertion.
export function wrapBrickHtmlWithMarker(
  html: string,
  opts: {
    brickId: string;
    title: string;
    targetContactType?: ContactType;
    targetRoles?: DossierRole[];
  }
): string {
  const attrs: string[] = [
    `data-mylaw-brick-id="${escapeAttr(opts.brickId)}"`,
    `data-brick-title="${escapeAttr(opts.title)}"`,
  ];
  if (opts.targetContactType)
    attrs.push(
      `data-brick-target-type="${escapeAttr(opts.targetContactType)}"`
    );
  if (opts.targetRoles && opts.targetRoles.length > 0)
    attrs.push(
      `data-brick-target-roles="${escapeAttr(opts.targetRoles.join(','))}"`
    );
  attrs.push(
    'class="mylaw-brick-marker"',
    'style="display:inline-block;width:0;height:0;overflow:hidden;user-select:none;"',
    'aria-hidden="true"'
  );
  const marker = `<span ${attrs.join(' ')}></span>`;
  // On insère le marker au début du premier paragraphe si possible (sinon
  // au tout début du fragment) pour qu'il appartienne au même block.
  if (html.startsWith('<p>')) {
    return '<p>' + marker + html.slice(3);
  }
  return marker + html;
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}
