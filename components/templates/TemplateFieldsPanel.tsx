// components/templates/TemplateFieldsPanel.tsx
'use client'

import { useEffect, useMemo, useState, useRef } from 'react'
import {
  Plus, Trash2, GripVertical, Tag,
  CalendarDays, User, MapPin, DollarSign, Clock, Hash, Type,
  Building2, Phone, Mail, Globe, CreditCard, FileText, Percent,
  Scale, Briefcase, ChevronDown, ChevronRight, Sparkles, GitBranch,
  Settings2,
} from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSetting } from '@/lib/db'
import {
  DEFAULT_CONDITIONAL_TAGS,
  type CondVar,
} from '@/lib/brick-variables'
import {
  FIELD_CATEGORIES,
  seedFieldDefsIfNeeded,
} from '@/lib/field-defs'
import { FieldsEditorModal } from '@/components/editor/FieldsEditorModal'
import type { FieldDef } from '@/types/field-def'

export type FieldType =
  | 'text'
  | 'name'
  | 'date'
  | 'address'
  | 'price'
  | 'duration'
  | 'reference'

export interface TemplateField {
  id: string
  name: string
  label: string
  type: FieldType
  defaultValue: string
  required: boolean
  placeholder: string
}

export interface PresetField {
  name: string
  label: string
  type: FieldType
  placeholder: string
  icon: React.ElementType
  color: string
}

interface TemplateFieldsPanelProps {
  fields: TemplateField[]
  onChange: (fields: TemplateField[]) => void
  onInsertVariable: (name: string) => void
  // appelé quand un preset est drag-droppé — retourne le nom de la variable insérée
  onDragStart?: (name: string, label: string) => void
}

