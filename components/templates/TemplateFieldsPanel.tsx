// components/templates/TemplateFieldsPanel.tsx
// Panneau latéral de gestion des champs/étiquettes d'un modèle.
// Permet de définir les variables qui seront à renseigner lors de la création d'un document.
'use client'

import { useState } from 'react'
import {
  Plus, Trash2, GripVertical, Tag,
  CalendarDays, User, MapPin, DollarSign, Clock, Hash, Type,
} from 'lucide-react'

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

interface TemplateFieldsPanelProps {
  fields: TemplateField[]
  onChange: (fields: TemplateField[]) => void
  onInsertVariable: (name: string) => void
}

const FIELD_TYPES: { value: FieldType; label: string; icon: React.ElementType; color: string }[] = [
  { value: 'text',      label: 'Texte libre',  icon: Type,         color: '#6b7280' },
  { value: 'name',      label: 'Nom / Prénom', icon: User,         color: '#01696f' },
  { value: 'date',      label: 'Date',         icon: CalendarDays, color: '#4f46e5' },
  { value: 'address',   label: 'Adresse',      icon: MapPin,       color: '#c2410c' },
  { value: 'price',     label: 'Montant',      icon: DollarSign,   color: '#15803d' },
  { value: 'duration',  label: 'Durée',        icon: Clock,        color: '#7c3aed' },
  { value: 'reference', label: 'Référence',    icon: Hash,         color: '#be185d' },
]

function generateId(): string {
  return Math.random().toString(36).slice(2, 9)
}

function slugify(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    || 'champ'
}

function FieldTypeIcon({ type, size = 12 }: { type: FieldType; size?: number }) {
  const def = FIELD_TYPES.find((f) => f.value === type) ?? FIELD_TYPES[0]
  const Icon = def.icon
  return <Icon size={size} style={{ color: def.color, flexShrink: 0 }} />
}

interface FieldRowProps {
  field: TemplateField
  onChange: (updated: TemplateField) => void
  onDelete: () => void
  onInsert: () => void
}

