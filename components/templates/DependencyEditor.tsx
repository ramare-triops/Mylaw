// components/templates/DependencyEditor.tsx
'use client'

import { Fragment, useCallback } from 'react'
import { Plus, X, RotateCw } from 'lucide-react'
import type { ClauseDependencyExpr } from '@/lib/clause-engine'

/**
 * Éditeur récursif d'expression booléenne évaluée contre l'ensemble des
 * clauses incluses d'un modèle. Couvre les quatre constructeurs :
 *   - SI       → `{ kind: 'ref', clauseId }`
 *   - SI NON   → `{ kind: 'not', term }`
 *   - ET       → `{ kind: 'and', terms: [...] }`
 *   - OU       → `{ kind: 'or',  terms: [...] }`
 *
 * L'arbre peut être imbriqué à volonté. Les opérations de suppression
 * simplifient automatiquement la structure :
 *   - une jonction qui ne contient plus qu'un terme devient ce terme ;
 *   - une jonction vide devient `null` et délègue la suppression au parent ;
 *   - un double `not` s'effondre.
 */

interface ClauseOption {
  id: string
  label: string
}

interface DependencyEditorProps {
  value: ClauseDependencyExpr | null
  onChange: (expr: ClauseDependencyExpr | null) => void
  availableClauses: ClauseOption[]
  /** Id de la clause en cours d'édition — exclu de la liste pour éviter
   *  qu'elle se référence elle-même. */
  excludeId?: string | null
}

export function DependencyEditor({
  value,
  onChange,
  availableClauses,
  excludeId = null,
}: DependencyEditorProps) {
  const options = availableClauses.filter((c) => c.id && c.id !== excludeId)

  if (options.length === 0) {
    return (
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
        Aucune autre clause disponible. Créez une seconde clause pour
        pouvoir exprimer une dépendance.
      </div>
    )
  }

  if (!value) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          type="button"
          onClick={() => onChange(newRef(options))}
          style={BTN_STYLES.primary}
        >
          <Plus size={10} /> Ajouter une condition
        </button>
      </div>
    )
  }

  return (
    <ExprNode
      node={value}
      onChange={onChange}
      onDelete={() => onChange(null)}
      options={options}
      isRoot
    />
  )
}

/* ─── Création / normalisation ──────────────────────────────────────────── */

function newRef(options: ClauseOption[]): ClauseDependencyExpr {
  return { kind: 'ref', clauseId: options[0]?.id ?? '' }
}

/** Déroule les double négations, et les jonctions à zéro ou un terme. */
function normalize(node: ClauseDependencyExpr | null): ClauseDependencyExpr | null {
  if (!node) return null
  if (node.kind === 'not') {
    const inner = normalize(node.term)
    if (!inner) return null
    if (inner.kind === 'not') return inner.term
    return { kind: 'not', term: inner }
  }
  if (node.kind === 'and' || node.kind === 'or') {
    const terms = node.terms.map(normalize).filter((t): t is ClauseDependencyExpr => !!t)
    if (terms.length === 0) return null
    if (terms.length === 1) return terms[0]
    return { kind: node.kind, terms }
  }
  return node
}

/* ─── Nœud générique ────────────────────────────────────────────────────── */

interface ExprNodeProps {
  node: ClauseDependencyExpr
  onChange: (node: ClauseDependencyExpr) => void
  onDelete?: () => void
  options: ClauseOption[]
  isRoot?: boolean
}

function ExprNode({ node, onChange, onDelete, options, isRoot }: ExprNodeProps) {
  // Cas particulier : `not(ref)` est rendu comme un leaf avec pill "SI NON",
  // plus naturel que d'afficher un wrapper séparé. Les autres `not` (négation
  // d'un groupe) passent par NotWrapper.
  if (node.kind === 'not' && node.term.kind === 'ref') {
    return (
      <LeafEditor
        pill="SI NON"
        clauseId={node.term.clauseId}
        onChangeRef={(cid) =>
          onChange({ kind: 'not', term: { kind: 'ref', clauseId: cid } })
        }
        onTogglePill={() => onChange(node.term)}
        onAdd={(kind) =>
          onChange({ kind, terms: [node, newRef(options)] })
        }
        onDelete={onDelete}
        options={options}
      />
    )
  }
  if (node.kind === 'not') {
    return (
      <NotWrapper node={node} onChange={onChange} onDelete={onDelete} options={options} />
    )
  }
  if (node.kind === 'ref') {
    return (
      <LeafEditor
        pill="SI"
        clauseId={node.clauseId}
        onChangeRef={(cid) => onChange({ kind: 'ref', clauseId: cid })}
        onTogglePill={() => onChange({ kind: 'not', term: node })}
        onAdd={(kind) => onChange({ kind, terms: [node, newRef(options)] })}
        onDelete={onDelete}
        options={options}
      />
    )
  }
  return (
    <JunctionEditor
      node={node}
      onChange={onChange}
      onDelete={onDelete}
      options={options}
      isRoot={isRoot}
    />
  )
}

