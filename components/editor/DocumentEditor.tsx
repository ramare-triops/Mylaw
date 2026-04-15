'use client';

import { useEffect, useState, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import CharacterCount from '@tiptap/extension-character-count';
import Highlight from '@tiptap/extension-highlight';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { useDebouncedCallback } from 'use-debounce';
import { db, saveDocument } from '@/lib/db';
import { EditorToolbar } from './EditorToolbar';
import { VariablePanel } from './VariablePanel';
import { countWords, extractVariables } from '@/lib/utils';
import type { Document } from '@/types';
import { cn } from '@/lib/utils';

interface Props {
  docId: number;
}

export function DocumentEditor({ docId }: Props) {
  const [doc, setDoc] = useState<Document | null>(null);
  const [saving, setSaving] = useState(false);
  const [showVariables, setShowVariables] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Commencez à rédiger…' }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      CharacterCount,
      Highlight,
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
    ],
    editorProps: {
      attributes: { class: 'tiptap-editor min-h-[calc(100vh-200px)] px-16 py-10 max-w-4xl mx-auto outline-none' },
    },
    onUpdate: ({ editor }) => {
      handleAutoSave(editor.getHTML(), editor.getText());
    },
  });

  useEffect(() => {
    if (!docId) return;
    db.documents.get(docId).then((d) => {
      if (d) {
        setDoc(d);
        editor?.commands.setContent(d.content);
        const vars = extractVariables(d.content);
        if (vars.length > 0) setShowVariables(true);
      }
    });
  }, [docId, editor]);

  const handleAutoSave = useDebouncedCallback(
    async (html: string, text: string) => {
      if (!doc) return;
      setSaving(true);
      const updated: Document = {
        ...doc,
        content: html,
        contentRaw: text,
        wordCount: countWords(text),
        updatedAt: new Date(),
      };
      await saveDocument(updated);
      setDoc(updated);
      setSaving(false);
    },
    2000
  );

  const handleVariableChange = useCallback(
    async (name: string, value: string) => {
      if (!doc || !editor) return;
      const vars = { ...(doc.variables ?? {}), [name]: value };
      const updatedDoc = { ...doc, variables: vars, updatedAt: new Date() };
      setDoc(updatedDoc);
      await saveDocument(updatedDoc);
    },
    [doc, editor]
  );

  if (!doc) {
    return (
      <div className="flex items-center justify-center h-64 text-[var(--color-text-muted)]">
        Chargement du document…
      </div>
    );
  }

  const wordCount = editor?.storage.characterCount?.words() ?? 0;
  const variables = extractVariables(doc.content);

  return (
    <div className="flex h-full">
      {/* Editor area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Toolbar */}
        {editor && <EditorToolbar editor={editor} />}

        {/* Editor content */}
        <div className="flex-1 overflow-auto bg-[var(--color-surface)]">
          <EditorContent editor={editor} />
        </div>

        {/* Status bar */}
        <div
          className={cn(
            'flex items-center justify-between px-4 py-1 text-xs',
            'bg-[var(--color-surface-raised)] border-t border-[var(--color-border)]',
            'text-[var(--color-text-muted)]'
          )}
        >
          <span>{wordCount} mots</span>
          <span
            className={cn(
              'transition-opacity duration-300',
              saving ? 'opacity-100' : 'opacity-0'
            )}
          >
            Enregistrement…
          </span>
          {variables.length > 0 && (
            <button
              onClick={() => setShowVariables(!showVariables)}
              className="text-[var(--color-primary)] hover:underline"
            >
              {variables.length} variable{variables.length > 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>

      {/* Variable panel */}
      {showVariables && variables.length > 0 && editor && (
        <VariablePanel
          variables={variables}
          values={doc.variables ?? {}}
          onChange={handleVariableChange}
          onClose={() => setShowVariables(false)}
        />
      )}
    </div>
  );
}
