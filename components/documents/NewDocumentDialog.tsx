'use client';

import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { X, FileText, Scale, Mail, Users, Gavel, FileSignature, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { db } from '@/lib/db';
import { migrateDocumentCategoryIfNeeded } from '@/components/templates/TemplateLibrary';

// ─── Template tel que stocké dans Dexie ────────────────────────────────────
// Doit rester aligné avec `Template` défini dans TemplateLibrary.tsx. On le
// redéfinit ici pour éviter l'import croisé (le dialog est référencé depuis
// des routes qui ne chargent pas TemplateLibrary).
export interface DialogTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  isCustom?: boolean;
  documentCategory?: string;
}

async function loadTemplatesFromDexie(): Promise<DialogTemplate[]> {
  // Garantit que les modèles par défaut historiques disposent du champ
  // `documentCategory` même si l'utilisateur n'a jamais ouvert la
  // bibliothèque depuis l'ajout de cette fonctionnalité.
  await migrateDocumentCategoryIfNeeded();
  const rows = await db
    .table('templates')
    .toArray() as Array<Record<string, unknown> & { id: number }>;
  return rows.map((r) => {
    const raw = r as unknown as DialogTemplate;
    return {
      id: String(r.id),
      name: raw.name ?? 'Sans titre',
      category: raw.category ?? 'Cabinet',
      description: raw.description ?? '',
      icon: raw.icon ?? 'file-text',
      content: raw.content ?? '',
      createdAt: raw.createdAt ?? new Date().toISOString(),
      updatedAt: raw.updatedAt ?? new Date().toISOString(),
      isCustom: raw.isCustom,
      documentCategory: raw.documentCategory,
    };
  });
}

// ─── Convertit JSON TipTap / HTML en texte pour l'aperçu ──────────────────
function tiptapNodeToText(node: Record<string, unknown>): string {
  const type = node.type as string;
  const content = (node.content as Record<string, unknown>[] | undefined) ?? [];
  const children = content.map(tiptapNodeToText).join('');
  if (type === 'text') return (node.text as string) ?? '';
  if (type === 'hardBreak') return '\n';
  if (type === 'variableField') return `[${node.attrs && (node.attrs as Record<string,string>).name}]`;
  if (type === 'paragraph' || type === 'heading') return children + '\n';
  if (type === 'listItem') return '- ' + children;
  return children;
}

