'use client';

/**
 * BrickIntervenantPicker
 *
 * Popover affiché depuis un BrickChip pour appliquer un intervenant
 * (contact) à la brique avant insertion. Seuls les contacts compatibles
 * avec la brique sont proposés :
 *   - brick.targetContactType (physical / moral) → filtre sur le type
 *   - brick.targetRoles (DossierRole[]) → filtre par rôle dans le dossier courant
 *
 * Si aucun dossier n'est attaché au document courant, on propose l'ensemble
 * des contacts du bon type (filtre role ignoré).
 */

import { useEffect, useRef, useState } from 'react';
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
  /**
   * Par défaut on ne montre que les intervenants liés au dossier courant.
   * L'utilisateur peut cocher « Étendre la recherche à tous les intervenants »
   * pour élargir à l'ensemble de la base contacts du cabinet.
   */
  const [extendAll, setExtendAll] = useState(false);
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
  //  1. Si un dossier est rattaché et des rôles sont spécifiés → on prend les
  //     intervenants du dossier correspondant au(x) rôle(s).
  //  2. Sinon si un dossier est rattaché → tous les intervenants du dossier.
  //  3. Sinon → tous les contacts de la base (du bon type).
  const dossierContacts = useLiveQuery<DossierContact[]>(
    () =>
      dossierId
        ? db.dossierContacts.where('dossierId').equals(dossierId).toArray()
        : Promise.resolve([] as DossierContact[]),
    [dossierId]
  );

  const relevantContactIds = dossierContacts
    ? brick.targetRoles && brick.targetRoles.length > 0
      ? dossierContacts
          .filter((dc) => brick.targetRoles!.includes(dc.role))
          .map((dc) => dc.contactId)
      : dossierContacts.map((dc) => dc.contactId)
    : [];

  const roleByContactId = new Map(
    (dossierContacts ?? []).map((dc) => [dc.contactId, dc.role])
  );

  const allContacts = useLiveQuery<Contact[]>(
    () => db.contacts.toArray(),
    []
  );

  // ─── Filtrage ────────────────────────────────────────────────────────────
  // Base par défaut = intervenants du dossier courant.
  // Si `extendAll` ou aucun dossier → toute la base contacts.
  const rows: ContactRow[] = (() => {
    const dossierScope: Contact[] =
      dossierId && dossierContacts
        ? (allContacts ?? []).filter((c) =>
            relevantContactIds.includes(c.id!)
          )
        : [];
    const base: Contact[] =
      extendAll || !dossierId ? allContacts ?? [] : dossierScope;

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
      // tri : contacts du dossier en premier si on interroge la base globale
      .sort((a, b) => {
        const aIn = a.role ? 0 : 1;
        const bIn = b.role ? 0 : 1;
        if (aIn !== bIn) return aIn - bIn;
        return contactDisplayName(a.contact).localeCompare(
          contactDisplayName(b.contact)
        );
      });
  })();

  if (!anchorRect) return null;

  // Calcul de position (sous le chip, avec ancrage à gauche)
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

  return (
    <div
      ref={popoverRef}
      style={style}
      className={cn(
        'w-[360px] max-w-[90vw] max-h-[400px] flex flex-col',
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

      <div className="px-3 py-2 border-b border-[var(--color-border)] space-y-2">
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

        {/* Toggle : étendre la recherche à tous les intervenants du cabinet */}
        {dossierId && (
          <label
            className={cn(
              'flex items-center gap-2 cursor-pointer select-none',
              'text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            )}
          >
            <input
              type="checkbox"
              checked={extendAll}
              onChange={(e) => setExtendAll(e.target.checked)}
              className="sr-only peer"
            />
            <span
              className={cn(
                'w-3.5 h-3.5 rounded-full border-[1.5px] flex items-center justify-center flex-shrink-0',
                'border-[var(--color-border)] bg-[var(--color-surface)]',
                'peer-checked:border-[var(--color-primary)] peer-checked:bg-[var(--color-primary)]',
                'transition-colors'
              )}
            >
              <span
                className={cn(
                  'w-1.5 h-1.5 rounded-full bg-white transition-opacity',
                  extendAll ? 'opacity-100' : 'opacity-0'
                )}
              />
            </span>
            <span>Étendre la recherche à tous les intervenants</span>
          </label>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {rows.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-[var(--color-text-muted)]">
            {dossierId && !extendAll ? (
              <>
                Aucun intervenant compatible dans ce dossier.
                <br />
                Cochez « Étendre la recherche » pour voir toute la base.
              </>
            ) : brick.targetContactType === 'physical' ? (
              <>Aucune personne physique disponible.</>
            ) : brick.targetContactType === 'moral' ? (
              <>Aucune personne morale disponible.</>
            ) : (
              <>Aucun contact disponible.</>
            )}
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
