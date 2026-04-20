'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  History,
  Filter,
  ChevronDown,
  FileText,
  User,
  FolderKanban,
  Clock,
  Euro,
  Receipt,
  Link as LinkIcon,
  Paperclip,
  GitBranch,
} from 'lucide-react';
import { db } from '@/lib/db';
import { cn } from '@/lib/utils';
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_LABELS,
} from '../labels';
import type {
  Dossier,
  AuditEntry,
  AuditEntityType,
  AuditAction,
} from '@/types';

interface Props {
  dossier: Dossier;
}

const ENTITY_ICONS: Record<AuditEntityType, React.ElementType> = {
  dossier: FolderKanban,
  document: FileText,
  contact: User,
  time: Clock,
  expense: Euro,
  fee: Euro,
  invoice: Receipt,
  attachment: Paperclip,
  link: LinkIcon,
  version: GitBranch,
};

const ACTION_COLORS: Partial<Record<AuditAction, string>> = {
  create: 'text-emerald-600 bg-emerald-50',
  update: 'text-blue-600 bg-blue-50',
  delete: 'text-red-600 bg-red-50',
  view: 'text-gray-600 bg-gray-50',
  download: 'text-indigo-600 bg-indigo-50',
  share: 'text-purple-600 bg-purple-50',
  restore_version: 'text-amber-600 bg-amber-50',
  status_change: 'text-cyan-600 bg-cyan-50',
  attach: 'text-teal-600 bg-teal-50',
  detach: 'text-orange-600 bg-orange-50',
  import: 'text-indigo-600 bg-indigo-50',
  export: 'text-indigo-600 bg-indigo-50',
};