function contentToPreviewText(content: string): string {
  if (!content) return '';
  const t = content.trim();
  if (t.startsWith('{"type":"doc"')) {
    try { return tiptapNodeToText(JSON.parse(t)); } catch { return t; }
  }
  return t.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

// ─── Icônes ───────────────────────────────────────────────────────────────
const ICON_MAP: Record<string, React.ElementType> = {
  gavel: Gavel,
  'file-signature': FileSignature,
  scale: Scale,
  mail: Mail,
  'file-text': FileText,
  users: Users,
};
function TemplateIcon({ icon }: { icon: string }) {
  const Icon = ICON_MAP[icon] ?? FileText;
  return <Icon size={14} />;
}

// ─── Props ────────────────────────────────────────────────────────────────
interface NewDocumentDialogProps {
  open: boolean;
  onClose: () => void;
  /**
   * Callback de création. Reçoit le titre saisi et le modèle sélectionné
   * (null pour un document vide). Le modèle porte `documentCategory` qui
   * sera appliqué par défaut à la catégorie du nouveau document.
   */
  onCreate: (title: string, template: DialogTemplate | null) => void;
}

export function NewDocumentDialog({ open, onClose, onCreate }: NewDocumentDialogProps) {
  const [title, setTitle]                       = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Tous');
  const [selectedTemplate, setSelectedTemplate] = useState<DialogTemplate | null>(null);

  // Charge les modèles en live depuis Dexie (réagit aux créations/suppressions
  // faites depuis la bibliothèque pendant que le dialog est ouvert).
  const templates = useLiveQuery<DialogTemplate[]>(
    () => (open ? loadTemplatesFromDexie() : Promise.resolve([])),
    [open],
  ) ?? [];

  useEffect(() => {
    if (open) {
      setSelectedTemplate(null);
      setTitle('');
      setSelectedCategory('Tous');
    }
  }, [open]);

  if (!open) return null;

  const categories = ['Tous', ...Array.from(new Set(templates.map((t) => t.category)))];
  const filtered = selectedCategory === 'Tous'
    ? templates
    : templates.filter((t) => t.category === selectedCategory);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const finalTitle = title.trim() || (selectedTemplate ? selectedTemplate.name : 'Nouveau document');
    onCreate(finalTitle, selectedTemplate);
    setTitle('');
    setSelectedTemplate(null);
    setSelectedCategory('Tous');
  }

  function handleClose() {
    setTitle('');
    setSelectedTemplate(null);
    setSelectedCategory('Tous');
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div
        className="relative flex flex-col rounded-xl shadow-2xl"
        style={{ width: '780px', maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 64px)', background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--color-border)', flexShrink: 0 }}>
          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-text)' }}>Nouveau document</h2>
          <button onClick={handleClose} className="p-1.5 rounded-md hover:bg-[var(--color-surface-offset)] transition-colors" aria-label="Fermer">
            <X className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex flex-col gap-4 px-6 py-4" style={{ flexShrink: 0 }}>
            {/* Nom */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="doc-title" style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-text)' }}>Nom du document</label>
              <input
                id="doc-title" type="text" autoFocus
                placeholder={selectedTemplate ? selectedTemplate.name : 'Nouveau document'}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={cn(
                  'w-full px-3 py-2 rounded-md text-sm',
                  'bg-[var(--color-bg)] border border-[var(--color-border)]',
                  'text-[var(--color-text)] placeholder:text-[var(--color-text-muted)]',
                  'focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]'
                )}
              />
            </div>

            {/* Filtres catégories */}
            <div className="flex items-center justify-between gap-3">
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-text)', flexShrink: 0 }}>
                Choisir un modèle
                <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: '6px' }}>(optionnel)</span>
              </span>
              <div className="flex gap-1 flex-wrap justify-end">
                {categories.map((cat) => (
                  <button key={cat} type="button" onClick={() => setSelectedCategory(cat)}
                    style={{ fontSize: 'var(--text-xs)', padding: '3px 10px', borderRadius: 'var(--radius-full)', background: selectedCategory === cat ? 'var(--color-primary)' : 'var(--color-surface-offset)', color: selectedCategory === cat ? '#fff' : 'var(--color-text-muted)', fontWeight: selectedCategory === cat ? 600 : 400, transition: 'all 0.12s' }}
                  >{cat}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Galerie */}
          <div className="flex-1 overflow-y-auto px-6 pb-4" style={{ minHeight: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '10px' }}>

              {/* Card vide */}
              <button type="button" onClick={() => setSelectedTemplate(null)}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '8px', padding: '14px', borderRadius: 'var(--radius-md)', border: `2px solid ${selectedTemplate === null ? 'var(--color-primary)' : 'var(--color-border)'}`, background: selectedTemplate === null ? 'var(--color-primary-highlight)' : 'var(--color-bg)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.12s' }}
              >
                <div style={{ width: '32px', height: '32px', borderRadius: 'var(--radius-sm)', background: selectedTemplate === null ? 'var(--color-primary)' : 'var(--color-surface-offset)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {selectedTemplate === null
                    ? <Check size={14} style={{ color: '#fff' }} />
                    : <FileText size={14} style={{ color: 'var(--color-text-muted)' }} />}
                </div>
                <div>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: selectedTemplate === null ? 'var(--color-primary)' : 'var(--color-text)' }}>Document vide</div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: '2px' }}>Partir de zéro</div>
                </div>
              </button>

              {/* Cards modèles */}
              {filtered.map((t) => {
                const isActive = selectedTemplate?.id === t.id;
                const previewText = contentToPreviewText(t.content);
                return (
                  <button key={t.id} type="button" onClick={() => setSelectedTemplate(t)}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '8px', padding: '14px', borderRadius: 'var(--radius-md)', border: `2px solid ${isActive ? 'var(--color-primary)' : 'var(--color-border)'}`, background: isActive ? 'var(--color-primary-highlight)' : 'var(--color-bg)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.12s' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: 'var(--radius-sm)', background: isActive ? 'var(--color-primary)' : 'var(--color-primary-highlight)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: isActive ? '#fff' : 'var(--color-primary)' }}>
                        <TemplateIcon icon={t.icon} />
                      </div>
                      {t.isCustom && (
                        <span style={{ fontSize: '9px', background: 'var(--color-primary-highlight)', color: 'var(--color-primary)', padding: '1px 5px', borderRadius: '10px', fontWeight: 600 }}>Perso</span>
                      )}
                      {t.documentCategory && (
                        <span style={{ fontSize: '9px', background: 'var(--color-surface-offset)', color: 'var(--color-text-muted)', padding: '1px 5px', borderRadius: '10px', fontWeight: 500, border: '1px solid var(--color-border)' }} title="Catégorie appliquée par défaut au nouveau document">
                          {t.documentCategory}
                        </span>
                      )}
                    </div>
                    <div>
                      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: isActive ? 'var(--color-primary)' : 'var(--color-text)' }}>{t.name}</div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: '1px' }}>{t.category}</div>
                      {t.description && (
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: '2px' }}>{t.description}</div>
                      )}
                    </div>
                    <div style={{ width: '100%', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '7px 9px', marginTop: '2px', fontSize: '9px', color: 'var(--color-text-muted)', lineHeight: 1.5, whiteSpace: 'pre-wrap', overflow: 'hidden', maxHeight: '65px', pointerEvents: 'none', userSelect: 'none' }}>
                      {previewText.slice(0, 220)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t" style={{ borderColor: 'var(--color-border)', flexShrink: 0 }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              {templates.length} modèle{templates.length !== 1 ? 's' : ''} disponible{templates.length !== 1 ? 's' : ''}
            </span>
            <div className="flex gap-3">
              <button type="button" onClick={handleClose}
                className={cn('px-4 py-2 rounded-md text-sm font-medium', 'bg-[var(--color-surface-offset)] text-[var(--color-text)]', 'hover:bg-[var(--color-surface-dynamic)] transition-colors')}>
                Annuler
              </button>
              <button type="submit"
                className={cn('px-4 py-2 rounded-md text-sm font-medium', 'bg-[var(--color-primary)] text-white hover:opacity-90 transition-opacity')}>
                Créer le document
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