// ─── Bibliothèque de champs courants ────────────────────────────────────────
export const PRESET_GROUPS: { group: string; color: string; items: PresetField[] }[] = [
  {
    group: 'Identité',
    color: '#01696f',
    items: [
      { name: 'nom',            label: 'Nom',                type: 'name',    placeholder: 'Ex : Dupont',           icon: User,       color: '#01696f' },
      { name: 'prenom',         label: 'Prénom',             type: 'name',    placeholder: 'Ex : Jean',              icon: User,       color: '#01696f' },
      { name: 'nom_complet',    label: 'Nom complet',        type: 'name',    placeholder: 'Ex : Jean Dupont',       icon: User,       color: '#01696f' },
      { name: 'civilite',       label: 'Civilité',           type: 'text',    placeholder: 'M. / Mme',               icon: User,       color: '#01696f' },
      { name: 'qualite',        label: 'Qualité / Fonction', type: 'text',    placeholder: 'Ex : Directeur général', icon: Briefcase,  color: '#01696f' },
      { name: 'date_naissance', label: 'Date de naissance',  type: 'date',    placeholder: 'Ex : 01/01/1980',        icon: CalendarDays, color: '#01696f' },
      { name: 'lieu_naissance', label: 'Lieu de naissance',  type: 'address', placeholder: 'Ex : Paris',             icon: MapPin,     color: '#01696f' },
      { name: 'nationalite',    label: 'Nationalité',        type: 'text',    placeholder: 'Ex : française',         icon: Globe,      color: '#01696f' },
    ],
  },
  {
    group: 'Coordonnées',
    color: '#c2410c',
    items: [
      { name: 'adresse',        label: 'Adresse',            type: 'address', placeholder: 'Ex : 12 rue de la Paix', icon: MapPin,     color: '#c2410c' },
      { name: 'code_postal',    label: 'Code postal',        type: 'text',    placeholder: 'Ex : 75001',             icon: MapPin,     color: '#c2410c' },
      { name: 'ville',          label: 'Ville',              type: 'address', placeholder: 'Ex : Paris',             icon: MapPin,     color: '#c2410c' },
      { name: 'pays',           label: 'Pays',               type: 'address', placeholder: 'Ex : France',            icon: Globe,      color: '#c2410c' },
      { name: 'telephone',      label: 'Téléphone',          type: 'text',    placeholder: 'Ex : 06 12 34 56 78',    icon: Phone,      color: '#c2410c' },
      { name: 'email',          label: 'Email',              type: 'text',    placeholder: 'Ex : jean@exemple.fr',   icon: Mail,       color: '#c2410c' },
    ],
  },
  {
    group: 'Société',
    color: '#7c3aed',
    items: [
      { name: 'nom_societe',    label: 'Nom de la société',  type: 'name',    placeholder: 'Ex : Acme SAS',          icon: Building2,  color: '#7c3aed' },
      { name: 'forme_juridique', label: 'Forme juridique',   type: 'text',    placeholder: 'Ex : SAS, SARL…',        icon: Scale,      color: '#7c3aed' },
      { name: 'siret',          label: 'SIRET',              type: 'reference', placeholder: 'Ex : 123 456 789 00012', icon: Hash,      color: '#7c3aed' },
      { name: 'rcs',            label: 'RCS',                type: 'reference', placeholder: 'Ex : RCS Paris 123…',   icon: Hash,      color: '#7c3aed' },
      { name: 'capital',        label: 'Capital social',     type: 'price',   placeholder: 'Ex : 10 000',            icon: DollarSign, color: '#7c3aed' },
      { name: 'adresse_siege',  label: 'Siège social',       type: 'address', placeholder: 'Ex : 1 place Vendôme…',  icon: Building2,  color: '#7c3aed' },
      { name: 'representant',   label: 'Représentant légal', type: 'name',    placeholder: 'Ex : Jean Dupont',       icon: User,       color: '#7c3aed' },
    ],
  },
  {
    group: 'Dates & Délais',
    color: '#4f46e5',
    items: [
      { name: 'date',           label: 'Date',               type: 'date',    placeholder: 'Ex : 16/04/2026',        icon: CalendarDays, color: '#4f46e5' },
      { name: 'date_signature', label: 'Date de signature',  type: 'date',    placeholder: 'Ex : 16/04/2026',        icon: CalendarDays, color: '#4f46e5' },
      { name: 'date_debut',     label: 'Date de début',      type: 'date',    placeholder: 'Ex : 01/05/2026',        icon: CalendarDays, color: '#4f46e5' },
      { name: 'date_fin',       label: 'Date de fin',        type: 'date',    placeholder: 'Ex : 30/04/2027',        icon: CalendarDays, color: '#4f46e5' },
      { name: 'duree',          label: 'Durée',              type: 'duration', placeholder: 'Ex : 12 mois',          icon: Clock,      color: '#4f46e5' },
      { name: 'delai',          label: 'Délai',              type: 'duration', placeholder: 'Ex : 15 jours',         icon: Clock,      color: '#4f46e5' },
      { name: 'lieu',           label: 'Lieu',               type: 'address', placeholder: 'Ex : Paris',             icon: MapPin,     color: '#4f46e5' },
    ],
  },
  {
    group: 'Financier',
    color: '#15803d',
    items: [
      { name: 'montant',        label: 'Montant',            type: 'price',   placeholder: 'Ex : 1 500',             icon: DollarSign, color: '#15803d' },
      { name: 'montant_ht',     label: 'Montant HT',         type: 'price',   placeholder: 'Ex : 1 500',             icon: DollarSign, color: '#15803d' },
      { name: 'montant_ttc',    label: 'Montant TTC',        type: 'price',   placeholder: 'Ex : 1 800',             icon: DollarSign, color: '#15803d' },
      { name: 'taux_tva',       label: 'Taux TVA',           type: 'text',    placeholder: 'Ex : 20%',               icon: Percent,    color: '#15803d' },
      { name: 'iban',           label: 'IBAN',               type: 'reference', placeholder: 'Ex : FR76…',           icon: CreditCard, color: '#15803d' },
      { name: 'modalites_paiement', label: 'Modalités de paiement', type: 'text', placeholder: 'Ex : virement 30 j.', icon: FileText, color: '#15803d' },
    ],
  },
  {
    group: 'Juridique',
    color: '#be185d',
    items: [
      { name: 'reference_dossier', label: 'Réf. dossier',   type: 'reference', placeholder: 'Ex : 2026-042',        icon: Hash,       color: '#be185d' },
      { name: 'numero_rg',      label: 'N° RG',             type: 'reference', placeholder: 'Ex : 26/00123',        icon: Hash,       color: '#be185d' },
      { name: 'tribunal',       label: 'Tribunal',           type: 'text',    placeholder: 'Ex : TJ de Paris',       icon: Scale,      color: '#be185d' },
      { name: 'ville_barreau',  label: 'Ville du barreau',   type: 'address', placeholder: 'Ex : Paris',             icon: Scale,      color: '#be185d' },
      { name: 'nom_avocat',     label: 'Nom de l\'avocat',   type: 'name',    placeholder: 'Ex : Me Dupont',         icon: User,       color: '#be185d' },
      { name: 'objet',          label: 'Objet du contrat',   type: 'text',    placeholder: 'Décrivez l\'objet…',     icon: FileText,   color: '#be185d' },
    ],
  },
]

