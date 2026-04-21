'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRouter } from 'next/navigation';
import { recoverFromFieldDefsScramble } from '@/lib/recover-backup-scramble';
import {
  Plus,
  Search,
  FolderKanban,
  Trash2,
  Pencil,
  Filter,
  ChevronDown,
  ChevronUp,
  Clock,
} from 'lucide-react';
import {
  db,
  saveDossier,
  deleteDossier,
  getSetting,
  setSetting,
  type DossierLastOpenedMap,
} from '@/lib/db';
import { cn, formatDate } from '@/lib/utils';
import { NewDossierDialog } from './NewDossierDialog';
import {
  DOSSIER_TYPE_LABELS,
  DOSSIER_STATUS_LABELS,
  DOSSIER_STATUS_COLORS,
} from './labels';
import type { Dossier, DossierStatus, DossierType } from '@/types';

type StatusFilter = DossierStatus | 'all';
type TypeFilter = DossierType | 'all';

// Colonnes triables de la liste des dossiers. L'ordre est celui des
// cellules du tableau — sauf les actions qui ne sont pas triables.
// `lastOpened` n'a pas de cellule visible : il est piloté par le bouton
// « Dernière ouverture » de la barre d'outils.
type SortColumn =
  | 'reference'
  | 'name'
  | 'type'
  | 'status'
  | 'docs'
  | 'time'
  | 'updated'
  | 'lastOpened';
type SortDirection = 'asc' | 'desc';
interface SortState {
  column: SortColumn;
  direction: SortDirection;
}
const DEFAULT_SORT: SortState = { column: 'updated', direction: 'desc' };
const SORT_SETTING_KEY = 'dossiers_list_sort_v1';

function isSortColumn(v: unknown): v is SortColumn {
  return (
    v === 'reference' ||
    v === 'name' ||
    v === 'type' ||
    v === 'status' ||
    v === 'docs' ||
    v === 'time' ||
    v === 'updated' ||
    v === 'lastOpened'
  );
}
function isSortDirection(v: unknown): v is SortDirection {
  return v === 'asc' || v === 'desc';
}

