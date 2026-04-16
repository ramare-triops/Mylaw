// components/editor/DocumentBricksPanel.tsx
// Panneau « Boîte à outils » de l'éditeur de documents :
// – Briques prêtes à l'emploi (clic ou glisser-déposer)
// – Création de briques personnalisées avec étiquettes [Variable]
'use client'

import { useState, useRef } from 'react'
import {
  Blocks, Plus, Trash2, GripVertical, Tag, User, Building2,
  Scale, ChevronDown, ChevronRight, Gavel, AlignLeft, FileText,
  Users, Briefcase, X, Check,
} from 'lucide-react'
import type { FieldType } from '@/components/templates/TemplateFieldsPanel'
import { PRESET_GROUPS } from '@/components/templates/TemplateFieldsPanel'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Brick {
  id: string
  label: string
  /** Contenu HTML ou texte avec variables [Nom], [Prénom], etc. */
  content: string
  category: string
  icon: string // nom d'icône
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

// ─── Briques pré-définies ────────────────────────────────────────────────────

const DEFAULT_BRICK_GROUPS: BrickGroup[] = [
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
          'Ayant pour avocat Maître [Nom de l\'avocat], inscrit(e) au Barreau de [Ville du barreau], dont le cabinet est sis [Adresse du cabinet]',
      },
      {
        id: 'representant',
        label: 'Représentant / mandataire',
        color: '#c2410c',
        icon: 'briefcase',
        category: 'parties',
        content:
          'Représenté(e) par [Nom du mandataire], [Qualité], en vertu d\'un pouvoir en date du [Date du pouvoir]',
      },
    ],
  },
  {
    id: 'structure',
    label: 'Structure',
    color: '#4f46e5',
    iconName: 'align-left',
    bricks: [
      {
        id: 'faits_procedure',
        label: 'Faits et procédure',
        color: '#4f46e5',
        icon: 'file-text',
        category: 'structure',
        content: 'FAITS ET PROCÉDURE',
      },
      {
        id: 'plaise_tribunal',
        label: 'Plaise au Tribunal',
        color: '#4f46e5',
        icon: 'gavel',
        category: 'structure',
        content: 'PLAISE AU TRIBUNAL DE [Nom du tribunal]',
      },
      {
        id: 'par_ces_motifs',
        label: 'Par ces motifs',
        color: '#4f46e5',
        icon: 'gavel',
        category: 'structure',
        content: 'PAR CES MOTIFS',
      },
      {
        id: 'discussion',
        label: 'Discussion',
        color: '#4f46e5',
        icon: 'align-left',
        category: 'structure',
        content: 'DISCUSSION',
      },
      {
        id: 'en_droit',
        label: 'En droit',
        color: '#4f46e5',
        icon: 'scale',
        category: 'structure',
        content: 'EN DROIT',
      },
      {
        id: 'en_fait',
        label: 'En fait',
        color: '#4f46e5',
        icon: 'file-text',
        category: 'structure',
        content: 'EN FAIT',
      },
      {
        id: 'demandes',
        label: 'Demandes',
        color: '#4f46e5',
        icon: 'gavel',
        category: 'structure',
        content: 'DEMANDES',
      },
    ],
  },
  {
    id: 'formules',
    label: 'Formules types',
    color: '#15803d',
    iconName: 'file-text',
    bricks: [
      {
        id: 'entre_les_soussignes',
        label: 'Entre les soussignés',
        color: '#15803d',
        icon: 'users',
        category: 'formules',
        content: 'ENTRE LES SOUSSIGNÉS :',
      },
      {
        id: 'il_a_ete_convenu',
        label: 'Il a été convenu',
        color: '#15803d',
        icon: 'check',
        category: 'formules',
        content: 'IL A ÉTÉ CONVENU ET ARRÊTÉ CE QUI SUIT :',
      },
      {
        id: 'fait_a',
        label: 'Fait à…',
        color: '#15803d',
        icon: 'file-text',
        category: 'formules',
        content: 'Fait à [Lieu], le [Date], en [Nombre] exemplaire(s) originaux.',
      },
      {
        id: 'signature',
        label: 'Bloc signature',
        color: '#15803d',
        icon: 'check',
        category: 'formules',
        content:
          'Pour [Partie 1]\n[Nom et signature]\n\nPour [Partie 2]\n[Nom et signature]',
      },
    ],
  },
]

// ─── Rendu icône à partir du nom ─────────────────────────────────────────────

