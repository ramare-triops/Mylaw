// components/editor/WordToolbar.tsx
// Barre d'outils style Word — police et taille se mettent à jour en temps réel
// via useEditorState(). Lecture de fontSize via l'extension FontSize custom.

'use client'

import { type Editor, useEditorState } from '@tiptap/react'
import {
  Undo2, Redo2,
  Bold, Italic, Underline, Strikethrough, Subscript, Superscript,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, ListTodo,
  Indent, Outdent,
  Link2, Image, Table, Minus, Quote,
  Highlighter, RemoveFormatting, Code, Pilcrow,
  ChevronDown, Type,
} from 'lucide-react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Tooltip from '@radix-ui/react-tooltip'

interface WordToolbarProps {
  editor: Editor | null
  onInsertLink: () => void
  onInsertImage: () => void
  defaultFontFamily?: string
  defaultFontSize?: string
}

const FONT_FAMILIES = [
  { label: 'Georgia',         value: 'Georgia, serif' },
  { label: 'Source Serif 4',  value: "'Source Serif 4', Georgia, serif" },
  { label: 'Times New Roman', value: "'Times New Roman', Times, serif" },
  { label: 'Geist',           value: "'Geist', 'Inter', sans-serif" },
  { label: 'Inter',           value: "'Inter', sans-serif" },
  { label: 'Arial',           value: 'Arial, Helvetica, sans-serif' },
  { label: 'Courier New',     value: "'Courier New', Courier, monospace" },
  { label: 'JetBrains Mono',  value: "'JetBrains Mono', 'Courier New', monospace" },
]

const FONT_SIZES = ['8','9','10','11','12','14','16','18','20','24','28','32','36','48','72']

const HEADING_STYLES = [
  { label: 'Texte normal', value: 'paragraph' },
  { label: 'Titre 1',      value: 'h1',         className: 'text-2xl font-bold' },
  { label: 'Titre 2',      value: 'h2',         className: 'text-xl font-bold' },
  { label: 'Titre 3',      value: 'h3',         className: 'text-lg font-semibold' },
  { label: 'Titre 4',      value: 'h4',         className: 'text-base font-semibold' },
  { label: 'Citation',     value: 'blockquote', className: 'italic text-[var(--color-text-muted)]' },
  { label: 'Code',         value: 'codeBlock',  className: 'font-mono text-sm' },
]

const HIGHLIGHT_COLORS = [
  { color: '#fef08a', label: 'Jaune' },
  { color: '#bbf7d0', label: 'Vert' },
  { color: '#bfdbfe', label: 'Bleu' },
  { color: '#fecaca', label: 'Rouge' },
  { color: '#e9d5ff', label: 'Violet' },
  { color: '#fed7aa', label: 'Orange' },
  { color: '#f1f5f9', label: 'Gris' },
]

const TEXT_COLORS = [
  { color: '#28251d', label: 'Noir' },
  { color: '#dc2626', label: 'Rouge' },
  { color: '#2563eb', label: 'Bleu' },
  { color: '#16a34a', label: 'Vert' },
  { color: '#9333ea', label: 'Violet' },
  { color: '#ea580c', label: 'Orange' },
  { color: '#0891b2', label: 'Cyan' },
  { color: '#ca8a04', label: 'Or' },
  { color: '#6b7280', label: 'Gris' },
  { color: '#01696f', label: 'Teal' },
]

function fontLabel(value: string): string {
  const known = FONT_FAMILIES.find((f) => f.value === value)
  if (known) return known.label
  return value.split(',')[0].replace(/['"/]/g, '').trim()
}

/** Extrait le nombre seul : "12pt" → "12", "16px" → "16", "12" → "12" */
function normalizeSize(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw.replace(/[^0-9.]/g, '').trim()
}

function ToolbarTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip.Provider delayDuration={400}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className="z-50 px-2 py-1 rounded text-xs bg-[var(--color-text)] text-[var(--color-bg)] shadow-md select-none" sideOffset={4}>
            {label}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}

function ToolbarButton({ label, isActive = false, disabled = false, onClick, children }: {
  label: string; isActive?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <ToolbarTooltip label={label}>
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); onClick() }}
        disabled={disabled}
        aria-label={label}
        aria-pressed={isActive}
        className={`inline-flex items-center justify-center w-7 h-7 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] focus-visible:outline-offset-1 ${
          isActive ? 'bg-[var(--color-primary-highlight)] text-[var(--color-primary)]' : 'hover:bg-[var(--color-surface-offset)] hover:text-[var(--color-text)]'
        }`}
      >
        {children}
      </button>
    </ToolbarTooltip>
  )
}

