// components/templates/TemplateEditorView.tsx
// Éditeur de modèles complet : TipTap + WordToolbar + panneau de champs/variables
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
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
import { Save, X, Tag, Eye, EyeOff, ArrowLeft } from 'lucide-react'
import type { Editor } from '@tiptap/react'

import { WordToolbar } from '@/components/editor/WordToolbar'
import { FontSize } from '@/components/editor/extensions/FontSize'
import { VariableField } from '@/components/editor/extensions/VariableField'
import { TemplateFieldsPanel } from './TemplateFieldsPanel'
import type { TemplateField } from './TemplateFieldsPanel'
import type { Template } from './TemplateLibrary'

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

export function TemplateEditorView({ template, onSave, onClose }: TemplateEditorViewProps) {
  const router = useRouter()
  const [title, setTitle]               = useState(template.name)
  const [category, setCategory]         = useState(template.category)
  const [fields, setFields]             = useState<TemplateField[]>(template.fields ?? [])
  const [showFields, setShowFields]     = useState(true)
  const [hasChanges, setHasChanges]     = useState(false)
  const [variableCount, setVariableCount] = useState(0)
  const [saved, setSaved]               = useState(false)
  const editorRef                       = useRef<Editor | null>(null)

  const handleVariableClick = useCallback((name: string, pos: number) => {
    // En mode édition de modèle, cliquer sur une variable l'étiquette dans le panneau
    // (pas de remplacement, on est en mode « design »)
  }, [])

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
      Placeholder.configure({ placeholder: 'Rédigez votre modèle ici… Utilisez le panneau Champs pour insérer des variables.' }),
      VariableField.configure({
        onVariableClick: handleVariableClick,
        HTMLAttributes: {},
      }),
    ],
    content: template.content || '',
    editorProps: {
      attributes: {
        class: 'mylex-editor-content',
        spellcheck: 'true',
        lang: 'fr',
      },
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

  const handleSave = useCallback(() => {
    const ed = editorRef.current
    if (!ed) return
    const updated: Template = {
      ...template,
      name: title.trim() || 'Modèle sans titre',
      category: category.trim() || 'Cabinet',
      content: JSON.stringify(ed.getJSON()),
      fields,
      updatedAt: new Date().toISOString(),
    }
    onSave(updated)
    setHasChanges(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [title, category, fields, template, onSave])

  // Ctrl+S
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleSave])

  const handleInsertLink = useCallback(() => {
    const ed = editorRef.current
    if (!ed) return
    const prev = ed.getAttributes('link').href
    const url = window.prompt('URL du lien :', prev ?? 'https://')
    if (url === null) return
    if (url === '') ed.chain().focus().extendMarkRange('link').unsetLink().run()
    else ed.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }, [])

  const handleInsertImage = useCallback(() => {
    const ed = editorRef.current
    if (!ed) return
    const url = window.prompt("URL de l'image :")
    if (url) ed.chain().focus().setImage({ src: url }).run()
  }, [])

  const handleInsertVariable = useCallback((name: string) => {
    const ed = editorRef.current
    if (!ed) return
    ed.chain().focus().insertVariable(name).run()
    setHasChanges(true)
    setSaved(false)
    setTimeout(() => {
      setVariableCount(countVariables(ed))
    }, 50)
  }, [])

  const wordCount = editor?.storage.characterCount.words() ?? 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--color-surface-offset)' }}>

      {/* Barre de titre */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '8px 16px',
          background: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border)',
          flexShrink: 0,
        }}
      >
        <button
          onClick={onClose}
          title="Retour à la liste"
          style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            padding: '4px 8px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-border)',
            background: 'transparent',
            color: 'var(--color-text-muted)',
            fontSize: 'var(--text-xs)',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <ArrowLeft size={13} />
          Retour
        </button>

        <input
          type="text"
          value={title}
          onChange={(e) => { setTitle(e.target.value); setHasChanges(true) }}
          placeholder="Nom du modèle"
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
            color: 'var(--color-text)',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            padding: '4px 8px',
            borderRadius: 'var(--radius-sm)',
          }}
          onFocus={(e) => { (e.target as HTMLInputElement).style.background = 'var(--color-surface-offset)' }}
          onBlur={(e) => { (e.target as HTMLInputElement).style.background = 'transparent' }}
        />

        {/* Catégorie */}
        <input
          type="text"
          value={category}
          onChange={(e) => { setCategory(e.target.value); setHasChanges(true) }}
          placeholder="Catégorie"
          style={{
            width: '140px',
            flexShrink: 0,
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-muted)',
            background: 'var(--color-surface-offset)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            padding: '4px 8px',
            outline: 'none',
          }}
        />

        {/* Compteur variables */}
        {variableCount > 0 && (
          <span
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-primary)',
              background: 'var(--color-primary-highlight)',
              padding: '3px 9px',
              borderRadius: 'var(--radius-full)',
              fontWeight: 500,
              flexShrink: 0,
            }}
          >
            {variableCount} variable{variableCount > 1 ? 's' : ''}
          </span>
        )}

        {/* Toggle panneau champs */}
        <button
          onClick={() => setShowFields((v) => !v)}
          title={showFields ? 'Masquer les champs' : 'Afficher les champs'}
          style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            padding: '5px 10px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-border)',
            background: showFields ? 'var(--color-primary-highlight)' : 'transparent',
            color: showFields ? 'var(--color-primary)' : 'var(--color-text-muted)',
            fontSize: 'var(--text-xs)',
            fontWeight: showFields ? 600 : 400,
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'all var(--transition-interactive)',
          }}
        >
          <Tag size={12} />
          Champs
        </button>

        {/* Statut sauvegarde */}
        {saved && (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-success)', flexShrink: 0 }}>
            ✓ Enregistré
          </span>
        )}
        {hasChanges && !saved && (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-warning)', flexShrink: 0 }}>
            ● Non enregistré
          </span>
        )}

        {/* Bouton Enregistrer */}
        <button
          onClick={handleSave}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '6px 14px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-primary)',
            color: '#fff',
            fontSize: 'var(--text-sm)',
            fontWeight: 500,
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'background var(--transition-interactive)',
          }}
        >
          <Save size={13} />
          Enregistrer
        </button>
      </div>

      {/* Barre d'outils TipTap */}
      <WordToolbar
        editor={editor}
        onInsertLink={handleInsertLink}
        onInsertImage={handleInsertImage}
        hasVariables={false}
      />

      {/* Corps : éditeur + panneau champs */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Zone document */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', background: '#e8e8e8', padding: '32px 32px' }}>
          <div
            style={{
              width: '210mm',
              margin: '0 auto',
              background: 'white',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
              minHeight: '297mm',
              padding: '25mm 20mm 20mm 25mm',
            }}
          >
            <EditorContent editor={editor} />
          </div>
        </div>

        {/* Panneau champs (conditionnel) */}
        {showFields && (
          <TemplateFieldsPanel
            fields={fields}
            onChange={(f) => { setFields(f); setHasChanges(true) }}
            onInsertVariable={handleInsertVariable}
          />
        )}
      </div>

      {/* Barre de statut */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 16px',
          background: 'var(--color-primary)',
          color: 'white',
          fontSize: 'var(--text-xs)',
          flexShrink: 0,
        }}
      >
        <span>{wordCount} mot{wordCount !== 1 ? 's' : ''}</span>
        <span style={{ opacity: 0.75 }}>Mode édition de modèle — Ctrl+S pour enregistrer</span>
        <span style={{ opacity: 0.75 }}>{fields.length} champ{fields.length !== 1 ? 's' : ''} défini{fields.length !== 1 ? 's' : ''}</span>
      </div>

      <style jsx global>{`
        .mylex-editor-content {
          font-family: Georgia, serif;
          font-size: 12pt;
          line-height: 1.6;
          color: #28251d;
          min-height: 200px;
          outline: none;
        }
        .mylex-editor-content p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left; color: #9ca3af; pointer-events: none; height: 0; font-style: italic;
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

        /* Variables */
        .mylex-editor-content [data-variable-field] {
          display: inline-flex; align-items: center; user-select: none;
          font-size: 0.82em; font-weight: 500;
          padding: 0.1em 0.55em; border-radius: 4px;
          border: 1.5px solid currentColor;
          vertical-align: baseline; line-height: 1.5; margin: 0 1px;
        }
        .mylex-editor-content [data-variable-field][data-variable-type="date"]      { color: #4f46e5; background: rgba(79,70,229,0.07); }
        .mylex-editor-content [data-variable-field][data-variable-type="name"]      { color: #01696f; background: rgba(1,105,111,0.07); }
        .mylex-editor-content [data-variable-field][data-variable-type="address"]   { color: #c2410c; background: rgba(194,65,12,0.07); }
        .mylex-editor-content [data-variable-field][data-variable-type="price"]     { color: #15803d; background: rgba(21,128,61,0.07); }
        .mylex-editor-content [data-variable-field][data-variable-type="duration"]  { color: #7c3aed; background: rgba(124,58,237,0.07); }
        .mylex-editor-content [data-variable-field][data-variable-type="reference"] { color: #be185d; background: rgba(190,24,93,0.07); }
        .mylex-editor-content [data-variable-field][data-variable-type="default"],
        .mylex-editor-content [data-variable-field]:not([data-variable-type])       { color: #6b7280; background: rgba(107,114,128,0.07); }
      `}</style>
    </div>
  )
}
