'use client';

import { useState, useEffect, useRef } from 'react';
import { Zap, Trash2, Edit2, Check, X, Search, Download, Upload, AlertTriangle } from 'lucide-react';
import { db } from '@/lib/db';

interface Snippet {
  id?: number;
  trigger: string;
  expansion: string;
  category: string;
  createdAt: Date;
}

// Entrée brute du fichier JSON importé
interface ImportedSnippet {
  trigger: string;
  expansion: string;
  category?: string;
}

// Résultat d'analyse d'un snippet importé
type ConflictAction = 'keep' | 'replace';
interface ImportRow {
  imported: ImportedSnippet;
  conflict: Snippet | null; // snippet existant avec le même trigger, ou null
  action: ConflictAction;   // choix de l'utilisateur (keep existing / replace)
}

const DEFAULT_CATEGORIES = [
  'Juridictions',
  'Parties-types',
  'Formules de politesse',
  'Articles de loi',
  'Divers',
];

const DEFAULT_SNIPPETS: Omit<Snippet, 'id' | 'createdAt'>[] = [
  { trigger: 'tgi',          expansion: 'Tribunal judiciaire',                                                              category: 'Juridictions' },
  { trigger: 'ca',           expansion: "Cour d'appel",                                                                    category: 'Juridictions' },
  { trigger: 'cass',         expansion: 'Cour de cassation',                                                               category: 'Juridictions' },
  { trigger: 'ce',           expansion: "Conseil d'État",                                                                  category: 'Juridictions' },
  { trigger: 'cpce',         expansion: "Code des procédures civiles d'exécution",                                        category: 'Articles de loi' },
  { trigger: 'cpc',          expansion: 'Code de procédure civile',                                                        category: 'Articles de loi' },
  { trigger: 'cc',           expansion: 'Code civil',                                                                      category: 'Articles de loi' },
  { trigger: 'cp',           expansion: 'Code pénal',                                                                     category: 'Articles de loi' },
  { trigger: 'veuillez',     expansion: "Veuillez agréer, Maître, l'expression de mes salutations distinguées.",          category: 'Formules de politesse' },
  { trigger: 'cordialement', expansion: "Je vous prie d'agréer, Maître, l'expression de mes sentiments les meilleurs.",  category: 'Formules de politesse' },
];