/* ─── Leaf : SI / SI NON + dropdown ─────────────────────────────────────── */

interface LeafEditorProps {
  pill: 'SI' | 'SI NON'
  clauseId: string
  onChangeRef: (clauseId: string) => void
  onTogglePill: () => void
  onAdd: (kind: 'and' | 'or') => void
  onDelete?: () => void
  options: ClauseOption[]
}

function LeafEditor({
  pill, clauseId, onChangeRef, onTogglePill, onAdd, onDelete, options,
}: LeafEditorProps) {
  return (
    <span style={STYLES.chip}>
      <button
        type="button"
        onClick={onTogglePill}
        title={pill === 'SI' ? 'Transformer en SI NON' : 'Transformer en SI'}
        style={{
          ...STYLES.pill,
          background: pill === 'SI NON' ? '#6d28d9' : '#6d28d91a',
          color: pill === 'SI NON' ? '#fff' : '#6d28d9',
        }}
      >
        {pill}
      </button>
      <select
        value={clauseId}
        onChange={(e) => onChangeRef(e.target.value)}
        style={STYLES.select}
      >
        {!options.some((o) => o.id === clauseId) && clauseId && (
          <option value={clauseId}>⚠ {clauseId}</option>
        )}
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
      <button type="button" onClick={() => onAdd('and')} style={BTN_STYLES.op} title="Ajouter un terme combiné par ET">
        + ET
      </button>
      <button type="button" onClick={() => onAdd('or')} style={BTN_STYLES.op} title="Ajouter un terme combiné par OU">
        + OU
      </button>
      {onDelete && (
        <button type="button" onClick={onDelete} style={BTN_STYLES.icon} title="Retirer cette condition">
          <X size={10} />
        </button>
      )}
    </span>
  )
}

/* ─── Not wrapper (négation d'un groupe) ────────────────────────────────── */

function NotWrapper({
  node, onChange, onDelete, options,
}: {
  node: Extract<ClauseDependencyExpr, { kind: 'not' }>
  onChange: (node: ClauseDependencyExpr) => void
  onDelete?: () => void
  options: ClauseOption[]
}) {
  return (
    <span style={STYLES.chip}>
      <span style={{ ...STYLES.pill, background: '#6d28d9', color: '#fff' }}>SI NON</span>
      <span style={STYLES.paren}>(</span>
      <ExprNode
        node={node.term}
        onChange={(newInner) => {
          const n = normalize({ kind: 'not', term: newInner })
          if (n) onChange(n); else onDelete?.()
        }}
        onDelete={() => onDelete?.()}
        options={options}
      />
      <span style={STYLES.paren}>)</span>
      <button
        type="button"
        onClick={() => onChange(node.term)}
        style={BTN_STYLES.op}
        title="Retirer la négation"
      >
        Retirer NON
      </button>
      {onDelete && (
        <button type="button" onClick={onDelete} style={BTN_STYLES.icon} title="Supprimer">
          <X size={10} />
        </button>
      )}
    </span>
  )
}

/* ─── Junction (ET / OU) ────────────────────────────────────────────────── */

