'use client';

import { useState, useEffect } from 'react';
import { X, FileText, Scale, Mail, Users, Gavel, FileSignature, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types (mirror de TemplateLibrary) ────────────────────────────────────────────
interface StoredTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  content: string; // HTML ou JSON TipTap stringifié
  fields: unknown[];
  createdAt: string;
  updatedAt: string;
  isCustom?: boolean;
}

// ─── Modèles par défaut (fallback si localStorage vide) ───────────────────────────
const DEFAULT_TEMPLATES: StoredTemplate[] = [
  {
    id: 'tpl-1', name: 'Mise en demeure', category: 'Contentieux',
    description: 'Lettre de mise en demeure formelle', icon: 'gavel',
    content: '<p><strong>[Lieu]</strong>, le <strong>[Date]</strong></p><p>Maître <strong>[Nom de l\'avocat]</strong><br>[Adresse du cabinet]</p><p>À <strong>[Nom du destinataire]</strong><br>[Adresse]</p><h2>Mise en demeure</h2><p>Monsieur / Madame,</p><p>Par la présente, et en ma qualité d\'avocat de <strong>[Nom du client]</strong>, je me vois dans l\'obligation de vous mettre en demeure de <strong>[objet de la mise en demeure]</strong>.</p><p>En effet, <strong>[exposé des faits]</strong>.</p><p>En conséquence, je vous demande de <strong>[demande précise]</strong> dans un délai de <strong>[X jours]</strong> à compter de la réception de la présente.</p><p>Veuillez agréer, Monsieur / Madame, l\'expression de mes salutations distinguées.</p><p>Maître <strong>[Nom]</strong></p>',
    fields: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', isCustom: false,
  },
  {
    id: 'tpl-2', name: "Convention d'honoraires", category: 'Cabinet',
    description: "Modèle de convention d'honoraires", icon: 'file-signature',
    content: '<h1>CONVENTION D\'HONORAIRES</h1><p>Entre les soussignés :</p><p>Maître <strong>[Nom avocat]</strong>, avocat au Barreau de <strong>[Ville barreau]</strong>, dont le cabinet est situé <strong>[Adresse cabinet]</strong>,<br>ci-après dénommé « l\'Avocat ».</p>',
    fields: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', isCustom: false,
  },
  {
    id: 'tpl-3', name: 'Assignation en référé', category: 'Contentieux',
    description: "Acte d'assignation devant le juge des référés", icon: 'scale',
    content: '<h1>ASSIGNATION EN RÉFÉRÉ</h1><p>L\'AN <strong>[année]</strong><br>LE <strong>[date acte]</strong></p>',
    fields: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', isCustom: false,
  },
  {
    id: 'tpl-4', name: 'Courrier - accusé de réception', category: 'Correspondance',
    description: 'Accusé de réception de dossier client', icon: 'mail',
    content: '<p><strong>[lieu]</strong>, le <strong>[date]</strong></p><p>Objet : Accusé de réception — Dossier <strong>[référence dossier]</strong></p>',
    fields: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', isCustom: false,
  },
  {
    id: 'tpl-5', name: 'Conclusions en réponse', category: 'Contentieux',
    description: 'Trame de conclusions en réponse', icon: 'file-text',
    content: '<p style="text-align:center"><strong>TRIBUNAL JUDICIAIRE DE [ville tribunal]</strong></p><h1 style="text-align:center">CONCLUSIONS EN RÉPONSE</h1>',
    fields: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', isCustom: false,
  },
  {
    id: 'tpl-6', name: 'Procuration', category: 'Cabinet',
    description: 'Mandat / procuration générale', icon: 'users',
    content: '<h1 style="text-align:center">PROCURATION</h1><p>Je soussigné(e), <strong>[nom complet mandant]</strong>, né(e) le <strong>[date naissance]</strong></p>',
    fields: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', isCustom: false,
  },
];

const LS_KEY = 'mylaw_templates_v1';

function loadTemplates(): StoredTemplate[] {
  if (typeof window === 'undefined') return DEFAULT_TEMPLATES;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_TEMPLATES;
    const parsed = JSON.parse(raw) as StoredTemplate[];
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_TEMPLATES;
    return parsed;
  } catch {
    return DEFAULT_TEMPLATES;
  }
}

// ─── Convertit JSON TipTap stringifié en HTML basique pour l'aperçu ──────────────────
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
    try {
      return tiptapNodeToText(JSON.parse(t));
    } catch { return t; }
  }
  // Strip HTML tags for plain text preview
  return t.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

// ─── Icônes ───────────────────────────────────────────────────────────────────
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

const CATEGORY_COLORS: Record<string, string> = {
  Contentieux: '#dc2626',
  Cabinet: '#01696f',
  Correspondance: '#2563eb',
};

// ─── Props ────────────────────────────────────────────────────────────────────────────
interface NewDocumentDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (title: string, templateContent: string) => void;
}

export function NewDocumentDialog({ open, onClose, onCreate }: NewDocumentDialogProps) {
  const [title, setTitle]                               = useState('');
  const [selectedCategory, setSelectedCategory]         = useState('Tous');
  const [selectedTemplate, setSelectedTemplate]         = useState<StoredTemplate | null>(null);
  const [templates, setTemplates]                       = useState<StoredTemplate[]>([]);

  // Charger depuis le localStorage à chaque ouverture
  useEffect(() => {
    if (open) {
      setTemplates(loadTemplates());
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
    onCreate(finalTitle, selectedTemplate?.content ?? '');
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
        style={{
          width: '780px',
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100vh - 64px)',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
        }}
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

            {/* Filtres */}
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
                const catColor = CATEGORY_COLORS[t.category] ?? '#6b7280';
                const previewText = contentToPreviewText(t.content);
                return (
                  <button key={t.id} type="button" onClick={() => setSelectedTemplate(t)}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '8px', padding: '14px', borderRadius: 'var(--radius-md)', border: `2px solid ${isActive ? 'var(--color-primary)' : 'var(--color-border)'}`, background: isActive ? 'var(--color-primary-highlight)' : 'var(--color-bg)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.12s' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: 'var(--radius-sm)', background: isActive ? 'var(--color-primary)' : `${catColor}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: isActive ? '#fff' : catColor }}>
                        <TemplateIcon icon={t.icon} />
                      </div>
                      {t.isCustom && (
                        <span style={{ fontSize: '9px', background: 'var(--color-primary-highlight)', color: 'var(--color-primary)', padding: '1px 5px', borderRadius: '10px', fontWeight: 600 }}>Perso</span>
                      )}
                    </div>
                    <div>
                      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: isActive ? 'var(--color-primary)' : 'var(--color-text)' }}>{t.name}</div>
                      <div style={{ fontSize: 'var(--text-xs)', color: isActive ? 'var(--color-primary)' : catColor, fontWeight: 500, marginTop: '1px' }}>{t.category}</div>
                      {t.description && (
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: '2px' }}>{t.description}</div>
                      )}
                    </div>
                    {/* Mini aperçu texte */}
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
