/**
 * clause-engine — scan et strip des clauses d'un modèle de contrat
 *
 * Les clauses sont délimitées dans le contenu HTML par des balises
 * `<section data-clause-id data-clause-type …>` produites par l'extension
 * TipTap `ClauseBlock`. Ce module fournit :
 *   - `scanClauses(html)` : inventaire des clauses présentes dans un contenu
 *     (pour alimenter la dialog « Nouveau document »).
 *   - `evaluateDependency(expr, selected)` : évalue une expression
 *     `ClauseDependencyExpr` (AND/OR/NOT/ref) contre l'ensemble des clauses
 *     incluses.
 *   - `applyClauseSelection(html, selected)` : retire du HTML les clauses
 *     non incluses (soit parce que décochées, soit parce que leur dépendance
 *     n'est pas satisfaite). Les clauses incluses voient leur wrapper
 *     `<section>` retiré (unwrap) pour produire un document final propre
 *     sans métadonnée résiduelle.
 *
 * Tout est fait en DOM (via DOMParser) pour gérer proprement l'imbrication.
 * Les modules appelants tournent en « use client », donc `DOMParser` est
 * disponible. En dernier recours (SSR / tests), on retombe sur un fallback
 * regex qui gère le cas non imbriqué.
 *
 * Support legacy : les marqueurs `<!--OPT:id-->…<!--/OPT:id-->` (ancienne
 * forme des clauses optionnelles de tpl-7) sont encore reconnus par
 * `applyClauseSelection` et `scanClauses` — mais leur usage est déprécié,
 * privilégier `ClauseBlock`.
 */

import type { ClauseDependencyExpr, ClauseType } from '@/components/editor/extensions/ClauseBlock';

export type { ClauseDependencyExpr, ClauseType } from '@/components/editor/extensions/ClauseBlock';

export interface ClauseDescriptor {
  id: string;
  label: string;
  type: ClauseType;
  defaultChecked: boolean;
  /** Expression de dépendance, null si aucune. */
  dependsOn: ClauseDependencyExpr | null;
}

/* ─── Parsing d'expression de dépendance ────────────────────────────────── */

export function parseDependencyExpr(raw: string | null | undefined): ClauseDependencyExpr | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (isDependencyExpr(obj)) return obj;
  } catch {
    // pas du JSON valide : tolère aussi un simple id comme raccourci.
    if (typeof raw === 'string' && raw.trim()) {
      return { kind: 'ref', clauseId: raw.trim() };
    }
  }
  return null;
}

export function serializeDependencyExpr(expr: ClauseDependencyExpr | null): string | null {
  if (!expr) return null;
  return JSON.stringify(expr);
}

function isDependencyExpr(x: unknown): x is ClauseDependencyExpr {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  if (o.kind === 'ref') return typeof o.clauseId === 'string';
  if (o.kind === 'and' || o.kind === 'or') {
    return Array.isArray(o.terms) && o.terms.every(isDependencyExpr);
  }
  if (o.kind === 'not') return isDependencyExpr(o.term);
  return false;
}

/* ─── Évaluation ────────────────────────────────────────────────────────── */

export function evaluateDependency(
  expr: ClauseDependencyExpr | null,
  selected: ReadonlySet<string>,
): boolean {
  if (!expr) return true;
  switch (expr.kind) {
    case 'ref': return selected.has(expr.clauseId);
    case 'and': return expr.terms.every((t) => evaluateDependency(t, selected));
    case 'or':  return expr.terms.some((t) => evaluateDependency(t, selected));
    case 'not': return !evaluateDependency(expr.term, selected);
  }
}

/** Liste (à plat) des `clauseId` référencés par une expression. */
export function collectDependencyRefs(expr: ClauseDependencyExpr | null): string[] {
  if (!expr) return [];
  switch (expr.kind) {
    case 'ref': return [expr.clauseId];
    case 'and':
    case 'or':  return expr.terms.flatMap(collectDependencyRefs);
    case 'not': return collectDependencyRefs(expr.term);
  }
}