function BrickIcon({ name, size = 11, color }: { name: string; size?: number; color?: string }) {
  const style = { color: color ?? 'currentColor', flexShrink: 0 as const }
  switch (name) {
    case 'user':       return <User       size={size} style={style} />
    case 'users':      return <Users      size={size} style={style} />
    case 'building':   return <Building2  size={size} style={style} />
    case 'scale':      return <Scale      size={size} style={style} />
    case 'gavel':      return <Gavel      size={size} style={style} />
    case 'align-left': return <AlignLeft  size={size} style={style} />
    case 'file-text':  return <FileText   size={size} style={style} />
    case 'briefcase':  return <Briefcase  size={size} style={style} />
    case 'check':      return <Check      size={size} style={style} />
    default:           return <Blocks     size={size} style={style} />
  }
}

// ─── Chip d'une brique ───────────────────────────────────────────────────────

function BrickChip({
  brick,
  onInsert,
  onDelete,
  isDeletable,
}: {
  brick: Brick
  onInsert: () => void
  onDelete?: () => void
  isDeletable?: boolean
}) {
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
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
        padding: '5px 8px',
        borderRadius: 'var(--radius-md)',
        border: `1.5px solid ${hovered ? brick.color : brick.color + '50'}`,
        background: hovered ? brick.color + '18' : brick.color + '0c',
        cursor: 'grab',
        userSelect: 'none',
        transition: 'all 0.12s ease',
        marginBottom: '4px',
      }}
    >
      <BrickIcon name={brick.icon} size={11} color={brick.color} />
      <span
        onClick={onInsert}
        style={{
          flex: 1,
          fontSize: '11px',
          fontWeight: 500,
          color: brick.color,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {brick.label}
      </span>
      {isDeletable && onDelete && hovered && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          style={{ padding: '1px', borderRadius: '3px', flexShrink: 0 }}
          title="Supprimer cette brique"
        >
          <Trash2 size={10} style={{ color: 'var(--color-error)' }} />
        </button>
      )}
    </div>
  )
}

// ─── Groupe de briques (accordion) ───────────────────────────────────────────

