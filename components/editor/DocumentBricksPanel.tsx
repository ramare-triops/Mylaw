// components/editor/DocumentBricksPanel.tsx
'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Blocks, Plus, Trash2, Tag, User, Building2,
  Scale, ChevronDown, ChevronRight, Gavel, AlignLeft, FileText,
  Users, Briefcase, X, Check, Pencil, Settings2, Search,
  Bold, Underline, Italic, CaseSensitive, ListFilter, FolderPlus,
} from 'lucide-react'
import { db, getSetting, setSetting } from '@/lib/db'
import type { Brick as DBBrick, InfoLabel, ContactType, DossierRole, Contact } from '@/types'
import { BrickIntervenantPicker } from './BrickIntervenantPicker'
import { applyContactToBrickContent } from '@/lib/contact-variables'
import {
  FieldsTabContent,
  type TemplateField,
} from '@/components/templates/TemplateFieldsPanel'
import {
  DEFAULT_SUGGESTED_TAGS,
  DEFAULT_CONDITIONAL_TAGS,
  type TextVar,
  type CondVar,
} from '@/lib/brick-variables'
import { makeIdentificationBlockHtml } from './extensions/IdentificationBlock'

// ─── Types UI ────────────────────────────────────────────────────────────────

export interface Brick {
  id: string
  label: string
  content: string
  category: string   // id de la catégorie (système ou custom)
  icon: string
  color: string
  /** Si défini, cette brique peut être "remplie depuis un intervenant" du type correspondant. */
  targetContactType?: ContactType
  /** Si défini, rôles dossier éligibles pour la pré-sélection. */
  targetRoles?: DossierRole[]
  /**
   * Quand défini, la brique est un bloc d'identification lié au rôle du
   * dossier indiqué : son insertion pose un marqueur Tiptap qui sera
   * résolu à l'instanciation du modèle dans un dossier, et non le
   * contenu brut de `content`.
   */
  identityRole?: DossierRole
  /** Séparateur HTML entre deux intervenants de même rôle (bloc d'identification). */
  identitySeparator?: string
}

export interface BrickGroup {
  id: string
  label: string
  color: string
  iconName: string
  bricks: Brick[]
  isCustomCategory?: boolean   // true = catégorie créée par l'utilisateur
}

export const DRAG_BRICK_KEY = 'application/x-mylaw-brick'

// Catégories système (toutes éditables)
const SYSTEM_CATEGORIES = [
  { id: 'dossier',   label: 'Dossier',        color: '#01696f' },
  { id: 'parties',   label: 'Parties',       color: '#01696f' },
  { id: 'structure', label: 'Structure',      color: '#4f46e5' },
  { id: 'formules',  label: 'Formules types', color: '#15803d' },
  { id: 'custom',    label: 'Mes briques',    color: '#6b7280' },
]

const ICON_OPTIONS = [
  { name: 'user',       label: 'Personne'   },
  { name: 'users',      label: 'Parties'    },
  { name: 'building',   label: 'Société'    },
  { name: 'scale',      label: 'Justice'    },
  { name: 'gavel',      label: 'Tribunal'   },
  { name: 'align-left', label: 'Texte'      },
  { name: 'file-text',  label: 'Document'   },
  { name: 'briefcase',  label: 'Avocat'     },
  { name: 'check',      label: 'Validation' },
  { name: 'blocks',     label: 'Brique'     },
]

const COLOR_OPTIONS = [
  '#F95F5F', '#34C95A', '#4D9FFF', '#A855F7',
  '#FF6B00', '#E63946', '#2ECC71', '#3B82F6', '#7C3AED',
]

// ─── Briques pré-installées (seed) ───────────────────────────────────────────

const SEED_BRICKS: Omit<DBBrick, 'id'>[] = [
  // Briques « Dossier » — leur contenu est synthétique, généré à
  // l'instanciation du modèle dans un dossier à partir des intervenants
  // du rôle correspondant. Le champ `content` sert uniquement de
  // description visible côté éditeur de briques.
  { title: 'Client',              content: '→ Identification du client du dossier',                       category: 'clause', tags: ['dossier', 'user',     '#01696f'], identityRole: 'client',           identitySeparator: '<p>et</p>', createdAt: new Date(), updatedAt: new Date() },
  { title: 'Partie adverse',      content: '→ Identification de la partie adverse du dossier',           category: 'clause', tags: ['dossier', 'users',    '#01696f'], identityRole: 'adversary',        identitySeparator: '<p>et</p>', createdAt: new Date(), updatedAt: new Date() },
  { title: 'Avocat du cabinet',   content: '→ Identification de l\'avocat du cabinet (à défaut : paramètres > Cabinet)', category: 'clause', tags: ['dossier', 'scale',    '#01696f'], identityRole: 'ownCounsel',       identitySeparator: '<p>et</p>', createdAt: new Date(), updatedAt: new Date() },
  { title: 'Confrère adverse',    content: '→ Identification du confrère adverse',                         category: 'clause', tags: ['dossier', 'scale',    '#01696f'], identityRole: 'adversaryCounsel', identitySeparator: '<p>et</p>', createdAt: new Date(), updatedAt: new Date() },
  { title: 'Expert judiciaire',   content: '→ Identification de l\'expert désigné',                       category: 'clause', tags: ['dossier', 'briefcase','#01696f'], identityRole: 'expert',           identitySeparator: '<p>et</p>', createdAt: new Date(), updatedAt: new Date() },
  { title: 'Magistrat',           content: '→ Identification du magistrat',                                category: 'clause', tags: ['dossier', 'gavel',    '#01696f'], identityRole: 'judge',            identitySeparator: '<p>et</p>', createdAt: new Date(), updatedAt: new Date() },
  { title: 'Juridiction',         content: '→ Identification de la juridiction',                           category: 'clause', tags: ['dossier', 'gavel',    '#01696f'], identityRole: 'court',            identitySeparator: '<p>et</p>', createdAt: new Date(), updatedAt: new Date() },
  // Variantes d'identité — servent de « gabarits » aux blocs Dossier
  // ci-dessus : physique pour un Contact.type === 'physical', morale pour
  // 'moral'. Restent disponibles dans la catégorie Parties pour être
  // insérées directement via le picker d'intervenant, comme avant.
  { title: 'Personne physique', content: '[M/Mme] **[Nom] [Prénom]**, [né/née] le [Date de naissance] à [Lieu de naissance], de nationalité [Nationalité], demeurant au [Adresse]', category: 'clause', tags: ['parties', 'user', '#01696f'], targetContactType: 'physical', identityKind: 'physical', createdAt: new Date(), updatedAt: new Date() },
  { title: 'Personne morale', content: 'La société **[Nom de la société]**, [Forme juridique] au capital de [Capital social] euros, immatriculée au RCS de [Ville RCS] sous le numéro [Numéro RCS], dont le siège social est sis [Adresse du siège], représentée par [Représentant légal], en sa qualité de [Qualité du représentant]', category: 'clause', tags: ['parties', 'building', '#7c3aed'], targetContactType: 'moral', identityKind: 'moral', createdAt: new Date(), updatedAt: new Date() },
  { title: 'Ayant pour avocat', content: "Ayant pour avocat **Maître [Nom de l'avocat]**, inscrit(e) au Barreau de [Ville du barreau], dont le cabinet est sis [Adresse du cabinet]", category: 'clause', tags: ['parties', 'scale', '#be185d'], targetContactType: 'physical', targetRoles: ['ownCounsel', 'adversaryCounsel'], createdAt: new Date(), updatedAt: new Date() },
  { title: 'Représentant / mandataire', content: "Représenté(e) par **[Nom du mandataire]**, [Qualité], en vertu d'un pouvoir en date du [Date du pouvoir]", category: 'clause', tags: ['parties', 'briefcase', '#c2410c'], createdAt: new Date(), updatedAt: new Date() },
  { title: 'Faits et procédure', content: '^^FAITS ET PROCÉDURE^^', category: 'introduction', tags: ['structure', 'file-text', '#4f46e5'], createdAt: new Date(), updatedAt: new Date() },
  { title: 'Plaise au Tribunal', content: '^^PLAISE AU TRIBUNAL DE [Nom du tribunal]^^', category: 'introduction', tags: ['structure', 'gavel', '#4f46e5'], createdAt: new Date(), updatedAt: new Date() },
  { title: 'Par ces motifs', content: '^^PAR CES MOTIFS^^', category: 'dispositif', tags: ['structure', 'gavel', '#4f46e5'], createdAt: new Date(), updatedAt: new Date() },
  { title: 'Discussion', content: '^^DISCUSSION^^', category: 'motivation', tags: ['structure', 'align-left', '#4f46e5'], createdAt: new Date(), updatedAt: new Date() },
  { title: 'En droit', content: '^^EN DROIT^^', category: 'motivation', tags: ['structure', 'scale', '#4f46e5'], createdAt: new Date(), updatedAt: new Date() },
  { title: 'En fait', content: '^^EN FAIT^^', category: 'motivation', tags: ['structure', 'file-text', '#4f46e5'], createdAt: new Date(), updatedAt: new Date() },
  { title: 'Demandes', content: '^^DEMANDES^^', category: 'dispositif', tags: ['structure', 'gavel', '#4f46e5'], createdAt: new Date(), updatedAt: new Date() },
  { title: 'Entre les soussignés', content: '^^ENTRE LES SOUSSIGNÉS :^^', category: 'formule', tags: ['formules', 'users', '#15803d'], createdAt: new Date(), updatedAt: new Date() },
  { title: 'Il a été convenu', content: '^^IL A ÉTÉ CONVENU ET ARRÊTÉ CE QUI SUIT :^^', category: 'formule', tags: ['formules', 'check', '#15803d'], createdAt: new Date(), updatedAt: new Date() },
  { title: 'Fait à…', content: 'Fait à [Lieu], le [Date], en [Nombre] exemplaire(s) originaux.', category: 'formule', tags: ['formules', 'file-text', '#15803d'], createdAt: new Date(), updatedAt: new Date() },
  { title: 'Bloc signature', content: 'Pour [Partie 1]\n[Nom et signature]\n\nPour [Partie 2]\n[Nom et signature]', category: 'formule', tags: ['formules', 'check', '#15803d'], createdAt: new Date(), updatedAt: new Date() },
]

/**
 * Dédoublonnage défensif des briques en DB.
 *
 * Lorsque plusieurs briques partagent le même `title` ET le même `content`,
 * on ne garde qu'une seule ligne : celle qui a le plus d'informations de
 * présentation (tags `[categorie, icone, couleur]` au complet) et, à égalité,
 * la plus récemment modifiée. Les autres — typiquement des relique des
 * anciennes versions qui ré-insérait les seeds ou des imports Drive avec
 * des IDs divergents — sont supprimées.
 *
 * Ne touche pas aux bricks dont le contenu diffère (l'utilisateur peut
 * vouloir deux briques de même titre mais de contenu différent).
 */