/* ─── Scan des clauses dans un contenu HTML ─────────────────────────────── */

export function scanClauses(html: string): ClauseDescriptor[] {
  if (!html) return [];
  const doc = safeParseHtml(html);
  if (!doc) return scanClausesLegacy(html);

  const out: ClauseDescriptor[] = [];
  const seen = new Set<string>();
  const sections = doc.querySelectorAll('section[data-clause-id]');
  sections.forEach((s) => {
    const id = s.getAttribute('data-clause-id') ?? '';
    if (!id || seen.has(id)) return;
    seen.add(id);
    const rawType = s.getAttribute('data-clause-type');
    const type: ClauseType =
      rawType === 'optional' || rawType === 'conditional' || rawType === 'required'
        ? rawType
        : 'required';
    out.push({
      id,
      label: s.getAttribute('data-clause-label') ?? id,
      type,
      defaultChecked: s.getAttribute('data-clause-default-checked') === 'true',
      dependsOn: parseDependencyExpr(s.getAttribute('data-clause-depends-on')),
    });
  });

  // Legacy : récupère aussi les <!--OPT:id--> s'il y en a dans le contenu.
  for (const legacy of scanClausesLegacy(html)) {
    if (!seen.has(legacy.id)) { seen.add(legacy.id); out.push(legacy); }
  }

  return out;
}

function scanClausesLegacy(html: string): ClauseDescriptor[] {
  const out: ClauseDescriptor[] = [];
  const seen = new Set<string>();
  const re = /<!--OPT:([a-zA-Z0-9_-]+)-->/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      label: id,
      type: 'optional',
      defaultChecked: false,
      dependsOn: null,
    });
  }
  return out;
}

/* ─── Application de la sélection (strip + unwrap) ──────────────────────── */

export function applyClauseSelection(
  html: string,
  selectedIds: ReadonlySet<string>,
): string {
  if (!html) return html;
  let out = html;
  const doc = safeParseHtml(out);
  if (doc) {
    applyDomSelection(doc, selectedIds);
    out = doc.body.innerHTML;
  }
  // Legacy : gère aussi les vieux marqueurs OPT.
  out = applyLegacyOpt(out, selectedIds);
  return out;
}

function applyDomSelection(doc: Document, selected: ReadonlySet<string>): void {
  // Traite du plus profond vers le plus externe pour l'imbrication.
  const sections = Array.from(
    doc.querySelectorAll('section[data-clause-id]'),
  ).sort((a, b) => getDepth(b) - getDepth(a));
  for (const s of sections) {
    const id = s.getAttribute('data-clause-id') ?? '';
    const type = s.getAttribute('data-clause-type') ?? 'required';
    const keep = type === 'required' || selected.has(id);
    if (keep) {
      // Unwrap : remonte les enfants puis supprime la <section>.
      const parent = s.parentNode;
      if (!parent) continue;
      while (s.firstChild) parent.insertBefore(s.firstChild, s);
      parent.removeChild(s);
    } else {
      s.parentNode?.removeChild(s);
    }
  }
}

function applyLegacyOpt(html: string, selected: ReadonlySet<string>): string {
  return html.replace(
    /<!--OPT:([a-zA-Z0-9_-]+)-->([\s\S]*?)<!--\/OPT:\1-->/g,
    (_match, id: string, body: string) => (selected.has(id) ? body : ''),
  );
}

function getDepth(el: Element): number {
  let d = 0;
  let cur: Node | null = el.parentNode;
  while (cur) { d++; cur = cur.parentNode; }
  return d;
}

/* ─── Helpers DOMParser (sûrs côté serveur) ────────────────────────────── */

function safeParseHtml(html: string): Document | null {
  if (typeof DOMParser === 'undefined') return null;
  try {
    const parser = new DOMParser();
    return parser.parseFromString(`<!doctype html><html><body>${html}</body></html>`, 'text/html');
  } catch {
    return null;
  }
}
