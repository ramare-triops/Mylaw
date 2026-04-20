'use client';

/**
 * BrickMarginIcons
 *
 * Overlay qui s'affiche au-dessus de la page du document TipTap, et qui
 * positionne dans la marge gauche une icône "intervenants" à la hauteur de
 * chaque brique insérée (marqueur invisible <span data-mylaw-brick-id>).
 *
 * Comportements clés :
 *  - L'icône apparaît dès qu'une brique avec `targetContactType` ou
 *    `targetRoles` a été insérée dans le document.
 *  - L'icône disparaît automatiquement dès que toutes les variables
 *    non-renseignées de la brique ont été remplies (plus aucun
 *    <span data-variable-field> entre ce marqueur et le suivant).
 *  - Clic sur une icône = ouvre le BrickIntervenantPicker pour remplir
 *    d'un coup tous les champs restants depuis un contact.
 *
 * Positionnement :
 *  - On utilise getBoundingClientRect() des marqueurs DOM (viewport coords).
 *  - Les icônes sont rendues en position fixed.
 *  - Le recalcul est fait sur : onUpdate de l'éditeur, scroll de la fenêtre,
 *    scroll d'un ancêtre scrollable, resize.
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
  domPos: number;          // position ProseMirror du marqueur
  nextDomPos: number;      // position du marqueur suivant (ou fin du doc)
  unfilledCount: number;   // nombre de [data-variable-field] restants dans la portée
  top: number;             // Y viewport (du marqueur)
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

    // Pour chaque marqueur : position PM, rect, unfilled count jusqu'au
    // prochain marqueur.
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

      // Position PM du marqueur (le nœud courant)
      let domPos = 0;
      try {
        domPos = editor.view.posAtDOM(el, 0);
      } catch {
        domPos = 0;
      }
      const nextEl = markerNodes[i + 1];
      let nextDomPos = editor.state.doc.content.size;
      if (nextEl) {
        try {
          nextDomPos = editor.view.posAtDOM(nextEl, 0);
        } catch {
          nextDomPos = editor.state.doc.content.size;
        }
      }

      // Compte les [data-variable-field] dans la plage [el, nextEl)
      let unfilled = 0;
      const range = document.createRange();
      range.setStartAfter(el);
      if (nextEl) range.setEndBefore(nextEl);
      else {
        range.setEndAfter(editorEl);
      }
      const frag = range.cloneContents();
      unfilled =
        frag.querySelectorAll('[data-variable-field]').length;

      // Rect du marqueur (on prend la ligne du parent si le marqueur est width:0)
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
        domPos,
        nextDomPos,
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

  // ─── Application d'un contact à la plage d'une brique ────────────────────
  const applyContactToMarker = useCallback(
    (marker: MarkerInfo, contact: Contact) => {
      if (!editor) return;
      // Parcourt les variableField nodes dans [domPos, nextDomPos) et
      // remplace ceux dont on connaît une valeur.
      const replacements: Array<{ pos: number; value: string }> = [];
      editor.state.doc.nodesBetween(
        marker.domPos,
        marker.nextDomPos,
        (node, pos) => {
          if (node.type.name !== 'variableField') return true;
          const name = node.attrs.name as string;
          if (!name) return false;
          // On importe dynamiquement pour éviter un cycle
          const value = resolveValue(contact, name);
          if (value != null && value !== '') {
            replacements.push({ pos, value });
          }
          return false;
        }
      );
      // Applique en ordre inverse pour ne pas décaler les positions.
      replacements
        .sort((a, b) => b.pos - a.pos)
        .forEach((r) => {
          editor.commands.replaceVariable(r.pos, r.value);
        });
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

  // Position X : bord gauche du contenu éditeur, moins 32px
  const pageRect = pageRef.current?.getBoundingClientRect();
  const iconLeft = pageRect ? Math.max(8, pageRect.left - 32) : 8;

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
              rect: { top: rect.bottom + 4, left: rect.left },
            });
          }}
          title={`Pré-remplir « ${m.brickTitle} » depuis un intervenant`}
          aria-label={`Pré-remplir depuis un intervenant (${m.unfilledCount} champ${
            m.unfilledCount > 1 ? 's' : ''
          } à remplir)`}
          style={{
            position: 'fixed',
            top: m.top,
            left: iconLeft,
            width: 24,
            height: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 6,
            border: '1.5px solid var(--color-primary)',
            background: 'var(--color-surface)',
            color: 'var(--color-primary)',
            cursor: 'pointer',
            boxShadow: '0 1px 4px rgba(0,0,0,0.10)',
            zIndex: 40,
            transition: 'transform 0.12s, background 0.12s',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform =
              'scale(1.08)';
            (e.currentTarget as HTMLButtonElement).style.background =
              'var(--color-primary-light)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
            (e.currentTarget as HTMLButtonElement).style.background =
              'var(--color-surface)';
          }}
        >
          <Users size={13} />
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

// ─── Helpers ─────────────────────────────────────────────────────────────
function resolveValue(c: Contact, name: string): string | undefined {
  return contactVariableValue(c, name);
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
