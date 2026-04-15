'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { FileEdit, Download, Maximize2, Minimize2, Hash, AlignLeft, Bold, Italic, List, ChevronDown } from 'lucide-react';
import { db } from '@/lib/db';

interface DraftDocument {
  id?: number;
  title: string;
  content: string;
  wordCount: number;
  updatedAt: Date;
}

const WORD_LIMIT_WARNING = 35;

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function detectLongSentences(text: string): number[] {
  const sentences = text.split(/[.!?]+/);
  const longIndices: number[] = [];
  sentences.forEach((sentence, idx) => {
    const words = sentence.trim().split(/\s+/).filter(Boolean);
    if (words.length > WORD_LIMIT_WARNING) longIndices.push(idx);
  });
  return longIndices;
}

const TOOLBAR_ACTIONS = [
  { icon: Bold, label: 'Gras', action: (sel: string) => `**${sel}**` },
  { icon: Italic, label: 'Italique', action: (sel: string) => `*${sel}*` },
  { icon: Hash, label: 'Titre', action: (sel: string) => `## ${sel}` },
  { icon: List, label: 'Liste', action: (sel: string) => sel.split('\n').map((l) => `- ${l}`).join('\n') },
  { icon: AlignLeft, label: 'Citation', action: (sel: string) => sel.split('\n').map((l) => `> ${l}`).join('\n') },
];