async function dedupeBricksByTitleContent(): Promise<void> {
  try {
    const all = (await db.bricks.toArray()) as (DBBrick & { id: number })[]
    const byKey = new Map<string, (DBBrick & { id: number })[]>()
    for (const b of all) {
      const key = `${b.title}::${b.content}`
      if (!byKey.has(key)) byKey.set(key, [])
      byKey.get(key)!.push(b)
    }
    const toDelete: number[] = []
    for (const dups of Array.from(byKey.values())) {
      if (dups.length < 2) continue
      const sorted = dups.slice().sort((a, b) => {
        const aFull = Array.isArray(a.tags) && a.tags.length >= 3 && !!a.tags[1] && !!a.tags[2] ? 1 : 0
        const bFull = Array.isArray(b.tags) && b.tags.length >= 3 && !!b.tags[1] && !!b.tags[2] ? 1 : 0
        if (aFull !== bFull) return bFull - aFull
        const at = a.updatedAt instanceof Date ? a.updatedAt.getTime() : Date.parse(String(a.updatedAt ?? 0)) || 0
        const bt = b.updatedAt instanceof Date ? b.updatedAt.getTime() : Date.parse(String(b.updatedAt ?? 0)) || 0
        return bt - at
      })
      for (let i = 1; i < sorted.length; i++) toDelete.push(sorted[i].id)
    }
    if (toDelete.length > 0) await db.bricks.bulkDelete(toDelete)
  } catch {
    /* best-effort, pas critique */
  }
}

// ─── Helpers de conversion DB ↔ UI ───────────────────────────────────────────

function dbBrickToUI(b: DBBrick & { id: number }): Brick {
  const uiCategory = b.tags[0] ?? 'custom'
  const icon       = b.tags[1] ?? 'file-text'
  const color      = b.tags[2] ?? SYSTEM_CATEGORIES.find(c => c.id === uiCategory)?.color ?? '#6b7280'
  return {
    id: String(b.id), label: b.title, content: b.content,
    category: uiCategory, icon, color,
    targetContactType: b.targetContactType,
    targetRoles: b.targetRoles,
    identityRole: b.identityRole,
    identitySeparator: b.identitySeparator,
  }
}

function bricksToGroups(
  bricks: (DBBrick & { id: number })[],
  allCategories: CategoryDef[],
): BrickGroup[] {
  const catMap = new Map(allCategories.map(c => [c.id, c]))
  const groupMap = new Map<string, BrickGroup>()

  for (const b of bricks) {
    const ui  = dbBrickToUI(b)
    const cat = catMap.get(ui.category)
    if (!groupMap.has(ui.category)) {
      groupMap.set(ui.category, {
        id:       ui.category,
        label:    cat?.label ?? ui.category,
        color:    cat?.color ?? '#6b7280',
        iconName: cat?.iconName ?? 'blocks',
        bricks:   [],
        isCustomCategory: cat?.isCustomCategory,
      })
    }
    groupMap.get(ui.category)!.bricks.push(ui)
  }

  const systemOrder = SYSTEM_CATEGORIES.map(c => c.id)
  const customCatIds = allCategories.filter(c => c.isCustomCategory).map(c => c.id)
  return [...systemOrder, ...customCatIds]
    .map(id => groupMap.get(id))
    .filter(Boolean) as BrickGroup[]
}

// ─── Types internes ───────────────────────────────────────────────────────────

interface CategoryDef {
  id: string
  label: string
  color: string
  iconName: string
  isCustomCategory?: boolean
  dbId?: number   // id dans infoLabels (uniquement pour les catégories custom)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateId() { return Math.random().toString(36).slice(2, 9) }

// ─── Conversion brique → HTML TipTap ─────────────────────────────────────────
export function brickContentToHtml(content: string): string {
  return content.split('\n').map(line => {
    let p = line
    p = p.replace(/\^\^(.+?)\^\^/g, '<span style="text-transform:uppercase;font-weight:600">$1</span>')
    type FormatSpec = { re: RegExp; tag: string; attr: string }
    const formats: FormatSpec[] = [
      { re: /\*\*(.+?)\*\*/gs,            tag: 'strong', attr: 'data-bold="true"'      },
      { re: /__(.+?)__/gs,                tag: 'u',      attr: 'data-underline="true"' },
      { re: /(?<!_)_([^_]+)_(?!_)/gs,    tag: 'em',     attr: 'data-italic="true"'   },
    ]
    for (const { re, tag, attr } of formats) {
      p = p.replace(re, (_match, inner: string) => {
        const innerConverted = inner.replace(/\[([^\]]+)\]/g, (_m, name: string) => {
          const esc = name.replace(/"/g, '&quot;')
          return `<span data-variable-field="" data-variable-name="${esc}" ${attr}>${esc}</span>`
        })
        return `<${tag}>${innerConverted}</${tag}>`
      })
    }
    p = p.replace(/\[([^\]]+)\]/g, (_m, name: string) => {
      const esc = name.replace(/"/g, '&quot;')
      return `<span data-variable-field="" data-variable-name="${esc}">${esc}</span>`
    })
    p = p.replace(/(<\/span>)(<span data-variable-field)/g, '$1 $2')
    p = p.replace(
      /(<\/(strong|u|em)>)(<span data-variable-field)/g,
      (_, closingTag, _tag, openSpan) => `${closingTag} ${openSpan}`,
    )
    return `<p>${p.trim() || '<br>'}</p>`
  }).join('')
}

// ─── BrickIcon ────────────────────────────────────────────────────────────────

function BrickIcon({ name, size = 11, color }: { name: string; size?: number; color?: string }) {
  const s = { color: color ?? 'currentColor', flexShrink: 0 as const }
  switch (name) {
    case 'user':       return <User       size={size} style={s} />
    case 'users':      return <Users      size={size} style={s} />
    case 'building':   return <Building2  size={size} style={s} />
    case 'scale':      return <Scale      size={size} style={s} />
    case 'gavel':      return <Gavel      size={size} style={s} />
    case 'align-left': return <AlignLeft  size={size} style={s} />
    case 'file-text':  return <FileText   size={size} style={s} />
    case 'briefcase':  return <Briefcase  size={size} style={s} />
    case 'check':      return <Check      size={size} style={s} />
    default:           return <Blocks     size={size} style={s} />
  }
}

// ─── BrickChip ────────────────────────────────────────────────────────────────

function BrickChip({
  brick,
  onInsert,
  onOpenPicker,
}: {
  brick: Brick
  onInsert: () => void
  onOpenPicker?: (b: Brick, rect: DOMRect) => void
}) {
  const [hovered, setHovered] = useState(false)
  const chipRef = useRef<HTMLDivElement>(null)
  const hasTarget = !!(brick.targetContactType || (brick.targetRoles && brick.targetRoles.length > 0))

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData(DRAG_BRICK_KEY, JSON.stringify(brick))
    const ghost = document.createElement('div')
    ghost.textContent = brick.label
    ghost.style.cssText = `position:fixed;top:-999px;padding:3px 10px;border-radius:4px;font-size:12px;font-weight:500;color:${brick.color};background:${brick.color}15;border:1.5px solid ${brick.color};pointer-events:none;`
    document.body.appendChild(ghost)
    e.dataTransfer.setDragImage(ghost, 0, 0)
    setTimeout(() => ghost.remove(), 0)
  }

  function handlePickerClick(e: React.MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    if (!chipRef.current || !onOpenPicker) return
    const rect = chipRef.current.getBoundingClientRect()
    onOpenPicker(brick, rect)
  }

  return (
    <div
      ref={chipRef}
      draggable
      onDragStart={handleDragStart}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={`Cliquer pour insérer · Glisser dans le document${hasTarget ? '\nIcône intervenant : pré-remplir depuis un intervenant' : ''}\n\n${brick.content}`}
      style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 8px', borderRadius: 'var(--radius-md)', border: `1.5px solid ${hovered ? brick.color : brick.color + '50'}`, background: hovered ? brick.color + '18' : brick.color + '0c', cursor: 'grab', userSelect: 'none', transition: 'all 0.12s ease', marginBottom: '4px' }}
    >
      <BrickIcon name={brick.icon} size={11} color={brick.color} />
      <span onClick={onInsert} style={{ flex: 1, fontSize: '11px', fontWeight: 500, color: brick.color, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {brick.label}
      </span>
      {hasTarget && onOpenPicker && (
        <button
          type="button"
          onClick={handlePickerClick}
          aria-label="Pré-remplir depuis un intervenant"
          title="Pré-remplir depuis un intervenant"
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '18px',
            height: '18px',
            borderRadius: '4px',
            border: `1px solid ${brick.color}40`,
            background: `${brick.color}18`,
            color: brick.color,
            cursor: 'pointer',
            transition: 'all 0.12s',
          }}
        >
          <Users size={10} />
        </button>
      )}
    </div>
  )
}

// ─── BrickGroupSection ────────────────────────────────────────────────────────

