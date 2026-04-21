// components/templates/ClausesPanel.tsx
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { Shapes, Plus, Pencil, Unlink2, Link2, AlertTriangle } from 'lucide-react'

import {
  collectDependencyRefs,
  parseDependencyExpr,
  serializeDependencyExpr,
  type ClauseDependencyExpr,
  type ClauseType,
} from '@/lib/clause-engine'

interface ClauseInDoc {
  id: string
  label: string
  type: ClauseType
  defaultChecked: boolean
  dependsOn: ClauseDependencyExpr | null
  /** Position TipTap du nœud (début). */
  pos: number
}

interface ClausesPanelProps {
  editor: Editor | null
  onChanged: () => void
}

const TYPE_STYLES: Record<ClauseType, { color: string; bg: string; label: string }> = {
  required:    { color: '#01696f', bg: 'rgba(1,105,111,0.08)', label: 'Obligatoire' },
  optional:    { color: '#b45309', bg: 'rgba(180,83,9,0.08)', label: 'Optionnelle' },
  conditional: { color: '#6d28d9', bg: 'rgba(109,40,217,0.08)', label: 'Conditionnelle' },
}

/** Slugifie un libellé pour en faire un `clauseId` stable et humain. */
function slugify(s: string): string {
  return s
    .normalize('NFD').replace(/[\u0300-\u036F]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'clause'
}

function uniqueId(base: string, existing: Iterable<string>): string {
  const set = new Set(existing)
  if (!set.has(base)) return base
  let i = 2
  while (set.has(`${base}-${i}`)) i++
  return `${base}-${i}`
}

export function ClausesPanel({ editor, onChanged }: ClausesPanelProps) {
  const [, forceTick] = useState(0)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  // Rafraîchit le panneau à chaque transaction de l'éditeur (création /
  // suppression / modification d'attrs de ClauseBlock).
  useEffect(() => {
    if (!editor) return
    const onUpdate = () => forceTick((n) => (n + 1) % 1_000_000)
    editor.on('update', onUpdate)
    editor.on('selectionUpdate', onUpdate)
    return () => {
      editor.off('update', onUpdate)
      editor.off('selectionUpdate', onUpdate)
    }
  }, [editor])

  const clauses = useMemo<ClauseInDoc[]>(() => {
    if (!editor) return []
    const out: ClauseInDoc[] = []
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name !== 'clauseBlock') return true
      const attrs = node.attrs as Record<string, unknown>
      out.push({
        id: String(attrs.clauseId ?? ''),
        label: String(attrs.clauseLabel ?? attrs.clauseId ?? ''),
        type: (attrs.clauseType as ClauseType) ?? 'required',
        defaultChecked: !!attrs.defaultChecked,
        dependsOn: parseDependencyExpr(attrs.dependsOn as string | null),
        pos,
      })
      return false
    })
    return out
  }, [editor, editor?.state])

  const existingIds = useMemo(() => clauses.map((c) => c.id), [clauses])

  const handleCreate = useCallback(
    (form: ClauseFormValue) => {
      if (!editor) return
      const baseId = form.id.trim() ? slugify(form.id) : slugify(form.label)
      const id = uniqueId(baseId, existingIds)
      editor
        .chain()
        .focus()
        .wrapInClauseBlock({
          clauseId: id,
          clauseLabel: form.label.trim() || id,
          clauseType: form.type,
          defaultChecked: form.defaultChecked,
          dependsOn: serializeDependencyExpr(form.dependsOn),
        })
        .run()
      setCreating(false)
      onChanged()
    },
    [editor, existingIds, onChanged],
  )

  const handleUpdate = useCallback(
    (originalId: string, form: ClauseFormValue) => {
      if (!editor) return
      // Place la sélection dans la clause visée puis met à jour ses attrs.
      const target = clauses.find((c) => c.id === originalId)
      if (!target) return
      editor.chain()
        // Positionne le curseur dans le premier enfant de la clause visée
        // avant de mettre à jour ses attributs (updateAttributes remonte vers
        // l'ancêtre clauseBlock le plus proche).
        .setTextSelection(target.pos + 1)
        .updateClauseBlockAttrs({
          clauseId: originalId, // on ne renomme pas l'id (évite de casser les dépendances)
          clauseLabel: form.label.trim() || originalId,
          clauseType: form.type,
          defaultChecked: form.defaultChecked,
          dependsOn: serializeDependencyExpr(form.dependsOn),
        })
        .run()
      setEditingId(null)
      onChanged()
    },
    [editor, clauses, onChanged],
  )

  const handleUnwrap = useCallback(
    (id: string) => {
      if (!editor) return
      const target = clauses.find((c) => c.id === id)
      if (!target) return
      editor.chain()
        .setTextSelection(target.pos + 1)
        .unwrapClauseBlock()
        .run()
      onChanged()
    },
    [editor, clauses, onChanged],
  )

  const selectionHasText = !!editor && !editor.state.selection.empty
  const cursorInClause = !!editor && isCursorInClauseBlock(editor)

  return (
    <aside
      style={{
        width: 300, flexShrink: 0, borderLeft: '1px solid var(--color-border)',
        background: 'var(--color-surface)', display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          padding: '10px 14px', borderBottom: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        }}
      >
        <Shapes size={14} style={{ color: 'var(--color-primary)' }} />
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text)', flex: 1 }}>
          Clauses
        </span>
        <button
          type="button"
          onClick={() => { setEditingId(null); setCreating(true) }}
          disabled={!selectionHasText || cursorInClause}
          title={
            !selectionHasText
              ? 'Sélectionnez le texte à transformer en clause'
              : cursorInClause
                ? 'La sélection est déjà dans une clause'
                : 'Créer une clause à partir de la sélection'
          }
          style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px',
            borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)',
            background: selectionHasText && !cursorInClause ? 'var(--color-primary)' : 'var(--color-surface-offset)',
            color: selectionHasText && !cursorInClause ? '#fff' : 'var(--color-text-muted)',
            fontSize: 'var(--text-xs)', fontWeight: 500,
            cursor: selectionHasText && !cursorInClause ? 'pointer' : 'not-allowed',
          }}
        >
          <Plus size={11} /> Créer
        </button>
      </header>

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
        {creating && (
          <ClauseForm
            mode="create"
            initial={null}
            existingClauses={clauses}
            onCancel={() => setCreating(false)}
            onSubmit={handleCreate}
          />
        )}

        {!creating && clauses.length === 0 && (
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
            Aucune clause identifiée dans ce modèle. Sélectionnez un ou plusieurs blocs
            (paragraphes, titres…) puis cliquez sur « Créer » pour les transformer en
            clause structurée (obligatoire, optionnelle ou conditionnelle).
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {clauses.map((c) =>
            editingId === c.id ? (
              <ClauseForm
                key={c.id}
                mode="edit"
                initial={c}
                existingClauses={clauses}
                onCancel={() => setEditingId(null)}
                onSubmit={(form) => handleUpdate(c.id, form)}
              />
            ) : (
              <ClauseRow
                key={c.id}
                clause={c}
                allClauses={clauses}
                onEdit={() => { setCreating(false); setEditingId(c.id) }}
                onUnwrap={() => handleUnwrap(c.id)}
              />
            ),
          )}
        </div>
      </div>
    </aside>
  )
}

