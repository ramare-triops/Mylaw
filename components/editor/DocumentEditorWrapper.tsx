// components/editor/DocumentEditorWrapper.tsx
// Wrapper éditeur : applique les préférences utilisateur (police, taille, interligne, marges, spellcheck…)
// Bouton Fermer avec popup 3 actions : Enregistrer sans fermer / Enregistrer et fermer / Annuler
// Champs variables Nom Ville etc. cliquables avec pop-up de saisie
// Bouton "Renseigner les informations" avec dialog guidé pas à pas
// Zoom document style Google Docs
// Expansions de texte : remplacement automatique à la frappe depuis db.snippets
// Panneau boîte à outils (briques) sur la droite

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
import { Save, Check, Loader2, Wifi, WifiOff, X, ZoomIn, ZoomOut, Settings2 } from 'lucide-react'
import type { Editor } from '@tiptap/react'

import { WordToolbar } from './WordToolbar'
import { FontSize } from './extensions/FontSize'
import { VariableField } from './extensions/VariableField'
import { TextExpansion } from './extensions/TextExpansion'
import { VariablePopup } from './VariablePopup'
import { FillAllVariablesDialog } from './FillAllVariablesDialog'
import { DocumentBricksPanel, DRAG_BRICK_KEY, brickContentToHtml } from './DocumentBricksPanel'
import type { Brick } from './DocumentBricksPanel'
import { DocumentPropertiesDialog } from '@/components/documents/DocumentPropertiesDialog'
import { useDocumentSave } from '@/hooks/useDocumentSave'
import { getSetting, db } from '@/lib/db'
import type { Document } from '@/lib/db'
import type { EditorPrefs } from '@/components/settings/Settings'
import { DEFAULT_EDITOR_PREFS } from '@/components/settings/Settings'
import type { TextExpansionEntry } from './extensions/TextExpansion'

interface DocumentEditorWrapperProps {
  document: Document
  onClose?: () => void
}

const MARGIN_MAP: Record<string, string> = {
  narrow:       '15mm 15mm 15mm 15mm',
  normal:       '25mm 20mm 20mm 25mm',
  wide:         '30mm 25mm 25mm 30mm',
  'extra-wide': '35mm 30mm 30mm 35mm',
}

// Paliers de zoom disponibles (en %)
const ZOOM_STEPS = [50, 75, 90, 100, 110, 125, 150, 175, 200]
const ZOOM_DEFAULT = 100

function parseContent(raw: string | undefined | null): string | object {
  if (!raw || raw.trim() === '') return ''
  const trimmed = raw.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { return JSON.parse(trimmed) } catch { /* pas du JSON */ }
  }
  if (trimmed.startsWith('<') || trimmed.includes('</') || trimmed.includes('<p') || trimmed.includes('<br') || trimmed.includes('<div')) {
    return trimmed
  }
  return `<p>${trimmed}</p>`
}

function injectVariableSpans(html: string): string {
  return html.replace(/\[([^\]]+)\]/g, (_, name: string) => {
    const escaped = name.replace(/"/g, '&quot;')
    return `<span data-variable-field="" data-variable-name="${escaped}">${escaped}</span>`
  })
}

/** Compte le nombre de nœuds variableField dans le doc */
function countVariables(editor: Editor): number {
  let count = 0
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'variableField') count++
  })
  return count
}