export function DossierList() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Dossier | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [openMenu, setOpenMenu] = useState<'status' | 'type' | null>(null);
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);

  // Lecture initiale du tri persistant en settings. On passe par un flag
  // `sortLoaded` : tant que le setting n'a pas été lu, on n'écrit pas
  // (sinon on écraserait la valeur stockée avec le défaut au premier
  // montage).
  const [sortLoaded, setSortLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await getSetting<unknown>(SORT_SETTING_KEY, null);
      if (cancelled) return;
      if (stored && typeof stored === 'object') {
        const s = stored as { column?: unknown; direction?: unknown };
        if (isSortColumn(s.column) && isSortDirection(s.direction)) {
          setSort({ column: s.column, direction: s.direction });
        }
      }
      setSortLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sortLoaded) return;
    void setSetting(SORT_SETTING_KEY, sort);
  }, [sort, sortLoaded]);

  function defaultDirectionFor(col: SortColumn): SortDirection {
    // Colonnes « temporelles » ou numériques : desc est l'intuition
    // première (le plus récent / le plus grand d'abord). Colonnes
    // textuelles : asc alphabétique.
    return col === 'updated' || col === 'lastOpened' || col === 'docs' || col === 'time'
      ? 'desc'
      : 'asc';
  }

  function toggleSort(column: SortColumn) {
    setSort((prev) =>
      prev.column === column
        ? { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: defaultDirectionFor(column) }
    );
  }

  // Filet de sécurité one-shot : si la DB locale a été corrompue par un
  // bug de buildBackup qui a croisé les tables (voir
  // lib/recover-backup-scramble.ts), on détecte le décalage au premier
  // montage de la liste et on remet tout à sa place. Idempotent : aucun
  // effet si la DB est saine.
  useEffect(() => {
    void recoverFromFieldDefsScramble();
  }, []);

  const rawDossiers = useLiveQuery(
    () => db.dossiers.orderBy('updatedAt').reverse().toArray(),
    []
  );
  const allDocs = useLiveQuery(() => db.documents.toArray(), []);
  const allTimes = useLiveQuery(() => db.timeEntries.toArray(), []);

  // Horodatages locaux « dernière ouverture » par dossier. Lu en live
  // pour que le tri reflète instantanément un aller-retour vers un détail.
  const lastOpenedMap = useLiveQuery<DossierLastOpenedMap>(async () => {
    const row = await db.settings.get('dossier_last_opened_v1');
    const v = row?.value;
    return v && typeof v === 'object' ? (v as DossierLastOpenedMap) : {};
  }, []) ?? {};

  // Filet de sécurité d'affichage : on écarte les enregistrements qui
  // ne portent pas la forme attendue d'un Dossier. Cela protège la page
  // contre une table `dossiers` qui aurait été polluée par d'autres
  // entités (fieldDefs, sessions, contacts…) lors d'un ancien bug de
  // sync. Un dossier valide doit avoir une `reference` et un `type`
  // présent dans la table des libellés de types.
  const dossiers = rawDossiers?.filter((d): d is Dossier => {
    if (!d || typeof d !== 'object') return false;
    const r = d as Partial<Dossier>;
    return (
      typeof r.reference === 'string' &&
      r.reference.length > 0 &&
      typeof r.name === 'string' &&
      typeof r.type === 'string' &&
      r.type in DOSSIER_TYPE_LABELS &&
      typeof r.status === 'string' &&
      r.status in DOSSIER_STATUS_LABELS &&
      Array.isArray(r.tags)
    );
  });

  const docsByDossier = new Map<number, number>();
  allDocs?.forEach((d) => {
    if (d.dossierId) {
      docsByDossier.set(d.dossierId, (docsByDossier.get(d.dossierId) ?? 0) + 1);
    }
  });

  const timesByDossier = new Map<number, number>();
  allTimes?.forEach((t) => {
    timesByDossier.set(t.dossierId, (timesByDossier.get(t.dossierId) ?? 0) + t.minutes);
  });

  const filtered = (() => {
    if (!dossiers) return [];
    let list = dossiers;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (d) =>
          d.reference.toLowerCase().includes(q) ||
          d.name.toLowerCase().includes(q) ||
          (d.clientName ?? '').toLowerCase().includes(q) ||
          (d.description ?? '').toLowerCase().includes(q) ||
          d.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    if (statusFilter !== 'all') list = list.filter((d) => d.status === statusFilter);
    if (typeFilter !== 'all') list = list.filter((d) => d.type === typeFilter);

    // Tri client-side en fonction de la colonne sélectionnée. Pour les
    // colonnes « documents » et « temps » on trie sur les agrégats
    // calculés plus haut (nombre de documents, total minutes).
    const dir = sort.direction === 'asc' ? 1 : -1;
    const byText = (a: string, b: string) =>
      a.localeCompare(b, 'fr', { sensitivity: 'base', numeric: true }) * dir;
    const byNum = (a: number, b: number) => (a - b) * dir;
    const sorted = [...list].sort((a, b) => {
      switch (sort.column) {
        case 'reference':
          return byText(a.reference, b.reference);
        case 'name':
          return byText(a.name, b.name);
        case 'type':
          return byText(DOSSIER_TYPE_LABELS[a.type], DOSSIER_TYPE_LABELS[b.type]);
        case 'status':
          return byText(DOSSIER_STATUS_LABELS[a.status], DOSSIER_STATUS_LABELS[b.status]);
        case 'docs':
          return byNum(docsByDossier.get(a.id!) ?? 0, docsByDossier.get(b.id!) ?? 0);
        case 'time':
          return byNum(timesByDossier.get(a.id!) ?? 0, timesByDossier.get(b.id!) ?? 0);
        case 'lastOpened': {
          // Dossiers jamais ouverts localement : timestamp 0 → relégués
          // en bas en desc, en haut en asc.
          const ta = a.id != null && lastOpenedMap[a.id] ? Date.parse(lastOpenedMap[a.id]) : 0;
          const tb = b.id != null && lastOpenedMap[b.id] ? Date.parse(lastOpenedMap[b.id]) : 0;
          return byNum(ta, tb);
        }
        case 'updated':
        default:
          return byNum(
            new Date(a.updatedAt).getTime(),
            new Date(b.updatedAt).getTime()
          );
      }
    });
    return sorted;
  })();

  async function handleSave(d: Dossier) {
    const id = await saveDossier(d);
    setDialogOpen(false);
    setEditTarget(null);
    if (!d.id) router.push(`/dossiers/${id}`);
  }

  async function handleDelete(e: React.MouseEvent, d: Dossier) {
    e.stopPropagation();
    if (
      !confirm(
        `Supprimer le dossier "${d.name}" ? Les documents seront détachés mais conservés.`
      )
    )
      return;
    if (d.id) await deleteDossier(d.id);
  }

  return (
    <>
      <div className="p-6 max-w-6xl mx-auto" onClick={() => setOpenMenu(null)}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-[var(--color-text)]">
              Dossiers
            </h1>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              {dossiers?.length ?? 0} dossier
              {(dossiers?.length ?? 0) > 1 ? 's' : ''} au cabinet
            </p>
          </div>
          <button
            onClick={() => {
              setEditTarget(null);
              setDialogOpen(true);
            }}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium',
              'bg-[var(--color-primary)] text-white hover:opacity-90 transition-opacity'
            )}
          >
            <Plus className="w-4 h-4" /> Nouveau dossier
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
            <input
              type="text"
              placeholder="Rechercher un dossier (référence, nom, client, tag…)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(
                'w-full pl-9 pr-4 py-2 text-sm rounded-md',
                'bg-[var(--color-surface-raised)] border border-[var(--color-border)]',
                'text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)]',
                'focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]'
              )}
            />
          </div>

          <FilterMenu
            open={openMenu === 'status'}
            onToggle={(e) => {
              e.stopPropagation();
              setOpenMenu(openMenu === 'status' ? null : 'status');
            }}
            label={
              statusFilter === 'all'
                ? 'Statut'
                : DOSSIER_STATUS_LABELS[statusFilter]
            }
            active={statusFilter !== 'all'}
          >
            <MenuItem
              selected={statusFilter === 'all'}
              onClick={() => {
                setStatusFilter('all');
                setOpenMenu(null);
              }}
            >
              Tous les statuts
            </MenuItem>
            {(
              Object.entries(DOSSIER_STATUS_LABELS) as [DossierStatus, string][]
            ).map(([value, label]) => (
              <MenuItem
                key={value}
                selected={statusFilter === value}
                onClick={() => {
                  setStatusFilter(value);
                  setOpenMenu(null);
                }}
              >
                {label}
              </MenuItem>
            ))}
          </FilterMenu>

          <FilterMenu
            open={openMenu === 'type'}
            onToggle={(e) => {
              e.stopPropagation();
              setOpenMenu(openMenu === 'type' ? null : 'type');
            }}
            label={typeFilter === 'all' ? 'Type' : DOSSIER_TYPE_LABELS[typeFilter]}
            active={typeFilter !== 'all'}
          >
            <MenuItem
              selected={typeFilter === 'all'}
              onClick={() => {
                setTypeFilter('all');
                setOpenMenu(null);
              }}
            >
              Tous les types
            </MenuItem>
            {(
              Object.entries(DOSSIER_TYPE_LABELS) as [DossierType, string][]
            ).map(([value, label]) => (
              <MenuItem
                key={value}
                selected={typeFilter === value}
                onClick={() => {
                  setTypeFilter(value);
                  setOpenMenu(null);
                }}
              >
                {label}
              </MenuItem>
            ))}
          </FilterMenu>

          <SortByLastOpenedButton sort={sort} onSort={toggleSort} />
        </div>

        {/* Header row */}
        {filtered.length > 0 && (
          <div className="grid grid-cols-[110px_1fr_160px_120px_100px_80px_100px_64px] gap-3 px-4 py-2 text-xs text-[var(--color-text-muted)] font-medium border-b border-[var(--color-border)]">
            <SortHeader
              column="reference"
              sort={sort}
              onSort={toggleSort}
              label="Référence"
            />
            <SortHeader
              column="name"
              sort={sort}
              onSort={toggleSort}
              label="Nom / Client"
            />
            <SortHeader
              column="type"
              sort={sort}
              onSort={toggleSort}
              label="Type"
            />
            <SortHeader
              column="status"
              sort={sort}
              onSort={toggleSort}
              label="Statut"
            />
            <SortHeader
              column="docs"
              sort={sort}
              onSort={toggleSort}
              label="Documents"
              align="right"
            />
            <SortHeader
              column="time"
              sort={sort}
              onSort={toggleSort}
              label="Temps"
              align="right"
            />
            <SortHeader
              column="updated"
              sort={sort}
              onSort={toggleSort}
              label="Mis à jour"
              align="right"
            />
            <span />
          </div>
        )}

        {/* Rows */}
        <div className="divide-y divide-[var(--color-border)]">
          {filtered.map((d) => {
            const docsCount = docsByDossier.get(d.id!) ?? 0;
            const timeMinutes = timesByDossier.get(d.id!) ?? 0;
            const h = Math.floor(timeMinutes / 60);
            return (
              <div
                key={d.id}
                onClick={() => router.push(`/dossiers/${d.id}`)}
                className={cn(
                  'grid grid-cols-[110px_1fr_160px_120px_100px_80px_100px_64px] gap-3 px-4 py-3 cursor-pointer group',
                  'hover:bg-[var(--color-surface-raised)] transition-colors items-center'
                )}
              >
                <span className="font-mono text-xs text-[var(--color-text-muted)]">
                  {d.reference}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <FolderKanban className="w-4 h-4 flex-shrink-0 text-[var(--color-primary)]" />
                    <span className="text-sm font-medium truncate">
                      {d.name}
                    </span>
                  </div>
                  {d.clientName && (
                    <div className="text-xs text-[var(--color-text-muted)] truncate pl-6">
                      {d.clientName}
                    </div>
                  )}
                </div>
                <span className="text-xs text-[var(--color-text-muted)]">
                  {DOSSIER_TYPE_LABELS[d.type]}
                </span>
                <span>
                  <span
                    className={cn(
                      'inline-block px-2 py-0.5 text-xs font-medium rounded-full border',
                      DOSSIER_STATUS_COLORS[d.status]
                    )}
                  >
                    {DOSSIER_STATUS_LABELS[d.status]}
                  </span>
                </span>
                <span className="text-xs text-right tabular-nums">
                  {docsCount}
                </span>
                <span className="text-xs text-right tabular-nums text-[var(--color-text-muted)]">
                  {h}h
                </span>
                <span className="text-xs text-right text-[var(--color-text-muted)]">
                  {formatDate(d.updatedAt)}
                </span>
                <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditTarget(d);
                      setDialogOpen(true);
                    }}
                    className="p-1 rounded hover:bg-[var(--color-border)]"
                    title="Modifier"
                  >
                    <Pencil className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                  </button>
                  <button
                    onClick={(e) => handleDelete(e, d)}
                    className="p-1 rounded hover:bg-red-100"
                    title="Supprimer"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </button>
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="py-16 text-center text-sm text-[var(--color-text-muted)]">
              {search || statusFilter !== 'all' || typeFilter !== 'all' ? (
                'Aucun dossier ne correspond aux critères.'
              ) : (
                <>
                  Aucun dossier.
                  <br />
                  Cliquez sur « Nouveau dossier » pour créer le premier.
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <NewDossierDialog
        open={dialogOpen}
        initial={editTarget ?? undefined}
        onClose={() => {
          setDialogOpen(false);
          setEditTarget(null);
        }}
        onSave={handleSave}
      />
    </>
  );
}

function FilterMenu({
  open,
  onToggle,
  label,
  active,
  children,
}: {
  open: boolean;
  onToggle: (e: React.MouseEvent) => void;
  label: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={onToggle}
        className={cn(
          'flex items-center gap-1.5 px-3 py-2 text-sm rounded-md border transition-colors',
          'border-[var(--color-border)] bg-[var(--color-surface-raised)]',
          'text-[var(--color-text)] hover:bg-[var(--color-border)]',
          active && 'border-[var(--color-primary)] text-[var(--color-primary)]'
        )}
      >
        <Filter className="w-4 h-4" /> {label}{' '}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {open && (
        <div
          className={cn(
            'absolute top-full mt-1 right-0 z-20 w-52 rounded-md shadow-lg py-1',
            'bg-[var(--color-surface)] border border-[var(--color-border)]'
          )}
        >
          {children}
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

function SortHeader({
  column,
  sort,
  onSort,
  label,
  align = 'left',
}: {
  column: SortColumn;
  sort: SortState;
  onSort: (c: SortColumn) => void;
  label: string;
  align?: 'left' | 'right';
}) {
  const active = sort.column === column;
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={cn(
        'inline-flex items-center gap-1 hover:text-[var(--color-text)] transition-colors',
        align === 'right' ? 'justify-end' : 'justify-start',
        active && 'text-[var(--color-text)] font-semibold'
      )}
    >
      {label}
      {active ? (
        sort.direction === 'asc' ? (
          <ChevronUp className="w-3 h-3" />
        ) : (
          <ChevronDown className="w-3 h-3" />
        )
      ) : (
        <ChevronDown className="w-3 h-3 opacity-25" />
      )}
    </button>
  );
}

/**
 * Bouton de la barre d'outils qui pilote le tri « Dernière ouverture ».
 * `lastOpened` n'a pas de colonne visible dans le tableau : l'horodatage
 * vit en settings local et ne sert qu'au tri. Le comportement du bouton
 * reste cohérent avec les en-têtes cliquables : premier clic → desc (le
 * plus récent en haut, ce qui est la lecture attendue), deuxième clic
 * → asc.
 */
function SortByLastOpenedButton({
  sort,
  onSort,
}: {
  sort: SortState;
  onSort: (c: SortColumn) => void;
}) {
  const active = sort.column === 'lastOpened';
  return (
    <button
      type="button"
      onClick={() => onSort('lastOpened')}
      title="Trier par dernière ouverture"
      className={cn(
        'flex items-center gap-1.5 px-3 py-2 text-sm rounded-md border transition-colors',
        'border-[var(--color-border)] bg-[var(--color-surface-raised)]',
        'text-[var(--color-text)] hover:bg-[var(--color-border)]',
        active && 'border-[var(--color-primary)] text-[var(--color-primary)]'
      )}
    >
      <Clock className="w-4 h-4" /> Dernière ouverture{' '}
      {active ? (
        sort.direction === 'asc' ? (
          <ChevronUp className="w-3 h-3 opacity-80" />
        ) : (
          <ChevronDown className="w-3 h-3 opacity-80" />
        )
      ) : (
        <ChevronDown className="w-3 h-3 opacity-25" />
      )}
    </button>
  );
}