/* ───────────────────────────────────────────────────────────────────────── */

interface ClauseRowProps {
  clause: ClauseInDoc
  allClauses: ClauseInDoc[]
  onEdit: () => void
  onUnwrap: () => void
}

function ClauseRow({ clause, allClauses, onEdit, onUnwrap }: ClauseRowProps) {
  const style = TYPE_STYLES[clause.type]
  const refs = collectDependencyRefs(clause.dependsOn)
  const missingRefs = refs.filter((id) => !allClauses.some((c) => c.id === id))

  return (
    <div
      style={{
        padding: 10, borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--color-border)', background: 'var(--color-bg)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span
          style={{
            fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.04em', padding: '1px 6px', borderRadius: 10,
            color: style.color, background: style.bg,
          }}
        >{style.label}</span>
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {clause.label}
        </span>
      </div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span>id : <code style={{ background: 'var(--color-surface-offset)', padding: '0 4px', borderRadius: 3 }}>{clause.id}</code></span>
        {clause.type === 'optional' && (
          <span>Cochée par défaut : {clause.defaultChecked ? 'oui' : 'non'}</span>
        )}
        {refs.length > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Link2 size={10} /> Dépend de : {refs.map((id) => allClauses.find((c) => c.id === id)?.label ?? id).join(', ')}
          </span>
        )}
        {missingRefs.length > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-warning)' }}>
            <AlertTriangle size={10} /> Référence manquante : {missingRefs.join(', ')}
          </span>
        )}
      </div>
      <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
        <button
          type="button"
          onClick={onEdit}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px',
            borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)',
            background: 'transparent', color: 'var(--color-text-muted)',
            fontSize: 'var(--text-xs)', cursor: 'pointer',
          }}
        >
          <Pencil size={10} /> Modifier
        </button>
        <button
          type="button"
          onClick={onUnwrap}
          title="Retirer le marquage de clause (le contenu reste)"
          style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px',
            borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)',
            background: 'transparent', color: 'var(--color-text-muted)',
            fontSize: 'var(--text-xs)', cursor: 'pointer',
          }}
        >
          <Unlink2 size={10} /> Dissocier
        </button>
      </div>
    </div>
  )
}