function CloseDialog({
  open, isSaving, documentTitle,
  onSaveOnly, onSaveAndClose, onClose, onCancel,
}: {
  open: boolean
  isSaving: boolean
  documentTitle: string
  onSaveOnly: () => void
  onSaveAndClose: () => void
  onClose: () => void
  onCancel: () => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm mx-4 rounded-[var(--radius-lg)] bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xl p-6 flex flex-col gap-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[var(--text-base)] font-semibold text-[var(--color-text)] leading-tight">Fermer le document</h2>
            <p className="text-[var(--text-xs)] text-[var(--color-text-muted)] mt-1">
              &laquo;&nbsp;{documentTitle}&nbsp;&raquo; contient des modifications non enregistrées.
            </p>
          </div>
          <button onClick={onCancel} className="flex-shrink-0 p-1 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-offset)] transition-colors" aria-label="Annuler">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <button onClick={onSaveOnly} disabled={isSaving} className="w-full h-9 rounded-[var(--radius-md)] text-[var(--text-sm)] font-medium border border-[var(--color-border)] bg-[var(--color-surface-offset)] text-[var(--color-text)] hover:bg-[var(--color-border)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Enregistrer sans fermer
          </button>
          <button onClick={onSaveAndClose} disabled={isSaving} className="w-full h-9 rounded-[var(--radius-md)] text-[var(--text-sm)] font-medium bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-text-inverse)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Enregistrer et fermer
          </button>
          <button onClick={onClose} className="w-full h-9 rounded-[var(--radius-md)] text-[var(--text-sm)] font-medium border border-[var(--color-error)]/40 text-[var(--color-error)] hover:bg-[var(--color-error)]/8 transition-colors flex items-center justify-center gap-2">
            <X className="w-3.5 h-3.5" />
            Fermer sans enregistrer
          </button>
          <button onClick={onCancel} className="w-full h-8 rounded-[var(--radius-md)] text-[var(--text-xs)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">
            Annuler
          </button>
        </div>
      </div>
    </div>
  )
}

