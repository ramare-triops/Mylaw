// components/editor/DocumentBricksPanel.tsx
// Panneau « Boîte à outils » de l'éditeur de documents :
// – Briques prêtes à l'emploi (clic ou glisser-déposer)
// – Bouton « Éditeur de briques » en bas → pop-up complète de gestion
'use client'

import { useState, useRef, useEffect } from 'react'
import {
  Blocks, Plus, Trash2, Tag, User, Building2,
  Scale, ChevronDown, ChevronRight, Gavel, AlignLeft, FileText,
  Users, Briefcase, X, Check, Pencil, Settings2, Search,
  GripVertical, ChevronUp,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

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
  { id: 'parties',   label: 'Parties',        color: '#01696f' },
  { id: 'structure', label: 'Structure',       color: '#4f46e5' },
  { id: 'formules',  label: 'Formules types',  color: '#15803d' },
  { id: 'custom',    label: 'Mes briques',     color: '#6b7280' },
]

const ICON_OPTIONS = [
  { name: 'user',       label: 'Personne' },
  { name: 'users',      label: 'Parties' },
  { name: 'building',   label: 'Société' },
  { name: 'scale',      label: 'Justice' },
  { name: 'gavel',      label: 'Tribunal' },
  { name: 'align-left', label: 'Texte' },
  { name: 'file-text',  label: 'Document' },
  { name: 'briefcase',  label: 'Avocat' },
  { name: 'check',      label: 'Validation' },
  { name: 'blocks',     label: 'Brique' },
]

const COLOR_OPTIONS = [
  '#01696f', '#7c3aed', '#be185d', '#c2410c',
  '#4f46e5', '#15803d', '#6b7280', '#b45309',
  '#0369a1', '#dc2626',
]

// ─── Données par défaut ───────────────────────────────────────────────────────

