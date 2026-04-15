// components/editor/DocumentEditorWrapper.tsx
// Wrapper éditeur : applique les préférences utilisateur (police, taille, interligne, marges, spellcheck…)
// Bouton Fermer avec popup 3 actions : Enregistrer sans fermer / Enregistrer et fermer / Annuler

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
import { Save, Check, Loader2, Wifi, WifiOff, X } from 'lucide-react'

import { WordToolbar } from './WordToolbar'
import { useDocumentSave } from '@/hooks/useDocumentSave'
import { getSetting } from '@/lib/db'
import type { Document } from '@/lib/db'
import type { EditorPrefs } from '@/components/settings/Settings'
import { DEFAULT_EDITOR_PREFS } from '@/components/settings/Settings'

interface DocumentEditorWrapperProps {
  document: Document
  onClose?: () => void
}

// ── Marges page A4 selon le réglage ──────────────────────────────────────────
const MARGIN_MAP: Record<string, string> = {
  narrow:     '15mm 15mm 15mm 15mm',
  normal:     '25mm 20mm 20mm 25mm',
  wide:       '30mm 25mm 25mm 30mm',
  'extra-wide': '35mm 30mm 30mm 35mm',
}

// ── Détection automatique du format de contenu ────────────────────────────────
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

// ── Popup Fermer ──────────────────────────────────────────────────────────────
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
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onCancel} />
      {/* Modal */}
      <div className="relative z-10 w-full max-w-sm mx-4 rounded-[var(--radius-lg)] bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xl p-6 flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[var(--text-base)] font-semibold text-[var(--color-text)] leading-tight">
              Fermer le document
            </h2>
            <p className="text-[var(--text-xs)] text-[var(--color-text-muted)] mt-1">
              &laquo;&nbsp;{documentTitle}&nbsp;&raquo; contient des modifications non enregistrées.
            </p>
          </div>
          <button
            onClick={onCancel}
            className="flex-shrink-0 p-1 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-offset)] transition-colors"
            aria-label="Annuler"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          {/* Enregistrer sans fermer */}
          <button
            onClick={onSaveOnly}
            disabled={isSaving}
            className="w-full h-9 rounded-[var(--radius-md)] text-[var(--text-sm)] font-medium border border-[var(--color-border)] bg-[var(--color-surface-offset)] text-[var(--color-text)] hover:bg-[var(--color-border)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Enregistrer sans fermer
          </button>

          {/* Enregistrer et fermer */}
          <button
            onClick={onSaveAndClose}
            disabled={isSaving}
            className="w-full h-9 rounded-[var(--radius-md)] text-[var(--text-sm)] font-medium bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-text-inverse)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Enregistrer et fermer
          </button>

          {/* Fermer sans enregistrer */}
          <button
            onClick={onClose}
            className="w-full h-9 rounded-[var(--radius-md)] text-[var(--text-sm)] font-medium border border-[var(--color-error)]/40 text-[var(--color-error)] hover:bg-[var(--color-error)]/8 transition-colors flex items-center justify-center gap-2"
          >
            <X className="w-3.5 h-3.5" />
            Fermer sans enregistrer
          </button>

          {/* Annuler */}
          <button
            onClick={onCancel}
            className="w-full h-8 rounded-[var(--radius-md)] text-[var(--text-xs)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Composant principal ───────────────────────────────────────────────────────