export function DraftAssistant() {
  const [doc, setDoc] = useState<DraftDocument>({
    title: 'Document sans titre',
    content: '',
    wordCount: 0,
    updatedAt: new Date(),
  });
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [longSentenceWarning, setLongSentenceWarning] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [variablesDetected, setVariablesDetected] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoSaveRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadLastDoc();
  }, []);

  async function loadLastDoc() {
    try {
      const docs = await db.table('documents').orderBy('updatedAt').reverse().limit(1).toArray();
      if (docs.length > 0) {
        const d = docs[0];
        setDoc({
          id: d.id,
          title: d.title,
          content: d.contentRaw || '',
          wordCount: d.wordCount || 0,
          updatedAt: new Date(d.updatedAt),
        });
      }
    } catch {}
  }

  const handleContentChange = useCallback(
    (value: string) => {
      const wc = countWords(value);
      const longSents = detectLongSentences(value);
      const vars = Array.from(value.matchAll(/\{([A-ZÉÈÀÂ_]+)\}/g)).map((m) => m[1]);
      const uniqueVars = Array.from(new Set(vars));

      setDoc((prev) => ({ ...prev, content: value, wordCount: wc, updatedAt: new Date() }));
      setLongSentenceWarning(longSents.length > 0);
      setVariablesDetected(uniqueVars);
      setSaveStatus('unsaved');

      if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
      autoSaveRef.current = setTimeout(async () => {
        setSaveStatus('saving');
        try {
          const payload = {
            title: doc.title,
            contentRaw: value,
            content: value,
            wordCount: wc,
            updatedAt: new Date(),
            type: 'draft' as const,
            tags: [],
            versions: [],
          };
          if (doc.id) {
            await db.table('documents').update(doc.id, payload);
          } else {
            const id = await db.table('documents').add({ ...payload, createdAt: new Date() });
            setDoc((prev) => ({ ...prev, id: id as number }));
          }
          setSaveStatus('saved');
        } catch {
          setSaveStatus('unsaved');
        }
      }, 2000);
    },
    [doc.title, doc.id]
  );

  function applyFormat(action: (sel: string) => string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = ta.value.substring(start, end);
    const replacement = action(selected || 'texte');
    const newValue = ta.value.substring(0, start) + replacement + ta.value.substring(end);
    handleContentChange(newValue);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start, start + replacement.length);
    }, 10);
  }

  function exportMarkdown() {
    const blob = new Blob([`# ${doc.title}\n\n${doc.content}`], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.title.replace(/\s+/g, '-').toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      className="flex flex-col h-full"
      style={{
        background: isFocusMode ? 'var(--color-bg)' : 'var(--color-bg)',
        fontFamily: 'var(--font-body, Inter, sans-serif)',
        transition: 'all 0.2s ease',
      }}
    >
      {/* Toolbar */}
      {!isFocusMode && (
        <div
          className="flex items-center gap-2 px-4 py-2 border-b flex-wrap"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
        >
          <FileEdit size={15} style={{ color: 'var(--color-primary)' }} />
          <input
            type="text"
            value={doc.title}
            onChange={(e) => setDoc((prev) => ({ ...prev, title: e.target.value }))}
            style={{
              flex: 1,
              minWidth: '200px',
              fontSize: 'var(--text-sm)',
              fontWeight: 600,
              color: 'var(--color-text)',
              background: 'transparent',
              border: 'none',
              outline: 'none',
            }}
            placeholder="Titre du document"
          />

          {/* Format buttons */}
          <div
            className="flex items-center gap-1"
            style={{
              borderLeft: '1px solid var(--color-border)',
              paddingLeft: 'var(--space-2)',
              marginLeft: 'var(--space-2)',
            }}
          >
            {TOOLBAR_ACTIONS.map((action) => (
              <button
                key={action.label}
                onClick={() => applyFormat(action.action)}
                aria-label={action.label}
                title={action.label}
                style={{
                  padding: '4px 6px',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--color-text-muted)',
                  transition: 'all var(--transition-interactive)',
                }}
              >
                <action.icon size={14} />
              </button>
            ))}
          </div>

          {/* Save status */}
          <div
            style={{
              fontSize: 'var(--text-xs)',
              color:
                saveStatus === 'saved'
                  ? 'var(--color-success)'
                  : saveStatus === 'saving'
                  ? 'var(--color-warning)'
                  : 'var(--color-text-muted)',
              marginLeft: 'var(--space-2)',
              whiteSpace: 'nowrap',
            }}
          >
            {saveStatus === 'saved' ? '✓ Sauvegardé' : saveStatus === 'saving' ? '…' : '● Non sauvegardé'}
          </div>

          <button
            onClick={exportMarkdown}
            aria-label="Exporter en Markdown"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: 'var(--text-xs)',
              padding: '4px 10px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-surface-offset)',
              color: 'var(--color-text-muted)',
            }}
          >
            <Download size={13} /> Exporter
          </button>

          <button
            onClick={() => setIsFocusMode(true)}
            aria-label="Mode focus"
            style={{
              padding: '4px 6px',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-text-muted)',
            }}
          >
            <Maximize2 size={14} />
          </button>
        </div>
      )}

      {/* Focus mode exit button */}
      {isFocusMode && (
        <div className="fixed top-4 right-4 z-50">
          <button
            onClick={() => setIsFocusMode(false)}
            aria-label="Quitter le mode focus"
            style={{
              padding: '6px 8px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-surface)',
              color: 'var(--color-text-muted)',
              border: '1px solid var(--color-border)',
            }}
          >
            <Minimize2 size={14} />
          </button>
        </div>
      )}

      {/* Warnings */}
      {longSentenceWarning && !isFocusMode && (
        <div
          style={{
            padding: '6px 16px',
            fontSize: 'var(--text-xs)',
            background: 'oklch(from var(--color-warning) l c h / 0.08)',
            color: 'var(--color-warning)',
            borderBottom: '1px solid oklch(from var(--color-warning) l c h / 0.2)',
          }}
        >
          ⚠️ Certaines phrases dépassent 35 mots. Pensez à les raccourcir.
        </div>
      )}

      {/* Variables panel */}
      {variablesDetected.length > 0 && !isFocusMode && (
        <div
          className="flex items-center gap-2 px-4 py-2 flex-wrap"
          style={{
            background: 'oklch(from var(--color-primary) l c h / 0.05)',
            borderBottom: '1px solid oklch(from var(--color-primary) l c h / 0.15)',
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-muted)',
          }}
        >
          <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>Variables :</span>
          {variablesDetected.map((v) => (
            <span
              key={v}
              style={{
                background: 'var(--color-primary-highlight)',
                color: 'var(--color-primary)',
                padding: '1px 8px',
                borderRadius: 'var(--radius-full)',
                fontFamily: 'monospace',
                fontWeight: 500,
              }}
            >
              {`{${v}}`}
            </span>
          ))}
        </div>
      )}

      {/* Editor */}
      <div
        className="flex flex-1 overflow-hidden"
        style={{
          padding: isFocusMode ? '60px max(80px, calc(50% - 380px))' : '0',
          transition: 'padding 0.3s ease',
        }}
      >
        <textarea
          ref={textareaRef}
          value={doc.content}
          onChange={(e) => handleContentChange(e.target.value)}
          placeholder="Commencez à rédiger votre document juridique..."
          style={{
            flex: 1,
            padding: isFocusMode ? '0' : '24px 32px',
            fontSize: isFocusMode ? 'var(--text-lg)' : 'var(--text-base)',
            lineHeight: 1.8,
            color: 'var(--color-text)',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            resize: 'none',
            fontFamily: 'var(--font-editor, "Source Serif 4", Georgia, serif)',
          }}
        />
      </div>

      {/* Status bar */}
      {!isFocusMode && (
        <div
          className="flex items-center gap-4 px-4 py-2 border-t"
          style={{
            borderColor: 'var(--color-border)',
            background: 'var(--color-surface)',
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-muted)',
          }}
        >
          <span>{doc.wordCount} mots</span>
          <span>{doc.content.length} caractères</span>
          {doc.updatedAt && (
            <span>
              Modifié :{' '}
              {doc.updatedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