export function SnippetExpander() {
  const [snippets,         setSnippets]         = useState<Snippet[]>([]);
  const [search,           setSearch]           = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Tous');
  const [editingId,        setEditingId]        = useState<number | null>(null);
  const [form,             setForm]             = useState({ trigger: '', expansion: '', category: DEFAULT_CATEGORIES[0] });
  const [editForm,         setEditForm]         = useState({ trigger: '', expansion: '', category: '' });
  const [copyFeedback,     setCopyFeedback]     = useState<number | null>(null);
  const [addError,         setAddError]         = useState('');

  // Import state
  const [importRows,    setImportRows]    = useState<ImportRow[] | null>(null);
  const [importError,   setImportError]   = useState('');
  const [importDone,    setImportDone]    = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadSnippets(); }, []);

  async function loadSnippets() {
    try {
      const rows = await db.table('snippets').toArray();
      if (rows.length === 0) {
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
    setAddError('');
    const trigger = form.trigger.trim();
    const expansion = form.expansion.trim();
    if (!trigger || !expansion) { setAddError('Le déclencheur et l\'expansion sont requis.'); return; }
    const duplicate = snippets.find((s) => s.trigger.toLowerCase() === trigger.toLowerCase());
    if (duplicate) { setAddError(`Le déclencheur « ${trigger} » existe déjà.`); return; }
    try {
      const id = await db.table('snippets').add({ trigger, expansion, category: form.category, createdAt: new Date() });
      const newSnippet: Snippet = { id: id as number, trigger, expansion, category: form.category, createdAt: new Date() };
      setSnippets((prev) => [...prev, newSnippet]);
      setForm({ trigger: '', expansion: '', category: DEFAULT_CATEGORIES[0] });
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
      setSnippets((prev) => prev.map((s) => (s.id === id ? { ...s, ...editForm } : s)));
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

  // ── Import ──────────────────────────────────────────────────────────────────

  function handleImportClick() {
    setImportError('');
    setImportDone(false);
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so the same file can be re-selected if needed
    e.target.value = '';

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string) as ImportedSnippet[];
        if (!Array.isArray(parsed)) throw new Error('Format invalide : tableau JSON attendu.');
        if (parsed.length === 0) { setImportError('Le fichier est vide.'); return; }
        // Validate each entry
        for (const item of parsed) {
          if (typeof item.trigger !== 'string' || typeof item.expansion !== 'string') {
            throw new Error('Format invalide : chaque entrée doit avoir « trigger » et « expansion ».');
          }
        }
        // Build import rows with conflict detection
        const rows: ImportRow[] = parsed.map((imp) => {
          const conflict = snippets.find(
            (s) => s.trigger.toLowerCase() === imp.trigger.trim().toLowerCase()
          ) ?? null;
          return { imported: imp, conflict, action: 'keep' };
        });
        setImportRows(rows);
        setImportError('');
      } catch (err: any) {
        setImportError(err.message ?? 'Fichier invalide.');
        setImportRows(null);
      }
    };
    reader.readAsText(file);
  }

  function toggleAction(index: number, action: ConflictAction) {
    setImportRows((prev) =>
      prev ? prev.map((r, i) => (i === index ? { ...r, action } : r)) : prev
    );
  }

  async function confirmImport() {
    if (!importRows) return;
    const now = new Date();
    let added = 0;
    let replaced = 0;

    for (const row of importRows) {
      const trigger   = row.imported.trigger.trim();
      const expansion = row.imported.expansion.trim();
      const category  = (row.imported.category ?? 'Divers').trim();

      if (row.conflict) {
        // Conflict : only act if user chose 'replace'
        if (row.action === 'replace') {
          await db.table('snippets').update(row.conflict.id!, { trigger, expansion, category });
          replaced++;
        }
        // 'keep' → skip, leave existing untouched
      } else {
        // No conflict : always add
        await db.table('snippets').add({ trigger, expansion, category, createdAt: now });
        added++;
      }
    }

    await loadSnippets();
    setImportRows(null);
    setImportDone(true);
    setTimeout(() => setImportDone(false), 3000);
    // Small toast-like feedback via addError state (reuse slot)
    setAddError(`✓ Import terminé : ${added} ajouté${added !== 1 ? 's' : ''}, ${replaced} remplacé${replaced !== 1 ? 's' : ''}.`);
    setTimeout(() => setAddError(''), 4000);
  }

  // ── Derived state ────────────────────────────────────────────────────────────

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
    .map((cat) => ({ cat, items: filtered.filter((s) => s.category === cat) }))
    .filter((g) => g.items.length > 0);

  const conflictCount = importRows?.filter((r) => r.conflict).length ?? 0;
  const newCount      = importRows?.filter((r) => !r.conflict).length ?? 0;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: 'var(--color-bg)', fontFamily: 'var(--font-body, Inter, sans-serif)' }}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-6 py-4 border-b"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
      >
        <div className="flex items-center gap-2">
          <Zap size={18} style={{ color: 'var(--color-primary)' }} />
          <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-text)' }}>
            Expansions de texte
          </h1>
          <span style={{
            fontSize: 'var(--text-xs)',
            background: 'var(--color-surface-offset)',
            color: 'var(--color-text-muted)',
            padding: '2px 8px',
            borderRadius: 'var(--radius-full)',
          }}>
            {snippets.length} snippet{snippets.length > 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportJSON}
            aria-label="Exporter les snippets"
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              fontSize: 'var(--text-xs)', padding: '4px 10px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-surface-offset)',
              color: 'var(--color-text-muted)',
            }}
          >
            <Download size={13} /> Exporter
          </button>
          <button
            onClick={handleImportClick}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              fontSize: 'var(--text-xs)', padding: '4px 12px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-primary)',
              color: '#fff', fontWeight: 500,
            }}
          >
            <Upload size={13} /> Importer
          </button>
        </div>
      </div>

      {/* ── Always-visible add form ── */}
      <div
        className="px-6 py-4 border-b"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
      >
        <p style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Ajouter une expansion
        </p>
        <div className="flex flex-wrap gap-3 items-end">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Déclencheur</label>
            <input
              type="text"
              placeholder="ex: tgi"
              value={form.trigger}
              onChange={(e) => { setAddError(''); setForm((f) => ({ ...f, trigger: e.target.value })); }}
              onKeyDown={(e) => { if (e.key === 'Enter') addSnippet(); }}
              style={{ ...inpStyle, width: '130px', fontFamily: 'monospace' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '250px' }}>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Expansion</label>
            <input
              type="text"
              placeholder="Texte complet développé"
              value={form.expansion}
              onChange={(e) => { setAddError(''); setForm((f) => ({ ...f, expansion: e.target.value })); }}
              onKeyDown={(e) => { if (e.key === 'Enter') addSnippet(); }}
              style={inpStyle}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>Catégorie</label>
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              style={{ ...inpStyle, width: '165px' }}
            >
              {DEFAULT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button
            onClick={addSnippet}
            style={{
              padding: '6px 18px', borderRadius: 'var(--radius-sm)',
              background: 'var(--color-primary)', color: '#fff',
              fontSize: 'var(--text-sm)', fontWeight: 500,
              alignSelf: 'flex-end',
            }}
          >
            Ajouter
          </button>
        </div>
        {addError && (
          <p style={{
            marginTop: '8px', fontSize: 'var(--text-xs)',
            color: addError.startsWith('✓') ? 'var(--color-success)' : 'var(--color-error)',
          }}>
            {addError}
          </p>
        )}
      </div>

      {/* ── Search + filters ── */}
      <div
        className="flex items-center gap-3 px-6 py-3 border-b flex-wrap"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
      >
        <div className="relative" style={{ flex: 1, minWidth: '180px' }}>
          <Search size={13} className="absolute" style={{ left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input
            type="text"
            placeholder="Rechercher un déclencheur ou une expansion…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%', paddingLeft: '28px', paddingRight: '8px',
              paddingTop: '6px', paddingBottom: '6px',
              fontSize: 'var(--text-xs)',
              background: 'var(--color-surface-offset)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-text)', outline: 'none',
            }}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {categories.map((cat) => (
            <button key={cat} onClick={() => setSelectedCategory(cat)} style={{
              fontSize: 'var(--text-xs)', padding: '3px 10px',
              borderRadius: 'var(--radius-full)',
              background: selectedCategory === cat ? 'var(--color-primary)' : 'var(--color-surface-offset)',
              color: selectedCategory === cat ? '#fff' : 'var(--color-text-muted)',
              fontWeight: selectedCategory === cat ? 600 : 400,
              transition: 'all var(--transition-interactive)',
            }}>
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* ── Import conflict dialog ── */}
      {importRows && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
            width: '100%', maxWidth: '680px',
            maxHeight: '85vh',
            display: 'flex', flexDirection: 'column',
            margin: '16px',
          }}>
            {/* Dialog header */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-text)' }}>
                    Importer des expansions
                  </h2>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                    {importRows.length} entrée{importRows.length > 1 ? 's' : ''} détectée{importRows.length > 1 ? 's' : ''} —{' '}
                    <span style={{ color: 'var(--color-success)' }}>{newCount} nouvelle{newCount > 1 ? 's' : ''}</span>
                    {conflictCount > 0 && (
                      <>, <span style={{ color: 'var(--color-warning)' }}>{conflictCount} conflit{conflictCount > 1 ? 's' : ''}</span></>
                    )}
                  </p>
                </div>
                <button onClick={() => setImportRows(null)} style={{ color: 'var(--color-text-muted)' }} aria-label="Fermer">
                  <X size={16} />
                </button>
              </div>
              {conflictCount > 0 && (
                <div style={{
                  marginTop: '12px', padding: '10px 14px',
                  background: 'var(--color-warning-bg, rgba(245,158,11,0.08))',
                  border: '1px solid var(--color-warning, #f59e0b)',
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex', alignItems: 'flex-start', gap: '8px',
                  fontSize: 'var(--text-xs)', color: 'var(--color-text)',
                }}>
                  <AlertTriangle size={14} style={{ color: 'var(--color-warning, #f59e0b)', flexShrink: 0, marginTop: '1px' }} />
                  <span>
                    Des expansions avec le même déclencheur existent déjà. Pour chacune, choisissez <strong>Garder l'existant</strong> ou <strong>Remplacer</strong>.
                    Les nouvelles entrées sans conflit seront toujours ajoutées.
                  </span>
                </div>
              )}
            </div>

            {/* Dialog rows */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--color-surface-offset)', borderBottom: '1px solid var(--color-border)' }}>
                    <th style={{ ...thStyle, width: '110px' }}>Déclencheur</th>
                    <th style={thStyle}>Expansion importée</th>
                    <th style={{ ...thStyle, width: '130px' }}>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {importRows.map((row, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--color-divider)' }}>
                      <td style={tdStyle}>
                        <code style={{ fontSize: 'var(--text-xs)', background: 'var(--color-surface-offset)', padding: '2px 6px', borderRadius: 'var(--radius-sm)', color: 'var(--color-primary)', fontFamily: 'monospace' }}>
                          {row.imported.trigger}
                        </code>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}>{row.imported.expansion}</span>
                        {row.conflict && (
                          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                            Existant : <em>{row.conflict.expansion}</em>
                          </p>
                        )}
                      </td>
                      <td style={tdStyle}>
                        {row.conflict ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>
                              <input type="radio" name={`action-${idx}`} checked={row.action === 'keep'} onChange={() => toggleAction(idx, 'keep')} />
                              Garder l'existant
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: 'var(--text-xs)', cursor: 'pointer', color: 'var(--color-warning, #d97706)' }}>
                              <input type="radio" name={`action-${idx}`} checked={row.action === 'replace'} onChange={() => toggleAction(idx, 'replace')} />
                              Remplacer
                            </label>
                          </div>
                        ) : (
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-success)', fontWeight: 500 }}>
                            ✓ Nouveau
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Dialog footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setImportRows(null)}
                style={{
                  padding: '7px 18px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--color-surface-offset)', color: 'var(--color-text-muted)',
                  fontSize: 'var(--text-sm)',
                }}
              >
                Annuler
              </button>
              <button
                onClick={confirmImport}
                style={{
                  padding: '7px 20px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--color-primary)', color: '#fff',
                  fontSize: 'var(--text-sm)', fontWeight: 500,
                }}
              >
                Confirmer l'import
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Snippets list ── */}
      <div className="flex-1 overflow-y-auto p-6">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20" style={{ color: 'var(--color-text-muted)' }}>
            <Zap size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
            <p style={{ fontSize: 'var(--text-base)' }}>Aucun snippet trouvé</p>
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
              <th style={thStyle}>Déclencheur</th>
              <th style={thStyle}>Expansion</th>
              <th style={{ ...thStyle, width: '100px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id} style={{ borderBottom: '1px solid var(--color-divider)', background: 'var(--color-surface-2)' }}>
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
                      <code style={{ fontSize: 'var(--text-xs)', background: 'var(--color-surface-offset)', padding: '2px 6px', borderRadius: 'var(--radius-sm)', color: 'var(--color-primary)', fontFamily: 'monospace' }}>
                        {s.trigger}
                      </code>
                    </td>
                    <td style={{ ...tdStyle, maxWidth: '400px' }}>
                      <span
                        style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)', cursor: 'pointer' }}
                        onClick={() => onCopy(s.expansion, s.id!)}
                        title="Cliquer pour copier"
                      >
                        {copyFeedback === s.id
                          ? <span style={{ color: 'var(--color-success)', fontWeight: 500 }}>✓ Copié !</span>
                          : s.expansion
                        }
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