export function DocumentEditorWrapper({ document, onClose }: DocumentEditorWrapperProps) {
  const router = useRouter()
  const [showCloseDialog, setShowCloseDialog] = useState(false)
  const [isOnline, setIsOnline]               = useState(true)
  const [prefs, setPrefs]                     = useState<EditorPrefs>(DEFAULT_EDITOR_PREFS)
  const prefsLoaded                           = useRef(false)

  const { isSaved, isSaving, lastSavedAt, hasUnsavedChanges, saveNow, markAsChanged } =
    useDocumentSave(document.id, prefs.autoSave ? Number(prefs.autoSaveDelay) * 1000 : 0)

  // ── Chargement des préférences depuis IndexedDB ──────────────────────────
  useEffect(() => {
    getSetting<EditorPrefs>('editorPrefs', DEFAULT_EDITOR_PREFS).then((p) => {
      setPrefs(p)
      prefsLoaded.current = true
    })
  }, [])

  // ── Réseau ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const up   = () => setIsOnline(true)
    const down = () => setIsOnline(false)
    setIsOnline(navigator.onLine)
    window.addEventListener('online',  up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])

  // ── Navigation ───────────────────────────────────────────────────────────
  const performClose = useCallback(() => {
    if (onClose) onClose()
    else router.push('/documents')
  }, [onClose, router])

  const handleCloseRequest = useCallback(() => {
    if (hasUnsavedChanges) setShowCloseDialog(true)
    else performClose()
  }, [hasUnsavedChanges, performClose])

  const handleSaveOnly = useCallback(async () => {
    if (editor) await saveNow(JSON.stringify(editor.getJSON()))
    setShowCloseDialog(false)
  }, [saveNow])

  const handleSaveAndClose = useCallback(async () => {
    if (editor) await saveNow(JSON.stringify(editor.getJSON()))
    setShowCloseDialog(false)
    performClose()
  }, [saveNow, performClose])

  const handleCloseWithoutSave = useCallback(() => {
    setShowCloseDialog(false)
    performClose()
  }, [performClose])

  // ── Ctrl+S ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (editor) saveNow(JSON.stringify(editor.getJSON()))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [saveNow])

  // ── beforeunload ─────────────────────────────────────────────────────────
  useEffect(() => {
    const onBefore = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', onBefore)
    return () => window.removeEventListener('beforeunload', onBefore)
  }, [hasUnsavedChanges])

  // ── Initialisation de l'éditeur ──────────────────────────────────────────
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
      Underline, TextStyle, FontFamily, Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } }),
      Image.configure({ inline: true, allowBase64: true }),
      Table.configure({ resizable: true }), TableRow, TableCell, TableHeader,
      Subscript, Superscript,
      TaskList, TaskItem.configure({ nested: true }),
      CharacterCount,
      Placeholder.configure({ placeholder: 'Commencez à rédiger votre document…' }),
    ],
    content: parseContent(document.content),
    editorProps: {
      attributes: {
        class: 'mylex-editor-content',
        spellcheck: prefs.spellcheck ? 'true' : 'false',
        lang: 'fr',
      },
    },
    onUpdate: ({ editor }) => markAsChanged(JSON.stringify(editor.getJSON())),
  })

  // ── Applique la police + alignement dès que les préférences sont chargées
  // et que l'éditeur est prêt (uniquement si document vierge) ─────────────
  useEffect(() => {
    if (!editor || !prefsLoaded.current) return
    // Applique la police via TipTap FontFamily
    editor.chain().focus().setFontFamily(prefs.fontFamily).run()
    // Applique l'alignement par défaut
    if (prefs.defaultTextAlign !== 'left') {
      editor.chain().setTextAlign(prefs.defaultTextAlign).run()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, prefsLoaded.current])

  // ── Liens & images ───────────────────────────────────────────────────────
  const handleInsertLink = useCallback(() => {
    if (!editor) return
    const prev = editor.getAttributes('link').href
    const url = window.prompt('URL du lien :', prev ?? 'https://')
    if (url === null) return
    if (url === '') editor.chain().focus().extendMarkRange('link').unsetLink().run()
    else editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }, [editor])

  const handleInsertImage = useCallback(() => {
    if (!editor) return
    const url = window.prompt("URL de l'image :")
    if (url) editor.chain().focus().setImage({ src: url }).run()
  }, [editor])

  const wordCount = editor?.storage.characterCount.words()      ?? 0
  const charCount = editor?.storage.characterCount.characters() ?? 0
  const pagePadding = MARGIN_MAP[prefs.pageMargin] ?? MARGIN_MAP.normal

  // ── Indicateur de sauvegarde ─────────────────────────────────────────────
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

        {/* En-tête */}
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-[var(--color-surface)] border-b border-[var(--color-border)] flex-shrink-0">
          {/* Titre éditable */}
          <input
            type="text"
            defaultValue={document.title || 'Sans titre'}
            onBlur={(e) => { if (editor) saveNow(JSON.stringify(editor.getJSON()), e.target.value) }}
            className="flex-1 min-w-0 text-[var(--text-sm)] font-semibold text-[var(--color-text)] bg-transparent border-none outline-none hover:bg-[var(--color-surface-offset)] focus:bg-[var(--color-surface-offset)] rounded-[var(--radius-sm)] px-2 py-1 -mx-2 transition-colors"
            placeholder="Sans titre"
            aria-label="Titre du document"
          />

          <div className="flex items-center gap-3 flex-shrink-0">
            <SaveIndicator />

            {/* Indicateur réseau */}
            <span
              className={`flex items-center gap-1 text-[var(--text-xs)] ${
                isOnline ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]'
              }`}
              title={isOnline ? 'Synchronisation active' : 'Hors ligne — sauvegarde locale uniquement'}
            >
              {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            </span>

            {/* Bouton Enregistrer */}
            <button
              type="button"
              onClick={() => editor && saveNow(JSON.stringify(editor.getJSON()))}
              disabled={isSaving || isSaved}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[var(--radius-md)] text-[var(--text-sm)] font-medium bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-text-inverse)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Enregistrer (Ctrl+S)"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>Enregistrer</span>
            </button>

            {/* Bouton Fermer */}
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

        {/* Barre d'outils Word */}
        <WordToolbar editor={editor} onInsertLink={handleInsertLink} onInsertImage={handleInsertImage} />

        {/* Page A4 */}
        <div className="flex-1 overflow-y-auto bg-[#e8e8e8] dark:bg-[#2a2a2a] px-8 py-8">
          <div
            className="mx-auto bg-white dark:bg-[#1e1e1e] shadow-[0_2px_8px_rgba(0,0,0,0.15),0_0_0_1px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_12px_rgba(0,0,0,0.5)] min-h-[297mm]"
            style={{ width: '210mm', maxWidth: '100%', padding: pagePadding }}
          >
            <EditorContent editor={editor} />
          </div>
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

      {/* Popup Fermer */}
      <CloseDialog
        open={showCloseDialog}
        isSaving={isSaving}
        documentTitle={document.title || 'Sans titre'}
        onSaveOnly={handleSaveOnly}
        onSaveAndClose={handleSaveAndClose}
        onClose={handleCloseWithoutSave}
        onCancel={() => setShowCloseDialog(false)}
      />

      {/* Styles TipTap — police et interligne injectés depuis les préférences */}
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
      `}</style>
    </>
  )
}

function formatRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 10) return 'à l\'instant'
  if (seconds < 60) return `il y a ${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `il y a ${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours}h`
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}
