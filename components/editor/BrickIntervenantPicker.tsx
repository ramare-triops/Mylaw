'use client';

/**
 * BrickIntervenantPicker
 *
 * Popover affiché pour appliquer un intervenant (contact) à une brique.
 *
 * Comportement :
 *  - Par défaut, seuls les intervenants rattachés au dossier de travail du
 *    document sont proposés (filtrés en plus par brick.targetContactType
 *    et brick.targetRoles s'ils sont définis).
 *  - Une case à cocher « Étendre la recherche à tous les intervenants »
 *    permet d'inclure tous les contacts de la base (du bon type).
 *  - Si aucun dossier n'est attaché, la recherche est étendue d'office
 *    à toute la base.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { User, Building2, Search, X, Users } from 'lucide-react';
import { db, contactDisplayName } from '@/lib/db';
import { cn } from '@/lib/utils';
import { DOSSIER_ROLE_LABELS } from '@/components/dossiers/labels';
import type { Brick as DBBrick, Contact, DossierContact } from '@/types';

interface Props {
  brick: Pick<DBBrick, 'title' | 'targetContactType' | 'targetRoles'>;
  dossierId?: number;
  anchorRect: { top: number; left: number } | null;
  onPick: (contact: Contact) => void;
  onClose: () => void;
}

interface ContactRow {
  contact: Contact;
  role?: string;
}

export function BrickIntervenantPicker({
  brick,
  dossierId,
  anchorRect,
  onPick,
  onClose,
}: Props) {
  const [search, setSearch] = useState('');
  // Par défaut : restreint au dossier. Si pas de dossier, on étend d'office.
  const [extendAll, setExtendAll] = useState<boolean>(!dossierId);
  const popoverRef = useRef<HTMLDivElement>(null);

  // ─── Ferme au clic extérieur ─────────────────────────────────────────────
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);

  // ─── Chargement des contacts ─────────────────────────────────────────────
  const dossierContacts = useLiveQuery<DossierContact[]>(
    () =>
      dossierId
        ? db.dossierContacts.where('dossierId').equals(dossierId).toArray()
        : Promise.resolve([] as DossierContact[]),
    [dossierId]
  );

  const allContacts = useLiveQuery<Contact[]>(() => db.contacts.toArray(), []);

  const roleByContactId = useMemo(
    () =>
      new Map((dossierContacts ?? []).map((dc) => [dc.contactId, dc.role])),
    [dossierContacts]
  );

  const dossierContactIds = useMemo(
    () =>
      brick.targetRoles && brick.targetRoles.length > 0
        ? (dossierContacts ?? [])
            .filter((dc) => brick.targetRoles!.includes(dc.role))
            .map((dc) => dc.contactId)
        : (dossierContacts ?? []).map((dc) => dc.contactId),
    [dossierContacts, brick.targetRoles]
  );

  // ─── Filtrage ────────────────────────────────────────────────────────────
  const effectiveExtend = extendAll || !dossierId;

  const rows: ContactRow[] = useMemo(() => {
    const base: Contact[] = effectiveExtend
      ? allContacts ?? []
      : (allContacts ?? []).filter((c) => dossierContactIds.includes(c.id!));

    const typeFiltered = brick.targetContactType
      ? base.filter((c) => c.type === brick.targetContactType)
      : base;

    const q = search.trim().toLowerCase();
    const searchFiltered = !q
      ? typeFiltered
      : typeFiltered.filter((c) => {
          const name = contactDisplayName(c).toLowerCase();
          return (
            name.includes(q) ||
            (c.email ?? '').toLowerCase().includes(q) ||
            (c.fileRef ?? '').toLowerCase().includes(q) ||
            (c.firstName ?? '').toLowerCase().includes(q) ||
            (c.lastName ?? '').toLowerCase().includes(q) ||
            (c.companyName ?? '').toLowerCase().includes(q)
          );
        });

    return searchFiltered
      .map((c) => ({
        contact: c,
        role: roleByContactId.get(c.id!),
      }))
      .sort((a, b) => {
        // Intervenants du dossier en premier (utile en mode étendu).
        const aIn = a.role ? 0 : 1;
        const bIn = b.role ? 0 : 1;
        if (aIn !== bIn) return aIn - bIn;
        return contactDisplayName(a.contact).localeCompare(
          contactDisplayName(b.contact)
        );
      });
  }, [
    allContacts,
    brick.targetContactType,
    dossierContactIds,
    effectiveExtend,
    roleByContactId,
    search,
  ]);

  if (!anchorRect) return null;

  const style: React.CSSProperties = {
    position: 'fixed',
    top: anchorRect.top,
    left: anchorRect.left,
    zIndex: 10000,
  };

  const targetLabel = (() => {
    const parts: string[] = [];
    if (brick.targetContactType === 'physical') parts.push('personne physique');
    else if (brick.targetContactType === 'moral') parts.push('personne morale');
    if (brick.targetRoles && brick.targetRoles.length > 0) {
      parts.push(
        'rôles : ' +
          brick.targetRoles.map((r) => DOSSIER_ROLE_LABELS[r]).join(', ')
      );
    }
    return parts.join(' · ');
  })();

  // Empty state contextualisé
  const emptyState = (() => {
    if (rows.length > 0) return null;
    if (!effectiveExtend && dossierId) {
      return (
        <>
          Aucun intervenant du dossier ne correspond.
          <br />
          Cochez « Étendre la recherche » pour voir tous les contacts.
        </>
      );
    }
    if (brick.targetContactType === 'physical') {
      return <>Aucune personne physique disponible.</>;
    }
    if (brick.targetContactType === 'moral') {
      return <>Aucune personne morale disponible.</>;
    }
    return <>Aucun contact disponible.</>;
  })();

  return (
    <div
      ref={popoverRef}
      style={style}
      className={cn(
        'w-[360px] max-w-[90vw] max-h-[440px] flex flex-col',
        'rounded-md shadow-lg',
        'bg-[var(--color-surface)] border border-[var(--color-primary)]'
      )}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2 min-w-0">
          <Users className="w-3.5 h-3.5 text-[var(--color-primary)] flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-xs font-semibold text-[var(--color-text)] truncate">
              {brick.title}
            </div>
            {targetLabel && (
              <div className="text-[10px] text-[var(--color-text-muted)] truncate">
                {targetLabel}
              </div>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-[var(--color-surface-raised)] flex-shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="px-3 py-2 border-b border-[var(--color-border)] flex flex-col gap-1.5">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-muted)]" />
          <input
            type="text"
            placeholder="Rechercher un intervenant…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            className="w-full pl-7 pr-2 py-1.5 text-xs rounded bg-[var(--color-surface-raised)] border border-[var(--color-border)] focus:outline-none focus:border-[var(--color-primary)]"
          />
        </div>

        {/* Case circulaire : étendre la recherche à tous les intervenants */}
        <label
          className={cn(
            'flex items-center gap-2 text-[11px] select-none',
            dossierId
              ? 'cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
              : 'cursor-not-allowed text-[var(--color-text-faint)]'
          )}
          title={
            dossierId
              ? undefined
              : 'Le document n’est rattaché à aucun dossier — tous les intervenants sont déjà affichés.'
          }
        >
          <span
            className={cn(
              'relative inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border transition-colors flex-shrink-0',
              effectiveExtend
                ? 'border-[var(--color-primary)] bg-[var(--color-primary)]'
                : 'border-[var(--color-border)] bg-[var(--color-surface-raised)]'
            )}
          >
            {effectiveExtend && (
              <span className="w-1.5 h-1.5 rounded-full bg-white" />
            )}
          </span>
          <input
            type="checkbox"
            className="sr-only"
            checked={effectiveExtend}
            disabled={!dossierId}
            onChange={(e) => setExtendAll(e.target.checked)}
          />
          Étendre la recherche à tous les intervenants
        </label>
      </div>

      <div className="flex-1 overflow-auto">
        {rows.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-[var(--color-text-muted)]">
            {emptyState}
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {rows.map(({ contact, role }) => (
              <button
                key={contact.id}
                onClick={() => onPick(contact)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--color-surface-raised)] transition-colors"
              >
                {contact.type === 'physical' ? (
                  <User className="w-3.5 h-3.5 text-[var(--color-text-muted)] flex-shrink-0" />
                ) : (
                  <Building2 className="w-3.5 h-3.5 text-[var(--color-text-muted)] flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">
                    {contactDisplayName(contact)}
                  </div>
                  <div className="text-[10px] text-[var(--color-text-muted)] truncate">
                    {role && (
                      <span className="text-[var(--color-primary)] font-medium mr-1">
                        {
                          DOSSIER_ROLE_LABELS[
                            role as keyof typeof DOSSIER_ROLE_LABELS
                          ]
                        }
                      </span>
                    )}
                    {contact.email && <span>{contact.email}</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