export function DossierAuditTab({ dossier }: Props) {
  const [entityFilter, setEntityFilter] = useState<AuditEntityType | 'all'>('all');
  const [actionFilter, setActionFilter] = useState<AuditAction | 'all'>('all');
  const [openMenu, setOpenMenu] = useState<'entity' | 'action' | null>(null);

  const entries = useLiveQuery(
    () =>
      db.auditLog
        .where('dossierId')
        .equals(dossier.id!)
        .reverse()
        .sortBy('timestamp')
        .then((rows) => rows.reverse()),
    [dossier.id]
  );

  const filtered = useMemo(() => {
    if (!entries) return [];
    return entries.filter((e) => {
      if (entityFilter !== 'all' && e.entityType !== entityFilter) return false;
      if (actionFilter !== 'all' && e.action !== actionFilter) return false;
      return true;
    });
  }, [entries, entityFilter, actionFilter]);

  const groupedByDay = useMemo(() => {
    const groups = new Map<string, AuditEntry[]>();
    for (const e of filtered) {
      const d = new Date(e.timestamp);
      const key = d.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
      const arr = groups.get(key) ?? [];
      arr.push(e);
      groups.set(key, arr);
    }
    return Array.from(groups.entries());
  }, [filtered]);

  return (
    <div className="p-6 space-y-4" onClick={() => setOpenMenu(null)}>
      <div className="flex items-center gap-2 flex-wrap">
        <div
          className="relative"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() =>
              setOpenMenu(openMenu === 'entity' ? null : 'entity')
            }
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-sm rounded-md border',
              'border-[var(--color-border)] bg-[var(--color-surface-raised)]',
              'hover:bg-[var(--color-border)] transition-colors',
              entityFilter !== 'all' &&
                'border-[var(--color-primary)] text-[var(--color-primary)]'
            )}
          >
            <Filter className="w-4 h-4" />
            {entityFilter === 'all'
              ? 'Type d\u2019élément'
              : AUDIT_ENTITY_LABELS[entityFilter]}
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>
          {openMenu === 'entity' && (
            <div className="absolute top-full mt-1 left-0 z-20 w-52 rounded-md shadow-lg py-1 bg-[var(--color-surface)] border border-[var(--color-border)]">
              <MenuItem
                selected={entityFilter === 'all'}
                onClick={() => {
                  setEntityFilter('all');
                  setOpenMenu(null);
                }}
              >
                Tous les éléments
              </MenuItem>
              {(
                Object.entries(AUDIT_ENTITY_LABELS) as [AuditEntityType, string][]
              ).map(([v, l]) => (
                <MenuItem
                  key={v}
                  selected={entityFilter === v}
                  onClick={() => {
                    setEntityFilter(v);
                    setOpenMenu(null);
                  }}
                >
                  {l}
                </MenuItem>
              ))}
            </div>
          )}
        </div>

        <div
          className="relative"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() =>
              setOpenMenu(openMenu === 'action' ? null : 'action')
            }
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-sm rounded-md border',
              'border-[var(--color-border)] bg-[var(--color-surface-raised)]',
              'hover:bg-[var(--color-border)] transition-colors',
              actionFilter !== 'all' &&
                'border-[var(--color-primary)] text-[var(--color-primary)]'
            )}
          >
            <Filter className="w-4 h-4" />
            {actionFilter === 'all'
              ? 'Type d\u2019action'
              : AUDIT_ACTION_LABELS[actionFilter]}
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>
          {openMenu === 'action' && (
            <div className="absolute top-full mt-1 left-0 z-20 w-56 rounded-md shadow-lg py-1 bg-[var(--color-surface)] border border-[var(--color-border)] max-h-72 overflow-auto">
              <MenuItem
                selected={actionFilter === 'all'}
                onClick={() => {
                  setActionFilter('all');
                  setOpenMenu(null);
                }}
              >
                Toutes les actions
              </MenuItem>
              {(
                Object.entries(AUDIT_ACTION_LABELS) as [AuditAction, string][]
              ).map(([v, l]) => (
                <MenuItem
                  key={v}
                  selected={actionFilter === v}
                  onClick={() => {
                    setActionFilter(v);
                    setOpenMenu(null);
                  }}
                >
                  {l}
                </MenuItem>
              ))}
            </div>
          )}
        </div>

        <span className="text-xs text-[var(--color-text-muted)] ml-auto">
          {filtered.length} action{filtered.length > 1 ? 's' : ''} enregistrée
          {filtered.length > 1 ? 's' : ''}
        </span>
      </div>

      {groupedByDay.length === 0 ? (
        <div className="py-16 text-center text-sm text-[var(--color-text-muted)]">
          <History className="w-8 h-8 mx-auto mb-2 opacity-40" />
          Aucune action enregistrée pour ce dossier
          {(entityFilter !== 'all' || actionFilter !== 'all') && ' avec ces filtres'}
          .
        </div>
      ) : (
        <div className="space-y-6">
          {groupedByDay.map(([day, items]) => (
            <section key={day}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)] mb-2 sticky top-0 bg-[var(--color-surface)] py-1">
                {day}
              </h3>
              <div className="relative pl-6 border-l-2 border-[var(--color-border)] space-y-3">
                {items.map((e) => {
                  const Icon = ENTITY_ICONS[e.entityType] ?? FileText;
                  const time = new Date(e.timestamp).toLocaleTimeString(
                    'fr-FR',
                    { hour: '2-digit', minute: '2-digit' }
                  );
                  let detailsStr = '';
                  if (e.details) {
                    try {
                      const parsed = JSON.parse(e.details);
                      detailsStr = Object.entries(parsed)
                        .map(([k, v]) => `${k} : ${String(v)}`)
                        .join(' · ');
                    } catch {
                      detailsStr = e.details;
                    }
                  }
                  return (
                    <div
                      key={e.id}
                      className="relative flex items-start gap-3 text-sm"
                    >
                      <span className="absolute -left-[29px] top-1 w-3 h-3 rounded-full bg-[var(--color-surface)] border-2 border-[var(--color-primary)]" />
                      <div
                        className={cn(
                          'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center',
                          ACTION_COLORS[e.action] ?? 'text-gray-600 bg-gray-50'
                        )}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="font-medium">
                            {AUDIT_ACTION_LABELS[e.action]}
                          </span>
                          <span className="text-[var(--color-text-muted)]">
                            — {AUDIT_ENTITY_LABELS[e.entityType]} #{e.entityId}
                          </span>
                          <span className="text-xs text-[var(--color-text-muted)] ml-auto tabular-nums">
                            {time}
                          </span>
                        </div>
                        {detailsStr && (
                          <div className="text-xs text-[var(--color-text-muted)] mt-0.5 truncate">
                            {detailsStr}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  selected,
  onClick,
  children,
}: {
  selected?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-4 py-2 text-sm hover:bg-[var(--color-surface-raised)] transition-colors',
        selected && 'text-[var(--color-primary)] font-medium'
      )}
    >
      {children}
    </button>
  );
}