function BrickGroupSection({
  group,
  onInsert,
  onDelete,
  isDeletable,
  defaultOpen,
}: {
  group: BrickGroup
  onInsert: (brick: Brick) => void
  onDelete?: (brickId: string) => void
  isDeletable?: boolean
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div style={{ marginBottom: '4px' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          padding: '4px 2px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--color-text-muted)',
          fontSize: '10px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {open
          ? <ChevronDown  size={10} style={{ color: group.color, flexShrink: 0 }} />
          : <ChevronRight size={10} style={{ color: group.color, flexShrink: 0 }} />}
        <BrickIcon name={group.iconName} size={10} color={group.color} />
        <span style={{ color: group.color }}>{group.label}</span>
      </button>
      {open && (
        <div style={{ paddingLeft: '2px', paddingBottom: '4px' }}>
          {group.bricks.map((brick) => (
            <BrickChip
              key={brick.id}
              brick={brick}
              onInsert={() => onInsert(brick)}
              onDelete={onDelete ? () => onDelete(brick.id) : undefined}
              isDeletable={isDeletable}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Dialog création de brique personnalisée ──────────────────────────────────

function CreateBrickDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: (brick: Omit<Brick, 'id'>) => void
  onCancel: () => void
}) {
  const [label, setLabel]     = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState('custom')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Insère une étiquette [Variable] à la position du curseur
  function insertTag(tag: string) {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end   = ta.selectionEnd
    const before = content.slice(0, start)
    const after  = content.slice(end)
    const inserted = `[${tag}]`
    const next = before + inserted + after
    setContent(next)
    setTimeout(() => {
      ta.focus()
      ta.setSelectionRange(start + inserted.length, start + inserted.length)
    }, 0)
  }

  function handleSubmit() {
    if (!label.trim() || !content.trim()) return
    onConfirm({
      label: label.trim(),
      content: content.trim(),
      category,
      icon: 'file-text',
      color: '#01696f',
    })
  }

  // Étiquettes proposées pour la brique (extraites des PRESET_GROUPS)
  const suggestedTags: string[] = [
    'Nom', 'Prénom', 'Date de naissance', 'Lieu de naissance', 'Nationalité', 'Adresse',
    'Nom de la société', 'Forme juridique', 'Capital social', 'Numéro RCS', 'Ville RCS',
    'Adresse du siège', 'Représentant légal', 'Qualité',
    'Nom de l\'avocat', 'Ville du barreau', 'Adresse du cabinet',
    'Date', 'Lieu', 'Montant', 'Durée',
  ]

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '6px 8px', fontSize: 'var(--text-xs)',
    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', outline: 'none',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
        onClick={onCancel}
      />
      <div style={{
        position: 'relative', zIndex: 10, width: '100%', maxWidth: '440px',
        margin: '0 16px', padding: '20px', borderRadius: 'var(--radius-lg)',
        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', gap: '14px',
      }}>
        {/* Titre */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <Blocks size={15} style={{ color: 'var(--color-primary)' }} />
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text)' }}>Nouvelle brique</span>
          </div>
          <button onClick={onCancel} style={{ padding: '3px', borderRadius: 'var(--radius-sm)' }}>
            <X size={14} style={{ color: 'var(--color-text-muted)' }} />
          </button>
        </div>

        {/* Étiquette */}
        <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          Nom de la brique
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ex : Mandataire ad hoc"
            style={inputStyle}
            autoFocus
          />
        </label>

        {/* Catégorie */}
        <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          Catégorie
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
            <option value="parties">Parties</option>
            <option value="structure">Structure</option>
            <option value="formules">Formules types</option>
            <option value="custom">Mes briques</option>
          </select>
        </label>

        {/* Contenu */}
        <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          Contenu
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={`Saisissez le texte de la brique…\nUtilisez les boutons ci-dessous pour insérer des variables [Nom], [Adresse], etc.`}
            rows={5}
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5, fontFamily: 'inherit' }}
          />
        </label>

        {/* Étiquettes suggérées */}
        <div>
          <p style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)', marginBottom: '6px' }}>
            Insérer une variable
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {suggestedTags.map((tag) => (
              <button
                key={tag}
                onClick={() => insertTag(tag)}
                style={{
                  padding: '2px 7px',
                  borderRadius: '20px',
                  border: '1.5px solid #01696f60',
                  background: '#01696f0c',
                  color: '#01696f',
                  fontSize: '10px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.1s',
                  fontFamily: 'monospace',
                }}
                onMouseEnter={(e) => { const b = e.currentTarget; b.style.background = '#01696f18'; b.style.borderColor = '#01696f' }}
                onMouseLeave={(e) => { const b = e.currentTarget; b.style.background = '#01696f0c'; b.style.borderColor = '#01696f60' }}
              >
                [{tag}]
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '7px 16px', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)', background: 'var(--color-surface-offset)',
              color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)', fontWeight: 500, cursor: 'pointer',
            }}
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={!label.trim() || !content.trim()}
            style={{
              padding: '7px 16px', borderRadius: 'var(--radius-md)',
              background: 'var(--color-primary)', color: '#fff',
              fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer',
              opacity: (!label.trim() || !content.trim()) ? 0.5 : 1,
            }}
          >
            Créer la brique
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateId(): string {
  return Math.random().toString(36).slice(2, 9)
}

// ─── Composant principal ─────────────────────────────────────────────────────

interface DocumentBricksPanelProps {
  /** Appelé quand l'utilisateur clique sur une brique (insertion au curseur) */
  onInsertBrick: (content: string) => void
  /** Appelé au début d'un drag pour passer le contenu à l'éditeur */
  onDragStart?: (brick: Brick) => void
}

export function DocumentBricksPanel({ onInsertBrick, onDragStart }: DocumentBricksPanelProps) {
  const [tab, setTab] = useState<'library' | 'custom'>('library')
  const [customGroups, setCustomGroups] = useState<BrickGroup[]>([])
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  // Fusionne les briques personnalisées avec les groupes par défaut pour l'onglet bibliothèque
  // Les briques personnalisées apparaissent dans leur catégorie ou dans "Mes briques"
  const mergedGroups: BrickGroup[] = (() => {
    if (customGroups.length === 0) return DEFAULT_BRICK_GROUPS
    const merged = DEFAULT_BRICK_GROUPS.map((g) => ({
      ...g,
      bricks: [
        ...g.bricks,
        ...customGroups.flatMap((cg) => cg.bricks.filter((b) => b.category === g.id)),
      ],
    }))
    const hasCustomCategory = customGroups.some((cg) => cg.bricks.some((b) => b.category === 'custom'))
    if (hasCustomCategory) {
      const customGroup = customGroups.find((cg) => cg.id === 'custom') ?? {
        id: 'custom',
        label: 'Mes briques',
        color: '#6b7280',
        iconName: 'blocks',
        bricks: customGroups.flatMap((cg) => cg.bricks.filter((b) => b.category === 'custom')),
      }
      return [...merged, customGroup]
    }
    return merged
  })()

  // Toutes les briques personnalisées à plat
  const allCustomBricks = customGroups.flatMap((g) => g.bricks)

  function handleCreateBrick(partial: Omit<Brick, 'id'>) {
    const brick: Brick = { ...partial, id: generateId() }
    setCustomGroups((prev) => {
      const existing = prev.find((g) => g.id === 'custom')
      if (existing) {
        return prev.map((g) =>
          g.id === 'custom' ? { ...g, bricks: [...g.bricks, brick] } : g
        )
      }
      return [
        ...prev,
        {
          id: 'custom',
          label: 'Mes briques',
          color: '#6b7280',
          iconName: 'blocks',
          bricks: [brick],
        },
      ]
    })
    setShowCreateDialog(false)
    setTab('custom')
  }

  function handleDeleteCustomBrick(brickId: string) {
    setCustomGroups((prev) =>
      prev.map((g) => ({ ...g, bricks: g.bricks.filter((b) => b.id !== brickId) }))
        .filter((g) => g.bricks.length > 0)
    )
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '6px 4px',
    fontSize: 'var(--text-xs)',
    fontWeight: active ? 600 : 400,
    color: active ? 'var(--color-primary)' : 'var(--color-text-muted)',
    background: active ? 'var(--color-surface)' : 'transparent',
    borderBottom: active ? '2px solid var(--color-primary)' : '2px solid transparent',
    cursor: 'pointer',
    transition: 'all 0.12s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '5px',
  })

  return (
    <>
      <div style={{
        width: '272px',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        borderLeft: '1px solid var(--color-border)',
        background: 'var(--color-surface)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '10px 14px 0', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Blocks size={13} style={{ color: 'var(--color-primary)' }} />
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text)' }}>Boîte à outils</span>
            </div>
            <button
              onClick={() => setShowCreateDialog(true)}
              title="Créer une nouvelle brique"
              style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                padding: '3px 8px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-primary)',
                color: '#fff',
                fontSize: '10px',
                fontWeight: 600,
                cursor: 'pointer',
                border: 'none',
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
              {allCustomBricks.length > 0 && (
                <span style={{ background: 'var(--color-primary)', color: '#fff', borderRadius: '10px', fontSize: '9px', padding: '0 5px', fontWeight: 700 }}>
                  {allCustomBricks.length}
                </span>
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
            {mergedGroups.map((group, i) => (
              <BrickGroupSection
                key={group.id}
                group={group}
                onInsert={(brick) => onInsertBrick(brick.content)}
                defaultOpen={i === 0}
              />
            ))}
          </div>
        )}

        {/* Onglet Mes briques */}
        {tab === 'custom' && (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px 4px' }}>
              {allCustomBricks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '28px 16px', color: 'var(--color-text-faint)', fontSize: 'var(--text-xs)' }}>
                  <Blocks size={26} style={{ opacity: 0.15, margin: '0 auto 10px', display: 'block' }} />
                  Aucune brique personnalisée.
                  <br />
                  <span style={{ color: 'var(--color-text-muted)' }}>
                    <button
                      onClick={() => setShowCreateDialog(true)}
                      style={{ color: 'var(--color-primary)', background: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 'inherit' }}
                    >
                      Créez votre première brique
                    </button>
                  </span>
                </div>
              ) : (
                allCustomBricks.map((brick) => (
                  <BrickChip
                    key={brick.id}
                    brick={brick}
                    onInsert={() => onInsertBrick(brick.content)}
                    onDelete={() => handleDeleteCustomBrick(brick.id)}
                    isDeletable
                  />
                ))
              )}
            </div>

            <div style={{ padding: '8px 10px', borderTop: '1px solid var(--color-border)', flexShrink: 0 }}>
              <button
                onClick={() => setShowCreateDialog(true)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: '6px', padding: '7px', borderRadius: 'var(--radius-md)',
                  border: '1.5px dashed var(--color-border)', background: 'transparent',
                  color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)', fontWeight: 500,
                  cursor: 'pointer', transition: 'all 0.12s',
                }}
                onMouseEnter={(e) => { const b = e.currentTarget; b.style.borderColor = 'var(--color-primary)'; b.style.color = 'var(--color-primary)' }}
                onMouseLeave={(e) => { const b = e.currentTarget; b.style.borderColor = 'var(--color-border)'; b.style.color = 'var(--color-text-muted)' }}
              >
                <Plus size={13} /> Créer une brique
              </button>
            </div>
          </>
        )}
      </div>

      {showCreateDialog && (
        <CreateBrickDialog
          onConfirm={handleCreateBrick}
          onCancel={() => setShowCreateDialog(false)}
        />
      )}
    </>
  )
}
