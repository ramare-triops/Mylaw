// components/templates/TemplateEditorView.tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import TextStyle from '@tiptap/extension-text-style'
import FontFamily from '@tiptap/extension-font-family'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import CharacterCount from '@tiptap/extension-character-count'
import Placeholder from '@tiptap/extension-placeholder'
import { Save, Tag, ArrowLeft, Blocks, Shapes } from 'lucide-react'
import type { Editor } from '@tiptap/react'

import { WordToolbar } from '@/components/editor/WordToolbar'
import { FontSize } from '@/components/editor/extensions/FontSize'
import { VariableField } from '@/components/editor/extensions/VariableField'
import { BrickMarker } from '@/components/editor/extensions/BrickMarker'
import { ClauseBlock } from '@/components/editor/extensions/ClauseBlock'
import { ClausesPanel } from './ClausesPanel'
import {
  DocumentBricksPanel,
  DRAG_BRICK_KEY,
  brickContentToHtml,
} from '@/components/editor/DocumentBricksPanel'
import type { Brick } from '@/components/editor/DocumentBricksPanel'
import { TemplateFieldsPanel, DRAG_FIELD_KEY } from './TemplateFieldsPanel'
import type { TemplateField } from './TemplateFieldsPanel'
import type { Template } from './TemplateLibrary'
import { DOCUMENT_CATEGORIES } from '@/components/dossiers/labels'

interface TemplateEditorViewProps {
  template: Template
  onSave: (updated: Template) => void
  onClose: () => void
}

function countVariables(editor: Editor): number {
  let count = 0
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'variableField') count++
  })
  return count
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 9)
}

/**
 * Retourne le contenu dans le bon format pour TipTap :
 * - Si c'est un JSON TipTap stringifié => retourne l'objet parsé
 * - Sinon => retourne la chaîne HTML telle quelle
 */
function parseContent(raw: string): Record<string, unknown> | string {
  if (!raw) return ''
  const trimmed = raw.trim()
  if (trimmed.startsWith('{"type":"doc"')) {
    try { return JSON.parse(trimmed) as Record<string, unknown> } catch { /* fall through */ }
  }
  return trimmed
}