function JunctionEditor({
  node, onChange, onDelete, options, isRoot,
}: {
  node: Extract<ClauseDependencyExpr, { kind: 'and' | 'or' }>
  onChange: (node: ClauseDependencyExpr) => void
  onDelete?: () => void
  options: ClauseOption[]
  isRoot?: boolean
}) {
  const opLabel = node.kind === 'and' ? 'ET' : 'OU'

  const toggleKind = useCallback(() => {
    onChange({ kind: node.kind === 'and' ? 'or' : 'and', terms: node.terms })
  }, [node, onChange])

  const updateTerm = useCallback(
    (index: number, newTerm: ClauseDependencyExpr) => {
      const terms = node.terms.slice()
      terms[index] = newTerm
      const next = normalize({ kind: node.kind, terms })
      if (next) onChange(next)
    },
    [node, onChange],
  )

  const deleteTerm = useCallback(
    (index: number) => {
      const terms = node.terms.filter((_, i) => i !== index)
      const next = normalize({ kind: node.kind, terms })
      if (next) onChange(next)
      else onDelete?.()
    },
    [node, onChange, onDelete],
  )

  const addTerm = useCallback(() => {
    onChange({ kind: node.kind, terms: [...node.terms, newRef(options)] })
  }, [node, onChange, options])

  const wrapInNot = useCallback(() => {
    onChange({ kind: 'not', term: node } as ClauseDependencyExpr)
  }, [node, onChange])

  return (
    <span style={{ ...STYLES.group, ...(isRoot ? {} : STYLES.groupNested) }}>
      {!isRoot && <span style={STYLES.paren}>(</span>}
      {node.terms.map((t, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <button
              type="button"
              onClick={toggleKind}
              style={{ ...STYLES.pill, background: '#01696f', color: '#fff', cursor: 'pointer' }}
              title={`Basculer ${opLabel === 'ET' ? 'ET → OU' : 'OU → ET'}`}
            >
              {opLabel}
            </button>
          )}
          <ExprNode
            node={t}
            onChange={(nt) => updateTerm(i, nt)}
            onDelete={() => deleteTerm(i)}
            options={options}
          />
        </Fragment>
      ))}
      {!isRoot && <span style={STYLES.paren}>)</span>}
      <button type="button" onClick={addTerm} style={BTN_STYLES.op} title="Ajouter un terme">
        <Plus size={10} /> terme
      </button>
      <button type="button" onClick={wrapInNot} style={BTN_STYLES.op} title="Négation du groupe entier">
        <RotateCw size={10} /> NON
      </button>
      {onDelete && (
        <button type="button" onClick={onDelete} style={BTN_STYLES.icon} title="Supprimer le groupe">
          <X size={10} />
        </button>
      )}
    </span>
  )
}

/* ─── Styles ────────────────────────────────────────────────────────────── */

const STYLES: Record<string, React.CSSProperties> = {
  chip: {
    display: 'inline-flex', alignItems: 'center', gap: 5, flexWrap: 'wrap',
    padding: 4,
    borderRadius: 6,
    background: 'rgba(109,40,217,0.04)',
    border: '1px solid rgba(109,40,217,0.15)',
    fontSize: 'var(--text-xs)',
  },
  group: {
    display: 'inline-flex', alignItems: 'center', gap: 5, flexWrap: 'wrap',
    padding: 4, borderRadius: 6,
  },
  groupNested: {
    background: 'rgba(1,105,111,0.04)',
    border: '1px dashed rgba(1,105,111,0.2)',
  },
  pill: {
    display: 'inline-flex', alignItems: 'center', gap: 3,
    fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
    padding: '2px 7px', borderRadius: 10,
    border: 'none', cursor: 'pointer', userSelect: 'none',
  },
  paren: {
    fontSize: 14, color: '#01696f', fontWeight: 600, opacity: 0.6,
  },
  select: {
    padding: '2px 6px',
    borderRadius: 4,
    border: '1px solid var(--color-border)',
    background: '#fff',
    fontSize: 'var(--text-xs)',
    maxWidth: 160,
  },
}

const BTN_STYLES: Record<string, React.CSSProperties> = {
  primary: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '3px 8px', borderRadius: 4,
    background: '#6d28d9', color: '#fff',
    fontSize: 'var(--text-xs)', fontWeight: 500, border: 'none', cursor: 'pointer',
  },
  op: {
    display: 'inline-flex', alignItems: 'center', gap: 3,
    padding: '2px 7px', borderRadius: 4,
    background: 'transparent', color: 'var(--color-text-muted)',
    fontSize: 'var(--text-xs)', border: '1px solid var(--color-border)', cursor: 'pointer',
  },
  icon: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 18, height: 18, padding: 0, borderRadius: 4,
    background: 'transparent', color: 'var(--color-text-muted)',
    border: '1px solid var(--color-border)', cursor: 'pointer',
  },
}