function BrickGroupSection({
  group, onInsert, onOpenPicker, defaultOpen,
}: {
  group: BrickGroup
  onInsert: (b: Brick) => void
  onOpenPicker?: (b: Brick, rect: DOMRect) => void
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ marginBottom: '4px' }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 2px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}
      >
        {open ? <ChevronDown size={10} style={{ color: group.color, flexShrink: 0 }} /> : <ChevronRight size={10} style={{ color: group.color, flexShrink: 0 }} />}
        <BrickIcon name={group.iconName} size={10} color={group.color} />
        <span style={{ color: group.color }}>{group.label}</span>
        <span style={{ marginLeft: 'auto', fontSize: '9px', color: 'var(--color-text-faint)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>{group.bricks.length}</span>
      </button>
      {open && (
        <div style={{ paddingLeft: '2px', paddingBottom: '4px' }}>
          {group.bricks.map(b => (
            <BrickChip key={b.id} brick={b} onInsert={() => onInsert(b)} onOpenPicker={onOpenPicker} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── FormatToolbar ────────────────────────────────────────────────────────────

function FormatToolbar({ onFormat }: { onFormat: (wrap: [string, string]) => void }) {
  const tools = [
    { icon: <Bold size={13} />,          title: 'Gras',       wrap: ['**', '**'] as [string,string] },
    { icon: <Underline size={13} />,     title: 'Souligné',   wrap: ['__', '__'] as [string,string] },
    { icon: <Italic size={13} />,        title: 'Italique',   wrap: ['_', '_']   as [string,string] },
    { icon: <CaseSensitive size={13} />, title: 'Majuscules', wrap: ['^^', '^^'] as [string,string] },
  ]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', padding: '3px 6px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderBottom: 'none', borderRadius: '6px 6px 0 0', flexShrink: 0 }}>
      {tools.map(t => (
        <button key={t.title} type="button" title={`${t.title} (sélection)`}
          onMouseDown={e => { e.preventDefault(); onFormat(t.wrap) }}
          style={{ padding: '4px 7px', borderRadius: '4px', border: 'none', background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.1s' }}
          onMouseEnter={e => { const b = e.currentTarget; b.style.background = 'var(--color-surface-offset)'; b.style.color = 'var(--color-text)' }}
          onMouseLeave={e => { const b = e.currentTarget; b.style.background = 'transparent'; b.style.color = 'var(--color-text-muted)' }}
        >{t.icon}</button>
      ))}
      <div style={{ width: '1px', background: 'var(--color-border)', margin: '2px 4px', alignSelf: 'stretch' }} />
      <span style={{ fontSize: '10px', color: 'var(--color-text-faint)', paddingLeft: '2px' }}>Sélectionnez du texte puis cliquez</span>
    </div>
  )
}

// ─── BrickPreview ─────────────────────────────────────────────────────────────

function BrickPreview({ content, color }: { content: string; color: string }) {
  return (
    <div style={{ padding: '8px 12px', borderRadius: '6px', background: color + '08', border: `1px solid ${color}30`, fontSize: '11px', lineHeight: 1.6, color: 'var(--color-text)', marginTop: '8px' }}>
      <span style={{ fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color, display: 'block', marginBottom: '4px' }}>Aperçu</span>
      {content.split('\n').map((line, i) => {
        const html = line
          .replace(/\[([^\]]+)\/([^\]]+)\]/g, (_, a, b) =>
            `<span style="display:inline-flex;align-items:center;gap:2px;padding:0 5px;border-radius:3px;border:1.5px solid #7c3aed;background:#7c3aed10;color:#7c3aed;font-size:10px;font-weight:600">${a}/${b}</span>`)
          .replace(/\[([^\]]+)\]/g, (_, n) =>
            `<span style="display:inline-flex;align-items:center;padding:0 5px;border-radius:3px;border:1.5px solid ${color};background:${color}10;color:${color};font-size:10px;font-weight:600">${n}</span>`)
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/__(.+?)__/g, '<u>$1</u>')
          .replace(/(?<!_)_([^_]+)_(?!_)/g, '<em>$1</em>')
          .replace(/\^\^(.+?)\^\^/g, '<span style="text-transform:uppercase;font-weight:600">$1</span>')
        return <p key={i} style={{ margin: '2px 0' }} dangerouslySetInnerHTML={{ __html: html || '&nbsp;' }} />
      })}
    </div>
  )
}

// ─── ColorDot — cercle + popover fixed (jamais clippé par overflow:hidden) ────

function ColorDot({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  const [open, setOpen]     = useState(false)
  const [pos, setPos]       = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  // Ferme au clic extérieur
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (
        popRef.current && !popRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Recalcule la position à chaque ouverture
  function handleToggle() {
    if (open) { setOpen(false); return }
    if (!btnRef.current) return
    const rect      = btnRef.current.getBoundingClientRect()
    // Hauteur estimée du popover : 9 couleurs × 24px + 16px padding ≈ 232px
    const popH      = 232
    const spaceBelow = window.innerHeight - rect.bottom
    const top = spaceBelow >= popH
      ? rect.bottom + 8                    // ouvre vers le bas
      : Math.max(8, rect.top - popH - 8)  // ouvre vers le haut
    const left = rect.left + rect.width / 2
    setPos({ top, left })
    setOpen(true)
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        title="Changer la couleur"
        style={{
          width: '22px', height: '22px', borderRadius: '50%',
          background: color,
          border: `2px solid ${color}88`,
          outline: open ? `2px solid ${color}` : 'none',
          outlineOffset: '2px',
          cursor: 'pointer',
          transition: 'all 0.12s',
          display: 'block',
          flexShrink: 0,
        }}
      />
      {open && pos && (
        <div
          ref={popRef}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            transform: 'translateX(-50%)',
            zIndex: 9999,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: '12px',
            padding: '8px 7px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            alignItems: 'center',
          }}
        >
          {COLOR_OPTIONS.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => { onChange(c); setOpen(false) }}
              title={c}
              style={{
                width: '18px', height: '18px', borderRadius: '50%',
                background: c,
                border: `2px solid ${color === c ? c : 'transparent'}`,
                outline: color === c ? `2px solid ${c}` : 'none',
                outlineOffset: '2px',
                cursor: 'pointer',
                transition: 'all 0.1s',
                flexShrink: 0,
              }}
            />
          ))}
        </div>
      )}
    </>
  )
}

// ─── ColorPicker (utilisé dans BrickEditorForm) ───────────────────────────────