export function TemplateEditorView({ template, onSave, onClose }: TemplateEditorViewProps) {
  const [title, setTitle]             = useState(template.name)
  const [category, setCategory]       = useState(template.category)
  const [documentCategory, setDocumentCategory] = useState(template.documentCategory ?? '')
  const [fields, setFields]           = useState<TemplateField[]>(template.fields ?? [])
  const [showFields, setShowFields]   = useState(true)
  const [showBricks, setShowBricks]   = useState(true)
  const [showClauses, setShowClauses] = useState(false)
  const [hasChanges, setHasChanges]   = useState(false)
  const [variableCount, setVariableCount] = useState(0)
  const [saved, setSaved]             = useState(false)
  const [dropTarget, setDropTarget]   = useState(false)
  const editorRef                     = useRef<Editor | null>(null)
  const editorZoneRef                 = useRef<HTMLDivElement>(null)
  const fieldsRef                     = useRef<TemplateField[]>(fields)

  useEffect(() => { fieldsRef.current = fields }, [fields])

  const initialContent = parseContent(template.content)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
      Underline, TextStyle, FontFamily, FontSize, Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } }),
      Image.configure({ inline: true, allowBase64: true }),
      Table.configure({ resizable: true }), TableRow, TableCell, TableHeader,
      Subscript, Superscript,
      TaskList, TaskItem.configure({ nested: true }),
      CharacterCount,
      Placeholder.configure({ placeholder: 'Rédigez votre modèle ici… Glissez ou cliquez sur un champ pour l\'insérer.' }),
      VariableField.configure({ onVariableClick: undefined, HTMLAttributes: {} }),
      BrickMarker,
      ClauseBlock,
    ],
    content: initialContent,
    editorProps: {
      attributes: { class: 'mylex-editor-content', spellcheck: 'true', lang: 'fr' },
    },
    onUpdate: ({ editor: ed }) => {
      setHasChanges(true)
      setSaved(false)
      setVariableCount(countVariables(ed))
    },
  })

  useEffect(() => {
    editorRef.current = editor ?? null
    if (editor) setVariableCount(countVariables(editor))
  }, [editor])

  // ── Insertion de variable
  const handleInsertVariable = useCallback((name: string) => {
    const ed = editorRef.current
    if (!ed) return
    ed.chain().focus().insertVariable(name).run()
    setHasChanges(true)
    setSaved(false)
    setTimeout(() => setVariableCount(countVariables(ed)), 50)
  }, [])

  // ── Insertion d'une brique au curseur
  // Dans l'éditeur de modèles, on insère la brique sans marqueur d'intervenant :
  // un modèle doit rester générique, les variables seront remplies lors de
  // l'utilisation dans un document.
  const handleInsertBrick = useCallback((brickHtml: string, _brick?: Brick) => {
    const ed = editorRef.current
    if (!ed) return
    ed.chain().focus().insertContent(brickHtml).run()
    setHasChanges(true)
    setSaved(false)
    setTimeout(() => setVariableCount(countVariables(ed)), 50)
  }, [])

  // ── Drag & drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    const types = e.dataTransfer.types
    if (!types.includes(DRAG_FIELD_KEY) && !types.includes(DRAG_BRICK_KEY)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDropTarget(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!editorZoneRef.current?.contains(e.relatedTarget as Node)) setDropTarget(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    setDropTarget(false)

    // 1) Drop de brique
    const brickRaw = e.dataTransfer.getData(DRAG_BRICK_KEY)
    if (brickRaw) {
      e.preventDefault()
      try {
        const brick: Brick = JSON.parse(brickRaw)
        const ed = editorRef.current
        if (!ed) return
        const html = brickContentToHtml(brick.content)
        const pos = ed.view.posAtCoords({ left: e.clientX, top: e.clientY })
        if (pos) ed.chain().focus().insertContentAt(pos.pos, html).run()
        else ed.chain().focus().insertContent(html).run()
        setHasChanges(true)
        setSaved(false)
        setTimeout(() => setVariableCount(countVariables(ed)), 50)
      } catch { /* drop invalide : on ignore */ }
      return
    }

    // 2) Drop de champ (variable)
    const raw = e.dataTransfer.getData(DRAG_FIELD_KEY)
    if (!raw) return
    e.preventDefault()
    let data: { name: string; label: string; type: TemplateField['type']; placeholder: string }
    try { data = JSON.parse(raw) } catch { return }
    const ed = editorRef.current
    if (!ed) return
    const pos = ed.view.posAtCoords({ left: e.clientX, top: e.clientY })
    if (pos) ed.chain().focus().setTextSelection(pos.pos).insertVariable(data.name).run()
    else ed.chain().focus().insertVariable(data.name).run()
    setHasChanges(true)
    setSaved(false)
    setTimeout(() => setVariableCount(countVariables(ed)), 50)
    const current = fieldsRef.current
    if (!current.some((f) => f.name === data.name)) {
      const newField: TemplateField = { id: generateId(), name: data.name, label: data.label, type: data.type, defaultValue: '', required: false, placeholder: data.placeholder }
      setFields((prev) => { const updated = [...prev, newField]; fieldsRef.current = updated; return updated })
      setHasChanges(true)
    }
  }, [])

  // ── Sauvegarde
  // On sérialise désormais en HTML (et non plus en JSON TipTap) afin que les
  // wrappers `<section data-clause-id>` produits par l'extension ClauseBlock
  // soient préservés à travers le round-trip de l'éditeur. Les lecteurs en
  // aval (éditeur de document, prévisualisations) acceptent déjà les deux
  // formats.
  const handleSave = useCallback(() => {
    const ed = editorRef.current
    if (!ed) return
    const updated: Template = {
      ...template,
      name: title.trim() || 'Modèle sans titre',
      category: category.trim() || 'Cabinet',
      documentCategory: documentCategory.trim() || undefined,
      content: ed.getHTML(),
      fields,
      updatedAt: new Date().toISOString(),
    }
    onSave(updated)
    setHasChanges(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [title, category, documentCategory, fields, template, onSave])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleSave() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleSave])

  const handleInsertLink = useCallback(() => {
    const ed = editorRef.current; if (!ed) return
    const prev = ed.getAttributes('link').href
    const url = window.prompt('URL du lien :', prev ?? 'https://')
    if (url === null) return
    if (url === '') ed.chain().focus().extendMarkRange('link').unsetLink().run()
    else ed.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }, [])

  const handleInsertImage = useCallback(() => {
    const ed = editorRef.current; if (!ed) return
    const url = window.prompt("URL de l'image :")
    if (url) ed.chain().focus().setImage({ src: url }).run()
  }, [])

  const wordCount = editor?.storage.characterCount.words() ?? 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--color-surface-offset)' }}>

      {/* Barre de titre */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 16px', background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
        <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)', cursor: 'pointer', flexShrink: 0 }}>
          <ArrowLeft size={13} /> Retour
        </button>
        <input type="text" value={title} onChange={(e) => { setTitle(e.target.value); setHasChanges(true) }} placeholder="Nom du modèle"
          style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text)', background: 'transparent', border: 'none', outline: 'none', padding: '4px 8px', borderRadius: 'var(--radius-sm)' }}
          onFocus={(e) => { (e.target as HTMLInputElement).style.background = 'var(--color-surface-offset)' }}
          onBlur={(e) => { (e.target as HTMLInputElement).style.background = 'transparent' }}
        />
        <input type="text" value={category} onChange={(e) => { setCategory(e.target.value); setHasChanges(true) }} placeholder="Bibliothèque"
          title="Catégorie du modèle (classement de la bibliothèque)"
          style={{ width: '140px', flexShrink: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', background: 'var(--color-surface-offset)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '4px 8px', outline: 'none' }}
        />
        <select
          value={documentCategory}
          onChange={(e) => { setDocumentCategory(e.target.value); setHasChanges(true) }}
          title="Catégorie documentaire appliquée par défaut aux documents créés à partir de ce modèle"
          style={{ width: '150px', flexShrink: 0, fontSize: 'var(--text-xs)', color: documentCategory ? 'var(--color-text)' : 'var(--color-text-muted)', background: 'var(--color-surface-offset)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '4px 8px', outline: 'none' }}
        >
          <option value="">Catégorie doc. —</option>
          {DOCUMENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        {variableCount > 0 && (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-primary)', background: 'var(--color-primary-highlight)', padding: '3px 9px', borderRadius: 'var(--radius-full)', fontWeight: 500, flexShrink: 0 }}>
            {variableCount} variable{variableCount > 1 ? 's' : ''}
          </span>
        )}
        <button onClick={() => setShowFields((v) => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: showFields ? 'var(--color-primary-highlight)' : 'transparent', color: showFields ? 'var(--color-primary)' : 'var(--color-text-muted)', fontSize: 'var(--text-xs)', fontWeight: showFields ? 600 : 400, cursor: 'pointer', flexShrink: 0, transition: 'all 0.12s' }}>
          <Tag size={12} /> Champs
        </button>
        <button onClick={() => setShowBricks((v) => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: showBricks ? 'var(--color-primary-highlight)' : 'transparent', color: showBricks ? 'var(--color-primary)' : 'var(--color-text-muted)', fontSize: 'var(--text-xs)', fontWeight: showBricks ? 600 : 400, cursor: 'pointer', flexShrink: 0, transition: 'all 0.12s' }}>
          <Blocks size={12} /> Briques
        </button>
        <button onClick={() => setShowClauses((v) => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: showClauses ? 'var(--color-primary-highlight)' : 'transparent', color: showClauses ? 'var(--color-primary)' : 'var(--color-text-muted)', fontSize: 'var(--text-xs)', fontWeight: showClauses ? 600 : 400, cursor: 'pointer', flexShrink: 0, transition: 'all 0.12s' }}>
          <Shapes size={12} /> Clauses
        </button>
        {saved && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-success)', flexShrink: 0 }}>✓ Enregistré</span>}
        {hasChanges && !saved && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-warning)', flexShrink: 0 }}>● Non enregistré</span>}
        <button onClick={handleSave}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: 'var(--radius-md)', background: 'var(--color-primary)', color: '#fff', fontSize: 'var(--text-sm)', fontWeight: 500, cursor: 'pointer', flexShrink: 0 }}>
          <Save size={13} /> Enregistrer
        </button>
      </div>

      <WordToolbar editor={editor} onInsertLink={handleInsertLink} onInsertImage={handleInsertImage} hasVariables={false} />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div
          ref={editorZoneRef}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', background: dropTarget ? '#e8f4f4' : '#e8e8e8', padding: '32px', transition: 'background 0.15s', outline: dropTarget ? '3px dashed #01696f' : '3px dashed transparent', outlineOffset: '-4px' }}
        >
          {dropTarget && (
            <div style={{ position: 'sticky', top: 0, zIndex: 10, textAlign: 'center', padding: '6px', background: '#01696f', color: 'white', fontSize: '12px', fontWeight: 500, borderRadius: '0 0 var(--radius-md) var(--radius-md)', marginBottom: '8px', boxShadow: '0 2px 8px rgba(1,105,111,0.3)' }}>
              Relâchez pour insérer le champ ici
            </div>
          )}
          <div style={{ width: '210mm', margin: '0 auto', background: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)', minHeight: '297mm', padding: '25mm 20mm 20mm 25mm' }}>
            <EditorContent editor={editor} />
          </div>
        </div>

        {showFields && (
          <TemplateFieldsPanel
            fields={fields}
            onChange={(f) => { setFields(f); setHasChanges(true) }}
            onInsertVariable={handleInsertVariable}
          />
        )}

        {showBricks && (
          <DocumentBricksPanel
            onInsertBrick={handleInsertBrick}
            disableIntervenantPicker
          />
        )}

        {showClauses && (
          <ClausesPanel
            editor={editor}
            onChanged={() => { setHasChanges(true); setSaved(false) }}
          />
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 16px', background: 'var(--color-primary)', color: 'white', fontSize: 'var(--text-xs)', flexShrink: 0 }}>
        <span>{wordCount} mot{wordCount !== 1 ? 's' : ''}</span>
        <span style={{ opacity: 0.75 }}>Mode édition de modèle — Ctrl+S pour enregistrer</span>
        <span style={{ opacity: 0.75 }}>{fields.length} champ{fields.length !== 1 ? 's' : ''} défini{fields.length !== 1 ? 's' : ''}</span>
      </div>

      <style jsx global>{`
        .mylex-editor-content {
          font-family: Georgia, serif; font-size: 12pt; line-height: 1.6;
          color: #28251d; min-height: 200px; outline: none;
        }
        .mylex-editor-content p.is-editor-empty:first-child::before {
          content: attr(data-placeholder); float: left; color: #9ca3af;
          pointer-events: none; height: 0; font-style: italic;
        }
        .mylex-editor-content h1 { font-size: 2em; font-weight: 700; margin: 1em 0 0.5em; }
        .mylex-editor-content h2 { font-size: 1.5em; font-weight: 700; margin: 0.9em 0 0.4em; }
        .mylex-editor-content h3 { font-size: 1.25em; font-weight: 600; margin: 0.8em 0 0.35em; }
        .mylex-editor-content p { margin-bottom: 0.75em; }
        .mylex-editor-content ul, .mylex-editor-content ol { padding-left: 1.5em; margin-bottom: 0.75em; }
        .mylex-editor-content table { border-collapse: collapse; width: 100%; margin: 1em 0; }
        .mylex-editor-content th, .mylex-editor-content td { border: 1px solid #d1d5db; padding: 0.5em 0.75em; }
        .mylex-editor-content th { background: #f9fafb; font-weight: 600; }
        .mylex-editor-content a { color: #01696f; text-decoration: underline; }
        .mylex-editor-content blockquote { border-left: 3px solid #01696f; padding: 0.5em 0 0.5em 1.25em; margin: 1em 0; color: #6b7280; font-style: italic; }
        .mylex-editor-content [data-variable-field] {
          display: inline-flex; align-items: center; user-select: none;
          font-size: 0.82em; font-weight: 500; padding: 0.1em 0.55em;
          border-radius: 4px; border: 1.5px solid currentColor;
          vertical-align: baseline; line-height: 1.5; margin: 0 1px;
        }
        .mylex-editor-content [data-variable-field][data-variable-type="date"]      { color: #4f46e5; background: rgba(79,70,229,0.07); }
        .mylex-editor-content [data-variable-field][data-variable-type="name"]      { color: #01696f; background: rgba(1,105,111,0.07); }
        .mylex-editor-content [data-variable-field][data-variable-type="address"]   { color: #c2410c; background: rgba(194,65,12,0.07); }
        .mylex-editor-content [data-variable-field][data-variable-type="price"]     { color: #15803d; background: rgba(21,128,61,0.07); }
        .mylex-editor-content [data-variable-field][data-variable-type="duration"]  { color: #7c3aed; background: rgba(124,58,237,0.07); }
        .mylex-editor-content [data-variable-field][data-variable-type="reference"] { color: #be185d; background: rgba(190,24,93,0.07); }
        .mylex-editor-content [data-variable-field][data-variable-type="default"],
        .mylex-editor-content [data-variable-field]:not([data-variable-type]) { color: #6b7280; background: rgba(107,114,128,0.07); }

        /* ── Clauses (ClauseBlock) ─────────────────────────────────────── */
        .mylex-editor-content .mylaw-clause-block {
          position: relative;
          padding: 0.35em 0 0.35em 0.85em;
          margin: 0.4em 0;
          border-left: 3px solid rgba(0,0,0,0.12);
          border-radius: 2px;
        }
        .mylex-editor-content .mylaw-clause-block[data-clause-type="required"]     { border-left-color: #01696f; background: rgba(1,105,111,0.04); }
        .mylex-editor-content .mylaw-clause-block[data-clause-type="optional"]     { border-left-color: #b45309; background: rgba(180,83,9,0.04); }
        .mylex-editor-content .mylaw-clause-block[data-clause-type="conditional"]  { border-left-color: #6d28d9; background: rgba(109,40,217,0.04); }
        .mylex-editor-content .mylaw-clause-block[data-clause-label]::before {
          content: attr(data-clause-label);
          position: absolute; top: -0.55em; right: 0.55em;
          font-size: 10px; font-weight: 600; letter-spacing: 0.04em;
          text-transform: uppercase; padding: 1px 6px; border-radius: 10px;
          background: white; border: 1px solid currentColor;
          color: inherit; line-height: 1.3;
        }
        .mylex-editor-content .mylaw-clause-block[data-clause-type="required"]::before    { color: #01696f; }
        .mylex-editor-content .mylaw-clause-block[data-clause-type="optional"]::before    { color: #b45309; }
        .mylex-editor-content .mylaw-clause-block[data-clause-type="conditional"]::before { color: #6d28d9; }
      `}</style>
    </div>
  )
}