function ToolbarDivider() {
  return <div className="w-px h-5 bg-[var(--color-divider)] mx-1 flex-shrink-0" aria-hidden />
}

export function WordToolbar({
  editor,
  onInsertLink,
  onInsertImage,
  defaultFontFamily = 'Georgia, serif',
  defaultFontSize   = '12',
}: WordToolbarProps) {

  const editorState = useEditorState({
    editor,
    selector: (ctx) => {
      const e = ctx.editor
      if (!e) return null

      let headingLabel = 'Texte normal'
      for (let i = 1; i <= 4; i++) {
        if (e.isActive('heading', { level: i })) { headingLabel = `Titre ${i}`; break }
      }
      if (e.isActive('blockquote')) headingLabel = 'Citation'
      if (e.isActive('codeBlock'))  headingLabel = 'Code'

      const textStyle  = e.getAttributes('textStyle')
      // fontSize est maintenant un attribut déclaré par l'extension FontSize
      const fontSize   = textStyle.fontSize   as string | null | undefined
      const fontFamily = textStyle.fontFamily as string | null | undefined

      return {
        headingLabel,
        fontFamily:     fontFamily  ?? defaultFontFamily,
        // Retourne null si pas de mark pour déclencher le fallback sur defaultFontSize
        fontSize:       fontSize    ?? null,
        textColor:      (textStyle.color as string | undefined) ?? '#28251d',
        isBold:         e.isActive('bold'),
        isItalic:       e.isActive('italic'),
        isUnderline:    e.isActive('underline'),
        isStrike:       e.isActive('strike'),
        isSubscript:    e.isActive('subscript'),
        isSuperscript:  e.isActive('superscript'),
        isHighlight:    e.isActive('highlight'),
        isLink:         e.isActive('link'),
        isTable:        e.isActive('table'),
        isBulletList:   e.isActive('bulletList'),
        isOrderedList:  e.isActive('orderedList'),
        isTaskList:     e.isActive('taskList'),
        isBlockquote:   e.isActive('blockquote'),
        isCodeBlock:    e.isActive('codeBlock'),
        isAlignLeft:    e.isActive({ textAlign: 'left' }),
        isAlignCenter:  e.isActive({ textAlign: 'center' }),
        isAlignRight:   e.isActive({ textAlign: 'right' }),
        isAlignJustify: e.isActive({ textAlign: 'justify' }),
        canUndo:        e.can().undo(),
        canRedo:        e.can().redo(),
      }
    },
  })

  if (!editor || !editorState) return null

  const {
    headingLabel, fontFamily, fontSize, textColor,
    isBold, isItalic, isUnderline, isStrike, isSubscript, isSuperscript,
    isHighlight, isLink, isTable,
    isBulletList, isOrderedList, isTaskList,
    isBlockquote, isCodeBlock,
    isAlignLeft, isAlignCenter, isAlignRight, isAlignJustify,
    canUndo, canRedo,
  } = editorState

  const displayFont = fontLabel(fontFamily)
  // Si fontSize est null (pas de mark explicite), affiche la taille par défaut des prefs
  const displaySize = fontSize ? normalizeSize(fontSize) : defaultFontSize

  const applyHeadingStyle = (value: string) => {
    if (!editor) return
    switch (value) {
      case 'h1': editor.chain().focus().toggleHeading({ level: 1 }).run(); break
      case 'h2': editor.chain().focus().toggleHeading({ level: 2 }).run(); break
      case 'h3': editor.chain().focus().toggleHeading({ level: 3 }).run(); break
      case 'h4': editor.chain().focus().toggleHeading({ level: 4 }).run(); break
      case 'blockquote': editor.chain().focus().toggleBlockquote().run(); break
      case 'codeBlock':  editor.chain().focus().toggleCodeBlock().run();  break
      default:           editor.chain().focus().setParagraph().run()
    }
  }

  const dc = `z-50 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-[var(--shadow-md)] py-1 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95`
  const di = `px-3 py-1.5 cursor-pointer outline-none text-sm text-[var(--color-text)] hover:bg-[var(--color-primary-highlight)] hover:text-[var(--color-primary)] transition-colors duration-100`
  const dtBase = `inline-flex items-center gap-1 h-7 px-2 rounded-[var(--radius-sm)] text-[var(--text-xs)] text-[var(--color-text)] bg-transparent hover:bg-[var(--color-surface-offset)] border border-[var(--color-border)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] focus-visible:outline-offset-1 overflow-hidden`

  return (
    <div
      role="toolbar"
      aria-label="Barre d'outils de l'éditeur"
      className="flex flex-wrap items-center gap-0.5 px-3 py-0 bg-[var(--color-surface)] border-b border-[var(--color-border)] select-none h-10 overflow-hidden"
    >
      {/* Historique */}
      <ToolbarButton label="Annuler (Ctrl+Z)" disabled={!canUndo} onClick={() => editor.chain().focus().undo().run()}><Undo2 className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton label="Rétablir (Ctrl+Y)" disabled={!canRedo} onClick={() => editor.chain().focus().redo().run()}><Redo2 className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarDivider />

      {/* Style de paragraphe — w fixe */}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button type="button" className={`${dtBase} w-[120px] flex-shrink-0`} aria-label="Style de paragraphe">
            <Pilcrow className="w-3 h-3 text-[var(--color-text-muted)] flex-shrink-0" />
            <span className="flex-1 text-left truncate text-[var(--text-xs)]">{headingLabel}</span>
            <ChevronDown className="w-3 h-3 text-[var(--color-text-muted)] flex-shrink-0" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={`${dc} min-w-[180px]`} sideOffset={4}>
            {HEADING_STYLES.map((style) => (
              <DropdownMenu.Item key={style.value} onSelect={() => applyHeadingStyle(style.value)} className={`${di} ${style.className ?? ''}`}>
                {style.label}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <ToolbarDivider />

      {/* Police — w fixe 140px */}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button type="button" className={`${dtBase} w-[140px] flex-shrink-0`} aria-label="Police">
            <Type className="w-3 h-3 text-[var(--color-text-muted)] flex-shrink-0" />
            <span className="flex-1 text-left truncate text-[var(--text-xs)]">{displayFont}</span>
            <ChevronDown className="w-3 h-3 text-[var(--color-text-muted)] flex-shrink-0" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={`${dc} min-w-[200px] max-h-64 overflow-y-auto`} sideOffset={4}>
            {FONT_FAMILIES.map((font) => (
              <DropdownMenu.Item key={font.value} onSelect={() => editor.chain().focus().setFontFamily(font.value).run()} className={di} style={{ fontFamily: font.value }}>
                {font.label}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {/* Taille — w fixe 56px, utilise setFontSize de l'extension FontSize */}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button type="button" className={`${dtBase} w-[56px] flex-shrink-0`} aria-label="Taille de la police">
            <span className="flex-1 text-center text-[var(--text-xs)]">{displaySize}</span>
            <ChevronDown className="w-3 h-3 text-[var(--color-text-muted)] flex-shrink-0" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={`${dc} min-w-[70px] max-h-56 overflow-y-auto`} sideOffset={4}>
            {FONT_SIZES.map((size) => (
              <DropdownMenu.Item
                key={size}
                onSelect={() => editor.chain().focus().setFontSize(`${size}pt`).run()}
                className={`${di} text-center`}
              >
                {size}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <ToolbarDivider />

      {/* Mise en forme */}
      <ToolbarButton label="Gras (Ctrl+B)"     isActive={isBold}        onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton label="Italique (Ctrl+I)" isActive={isItalic}      onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton label="Souligné (Ctrl+U)" isActive={isUnderline}   onClick={() => editor.chain().focus().toggleUnderline().run()}><Underline className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton label="Barré"              isActive={isStrike}      onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton label="Indice"             isActive={isSubscript}   onClick={() => editor.chain().focus().toggleSubscript().run()}><Subscript className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton label="Exposant"           isActive={isSuperscript} onClick={() => editor.chain().focus().toggleSuperscript().run()}><Superscript className="w-3.5 h-3.5" /></ToolbarButton>

      {/* Couleur du texte */}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button type="button" className="inline-flex flex-col items-center justify-center w-7 h-7 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-offset)] transition-colors flex-shrink-0" aria-label="Couleur du texte">
            <span className="text-[11px] font-bold leading-none" style={{ color: textColor }}>A</span>
            <span className="w-4 h-1 rounded-full mt-0.5" style={{ backgroundColor: textColor }} />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="z-50 p-2 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-[var(--shadow-md)]" sideOffset={4}>
            <div className="grid grid-cols-5 gap-1">
              {TEXT_COLORS.map((c) => (
                <DropdownMenu.Item key={c.color} onSelect={() => editor.chain().focus().setColor(c.color).run()} className="cursor-pointer outline-none" aria-label={c.label}>
                  <div className="w-5 h-5 rounded-full border border-[var(--color-border)] hover:scale-110 transition-transform" style={{ backgroundColor: c.color }} title={c.label} />
                </DropdownMenu.Item>
              ))}
              <DropdownMenu.Item onSelect={() => editor.chain().focus().unsetColor().run()} className="cursor-pointer outline-none">
                <div className="w-5 h-5 rounded-full border-2 border-dashed border-[var(--color-border)] hover:scale-110 transition-transform" title="Automatique" />
              </DropdownMenu.Item>
            </div>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {/* Surligneur */}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button type="button" className={`inline-flex flex-col items-center justify-center w-7 h-7 rounded-[var(--radius-sm)] transition-colors flex-shrink-0 ${
            isHighlight ? 'bg-[var(--color-primary-highlight)] text-[var(--color-primary)]' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-offset)]'
          }`} aria-label="Surligneur">
            <Highlighter className="w-3.5 h-3.5" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="z-50 p-2 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-[var(--shadow-md)]" sideOffset={4}>
            <div className="flex gap-1 flex-wrap max-w-[160px]">
              {HIGHLIGHT_COLORS.map((c) => (
                <DropdownMenu.Item key={c.color} onSelect={() => editor.chain().focus().setHighlight({ color: c.color }).run()} className="cursor-pointer outline-none">
                  <div className="w-5 h-5 rounded border border-[var(--color-border)] hover:scale-110 transition-transform" style={{ backgroundColor: c.color }} title={c.label} />
                </DropdownMenu.Item>
              ))}
              <DropdownMenu.Item onSelect={() => editor.chain().focus().unsetHighlight().run()} className="cursor-pointer outline-none">
                <div className="w-5 h-5 rounded border-2 border-dashed border-[var(--color-border)]" title="Retirer" />
              </DropdownMenu.Item>
            </div>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <ToolbarButton label="Effacer la mise en forme" onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}><RemoveFormatting className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarDivider />

      {/* Alignement */}
      <ToolbarButton label="Aligner à gauche" isActive={isAlignLeft}    onClick={() => editor.chain().focus().setTextAlign('left').run()}><AlignLeft className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton label="Centrer"          isActive={isAlignCenter}  onClick={() => editor.chain().focus().setTextAlign('center').run()}><AlignCenter className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton label="Aligner à droite" isActive={isAlignRight}   onClick={() => editor.chain().focus().setTextAlign('right').run()}><AlignRight className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton label="Justifier"        isActive={isAlignJustify} onClick={() => editor.chain().focus().setTextAlign('justify').run()}><AlignJustify className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarDivider />

      {/* Listes */}
      <ToolbarButton label="Liste à puces"    isActive={isBulletList}  onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton label="Liste numérotée"  isActive={isOrderedList} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton label="Liste de tâches"  isActive={isTaskList}    onClick={() => editor.chain().focus().toggleTaskList().run()}><ListTodo className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton label="Augmenter le retrait" onClick={() => editor.chain().focus().sinkListItem('listItem').run()}><Indent className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton label="Diminuer le retrait"  onClick={() => editor.chain().focus().liftListItem('listItem').run()}><Outdent className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarDivider />

      {/* Insertion */}
      <ToolbarButton label="Insérer un lien (Ctrl+K)" isActive={isLink} onClick={onInsertLink}><Link2 className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton label="Insérer une image" onClick={onInsertImage}><Image className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton label="Insérer un tableau" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton label="Ligne de séparation" onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton label="Citation"    isActive={isBlockquote} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton label="Bloc de code" isActive={isCodeBlock}  onClick={() => editor.chain().focus().toggleCodeBlock().run()}><Code className="w-3.5 h-3.5" /></ToolbarButton>

      {/* Options tableau contextuelles */}
      {isTable && (
        <>
          <ToolbarDivider />
          <span className="text-[var(--text-xs)] text-[var(--color-text-muted)] px-1 flex-shrink-0">Tableau :</span>
          <ToolbarButton label="Ajouter une colonne après"   onClick={() => editor.chain().focus().addColumnAfter().run()}><span className="text-[10px] font-mono">+C→</span></ToolbarButton>
          <ToolbarButton label="Ajouter une ligne en dessous" onClick={() => editor.chain().focus().addRowAfter().run()}><span className="text-[10px] font-mono">+L↓</span></ToolbarButton>
          <ToolbarButton label="Supprimer la colonne" onClick={() => editor.chain().focus().deleteColumn().run()}><span className="text-[10px] font-mono text-[var(--color-error)]">–C</span></ToolbarButton>
          <ToolbarButton label="Supprimer la ligne"   onClick={() => editor.chain().focus().deleteRow().run()}><span className="text-[10px] font-mono text-[var(--color-error)]">–L</span></ToolbarButton>
          <ToolbarButton label="Supprimer le tableau" onClick={() => editor.chain().focus().deleteTable().run()}><span className="text-[10px] font-mono text-[var(--color-error)]">✕T</span></ToolbarButton>
        </>
      )}
    </div>
  )
}
