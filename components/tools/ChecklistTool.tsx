'use client';

import { useState, useEffect } from 'react';
import { CheckSquare, Plus, Trash2, RotateCcw, ChevronDown, ChevronRight, Check } from 'lucide-react';
import { db } from '@/lib/db';

interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  required: boolean;
}

interface Checklist {
  id?: number;
  name: string;
  category: string;
  items: ChecklistItem[];
  createdAt: Date;
  updatedAt: Date;
}

const DEFAULT_CHECKLISTS: Omit<Checklist, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Constitution de dossier',
    category: 'Organisation',
    items: [
      { id: '1', text: 'Identité du client (CNI/Kbis)', done: false, required: true },
      { id: '2', text: 'Justificatif de domicile', done: false, required: true },
      { id: '3', text: "Conventions d'honoraires signée", done: false, required: true },
      { id: '4', text: 'Pièces adverses réceptionnées', done: false, required: false },
      { id: '5', text: 'Timeline des faits établie', done: false, required: false },
      { id: '6', text: 'Analyse préliminaire rédigée', done: false, required: false },
    ],
  },
  {
    name: "Préparation d'audience",
    category: 'Audience',
    items: [
      { id: '1', text: 'Conclusions récapitulatives finalisées', done: false, required: true },
      { id: '2', text: 'Bordereau de pièces numéroté', done: false, required: true },
      { id: '3', text: 'Arguments principaux synthétisés', done: false, required: true },
      { id: '4', text: 'Questions adverses anticipées', done: false, required: false },
      { id: '5', text: 'Points de droit vérifiés sur Légifrance', done: false, required: false },
      { id: '6', text: 'Copie du dossier imprimée', done: false, required: false },
    ],
  },
  {
    name: 'Procédure de référé',
    category: 'Procédure',
    items: [
      { id: '1', text: 'Urgence ou trouble manifestement illicite caractérisé', done: false, required: true },
      { id: '2', text: 'Assignation rédigée', done: false, required: true },
      { id: '3', text: 'Signification effectuée dans les délais', done: false, required: true },
      { id: '4', text: 'Pièces numérotées et communiquées', done: false, required: true },
      { id: '5', text: 'Bordereau de communication déposé', done: false, required: true },
    ],
  },
];

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export function ChecklistTool() {
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('Organisation');
  const [newItemText, setNewItemText] = useState('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadChecklists();
  }, []);

  async function loadChecklists() {
    try {
      const rows = await db.table('sessions')
        .where('toolId').equals('checklist')
        .toArray();
      if (rows.length === 0) {
        const now = new Date();
        for (const cl of DEFAULT_CHECKLISTS) {
          await db.table('sessions').add({
            date: now,
            toolId: 'checklist',
            content: cl,
            tags: [],
          });
        }
        const seeded = await db.table('sessions').where('toolId').equals('checklist').toArray();
        const mapped = seeded.map((r: any) => ({
          id: r.id,
          name: r.content.name,
          category: r.content.category,
          items: r.content.items,
          createdAt: new Date(r.date),
          updatedAt: new Date(r.date),
        }));
        setChecklists(mapped);
        if (mapped.length > 0) setSelectedId(mapped[0].id!);
      } else {
        const mapped = rows.map((r: any) => ({
          id: r.id,
          name: r.content.name,
          category: r.content.category,
          items: r.content.items || [],
          createdAt: new Date(r.date),
          updatedAt: new Date(r.date),
        }));
        setChecklists(mapped);
        if (mapped.length > 0 && !selectedId) setSelectedId(mapped[0].id!);
      }
    } catch {}
  }

  const selected = checklists.find((c) => c.id === selectedId) || null;

  async function saveChecklist(cl: Checklist) {
    if (!cl.id) return;
    try {
      await db.table('sessions').update(cl.id, {
        content: { name: cl.name, category: cl.category, items: cl.items },
        date: new Date(),
      });
      setChecklists((prev) => prev.map((c) => (c.id === cl.id ? cl : c)));
    } catch {}
  }

  function toggleItem(itemId: string) {
    if (!selected) return;
    const updated = {
      ...selected,
      items: selected.items.map((i) => (i.id === itemId ? { ...i, done: !i.done } : i)),
      updatedAt: new Date(),
    };
    saveChecklist(updated);
  }

  function addItem() {
    if (!selected || !newItemText.trim()) return;
    const updated = {
      ...selected,
      items: [...selected.items, { id: uid(), text: newItemText.trim(), done: false, required: false }],
      updatedAt: new Date(),
    };
    setNewItemText('');
    saveChecklist(updated);
  }

  function removeItem(itemId: string) {
    if (!selected) return;
    const updated = {
      ...selected,
      items: selected.items.filter((i) => i.id !== itemId),
      updatedAt: new Date(),
    };
    saveChecklist(updated);
  }

  function resetChecklist() {
    if (!selected) return;
    const updated = {
      ...selected,
      items: selected.items.map((i) => ({ ...i, done: false })),
      updatedAt: new Date(),
    };
    saveChecklist(updated);
  }

  async function createChecklist() {
    if (!newName.trim()) return;
    const now = new Date();
    const cl: Checklist = {
      name: newName.trim(),
      category: newCategory,
      items: [],
      createdAt: now,
      updatedAt: now,
    };
    try {
      const id = await db.table('sessions').add({
        date: now,
        toolId: 'checklist',
        content: { name: cl.name, category: cl.category, items: [] },
        tags: [],
      });
      cl.id = id as number;
      setChecklists((prev) => [...prev, cl]);
      setSelectedId(cl.id);
      setNewName('');
      setShowNewForm(false);
    } catch {}
  }

  async function deleteChecklist(id: number) {
    try {
      await db.table('sessions').delete(id);
      setChecklists((prev) => prev.filter((c) => c.id !== id));
      if (selectedId === id) setSelectedId(checklists.find((c) => c.id !== id)?.id || null);
    } catch {}
  }

  const categories = Array.from(new Set(checklists.map((c) => c.category)));

  const done = selected ? selected.items.filter((i) => i.done).length : 0;
  const total = selected ? selected.items.length : 0;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="flex h-full" style={{ fontFamily: 'var(--font-body, Inter, sans-serif)' }}>
      {/* Sidebar */}
      <div
        className="flex flex-col border-r"
        style={{ width: '260px', minWidth: '260px', background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-center gap-2">
            <CheckSquare size={15} style={{ color: 'var(--color-primary)' }} />
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text)' }}>Checklists</span>
          </div>
          <button
            onClick={() => setShowNewForm(true)}
            aria-label="Nouvelle checklist"
            style={{ color: 'var(--color-primary)', padding: '2px' }}
          >
            <Plus size={16} />
          </button>
        </div>

        {showNewForm && (
          <div className="px-3 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
            <input
              type="text"
              placeholder="Nom de la checklist"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createChecklist()}
              style={{
                width: '100%',
                padding: '5px 8px',
                fontSize: 'var(--text-xs)',
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--color-text)',
                outline: 'none',
                marginBottom: '6px',
              }}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={createChecklist}
                style={{ flex: 1, padding: '4px', borderRadius: 'var(--radius-sm)', background: 'var(--color-primary)', color: '#fff', fontSize: 'var(--text-xs)' }}
              >
                Créer
              </button>
              <button
                onClick={() => setShowNewForm(false)}
                style={{ padding: '4px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-offset)', color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {categories.map((cat) => {
            const catChecklists = checklists.filter((c) => c.category === cat);
            const expanded = expandedSections[cat] !== false;
            return (
              <div key={cat}>
                <button
                  onClick={() => setExpandedSections((prev) => ({ ...prev, [cat]: !expanded }))}
                  className="w-full flex items-center justify-between px-4 py-2"
                  style={{
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    color: 'var(--color-text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {cat}
                  {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>
                {expanded &&
                  catChecklists.map((cl) => {
                    const clDone = cl.items.filter((i) => i.done).length;
                    const clTotal = cl.items.length;
                    return (
                      <div
                        key={cl.id}
                        className="group flex items-center justify-between px-4 py-2 cursor-pointer"
                        style={{
                          background: selectedId === cl.id ? 'var(--color-surface-offset)' : 'transparent',
                          borderLeft: selectedId === cl.id ? '2px solid var(--color-primary)' : '2px solid transparent',
                          transition: 'background var(--transition-interactive)',
                        }}
                        onClick={() => setSelectedId(cl.id!)}
                      >
                        <div className="flex-1 min-w-0">
                          <p style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {cl.name}
                          </p>
                          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                            {clDone}/{clTotal} éléments
                          </p>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); cl.id && deleteChecklist(cl.id); }}
                          aria-label="Supprimer"
                          className="opacity-0 group-hover:opacity-100"
                          style={{ color: 'var(--color-text-faint)', flexShrink: 0 }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Checklist editor */}
      <div className="flex flex-col flex-1" style={{ background: 'var(--color-bg)' }}>
        {selected ? (
          <>
            {/* Header */}
            <div
              className="flex items-center justify-between px-6 py-4 border-b"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
            >
              <div>
                <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-text)' }}>
                  {selected.name}
                </h2>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                  {done}/{total} éléments complétés
                </p>
              </div>
              <button
                onClick={resetChecklist}
                aria-label="Réinitialiser"
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
                <RotateCcw size={12} /> Réinitialiser
              </button>
            </div>

            {/* Progress bar */}
            <div style={{ height: '3px', background: 'var(--color-surface-offset)' }}>
              <div
                style={{
                  height: '100%',
                  width: `${progress}%`,
                  background: progress === 100 ? 'var(--color-success)' : 'var(--color-primary)',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto p-6">
              {selected.items.length === 0 && (
                <div
                  className="flex flex-col items-center justify-center py-12"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  <CheckSquare size={32} style={{ opacity: 0.2, marginBottom: '12px' }} />
                  <p style={{ fontSize: 'var(--text-sm)' }}>Liste vide. Ajoutez des éléments ci-dessous.</p>
                </div>
              )}

              {/* Required items */}
              {selected.items.filter((i) => i.required).length > 0 && (
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <p style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-error)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-2)' }}>
                    Obligatoire
                  </p>
                  {selected.items.filter((i) => i.required).map((item) => (
                    <ChecklistItemRow key={item.id} item={item} onToggle={toggleItem} onDelete={removeItem} />
                  ))}
                </div>
              )}

              {/* Optional items */}
              {selected.items.filter((i) => !i.required).length > 0 && (
                <div>
                  <p style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-2)' }}>
                    Optionnel
                  </p>
                  {selected.items.filter((i) => !i.required).map((item) => (
                    <ChecklistItemRow key={item.id} item={item} onToggle={toggleItem} onDelete={removeItem} />
                  ))}
                </div>
              )}

              {/* Add item */}
              <div className="flex gap-2 mt-6">
                <input
                  type="text"
                  placeholder="Ajouter un élément..."
                  value={newItemText}
                  onChange={(e) => setNewItemText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addItem()}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    fontSize: 'var(--text-sm)',
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--color-text)',
                    outline: 'none',
                  }}
                />
                <button
                  onClick={addItem}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-primary)',
                    color: '#fff',
                    fontSize: 'var(--text-sm)',
                  }}
                >
                  Ajouter
                </button>
              </div>
            </div>
          </>
        ) : (
          <div
            className="flex flex-col items-center justify-center h-full"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <CheckSquare size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
            <p style={{ fontSize: 'var(--text-base)' }}>Sélectionnez une checklist</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ChecklistItemRow({
  item,
  onToggle,
  onDelete,
}: {
  item: ChecklistItem;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div
      className="group flex items-center gap-3 py-2 px-3 rounded mb-1"
      style={{
        background: item.done ? 'oklch(from var(--color-success) l c h / 0.04)' : 'transparent',
        borderRadius: 'var(--radius-sm)',
        transition: 'background var(--transition-interactive)',
      }}
    >
      <button
        onClick={() => onToggle(item.id)}
        aria-label={item.done ? 'Marquer non fait' : 'Marquer fait'}
        style={{
          flexShrink: 0,
          width: '18px',
          height: '18px',
          borderRadius: '4px',
          border: item.done ? 'none' : '2px solid var(--color-border)',
          background: item.done ? 'var(--color-success)' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          transition: 'all var(--transition-interactive)',
        }}
      >
        {item.done && <Check size={11} />}
      </button>
      <span
        style={{
          flex: 1,
          fontSize: 'var(--text-sm)',
          color: item.done ? 'var(--color-text-muted)' : 'var(--color-text)',
          textDecoration: item.done ? 'line-through' : 'none',
          transition: 'all var(--transition-interactive)',
        }}
      >
        {item.text}
      </span>
      <button
        onClick={() => onDelete(item.id)}
        aria-label="Supprimer l'élément"
        className="opacity-0 group-hover:opacity-100"
        style={{ color: 'var(--color-text-faint)', flexShrink: 0 }}
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}