// ─── Constantes de style ─────────────────────────────────────────────────────
const FIELD_TYPES: { value: FieldType; label: string; icon: React.ElementType; color: string }[] = [
  { value: 'text',      label: 'Texte libre',  icon: Type,         color: '#6b7280' },
  { value: 'name',      label: 'Nom / Prénom', icon: User,         color: '#01696f' },
  { value: 'date',      label: 'Date',         icon: CalendarDays, color: '#4f46e5' },
  { value: 'address',   label: 'Adresse',      icon: MapPin,       color: '#c2410c' },
  { value: 'price',     label: 'Montant',      icon: DollarSign,   color: '#15803d' },
  { value: 'duration',  label: 'Durée',        icon: Clock,        color: '#7c3aed' },
  { value: 'reference', label: 'Référence',    icon: Hash,         color: '#be185d' },
]

export const DRAG_FIELD_KEY = 'application/x-mylaw-field'

function generateId(): string {
  return Math.random().toString(36).slice(2, 9)
}

function slugify(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase() || 'champ'
}

function FieldTypeIcon({ type, size = 12 }: { type: FieldType; size?: number }) {
  const def = FIELD_TYPES.find((f) => f.value === type) ?? FIELD_TYPES[0]
  const Icon = def.icon
  return <Icon size={size} style={{ color: def.color, flexShrink: 0 }} />
}

