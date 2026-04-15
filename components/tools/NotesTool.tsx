'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { StickyNote, Plus, Search, Trash2, Tag, Clock, FolderOpen } from 'lucide-react';
import { db } from '@/lib/db';

interface Note {
  id?: number;
  title: string;
  content: string;
  folderId?: number;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return "\u00C0 l'instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  if (hours < 24) return `Il y a ${hours}h`;
  return `Il y a ${days}j`;
}

export function NotesTool() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const autoSaveRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadNotes();
  }, []);

  async function loadNotes() {
    try {
      const allNotes = await db.table('sessions')
        .where('toolId').equals('notes')
        .reverse()
        .sortBy('date');
      const mapped: Note[] = allNotes.map((s: any) => ({
        id: s.id,
        title: s.content?.title || 'Sans titre',
        content: s.content?.body || '',
        tags: s.tags || [],
        folderId: s.content?.folderId,
        createdAt: new Date(s.date),
        updatedAt: new Date(s.date),
      }));
      setNotes(mapped);
    } catch {
      // IndexedDB may not be ready yet
    }
  }

  async function createNote() {
    const now = new Date();
    const note: Note = {
      title: 'Nouvelle note',
      content: '',
      tags: [],
      createdAt: now,
      updatedAt: now,
    };
    try {
      const id = await db.table('sessions').add({
        date: now,
        toolId: 'notes',
        content: { title: note.title, body: '' },
        tags: [],
      });
      note.id = id as number;
      setNotes((prev) => [note, ...prev]);
      setSelectedNote(note);
      setIsCreating(true);
    } catch {
      setSelectedNote(note);
    }
  }

  async function deleteNote(id: number) {
    try {
      await db.table('sessions').delete(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
      if (selectedNote?.id === id) setSelectedNote(null);
    } catch {}
  }

  const handleContentChange = useCallback(
    (field: 'title' | 'content', value: string) => {
      if (!selectedNote) return;
      const updated = { ...selectedNote, [field]: value, updatedAt: new Date() };
      setSelectedNote(updated);
      setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
      autoSaveRef.current = setTimeout(async () => {
        if (updated.id) {
          try {
            await db.table('sessions').update(updated.id, {
              content: { title: updated.title, body: updated.content },
              date: updated.updatedAt,
            });
          } catch {}
        }
      }, 2000);
    },
    [selectedNote]
  );

  const filteredNotes = notes.filter(
    (n) =>
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const todayNotes = filteredNotes.filter(
    (n) => n.createdAt.toDateString() === new Date().toDateString()
  );
  const olderNotes = filteredNotes.filter(
    (n) => n.createdAt.toDateString() !== new Date().toDateString()
  );

  return (
    <div className="flex h-full" style={{ fontFamily: 'var(--font-body, Inter, sans-serif)' }}>
      {/* Sidebar */}
      <div
        className="flex flex-col border-r"
        style={{
          width: '280px',
          minWidth: '280px',
          background: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-center gap-2">
            <StickyNote size={16} style={{ color: 'var(--color-primary)' }} />
            <span
              className="font-semibold"
              style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}
            >
              Notes
            </span>
          </div>
          <button
            onClick={createNote}
            aria-label="Nouvelle note"
            className="flex items-center gap-1 px-2 py-1 rounded"
            style={{
              fontSize: 'var(--text-xs)',
              background: 'var(--color-primary)',
              color: '#fff',
              borderRadius: 'var(--radius-sm)',
              transition: 'background var(--transition-interactive)',
            }}
          >
            <Plus size={13} />
            Nouvelle
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2">
          <div className="relative">
            <Search
              size={13}
              className="absolute"
              style={{
                left: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--color-text-muted)',
              }}
            />
            <input
              type="text"
              placeholder="Rechercher..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                paddingLeft: '28px',
                paddingRight: '8px',
                paddingTop: '5px',
                paddingBottom: '5px',
                fontSize: 'var(--text-xs)',
                background: 'var(--color-surface-offset)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--color-text)',
                outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Notes list */}
        <div className="flex-1 overflow-y-auto">
          {filteredNotes.length === 0 && (
            <div
              className="flex flex-col items-center justify-center py-12 px-4 text-center"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <StickyNote size={32} style={{ marginBottom: '8px', opacity: 0.4 }} />
              <p style={{ fontSize: 'var(--text-sm)' }}>
                {searchQuery ? 'Aucune note trouvée' : "Aucune note pour l'instant"}
              </p>
              {!searchQuery && (
                <button
                  onClick={createNote}
                  style={{
                    marginTop: '8px',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-primary)',
                    textDecoration: 'underline',
                  }}
                >
                  Créer une première note
                </button>
              )}
            </div>
          )}

          {todayNotes.length > 0 && (
            <div>
              <div
                className="px-4 py-1"
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontWeight: 600,
                }}
              >
                Aujourd&apos;hui
              </div>
              {todayNotes.map((note) => (
                <NoteItem
                  key={note.id ?? note.title}
                  note={note}
                  isSelected={selectedNote?.id === note.id}
                  onSelect={() => setSelectedNote(note)}
                  onDelete={() => note.id && deleteNote(note.id)}
                />
              ))}
            </div>
          )}

          {olderNotes.length > 0 && (
            <div>
              <div
                className="px-4 py-1"
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontWeight: 600,
                  marginTop: '8px',
                }}
              >
                Précédentes
              </div>
              {olderNotes.map((note) => (
                <NoteItem
                  key={note.id ?? note.title}
                  note={note}
                  isSelected={selectedNote?.id === note.id}
                  onSelect={() => setSelectedNote(note)}
                  onDelete={() => note.id && deleteNote(note.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Editor area */}
      <div className="flex flex-col flex-1" style={{ background: 'var(--color-bg)' }}>
        {selectedNote ? (
          <>
            <div
              className="flex items-center justify-between px-6 py-3 border-b"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <input
                type="text"
                value={selectedNote.title}
                onChange={(e) => handleContentChange('title', e.target.value)}
                style={{
                  flex: 1,
                  fontSize: 'var(--text-xl)',
                  fontWeight: 600,
                  color: 'var(--color-text)',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                }}
              />
              <div
                className="flex items-center gap-1"
                style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}
              >
                <Clock size={11} />
                <span>{formatRelativeTime(selectedNote.updatedAt)}</span>
              </div>
            </div>

            <textarea
              value={selectedNote.content}
              onChange={(e) => handleContentChange('content', e.target.value)}
              placeholder="Commencez \u00e0 \u00e9crire..."
              style={{
                flex: 1,
                padding: '24px',
                fontSize: 'var(--text-base)',
                lineHeight: 1.75,
                color: 'var(--color-text)',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                resize: 'none',
                fontFamily: 'var(--font-editor, "Source Serif 4", Georgia, serif)',
              }}
            />
          </>
        ) : (
          <div
            className="flex flex-col items-center justify-center h-full"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <StickyNote size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
            <p style={{ fontSize: 'var(--text-base)' }}>Sélectionnez ou créez une note</p>
            <button
              onClick={createNote}
              className="mt-3 px-4 py-2 rounded"
              style={{
                fontSize: 'var(--text-sm)',
                background: 'var(--color-primary)',
                color: '#fff',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <Plus size={14} style={{ display: 'inline', marginRight: '6px' }} />
              Nouvelle note
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function NoteItem({
  note,
  isSelected,
  onSelect,
  onDelete,
}: {
  note: Note;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="group flex items-start gap-2 px-4 py-2 cursor-pointer"
      style={{
        background: isSelected ? 'var(--color-surface-offset)' : 'transparent',
        borderLeft: isSelected ? '2px solid var(--color-primary)' : '2px solid transparent',
        transition: 'background var(--transition-interactive)',
      }}
      onClick={onSelect}
    >
      <div className="flex-1 min-w-0">
        <p
          style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 500,
            color: 'var(--color-text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {note.title || 'Sans titre'}
        </p>
        {note.content && (
          <p
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              marginTop: '1px',
            }}
          >
            {note.content.substring(0, 60)}
          </p>
        )}
        {note.tags.length > 0 && (
          <div className="flex gap-1 mt-1 flex-wrap">
            {note.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: '10px',
                  background: 'var(--color-primary-highlight)',
                  color: 'var(--color-primary)',
                  padding: '1px 5px',
                  borderRadius: 'var(--radius-full)',
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        aria-label="Supprimer la note"
        className="opacity-0 group-hover:opacity-100"
        style={{
          color: 'var(--color-error)',
          transition: 'opacity var(--transition-interactive)',
          padding: '2px',
          flexShrink: 0,
          marginTop: '2px',
        }}
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}
