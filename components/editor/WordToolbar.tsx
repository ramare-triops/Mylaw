// components/editor/WordToolbar.tsx
// Barre d'outils style Microsoft Word pour l'éditeur TipTap de Mylex.
// Groupes : Historique | Style | Police | Taille | Mise en forme | Alignement | Listes | Insertion

'use client'

import { type Editor } from '@tiptap/react'
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
import { useCallback } from 'react'

interface WordToolbarProps {
  editor: Editor | null
  onInsertLink: () => void
  onInsertImage: () => void
}

const FONT_FAMILIES = [
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Source Serif 4', value: "'Source Serif 4', Georgia, serif" },
  { label: 'Times New Roman', value: "'Times New Roman', Times, serif" },
  { label: 'Geist', value: "'Geist', 'Inter', sans-serif" },
  { label: 'Inter', value: "'Inter', sans-serif" },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Courier New', value: "'Courier New', Courier, monospace" },
  { label: 'JetBrains Mono', value: "'JetBrains Mono', 'Courier New', monospace" },
]

const FONT_SIZES = ['8','9','10','11','12','14','16','18','20','24','28','32','36','48','72']

const HEADING_STYLES = [
  { label: 'Texte normal', value: 'paragraph' },
  { label: 'Titre 1', value: 'h1', className: 'text-2xl font-bold' },
  { label: 'Titre 2', value: 'h2', className: 'text-xl font-bold' },
  { label: 'Titre 3', value: 'h3', className: 'text-lg font-semibold' },
  { label: 'Titre 4', value: 'h4', className: 'text-base font-semibold' },
  { label: 'Citation', value: 'blockquote', className: 'italic text-[var(--color-text-muted)]' },
  { label: 'Code', value: 'codeBlock', className: 'font-mono text-sm' },
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
        className={`inline-flex items-center justify-center w-7 h-7 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] transition-colors duration-[var(--transition-interactive)] disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] focus-visible:outline-offset-1 ${
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

export function WordToolbar({ editor, onInsertLink, onInsertImage }: WordToolbarProps) {
  const currentFontSize = editor?.getAttributes('textStyle').fontSize?.replace('px', '') ?? '12'
  const currentFontFamily = editor?.getAttributes('textStyle').fontFamily ?? FONT_FAMILIES[0].value

  const currentHeading = useCallback(() => {
    if (!editor) return 'Texte normal'
    for (let i = 1; i <= 4; i++) {
      if (editor.isActive('heading', { level: i })) return `Titre ${i}`
    }
    if (editor.isActive('blockquote')) return 'Citation'
    if (editor.isActive('codeBlock')) return 'Code'
    return 'Texte normal'
  }, [editor])

  const applyHeadingStyle = (value: string) => {
    if (!editor) return
    switch (value) {
      case 'h1': editor.chain().focus().toggleHeading({ level: 1 }).run(); break
      case 'h2': editor.chain().focus().toggleHeading({ level: 2 }).run(); break
      case 'h3': editor.chain().focus().toggleHeading({ level: 3 }).run(); break
      case 'h4': editor.chain().focus().toggleHeading({ level: 4 }).run(); break
      case 'blockquote': editor.chain().focus().toggleBlockquote().run(); break
      case 'codeBlock': editor.chain().focus().toggleCodeBlock().run(); break
      default: editor.chain().focus().setParagraph().run()
    }
  }

  if (!editor) return null

  const dropdownContentClass = `z-50 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-[var(--shadow-md)] py-1 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95`
  const dropdownItemClass = `px-3 py-1.5 cursor-pointer outline-none text-sm text-[var(--color-text)] hover:bg-[var(--color-primary-highlight)] hover:text-[var(--color-primary)] transition-colors duration-100`
  const dropdownTriggerClass = `inline-flex items-center gap-1 h-7 px-2 rounded-[var(--radius-sm)] text-[var(--text-xs)] text-[var(--color-text)] bg-transparent hover:bg-[var(--color-surface-offset)] border border-[var(--color-border)] transition-colors duration-[var(--transition-interactive)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] focus-visible:outline-offset-1`

  return (
    <div role="toolbar" aria-label="Barre d'outils de l'éditeur" className="flex flex-wrap items-center gap-0.5 px-3 py-1.5 bg-[var(--color-surface)] border-b border-[var(--color-border)] select-none min-h-[40px]">

      {/* Historique */}
      <ToolbarButton label="Annuler (Ctrl+Z)" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}><Undo2 className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton label="Rétablir (Ctrl+Y)" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}><Redo2 className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarDivider />

      {/* Style de paragraphe */}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button type="button" className={`${dropdownTriggerClass} min-w-[110px]`} aria-label="Style de paragraphe">
            <Pilcrow className="w-3 h-3 text-[var(--color-text-muted)]" />
            <span className="flex-1 text-left truncate">{currentHeading()}</span>
            <ChevronDown className="w-3 h-3 text-[var(--color-text-muted)]" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={`${dropdownContentClass} min-w-[180px]`} sideOffset={4}>
            {HEADING_STYLES.map((style) => (
              <DropdownMenu.Item key={style.value} onSelect={() => applyHeadingStyle(style.value)} className={`${dropdownItemClass} ${style.className ?? ''}`}>{style.label}</DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <ToolbarDivider />

      {/* Police */}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button type="button" className={`${dropdownTriggerClass} min-w-[130px]`} aria-label="Police">
            <Type className="w-3 h-3 text-[var(--color-text-muted)]" />
            <span className="flex-1 text-left truncate">{FONT_FAMILIES.find((f) => f.value === currentFontFamily)?.label ?? 'Georgia'}</span>
            <ChevronDown className="w-3 h-3 text-[var(--color-text-muted)]" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={`${dropdownContentClass} min-w-[200px] max-h-64 overflow-y-auto`} sideOffset={4}>
            {FONT_FAMILIES.map((font) => (
              <DropdownMenu.Item key={font.value} onSelect={() => editor.chain().focus().setFontFamily(font.value).run()} className={dropdownItemClass} style={{ fontFamily: font.value }}>{font.label}</DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {/* Taille */}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button type="button" className={`${dropdownTriggerClass} w-14`} aria-label="Taille de la police">
            <span className="flex-1 text-center">{currentFontSize}</span>
            <ChevronDown className="w-3 h-3 text-[var(--color-text-muted)]" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={`${dropdownContentClass} min-w-[80px] max-h-56 overflow-y-auto`} sideOffset={4}>
            {FONT_SIZES.map((size) => (
              <DropdownMenu.Item key={size} onSelect={() => editor.chain().focus().setMark('textStyle', { fontSize: `${size}px` }).run()} className={`${dropdownItemClass} text-center`}>{size}</DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <ToolbarDivider />

      {/* Mise en forme */}
      <ToolbarButton label="Gras (Ctrl+B)" isActive={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton label="Italique (Ctrl+I)" isActive={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton label="Souligné (Ctrl+U)" isActive={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}><Underline className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton label="Barré" isActive={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton label="Indice" isActive={editor.isActive('subscript')} onClick={() => editor.chain().focus().toggleSubscript().run()}><Subscript className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton label="Exposant" isActive={editor.isActive('superscript')} onClick={() => editor.chain().focus().toggleSuperscript().run()}><Superscript className="w-3.5 h-3.5" /></ToolbarButton>

      {/* Couleur du texte */}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button type="button" className="inline-flex flex-col items-center justify-center w-7 h-7 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-offset)] transition-colors" aria-label="Couleur du texte">
            <span className="text-[11px] font-bold leading-none">A</span>
            <span className="w-4 h-1 rounded-full mt-0.5" style={{ backgroundColor: editor.getAttributes('textStyle').color ?? '#28251d' }} />
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
          <button type="button" className={`inline-flex flex-col items-center justify-center w-7 h-7 rounded-[var(--radius-sm)] transition-colors ${ editor.isActive('highlight') ? 'bg-[var(--color-primary-highlight)] text-[var(--color-primary)]' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-offset)]'}`} aria-label="Surligneur">
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
      <ToolbarButton label="Aligner à gauche" isActive={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}><AlignLeft className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton label="Centrer" isActive={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}><AlignCenter className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton label="Aligner à droite" isActive={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}><AlignRight className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton label="Justifier" isActive={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()}><AlignJustify className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarDivider />

      {/* Listes */}
      <ToolbarButton label="Liste à puces" isActive={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton label="Liste numérotée" isActive={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton label="Liste de tâches" isActive={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()}><ListTodo className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton label="Augmenter le retrait" onClick={() => editor.chain().focus().sinkListItem('listItem').run()}><Indent className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton label="Diminuer le retrait" onClick={() => editor.chain().focus().liftListItem('listItem').run()}><Outdent className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarDivider />

      {/* Insertion */}
      <ToolbarButton label="Insérer un lien (Ctrl+K)" isActive={editor.isActive('link')} onClick={onInsertLink}><Link2 className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton label="Insérer une image" onClick={onInsertImage}><Image className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton label="Insérer un tableau" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton label="Ligne de séparation" onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton label="Citation" isActive={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton label="Bloc de code" isActive={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()}><Code className="w-3.5 h-3.5" /></ToolbarButton>

      {/* Options de tableau contextuelles */}
      {editor.isActive('table') && (
        <>
          <ToolbarDivider />
          <span className="text-[var(--text-xs)] text-[var(--color-text-muted)] px-1">Tableau :</span>
          <ToolbarButton label="Ajouter une colonne après" onClick={() => editor.chain().focus().addColumnAfter().run()}><span className="text-[10px] font-mono">+C→</span></ToolbarButton>
          <ToolbarButton label="Ajouter une ligne en dessous" onClick={() => editor.chain().focus().addRowAfter().run()}><span className="text-[10px] font-mono">+L↓</span></ToolbarButton>
          <ToolbarButton label="Supprimer la colonne" onClick={() => editor.chain().focus().deleteColumn().run()}><span className="text-[10px] font-mono text-[var(--color-error)]">–C</span></ToolbarButton>
          <ToolbarButton label="Supprimer la ligne" onClick={() => editor.chain().focus().deleteRow().run()}><span className="text-[10px] font-mono text-[var(--color-error)]">–L</span></ToolbarButton>
          <ToolbarButton label="Supprimer le tableau" onClick={() => editor.chain().focus().deleteTable().run()}><span className="text-[10px] font-mono text-[var(--color-error)]">✕T</span></ToolbarButton>
        </>
      )}
    </div>
  )
}
