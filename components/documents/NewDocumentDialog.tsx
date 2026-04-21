'use client';

import { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { X, FileText, Scale, Mail, Users, Gavel, FileSignature, Check, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { db } from '@/lib/db';
import {
  migrateDocumentCategoryIfNeeded,
  migrateTpl7OptionalClauseIfNeeded,
  seedAdditionalDefaultsIfNeeded,
  tiptapJsonToHtml,
  type TemplateOptionalClause,
} from '@/components/templates/TemplateLibrary';
import {
  applyClauseSelection,
  collectDependencyRefs,
  evaluateDependency,
  scanClauses,
  type ClauseDescriptor,
} from '@/lib/clause-engine';

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
  optionalClauses?: TemplateOptionalClause[];
}

async function loadTemplatesFromDexie(): Promise<DialogTemplate[]> {
  // Garantit que les modèles par défaut historiques disposent du champ
  // `documentCategory` même si l'utilisateur n'a jamais ouvert la
  // bibliothèque depuis l'ajout de cette fonctionnalité. Seed également
  // les modèles ajoutés après le seed initial (ex : convention tarif horaire).
  await migrateDocumentCategoryIfNeeded();
  await seedAdditionalDefaultsIfNeeded();
  await migrateTpl7OptionalClauseIfNeeded();
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
      optionalClauses: raw.optionalClauses,
    };
  });
}

// ─── Clauses : scan + application ─────────────────────────────────────────
/**
 * Wrapper rétro-compatible. Déléguait autrefois à un simple regex sur les
 * commentaires `<!--OPT:id-->…<!--/OPT:id-->`. Désormais l'implémentation
 * vit dans `lib/clause-engine.ts` et gère aussi les wrappers
 * `<section data-clause-id>` de l'extension `ClauseBlock`.
 */
export function applyOptionalClauses(
  content: string,
  enabledIds: ReadonlySet<string>,
): string {
  return applyClauseSelection(normalizeContentToHtml(content), enabledIds);
}

/**
 * Normalise vers du HTML : si le contenu est un JSON TipTap, on le sérialise
 * via `tiptapJsonToHtml` pour pouvoir y passer les outils DOM du moteur de
 * clauses. Si c'est déjà du HTML (ou texte brut), on le laisse tel quel.
 */
function normalizeContentToHtml(content: string): string {
  if (!content) return '';
  const t = content.trim();
  if (t.startsWith('{"type":"doc"')) {
    try { return tiptapJsonToHtml(JSON.parse(t)); } catch { return t; }
  }
  return t;
}

/**
 * Construit la liste des clauses à proposer à l'utilisateur pour un modèle
 * donné. On scanne le HTML (wrappers `<section data-clause-id>` et anciens
 * commentaires `<!--OPT:id-->`) puis on enrichit avec les métadonnées
 * héritées de `template.optionalClauses` (label / defaultChecked) lorsqu'elles
 * existent et que le scan n'a pas déjà une info plus riche.
 */
function buildClauseDescriptors(template: DialogTemplate): ClauseDescriptor[] {
  const html = normalizeContentToHtml(template.content);
  const scanned = scanClauses(html);
  const legacy = template.optionalClauses ?? [];
  if (!legacy.length) return scanned;
  const metaById = new Map(legacy.map((c) => [c.id, c]));
  for (const d of scanned) {
    const meta = metaById.get(d.id);
    if (!meta) continue;
    if (meta.label && d.label === d.id) d.label = meta.label;
    if (typeof meta.defaultChecked === 'boolean' && d.defaultChecked === false) {
      d.defaultChecked = meta.defaultChecked;
    }
  }
  return scanned;
}

/**
 * Calcule l'ensemble des clauses effectivement incluses à partir de l'état
 * des cases à cocher. Tient compte du type de chaque clause :
 *   - required     → toujours inclus.
 *   - optional     → inclus ssi coché.
 *   - conditional  → inclus ssi coché ET `dependsOn` évaluée à true.
 * L'évaluation est itérative pour gérer les chaînes de dépendances
 * (point fixe atteint quand l'ensemble se stabilise).
 */
function computeEffectiveSelection(
  descriptors: ClauseDescriptor[],
  checked: Record<string, boolean>,
): Set<string> {
  const selected = new Set<string>();
  for (const d of descriptors) {
    if (d.type === 'required') selected.add(d.id);
  }
  // Point fixe.
  for (let i = 0; i < descriptors.length + 1; i++) {
    let changed = false;
    for (const d of descriptors) {
      if (d.type === 'required') continue;
      const userChecked = !!checked[d.id];
      const depOk = evaluateDependency(d.dependsOn, selected);
      const shouldBeIn = userChecked && depOk;
      if (shouldBeIn && !selected.has(d.id)) { selected.add(d.id); changed = true; }
      if (!shouldBeIn && selected.has(d.id)) { selected.delete(d.id); changed = true; }
    }
    if (!changed) break;
  }
  return selected;
}

