'use client';

import type { Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Table,
  Highlighter,
  Heading1,
  Heading2,
  Heading3,
  Undo,
  Redo,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  editor: Editor;
}

const ToolbarBtn = ({
  onClick,
  active,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    title={label}
    className={cn(
      'p-1.5 rounded transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center',
      active
        ? 'bg-[var(--color-primary)] text-white'
        : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-text)]',
      disabled && 'opacity-30 cursor-not-allowed'
    )}
  >
    {children}
  </button>
);

const Divider = () => (
  <div className="w-px h-5 bg-[var(--color-border)] mx-0.5" />
);

export function EditorToolbar({ editor }: Props) {
  return (
    <div
      className={cn(
        'flex items-center gap-0.5 px-3 py-1.5 flex-wrap',
        'bg-[var(--color-surface-raised)] border-b border-[var(--color-border)]'
      )}
    >
      <ToolbarBtn
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        label="Annuler"
      >
        <Undo className="w-3.5 h-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        label="Rétablir"
      >
        <Redo className="w-3.5 h-3.5" />
      </ToolbarBtn>
      <Divider />

      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        active={editor.isActive('heading', { level: 1 })}
        label="Titre 1"
      >
        <Heading1 className="w-3.5 h-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive('heading', { level: 2 })}
        label="Titre 2"
      >
        <Heading2 className="w-3.5 h-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive('heading', { level: 3 })}
        label="Titre 3"
      >
        <Heading3 className="w-3.5 h-3.5" />
      </ToolbarBtn>
      <Divider />

      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive('bold')}
        label="Gras"
      >
        <Bold className="w-3.5 h-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive('italic')}
        label="Italique"
      >
        <Italic className="w-3.5 h-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive('underline')}
        label="Souligné"
      >
        <Underline className="w-3.5 h-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive('strike')}
        label="Baré"
      >
        <Strikethrough className="w-3.5 h-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        active={editor.isActive('highlight')}
        label="Surligner"
      >
        <Highlighter className="w-3.5 h-3.5" />
      </ToolbarBtn>
      <Divider />

      <ToolbarBtn
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
        active={editor.isActive({ textAlign: 'left' })}
        label="Aligner à gauche"
      >
        <AlignLeft className="w-3.5 h-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
        active={editor.isActive({ textAlign: 'center' })}
        label="Centrer"
      >
        <AlignCenter className="w-3.5 h-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
        active={editor.isActive({ textAlign: 'right' })}
        label="Aligner à droite"
      >
        <AlignRight className="w-3.5 h-3.5" />
      </ToolbarBtn>
      <Divider />

      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive('bulletList')}
        label="Liste à puces"
      >
        <List className="w-3.5 h-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive('orderedList')}
        label="Liste numérotée"
      >
        <ListOrdered className="w-3.5 h-3.5" />
      </ToolbarBtn>
      <Divider />

      <ToolbarBtn
        onClick={() =>
          editor
            .chain()
            .focus()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run()
        }
        label="Insérer un tableau"
      >
        <Table className="w-3.5 h-3.5" />
      </ToolbarBtn>
    </div>
  );
}