/* ───────────────────────────────────────────────────────────────────────── */

interface ClauseFormValue {
  id: string
  label: string
  type: ClauseType
  defaultChecked: boolean
  dependsOn: ClauseDependencyExpr | null
}

interface ClauseFormProps {
  mode: 'create' | 'edit'
  initial: ClauseInDoc | null
  existingClauses: ClauseInDoc[]
  onCancel: () => void
  onSubmit: (form: ClauseFormValue) => void
}

function ClauseForm({ mode, initial, existingClauses, onCancel, onSubmit }: ClauseFormProps) {
  const [label, setLabel] = useState(initial?.label ?? '')
  const [id, setId] = useState(initial?.id ?? '')
  const [type, setType] = useState<ClauseType>(initial?.type ?? 'optional')
  const [defaultChecked, setDefaultChecked] = useState(initial?.defaultChecked ?? false)
  const [dependsOnId, setDependsOnId] = useState<string>(() => {
    const refs = collectDependencyRefs(initial?.dependsOn ?? null)
    return refs[0] ?? ''
  })

  const otherClauses = existingClauses.filter((c) => c.id !== initial?.id)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const dep: ClauseDependencyExpr | null =
      type === 'conditional' && dependsOnId
        ? { kind: 'ref', clauseId: dependsOnId }
        : null
    onSubmit({ id, label, type, defaultChecked, dependsOn: dep })
  }

  const style = TYPE_STYLES[type]

  return (
    <form
      onSubmit={submit}
      style={{
        padding: 10, borderRadius: 'var(--radius-sm)',
        border: `1px solid ${style.color}`, background: style.bg,
        display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8,
      }}
    >
      <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Libellé</span>
        <input
          type="text" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus
          placeholder="Honoraire de résultat"
          style={{ padding: '5px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: '#fff', fontSize: 'var(--text-sm)' }}
        />
      </label>
      {mode === 'create' && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            Identifiant (optionnel, dérivé du libellé si vide)
          </span>
          <input
            type="text" value={id} onChange={(e) => setId(e.target.value)}
            placeholder="resultat"
            style={{ padding: '5px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: '#fff', fontSize: 'var(--text-sm)', fontFamily: 'monospace' }}
          />
        </label>
      )}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Type</span>
        <select
          value={type} onChange={(e) => setType(e.target.value as ClauseType)}
          style={{ padding: '5px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: '#fff', fontSize: 'var(--text-sm)' }}
        >
          <option value="required">Obligatoire — toujours incluse</option>
          <option value="optional">Optionnelle — case à cocher</option>
          <option value="conditional">Conditionnelle — dépend d'une autre clause</option>
        </select>
      </label>
      {type === 'optional' && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm)' }}>
          <input
            type="checkbox" checked={defaultChecked} onChange={(e) => setDefaultChecked(e.target.checked)}
            style={{ accentColor: style.color }}
          />
          Cochée par défaut à la création d'un document
        </label>
      )}
      {type === 'conditional' && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            Incluse si la clause suivante est incluse
          </span>
          <select
            value={dependsOnId} onChange={(e) => setDependsOnId(e.target.value)}
            style={{ padding: '5px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: '#fff', fontSize: 'var(--text-sm)' }}
          >
            <option value="">— Sélectionner —</option>
            {otherClauses.map((c) => (
              <option key={c.id} value={c.id}>{c.label} ({c.id})</option>
            ))}
          </select>
          <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
            Les combinaisons ET/OU/NON seront accessibles dans une prochaine version.
          </span>
        </label>
      )}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button
          type="button" onClick={onCancel}
          style={{ padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}
        >Annuler</button>
        <button
          type="submit"
          disabled={!label.trim() && !id.trim()}
          style={{ padding: '4px 10px', borderRadius: 'var(--radius-sm)', border: 'none', background: style.color, color: '#fff', fontSize: 'var(--text-xs)', fontWeight: 500, cursor: 'pointer', opacity: !label.trim() && !id.trim() ? 0.5 : 1 }}
        >{mode === 'create' ? 'Créer' : 'Enregistrer'}</button>
      </div>
    </form>
  )
}

/* ───────────────────────────────────────────────────────────────────────── */

function isCursorInClauseBlock(editor: Editor): boolean {
  const { $from } = editor.state.selection
  for (let d = $from.depth; d >= 0; d--) {
    if ($from.node(d).type.name === 'clauseBlock') return true
  }
  return false
}