const CLAUSE_TYPE_STYLES: Record<string, { color: string; bg: string; label: string }> = {
  required:    { color: '#01696f', bg: 'rgba(1,105,111,0.08)', label: 'Obligatoire' },
  optional:    { color: '#b45309', bg: 'rgba(180,83,9,0.08)', label: 'Optionnelle' },
  conditional: { color: '#6d28d9', bg: 'rgba(109,40,217,0.08)', label: 'Conditionnelle' },
};

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
  // Etat des clauses optionnelles du modèle sélectionné (id → coché).
  const [enabledClauses, setEnabledClauses] = useState<Record<string, boolean>>({});

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
      setEnabledClauses({});
    }
  }, [open]);

  // Inventaire des clauses du modèle sélectionné (scan du contenu +
  // enrichissement avec les métadonnées héritées de `optionalClauses`).
  const clauseDescriptors = useMemo<ClauseDescriptor[]>(
    () => (selectedTemplate ? buildClauseDescriptors(selectedTemplate) : []),
    [selectedTemplate],
  );

  // Clauses visibles dans le panneau « Clauses du modèle » : on n'affiche
  // pas les clauses obligatoires (l'utilisateur n'a rien à décider) et on
  // trie optional avant conditional pour une lecture logique.
  const visibleClauses = useMemo(
    () =>
      clauseDescriptors
        .filter((c) => c.type !== 'required')
        .sort((a, b) => (a.type === b.type ? 0 : a.type === 'optional' ? -1 : 1)),
    [clauseDescriptors],
  );

  // À chaque changement de modèle sélectionné, (ré)initialise l'état des
  // cases à cocher à partir des `defaultChecked` des descripteurs scannés.
  useEffect(() => {
    const initial: Record<string, boolean> = {};
    for (const c of clauseDescriptors) {
      if (c.type !== 'required') initial[c.id] = c.defaultChecked ?? false;
    }
    setEnabledClauses(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplate]);

  // Sélection effective (tient compte des dépendances) — aussi utilisée
  // pour griser les cases conditionnelles dont la condition n'est pas
  // satisfaite.
  const effectiveSelection = useMemo(
    () => computeEffectiveSelection(clauseDescriptors, enabledClauses),
    [clauseDescriptors, enabledClauses],
  );

  if (!open) return null;

  const categories = ['Tous', ...Array.from(new Set(templates.map((t) => t.category)))];
  const filtered = selectedCategory === 'Tous'
    ? templates
    : templates.filter((t) => t.category === selectedCategory);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const finalTitle = title.trim() || (selectedTemplate ? selectedTemplate.name : 'Nouveau document');
    // Applique les clauses (scan + strip) avant de transmettre au parent.
    let templateToEmit: DialogTemplate | null = selectedTemplate;
    if (selectedTemplate && clauseDescriptors.length) {
      const html = normalizeContentToHtml(selectedTemplate.content);
      templateToEmit = {
        ...selectedTemplate,
        content: applyClauseSelection(html, effectiveSelection),
      };
    }
    onCreate(finalTitle, templateToEmit);
    setTitle('');
    setSelectedTemplate(null);
    setSelectedCategory('Tous');
    setEnabledClauses({});
  }

  function handleClose() {
    setTitle('');
    setSelectedTemplate(null);
    setSelectedCategory('Tous');
    setEnabledClauses({});
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

          {/* Clauses du modèle sélectionné (optionnelles + conditionnelles) */}
          {visibleClauses.length ? (
            <div
              className="flex flex-col gap-2 mx-6 mb-4 p-3 rounded-md"
              style={{ background: 'var(--color-primary-highlight)', border: '1px solid var(--color-border)', flexShrink: 0 }}
            >
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Clauses du modèle
              </span>
              <div className="flex flex-col gap-1.5">
                {visibleClauses.map((c) => {
                  const style = CLAUSE_TYPE_STYLES[c.type] ?? CLAUSE_TYPE_STYLES.required;
                  const depOk = evaluateDependency(c.dependsOn, effectiveSelection);
                  const disabled = c.type === 'conditional' && !depOk;
                  const checked = !!enabledClauses[c.id];
                  const depRefs = collectDependencyRefs(c.dependsOn);
                  const depLabels = depRefs
                    .map((id) => clauseDescriptors.find((d) => d.id === id)?.label ?? id)
                    .join(', ');
                  return (
                    <label
                      key={c.id}
                      className="flex items-start gap-2"
                      style={{
                        fontSize: 'var(--text-sm)',
                        color: disabled ? 'var(--color-text-muted)' : 'var(--color-text)',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        opacity: disabled ? 0.55 : 1,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked && depOk}
                        disabled={disabled}
                        onChange={(e) => setEnabledClauses((prev) => ({ ...prev, [c.id]: e.target.checked }))}
                        style={{ marginTop: '3px', accentColor: style.color }}
                      />
                      <span className="flex flex-col" style={{ minWidth: 0 }}>
                        <span className="flex items-center gap-2 flex-wrap">
                          <span style={{ fontWeight: 500 }}>{c.label}</span>
                          <span
                            style={{
                              fontSize: '10px', fontWeight: 600, textTransform: 'uppercase',
                              letterSpacing: '0.04em', padding: '1px 6px', borderRadius: '10px',
                              color: style.color, background: style.bg,
                            }}
                          >{style.label}</span>
                          {c.type === 'conditional' && depRefs.length > 0 && (
                            <span
                              className="flex items-center gap-1"
                              title={`Dépend de : ${depLabels}`}
                              style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}
                            >
                              <Link2 size={10} /> {depLabels}
                            </span>
                          )}
                        </span>
                        {disabled && (
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                            Activez d'abord : {depLabels}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}

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
