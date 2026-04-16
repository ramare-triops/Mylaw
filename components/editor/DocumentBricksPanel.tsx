// components/editor/DocumentBricksPanel.tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import {
  Blocks, Plus, Trash2, Tag, User, Building2,
  Scale, ChevronDown, ChevronRight, Gavel, AlignLeft, FileText,
  Users, Briefcase, X, Check, Pencil, Settings2, Search,
  Bold, Underline, Italic, CaseSensitive, ListFilter,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Brick {
  id: string
  label: string
  content: string
  category: string
  icon: string
  color: string
}

export interface BrickGroup {
  id: string
  label: string
  color: string
  iconName: string
  bricks: Brick[]
}

export const DRAG_BRICK_KEY = 'application/x-mylaw-brick'

const ALL_CATEGORIES = [
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
  '#01696f',
  '#0369a1',
  '#4f46e5',
  '#7c3aed',
  '#be185d',
  '#c2410c',
  '#b45309',
  '#15803d',
  '#6b7280',
  '#dc2626',
  '#0891b2',
  '#059669',
  '#d97706',
  '#9333ea',
  '#e11d48',
]

// ─── Données par défaut ───────────────────────────────────────────────────────

const INITIAL_BRICK_GROUPS: BrickGroup[] = [
  {
    id: 'parties', label: 'Parties', color: '#01696f', iconName: 'users',
    bricks: [
      { id: 'personne_physique', label: 'Personne physique', color: '#01696f', icon: 'user', category: 'parties', content: '[M/Mme] **[Nom] [Prénom]**, [né/née] le [Date de naissance] à [Lieu de naissance], de nationalité [Nationalité], demeurant au [Adresse]' },
      { id: 'personne_morale',   label: 'Personne morale',   color: '#7c3aed', icon: 'building', category: 'parties', content: 'La société **[Nom de la société]**, [Forme juridique] au capital de [Capital social] euros, immatriculée au RCS de [Ville RCS] sous le numéro [Numéro RCS], dont le siège social est sis [Adresse du siège], représentée par [Représentant légal], en sa qualité de [Qualité du représentant]' },
      { id: 'avocat',            label: 'Ayant pour avocat',         color: '#be185d', icon: 'scale',     category: 'parties', content: "Ayant pour avocat **Maître [Nom de l'avocat]**, inscrit(e) au Barreau de [Ville du barreau], dont le cabinet est sis [Adresse du cabinet]" },
      { id: 'representant',      label: 'Représentant / mandataire', color: '#c2410c', icon: 'briefcase', category: 'parties', content: "Représenté(e) par **[Nom du mandataire]**, [Qualité], en vertu d'un pouvoir en date du [Date du pouvoir]" },
    ],
  },
  {
    id: 'structure', label: 'Structure', color: '#4f46e5', iconName: 'align-left',
    bricks: [
      { id: 'faits_procedure', label: 'Faits et procédure', color: '#4f46e5', icon: 'file-text',  category: 'structure', content: '^^FAITS ET PROCÉDURE^^' },
      { id: 'plaise_tribunal', label: 'Plaise au Tribunal',  color: '#4f46e5', icon: 'gavel',      category: 'structure', content: '^^PLAISE AU TRIBUNAL DE [Nom du tribunal]^^' },
      { id: 'par_ces_motifs',  label: 'Par ces motifs',      color: '#4f46e5', icon: 'gavel',      category: 'structure', content: '^^PAR CES MOTIFS^^' },
      { id: 'discussion',      label: 'Discussion',          color: '#4f46e5', icon: 'align-left', category: 'structure', content: '^^DISCUSSION^^' },
      { id: 'en_droit',        label: 'En droit',            color: '#4f46e5', icon: 'scale',      category: 'structure', content: '^^EN DROIT^^' },
      { id: 'en_fait',         label: 'En fait',             color: '#4f46e5', icon: 'file-text',  category: 'structure', content: '^^EN FAIT^^' },
      { id: 'demandes',        label: 'Demandes',            color: '#4f46e5', icon: 'gavel',      category: 'structure', content: '^^DEMANDES^^' },
    ],
  },
  {
    id: 'formules', label: 'Formules types', color: '#15803d', iconName: 'file-text',
    bricks: [
      { id: 'entre_les_soussignes', label: 'Entre les soussignés', color: '#15803d', icon: 'users',     category: 'formules', content: '^^ENTRE LES SOUSSIGNÉS :^^' },
      { id: 'il_a_ete_convenu',     label: 'Il a été convenu',     color: '#15803d', icon: 'check',     category: 'formules', content: '^^IL A ÉTÉ CONVENU ET ARRÊTÉ CE QUI SUIT :^^' },
      { id: 'fait_a',               label: 'Fait à…',              color: '#15803d', icon: 'file-text', category: 'formules', content: 'Fait à [Lieu], le [Date], en [Nombre] exemplaire(s) originaux.' },
      { id: 'signature',            label: 'Bloc signature',       color: '#15803d', icon: 'check',     category: 'formules', content: 'Pour [Partie 1]\n[Nom et signature]\n\nPour [Partie 2]\n[Nom et signature]' },
    ],
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId() { return Math.random().toString(36).slice(2, 9) }

const SUGGESTED_TAGS = [
  'Nom', 'Prénom', 'Date de naissance', 'Lieu de naissance', 'Nationalité', 'Adresse',
  'Nom de la société', 'Forme juridique', 'Capital social', 'Numéro RCS', 'Ville RCS',
  'Adresse du siège', 'Représentant légal', 'Qualité',
  "Nom de l'avocat", 'Ville du barreau', 'Adresse du cabinet',
  'Date', 'Lieu', 'Montant', 'Durée', 'Tribunal', 'Nombre',
]

const CONDITIONAL_TAGS = [
  { label: 'M / Mme',            value: 'M/Mme'            },
  { label: 'né / née',           value: 'né/née'           },
  { label: 'inscrit / inscrite', value: 'inscrit/inscrite' },
  { label: 'le / la',            value: 'le/la'            },
  { label: 'du / de la',         value: 'du/de la'         },
]

// ─── Conversion brique → HTML TipTap ─────────────────────────────────────────

export function brickContentToHtml(content: string): string {
  return content.split('\n').map(line => {
    let p = line
    p = p.replace(/\[([^\]]+)\]/g, (_, name: string) => {
      const esc = name.replace(/"/g, '&quot;')
      return `<span data-variable-field="" data-variable-name="${esc}">${esc}</span>`
    })
    p = p.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    p = p.replace(/__(.+?)__/g, '<u>$1</u>')
    p = p.replace(/(?<!_)_([^_]+)_(?!_)/g, '<em>$1</em>')
    p = p.replace(/\^\^(.+?)\^\^/g, '<span style="text-transform:uppercase;font-weight:600">$1</span>')
    return `<p>${p.trim() || '<br>'}</p>`
  }).join('')
}

// ─── Icône ────────────────────────────────────────────────────────────────────

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

// ─── Chip brique ─────────────────────────────────────────────────────────────

function BrickChip({ brick, onInsert }: { brick: Brick; onInsert: () => void }) {
  const [hovered, setHovered] = useState(false)
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
  return (
    <div draggable onDragStart={handleDragStart}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      title={`Cliquer pour insérer · Glisser dans le document\n\n${brick.content}`}
      style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 8px', borderRadius: 'var(--radius-md)', border: `1.5px solid ${hovered ? brick.color : brick.color + '50'}`, background: hovered ? brick.color + '18' : brick.color + '0c', cursor: 'grab', userSelect: 'none', transition: 'all 0.12s ease', marginBottom: '4px' }}
    >
      <BrickIcon name={brick.icon} size={11} color={brick.color} />
      <span onClick={onInsert} style={{ flex: 1, fontSize: '11px', fontWeight: 500, color: brick.color, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {brick.label}
      </span>
    </div>
  )
}

// ─── Groupe accordéon ─────────────────────────────────────────────────────────

function BrickGroupSection({ group, onInsert, defaultOpen }: { group: BrickGroup; onInsert: (b: Brick) => void; defaultOpen: boolean }) {
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
          {group.bricks.map(b => <BrickChip key={b.id} brick={b} onInsert={() => onInsert(b)} />)}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── SOUS-COMPOSANTS ÉDITEUR ──────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Barre de formatage ───────────────────────────────────────────────────────

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

// ─── Aperçu rendu ─────────────────────────────────────────────────────────────

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

// ─── Color Picker compact : petit cercle + popover colonne verticale ──────────

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
      {/* Petit cercle déclencheur */}
      <div style={{ display: 'flex', alignItems: 'center', height: '31px' }}>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          title="Changer la couleur"
          style={{
            width: '22px', height: '22px', borderRadius: '50%', background: color,
            border: `2px solid ${color}88`,
            outline: open ? `2px solid ${color}` : 'none',
            outlineOffset: '2px', cursor: 'pointer', transition: 'all 0.12s', flexShrink: 0,
          }}
        />
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)',
          zIndex: 50, background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: '10px', padding: '6px', boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column', gap: '5px', alignItems: 'center',
        }}>
          {COLOR_OPTIONS.map(c => (
            <button
              key={c} type="button"
              onClick={() => { onChange(c); setOpen(false) }}
              title={c}
              style={{
                width: '18px', height: '18px', borderRadius: '50%', background: c,
                border: `2px solid ${color === c ? c : 'transparent'}`,
                outline: color === c ? `2px solid ${c}` : 'none', outlineOffset: '2px',
                cursor: 'pointer', transition: 'all 0.1s', flexShrink: 0,
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Formulaire d'édition ─────────────────────────────────────────────────────
// onSave : sauvegarde immédiate sans passer par hasChanges du parent.

function BrickEditorForm({ brick, onSave, onCancel, onDelete, isNew }: {
  brick: Brick
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
  const [confirmDelete, setConfirmDelete] = useState(false)
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
      const ins = open + close
      setContent(content.slice(0, s) + ins + content.slice(e))
      setTimeout(() => { ta.focus(); ta.setSelectionRange(s + open.length, s + open.length) }, 0)
      return
    }
    const sel = content.slice(s, e)
    const before = content.slice(s - open.length, s)
    const after  = content.slice(e, e + close.length)
    if (before === open && after === close) {
      setContent(content.slice(0, s - open.length) + sel + content.slice(e + close.length))
      setTimeout(() => { ta.focus(); ta.setSelectionRange(s - open.length, e - open.length) }, 0)
    } else {
      const ins = open + sel + close
      setContent(content.slice(0, s) + ins + content.slice(e))
      setTimeout(() => { ta.focus(); ta.setSelectionRange(s, s + ins.length) }, 0)
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '7px 10px', fontSize: '13px',
    background: 'var(--color-surface-offset)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)', color: 'var(--color-text)', outline: 'none',
  }

  const canSave = label.trim() !== '' && content.trim() !== ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Zone scrollable */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

        {/* Icône + Nom */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-md)', flexShrink: 0, background: color + '18', border: `2px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BrickIcon name={icon} size={16} color={color} />
          </div>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Nom de la brique" autoFocus={isNew}
            style={{ ...inp, flex: 1, fontSize: '14px', fontWeight: 600 }} />
        </div>

        {/* Catégorie + Icône + Couleur sur la même ligne */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '10px', alignItems: 'end' }}>
          <label style={{ fontSize: '11px', color: 'var(--color-text-muted)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            Catégorie
            <select value={category} onChange={e => setCategory(e.target.value)} style={inp}>
              {ALL_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
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

        {/* Zone contenu */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: 0 }}>Contenu</p>
            <button type="button" onClick={() => setShowPreview(v => !v)}
              style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '20px', border: `1px solid ${showPreview ? color : 'var(--color-border)'}`, background: showPreview ? color + '15' : 'transparent', color: showPreview ? color : 'var(--color-text-faint)', cursor: 'pointer', transition: 'all 0.1s' }}
            >{showPreview ? "Masquer l'aperçu" : 'Aperçu'}</button>
          </div>
          <FormatToolbar onFormat={applyFormat} />
          <textarea
            ref={textareaRef} value={content} onChange={e => setContent(e.target.value)}
            placeholder={`Rédigez le contenu…\n**Gras** __Souligné__ _Italique_ ^^MAJUSCULES^^\n[Variable] [M/Mme] [né/née]`}
            rows={5}
            style={{ ...inp, resize: 'vertical', lineHeight: 1.6, fontFamily: 'monospace', fontSize: '12px', borderRadius: '0 0 6px 6px', borderTop: 'none' }}
          />
          {showPreview && <BrickPreview content={content} color={color} />}
        </div>

        {/* Variables texte */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <p style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-faint)', margin: 0 }}>Variables texte</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {SUGGESTED_TAGS.map(t => (
              <button key={t} type="button" onClick={() => insertTag(t)}
                style={{ padding: '2px 7px', borderRadius: '20px', border: '1.5px solid #01696f60', background: '#01696f0c', color: '#01696f', fontSize: '10px', fontWeight: 500, cursor: 'pointer', fontFamily: 'monospace' }}
                onMouseEnter={e => { const b = e.currentTarget; b.style.background = '#01696f18'; b.style.borderColor = '#01696f' }}
                onMouseLeave={e => { const b = e.currentTarget; b.style.background = '#01696f0c'; b.style.borderColor = '#01696f60' }}
              >[{t}]</button>
            ))}
          </div>
        </div>

        {/* Variables conditionnelles */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <p style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-faint)', margin: 0 }}>
            Variables conditionnelles <span style={{ textTransform: 'none', fontWeight: 400 }}>(liste déroulante)</span>
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {CONDITIONAL_TAGS.map(t => (
              <button key={t.value} type="button" onClick={() => insertTag(t.value)}
                style={{ padding: '2px 7px', borderRadius: '20px', border: '1.5px solid #7c3aed60', background: '#7c3aed0c', color: '#7c3aed', fontSize: '10px', fontWeight: 500, cursor: 'pointer', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: '4px' }}
                onMouseEnter={e => { const b = e.currentTarget; b.style.background = '#7c3aed18'; b.style.borderColor = '#7c3aed' }}
                onMouseLeave={e => { const b = e.currentTarget; b.style.background = '#7c3aed0c'; b.style.borderColor = '#7c3aed60' }}
              ><ListFilter size={9} />[{t.label}]</button>
            ))}
          </div>
        </div>

      </div>{/* fin zone scrollable */}

      {/* Actions — toujours visibles, ne scrollent pas */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
        <div>
          {onDelete && (confirmDelete ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11px', color: 'var(--color-error)' }}>Supprimer définitivement ?</span>
              <button onClick={onDelete} style={{ padding: '5px 10px', borderRadius: 'var(--radius-md)', background: 'var(--color-error)', color: '#fff', fontSize: '11px', fontWeight: 600, cursor: 'pointer', border: 'none' }}>Oui</button>
              <button onClick={() => setConfirmDelete(false)} style={{ padding: '5px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-surface-offset)', color: 'var(--color-text-muted)', fontSize: '11px', cursor: 'pointer' }}>Annuler</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-error)40', color: 'var(--color-error)', fontSize: '11px', cursor: 'pointer', background: 'transparent' }}>
              <Trash2 size={12} /> Supprimer
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onCancel} style={{ padding: '7px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-surface-offset)', color: 'var(--color-text-muted)', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>Annuler</button>
          <button
            onClick={() => {
              if (canSave) onSave({ ...brick, label: label.trim(), content: content.trim(), category, icon, color })
            }}
            disabled={!canSave}
            style={{ padding: '7px 16px', borderRadius: 'var(--radius-md)', background: 'var(--color-primary)', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: canSave ? 'pointer' : 'not-allowed', opacity: canSave ? 1 : 0.5, border: 'none' }}
          >{isNew ? 'Créer' : 'Enregistrer'}</button>
        </div>
      </div>

    </div>
  )
}

// ─── Ligne brique dans la liste ───────────────────────────────────────────────

function BrickEditorRow({ brick, onEdit, isSelected }: { brick: Brick; onEdit: () => void; isSelected: boolean }) {
  const [h, setH] = useState(false)
  const catColor = ALL_CATEGORIES.find(c => c.id === brick.category)?.color ?? '#6b7280'
  return (
    <div onClick={onEdit} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', cursor: 'pointer', background: isSelected ? 'var(--color-primary)0f' : h ? 'var(--color-surface-offset)' : 'transparent', borderLeft: `3px solid ${isSelected ? 'var(--color-primary)' : 'transparent'}`, transition: 'all 0.1s' }}
    >
      <div style={{ width: '28px', height: '28px', borderRadius: 'var(--radius-sm)', flexShrink: 0, background: brick.color + '18', border: `1.5px solid ${brick.color}60`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <BrickIcon name={brick.icon} size={13} color={brick.color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{brick.label}</div>
        <div style={{ fontSize: '10px', color: catColor, marginTop: '1px', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>{ALL_CATEGORIES.find(c => c.id === brick.category)?.label ?? brick.category}</div>
      </div>
      <Pencil size={12} style={{ color: h || isSelected ? 'var(--color-primary)' : 'var(--color-text-faint)', flexShrink: 0, transition: 'color 0.1s' }} />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── MODALE ÉDITEUR DE BRIQUES ────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

function BricksEditorModal({ groups, onSave, onClose }: {
  groups: BrickGroup[]
  onSave: (g: BrickGroup[]) => void
  onClose: () => void
}) {
  const [localGroups,     setLocalGroups]     = useState<BrickGroup[]>(() => JSON.parse(JSON.stringify(groups)))
  const [selectedBrickId, setSelectedBrickId] = useState<string | null>(null)
  const [isCreating,      setIsCreating]      = useState(false)
  const [search,          setSearch]          = useState('')
  const [filterCat,       setFilterCat]       = useState('all')

  const allBricks      = localGroups.flatMap(g => g.bricks)
  const filteredBricks = allBricks.filter(b => {
    const ms = b.label.toLowerCase().includes(search.toLowerCase()) || b.content.toLowerCase().includes(search.toLowerCase())
    return ms && (filterCat === 'all' || b.category === filterCat)
  })
  const selectedBrick = allBricks.find(b => b.id === selectedBrickId) ?? null

  // Met à jour localGroups ET sauvegarde + ferme immédiatement
  function updateAndSave(updated: Brick) {
    setLocalGroups(prev => {
      const cleaned = prev.map(g => ({ ...g, bricks: g.bricks.filter(b => b.id !== updated.id) }))
      const tg = cleaned.find(g => g.id === updated.category)
      const next = tg
        ? cleaned.map(g => g.id === updated.category ? { ...g, bricks: [...g.bricks, updated] } : g)
        : [...cleaned, { id: 'custom', label: 'Mes briques', color: '#6b7280', iconName: 'blocks', bricks: [updated] }]
      onSave(next.filter(g => g.bricks.length > 0))
      return next
    })
    setSelectedBrickId(updated.id)
  }

  function addAndSave(partial: Omit<Brick, 'id'>) {
    const brick: Brick = { ...partial, id: generateId() }
    setLocalGroups(prev => {
      const tg = prev.find(g => g.id === brick.category)
      const next = tg
        ? prev.map(g => g.id === brick.category ? { ...g, bricks: [...g.bricks, brick] } : g)
        : [...prev, { id: 'custom', label: 'Mes briques', color: '#6b7280', iconName: 'blocks', bricks: [brick] }]
      onSave(next.filter(g => g.bricks.length > 0))
      return next
    })
    setSelectedBrickId(brick.id)
    setIsCreating(false)
  }

  function deleteAndSave(id: string) {
    setLocalGroups(prev => {
      const next = prev.map(g => ({ ...g, bricks: g.bricks.filter(b => b.id !== id) })).filter(g => g.bricks.length > 0)
      onSave(next)
      return next
    })
    setSelectedBrickId(null)
  }

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const newTpl: Brick = { id: '__new__', label: '', content: '', category: 'custom', icon: 'file-text', color: '#01696f' }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }} />

      <div style={{ position: 'relative', zIndex: 10, width: '920px', maxWidth: 'calc(100vw - 32px)', height: '680px', maxHeight: 'calc(100vh - 48px)', borderRadius: '16px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: '0 24px 80px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* En-tête */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--color-primary)18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Settings2 size={16} style={{ color: 'var(--color-primary)' }} />
            </div>
            <div>
              <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>Éditeur de briques</h2>
              <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: 0 }}>{allBricks.length} brique{allBricks.length > 1 ? 's' : ''} · Formatage riche + variables conditionnelles</p>
            </div>
          </div>
          <button onClick={onClose} style={{ width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-surface-offset)', border: '1px solid var(--color-border)', cursor: 'pointer' }}>
            <X size={16} style={{ color: 'var(--color-text-muted)' }} />
          </button>
        </div>

        {/* Corps */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* Colonne gauche */}
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
                {ALL_CATEGORIES.map(c => { const n = allBricks.filter(b => b.category === c.id).length; return n ? <option key={c.id} value={c.id}>{c.label} ({n})</option> : null })}
              </select>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {filteredBricks.length === 0
                ? <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--color-text-faint)', fontSize: '12px' }}><Blocks size={24} style={{ opacity: 0.15, margin: '0 auto 8px', display: 'block' }} />Aucune brique</div>
                : filteredBricks.map(b => <BrickEditorRow key={b.id} brick={b} onEdit={() => { setSelectedBrickId(b.id); setIsCreating(false) }} isSelected={!isCreating && selectedBrickId === b.id} />)
              }
            </div>
            <div style={{ padding: '10px 12px', borderTop: '1px solid var(--color-border)', flexShrink: 0 }}>
              <button onClick={() => { setIsCreating(true); setSelectedBrickId(null) }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', borderRadius: '8px', border: `1.5px dashed ${isCreating ? 'var(--color-primary)' : 'var(--color-border)'}`, background: isCreating ? 'var(--color-primary)0c' : 'transparent', color: isCreating ? 'var(--color-primary)' : 'var(--color-text-muted)', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}
              ><Plus size={13} /> Nouvelle brique</button>
            </div>
          </div>

          {/* Colonne droite */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {isCreating ? (
              <BrickEditorForm brick={newTpl} isNew
                onSave={b => addAndSave({ label: b.label, content: b.content, category: b.category, icon: b.icon, color: b.color })}
                onCancel={() => setIsCreating(false)} />
            ) : selectedBrick ? (
              <BrickEditorForm key={selectedBrick.id} brick={selectedBrick}
                onSave={updateAndSave}
                onCancel={() => setSelectedBrickId(null)}
                onDelete={() => deleteAndSave(selectedBrick.id)} />
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

// ═══════════════════════════════════════════════════════════════════════════════
// ─── COMPOSANT PRINCIPAL ─────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

interface DocumentBricksPanelProps {
  onInsertBrick: (content: string) => void
  onDragStart?: (brick: Brick) => void
}

export function DocumentBricksPanel({ onInsertBrick }: DocumentBricksPanelProps) {
  const [groups,     setGroups]     = useState<BrickGroup[]>(INITIAL_BRICK_GROUPS)
  const [tab,        setTab]        = useState<'library' | 'custom'>('library')
  const [showEditor, setShowEditor] = useState(false)

  const customBricks  = groups.flatMap(g => g.bricks).filter(b => b.category === 'custom')
  const displayGroups = groups.filter(g => g.bricks.length > 0)

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '6px 4px', fontSize: 'var(--text-xs)',
    fontWeight: active ? 600 : 400,
    color: active ? 'var(--color-primary)' : 'var(--color-text-muted)',
    background: active ? 'var(--color-surface)' : 'transparent',
    borderBottom: active ? '2px solid var(--color-primary)' : '2px solid transparent',
    cursor: 'pointer', transition: 'all 0.12s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
  })

  return (
    <>
      <div style={{ width: '272px', flexShrink: 0, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border)', background: 'var(--color-surface)', overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px 0', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Blocks size={13} style={{ color: 'var(--color-primary)' }} />
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text)' }}>Boîte à outils</span>
            </div>
            <button onClick={() => setShowEditor(true)} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--color-primary)', color: '#fff', fontSize: '10px', fontWeight: 600, cursor: 'pointer', border: 'none' }}>
              <Plus size={10} /> Nouvelle
            </button>
          </div>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', marginLeft: '-14px', marginRight: '-14px', paddingLeft: '14px', paddingRight: '14px' }}>
            <button style={tabStyle(tab === 'library')} onClick={() => setTab('library')}><Blocks size={11} /> Bibliothèque</button>
            <button style={tabStyle(tab === 'custom')} onClick={() => setTab('custom')}>
              <Tag size={11} /> Mes briques
              {customBricks.length > 0 && <span style={{ background: 'var(--color-primary)', color: '#fff', borderRadius: '10px', fontSize: '9px', padding: '0 5px', fontWeight: 700 }}>{customBricks.length}</span>}
            </button>
          </div>
        </div>

        {tab === 'library' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
            <p style={{ fontSize: '10px', color: 'var(--color-text-faint)', marginBottom: '10px', lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--color-text-muted)' }}>Cliquer</strong> pour insérer au curseur · <strong style={{ color: 'var(--color-text-muted)' }}>Glisser</strong> dans le document
            </p>
            {displayGroups.map((g, i) => <BrickGroupSection key={g.id} group={g} onInsert={b => onInsertBrick(brickContentToHtml(b.content))} defaultOpen={i === 0} />)}
          </div>
        )}

        {tab === 'custom' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px 4px' }}>
            {customBricks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '28px 16px', color: 'var(--color-text-faint)', fontSize: 'var(--text-xs)' }}>
                <Blocks size={26} style={{ opacity: 0.15, margin: '0 auto 10px', display: 'block' }} />
                Aucune brique personnalisée.<br />
                <button onClick={() => setShowEditor(true)} style={{ color: 'var(--color-primary)', background: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 'inherit', marginTop: '4px' }}>Ouvrir l'éditeur de briques</button>
              </div>
            ) : customBricks.map(b => <BrickChip key={b.id} brick={b} onInsert={() => onInsertBrick(brickContentToHtml(b.content))} />)}
          </div>
        )}

        <div style={{ padding: '8px 10px', borderTop: '1px solid var(--color-border)', flexShrink: 0 }}>
          <button onClick={() => setShowEditor(true)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '7px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-surface-offset)', color: 'var(--color-text-muted)', fontSize: '11px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.12s' }}
            onMouseEnter={e => { const b = e.currentTarget; b.style.borderColor = 'var(--color-primary)'; b.style.color = 'var(--color-primary)'; b.style.background = 'var(--color-primary)08' }}
            onMouseLeave={e => { const b = e.currentTarget; b.style.borderColor = 'var(--color-border)'; b.style.color = 'var(--color-text-muted)'; b.style.background = 'var(--color-surface-offset)' }}
          ><Settings2 size={12} /> Éditeur de briques</button>
        </div>
      </div>

      {showEditor && <BricksEditorModal groups={groups} onSave={setGroups} onClose={() => setShowEditor(false)} />}
    </>
  )
}