function ColorPicker({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', gap: '4px' }}>
      <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Couleur</span>
      <div style={{ display: 'flex', alignItems: 'center', height: '31px' }}>
        <button type="button" onClick={() => setOpen(v => !v)} title="Changer la couleur"
          style={{ width: '22px', height: '22px', borderRadius: '50%', background: color, border: `2px solid ${color}88`, outline: open ? `2px solid ${color}` : 'none', outlineOffset: '2px', cursor: 'pointer', transition: 'all 0.12s', flexShrink: 0 }}
        />
      </div>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)', zIndex: 50, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '10px', padding: '6px', boxShadow: '0 8px 24px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', gap: '5px', alignItems: 'center' }}>
          {COLOR_OPTIONS.map(c => (
            <button key={c} type="button" onClick={() => { onChange(c); setOpen(false) }} title={c}
              style={{ width: '18px', height: '18px', borderRadius: '50%', background: c, border: `2px solid ${color === c ? c : 'transparent'}`, outline: color === c ? `2px solid ${c}` : 'none', outlineOffset: '2px', cursor: 'pointer', transition: 'all 0.1s', flexShrink: 0 }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── VariableManager ─────────────────────────────────────────────────────────

function VariableManager({ textVars, condVars, onChangeTextVars, onChangeCondVars, onInsertTag }: {
  textVars: TextVar[]
  condVars: CondVar[]
  onChangeTextVars: (v: TextVar[]) => void | Promise<void>
  onChangeCondVars: (v: CondVar[]) => void | Promise<void>
  onInsertTag: (tag: string) => void
}) {
  type Mode = null | 'edit' | 'delete'
  const [mode, setMode] = useState<Mode>(null)
  const [editingTextId,    setEditingTextId]    = useState<string | null>(null)
  const [editingTextValue, setEditingTextValue] = useState('')
  const [editingCondId,    setEditingCondId]    = useState<string | null>(null)
  const [editingCondLabel, setEditingCondLabel] = useState('')
  const [editingCondValue, setEditingCondValue] = useState('')
  const [newTextName,  setNewTextName]  = useState('')
  const [newCondLabel, setNewCondLabel] = useState('')
  const [newCondValue, setNewCondValue] = useState('')

  function switchMode(m: Mode) { setMode(prev => prev === m ? null : m); setEditingTextId(null); setEditingCondId(null) }
  function addTextVar() { const name = newTextName.trim(); if (!name) return; onChangeTextVars([...textVars, { id: generateId(), name }]); setNewTextName('') }
  function deleteTextVar(id: string) { onChangeTextVars(textVars.filter(v => v.id !== id)) }
  function startEditText(v: TextVar) { setEditingTextId(v.id); setEditingTextValue(v.name) }
  function saveEditText(id: string) { const name = editingTextValue.trim(); if (!name) return; onChangeTextVars(textVars.map(v => v.id === id ? { ...v, name } : v)); setEditingTextId(null) }
  function addCondVar() { const label = newCondLabel.trim(), value = newCondValue.trim(); if (!label || !value) return; onChangeCondVars([...condVars, { id: generateId(), label, value }]); setNewCondLabel(''); setNewCondValue('') }
  function deleteCondVar(id: string) { onChangeCondVars(condVars.filter(v => v.id !== id)) }
  function startEditCond(v: CondVar) { setEditingCondId(v.id); setEditingCondLabel(v.label); setEditingCondValue(v.value) }
  function saveEditCond(id: string) { const label = editingCondLabel.trim(), value = editingCondValue.trim(); if (!label || !value) return; onChangeCondVars(condVars.map(v => v.id === id ? { ...v, label, value } : v)); setEditingCondId(null) }

  const chipBase: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 7px', borderRadius: '20px', fontSize: '10px', fontWeight: 500, fontFamily: 'monospace', transition: 'all 0.1s' }
  const smallInput: React.CSSProperties = { padding: '4px 8px', fontSize: '11px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface-offset)', color: 'var(--color-text)', outline: 'none', fontFamily: 'monospace' }
  const miniBtn: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', padding: '1px 4px', display: 'inline-flex', alignItems: 'center', borderRadius: '3px', color: 'var(--color-text-faint)', transition: 'color 0.1s' }

  function ModeBtn({ m, color, icon, label }: { m: Mode; color: string; icon: React.ReactNode; label: string }) {
    const active = mode === m
    return (
      <button type="button" onClick={() => switchMode(m)} title={active ? 'Quitter le mode' : label}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '1px 6px', borderRadius: '20px', fontSize: '10px', fontWeight: 500, border: `1px solid ${active ? color : 'var(--color-border)'}`, background: active ? color + '18' : 'transparent', color: active ? color : 'var(--color-text-faint)', cursor: 'pointer', transition: 'all 0.1s' }}
      >{icon}{active ? 'Terminer' : label}</button>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-faint)', margin: 0 }}>Variables texte</p>
          <div style={{ display: 'flex', gap: '4px' }}>
            <ModeBtn m="edit"   color="#01696f" icon={<Pencil size={9} />} label="Modifier" />
            <ModeBtn m="delete" color="#dc2626" icon={<Trash2 size={9} />} label="Supprimer" />
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {textVars.map(v => editingTextId === v.id ? (
            <span key={v.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <input autoFocus value={editingTextValue} onChange={e => setEditingTextValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveEditText(v.id); if (e.key === 'Escape') setEditingTextId(null) }}
                style={{ ...smallInput, width: '110px' }} />
              <button type="button" onClick={() => saveEditText(v.id)} style={{ ...miniBtn, color: '#01696f' }}><Check size={11} /></button>
              <button type="button" onClick={() => setEditingTextId(null)} style={miniBtn}><X size={11} /></button>
            </span>
          ) : (
            <button key={v.id} type="button"
              onClick={() => { if (mode === 'edit') startEditText(v); else if (mode === 'delete') deleteTextVar(v.id); else onInsertTag(v.name) }}
              style={{ ...chipBase, border: `1.5px solid ${mode === 'delete' ? '#dc262660' : '#01696f60'}`, background: mode === 'delete' ? '#dc26260c' : '#01696f0c', color: mode === 'delete' ? '#dc2626' : '#01696f', cursor: 'pointer', outline: mode === 'edit' ? '1.5px dashed #01696f80' : mode === 'delete' ? '1.5px dashed #dc262680' : 'none', outlineOffset: '1px' }}
            >[{v.name}]</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <input value={newTextName} onChange={e => setNewTextName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addTextVar() }}
            placeholder="Nom de la variable…" style={{ ...smallInput, flex: 1 }} />
          <button type="button" onClick={addTextVar} disabled={!newTextName.trim()}
            style={{ padding: '4px 8px', borderRadius: '6px', border: 'none', background: newTextName.trim() ? '#01696f' : 'var(--color-border)', color: newTextName.trim() ? '#fff' : 'var(--color-text-faint)', cursor: newTextName.trim() ? 'pointer' : 'not-allowed', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px', transition: 'all 0.1s' }}
          ><Plus size={11} /> Ajouter</button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
          <p style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-faint)', margin: 0, flexShrink: 0 }}>Cond. <span style={{ textTransform: 'none', fontWeight: 400, fontSize: '9px' }}>(liste déroulante)</span></p>
          <div style={{ display: 'flex', gap: '4px' }}>
            <ModeBtn m="edit"   color="#7c3aed" icon={<Pencil size={9} />} label="Modifier" />
            <ModeBtn m="delete" color="#dc2626" icon={<Trash2 size={9} />} label="Supprimer" />
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {condVars.map(v => editingCondId === v.id ? (
            <span key={v.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
              <input autoFocus value={editingCondLabel} onChange={e => setEditingCondLabel(e.target.value)} placeholder="Libellé" style={{ ...smallInput, width: '110px' }} />
              <input value={editingCondValue} onChange={e => setEditingCondValue(e.target.value)} placeholder="Valeur"
                onKeyDown={e => { if (e.key === 'Enter') saveEditCond(v.id); if (e.key === 'Escape') setEditingCondId(null) }}
                style={{ ...smallInput, width: '90px' }} />
              <button type="button" onClick={() => saveEditCond(v.id)} style={{ ...miniBtn, color: '#7c3aed' }}><Check size={11} /></button>
              <button type="button" onClick={() => setEditingCondId(null)} style={miniBtn}><X size={11} /></button>
            </span>
          ) : (
            <button key={v.id} type="button"
              onClick={() => { if (mode === 'edit') startEditCond(v); else if (mode === 'delete') deleteCondVar(v.id); else onInsertTag(v.value) }}
              style={{ ...chipBase, border: `1.5px solid ${mode === 'delete' ? '#dc262660' : '#7c3aed60'}`, background: mode === 'delete' ? '#dc26260c' : '#7c3aed0c', color: mode === 'delete' ? '#dc2626' : '#7c3aed', cursor: 'pointer', outline: mode === 'edit' ? '1.5px dashed #7c3aed80' : mode === 'delete' ? '1.5px dashed #dc262680' : 'none', outlineOffset: '1px' }}
            ><ListFilter size={9} />[{v.label}]</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={newCondLabel} onChange={e => setNewCondLabel(e.target.value)} placeholder="Libellé (ex: M / Mme)" style={{ ...smallInput, flex: '1 1 110px' }} />
          <input value={newCondValue} onChange={e => setNewCondValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addCondVar() }}
            placeholder="Valeur (ex: M/Mme)" style={{ ...smallInput, flex: '1 1 90px' }} />
          <button type="button" onClick={addCondVar} disabled={!newCondLabel.trim() || !newCondValue.trim()}
            style={{ padding: '4px 8px', borderRadius: '6px', border: 'none', background: (newCondLabel.trim() && newCondValue.trim()) ? '#7c3aed' : 'var(--color-border)', color: (newCondLabel.trim() && newCondValue.trim()) ? '#fff' : 'var(--color-text-faint)', cursor: (newCondLabel.trim() && newCondValue.trim()) ? 'pointer' : 'not-allowed', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px', transition: 'all 0.1s', whiteSpace: 'nowrap' }}
          ><Plus size={11} /> Ajouter</button>
        </div>
      </div>
    </div>
  )
}

// ─── BrickEditorForm ──────────────────────────────────────────────────────────

function BrickEditorForm({ brick, allCategories, textVars, condVars, onChangeTextVars, onChangeCondVars, onSave, onCancel, onDelete, isNew }: {
  brick: Brick
  allCategories: CategoryDef[]
  /** Variables partagées (persistées), gérées par BricksEditorModal. */
  textVars: TextVar[]
  condVars: CondVar[]
  onChangeTextVars: (v: TextVar[]) => void | Promise<void>
  onChangeCondVars: (v: CondVar[]) => void | Promise<void>
  onSave: (b: Brick) => void
  onCancel: () => void
  onDelete?: () => void
  isNew?: boolean
}) {
  const [label,         setLabel]         = useState(brick.label)
  const [content,       setContent]       = useState(brick.content)
  const [category,      setCategory]      = useState(brick.category)
  const [icon,          setIcon]          = useState(brick.icon)
  const [color,         setColor]         = useState(brick.color)
  const [showPreview,   setShowPreview]   = useState(false)
  const [identityRole,      setIdentityRole]      = useState<DossierRole | ''>(brick.identityRole ?? '')
  const [identitySeparator, setIdentitySeparator] = useState<string>(brick.identitySeparator ?? '')

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function insertTag(tag: string) {
    const ta = textareaRef.current; if (!ta) return
    const s = ta.selectionStart, e = ta.selectionEnd
    const ins = `[${tag}]`
    setContent(content.slice(0, s) + ins + content.slice(e))
    setTimeout(() => { ta.focus(); ta.setSelectionRange(s + ins.length, s + ins.length) }, 0)
  }

  function applyFormat([open, close]: [string, string]) {
    const ta = textareaRef.current; if (!ta) return
    const s = ta.selectionStart, e = ta.selectionEnd
    if (s === e) {
      const ins = open + close; setContent(content.slice(0, s) + ins + content.slice(e))
      setTimeout(() => { ta.focus(); ta.setSelectionRange(s + open.length, s + open.length) }, 0); return
    }
    const sel = content.slice(s, e), before = content.slice(s - open.length, s), after = content.slice(e, e + close.length)
    if (before === open && after === close) {
      setContent(content.slice(0, s - open.length) + sel + content.slice(e + close.length))
      setTimeout(() => { ta.focus(); ta.setSelectionRange(s - open.length, e - open.length) }, 0)
    } else {
      const ins = open + sel + close; setContent(content.slice(0, s) + ins + content.slice(e))
      setTimeout(() => { ta.focus(); ta.setSelectionRange(s, s + ins.length) }, 0)
    }
  }

  const inp: React.CSSProperties = { width: '100%', padding: '7px 10px', fontSize: '13px', background: 'var(--color-surface-offset)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text)', outline: 'none' }
  // Quand la brique est un bloc d'identification, `content` devient
  // purement descriptif (il n'est pas inséré). On relâche alors la
  // contrainte de non-vacuité pour que l'utilisateur puisse sauvegarder
  // même avec une description vide.
  const isIdentityBrick = identityRole !== ''
  const canSave = label.trim() !== '' && (isIdentityBrick || content.trim() !== '')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-md)', flexShrink: 0, background: color + '18', border: `2px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BrickIcon name={icon} size={16} color={color} />
          </div>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Nom de la brique" autoFocus={isNew}
            style={{ ...inp, flex: 1, fontSize: '14px', fontWeight: 600 }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '10px', alignItems: 'end' }}>
          <label style={{ fontSize: '11px', color: 'var(--color-text-muted)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            Catégorie
            <select value={category} onChange={e => setCategory(e.target.value)} style={inp}>
              {allCategories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
          <label style={{ fontSize: '11px', color: 'var(--color-text-muted)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            Icône
            <select value={icon} onChange={e => setIcon(e.target.value)} style={inp}>
              {ICON_OPTIONS.map(o => <option key={o.name} value={o.name}>{o.label}</option>)}
            </select>
          </label>
          <ColorPicker color={color} onChange={setColor} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: 0 }}>Contenu</p>
            <button type="button" onClick={() => setShowPreview(v => !v)}
              style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '20px', border: `1px solid ${showPreview ? color : 'var(--color-border)'}`, background: showPreview ? color + '15' : 'transparent', color: showPreview ? color : 'var(--color-text-faint)', cursor: 'pointer', transition: 'all 0.1s' }}
            >{showPreview ? "Masquer l'aperçu" : 'Aperçu'}</button>
          </div>
          <FormatToolbar onFormat={applyFormat} />
          <textarea ref={textareaRef} value={content} onChange={e => setContent(e.target.value)}
            placeholder={isIdentityBrick
              ? 'Description (facultative). Le contenu effectif est généré à l\'instanciation.'
              : `Rédigez le contenu…\n**Gras** __Souligné__ _Italique_ ^^MAJUSCULES^^\n[Variable] [M/Mme] [né/née]`}
            rows={isIdentityBrick ? 2 : 5}
            disabled={isIdentityBrick}
            style={{
              ...inp, resize: 'vertical', lineHeight: 1.6, fontFamily: 'monospace',
              fontSize: '12px', borderRadius: '0 0 6px 6px', borderTop: 'none',
              opacity: isIdentityBrick ? 0.6 : 1,
            }}
          />
          {showPreview && !isIdentityBrick && <BrickPreview content={content} color={color} />}
        </div>

        <IdentityBlockFields
          role={identityRole}
          separator={identitySeparator}
          onRoleChange={setIdentityRole}
          onSeparatorChange={setIdentitySeparator}
        />

        {!isIdentityBrick && (
          <VariableManager textVars={textVars} condVars={condVars} onChangeTextVars={onChangeTextVars} onChangeCondVars={onChangeCondVars} onInsertTag={insertTag} />
        )}
      </div>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
        <div>
          {onDelete && (
            <button
              type="button"
              onClick={() => { if (confirm('Supprimer cette brique ?')) onDelete() }}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8, border: '1px solid #ef4444', background: 'transparent', color: '#ef4444', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
            >
              <Trash2 size={12} /> Supprimer
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface-offset)', color: 'var(--color-text-muted)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
          >Annuler</button>
          <button
            onClick={() => {
              if (!canSave) return
              onSave({
                ...brick,
                label:             label.trim(),
                content:           content.trim(),
                category,
                icon,
                color,
                identityRole:      identityRole || undefined,
                identitySeparator: identityRole ? (identitySeparator || undefined) : undefined,
              })
            }}
            disabled={!canSave}
            style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: 'var(--color-primary)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: canSave ? 'pointer' : 'not-allowed', opacity: canSave ? 1 : 0.5 }}
          >Enregistrer</button>
        </div>
      </div>
    </div>
  )
}

// ─── IdentityBlockFields ──────────────────────────────────────────────────────
// Section du formulaire d'édition d'une brique dédiée aux « blocs
// d'identification » : rôle du dossier cible + séparateur HTML entre
// intervenants. Quand le rôle est vide, la brique est une brique
// normale et ces champs n'influencent rien.

const IDENTITY_ROLE_OPTIONS: Array<{ value: DossierRole; label: string }> = [
  { value: 'client',           label: 'Client' },
  { value: 'adversary',        label: 'Partie adverse' },
  { value: 'ownCounsel',       label: 'Avocat du cabinet' },
  { value: 'adversaryCounsel', label: 'Confrère adverse' },
  { value: 'expert',           label: 'Expert' },
  { value: 'bailiff',          label: 'Commissaire de justice' },
  { value: 'judge',            label: 'Magistrat' },
  { value: 'court',            label: 'Juridiction' },
  { value: 'witness',          label: 'Témoin' },
  { value: 'collaborator',     label: 'Collaborateur' },
  { value: 'trainee',          label: 'Stagiaire' },
  { value: 'assistant',        label: 'Assistant(e)' },
  { value: 'other',            label: 'Autre' },
]

function separatorHtmlToText(html: string): string {
  if (!html) return ''
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?p[^>]*>/gi, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}

function separatorTextToHtml(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  const safe = trimmed
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return `<p>${safe.replace(/\n/g, '<br>')}</p>`
}

function IdentityBlockFields({
  role,
  separator,
  onRoleChange,
  onSeparatorChange,
}: {
  role: DossierRole | ''
  separator: string
  onRoleChange: (r: DossierRole | '') => void
  onSeparatorChange: (s: string) => void
}) {
  const [sepText, setSepText] = useState(separatorHtmlToText(separator))
  // Maintient la cohérence texte ↔ HTML quand le parent remplace le
  // séparateur (ex. ouverture d'une autre brique sans démonter la form).
  useEffect(() => { setSepText(separatorHtmlToText(separator)) }, [separator])

  const inp: React.CSSProperties = {
    width: '100%', padding: '7px 10px', fontSize: '12px',
    background: 'var(--color-surface-offset)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--color-text)', outline: 'none',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px dashed var(--color-border)', background: 'var(--color-surface-offset)30' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text)', margin: 0 }}>Bloc d'identification du dossier</p>
          <p style={{ fontSize: '10px', color: 'var(--color-text-muted)', margin: '2px 0 0' }}>
            À l'insertion dans un modèle, cette brique pose un placeholder qui s'expansera automatiquement à partir des intervenants du dossier portant ce rôle.
          </p>
        </div>
      </div>

      <label style={{ fontSize: '11px', color: 'var(--color-text-muted)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        Rôle ciblé dans le dossier
        <select
          value={role}
          onChange={(e) => onRoleChange(e.target.value as DossierRole | '')}
          style={inp}
        >
          <option value="">Aucun — brique classique</option>
          {IDENTITY_ROLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </label>

      {role !== '' && (
        <label style={{ fontSize: '11px', color: 'var(--color-text-muted)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          Séparateur entre plusieurs intervenants
          <textarea
            value={sepText}
            onChange={(e) => {
              setSepText(e.target.value)
              onSeparatorChange(separatorTextToHtml(e.target.value))
            }}
            rows={2}
            placeholder="ex : et ; ainsi que ; , son épouse ;"
            style={{ ...inp, resize: 'vertical', fontSize: '12px', lineHeight: 1.4 }}
          />
        </label>
      )}
    </div>
  )
}

// ─── BrickEditorRow ───────────────────────────────────────────────────────────

function BrickEditorRow({ brick, allCategories, onEdit, isSelected }: { brick: Brick; allCategories: CategoryDef[]; onEdit: () => void; isSelected: boolean }) {
  const [h, setH] = useState(false)
  const cat = allCategories.find(c => c.id === brick.category)
  const catColor = cat?.color ?? '#6b7280'
  return (
    <div onClick={onEdit} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', cursor: 'pointer', background: isSelected ? 'var(--color-primary)0f' : h ? 'var(--color-surface-offset)' : 'transparent', borderLeft: `3px solid ${isSelected ? 'var(--color-primary)' : 'transparent'}`, transition: 'all 0.1s' }}
    >
      <div style={{ width: '28px', height: '28px', borderRadius: 'var(--radius-sm)', flexShrink: 0, background: brick.color + '18', border: `1.5px solid ${brick.color}60`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <BrickIcon name={brick.icon} size={13} color={brick.color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{brick.label}</div>
        <div style={{ fontSize: '10px', color: catColor, marginTop: '1px', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>{cat?.label ?? brick.category}</div>
      </div>
      <Pencil size={12} style={{ color: h || isSelected ? 'var(--color-primary)' : 'var(--color-text-faint)', flexShrink: 0, transition: 'color 0.1s' }} />
    </div>
  )
}

// ─── CategoryManagerPanel ─────────────────────────────────────────────────────
// Toutes les catégories sont listées ensemble et peuvent être modifiées / supprimées.

function CategoryManagerPanel({ allCategories, onAdd, onRename, onDelete, onClose, onRenameSystem, onDeleteSystem }: {
  allCategories: CategoryDef[]
  onAdd:          (name: string, color: string) => Promise<void>
  onRename:       (dbId: number, name: string, color: string) => Promise<void>
  onRenameSystem: (id: string, name: string, color: string) => void
  onDelete:       (dbId: number) => Promise<void>
  onDeleteSystem: (id: string) => void
  onClose:        () => void
}) {
  const [newName,    setNewName]    = useState('')
  const [newColor,   setNewColor]   = useState(COLOR_OPTIONS[2])
  const [editingId,  setEditingId]  = useState<string | null>(null)   // category.id (string)
  const [editName,   setEditName]   = useState('')
  const [editColor,  setEditColor]  = useState(COLOR_OPTIONS[2])
  const [confirmDel, setConfirmDel] = useState<string | null>(null)   // category.id
  const [saving,     setSaving]     = useState(false)

  const inp: React.CSSProperties = {
    padding: '5px 9px', fontSize: '12px', borderRadius: '6px',
    border: '1px solid var(--color-border)', background: 'var(--color-surface-offset)',
    color: 'var(--color-text)', outline: 'none', flex: 1, minWidth: 0,
  }

  async function handleAdd() {
    const name = newName.trim(); if (!name) return
    setSaving(true)
    await onAdd(name, newColor)
    setNewName(''); setNewColor(COLOR_OPTIONS[2]); setSaving(false)
  }

  async function handleSaveEdit(cat: CategoryDef) {
    const name = editName.trim(); if (!name) return
    setSaving(true)
    if (cat.isCustomCategory && cat.dbId != null) {
      await onRename(cat.dbId, name, editColor)
    } else {
      onRenameSystem(cat.id, name, editColor)
    }
    setEditingId(null); setSaving(false)
  }

  async function handleDelete(cat: CategoryDef) {
    setSaving(true)
    if (cat.isCustomCategory && cat.dbId != null) {
      await onDelete(cat.dbId)
    } else {
      onDeleteSystem(cat.id)
    }
    setConfirmDel(null); setSaving(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'var(--color-primary)18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <FolderPlus size={14} style={{ color: 'var(--color-primary)' }} />
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text)' }}>Catégories</div>
            <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{allCategories.length} catégorie{allCategories.length > 1 ? 's' : ''}</div>
          </div>
        </div>
        <button onClick={onClose} style={{ width: '28px', height: '28px', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-surface-offset)', border: '1px solid var(--color-border)', cursor: 'pointer', flexShrink: 0 }}>
          <X size={14} style={{ color: 'var(--color-text-muted)' }} />
        </button>
      </div>

      {/* Liste unifiée */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {allCategories.map(cat => {
          if (editingId === cat.id) {
            return (
              <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: '8px', border: `1.5px solid ${editColor}`, background: editColor + '08' }}>
                {/* Cercle couleur avec popover fixed */}
                <ColorDot color={editColor} onChange={setEditColor} />
                <input
                  autoFocus
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(cat); if (e.key === 'Escape') setEditingId(null) }}
                  style={inp}
                />
                <button onClick={() => handleSaveEdit(cat)} disabled={saving} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#01696f', display: 'flex', alignItems: 'center', flexShrink: 0 }}><Check size={14} /></button>
                <button onClick={() => setEditingId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-faint)', display: 'flex', alignItems: 'center', flexShrink: 0 }}><X size={13} /></button>
              </div>
            )
          }

          if (confirmDel === cat.id) {
            return (
              <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderRadius: '8px', border: '1.5px solid var(--color-error)', background: '#fee2e220' }}>
                <span style={{ fontSize: '11px', color: 'var(--color-error)', flex: 1, lineHeight: 1.4 }}>
                  Supprimer « {cat.label} » ?{cat.isCustomCategory ? ' Les briques seront déplacées vers « Mes briques ».' : ' Cette catégorie système sera masquée.'}
                </span>
                <button onClick={() => handleDelete(cat)} disabled={saving}
                  style={{ padding: '3px 10px', borderRadius: '6px', background: 'var(--color-error)', color: '#fff', fontSize: '11px', fontWeight: 600, border: 'none', cursor: 'pointer', flexShrink: 0 }}>Oui</button>
                <button onClick={() => setConfirmDel(null)}
                  style={{ padding: '3px 10px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-muted)', fontSize: '11px', cursor: 'pointer', flexShrink: 0 }}>Non</button>
              </div>
            )
          }

          return (
            <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 10px', borderRadius: '8px', border: `1.5px solid ${cat.color}30`, background: cat.color + '08' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
              <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.label}</span>
              {/* ✏️ toujours visible */}
              <button
                onClick={() => { setEditingId(cat.id); setEditName(cat.label); setEditColor(cat.color) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-faint)', display: 'flex', alignItems: 'center', padding: '2px', flexShrink: 0 }}
              ><Pencil size={12} /></button>
              {/* 🗑️ toujours visible pour toutes les catégories */}
              <button
                onClick={() => setConfirmDel(cat.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-error)', display: 'flex', alignItems: 'center', padding: '2px', flexShrink: 0 }}
              ><Trash2 size={12} /></button>
            </div>
          )
        })}
      </div>

      {/* Formulaire ajout — layout en deux lignes pour éviter le crop du bouton Créer */}
      <div style={{ flexShrink: 0, padding: '14px 16px', borderTop: '1px solid var(--color-border)', background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', margin: 0 }}>Nouvelle catégorie</p>

        {/* Ligne 1 : cercle couleur (avec popover fixed) + champ texte */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ColorDot color={newColor} onChange={setNewColor} />
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
            placeholder="Nom de la catégorie…"
            style={{ ...inp, flex: 1 }}
          />
        </div>

        {/* Ligne 2 : bouton Créer seul, pleine largeur → jamais coupé */}
        <button
          onClick={handleAdd}
          disabled={!newName.trim() || saving}
          style={{
            width: '100%',
            padding: '7px 0',
            borderRadius: '8px',
            border: 'none',
            background: newName.trim() ? 'var(--color-primary)' : 'var(--color-border)',
            color: newName.trim() ? '#fff' : 'var(--color-text-faint)',
            fontSize: '12px',
            fontWeight: 600,
            cursor: newName.trim() ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            transition: 'all 0.15s',
          }}
        >
          <Plus size={13} /> Créer
        </button>
      </div>
    </div>
  )
}

// ─── BricksEditorModal ────────────────────────────────────────────────────────

function BricksEditorModal({ groups, allCategories, onSave, onClose, onAdd, onUpdate, onDelete, onAddCategory, onRenameCategory, onDeleteCategory, onRenameSystemCategory, onDeleteSystemCategory, onReloadBricks }: {
  groups: BrickGroup[]
  allCategories: CategoryDef[]
  onSave: (g: BrickGroup[]) => void
  onClose: () => void
  onAdd:    (b: Omit<Brick, 'id'>) => Promise<string>
  onUpdate: (b: Brick) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onAddCategory:          (name: string, color: string) => Promise<void>
  onRenameCategory:       (dbId: number, name: string, color: string) => Promise<void>
  onDeleteCategory:       (dbId: number) => Promise<void>
  onRenameSystemCategory: (id: string, name: string, color: string) => void
  onDeleteSystemCategory: (id: string) => void
  /** Demande au parent de recharger les briques depuis Dexie après un renommage de variable. */
  onReloadBricks: () => Promise<void>
}) {
  const [localGroups,     setLocalGroups]     = useState<BrickGroup[]>(() => JSON.parse(JSON.stringify(groups)))
  const [selectedBrickId, setSelectedBrickId] = useState<string | null>(null)
  const [isCreating,      setIsCreating]      = useState(false)
  const [search,          setSearch]          = useState('')
  const [filterCat,       setFilterCat]       = useState('all')
  const [showCatManager,  setShowCatManager]  = useState(false)
  /** Confirmation visuelle après enregistrement (affichée ~2s). */
  const [justSaved,       setJustSaved]       = useState<'created' | 'updated' | null>(null)

  // ── Variables partagées (textuelles + conditionnelles) ───────────────────
  // Persistées dans db.settings pour que les modifications survivent à la
  // fermeture de l'éditeur ET aux renommages qui propagent les changements
  // aux contenus de briques existantes.
  const [textVars, setTextVars] = useState<TextVar[]>(
    () => DEFAULT_SUGGESTED_TAGS.map(name => ({ id: generateId(), name })),
  )
  const [condVars, setCondVars] = useState<CondVar[]>(
    () => DEFAULT_CONDITIONAL_TAGS.map(t => ({ id: generateId(), label: t.label, value: t.value })),
  )
  const varsLoaded = useRef(false)

  // Chargement initial des variables depuis Dexie (une seule fois par montage)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const storedText = await getSetting<TextVar[] | null>('brick_text_vars', null)
      const storedCond = await getSetting<CondVar[] | null>('brick_cond_vars', null)
      if (cancelled) return
      if (Array.isArray(storedText) && storedText.length > 0) setTextVars(storedText)
      if (Array.isArray(storedCond) && storedCond.length > 0) setCondVars(storedCond)
      varsLoaded.current = true
    })()
    return () => { cancelled = true }
  }, [])

  /** Propage les renommages de variables textuelles aux contenus de briques. */
  async function handleChangeTextVars(next: TextVar[]) {
    const renames: Array<{ oldName: string; newName: string }> = []
    for (const n of next) {
      const prev = textVars.find(v => v.id === n.id)
      if (prev && prev.name !== n.name) renames.push({ oldName: prev.name, newName: n.name })
    }
    setTextVars(next)
    if (varsLoaded.current) await setSetting('brick_text_vars', next)
    if (renames.length > 0) await rewriteBrickTags(renames.map(r => ({ oldTag: `[${r.oldName}]`, newTag: `[${r.newName}]` })))
  }

  /** Propage les renommages de variables conditionnelles aux contenus de briques. */
  async function handleChangeCondVars(next: CondVar[]) {
    const renames: Array<{ oldValue: string; newValue: string }> = []
    for (const n of next) {
      const prev = condVars.find(v => v.id === n.id)
      if (prev && prev.value !== n.value) renames.push({ oldValue: prev.value, newValue: n.value })
    }
    setCondVars(next)
    if (varsLoaded.current) await setSetting('brick_cond_vars', next)
    if (renames.length > 0) await rewriteBrickTags(renames.map(r => ({ oldTag: `[${r.oldValue}]`, newTag: `[${r.newValue}]` })))
  }

  /**
   * Réécrit toutes les briques contenant les anciens tags vers les nouveaux.
   * Persiste en DB + rafraîchit l'état local (modal + parent) pour que le
   * placement de la brique dans un modèle reflète immédiatement le changement.
   */
  async function rewriteBrickTags(pairs: Array<{ oldTag: string; newTag: string }>) {
    const all = await db.bricks.toArray() as (DBBrick & { id: number })[]
    const now = new Date()
    const toUpdate: (DBBrick & { id: number })[] = []
    for (const b of all) {
      let content = b.content ?? ''
      let changed = false
      for (const { oldTag, newTag } of pairs) {
        if (content.includes(oldTag)) { content = content.split(oldTag).join(newTag); changed = true }
      }
      if (changed) toUpdate.push({ ...b, content, updatedAt: now })
    }
    if (toUpdate.length === 0) return
    await Promise.all(toUpdate.map(b => db.bricks.put(b)))
    // Rafraîchir l'affichage local ET parent
    const refreshed = await db.bricks.toArray() as (DBBrick & { id: number })[]
    setLocalGroups(bricksToGroups(refreshed, allCategories))
    onSave(bricksToGroups(refreshed, allCategories))
    await onReloadBricks()
  }

  const allBricks      = localGroups.flatMap(g => g.bricks)
  const filteredBricks = allBricks.filter(b => {
    const ms = b.label.toLowerCase().includes(search.toLowerCase()) || b.content.toLowerCase().includes(search.toLowerCase())
    return ms && (filterCat === 'all' || b.category === filterCat)
  })
  const selectedBrick = allBricks.find(b => b.id === selectedBrickId) ?? null

  async function handleUpdate(updated: Brick) {
    await onUpdate(updated)
    setLocalGroups(prev => {
      const cleaned = prev.map(g => ({ ...g, bricks: g.bricks.filter(b => b.id !== updated.id) }))
      const tg = cleaned.find(g => g.id === updated.category)
      const cat = allCategories.find(c => c.id === updated.category)
      const next = tg
        ? cleaned.map(g => g.id === updated.category ? { ...g, bricks: [...g.bricks, updated] } : g)
        : [...cleaned, { id: updated.category, label: cat?.label ?? 'Mes briques', color: cat?.color ?? '#6b7280', iconName: cat?.iconName ?? 'blocks', bricks: [updated] }]
      const filtered = next.filter(g => g.bricks.length > 0)
      onSave(filtered); return filtered
    })
    setSelectedBrickId(updated.id)
    flashSaved('updated')
  }

  async function handleAdd(partial: Omit<Brick, 'id'>) {
    const newId = await onAdd(partial)
    const brick: Brick = { ...partial, id: newId }
    setLocalGroups(prev => {
      const tg = prev.find(g => g.id === brick.category)
      const cat = allCategories.find(c => c.id === brick.category)
      const next = tg
        ? prev.map(g => g.id === brick.category ? { ...g, bricks: [...g.bricks, brick] } : g)
        : [...prev, { id: brick.category, label: cat?.label ?? 'Mes briques', color: cat?.color ?? '#6b7280', iconName: cat?.iconName ?? 'blocks', bricks: [brick] }]
      const filtered = next.filter(g => g.bricks.length > 0)
      onSave(filtered); return filtered
    })
    // Ferme le formulaire de création : la brique est désormais dans la
    // liste, l'utilisateur peut la rouvrir pour la modifier si besoin. Un
    // seul clic (« Enregistrer ») suffit donc pour créer une nouvelle
    // brique, plus de double confirmation.
    setSelectedBrickId(null)
    setIsCreating(false)
    flashSaved('created')
  }

  function flashSaved(kind: 'created' | 'updated') {
    setJustSaved(kind)
    setTimeout(() => setJustSaved((v) => (v === kind ? null : v)), 2000)
  }

  async function handleDelete(id: string) {
    await onDelete(id)
    setLocalGroups(prev => {
      const next = prev.map(g => ({ ...g, bricks: g.bricks.filter(b => b.id !== id) })).filter(g => g.bricks.length > 0)
      onSave(next); return next
    })
    setSelectedBrickId(null)
  }

  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = '' } }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (showCatManager) setShowCatManager(false); else onClose() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, showCatManager])

  const newTpl: Brick = { id: '__new__', label: '', content: '', category: allCategories[0]?.id ?? 'custom', icon: 'file-text', color: COLOR_OPTIONS[6] }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }} />

      <div style={{ position: 'relative', zIndex: 10, width: '980px', maxWidth: 'calc(100vw - 32px)', height: '700px', maxHeight: 'calc(100vh - 48px)', borderRadius: '16px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: '0 24px 80px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--color-primary)18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Settings2 size={16} style={{ color: 'var(--color-primary)' }} />
            </div>
            <div>
              <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>Éditeur de briques</h2>
              <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: 0 }}>{allBricks.length} brique{allBricks.length > 1 ? 's' : ''} · {allCategories.length} catégorie{allCategories.length > 1 ? 's' : ''}</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {justSaved && (
              <span
                role="status"
                aria-live="polite"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: '11px', fontWeight: 600,
                  padding: '3px 9px', borderRadius: 'var(--radius-full)',
                  background: '#dcfce7', color: '#15803d',
                  transition: 'opacity 0.15s',
                }}
              >
                <Check size={11} /> {justSaved === 'created' ? 'Brique créée' : 'Enregistré'}
              </span>
            )}
            <button onClick={() => setShowCatManager(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '8px', border: `1.5px solid ${showCatManager ? 'var(--color-primary)' : 'var(--color-border)'}`, background: showCatManager ? 'var(--color-primary)10' : 'var(--color-surface-offset)', color: showCatManager ? 'var(--color-primary)' : 'var(--color-text-muted)', fontSize: '12px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s' }}
            >
              <FolderPlus size={13} /> Catégories
              {allCategories.length > 0 && <span style={{ background: showCatManager ? 'var(--color-primary)' : 'var(--color-text-faint)', color: '#fff', borderRadius: '10px', fontSize: '9px', padding: '0 5px', fontWeight: 700 }}>{allCategories.length}</span>}
            </button>
            <button onClick={onClose} style={{ width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-surface-offset)', border: '1px solid var(--color-border)', cursor: 'pointer' }}>
              <X size={16} style={{ color: 'var(--color-text-muted)' }} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* Panneau catégories */}
          {showCatManager && (
            <div style={{ width: '300px', flexShrink: 0, borderRight: '1px solid var(--color-border)', background: 'var(--color-surface)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <CategoryManagerPanel
                allCategories={allCategories}
                onAdd={onAddCategory}
                onRename={onRenameCategory}
                onRenameSystem={onRenameSystemCategory}
                onDelete={onDeleteCategory}
                onDeleteSystem={onDeleteSystemCategory}
                onClose={() => setShowCatManager(false)}
              />
            </div>
          )}

          {/* Liste des briques */}
          <div style={{ width: '300px', flexShrink: 0, borderRight: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', background: 'var(--color-surface-offset)' }}>
            <div style={{ padding: '12px', borderBottom: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
              <div style={{ position: 'relative' }}>
                <Search size={12} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-faint)', pointerEvents: 'none' }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"
                  style={{ width: '100%', padding: '6px 8px 6px 28px', fontSize: '12px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-text)', outline: 'none' }} />
              </div>
              <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
                style={{ width: '100%', padding: '5px 8px', fontSize: '11px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '6px', color: 'var(--color-text-muted)', outline: 'none' }}>
                <option value="all">Toutes ({allBricks.length})</option>
                {allCategories.map(c => { const n = allBricks.filter(b => b.category === c.id).length; return n ? <option key={c.id} value={c.id}>{c.label} ({n})</option> : null })}
              </select>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {filteredBricks.length === 0
                ? <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--color-text-faint)', fontSize: '12px' }}><Blocks size={24} style={{ opacity: 0.15, margin: '0 auto 8px', display: 'block' }} />Aucune brique</div>
                : filteredBricks.map(b => <BrickEditorRow key={b.id} brick={b} allCategories={allCategories} onEdit={() => { setSelectedBrickId(b.id); setIsCreating(false) }} isSelected={!isCreating && selectedBrickId === b.id} />)
              }
            </div>
            <div style={{ padding: '10px 12px', borderTop: '1px solid var(--color-border)', flexShrink: 0 }}>
              <button onClick={() => { setIsCreating(true); setSelectedBrickId(null) }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', borderRadius: '8px', border: `1.5px dashed ${isCreating ? 'var(--color-primary)' : 'var(--color-border)'}`, background: isCreating ? 'var(--color-primary)0c' : 'transparent', color: isCreating ? 'var(--color-primary)' : 'var(--color-text-muted)', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}
              ><Plus size={13} /> Nouvelle brique</button>
            </div>
          </div>

          {/* Formulaire éditeur */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {isCreating ? (
              <BrickEditorForm brick={newTpl} allCategories={allCategories} isNew
                textVars={textVars} condVars={condVars}
                onChangeTextVars={handleChangeTextVars} onChangeCondVars={handleChangeCondVars}
                onSave={b => handleAdd({ label: b.label, content: b.content, category: b.category, icon: b.icon, color: b.color })}
                onCancel={() => setIsCreating(false)} />
            ) : selectedBrick ? (
              <BrickEditorForm key={selectedBrick.id} brick={selectedBrick} allCategories={allCategories}
                textVars={textVars} condVars={condVars}
                onChangeTextVars={handleChangeTextVars} onChangeCondVars={handleChangeCondVars}
                onSave={handleUpdate}
                onCancel={() => setSelectedBrickId(null)}
                onDelete={() => handleDelete(selectedBrick.id)} />
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', color: 'var(--color-text-faint)' }}>
                <Settings2 size={40} style={{ opacity: 0.12 }} />
                <p style={{ fontSize: '13px', textAlign: 'center', maxWidth: '280px', lineHeight: 1.6 }}>
                  Sélectionnez une brique pour la modifier, ou créez-en une nouvelle.<br /><br />
                  <span style={{ fontSize: '11px' }}>Formatage : <code>**gras**</code> · <code>__souligné__</code> · <code>_italique_</code> · <code>^^CAPS^^</code></span>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── COMPOSANT PRINCIPAL ──────────────────────────────────────────────────────

interface DocumentBricksPanelProps {
  /**
   * Insertion d'une brique dans le document.
   * `brick` est fourni pour que l'appelant puisse poser un marqueur et activer
   * l'auto-remplissage depuis un intervenant.
   */
  onInsertBrick: (content: string, brick?: Brick) => void
  onDragStart?: (brick: Brick) => void
  /** Dossier rattaché au document courant ; utilisé pour filtrer les intervenants éligibles à une brique. */
  dossierId?: number
  /**
   * Masque le bouton "intervenant" des briques (utilisé dans l'éditeur de
   * modèles, où remplir les variables depuis un contact concret n'a pas de
   * sens : un modèle doit rester générique).
   */
  disableIntervenantPicker?: boolean
  /**
   * Champs du modèle courant. Si fournis, active l'onglet « Champs » qui
   * fusionne la bibliothèque de presets et la gestion des champs
   * personnalisés (ex-`TemplateFieldsPanel`). Utilisé par l'éditeur de
   * modèle ; absent côté éditeur de document, où les champs ne sont pas
   * éditables.
   */
  fields?: TemplateField[]
  onFieldsChange?: (fields: TemplateField[]) => void
  onInsertVariable?: (name: string) => void
}

export function DocumentBricksPanel({
  onInsertBrick,
  dossierId,
  disableIntervenantPicker,
  fields,
  onFieldsChange,
  onInsertVariable,
}: DocumentBricksPanelProps) {
  const fieldsTabEnabled = !!(fields && onFieldsChange && onInsertVariable)
  const [groups,         setGroups]         = useState<BrickGroup[]>([])
  const [allCategories,  setAllCategories]  = useState<CategoryDef[]>([...SYSTEM_CATEGORIES.map(c => ({ ...c, iconName: c.id === 'dossier' ? 'users' : c.id === 'parties' ? 'users' : c.id === 'structure' ? 'align-left' : c.id === 'formules' ? 'file-text' : 'blocks' }))])
  const [tab,            setTab]            = useState<'bricks' | 'fields'>('bricks')
  const [showEditor,     setShowEditor]     = useState(false)
  const [loaded,         setLoaded]         = useState(false)
  const [picker,         setPicker]         = useState<{ brick: Brick; rect: { top: number; left: number } } | null>(null)

  /**
   * Matérialise le contenu inséré quand l'utilisateur clique ou drag
   * une brique. Les briques porteuses d'un `identityRole` posent un
   * marqueur inline au lieu de leur contenu brut — ce placeholder sera
   * résolu à l'instanciation du modèle dans un dossier.
   */
  const brickToInsertHtml = useCallback((b: Brick): string => {
    if (b.identityRole) {
      return makeIdentificationBlockHtml(
        b.identityRole,
        b.identitySeparator,
        null,
        b.label,
      )
    }
    return brickContentToHtml(b.content)
  }, [])

  const handleOpenPicker = useCallback((brick: Brick, rect: DOMRect) => {
    setPicker({
      brick,
      // Popover positionné juste sous le chip, aligné à gauche
      rect: { top: rect.bottom + 4, left: rect.left },
    })
  }, [])

  const handlePickContact = useCallback((contact: Contact) => {
    if (!picker) return
    const { content } = applyContactToBrickContent(contact, picker.brick.content)
    onInsertBrick(brickContentToHtml(content), picker.brick)
    setPicker(null)
  }, [picker, onInsertBrick])

  // ── Chargement initial depuis Dexie ──────────────────────────────────────
  const loadFromDB = useCallback(async () => {
    // Seeding : idempotent par titre. Le flag `bricks_seeded` évite la
    // requête quand tout est déjà en place ; mais même sans flag (DB
    // restaurée depuis un backup incomplet, paramètre effacé manuellement,
    // race avec le StrictMode…), on n'ajoute PAS une seconde copie d'une
    // brique seed dont le titre existe déjà.
    const seeded = await getSetting<boolean>('bricks_seeded', false)
    if (!seeded) {
      const existingTitles = new Set(
        ((await db.bricks.toArray()) as DBBrick[]).map((b) => b.title),
      )
      const toSeed = SEED_BRICKS.filter((s) => !existingTitles.has(s.title))
      if (toSeed.length > 0) {
        await db.bricks.bulkAdd(toSeed as DBBrick[])
      }
      await setSetting('bricks_seeded', true)
    }

    // Dédoublonnage défensif : si plusieurs briques partagent exactement le
    // même `title` et le même `content`, on ne garde que la plus « complète »
    // (tags à 3 éléments remplis) et la plus récemment modifiée. Cible les
    // doublons apparus par des anciennes versions qui ré-insérait des seeds.
    await dedupeBricksByTitleContent()

    // Migration one-shot : ajoute targetContactType aux briques seed existantes
    // pour les utilisateurs qui ont déjà la DB v1/v2.
    const migrated = await getSetting<boolean>('bricks_targets_v1_migrated', false)
    if (!migrated) {
      const byTitle = new Map<string, Partial<DBBrick>>([
        ['Personne physique',   { targetContactType: 'physical' }],
        ['Personne morale',     { targetContactType: 'moral'    }],
        ['Ayant pour avocat',   { targetContactType: 'physical', targetRoles: ['ownCounsel', 'adversaryCounsel'] }],
      ])
      for (const [title, patch] of Array.from(byTitle.entries())) {
        const rows = await db.bricks.where('title').equals(title).toArray() as (DBBrick & { id: number })[]
        for (const row of rows) {
          if (row.targetContactType == null) {
            await db.bricks.put({ ...row, ...patch })
          }
        }
      }
      await setSetting('bricks_targets_v1_migrated', true)
    }

    // Migration identityKind : marque les briques d'identité existantes
    // comme variantes physique / morale. Utilisée par les blocs
    // d'identification (cf. `lib/identification-blocks.ts`) pour retrouver
    // la bonne variante en fonction du type du contact du dossier.
    const identityKindMigrated = await getSetting<boolean>('bricks_identity_kind_v1', false)
    if (!identityKindMigrated) {
      const byTitleIdentity: Array<[string, 'physical' | 'moral']> = [
        ['Personne physique', 'physical'],
        ['Personne morale',   'moral'],
      ]
      for (const [title, kind] of byTitleIdentity) {
        const rows = await db.bricks.where('title').equals(title).toArray() as (DBBrick & { id: number })[]
        for (const row of rows) {
          if (row.identityKind == null) {
            await db.bricks.put({ ...row, identityKind: kind })
          }
        }
      }
      await setSetting('bricks_identity_kind_v1', true)
    }

    // Migration « catégorie Dossier » : pour les utilisateurs déjà seedés
    // (`bricks_seeded=true`), les nouvelles briques de la catégorie
    // `dossier` (Client, Partie adverse, Avocat du cabinet…) n'ont
    // jamais été insérées. On les ajoute ici, idempotent par titre ET
    // par `identityRole` pour ne pas dupliquer les briques que
    // l'utilisateur aurait renommées.
    const dossierBricksSeeded = await getSetting<boolean>('bricks_dossier_v1_seeded', false)
    if (!dossierBricksSeeded) {
      const existing = await db.bricks.toArray() as DBBrick[]
      const byTitle = new Set(existing.map((b) => b.title))
      const byRole = new Set(existing.map((b) => b.identityRole).filter(Boolean))
      const toAdd = SEED_BRICKS.filter((s) =>
        s.identityRole &&
        !byTitle.has(s.title) &&
        !byRole.has(s.identityRole)
      )
      if (toAdd.length > 0) {
        await db.bricks.bulkAdd(toAdd as DBBrick[])
      }
      await setSetting('bricks_dossier_v1_seeded', true)
    }

    const savedLabels = await db.infoLabels.toArray() as (InfoLabel & { id: number })[]
    const customCats: CategoryDef[] = savedLabels.map(l => ({
      id:               `cat_${l.id}`,
      label:            l.name,
      color:            l.color ?? '#6b7280',
      iconName:         'blocks',
      isCustomCategory: true,
      dbId:             l.id,
    }))

    const cats: CategoryDef[] = [
      ...SYSTEM_CATEGORIES.map(c => ({ ...c, iconName: c.id === 'parties' ? 'users' : c.id === 'structure' ? 'align-left' : c.id === 'formules' ? 'file-text' : 'blocks' })),
      ...customCats,
    ]
    setAllCategories(cats)

    const all = await db.bricks.toArray() as (DBBrick & { id: number })[]
    setGroups(bricksToGroups(all, cats))
    setLoaded(true)
  }, [])

  useEffect(() => { loadFromDB() }, [loadFromDB])

  // ── Opérations briques ───────────────────────────────────────────────────
  const handleAdd = useCallback(async (partial: Omit<Brick, 'id'>): Promise<string> => {
    const now = new Date()
    const id = await db.bricks.add({
      title: partial.label, content: partial.content, category: 'other',
      tags: [partial.category, partial.icon, partial.color],
      createdAt: now, updatedAt: now,
    } as DBBrick)
    return String(id)
  }, [])

  const handleUpdate = useCallback(async (updated: Brick) => {
    const numId = Number(updated.id); if (!numId) return
    const existing = await db.bricks.get(numId); if (!existing) return
    await db.bricks.put({
      ...existing,
      title:             updated.label,
      content:           updated.content,
      tags:              [updated.category, updated.icon, updated.color],
      identityRole:      updated.identityRole,
      identitySeparator: updated.identitySeparator,
      updatedAt:         new Date(),
    } as DBBrick)
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    const numId = Number(id); if (!numId) return
    await db.bricks.delete(numId)
  }, [])

  // ── Opérations catégories ────────────────────────────────────────────────
  const handleAddCategory = useCallback(async (name: string, color: string) => {
    const now = new Date()
    const dbId = await db.infoLabels.add({ name, color, createdAt: now } as InfoLabel)
    const numId = Number(dbId)
    const newCat: CategoryDef = { id: `cat_${numId}`, label: name, color, iconName: 'blocks', isCustomCategory: true, dbId: numId }
    setAllCategories(prev => [...prev, newCat])
    const all = await db.bricks.toArray() as (DBBrick & { id: number })[]
    setGroups(prev => bricksToGroups(all, [...prev.map(g => ({ id: g.id, label: g.label, color: g.color, iconName: g.iconName, isCustomCategory: g.isCustomCategory })) as CategoryDef[], newCat]))
  }, [])

  const handleRenameCategory = useCallback(async (dbId: number, name: string, color: string) => {
    const existing = await db.infoLabels.get(dbId); if (!existing) return
    await db.infoLabels.put({ ...existing, name, color } as InfoLabel)
    setAllCategories(prev => prev.map(c => c.dbId === dbId ? { ...c, label: name, color } : c))
    setGroups(prev => prev.map(g => g.id === `cat_${dbId}` ? { ...g, label: name, color } : g))
  }, [])

  // Renommage des catégories système (état local uniquement — pas de DB)
  const handleRenameSystemCategory = useCallback((id: string, name: string, color: string) => {
    setAllCategories(prev => prev.map(c => c.id === id ? { ...c, label: name, color } : c))
    setGroups(prev => prev.map(g => g.id === id ? { ...g, label: name, color } : g))
  }, [])

  // Suppression des catégories système (état local uniquement — masquage)
  const handleDeleteSystemCategory = useCallback((id: string) => {
    setAllCategories(prev => prev.filter(c => c.id !== id))
    setGroups(prev => prev.filter(g => g.id !== id))
  }, [])

  const handleDeleteCategory = useCallback(async (dbId: number) => {
    const catId = `cat_${dbId}`
    const bricksInCat = await db.bricks.filter(b => b.tags[0] === catId).toArray() as (DBBrick & { id: number })[]
    await Promise.all(bricksInCat.map(b => db.bricks.put({ ...b, tags: ['custom', b.tags[1] ?? 'file-text', b.tags[2] ?? '#6b7280'] } as DBBrick)))
    await db.infoLabels.delete(dbId)
    setAllCategories(prev => {
      const updated = prev.filter(c => c.dbId !== dbId)
      const reloadBricks = async () => {
        const all = await db.bricks.toArray() as (DBBrick & { id: number })[]
        setGroups(bricksToGroups(all, updated))
      }
      reloadBricks()
      return updated
    })
  }, [])

  const displayGroups = groups.filter(g => g.bricks.length > 0)

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    minWidth: 0,
    padding: '6px 2px',
    // Avec 3 onglets (« Bibliothèque », « Champs », « Mes briques »), on
    // rétrécit la typo pour que les 3 libellés tiennent sur la ligne de
    // 272 px sans rogner le texte ni le badge compteur.
    fontSize: '10px',
    fontWeight: active ? 600 : 400,
    color: active ? 'var(--color-primary)' : 'var(--color-text-muted)',
    background: active ? 'var(--color-surface)' : 'transparent',
    borderBottom: active ? '2px solid var(--color-primary)' : '2px solid transparent',
    cursor: 'pointer', transition: 'all 0.12s',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
  })

  if (!loaded) return (
    <div style={{ width: '272px', flexShrink: 0, borderLeft: '1px solid var(--color-border)', background: 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'var(--color-text-faint)', fontSize: '12px' }}>Chargement…</div>
    </div>
  )

  return (
    <>
      <div style={{ width: '272px', flexShrink: 0, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border)', background: 'var(--color-surface)', overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px 0', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Blocks size={13} style={{ color: 'var(--color-primary)' }} />
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text)' }}>Boîte à outils</span>
            </div>
            {tab === 'bricks' && (
              <button onClick={() => setShowEditor(true)} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--color-primary)', color: '#fff', fontSize: '10px', fontWeight: 600, cursor: 'pointer', border: 'none' }}>
                <Plus size={10} /> Nouvelle
              </button>
            )}
          </div>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', marginLeft: '-14px', marginRight: '-14px', paddingLeft: '6px', paddingRight: '6px' }}>
            <button style={tabStyle(tab === 'bricks')} onClick={() => setTab('bricks')}>
              <Blocks size={10} /> Briques
            </button>
            {fieldsTabEnabled && (
              <button style={tabStyle(tab === 'fields')} onClick={() => setTab('fields')}>
                <Tag size={10} /> Champs
                {fields!.length > 0 && <span style={{ background: 'var(--color-primary)', color: '#fff', borderRadius: '10px', fontSize: '9px', padding: '0 4px', fontWeight: 700 }}>{fields!.length}</span>}
              </button>
            )}
          </div>
        </div>

        {tab === 'bricks' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
            <p style={{ fontSize: '10px', color: 'var(--color-text-faint)', marginBottom: '10px', lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--color-text-muted)' }}>Cliquer</strong> pour insérer au curseur · <strong style={{ color: 'var(--color-text-muted)' }}>Glisser</strong> dans le document
            </p>
            {displayGroups.map((g, i) => (
              <BrickGroupSection
                key={g.id}
                group={g}
                onInsert={b => onInsertBrick(brickToInsertHtml(b), b)}
                onOpenPicker={disableIntervenantPicker ? undefined : handleOpenPicker}
                defaultOpen={i === 0}
              />
            ))}
          </div>
        )}

        {tab === 'fields' && fieldsTabEnabled && (
          <FieldsTabContent
            fields={fields!}
            onChange={onFieldsChange!}
            onInsertVariable={onInsertVariable!}
          />
        )}

        {tab === 'bricks' && (
          <div style={{ padding: '8px 10px', borderTop: '1px solid var(--color-border)', flexShrink: 0 }}>
            <button onClick={() => setShowEditor(true)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '7px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-surface-offset)', color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)', fontWeight: 500, cursor: 'pointer', transition: 'all 0.12s' }}
              onMouseEnter={e => { const b = e.currentTarget; b.style.borderColor = 'var(--color-primary)'; b.style.color = 'var(--color-primary)'; b.style.background = 'var(--color-primary)08' }}
              onMouseLeave={e => { const b = e.currentTarget; b.style.borderColor = 'var(--color-border)'; b.style.color = 'var(--color-text-muted)'; b.style.background = 'var(--color-surface-offset)' }}
            ><Settings2 size={12} /> Éditeur de briques</button>
          </div>
        )}
      </div>

      {showEditor && (
        <BricksEditorModal
          groups={groups}
          allCategories={allCategories}
          onSave={setGroups}
          onClose={() => { setShowEditor(false); void loadFromDB() }}
          onAdd={handleAdd}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onAddCategory={handleAddCategory}
          onRenameCategory={handleRenameCategory}
          onDeleteCategory={handleDeleteCategory}
          onRenameSystemCategory={handleRenameSystemCategory}
          onDeleteSystemCategory={handleDeleteSystemCategory}
          onReloadBricks={loadFromDB}
        />
      )}

      {picker && (
        <BrickIntervenantPicker
          brick={{
            title: picker.brick.label,
            targetContactType: picker.brick.targetContactType,
            targetRoles: picker.brick.targetRoles,
          }}
          dossierId={dossierId}
          anchorRect={picker.rect}
          onPick={handlePickContact}
          onClose={() => setPicker(null)}
        />
      )}

    </>
  )
}
