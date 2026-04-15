'use client';

import { useState, useEffect } from 'react';
import { Zap, Plus, Trash2, Edit2, Check, X, Search, Download, Upload } from 'lucide-react';
import { db } from '@/lib/db';

interface Snippet {
  id?: number;
  trigger: string;
  expansion: string;
  category: string;
  createdAt: Date;
}

const DEFAULT_CATEGORIES = [
  'Juridictions',
  'Parties-types',
  'Formules de politesse',
  'Articles de loi',
  'Divers',
];

const DEFAULT_SNIPPETS: Omit<Snippet, 'id' | 'createdAt'>[] = [
  { trigger: 'tgi', expansion: 'Tribunal judiciaire', category: 'Juridictions' },
  { trigger: 'ca', expansion: "Cour d'appel", category: 'Juridictions' },
  { trigger: 'cass', expansion: 'Cour de cassation', category: 'Juridictions' },
  { trigger: 'ce', expansion: "Conseil d'\u00C9tat", category: 'Juridictions' },
  { trigger: 'cpce', expansion: "Code des proc\u00E9dures civiles d'ex\u00E9cution", category: 'Articles de loi' },
  { trigger: 'cpc', expansion: 'Code de proc\u00E9dure civile', category: 'Articles de loi' },
  { trigger: 'cc', expansion: 'Code civil', category: 'Articles de loi' },
  { trigger: 'cp', expansion: 'Code p\u00E9nal', category: 'Articles de loi' },
  { trigger: 'veuillez', expansion: "Veuillez agr\u00E9er, Ma\u00EEtre, l'expression de mes salutations distingu\u00E9es.", category: 'Formules de politesse' },
  { trigger: 'cordialement', expansion: "Je vous prie d'agr\u00E9er, Ma\u00EEtre, l'expression de mes sentiments les meilleurs.", category: 'Formules de politesse' },
];

