// components/editor/FieldsEditorModal.tsx
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Settings2, Plus, Tag, Trash2, Check, X, Search,
} from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'

import { db } from '@/lib/db'
import {
  FIELD_CATEGORIES, FIELD_TYPE_LABELS,
  createFieldDef, updateFieldDef, deleteFieldDef,
  findCategory, slugifyFieldName,
} from '@/lib/field-defs'
import type { FieldDef, FieldDefType } from '@/types/field-def'

/* ─── Palette de couleurs (reprise de DocumentBricksPanel) ─────────────── */

const COLOR_OPTIONS = [
  '#01696f', '#c2410c', '#7c3aed', '#be185d',
  '#15803d', '#4f46e5', '#6d28d9', '#6b7280',
  '#FF6B00',
]

/* ─── Props ─────────────────────────────────────────────────────────────── */

interface FieldsEditorModalProps {
  open: boolean
  onClose: () => void
}

/* ─── Modale principale ─────────────────────────────────────────────────── */

export function FieldsEditorModal({ open, onClose }: FieldsEditorModalProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [isCreating,   setIsCreating] = useState(false)
  const [search,       setSearch]     = useState('')
  const [filterCat,    setFilterCat]  = useState<string>('all')
  const [justSaved,    setJustSaved]  = useState<'created' | 'updated' | null>(null)

  const fieldDefs = useLiveQuery<FieldDef[]>(
    () => (open ? db.fieldDefs.toArray() : Promise.resolve([])),
    [open],
  ) ?? []

  const selected = fieldDefs.find((f) => f.id === selectedId) ?? null

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  function flashSaved(kind: 'created' | 'updated') {
    setJustSaved(kind)
    setTimeout(() => setJustSaved((v) => (v === kind ? null : v)), 2000)
  }

  const handleCreate = useCallback(async (draft: FieldDraft) => {
    const newId = await createFieldDef({
      label: draft.label.trim() || 'Champ sans titre',
      name: draft.name.trim() || slugifyFieldName(draft.label),
      type: draft.type,
      color: draft.color,
      category: draft.category,
      placeholder: draft.placeholder || undefined,
      required: false,
      conditionalA: draft.type === 'conditional' ? draft.conditionalA : undefined,
      conditionalB: draft.type === 'conditional' ? draft.conditionalB : undefined,
    })
    setSelectedId(newId)
    setIsCreating(false)
    flashSaved('created')
  }, [])

  const handleUpdate = useCallback(async (id: number, draft: FieldDraft) => {
    await updateFieldDef(id, {
      label: draft.label.trim() || 'Champ sans titre',
      name: draft.name.trim() || slugifyFieldName(draft.label),
      type: draft.type,
      color: draft.color,
      category: draft.category,
      placeholder: draft.placeholder || undefined,
      conditionalA: draft.type === 'conditional' ? draft.conditionalA : undefined,
      conditionalB: draft.type === 'conditional' ? draft.conditionalB : undefined,
    })
    flashSaved('updated')
  }, [])

  const handleDelete = useCallback(async (id: number) => {
    const target = fieldDefs.find((f) => f.id === id)
    if (target?.isSeed) {
      if (!confirm('Ce champ fait partie de la bibliothèque par défaut. Le supprimer le retirera pour de bon. Continuer ?')) return
    } else {
      if (!confirm('Supprimer ce champ ?')) return
    }
    await deleteFieldDef(id)
    if (selectedId === id) setSelectedId(null)
  }, [fieldDefs, selectedId])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return fieldDefs.filter((f) => {
      if (filterCat !== 'all' && f.category !== filterCat) return false
      if (!q) return true
      return f.label.toLowerCase().includes(q) || f.name.toLowerCase().includes(q)
    })
  }, [fieldDefs, search, filterCat])

  if (!open) return null

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 210, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }} />

      <div
        style={{ position: 'relative', zIndex: 10, width: 980, maxWidth: 'calc(100vw - 32px)', height: 700, maxHeight: 'calc(100vh - 48px)', borderRadius: 16, background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: '0 24px 80px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--color-primary)18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Tag size={16} style={{ color: 'var(--color-primary)' }} />
            </div>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>Éditeur de champs</h2>
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: 0 }}>
                {fieldDefs.length} champ{fieldDefs.length > 1 ? 's' : ''} · {FIELD_CATEGORIES.length} catégories
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {justSaved && (
              <span
                role="status" aria-live="polite"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 'var(--radius-full)', background: '#dcfce7', color: '#15803d' }}
              >
                <Check size={11} /> {justSaved === 'created' ? 'Champ créé' : 'Enregistré'}
              </span>
            )}
            <button
              onClick={onClose}
              style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--color-border)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}
              title="Fermer (Échap)"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Sidebar */}
          <aside style={{ width: 340, flexShrink: 0, borderRight: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: 12, borderBottom: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', top: 8, left: 9, color: 'var(--color-text-muted)' }} />
                <input
                  type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher un champ…"
                  style={{ width: '100%', padding: '6px 10px 6px 28px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg)', fontSize: 12, color: 'var(--color-text)', outline: 'none' }}
                />
              </div>
              <select
                value={filterCat} onChange={(e) => setFilterCat(e.target.value)}
                style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg)', fontSize: 12, color: 'var(--color-text)', outline: 'none' }}
              >
                <option value="all">Toutes les catégories</option>
                {FIELD_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              {filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--color-text-faint)', fontSize: 12 }}>
                  <Tag size={26} style={{ opacity: 0.15, margin: '0 auto 10px', display: 'block' }} />
                  Aucun champ
                </div>
              ) : (
                filtered.map((f) => (
                  <FieldRow
                    key={f.id}
                    field={f}
                    isSelected={!isCreating && selectedId === f.id}
                    onSelect={() => { setIsCreating(false); setSelectedId(f.id ?? null) }}
                  />
                ))
              )}
            </div>

            <div style={{ padding: 10, borderTop: '1px solid var(--color-border)', flexShrink: 0 }}>
              <button
                onClick={() => { setIsCreating(true); setSelectedId(null) }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: 8, borderRadius: 8,
                  border: `1.5px dashed ${isCreating ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  background: isCreating ? 'var(--color-primary-highlight)' : 'transparent',
                  color: isCreating ? 'var(--color-primary)' : 'var(--color-text-muted)',
                  fontSize: 12, fontWeight: 500, cursor: 'pointer',
                }}
              >
                <Plus size={13} /> Nouveau champ
              </button>
            </div>
          </aside>

          {/* Form */}
          <section style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {isCreating ? (
              <FieldForm
                key="__new__"
                initial={null}
                onCancel={() => setIsCreating(false)}
                onSubmit={handleCreate}
              />
            ) : selected ? (
              <FieldForm
                key={selected.id}
                initial={selected}
                onCancel={() => setSelectedId(null)}
                onSubmit={(draft) => handleUpdate(selected.id!, draft)}
                onDelete={() => handleDelete(selected.id!)}
              />
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--color-text-faint)' }}>
                <Settings2 size={40} style={{ opacity: 0.12 }} />
                <p style={{ fontSize: 13, textAlign: 'center', maxWidth: 300, lineHeight: 1.6 }}>
                  Sélectionnez un champ pour le modifier, ou créez-en un nouveau.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

/* ─── Ligne de la liste ─────────────────────────────────────────────────── */

function FieldRow({
  field, isSelected, onSelect,
}: {
  field: FieldDef
  isSelected: boolean
  onSelect: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const cat = findCategory(field.category)

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 12px', cursor: 'pointer',
        background: isSelected ? `${field.color}14` : hovered ? 'var(--color-surface-offset)' : 'transparent',
        borderLeft: `3px solid ${isSelected ? field.color : 'transparent'}`,
        transition: 'all 0.1s',
      }}
    >
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '2px 7px 2px 6px', borderRadius: 20,
          border: `1.5px solid ${field.color}60`, background: `${field.color}12`,
          color: field.color, fontSize: 11, fontWeight: 500, flexShrink: 0, whiteSpace: 'nowrap',
        }}
      >
        {field.label}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: 10, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {FIELD_TYPE_LABELS[field.type]} · {cat.label}
        </span>
      </div>
      {field.isSeed && (
        <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 10, background: 'var(--color-surface-offset)', color: 'var(--color-text-muted)', fontWeight: 600 }}>
          par défaut
        </span>
      )}
    </div>
  )
}

/* ─── Formulaire d'édition ──────────────────────────────────────────────── */

interface FieldDraft {
  label: string
  name: string
  type: FieldDefType
  color: string
  category: string
  placeholder: string
  conditionalA: string
  conditionalB: string
}

function FieldForm({
  initial, onCancel, onSubmit, onDelete,
}: {
  initial: FieldDef | null
  onCancel: () => void
  onSubmit: (draft: FieldDraft) => void | Promise<void>
  onDelete?: () => void
}) {
  const [label,        setLabel]        = useState(initial?.label ?? '')
  const [name,         setName]         = useState(initial?.name ?? '')
  const [type,         setType]         = useState<FieldDefType>(initial?.type ?? 'text')
  const [color,        setColor]        = useState(initial?.color ?? COLOR_OPTIONS[0])
  const [category,     setCategory]     = useState(initial?.category ?? 'custom')
  const [placeholder,  setPlaceholder]  = useState(initial?.placeholder ?? '')
  const [conditionalA, setConditionalA] = useState(initial?.conditionalA ?? '')
  const [conditionalB, setConditionalB] = useState(initial?.conditionalB ?? '')
  const nameTouched = useRef(!!initial)

  // Dérive le `name` du libellé tant que l'utilisateur ne l'a pas édité.
  useEffect(() => {
    if (nameTouched.current) return
    setName(slugifyFieldName(label))
  }, [label])

  const canSave = label.trim().length > 0 && (type !== 'conditional' || (conditionalA.trim() && conditionalB.trim()))

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSave) return
    onSubmit({ label, name, type, color, category, placeholder, conditionalA, conditionalB })
  }

  return (
    <form onSubmit={submit} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Libellé */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Libellé</span>
          <input
            type="text" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus
            placeholder="Ex : Nom du client"
            style={inputStyle}
          />
        </label>

        {/* Identifiant (name) */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Identifiant de la variable <span style={{ fontWeight: 400, textTransform: 'none', color: 'var(--color-text-faint)', marginLeft: 4 }}>(insérée comme <code>[{name || 'identifiant'}]</code>)</span>
          </span>
          <input
            type="text" value={name}
            onChange={(e) => { nameTouched.current = true; setName(e.target.value) }}
            placeholder="nom_client"
            style={{ ...inputStyle, fontFamily: 'monospace' }}
          />
        </label>

        {/* Type */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as FieldDefType)}
            style={inputStyle}
          >
            {(Object.entries(FIELD_TYPE_LABELS) as [FieldDefType, string][]).map(([val, labelTxt]) => (
              <option key={val} value={val}>{labelTxt}</option>
            ))}
          </select>
        </label>

        {/* Conditionnel : deux options */}
        {type === 'conditional' && (
          <div style={{ display: 'flex', gap: 10 }}>
            <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Option A</span>
              <input
                type="text" value={conditionalA} onChange={(e) => setConditionalA(e.target.value)}
                placeholder="M"
                style={inputStyle}
              />
            </label>
            <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Option B</span>
              <input
                type="text" value={conditionalB} onChange={(e) => setConditionalB(e.target.value)}
                placeholder="Mme"
                style={inputStyle}
              />
            </label>
          </div>
        )}

        {/* Catégorie */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Catégorie</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
            {FIELD_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </label>

        {/* Couleur */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Couleur</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {COLOR_OPTIONS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: c,
                  border: color === c ? `2px solid var(--color-text)` : '2px solid transparent',
                  cursor: 'pointer',
                }}
                title={c}
              />
            ))}
          </div>
        </div>

        {/* Placeholder */}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Texte d'aide (facultatif)</span>
          <input
            type="text" value={placeholder} onChange={(e) => setPlaceholder(e.target.value)}
            placeholder="Ex : Jean Dupont"
            style={inputStyle}
          />
        </label>

        {/* Aperçu */}
        <div style={{ marginTop: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Aperçu</span>
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 10px', borderRadius: 20,
                border: `1.5px solid ${color}`, background: `${color}12`,
                color, fontSize: 11, fontWeight: 500,
              }}
            >
              {label || 'Libellé…'}
            </span>
            <span style={{ fontSize: 10, color: 'var(--color-text-faint)' }}>
              → s'insère comme <code style={{ background: 'var(--color-surface-offset)', padding: '0 4px', borderRadius: 3 }}>[{name || 'identifiant'}]</code>
            </span>
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div style={{ flexShrink: 0, padding: '12px 22px', borderTop: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div>
          {onDelete && (
            <button
              type="button" onClick={onDelete}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8, border: '1px solid #ef4444', background: 'transparent', color: '#ef4444', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
            >
              <Trash2 size={12} /> Supprimer
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button" onClick={onCancel}
            style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface-offset)', color: 'var(--color-text-muted)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
          >Annuler</button>
          <button
            type="submit" disabled={!canSave}
            style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: 'var(--color-primary)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: canSave ? 'pointer' : 'not-allowed', opacity: canSave ? 1 : 0.5 }}
          >Enregistrer</button>
        </div>
      </div>
    </form>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', fontSize: 13,
  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
  borderRadius: 6, color: 'var(--color-text)', outline: 'none',
}