function FieldRow({ field, onChange, onDelete, onInsert }: FieldRowProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        marginBottom: '6px',
        overflow: 'hidden',
      }}
    >
      {/* Header de la ligne */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '7px 8px',
          cursor: 'pointer',
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <GripVertical size={12} style={{ color: 'var(--color-text-faint)', flexShrink: 0, cursor: 'grab' }} />
        <FieldTypeIcon type={field.type} />
        <span
          style={{
            flex: 1,
            fontSize: 'var(--text-xs)',
            fontWeight: 500,
            color: 'var(--color-text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {field.label || <em style={{ color: 'var(--color-text-muted)' }}>Sans nom</em>}
        </span>
        <span
          style={{
            fontSize: '10px',
            color: 'var(--color-text-faint)',
            fontFamily: 'monospace',
            background: 'var(--color-surface-offset)',
            padding: '1px 5px',
            borderRadius: 'var(--radius-sm)',
            flexShrink: 0,
          }}
        >
          [{field.name || '…'}]
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onInsert() }}
          title="Insérer dans le document"
          style={{
            padding: '2px 6px',
            fontSize: '10px',
            background: 'var(--color-primary)',
            color: '#fff',
            borderRadius: 'var(--radius-sm)',
            flexShrink: 0,
            fontWeight: 500,
          }}
        >
          + Insérer
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          title="Supprimer ce champ"
          style={{ padding: '2px', borderRadius: 'var(--radius-sm)', flexShrink: 0 }}
        >
          <Trash2 size={11} style={{ color: 'var(--color-error)' }} />
        </button>
      </div>

      {/* Détails expandés */}
      {expanded && (
        <div
          style={{
            padding: '8px 10px 10px',
            borderTop: '1px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '7px',
            background: 'var(--color-surface-offset)',
          }}
        >
          {/* Étiquette */}
          <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', display: 'flex', flexDirection: 'column', gap: '3px' }}>
            Étiquette
            <input
              value={field.label}
              onChange={(e) => {
                const newLabel = e.target.value
                onChange({
                  ...field,
                  label: newLabel,
                  name: slugify(newLabel),
                })
              }}
              placeholder="Ex : Nom du client"
              style={inputStyle}
            />
          </label>

          {/* Type */}
          <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', display: 'flex', flexDirection: 'column', gap: '3px' }}>
            Type
            <select
              value={field.type}
              onChange={(e) => onChange({ ...field, type: e.target.value as FieldType })}
              style={inputStyle}
            >
              {FIELD_TYPES.map((ft) => (
                <option key={ft.value} value={ft.value}>{ft.label}</option>
              ))}
            </select>
          </label>

          {/* Placeholder */}
          <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', display: 'flex', flexDirection: 'column', gap: '3px' }}>
            Texte d'aide
            <input
              value={field.placeholder}
              onChange={(e) => onChange({ ...field, placeholder: e.target.value })}
              placeholder="Ex : Entrez le nom complet du client"
              style={inputStyle}
            />
          </label>

          {/* Valeur par défaut */}
          <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', display: 'flex', flexDirection: 'column', gap: '3px' }}>
            Valeur par défaut
            <input
              value={field.defaultValue}
              onChange={(e) => onChange({ ...field, defaultValue: e.target.value })}
              placeholder="Optionnel"
              style={inputStyle}
            />
          </label>

          {/* Obligatoire */}
          <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={field.required}
              onChange={(e) => onChange({ ...field, required: e.target.checked })}
              style={{ width: '13px', height: '13px', accentColor: 'var(--color-primary)' }}
            />
            Champ obligatoire
          </label>
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '5px 8px',
  fontSize: 'var(--text-xs)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--color-text)',
  outline: 'none',
}

export function TemplateFieldsPanel({ fields, onChange, onInsertVariable }: TemplateFieldsPanelProps) {
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
  }

  function updateField(id: string, updated: TemplateField) {
    onChange(fields.map((f) => (f.id === id ? updated : f)))
  }

  function deleteField(id: string) {
    onChange(fields.filter((f) => f.id !== id))
  }

  return (
    <div
      style={{
        width: '280px',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        borderLeft: '1px solid var(--color-border)',
        background: 'var(--color-surface)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 14px 10px',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <Tag size={14} style={{ color: 'var(--color-primary)' }} />
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text)' }}>
            Champs du modèle
          </span>
        </div>
        <span
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-muted)',
            background: 'var(--color-surface-offset)',
            borderRadius: 'var(--radius-full)',
            padding: '1px 7px',
          }}
        >
          {fields.length}
        </span>
      </div>

      {/* Info */}
      <div
        style={{
          padding: '8px 14px',
          borderBottom: '1px solid var(--color-border)',
          fontSize: '11px',
          color: 'var(--color-text-muted)',
          lineHeight: 1.5,
          flexShrink: 0,
          background: 'var(--color-primary-highlight)',
        }}
      >
        Définissez ici les champs à renseigner lors de la création d'un document à partir de ce modèle.
        Cliquez sur <strong>+ Insérer</strong> pour placer un champ dans le texte.
      </div>

      {/* Liste des champs */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px 4px' }}>
        {fields.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '32px 16px',
              color: 'var(--color-text-faint)',
              fontSize: 'var(--text-xs)',
            }}
          >
            <Tag size={28} style={{ opacity: 0.2, margin: '0 auto 10px', display: 'block' }} />
            Aucun champ défini.
            <br />Créez votre premier champ ci-dessous.
          </div>
        )}
        {fields.map((field) => (
          <FieldRow
            key={field.id}
            field={field}
            onChange={(updated) => updateField(field.id, updated)}
            onDelete={() => deleteField(field.id)}
            onInsert={() => onInsertVariable(field.name)}
          />
        ))}
      </div>

      {/* Footer : ajouter un champ */}
      <div style={{ padding: '8px 10px', borderTop: '1px solid var(--color-border)', flexShrink: 0 }}>
        <button
          onClick={addField}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '7px',
            borderRadius: 'var(--radius-md)',
            border: '1.5px dashed var(--color-border)',
            background: 'transparent',
            color: 'var(--color-text-muted)',
            fontSize: 'var(--text-xs)',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all var(--transition-interactive)',
          }}
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-primary)'
            ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--color-primary)'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-border)'
            ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-muted)'
          }}
        >
          <Plus size={13} />
          Ajouter un champ
        </button>
      </div>
    </div>
  )
}