export function DocumentEditorWrapper({ document, onClose }: DocumentEditorWrapperProps) {
  const router = useRouter()
  const [showCloseDialog, setShowCloseDialog]         = useState(false)
  const [showFillDialog, setShowFillDialog]           = useState(false)
  const [showPropsDialog, setShowPropsDialog]         = useState(false)
  const [isOnline, setIsOnline]                       = useState(true)
  const [prefs, setPrefs]                             = useState<EditorPrefs>(DEFAULT_EDITOR_PREFS)
  const [variableCount, setVariableCount]             = useState(0)
  const [zoom, setZoom]                               = useState(ZOOM_DEFAULT)
  const prefsLoaded                                   = useRef(false)

  // Expansions de texte chargées depuis db.snippets
  const [expansions, setExpansions]   = useState<TextExpansionEntry[]>([])
  const expansionsRef                 = useRef<TextExpansionEntry[]>([])

  const editorRef = useRef<Editor | null>(null)

  const [activeVariable, setActiveVariable] = useState<{ name: string; pos: number } | null>(null)
  const [popupAnchor, setPopupAnchor]       = useState<HTMLElement | null>(null)
  const activeVariableRef                   = useRef(activeVariable)
  useEffect(() => { activeVariableRef.current = activeVariable }, [activeVariable])

  const { isSaved, isSaving, lastSavedAt, hasUnsavedChanges, saveNow, markAsChanged } =
    useDocumentSave(document.id, prefs.autoSave ? Number(prefs.autoSaveDelay) * 1000 : 0)

  // Charge les préférences éditeur et initialise le zoom à partir de defaultZoom
  useEffect(() => {
    getSetting<EditorPrefs>('editorPrefs', DEFAULT_EDITOR_PREFS).then((p) => {
      setPrefs(p)
      const savedZoom = p.defaultZoom ?? ZOOM_DEFAULT
      if (ZOOM_STEPS.includes(savedZoom)) setZoom(savedZoom)
      prefsLoaded.current = true
    })
  }, [])

  // Charge les snippets depuis Dexie
  useEffect(() => {
    async function loadExpansions() {
      try {
        const rows = await db.table('snippets').toArray()
        const mapped: TextExpansionEntry[] = rows.map((r: any) => ({
          abbreviation: r.trigger,
          expansion: r.expansion,
        }))
        setExpansions(mapped)
        expansionsRef.current = mapped
      } catch {}
    }
    loadExpansions()
  }, [])

  useEffect(() => {
    const ed = editorRef.current
    if (!ed) return
    const ext = ed.extensionManager.extensions.find(e => e.name === 'textExpansion')
    if (ext) ext.options.expansions = expansions
  }, [expansions])

  useEffect(() => {
    const up   = () => setIsOnline(true)
    const down = () => setIsOnline(false)
    setIsOnline(navigator.onLine)
    window.addEventListener('online',  up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        const ed = editorRef.current
        if (ed) saveNow(JSON.stringify(ed.getJSON()))
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        setZoom((z) => { const idx = ZOOM_STEPS.indexOf(z); return idx < ZOOM_STEPS.length - 1 ? ZOOM_STEPS[idx + 1] : z })
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault()
        setZoom((z) => { const idx = ZOOM_STEPS.indexOf(z); return idx > 0 ? ZOOM_STEPS[idx - 1] : z })
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault()
        setZoom(prefs.defaultZoom ?? ZOOM_DEFAULT)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [saveNow, prefs.defaultZoom])

  useEffect(() => {
    const onBefore = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', onBefore)
    return () => window.removeEventListener('beforeunload', onBefore)
  }, [hasUnsavedChanges])

  const performClose = useCallback(() => {
    if (onClose) onClose()
    else router.push('/documents')
  }, [onClose, router])

  const handleCloseRequest = useCallback(() => {
    if (hasUnsavedChanges) setShowCloseDialog(true)
    else performClose()
  }, [hasUnsavedChanges, performClose])

  const handleSaveOnly = useCallback(async () => {
    const ed = editorRef.current
    if (ed) await saveNow(JSON.stringify(ed.getJSON()))
    setShowCloseDialog(false)
  }, [saveNow])

  const handleSaveAndClose = useCallback(async () => {
    const ed = editorRef.current
    if (ed) await saveNow(JSON.stringify(ed.getJSON()))
    setShowCloseDialog(false)
    performClose()
  }, [saveNow, performClose])

  const handleCloseWithoutSave = useCallback(() => {
    setShowCloseDialog(false)
    performClose()
  }, [performClose])

  const handleVariableClick = useCallback((name: string, pos: number) => {
    const editorDom = window.document.querySelector('.mylex-editor-content')
    const span = editorDom?.querySelector(
      `[data-variable-field][data-variable-name="${CSS.escape(name)}"]`
    ) as HTMLElement | null
    setActiveVariable({ name, pos })
    setPopupAnchor(span)
  }, [])

  const handleVariableConfirm = useCallback((value: string) => {
    const ed = editorRef.current
    const av = activeVariableRef.current
    if (!ed || !av) return
    ed.commands.replaceVariable(av.pos, value)
    setActiveVariable(null)
    setPopupAnchor(null)
    setTimeout(() => {
      const c = editorRef.current ? countVariables(editorRef.current) : 0
      setVariableCount(c)
    }, 50)
  }, [])

  const handleVariableClose = useCallback(() => {
    setActiveVariable(null)
    setPopupAnchor(null)
  }, [])

  const handleFillDialogClose = useCallback(() => {
    setShowFillDialog(false)
    setTimeout(() => {
      const c = editorRef.current ? countVariables(editorRef.current) : 0
      setVariableCount(c)
    }, 50)
  }, [])

  // ── Insertion d'une brique au curseur ─────────────────────────────────────
  // brickContentToHtml est importé depuis DocumentBricksPanel (gère Markdown + variables)
  const handleInsertBrick = useCallback((brickHtml: string) => {
    const ed = editorRef.current
    if (!ed) return
    ed.chain().focus().insertContent(brickHtml).run()
    setTimeout(() => {
      const c = editorRef.current ? countVariables(editorRef.current) : 0
      setVariableCount(c)
    }, 50)
  }, [])

  // ── Drop d'une brique depuis le panneau ─────────────────────────────────
  const handleEditorDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    const brickData = e.dataTransfer.getData(DRAG_BRICK_KEY)
    if (!brickData) return // laisse TipTap gérer les autres drops
    e.preventDefault()
    try {
      const brick: Brick = JSON.parse(brickData)
      const ed = editorRef.current
      if (!ed) return
      // Détermine la position de drop dans l'éditeur
      const view = ed.view
      const coords = { left: e.clientX, top: e.clientY }
      const pos = view.posAtCoords(coords)
      const html = brickContentToHtml(brick.content)
      if (pos) {
        ed.chain().focus().insertContentAt(pos.pos, html).run()
      } else {
        ed.chain().focus().insertContent(html).run()
      }
      setTimeout(() => {
        const c = editorRef.current ? countVariables(editorRef.current) : 0
        setVariableCount(c)
      }, 50)
    } catch {}
  }, [])

  // Zoom helpers
  const zoomIn    = useCallback(() => setZoom((z) => { const idx = ZOOM_STEPS.indexOf(z); return idx < ZOOM_STEPS.length - 1 ? ZOOM_STEPS[idx + 1] : z }), [])
  const zoomOut   = useCallback(() => setZoom((z) => { const idx = ZOOM_STEPS.indexOf(z); return idx > 0 ? ZOOM_STEPS[idx - 1] : z }), [])
  const zoomReset = useCallback(() => setZoom(prefs.defaultZoom ?? ZOOM_DEFAULT), [prefs.defaultZoom])

  const initialContent = (() => {
    const parsed = parseContent(document.content)
    if (typeof parsed === 'string') return injectVariableSpans(parsed)
    return parsed
  })()

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
      Placeholder.configure({ placeholder: 'Commencez à rédiger votre document…' }),
      VariableField.configure({
        onVariableClick: handleVariableClick,
        HTMLAttributes: {},
      }),
      TextExpansion.configure({
        expansions: expansionsRef.current,
        triggers: [' ', 'Enter'],
      }),
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: 'mylex-editor-content',
        spellcheck: prefs.spellcheck ? 'true' : 'false',
        lang: 'fr',
      },
    },
    onUpdate: ({ editor: ed }) => {
      markAsChanged(JSON.stringify(ed.getJSON()))
      setVariableCount(countVariables(ed))
    },
  })

  useEffect(() => {
    editorRef.current = editor ?? null
    if (editor) setVariableCount(countVariables(editor))
  }, [editor])

  useEffect(() => {
    if (!editor || !prefsLoaded.current) return
    editor.chain().focus().setFontFamily(prefs.fontFamily).setFontSize(`${prefs.fontSize}pt`).run()
    if (prefs.defaultTextAlign !== 'left') editor.chain().setTextAlign(prefs.defaultTextAlign).run()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, prefsLoaded.current])

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

  const wordCount   = editor?.storage.characterCount.words()      ?? 0
  const charCount   = editor?.storage.characterCount.characters() ?? 0
  const pagePadding = MARGIN_MAP[prefs.pageMargin] ?? MARGIN_MAP.normal

  const A4_WIDTH_MM = 210
  const scaleFactor = zoom / 100

  const SaveIndicator = () => {
    if (isSaving) return (
      <span className="flex items-center gap-1.5 text-[var(--text-xs)] text-[var(--color-text-muted)]">
        <Loader2 className="w-3 h-3 animate-spin" />Enregistrement…
      </span>
    )
    if (isSaved && lastSavedAt) return (
      <span className="flex items-center gap-1.5 text-[var(--text-xs)] text-[var(--color-text-muted)]">
        <Check className="w-3 h-3 text-[var(--color-success)]" />Enregistré {formatRelativeTime(lastSavedAt)}
      </span>
    )
    if (hasUnsavedChanges) return (
      <span className="flex items-center gap-1.5 text-[var(--text-xs)] text-[var(--color-warning)]">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-warning)] animate-pulse" />
        Modifications non enregistrées
      </span>
    )
    return null
  }

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden bg-[var(--color-surface-offset)]">
        {/* Barre de titre */}
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-[var(--color-surface)] border-b border-[var(--color-border)] flex-shrink-0">
          <input
            type="text"
            defaultValue={document.title || 'Sans titre'}
            onBlur={(e) => {
              const ed = editorRef.current
              if (ed) saveNow(JSON.stringify(ed.getJSON()), e.target.value)
            }}
            className="flex-1 min-w-0 text-[var(--text-sm)] font-semibold text-[var(--color-text)] bg-transparent border-none outline-none hover:bg-[var(--color-surface-offset)] focus:bg-[var(--color-surface-offset)] rounded-[var(--radius-sm)] px-2 py-1 -mx-2 transition-colors"
            placeholder="Sans titre"
            aria-label="Titre du document"
          />
          <div className="flex items-center gap-3 flex-shrink-0">
            <SaveIndicator />
            <span
              className={`flex items-center gap-1 text-[var(--text-xs)] ${
                isOnline ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]'
              }`}
              title={isOnline ? 'Synchronisation active' : 'Hors ligne — sauvegarde locale uniquement'}
            >
              {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            </span>
            <button
              type="button"
              onClick={() => setShowPropsDialog(true)}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[var(--radius-md)] text-[var(--text-sm)] font-medium border border-[var(--color-border)] bg-[var(--color-surface-offset)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-border)] transition-colors"
              title="Propriétés du document (dossier, statut, intervenants, versions)"
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>Propriétés</span>
            </button>
            <button
              type="button"
              onClick={() => { const ed = editorRef.current; if (ed) saveNow(JSON.stringify(ed.getJSON())) }}
              disabled={isSaving || isSaved}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[var(--radius-md)] text-[var(--text-sm)] font-medium bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-text-inverse)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Enregistrer (Ctrl+S)"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>Enregistrer</span>
            </button>
            <button
              type="button"
              onClick={handleCloseRequest}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[var(--radius-md)] text-[var(--text-sm)] font-medium border border-[var(--color-border)] bg-[var(--color-surface-offset)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-border)] transition-colors"
              title="Fermer le document"
            >
              <X className="w-3.5 h-3.5" />
              <span>Fermer</span>
            </button>
          </div>
        </div>

        <WordToolbar
          editor={editor}
          onInsertLink={handleInsertLink}
          onInsertImage={handleInsertImage}
          onFillVariables={() => setShowFillDialog(true)}
          hasVariables={variableCount > 0}
          defaultFontFamily={prefs.fontFamily}
          defaultFontSize={String(prefs.fontSize)}
        />

        {/* Ligne principale : éditeur + panneau briques */}
        <div className="flex flex-1 overflow-hidden">

          {/* Zone de document avec zoom */}
          <div
            className="flex-1 overflow-y-auto overflow-x-auto bg-[#e8e8e8] dark:bg-[#2a2a2a] px-8 py-8"
            onDrop={handleEditorDrop}
            onDragOver={(e) => {
              // Autorise le drop de briques
              if (e.dataTransfer.types.includes(DRAG_BRICK_KEY)) e.preventDefault()
            }}
          >
            <div
              style={{
                width: `${A4_WIDTH_MM * scaleFactor}mm`,
                margin: '0 auto',
              }}
            >
              <div
                style={{
                  width: `${A4_WIDTH_MM}mm`,
                  maxWidth: '100%',
                  padding: pagePadding,
                  background: 'white',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
                  minHeight: '297mm',
                  transformOrigin: 'top left',
                  transform: `scale(${scaleFactor})`,
                  transition: 'transform 0.15s ease',
                }}
              >
                <EditorContent editor={editor} />
              </div>
            </div>
          </div>

          {/* Panneau Boîte à outils (briques) */}
          <DocumentBricksPanel
            onInsertBrick={handleInsertBrick}
            dossierId={document.dossierId}
          />
        </div>

        {/* Barre de statut */}
        {prefs.showStatusBar && (
          <div className="flex items-center justify-between px-4 py-1 bg-[var(--color-primary)] text-white text-[var(--text-xs)] flex-shrink-0">
            <div className="flex items-center gap-4">
              {prefs.showWordCount && (
                <>
                  <span>{wordCount} mot{wordCount !== 1 ? 's' : ''}</span>
                  <span>{charCount} caractère{charCount !== 1 ? 's' : ''}</span>
                </>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* Contrôles de zoom */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={zoomOut}
                  disabled={zoom <= ZOOM_STEPS[0]}
                  aria-label="Réduire le zoom"
                  className="flex items-center justify-center w-5 h-5 rounded hover:bg-white/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ZoomOut className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={zoomReset}
                  title={`Cliquer pour revenir au zoom par défaut (${prefs.defaultZoom ?? 100}%)`}
                  className="min-w-[38px] text-center font-mono text-[10px] tabular-nums hover:bg-white/20 rounded px-1 py-0.5 transition-colors cursor-pointer"
                >
                  {zoom}%
                </button>
                <button
                  type="button"
                  onClick={zoomIn}
                  disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
                  aria-label="Augmenter le zoom"
                  className="flex items-center justify-center w-5 h-5 rounded hover:bg-white/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ZoomIn className="w-3 h-3" />
                </button>
              </div>

              {variableCount > 0 && (
                <span className="opacity-80">
                  {variableCount} champ{variableCount > 1 ? 's' : ''} à renseigner
                </span>
              )}
              {document.type && <span className="opacity-75 capitalize">{document.type}</span>}
              <span className="opacity-75">
                {lastSavedAt
                  ? `Modifié ${formatRelativeTime(lastSavedAt)}`
                  : `Créé ${formatRelativeTime(new Date(document.createdAt))}`
                }
              </span>
            </div>
          </div>
        )}
      </div>

      <CloseDialog
        open={showCloseDialog}
        isSaving={isSaving}
        documentTitle={document.title || 'Sans titre'}
        onSaveOnly={handleSaveOnly}
        onSaveAndClose={handleSaveAndClose}
        onClose={handleCloseWithoutSave}
        onCancel={() => setShowCloseDialog(false)}
      />

      <FillAllVariablesDialog
        open={showFillDialog}
        editor={editor}
        onClose={handleFillDialogClose}
      />

      <VariablePopup
        variableName={activeVariable?.name ?? null}
        anchorEl={popupAnchor}
        onConfirm={handleVariableConfirm}
        onClose={handleVariableClose}
      />

      <DocumentPropertiesDialog
        open={showPropsDialog}
        document={document}
        onClose={() => setShowPropsDialog(false)}
      />

      <style jsx global>{`
        .mylex-editor-content {
          font-family: ${prefs.fontFamily};
          font-size: ${prefs.fontSize}pt;
          line-height: ${prefs.lineHeight};
          color: #28251d;
          min-height: 200px;
          outline: none;
        }
        [data-theme="dark"] .mylex-editor-content { color: #d4d0c8; }
        .mylex-editor-content p.is-editor-empty:first-child::before { content: attr(data-placeholder); float: left; color: #9ca3af; pointer-events: none; height: 0; font-style: italic; }
        .mylex-editor-content h1 { font-size: 2em; font-weight: 700; margin: 1em 0 0.5em; line-height: 1.2; }
        .mylex-editor-content h2 { font-size: 1.5em; font-weight: 700; margin: 0.9em 0 0.4em; }
        .mylex-editor-content h3 { font-size: 1.25em; font-weight: 600; margin: 0.8em 0 0.35em; }
        .mylex-editor-content h4 { font-size: 1.1em; font-weight: 600; margin: 0.7em 0 0.3em; }
        .mylex-editor-content p { margin-bottom: 0.75em; }
        .mylex-editor-content p:last-child { margin-bottom: 0; }
        .mylex-editor-content ul, .mylex-editor-content ol { padding-left: 1.5em; margin-bottom: 0.75em; }
        .mylex-editor-content li { margin-bottom: 0.25em; }
        .mylex-editor-content ul { list-style-type: disc; }
        .mylex-editor-content ul ul { list-style-type: circle; }
        .mylex-editor-content ol { list-style-type: decimal; }
        .mylex-editor-content ul[data-type="taskList"] { list-style: none; padding-left: 0.5em; }
        .mylex-editor-content ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 0.5em; }
        .mylex-editor-content ul[data-type="taskList"] li > label { flex-shrink: 0; margin-top: 0.2em; }
        .mylex-editor-content blockquote { border-left: 3px solid #01696f; padding: 0.5em 0 0.5em 1.25em; margin: 1em 0; color: #6b7280; font-style: italic; }
        .mylex-editor-content code { font-family: 'JetBrains Mono', 'Courier New', monospace; font-size: 0.875em; background: #f3f4f6; border-radius: 3px; padding: 0.15em 0.4em; color: #c7254e; }
        [data-theme="dark"] .mylex-editor-content code { background: #2d2d2d; color: #e06c75; }
        .mylex-editor-content pre { background: #1e1e1e; color: #d4d4d4; font-family: 'JetBrains Mono', monospace; font-size: 0.875em; padding: 1em 1.25em; border-radius: 6px; margin: 1em 0; overflow-x: auto; line-height: 1.6; }
        .mylex-editor-content pre code { background: none; padding: 0; color: inherit; font-size: inherit; }
        .mylex-editor-content hr { border: none; border-top: 1px solid #d1d5db; margin: 1.5em 0; }
        .mylex-editor-content a { color: #01696f; text-decoration: underline; text-underline-offset: 2px; }
        .mylex-editor-content a:hover { color: #0c4e54; }
        .mylex-editor-content table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 0.9em; }
        .mylex-editor-content th, .mylex-editor-content td { border: 1px solid #d1d5db; padding: 0.5em 0.75em; text-align: left; vertical-align: top; }
        .mylex-editor-content th { background: #f9fafb; font-weight: 600; color: #374151; }
        .mylex-editor-content tr:nth-child(even) td { background: #fafafa; }
        .mylex-editor-content .selectedCell { background: #dbeafe !important; }
        .mylex-editor-content .column-resize-handle { position: absolute; right: -2px; top: 0; bottom: 0; width: 4px; background: #01696f; cursor: col-resize; pointer-events: all; }
        .mylex-editor-content img { max-width: 100%; height: auto; border-radius: 4px; margin: 0.5em 0; }
        .mylex-editor-content mark { border-radius: 2px; padding: 0.1em 0; }
        .mylex-editor-content ::selection { background: rgba(1, 105, 111, 0.2); }

        /* ── Base commune à toutes les étiquettes de variables ── */
        .mylex-editor-content [data-variable-field] {
          display: inline-flex; align-items: center; cursor: pointer; user-select: none;
          font-size: 0.82em; font-weight: 500; letter-spacing: 0.01em;
          padding: 0.1em 0.55em; border-radius: 4px;
          border: 1.5px solid currentColor;
          transition: background 0.15s, border-color 0.15s, color 0.15s;
          vertical-align: baseline; line-height: 1.5; margin: 0 1px;
        }
        .mylex-editor-content [data-variable-field].ProseMirror-selectednode { outline: 2px solid currentColor; outline-offset: 1px; }

        /* ── Dates (bleu indigo) ── */
        .mylex-editor-content [data-variable-field][data-variable-type="date"] {
          color: #4f46e5; background: rgba(79, 70, 229, 0.07);
        }
        .mylex-editor-content [data-variable-field][data-variable-type="date"]:hover {
          background: rgba(79, 70, 229, 0.15);
        }

        /* ── Noms propres (vert teal — couleur primaire app) ── */
        .mylex-editor-content [data-variable-field][data-variable-type="name"] {
          color: #01696f; background: rgba(1, 105, 111, 0.07);
        }
        .mylex-editor-content [data-variable-field][data-variable-type="name"]:hover {
          background: rgba(1, 105, 111, 0.15);
        }

        /* ── Adresses (orange) ── */
        .mylex-editor-content [data-variable-field][data-variable-type="address"] {
          color: #c2410c; background: rgba(194, 65, 12, 0.07);
        }
        .mylex-editor-content [data-variable-field][data-variable-type="address"]:hover {
          background: rgba(194, 65, 12, 0.15);
        }

        /* ── Prix / montants (vert émeraude) ── */
        .mylex-editor-content [data-variable-field][data-variable-type="price"] {
          color: #15803d; background: rgba(21, 128, 61, 0.07);
        }
        .mylex-editor-content [data-variable-field][data-variable-type="price"]:hover {
          background: rgba(21, 128, 61, 0.15);
        }

        /* ── Durées (violet) ── */
        .mylex-editor-content [data-variable-field][data-variable-type="duration"] {
          color: #7c3aed; background: rgba(124, 58, 237, 0.07);
        }
        .mylex-editor-content [data-variable-field][data-variable-type="duration"]:hover {
          background: rgba(124, 58, 237, 0.15);
        }

        /* ── Références / numéros (rose) ── */
        .mylex-editor-content [data-variable-field][data-variable-type="reference"] {
          color: #be185d; background: rgba(190, 24, 93, 0.07);
        }
        .mylex-editor-content [data-variable-field][data-variable-type="reference"]:hover {
          background: rgba(190, 24, 93, 0.15);
        }

        /* ── Défaut (gris neutre) ── */
        .mylex-editor-content [data-variable-field][data-variable-type="default"],
        .mylex-editor-content [data-variable-field]:not([data-variable-type]) {
          color: #6b7280; background: rgba(107, 114, 128, 0.07);
        }
        .mylex-editor-content [data-variable-field][data-variable-type="default"]:hover,
        .mylex-editor-content [data-variable-field]:not([data-variable-type]):hover {
          background: rgba(107, 114, 128, 0.15);
        }

        /* ── Dark mode ── */
        [data-theme="dark"] .mylex-editor-content [data-variable-field][data-variable-type="date"]      { color: #818cf8; background: rgba(129, 140, 248, 0.12); }
        [data-theme="dark"] .mylex-editor-content [data-variable-field][data-variable-type="name"]      { color: #2ec4b6; background: rgba(46, 196, 182, 0.10); }
        [data-theme="dark"] .mylex-editor-content [data-variable-field][data-variable-type="address"]   { color: #fb923c; background: rgba(251, 146, 60, 0.10); }
        [data-theme="dark"] .mylex-editor-content [data-variable-field][data-variable-type="price"]     { color: #4ade80; background: rgba(74, 222, 128, 0.10); }
        [data-theme="dark"] .mylex-editor-content [data-variable-field][data-variable-type="duration"]  { color: #c084fc; background: rgba(192, 132, 252, 0.10); }
        [data-theme="dark"] .mylex-editor-content [data-variable-field][data-variable-type="reference"] { color: #f472b6; background: rgba(244, 114, 182, 0.10); }
        [data-theme="dark"] .mylex-editor-content [data-variable-field][data-variable-type="default"],
        [data-theme="dark"] .mylex-editor-content [data-variable-field]:not([data-variable-type])       { color: #9ca3af; background: rgba(156, 163, 175, 0.10); }
      `}</style>
    </>
  )
}

function formatRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 10) return "l'instant"
  if (seconds < 60) return `il y a ${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `il y a ${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours}h`
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}