// ─── Chip d'un champ preset (bibliothèque) ───────────────────────────────────
function PresetChip({
  preset,
  onInsert,
  draggable = true,
}: {
  preset: PresetField
  onInsert: () => void
  /** Permet de désactiver le drag pour les chips qui ne doivent pas être
   *  ajoutés à `template.fields` (variables conditionnelles notamment,
   *  résolues au rendu depuis un contact et non depuis un champ saisi). */
  draggable?: boolean
}) {
  const Icon = preset.icon
  const [hovered, setHovered] = useState(false)

  function handleDragStart(e: React.DragEvent) {
    if (!draggable) { e.preventDefault(); return }
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData(DRAG_FIELD_KEY, JSON.stringify({ name: preset.name, label: preset.label, type: preset.type, placeholder: preset.placeholder }))
    // Crée un ghost propre
    const ghost = document.createElement('div')
    ghost.textContent = `[${preset.label}]`
    ghost.style.cssText = `position:fixed;top:-999px;padding:3px 8px;border-radius:4px;font-size:12px;font-weight:500;color:${preset.color};background:${preset.color}15;border:1.5px solid ${preset.color};font-family:monospace;pointer-events:none;`
    document.body.appendChild(ghost)
    e.dataTransfer.setDragImage(ghost, 0, 0)
    setTimeout(() => ghost.remove(), 0)
  }

  return (
    <div
      draggable={draggable}
      onDragStart={handleDragStart}
      onClick={onInsert}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={draggable ? `Cliquer pour insérer · Glisser dans le document` : 'Cliquer pour insérer'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '3px 8px 3px 5px',
        borderRadius: '20px',
        border: `1.5px solid ${hovered ? preset.color : preset.color + '60'}`,
        background: hovered ? preset.color + '18' : preset.color + '0c',
        color: preset.color,
        fontSize: '11px',
        fontWeight: 500,
        cursor: draggable ? 'grab' : 'pointer',
        userSelect: 'none',
        transition: 'all 0.12s ease',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      <Icon size={10} style={{ flexShrink: 0 }} />
      {preset.label}
    </div>
  )
}

// ─── Groupe de presets (accordion) ───────────────────────────────────────────
function PresetGroup({
  group,
  color,
  items,
  onInsert,
  defaultOpen,
  draggable = true,
}: {
  group: string
  color: string
  items: PresetField[]
  onInsert: (preset: PresetField) => void
  defaultOpen: boolean
  /** Propage l'option à chaque chip du groupe (cf. PresetChip.draggable). */
  draggable?: boolean
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
          ? <ChevronDown size={10} style={{ color, flexShrink: 0 }} />
          : <ChevronRight size={10} style={{ color, flexShrink: 0 }} />}
        <span style={{ color }}>{group}</span>
      </button>
      {open && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', paddingBottom: '6px', paddingLeft: '2px' }}>
          {items.map((item) => (
            <PresetChip
              key={item.name}
              preset={item}
              onInsert={() => onInsert(item)}
              draggable={draggable}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Ligne d'un champ personnalisé ───────────────────────────────────────────
interface FieldRowProps {
  field: TemplateField
  onChange: (updated: TemplateField) => void
  onDelete: () => void
  onInsert: () => void
}

function FieldRow({ field, onChange, onDelete, onInsert }: FieldRowProps) {
  const [expanded, setExpanded] = useState(false)

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData(DRAG_FIELD_KEY, JSON.stringify({ name: field.name, label: field.label, type: field.type, placeholder: field.placeholder }))
    const ghost = document.createElement('div')
    ghost.textContent = `[${field.label}]`
    ghost.style.cssText = `position:fixed;top:-999px;padding:3px 8px;border-radius:4px;font-size:12px;font-weight:500;color:#01696f;background:#01696f15;border:1.5px solid #01696f;font-family:monospace;pointer-events:none;`
    document.body.appendChild(ghost)
    e.dataTransfer.setDragImage(ghost, 0, 0)
    setTimeout(() => ghost.remove(), 0)
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        marginBottom: '5px',
        overflow: 'hidden',
        cursor: 'grab',
      }}
    >
      <div
        style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 8px', cursor: 'pointer' }}
        onClick={() => setExpanded((v) => !v)}
      >
        <GripVertical size={11} style={{ color: 'var(--color-text-faint)', flexShrink: 0 }} />
        <FieldTypeIcon type={field.type} />
        <span style={{ flex: 1, fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {field.label || <em style={{ color: 'var(--color-text-muted)' }}>Sans nom</em>}
        </span>
        <span style={{ fontSize: '10px', color: 'var(--color-text-faint)', fontFamily: 'monospace', background: 'var(--color-surface-offset)', padding: '1px 4px', borderRadius: '3px', flexShrink: 0 }}>
          [{field.name || '…'}]
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onInsert() }}
          title="Insérer dans le document"
          style={{ padding: '2px 6px', fontSize: '10px', background: 'var(--color-primary)', color: '#fff', borderRadius: 'var(--radius-sm)', flexShrink: 0, fontWeight: 500 }}
        >
          + Insérer
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          style={{ padding: '2px', borderRadius: 'var(--radius-sm)', flexShrink: 0 }}
        >
          <Trash2 size={11} style={{ color: 'var(--color-error)' }} />
        </button>
      </div>

      {expanded && (
        <div style={{ padding: '8px 10px 10px', borderTop: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '7px', background: 'var(--color-surface-offset)' }}>
          <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', display: 'flex', flexDirection: 'column', gap: '3px' }}>
            Étiquette
            <input
              value={field.label}
              onChange={(e) => { const l = e.target.value; onChange({ ...field, label: l, name: slugify(l) }) }}
              placeholder="Ex : Nom du client"
              style={inputStyle}
            />
          </label>
          <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', display: 'flex', flexDirection: 'column', gap: '3px' }}>
            Type
            <select value={field.type} onChange={(e) => onChange({ ...field, type: e.target.value as FieldType })} style={inputStyle}>
              {FIELD_TYPES.map((ft) => <option key={ft.value} value={ft.value}>{ft.label}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', display: 'flex', flexDirection: 'column', gap: '3px' }}>
            Texte d'aide
            <input value={field.placeholder} onChange={(e) => onChange({ ...field, placeholder: e.target.value })} placeholder="Optionnel" style={inputStyle} />
          </label>
          <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', display: 'flex', flexDirection: 'column', gap: '3px' }}>
            Valeur par défaut
            <input value={field.defaultValue} onChange={(e) => onChange({ ...field, defaultValue: e.target.value })} placeholder="Optionnel" style={inputStyle} />
          </label>
          <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input type="checkbox" checked={field.required} onChange={(e) => onChange({ ...field, required: e.target.checked })} style={{ width: '13px', height: '13px', accentColor: 'var(--color-primary)' }} />
            Champ obligatoire
          </label>
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '5px 8px', fontSize: 'var(--text-xs)',
  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', outline: 'none',
}

// ─── Composant principal ─────────────────────────────────────────────────────
export function TemplateFieldsPanel({ fields, onChange, onInsertVariable, onDragStart }: TemplateFieldsPanelProps) {
  const [tab, setTab] = useState<'library' | 'custom'>('library')

  function addField() {
    const newField: TemplateField = {
      id: generateId(),
      name: `champ_${fields.length + 1}`,
      label: `Champ ${fields.length + 1}`,
      type: 'text',
      defaultValue: '',
      required: false,
      placeholder: '',
    }
    onChange([...fields, newField])
    setTab('custom')
  }

  function addFromPreset(preset: PresetField) {
    // Insère la variable dans l'éditeur directement
    onInsertVariable(preset.name)
    // Ajoute aussi le champ au modèle s'il n'existe pas déjà
    const exists = fields.some((f) => f.name === preset.name)
    if (!exists) {
      const newField: TemplateField = {
        id: generateId(),
        name: preset.name,
        label: preset.label,
        type: preset.type,
        defaultValue: '',
        required: false,
        placeholder: preset.placeholder,
      }
      onChange([...fields, newField])
    }
  }

  function updateField(id: string, updated: TemplateField) {
    onChange(fields.map((f) => (f.id === id ? updated : f)))
  }

  function deleteField(id: string) {
    onChange(fields.filter((f) => f.id !== id))
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
    <div style={{ width: '288px', flexShrink: 0, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border)', background: 'var(--color-surface)', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '10px 14px 0', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Tag size={13} style={{ color: 'var(--color-primary)' }} />
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text)' }}>Champs</span>
          </div>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', background: 'var(--color-surface-offset)', borderRadius: 'var(--radius-full)', padding: '1px 7px' }}>
            {fields.length} dans le modèle
          </span>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', marginLeft: '-14px', marginRight: '-14px', paddingLeft: '14px', paddingRight: '14px' }}>
          <button style={tabStyle(tab === 'library')} onClick={() => setTab('library')}>
            <Sparkles size={11} /> Bibliothèque
          </button>
          <button style={tabStyle(tab === 'custom')} onClick={() => setTab('custom')}>
            <Tag size={11} /> Mes champs
            {fields.length > 0 && (
              <span style={{ background: 'var(--color-primary)', color: '#fff', borderRadius: '10px', fontSize: '9px', padding: '0 5px', fontWeight: 700 }}>{fields.length}</span>
            )}
          </button>
        </div>
      </div>

      {/* Contenu onglet Bibliothèque */}
      {tab === 'library' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
          {/* Légende */}
          <p style={{ fontSize: '10px', color: 'var(--color-text-faint)', marginBottom: '10px', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--color-text-muted)' }}>Cliquer</strong> pour insérer au curseur ·
            <strong style={{ color: 'var(--color-text-muted)' }}> Glisser</strong> dans le document
          </p>
          {PRESET_GROUPS.map((g, i) => (
            <PresetGroup
              key={g.group}
              group={g.group}
              color={g.color}
              items={g.items}
              onInsert={addFromPreset}
              defaultOpen={i === 0}
            />
          ))}
        </div>
      )}

      {/* Contenu onglet Mes champs */}
      {tab === 'custom' && (
        <>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px 4px' }}>
            {fields.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '28px 16px', color: 'var(--color-text-faint)', fontSize: 'var(--text-xs)' }}>
                <Tag size={26} style={{ opacity: 0.15, margin: '0 auto 10px', display: 'block' }} />
                Aucun champ personnalisé.
                <br />
                <span style={{ color: 'var(--color-text-muted)' }}>Utilisez la <button onClick={() => setTab('library')} style={{ color: 'var(--color-primary)', background: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 'inherit' }}>bibliothèque</button> ou créez un champ.</span>
              </div>
            ) : (
              fields.map((field) => (
                <FieldRow
                  key={field.id}
                  field={field}
                  onChange={(u) => updateField(field.id, u)}
                  onDelete={() => deleteField(field.id)}
                  onInsert={() => onInsertVariable(field.name)}
                />
              ))
            )}
          </div>

          <div style={{ padding: '8px 10px', borderTop: '1px solid var(--color-border)', flexShrink: 0 }}>
            <button
              onClick={addField}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: '6px', padding: '7px', borderRadius: 'var(--radius-md)',
                border: '1.5px dashed var(--color-border)', background: 'transparent',
                color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)', fontWeight: 500,
                cursor: 'pointer', transition: 'all 0.12s',
              }}
              onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = 'var(--color-primary)'; b.style.color = 'var(--color-primary)' }}
              onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = 'var(--color-border)'; b.style.color = 'var(--color-text-muted)' }}
            >
              <Plus size={13} /> Créer un champ personnalisé
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Contenu à plat pour embarquer les champs dans un autre conteneur ─────
/**
 * Rendu 100 % chips arrondies pour l'onglet « Champs » : « Mes champs »,
 * groupes de la bibliothèque de presets, et « Conditionnels » (variables
 * `[M/Mme]`, `[né/née]`… partagées avec l'éditeur de briques). Aucun chip
 * n'expose de bouton d'action : le clic insère la variable au curseur,
 * le glisser-déposer l'insère au point de chute (sauf pour les
 * conditionnelles, volontairement non-draggable car elles ne sont pas des
 * champs saisis — elles se résolvent au rendu depuis le contact).
 *
 * Le bouton « + Créer un champ personnalisé » est épinglé en pied. Aucun
 * bouton « supprimer » n'est affiché dans cette vue (pour alléger l'UI) ;
 * un champ non utilisé finira par disparaître quand on supprimera sa
 * variable dans le document.
 */
export function FieldsTabContent({
  fields,
  onChange,
  onInsertVariable,
}: Pick<TemplateFieldsPanelProps, 'fields' | 'onChange' | 'onInsertVariable'>) {
  const [editorOpen, setEditorOpen] = useState(false)

  // Seed des définitions de champs au premier montage, puis lecture live.
  useEffect(() => { void seedFieldDefsIfNeeded() }, [])
  const fieldDefs = useLiveQuery<FieldDef[]>(() => db.fieldDefs.toArray(), []) ?? []

  // Icône en fonction du type de champ — réutilise le mapping existant.
  function iconForDef(def: FieldDef): React.ElementType {
    if (def.type === 'conditional') return GitBranch
    const t = FIELD_TYPES.find((ft) => ft.value === def.type)
    return t?.icon ?? Type
  }

  // Groupe les définitions par catégorie selon l'ordre de FIELD_CATEGORIES,
  // avec tout le contenu rendu en chips arrondies (seeds + user-created
  // indistinctement, sauf les conditionnels non-draggable).
  const groupedDefs = useMemo(() => {
    const byCat = new Map<string, FieldDef[]>()
    for (const f of fieldDefs) {
      const key = f.category || 'custom'
      if (!byCat.has(key)) byCat.set(key, [])
      byCat.get(key)!.push(f)
    }
    return FIELD_CATEGORIES
      .map((c) => ({ cat: c, defs: byCat.get(c.id) ?? [] }))
      .filter((g) => g.defs.length > 0)
  }, [fieldDefs])

  function addFromPreset(preset: PresetField) {
    onInsertVariable(preset.name)
    const exists = fields.some((f) => f.name === preset.name)
    if (!exists) {
      const newField: TemplateField = {
        id: generateId(),
        name: preset.name,
        label: preset.label,
        type: preset.type,
        defaultValue: '',
        required: false,
        placeholder: preset.placeholder,
      }
      onChange([...fields, newField])
    }
  }

  function defToPreset(def: FieldDef): PresetField {
    const fallback = FIELD_TYPES.find((ft) => ft.value === def.type)
    return {
      name: def.name,
      label: def.label,
      // Pour les conditionnels, on repasse sur 'text' côté TemplateField :
      // ils ne sont pas des champs saisis dans le form de document.
      type: def.type === 'conditional' ? 'text' : (def.type as FieldType),
      placeholder: def.placeholder ?? '',
      icon: iconForDef(def),
      color: def.color || fallback?.color || '#6b7280',
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
        <p style={{ fontSize: '10px', color: 'var(--color-text-faint)', margin: '0 0 10px', lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--color-text-muted)' }}>Cliquer</strong> pour insérer au curseur ·{' '}
          <strong style={{ color: 'var(--color-text-muted)' }}>Glisser</strong> dans le document
        </p>

        {groupedDefs.map(({ cat, defs }, i) => (
          <PresetGroup
            key={cat.id}
            group={cat.label}
            color={cat.color}
            items={defs.map(defToPreset)}
            onInsert={(p) => {
              // Conditionnel → simple insertion, sans ajout à template.fields.
              const def = defs.find((d) => d.name === p.name)
              if (def?.type === 'conditional') { onInsertVariable(p.name); return }
              addFromPreset(p)
            }}
            defaultOpen={i === 0}
            draggable={cat.id !== 'conditional'}
          />
        ))}
      </div>

      <div style={{ padding: '8px 10px', borderTop: '1px solid var(--color-border)', flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => setEditorOpen(true)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '6px', padding: '7px', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)', background: 'var(--color-surface-offset)',
            color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)', fontWeight: 500,
            cursor: 'pointer', transition: 'all 0.12s',
          }}
          onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = 'var(--color-primary)'; b.style.color = 'var(--color-primary)' }}
          onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = 'var(--color-border)'; b.style.color = 'var(--color-text-muted)' }}
        >
          <Settings2 size={12} /> Éditeur de champs
        </button>
      </div>

      <FieldsEditorModal open={editorOpen} onClose={() => setEditorOpen(false)} />
    </div>
  )
}