const INITIAL_BRICK_GROUPS: BrickGroup[] = [
  {
    id: 'parties',
    label: 'Parties',
    color: '#01696f',
    iconName: 'users',
    bricks: [
      {
        id: 'personne_physique',
        label: 'Personne physique',
        color: '#01696f',
        icon: 'user',
        category: 'parties',
        content:
          '[Nom] [Prénom], né(e) le [Date de naissance] à [Lieu de naissance], de nationalité [Nationalité], demeurant au [Adresse]',
      },
      {
        id: 'personne_morale',
        label: 'Personne morale',
        color: '#7c3aed',
        icon: 'building',
        category: 'parties',
        content:
          'La société [Nom de la société], [Forme juridique] au capital de [Capital social] euros, immatriculée au RCS de [Ville RCS] sous le numéro [Numéro RCS], dont le siège social est sis [Adresse du siège], représentée par [Représentant légal], en sa qualité de [Qualité du représentant]',
      },
      {
        id: 'avocat',
        label: 'Ayant pour avocat',
        color: '#be185d',
        icon: 'scale',
        category: 'parties',
        content:
          "Ayant pour avocat Maître [Nom de l'avocat], inscrit(e) au Barreau de [Ville du barreau], dont le cabinet est sis [Adresse du cabinet]",
      },
      {
        id: 'representant',
        label: 'Représentant / mandataire',
        color: '#c2410c',
        icon: 'briefcase',
        category: 'parties',
        content:
          "Représenté(e) par [Nom du mandataire], [Qualité], en vertu d'un pouvoir en date du [Date du pouvoir]",
      },
    ],
  },
  {
    id: 'structure',
    label: 'Structure',
    color: '#4f46e5',
    iconName: 'align-left',
    bricks: [
      { id: 'faits_procedure', label: 'Faits et procédure', color: '#4f46e5', icon: 'file-text', category: 'structure', content: 'FAITS ET PROCÉDURE' },
      { id: 'plaise_tribunal', label: 'Plaise au Tribunal',  color: '#4f46e5', icon: 'gavel',     category: 'structure', content: 'PLAISE AU TRIBUNAL DE [Nom du tribunal]' },
      { id: 'par_ces_motifs',  label: 'Par ces motifs',      color: '#4f46e5', icon: 'gavel',     category: 'structure', content: 'PAR CES MOTIFS' },
      { id: 'discussion',      label: 'Discussion',          color: '#4f46e5', icon: 'align-left', category: 'structure', content: 'DISCUSSION' },
      { id: 'en_droit',        label: 'En droit',            color: '#4f46e5', icon: 'scale',     category: 'structure', content: 'EN DROIT' },
      { id: 'en_fait',         label: 'En fait',             color: '#4f46e5', icon: 'file-text', category: 'structure', content: 'EN FAIT' },
      { id: 'demandes',        label: 'Demandes',            color: '#4f46e5', icon: 'gavel',     category: 'structure', content: 'DEMANDES' },
    ],
  },
  {
    id: 'formules',
    label: 'Formules types',
    color: '#15803d',
    iconName: 'file-text',
    bricks: [
      { id: 'entre_les_soussignes', label: 'Entre les soussignés', color: '#15803d', icon: 'users',     category: 'formules', content: 'ENTRE LES SOUSSIGNÉS :' },
      { id: 'il_a_ete_convenu',     label: 'Il a été convenu',     color: '#15803d', icon: 'check',     category: 'formules', content: 'IL A ÉTÉ CONVENU ET ARRÊTÉ CE QUI SUIT :' },
      { id: 'fait_a',               label: 'Fait à…',              color: '#15803d', icon: 'file-text', category: 'formules', content: 'Fait à [Lieu], le [Date], en [Nombre] exemplaire(s) originaux.' },
      { id: 'signature',            label: 'Bloc signature',       color: '#15803d', icon: 'check',     category: 'formules', content: 'Pour [Partie 1]\n[Nom et signature]\n\nPour [Partie 2]\n[Nom et signature]' },
    ],
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return Math.random().toString(36).slice(2, 9)
}

const SUGGESTED_TAGS = [
  'Nom', 'Prénom', 'Date de naissance', 'Lieu de naissance', 'Nationalité', 'Adresse',
  'Nom de la société', 'Forme juridique', 'Capital social', 'Numéro RCS', 'Ville RCS',
  'Adresse du siège', 'Représentant légal', 'Qualité',
  "Nom de l'avocat", 'Ville du barreau', 'Adresse du cabinet',
  'Date', 'Lieu', 'Montant', 'Durée', 'Tribunal', 'Nombre',
]

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

// ─── Chip brique (panneau latéral) ───────────────────────────────────────────

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
    <div
      draggable
      onDragStart={handleDragStart}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={`Cliquer pour insérer · Glisser dans le document\n\n${brick.content}`}
      style={{
        display: 'flex', alignItems: 'center', gap: '5px',
        padding: '5px 8px', borderRadius: 'var(--radius-md)',
        border: `1.5px solid ${hovered ? brick.color : brick.color + '50'}`,
        background: hovered ? brick.color + '18' : brick.color + '0c',
        cursor: 'grab', userSelect: 'none', transition: 'all 0.12s ease', marginBottom: '4px',
      }}
    >
      <BrickIcon name={brick.icon} size={11} color={brick.color} />
      <span
        onClick={onInsert}
        style={{ flex: 1, fontSize: '11px', fontWeight: 500, color: brick.color, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
      >
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
      <button
        onClick={() => setOpen(v => !v)}
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
// ─── POP-UP ÉDITEUR DE BRIQUES ─────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

type EditorView = 'list' | 'edit'

function TagButton({ tag, onInsert }: { tag: string; onInsert: () => void }) {
  const [h, setH] = useState(false)
  return (
    <button
      onClick={onInsert}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        padding: '2px 7px', borderRadius: '20px', border: `1.5px solid ${h ? '#01696f' : '#01696f60'}`,
        background: h ? '#01696f18' : '#01696f0c', color: '#01696f', fontSize: '10px',
        fontWeight: 500, cursor: 'pointer', transition: 'all 0.1s', fontFamily: 'monospace',
      }}
    >
      [{tag}]
    </button>
  )
}

function BrickEditorForm({
  brick,
  onSave,
  onCancel,
  onDelete,
  isNew,
}: {
  brick: Brick
  onSave: (b: Brick) => void
  onCancel: () => void
  onDelete?: () => void
  isNew?: boolean
}) {
  const [label,    setLabel]    = useState(brick.label)
  const [content,  setContent]  = useState(brick.content)
  const [category, setCategory] = useState(brick.category)
  const [icon,     setIcon]     = useState(brick.icon)
  const [color,    setColor]    = useState(brick.color)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function insertTag(tag: string) {
    const ta = textareaRef.current
    if (!ta) return
    const s = ta.selectionStart, e = ta.selectionEnd
    const ins = `[${tag}]`
    const next = content.slice(0, s) + ins + content.slice(e)
    setContent(next)
    setTimeout(() => { ta.focus(); ta.setSelectionRange(s + ins.length, s + ins.length) }, 0)
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '7px 10px', fontSize: '13px',
    background: 'var(--color-surface-offset)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)', color: 'var(--color-text)', outline: 'none',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>

      {/* Titre + prévisualisation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: '36px', height: '36px', borderRadius: 'var(--radius-md)',
          background: color + '18', border: `2px solid ${color}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <BrickIcon name={icon} size={16} color={color} />
        </div>
        <div style={{ flex: 1 }}>
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="Nom de la brique"
            autoFocus={isNew}
            style={{ ...inp, fontSize: '14px', fontWeight: 600 }}
          />
        </div>
      </div>

      {/* Catégorie + icône + couleur */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
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
      </div>

      {/* Couleur */}
      <div>
        <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '6px' }}>Couleur</p>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {COLOR_OPTIONS.map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              style={{
                width: '22px', height: '22px', borderRadius: '50%', background: c, border: `2px solid ${color === c ? c : 'transparent'}`,
                outline: color === c ? `2px solid ${c}` : 'none', outlineOffset: '2px', cursor: 'pointer',
                transition: 'all 0.1s',
              }}
            />
          ))}
        </div>
      </div>

      {/* Contenu */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', minHeight: 0 }}>
        <p style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Contenu</p>
        <textarea
          ref={textareaRef}
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Rédigez le contenu de la brique. Utilisez [Variable] pour les champs à remplir."
          style={{ ...inp, flex: 1, minHeight: '90px', resize: 'none', lineHeight: 1.6, fontFamily: 'inherit', fontSize: '12px' }}
        />
        {/* Variables suggérées */}
        <div>
          <p style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-faint)', marginBottom: '5px' }}>Insérer une variable</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {SUGGESTED_TAGS.map(t => <TagButton key={t} tag={t} onInsert={() => insertTag(t)} />)}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between', paddingTop: '4px', borderTop: '1px solid var(--color-border)' }}>
        <div>
          {onDelete && (
            confirmDelete ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: 'var(--color-error)' }}>Supprimer définitivement ?</span>
                <button
                  onClick={onDelete}
                  style={{ padding: '5px 10px', borderRadius: 'var(--radius-md)', background: 'var(--color-error)', color: '#fff', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Oui, supprimer
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  style={{ padding: '5px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-surface-offset)', color: 'var(--color-text-muted)', fontSize: '11px', cursor: 'pointer' }}
                >
                  Annuler
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-error)40', color: 'var(--color-error)', fontSize: '11px', cursor: 'pointer', background: 'transparent' }}
              >
                <Trash2 size={12} /> Supprimer
              </button>
            )
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={onCancel}
            style={{ padding: '7px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-surface-offset)', color: 'var(--color-text-muted)', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}
          >
            Annuler
          </button>
          <button
            onClick={() => { if (label.trim() && content.trim()) onSave({ ...brick, label: label.trim(), content: content.trim(), category, icon, color }) }}
            disabled={!label.trim() || !content.trim()}
            style={{ padding: '7px 16px', borderRadius: 'var(--radius-md)', background: 'var(--color-primary)', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', opacity: (!label.trim() || !content.trim()) ? 0.5 : 1 }}
          >
            {isNew ? 'Créer' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Ligne brique dans la liste de l'éditeur ─────────────────────────────────

function BrickEditorRow({
  brick,
  onEdit,
  isSelected,
}: {
  brick: Brick
  onEdit: () => void
  isSelected: boolean
}) {
  const [h, setH] = useState(false)
  const catColor = ALL_CATEGORIES.find(c => c.id === brick.category)?.color ?? '#6b7280'

  return (
    <div
      onClick={onEdit}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '9px 12px', cursor: 'pointer',
        background: isSelected ? 'var(--color-primary)0f' : h ? 'var(--color-surface-offset)' : 'transparent',
        borderLeft: `3px solid ${isSelected ? 'var(--color-primary)' : 'transparent'}`,
        transition: 'all 0.1s',
      }}
    >
      <div style={{
        width: '28px', height: '28px', borderRadius: 'var(--radius-sm)', flexShrink: 0,
        background: brick.color + '18', border: `1.5px solid ${brick.color}60`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <BrickIcon name={brick.icon} size={13} color={brick.color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {brick.label}
        </div>
        <div style={{ fontSize: '10px', color: catColor, marginTop: '1px', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
          {ALL_CATEGORIES.find(c => c.id === brick.category)?.label ?? brick.category}
        </div>
      </div>
      <Pencil size={12} style={{ color: h || isSelected ? 'var(--color-primary)' : 'var(--color-text-faint)', flexShrink: 0, transition: 'color 0.1s' }} />
    </div>
  )
}

// ─── Pop-up éditeur de briques ────────────────────────────────────────────────

function BricksEditorModal({
  groups,
  onSave,
  onClose,
}: {
  groups: BrickGroup[]
  onSave: (groups: BrickGroup[]) => void
  onClose: () => void
}) {
  // État local : on travaille sur une copie profonde
  const [localGroups, setLocalGroups] = useState<BrickGroup[]>(() => JSON.parse(JSON.stringify(groups)))
  const [selectedBrickId, setSelectedBrickId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState<string>('all')
  const [hasChanges, setHasChanges] = useState(false)

  // Toutes les briques à plat
  const allBricks = localGroups.flatMap(g => g.bricks)

  const filteredBricks = allBricks.filter(b => {
    const matchSearch = b.label.toLowerCase().includes(search.toLowerCase()) ||
      b.content.toLowerCase().includes(search.toLowerCase())
    const matchCat = filterCat === 'all' || b.category === filterCat
    return matchSearch && matchCat
  })

  const selectedBrick = allBricks.find(b => b.id === selectedBrickId) ?? null

  function updateBrick(updated: Brick) {
    setLocalGroups(prev => {
      // Retire la brique de son ancien groupe
      const cleaned = prev.map(g => ({ ...g, bricks: g.bricks.filter(b => b.id !== updated.id) }))
      // L'ajoute dans le bon groupe (ou crée le groupe custom si besoin)
      const targetGroupId = updated.category
      const targetGroup = cleaned.find(g => g.id === targetGroupId)
      if (targetGroup) {
        return cleaned.map(g =>
          g.id === targetGroupId ? { ...g, bricks: [...g.bricks, updated] } : g
        )
      }
      // Groupe "Mes briques" à créer
      return [
        ...cleaned,
        { id: 'custom', label: 'Mes briques', color: '#6b7280', iconName: 'blocks', bricks: [updated] },
      ]
    })
    setSelectedBrickId(updated.id)
    setHasChanges(true)
  }

  function addBrick(partial: Omit<Brick, 'id'>) {
    const brick: Brick = { ...partial, id: generateId() }
    setLocalGroups(prev => {
      const targetGroup = prev.find(g => g.id === brick.category)
      if (targetGroup) {
        return prev.map(g => g.id === brick.category ? { ...g, bricks: [...g.bricks, brick] } : g)
      }
      return [
        ...prev,
        { id: 'custom', label: 'Mes briques', color: '#6b7280', iconName: 'blocks', bricks: [brick] },
      ]
    })
    setSelectedBrickId(brick.id)
    setIsCreating(false)
    setHasChanges(true)
  }

  function deleteBrick(brickId: string) {
    setLocalGroups(prev =>
      prev
        .map(g => ({ ...g, bricks: g.bricks.filter(b => b.id !== brickId) }))
        .filter(g => g.bricks.length > 0)
    )
    setSelectedBrickId(null)
    setHasChanges(true)
  }

  function handleSave() {
    // Nettoie les groupes vides
    onSave(localGroups.filter(g => g.bricks.length > 0))
    onClose()
  }

  // Empêche le scroll du body derrière la modale
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  // Ferme avec Échap
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const newBrickTemplate: Brick = {
    id: '__new__',
    label: '',
    content: '',
    category: 'custom',
    icon: 'file-text',
    color: '#01696f',
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {/* Backdrop : flou + assombrissement */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0, 0, 0, 0.55)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
        }}
      />

      {/* Fenêtre modale */}
      <div
        style={{
          position: 'relative', zIndex: 10,
          width: '880px', maxWidth: 'calc(100vw - 32px)',
          height: '620px', maxHeight: 'calc(100vh - 48px)',
          borderRadius: '16px',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.05)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* En-tête de la modale */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--color-border)',
          flexShrink: 0, background: 'var(--color-surface)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--color-primary)18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Settings2 size={16} style={{ color: 'var(--color-primary)' }} />
            </div>
            <div>
              <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>Éditeur de briques</h2>
              <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: 0 }}>
                {allBricks.length} brique{allBricks.length > 1 ? 's' : ''} · Cliquez sur une brique pour la modifier
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {hasChanges && (
              <button
                onClick={handleSave}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '7px 16px', borderRadius: '8px',
                  background: 'var(--color-primary)', color: '#fff',
                  fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                }}
              >
                <Check size={13} /> Enregistrer les modifications
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                width: '32px', height: '32px', borderRadius: '8px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--color-surface-offset)', border: '1px solid var(--color-border)', cursor: 'pointer',
              }}
            >
              <X size={16} style={{ color: 'var(--color-text-muted)' }} />
            </button>
          </div>
        </div>

        {/* Corps : liste gauche + éditeur droit */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* ─── Colonne gauche : liste des briques ─── */}
          <div style={{
            width: '300px', flexShrink: 0,
            borderRight: '1px solid var(--color-border)',
            display: 'flex', flexDirection: 'column',
            background: 'var(--color-surface-offset)',
          }}>
            {/* Barre de recherche + filtre */}
            <div style={{ padding: '12px', borderBottom: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ position: 'relative' }}>
                <Search size={12} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-faint)', pointerEvents: 'none' }} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Rechercher une brique…"
                  style={{
                    width: '100%', padding: '6px 8px 6px 28px', fontSize: '12px',
                    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                    borderRadius: '6px', color: 'var(--color-text)', outline: 'none',
                  }}
                />
              </div>
              <select
                value={filterCat}
                onChange={e => setFilterCat(e.target.value)}
                style={{
                  width: '100%', padding: '5px 8px', fontSize: '11px',
                  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                  borderRadius: '6px', color: 'var(--color-text-muted)', outline: 'none',
                }}
              >
                <option value="all">Toutes les catégories ({allBricks.length})</option>
                {ALL_CATEGORIES.map(c => {
                  const count = allBricks.filter(b => b.category === c.id).length
                  if (count === 0) return null
                  return <option key={c.id} value={c.id}>{c.label} ({count})</option>
                })}
              </select>
            </div>

            {/* Liste */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {filteredBricks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--color-text-faint)', fontSize: '12px' }}>
                  <Blocks size={24} style={{ opacity: 0.15, margin: '0 auto 8px', display: 'block' }} />
                  Aucune brique trouvée
                </div>
              ) : (
                filteredBricks.map(b => (
                  <BrickEditorRow
                    key={b.id}
                    brick={b}
                    onEdit={() => { setSelectedBrickId(b.id); setIsCreating(false) }}
                    isSelected={!isCreating && selectedBrickId === b.id}
                  />
                ))
              )}
            </div>

            {/* Bouton Nouvelle brique */}
            <div style={{ padding: '10px 12px', borderTop: '1px solid var(--color-border)', flexShrink: 0 }}>
              <button
                onClick={() => { setIsCreating(true); setSelectedBrickId(null) }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  padding: '8px', borderRadius: '8px',
                  border: `1.5px dashed ${isCreating ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  background: isCreating ? 'var(--color-primary)0c' : 'transparent',
                  color: isCreating ? 'var(--color-primary)' : 'var(--color-text-muted)',
                  fontSize: '12px', fontWeight: 500, cursor: 'pointer', transition: 'all 0.12s',
                }}
              >
                <Plus size={13} /> Nouvelle brique
              </button>
            </div>
          </div>

          {/* ─── Colonne droite : formulaire d'édition ─── */}
          <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {isCreating ? (
              <BrickEditorForm
                brick={newBrickTemplate}
                isNew
                onSave={(b) => addBrick({ label: b.label, content: b.content, category: b.category, icon: b.icon, color: b.color })}
                onCancel={() => setIsCreating(false)}
              />
            ) : selectedBrick ? (
              <BrickEditorForm
                key={selectedBrick.id}
                brick={selectedBrick}
                onSave={updateBrick}
                onCancel={() => setSelectedBrickId(null)}
                onDelete={() => deleteBrick(selectedBrick.id)}
              />
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', color: 'var(--color-text-faint)' }}>
                <Settings2 size={40} style={{ opacity: 0.12 }} />
                <p style={{ fontSize: '13px', textAlign: 'center', maxWidth: '260px', lineHeight: 1.5 }}>
                  Sélectionnez une brique dans la liste pour la modifier,
                  ou créez-en une nouvelle.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Pied de page avec compteur de modifications */}
        {hasChanges && (
          <div style={{
            padding: '8px 20px', borderTop: '1px solid var(--color-border)',
            background: 'var(--color-primary)08', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: '11px', color: 'var(--color-primary)', fontWeight: 500 }}>
              ● Modifications non enregistrées
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => { setLocalGroups(JSON.parse(JSON.stringify(groups))); setHasChanges(false); setSelectedBrickId(null); setIsCreating(false) }}
                style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface-offset)', color: 'var(--color-text-muted)', fontSize: '11px', cursor: 'pointer' }}
              >
                Tout annuler
              </button>
              <button
                onClick={handleSave}
                style={{ padding: '5px 12px', borderRadius: '6px', background: 'var(--color-primary)', color: '#fff', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
              >
                Enregistrer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── COMPOSANT PRINCIPAL ───────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

interface DocumentBricksPanelProps {
  onInsertBrick: (content: string) => void
  onDragStart?: (brick: Brick) => void
}

export function DocumentBricksPanel({ onInsertBrick }: DocumentBricksPanelProps) {
  const [groups, setGroups]       = useState<BrickGroup[]>(INITIAL_BRICK_GROUPS)
  const [tab, setTab]             = useState<'library' | 'custom'>('library')
  const [showEditor, setShowEditor] = useState(false)

  // Toutes les briques perso (catégorie « custom »)
  const customBricks = groups.flatMap(g => g.bricks).filter(b => b.category === 'custom')

  // Groupes à afficher dans le panneau latéral
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

        {/* Header */}
        <div style={{ padding: '10px 14px 0', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Blocks size={13} style={{ color: 'var(--color-primary)' }} />
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text)' }}>Boîte à outils</span>
            </div>
            <button
              onClick={() => setShowEditor(true)}
              title="Éditeur de briques"
              style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                padding: '3px 8px', borderRadius: 'var(--radius-sm)',
                background: 'var(--color-primary)', color: '#fff',
                fontSize: '10px', fontWeight: 600, cursor: 'pointer', border: 'none',
              }}
            >
              <Plus size={10} /> Nouvelle
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', marginLeft: '-14px', marginRight: '-14px', paddingLeft: '14px', paddingRight: '14px' }}>
            <button style={tabStyle(tab === 'library')} onClick={() => setTab('library')}>
              <Blocks size={11} /> Bibliothèque
            </button>
            <button style={tabStyle(tab === 'custom')} onClick={() => setTab('custom')}>
              <Tag size={11} /> Mes briques
              {customBricks.length > 0 && (
                <span style={{ background: 'var(--color-primary)', color: '#fff', borderRadius: '10px', fontSize: '9px', padding: '0 5px', fontWeight: 700 }}>{customBricks.length}</span>
              )}
            </button>
          </div>
        </div>

        {/* Onglet Bibliothèque */}
        {tab === 'library' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
            <p style={{ fontSize: '10px', color: 'var(--color-text-faint)', marginBottom: '10px', lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--color-text-muted)' }}>Cliquer</strong> pour insérer au curseur ·
              <strong style={{ color: 'var(--color-text-muted)' }}> Glisser</strong> dans le document
            </p>
            {displayGroups.map((g, i) => (
              <BrickGroupSection key={g.id} group={g} onInsert={b => onInsertBrick(b.content)} defaultOpen={i === 0} />
            ))}
          </div>
        )}

        {/* Onglet Mes briques */}
        {tab === 'custom' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px 4px' }}>
            {customBricks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '28px 16px', color: 'var(--color-text-faint)', fontSize: 'var(--text-xs)' }}>
                <Blocks size={26} style={{ opacity: 0.15, margin: '0 auto 10px', display: 'block' }} />
                Aucune brique personnalisée.
                <br />
                <button
                  onClick={() => setShowEditor(true)}
                  style={{ color: 'var(--color-primary)', background: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 'inherit', marginTop: '4px' }}
                >
                  Ouvrir l'éditeur de briques
                </button>
              </div>
            ) : (
              customBricks.map(b => <BrickChip key={b.id} brick={b} onInsert={() => onInsertBrick(b.content)} />)
            )}
          </div>
        )}

        {/* ─── Bouton bas : Éditeur de briques ─── */}
        <div style={{ padding: '8px 10px', borderTop: '1px solid var(--color-border)', flexShrink: 0 }}>
          <button
            onClick={() => setShowEditor(true)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: '6px', padding: '7px 10px', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-offset)',
              color: 'var(--color-text-muted)', fontSize: '11px', fontWeight: 500,
              cursor: 'pointer', transition: 'all 0.12s',
            }}
            onMouseEnter={e => { const b = e.currentTarget; b.style.borderColor = 'var(--color-primary)'; b.style.color = 'var(--color-primary)'; b.style.background = 'var(--color-primary)08' }}
            onMouseLeave={e => { const b = e.currentTarget; b.style.borderColor = 'var(--color-border)'; b.style.color = 'var(--color-text-muted)'; b.style.background = 'var(--color-surface-offset)' }}
          >
            <Settings2 size={12} /> Éditeur de briques
          </button>
        </div>
      </div>

      {/* Pop-up éditeur */}
      {showEditor && (
        <BricksEditorModal
          groups={groups}
          onSave={setGroups}
          onClose={() => setShowEditor(false)}
        />
      )}
    </>
  )
}