export function SnippetExpander() {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Tous');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ trigger: '', expansion: '', category: DEFAULT_CATEGORIES[0] });
  const [editForm, setEditForm] = useState({ trigger: '', expansion: '', category: '' });
  const [copyFeedback, setCopyFeedback] = useState<number | null>(null);

  useEffect(() => {
    loadSnippets();
  }, []);

  async function loadSnippets() {
    try {
      const rows = await db.table('snippets').toArray();
      if (rows.length === 0) {
        // Seed with defaults
        const now = new Date();
        for (const s of DEFAULT_SNIPPETS) {
          await db.table('snippets').add({ ...s, createdAt: now });
        }
        const seeded = await db.table('snippets').toArray();
        setSnippets(seeded.map((r: any) => ({ ...r, createdAt: new Date(r.createdAt) })));
      } else {
        setSnippets(rows.map((r: any) => ({ ...r, createdAt: new Date(r.createdAt) })));
      }
    } catch {}
  }

  async function addSnippet() {
    if (!form.trigger.trim() || !form.expansion.trim()) return;
    const s: Snippet = { ...form, createdAt: new Date() };
    try {
      const id = await db.table('snippets').add({ ...form, createdAt: new Date() });
      s.id = id as number;
      setSnippets((prev) => [...prev, s]);
      setForm({ trigger: '', expansion: '', category: DEFAULT_CATEGORIES[0] });
      setShowForm(false);
    } catch {}
  }

  async function deleteSnippet(id: number) {
    try {
      await db.table('snippets').delete(id);
      setSnippets((prev) => prev.filter((s) => s.id !== id));
    } catch {}
  }

  async function saveEdit(id: number) {
    try {
      await db.table('snippets').update(id, {
        trigger: editForm.trigger,
        expansion: editForm.expansion,
        category: editForm.category,
      });
      setSnippets((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...editForm } : s))
      );
      setEditingId(null);
    } catch {}
  }

  function copyToClipboard(text: string, id: number) {
    navigator.clipboard.writeText(text).then(() => {
      setCopyFeedback(id);
      setTimeout(() => setCopyFeedback(null), 1500);
    });
  }

  function exportJSON() {
    const data = JSON.stringify(snippets.map(({ id: _id, createdAt: _ca, ...rest }) => rest), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mylex-snippets.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  const categories = ['Tous', ...DEFAULT_CATEGORIES, ...Array.from(new Set(snippets.map((s) => s.category).filter((c) => !DEFAULT_CATEGORIES.includes(c))))];

  const filtered = snippets.filter((s) => {
    const matchSearch =
      s.trigger.toLowerCase().includes(search.toLowerCase()) ||
      s.expansion.toLowerCase().includes(search.toLowerCase());
    const matchCat = selectedCategory === 'Tous' || s.category === selectedCategory;
    return matchSearch && matchCat;
  });

  const grouped = categories
    .filter((c) => c !== 'Tous')
    .map((cat) => ({
      cat,
      items: filtered.filter((s) => s.category === cat),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: 'var(--color-bg)', fontFamily: 'var(--font-body, Inter, sans-serif)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4 border-b"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
      >
        <div className="flex items-center gap-2">
          <Zap size={18} style={{ color: 'var(--color-primary)' }} />
          <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-text)' }}>
            Expansions de texte
          </h1>
          <span
            style={{
              fontSize: 'var(--text-xs)',
              background: 'var(--color-surface-offset)',
              color: 'var(--color-text-muted)',
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)',
            }}
          >
            {snippets.length} snippet{snippets.length > 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportJSON}
            aria-label="Exporter les snippets"
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
            onClick={() => setShowForm(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: 'var(--text-xs)',
              padding: '4px 12px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-primary)',
              color: '#fff',
              fontWeight: 500,
            }}
          >
            <Plus size={13} /> Nouveau
          </button>
        </div>
      </div>

      {/* Search + filters */}
      <div
        className="flex items-center gap-3 px-6 py-3 border-b flex-wrap"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
      >
        <div className="relative" style={{ flex: 1, minWidth: '180px' }}>
          <Search
            size={13}
            className="absolute"
            style={{ left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }}
          />
          <input
            type="text"
            placeholder="Rechercher un d\u00E9clencheur ou une expansion..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              paddingLeft: '28px',
              paddingRight: '8px',
              paddingTop: '6px',
              paddingBottom: '6px',
              fontSize: 'var(--text-xs)',
              background: 'var(--color-surface-offset)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-text)',
              outline: 'none',
            }}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              style={{
                fontSize: 'var(--text-xs)',
                padding: '3px 10px',
                borderRadius: 'var(--radius-full)',
                background: selectedCategory === cat ? 'var(--color-primary)' : 'var(--color-surface-offset)',
                color: selectedCategory === cat ? '#fff' : 'var(--color-text-muted)',
                fontWeight: selectedCategory === cat ? 600 : 400,
                transition: 'all var(--transition-interactive)',
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <div
          className="px-6 py-4 border-b"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
        >
          <div className="flex flex-wrap gap-3 items-end">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>D\u00E9clencheur</label>
              <input
                type="text"
                placeholder="ex: tgi"
                value={form.trigger}
                onChange={(e) => setForm((f) => ({ ...f, trigger: e.target.value }))}
                style={{ ...inpStyle, width: '120px', fontFamily: 'monospace' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '250px' }}>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Expansion</label>
              <input
                type="text"
                placeholder="Texte complet d\u00E9velopp\u00E9"
                value={form.expansion}
                onChange={(e) => setForm((f) => ({ ...f, expansion: e.target.value }))}
                style={inpStyle}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Cat\u00E9gorie</label>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                style={{ ...inpStyle, width: '160px' }}
              >
                {DEFAULT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <button
              onClick={addSnippet}
              style={{ padding: '6px 16px', borderRadius: 'var(--radius-sm)', background: 'var(--color-primary)', color: '#fff', fontSize: 'var(--text-sm)', fontWeight: 500 }}
            >
              Ajouter
            </button>
            <button
              onClick={() => setShowForm(false)}
              style={{ padding: '6px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-offset)', color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Snippets table */}
      <div className="flex-1 overflow-y-auto p-6">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20" style={{ color: 'var(--color-text-muted)' }}>
            <Zap size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
            <p style={{ fontSize: 'var(--text-base)' }}>Aucun snippet trouv\u00E9</p>
          </div>
        )}
        {selectedCategory === 'Tous'
          ? grouped.map(({ cat, items }) => (
              <SnippetGroup
                key={cat}
                category={cat}
                items={items}
                editingId={editingId}
                editForm={editForm}
                copyFeedback={copyFeedback}
                onEdit={(s) => { setEditingId(s.id!); setEditForm({ trigger: s.trigger, expansion: s.expansion, category: s.category }); }}
                onSaveEdit={saveEdit}
                onCancelEdit={() => setEditingId(null)}
                onEditFormChange={setEditForm}
                onDelete={deleteSnippet}
                onCopy={copyToClipboard}
              />
            ))
          : (
              <SnippetGroup
                category={selectedCategory}
                items={filtered}
                editingId={editingId}
                editForm={editForm}
                copyFeedback={copyFeedback}
                onEdit={(s) => { setEditingId(s.id!); setEditForm({ trigger: s.trigger, expansion: s.expansion, category: s.category }); }}
                onSaveEdit={saveEdit}
                onCancelEdit={() => setEditingId(null)}
                onEditFormChange={setEditForm}
                onDelete={deleteSnippet}
                onCopy={copyToClipboard}
              />
            )}
      </div>
    </div>
  );
}

function SnippetGroup({
  category, items, editingId, editForm, copyFeedback,
  onEdit, onSaveEdit, onCancelEdit, onEditFormChange, onDelete, onCopy
}: {
  category: string;
  items: Snippet[];
  editingId: number | null;
  editForm: { trigger: string; expansion: string; category: string };
  copyFeedback: number | null;
  onEdit: (s: Snippet) => void;
  onSaveEdit: (id: number) => void;
  onCancelEdit: () => void;
  onEditFormChange: (f: any) => void;
  onDelete: (id: number) => void;
  onCopy: (text: string, id: number) => void;
}) {
  return (
    <div style={{ marginBottom: 'var(--space-6)' }}>
      <h3 style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-2)' }}>
        {category}
      </h3>
      <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}>
              <th style={thStyle}>D\u00E9clencheur</th>
              <th style={thStyle}>Expansion</th>
              <th style={{ ...thStyle, width: '100px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr
                key={s.id}
                style={{ borderBottom: '1px solid var(--color-divider)', background: 'var(--color-surface-2)' }}
              >
                {editingId === s.id ? (
                  <>
                    <td style={tdStyle}>
                      <input value={editForm.trigger} onChange={(e) => onEditFormChange((f: any) => ({ ...f, trigger: e.target.value }))} style={{ ...inpStyle, width: '100%', fontFamily: 'monospace' }} />
                    </td>
                    <td style={tdStyle}>
                      <input value={editForm.expansion} onChange={(e) => onEditFormChange((f: any) => ({ ...f, expansion: e.target.value }))} style={{ ...inpStyle, width: '100%' }} />
                    </td>
                    <td style={tdStyle}>
                      <div className="flex gap-2">
                        <button onClick={() => onSaveEdit(s.id!)} aria-label="Sauvegarder" style={{ color: 'var(--color-success)' }}><Check size={14} /></button>
                        <button onClick={onCancelEdit} aria-label="Annuler" style={{ color: 'var(--color-error)' }}><X size={14} /></button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={tdStyle}>
                      <code style={{ fontSize: 'var(--text-xs)', background: 'var(--color-surface-offset)', padding: '2px 6px', borderRadius: 'var(--radius-sm)', color: 'var(--color-primary)', fontFamily: 'monospace' }}>{s.trigger}</code>
                    </td>
                    <td style={{ ...tdStyle, maxWidth: '400px' }}>
                      <span
                        style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)', cursor: 'pointer' }}
                        onClick={() => onCopy(s.expansion, s.id!)}
                        title="Cliquer pour copier"
                      >
                        {copyFeedback === s.id ? (
                          <span style={{ color: 'var(--color-success)', fontWeight: 500 }}>\u2713 Copi\u00E9\u00A0!</span>
                        ) : (
                          s.expansion
                        )}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <div className="flex gap-2">
                        <button onClick={() => onEdit(s)} aria-label="Modifier" style={{ color: 'var(--color-text-muted)' }}><Edit2 size={13} /></button>
                        <button onClick={() => onDelete(s.id!)} aria-label="Supprimer" style={{ color: 'var(--color-text-faint)' }}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '8px 12px',
  textAlign: 'left',
  fontSize: 'var(--text-xs)',
  fontWeight: 600,
  color: 'var(--color-text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const tdStyle: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 'var(--text-sm)',
  color: 'var(--color-text)',
  verticalAlign: 'middle',
};

const inpStyle: React.CSSProperties = {
  padding: '5px 8px',
  fontSize: 'var(--text-sm)',
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--color-text)',
  outline: 'none',
};
