'use client';

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Plus,
  User,
  Building2,
  Mail,
  Phone,
  MapPin,
  Pencil,
  Trash2,
  X,
  Search,
  Minus,
} from 'lucide-react';
import {
  db,
  saveContact,
  deleteContact,
  attachContactToDossier,
  detachContactFromDossier,
  contactDisplayName,
} from '@/lib/db';
import { cn } from '@/lib/utils';
import {
  DOSSIER_ROLE_LABELS,
  CONTACT_TYPE_LABELS,
  PERMISSION_LABELS,
} from '../labels';
import type {
  Dossier,
  Contact,
  DossierRole,
  DossierPermission,
  ContactType,
  DossierContact,
  Civility,
} from '@/types';
import {
  StructuredAddressFields,
  composeAddress,
  type StructuredAddress,
} from '../StructuredAddressFields';

interface Props {
  dossier: Dossier;
}

// ─── Sections d'organisation des intervenants ─────────────────────────────────
// Le rôle de la racine d'un sous-arbre détermine la section dans laquelle il
// est affiché. Les enfants liés (avocat du cabinet attaché à un client,
// confrère adverse attaché à la partie adverse, etc.) restent indentés sous
// leur parent dans la même section — cela reflète la relation, pas le rôle
// brut du contact.
type SectionKey =
  | 'POUR'
  | 'PARTIE ADVERSE'
  | 'JURIDICTION'
  | 'EXPERT'
  | 'COMMISSAIRE DE JUSTICE'
  | 'TÉMOIN'
  | 'AUTRE';

const SECTION_ORDER: SectionKey[] = [
  'POUR',
  'PARTIE ADVERSE',
  'JURIDICTION',
  'EXPERT',
  'COMMISSAIRE DE JUSTICE',
  'TÉMOIN',
  'AUTRE',
];

const ROLE_TO_SECTION: Record<DossierRole, SectionKey> = {
  client:           'POUR',
  ownCounsel:       'POUR',
  collaborator:     'POUR',
  trainee:          'POUR',
  assistant:        'POUR',
  adversary:        'PARTIE ADVERSE',
  adversaryCounsel: 'PARTIE ADVERSE',
  judge:            'JURIDICTION',
  court:            'JURIDICTION',
  expert:           'EXPERT',
  bailiff:          'COMMISSAIRE DE JUSTICE',
  witness:          'TÉMOIN',
  other:            'AUTRE',
};

const SECTION_META: Record<SectionKey, { color: string }> = {
  'POUR':                    { color: 'var(--color-primary)' },
  'PARTIE ADVERSE':          { color: '#dc2626' },
  'JURIDICTION':             { color: '#475569' },
  'EXPERT':                  { color: '#7c3aed' },
  'COMMISSAIRE DE JUSTICE':  { color: '#0891b2' },
  'TÉMOIN':                  { color: '#a16207' },
  'AUTRE':                   { color: '#64748b' },
};

export function DossierContactsTab({ dossier }: Props) {
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  // ── Création d'un lien hiérarchique (+ sur une ligne) ──────────────────
  // linkParent : DossierContact source sur lequel on clique "+".
  // linkRole   : rôle choisi dans le menu déroulant (ex. 'adversaryCounsel').
  // plusMenuFor: id de la ligne dont le menu "+" est ouvert.
  // newLinkedRole : quand on clique "Créer nouveau", on pré-sélectionne ce rôle
  //   dans le ContactDialog et on attache le nouveau contact comme enfant.
  const [linkParent, setLinkParent] = useState<DossierContact | null>(null);
  const [linkRole, setLinkRole] = useState<DossierRole | null>(null);
  const [plusMenuFor, setPlusMenuFor] = useState<number | null>(null);
  const [pendingLinkParent, setPendingLinkParent] = useState<DossierContact | null>(null);
  const [pendingLinkRole, setPendingLinkRole] = useState<DossierRole | null>(null);

  const dossierContacts = useLiveQuery<DossierContact[]>(
    () =>
      db.dossierContacts
        .where('dossierId')
        .equals(dossier.id!)
        .toArray(),
    [dossier.id]
  );

  const contactIds = dossierContacts?.map((dc) => dc.contactId) ?? [];
  const contacts = useLiveQuery<(Contact | undefined)[]>(
    () =>
      contactIds.length > 0
        ? db.contacts.bulkGet(contactIds)
        : Promise.resolve([] as (Contact | undefined)[]),
    [JSON.stringify(contactIds)]
  );

  async function handleSaveContact(c: Contact, role?: DossierRole) {
    const id = await saveContact(c);
    if (!c.id && role) {
      // Si on est en train de créer un contact "lié" (flot depuis le bouton +),
      // on rattache avec le parent ; sinon attachement racine classique.
      await attachContactToDossier(
        dossier.id!,
        id,
        role,
        ['read'],
        pendingLinkParent?.id,
      );
    }
    setContactDialogOpen(false);
    setEditingContact(null);
    setPendingLinkParent(null);
    setPendingLinkRole(null);
  }

  async function handleDeleteContact(c: Contact) {
    if (
      !confirm(
        `Supprimer le contact "${contactDisplayName(c)}" de l'annuaire ?`
      )
    )
      return;
    await deleteContact(c.id!);
  }

  async function handleUpdateDossierContact(
    dc: DossierContact,
    patch: Partial<DossierContact>
  ) {
    await db.dossierContacts.put({ ...dc, ...patch });
  }

  return (
    <>
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              setEditingContact(null);
              setContactDialogOpen(true);
            }}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium',
              'bg-[var(--color-primary)] text-white hover:opacity-90'
            )}
          >
            <Plus className="w-4 h-4" /> Nouvel intervenant
          </button>
          <button
            onClick={() => setAttachOpen(true)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-md text-sm',
              'bg-[var(--color-surface-raised)] border border-[var(--color-border)]',
              'hover:bg-[var(--color-border)]'
            )}
          >
            <User className="w-4 h-4" /> Ajouter depuis l&apos;annuaire
          </button>
        </div>

        {(() => {
          // Index contact par id pour résolution rapide.
          const contactById = new Map<number, Contact>();
          (contacts ?? []).forEach((c, i) => {
            if (c && dossierContacts?.[i]) {
              contactById.set(dossierContacts[i].contactId, c);
            }
          });
          // Arbre par parentDossierContactId, permettant DFS pour l'indentation.
          type Row = { dc: DossierContact; contact: Contact; depth: number };
          const byParent = new Map<number | 'root', DossierContact[]>();
          for (const dc of dossierContacts ?? []) {
            const key = dc.parentDossierContactId ?? ('root' as const);
            if (!byParent.has(key)) byParent.set(key, []);
            byParent.get(key)!.push(dc);
          }
          function subtree(rootDc: DossierContact): Row[] {
            const out: Row[] = [];
            function walk(parentId: number | 'root', depth: number) {
              for (const dc of byParent.get(parentId) ?? []) {
                const contact = contactById.get(dc.contactId);
                if (!contact) continue;
                out.push({ dc, contact, depth });
                if (dc.id != null) walk(dc.id, depth + 1);
              }
            }
            const c = contactById.get(rootDc.contactId);
            if (c) {
              out.push({ dc: rootDc, contact: c, depth: 0 });
              if (rootDc.id != null) walk(rootDc.id, 1);
            }
            return out;
          }

          // Regroupement des racines par section.
          const roots = (byParent.get('root') ?? [])
            .filter((dc) => contactById.has(dc.contactId));
          const bySection = new Map<SectionKey, DossierContact[]>();
          for (const dc of roots) {
            const sec = ROLE_TO_SECTION[dc.role];
            if (!bySection.has(sec)) bySection.set(sec, []);
            bySection.get(sec)!.push(dc);
          }

          if (!dossierContacts || dossierContacts.length === 0) {
            return (
              <div className="py-10 text-center text-sm text-[var(--color-text-muted)] border border-[var(--color-border)] rounded-md">
                Aucun intervenant sur ce dossier.
              </div>
            );
          }

          return (
            <div className="flex flex-col gap-5">
              {SECTION_ORDER.map((sec) => {
                const sectionRoots = bySection.get(sec) ?? [];
                if (sectionRoots.length === 0) return null;
                const meta = SECTION_META[sec];
                return (
                  <section key={sec}>
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className="inline-block w-1 h-4 rounded-sm"
                        style={{ background: meta.color }}
                      />
                      <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: meta.color }}>
                        {sec}
                      </h3>
                      <span className="text-[10px] text-[var(--color-text-faint)]">
                        ({sectionRoots.reduce((acc, r) => acc + subtree(r).length, 0)})
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {sectionRoots.flatMap((root) => subtree(root)).map(({ dc, contact: c, depth }) => (
                        // Wrapper flex : la ligne (avec ses bordures) à gauche,
                        // le bouton + à l'extérieur à droite.
                        <div key={dc.id} className="flex items-stretch gap-2">
                          <div
                            className="flex-1 grid grid-cols-[32px_1fr_180px_160px_120px_64px] gap-3 px-4 py-3 items-center border border-[var(--color-border)] rounded-md hover:bg-[var(--color-surface-raised)]"
                            style={{ paddingLeft: `${16 + depth * 20}px` }}
                          >
                            <div className="flex-shrink-0 flex items-center gap-1">
                              {depth > 0 && (
                                <span
                                  aria-hidden
                                  className="text-[var(--color-text-faint)] select-none"
                                  style={{ fontSize: 14, lineHeight: 1 }}
                                >
                                  └
                                </span>
                              )}
                              {c.type === 'physical' ? (
                                <User className="w-4 h-4 text-[var(--color-text-muted)]" />
                              ) : (
                                <Building2 className="w-4 h-4 text-[var(--color-text-muted)]" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">
                                {contactDisplayName(c)}
                              </div>
                              {c.fileRef && (
                                <div className="text-xs text-[var(--color-text-muted)]">
                                  Réf. : {c.fileRef}
                                </div>
                              )}
                            </div>
                            <select
                              value={dc.role}
                              onChange={(e) =>
                                handleUpdateDossierContact(dc, {
                                  role: e.target.value as DossierRole,
                                })
                              }
                              className="text-xs px-2 py-1 rounded bg-transparent border border-transparent hover:border-[var(--color-border)] focus:border-[var(--color-primary)] focus:outline-none"
                            >
                              {Object.entries(DOSSIER_ROLE_LABELS).map(([v, l]) => (
                                <option key={v} value={v}>
                                  {l}
                                </option>
                              ))}
                            </select>
                            <div className="flex flex-col gap-0.5 min-w-0">
                              {c.email && (
                                <div className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] truncate">
                                  <Mail className="w-3 h-3" /> {c.email}
                                </div>
                              )}
                              {c.phone && (
                                <div className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
                                  <Phone className="w-3 h-3" /> {c.phone}
                                </div>
                              )}
                              {c.address && (
                                <div className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] truncate">
                                  <MapPin className="w-3 h-3" /> {c.address}
                                </div>
                              )}
                            </div>
                            <select
                              value={dc.permissions[0] ?? 'read'}
                              onChange={(e) =>
                                handleUpdateDossierContact(dc, {
                                  permissions: [e.target.value as DossierPermission],
                                })
                              }
                              className="text-xs px-2 py-1 rounded bg-transparent border border-transparent hover:border-[var(--color-border)] focus:border-[var(--color-primary)] focus:outline-none"
                            >
                              {Object.entries(PERMISSION_LABELS).map(([v, l]) => (
                                <option key={v} value={v}>
                                  {l}
                                </option>
                              ))}
                            </select>
                            <div className="flex justify-end gap-1">
                              <button
                                onClick={() => {
                                  setEditingContact(c);
                                  setContactDialogOpen(true);
                                }}
                                className="p-1 rounded hover:bg-[var(--color-border)]"
                                title="Modifier"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => detachContactFromDossier(dc.id!)}
                                className="p-1 rounded hover:bg-red-100"
                                title="Retirer du dossier"
                              >
                                <X className="w-3.5 h-3.5 text-red-500" />
                              </button>
                            </div>
                          </div>

                          {/* Bouton + déplacé à l'extérieur de la ligne, en marge droite */}
                          <div className="relative flex-shrink-0 flex items-center">
                            <button
                              onClick={() =>
                                setPlusMenuFor(plusMenuFor === dc.id ? null : dc.id!)
                              }
                              className={cn(
                                'flex items-center justify-center w-8 h-8 rounded-md',
                                'border border-dashed border-[var(--color-border)]',
                                'text-[var(--color-text-muted)]',
                                'hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]',
                                'hover:bg-[var(--color-primary)]/5 transition-colors',
                              )}
                              title="Lier un intervenant"
                              aria-label="Ajouter un intervenant lié"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                            {plusMenuFor === dc.id && (
                              <RoleLinkMenu
                                onPick={(role) => {
                                  setPlusMenuFor(null);
                                  setLinkParent(dc);
                                  setLinkRole(role);
                                }}
                                onClose={() => setPlusMenuFor(null)}
                              />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          );
        })()}
      </div>

      <ContactDialog
        open={contactDialogOpen}
        initial={editingContact ?? undefined}
        requireRole={!editingContact}
        presetRole={pendingLinkRole ?? undefined}
        presetType={pendingLinkRole ? defaultTypeForRole(pendingLinkRole) : undefined}
        onClose={() => {
          setContactDialogOpen(false);
          setEditingContact(null);
          setPendingLinkParent(null);
          setPendingLinkRole(null);
        }}
        onSave={handleSaveContact}
        onDelete={
          editingContact ? () => handleDeleteContact(editingContact) : undefined
        }
      />

      <AttachContactDialog
        open={attachOpen}
        dossierId={dossier.id!}
        excludedIds={contactIds}
        onClose={() => setAttachOpen(false)}
      />

      <LinkContactDialog
        open={linkParent != null && linkRole != null}
        parent={linkParent}
        role={linkRole}
        dossierId={dossier.id!}
        existingContactIds={contactIds}
        onClose={() => {
          setLinkParent(null);
          setLinkRole(null);
        }}
        onLinkExisting={async (contactId) => {
          if (linkParent?.id == null || !linkRole) return;
          await attachContactToDossier(
            dossier.id!,
            contactId,
            linkRole,
            ['read'],
            linkParent.id,
          );
          setLinkParent(null);
          setLinkRole(null);
        }}
        onCreateNew={() => {
          // Sauvegarde du contexte puis ouverture du ContactDialog en mode
          // création avec le rôle et le type pré-remplis.
          setPendingLinkParent(linkParent);
          setPendingLinkRole(linkRole);
          setLinkParent(null);
          setLinkRole(null);
          setEditingContact(null);
          setContactDialogOpen(true);
        }}
      />
    </>
  );
}

/**
 * Type de contact par défaut pour un rôle donné (utilisé lors de la création
 * d'un intervenant "lié" depuis le bouton +). La plupart des rôles (avocat,
 * expert, commissaire de justice, témoin…) désignent des personnes physiques.
 * Seule la juridiction est par défaut une personne morale.
 */
function defaultTypeForRole(role: DossierRole): ContactType {
  return role === 'court' ? 'moral' : 'physical';
}

// ─── RoleLinkMenu : popup des rôles disponibles pour un lien ──────────────
// Les rôles primaires (client, adversary) ne sont pas proposés car ils
// correspondent à des intervenants racines plutôt qu'à des liens.
const LINK_ROLES: DossierRole[] = [
  'adversaryCounsel',
  'ownCounsel',
  'bailiff',
  'expert',
  'witness',
  'judge',
  'court',
  'collaborator',
  'trainee',
  'assistant',
  'other',
];

function RoleLinkMenu({
  onPick,
  onClose,
}: {
  onPick: (role: DossierRole) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const h = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t?.closest('[data-role-link-menu]')) onClose();
    };
    // Délai pour ne pas capter le click d'ouverture.
    const id = setTimeout(() => document.addEventListener('mousedown', h), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', h);
    };
  }, [onClose]);
  return (
    <div
      data-role-link-menu
      className="absolute right-0 top-full mt-1 z-20 min-w-[220px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg py-1"
    >
      <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-faint)] border-b border-[var(--color-border)]">
        A pour…
      </div>
      {LINK_ROLES.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onPick(r)}
          className="w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--color-surface-raised)]"
        >
          {DOSSIER_ROLE_LABELS[r]}
        </button>
      ))}
    </div>
  );
}

// ─── LinkContactDialog : recherche/création d'un intervenant lié ────────────
function LinkContactDialog({
  open,
  parent,
  role,
  dossierId,
  existingContactIds,
  onClose,
  onLinkExisting,
  onCreateNew,
}: {
  open: boolean;
  parent: DossierContact | null;
  role: DossierRole | null;
  dossierId: number;
  existingContactIds: number[];
  onClose: () => void;
  onLinkExisting: (contactId: number) => void;
  onCreateNew: () => void;
}) {
  const [search, setSearch] = useState('');
  useEffect(() => { if (open) setSearch(''); }, [open]);
  const all = useLiveQuery<Contact[]>(
    () => (open ? db.contacts.toArray() : Promise.resolve([] as Contact[])),
    [open],
  );
  if (!open || !parent || !role) return null;

  const filterType = defaultTypeForRole(role);
  const q = search.trim().toLowerCase();
  const matches = (all ?? [])
    .filter((c) => c.type === filterType)
    .filter((c) => {
      if (!q) return true;
      return (
        contactDisplayName(c).toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q) ||
        (c.lastName ?? '').toLowerCase().includes(q) ||
        (c.companyName ?? '').toLowerCase().includes(q)
      );
    })
    .slice(0, 20);

  const alreadyLinked = new Set(existingContactIds);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative flex flex-col rounded-xl shadow-2xl w-[540px] max-w-[calc(100vw-32px)] max-h-[80vh]"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)]">
          <h3 className="text-sm font-semibold">
            Lier un <span className="text-[var(--color-primary)]">{DOSSIER_ROLE_LABELS[role].toLowerCase()}</span>
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--color-surface-raised)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-3 overflow-hidden flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-muted)] pointer-events-none" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher dans l'annuaire…"
              className={cn(
                'w-full pl-9 pr-3 py-2 text-sm rounded-md',
                'bg-[var(--color-surface-raised)] border border-[var(--color-border)]',
                'focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]',
              )}
            />
          </div>

          <div className="flex-1 overflow-auto border border-[var(--color-border)] rounded-md divide-y divide-[var(--color-border)]">
            {matches.length === 0 ? (
              <div className="text-sm text-center py-6 text-[var(--color-text-muted)]">
                Aucun intervenant trouvé.
              </div>
            ) : (
              matches.map((c) => {
                const isLinked = alreadyLinked.has(c.id!);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onLinkExisting(c.id!)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-[var(--color-surface-raised)]"
                  >
                    {c.type === 'physical' ? (
                      <User className="w-3.5 h-3.5 text-[var(--color-text-muted)] flex-shrink-0" />
                    ) : (
                      <Building2 className="w-3.5 h-3.5 text-[var(--color-text-muted)] flex-shrink-0" />
                    )}
                    <span className="flex-1 truncate">{contactDisplayName(c)}</span>
                    {c.email && (
                      <span className="text-xs text-[var(--color-text-muted)] truncate">
                        {c.email}
                      </span>
                    )}
                    {isLinked && (
                      <span className="text-[10px] text-[var(--color-text-muted)] bg-[var(--color-surface-raised)] px-1.5 py-0.5 rounded">
                        déjà au dossier
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          <button
            type="button"
            onClick={onCreateNew}
            className={cn(
              'flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-md font-medium',
              'border border-dashed border-[var(--color-primary)] text-[var(--color-primary)]',
              'hover:bg-[var(--color-primary)]/10',
            )}
          >
            <Plus className="w-3.5 h-3.5" />
            Créer un nouveau {DOSSIER_ROLE_LABELS[role].toLowerCase()}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ContactDialog : créer / modifier un contact ─────────────────────────────
function ContactDialog({
  open,
  initial,
  requireRole,
  presetRole,
  presetType,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  initial?: Contact;
  requireRole?: boolean;
  presetRole?: DossierRole;
  presetType?: ContactType;
  onClose: () => void;
  onSave: (c: Contact, role?: DossierRole) => void;
  onDelete?: () => void;
}) {
  const [type, setType] = useState<ContactType>('physical');
  const [civility, setCivility] = useState<Civility | ''>('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [birthPlace, setBirthPlace] = useState('');
  const [nationality, setNationality] = useState('');
  const [profession, setProfession] = useState('');

  const [companyName, setCompanyName] = useState('');
  const [legalForm, setLegalForm] = useState('');
  const [capital, setCapital] = useState('');
  const [siret, setSiret] = useState('');
  const [rcs, setRcs] = useState('');
  const [rcsCity, setRcsCity] = useState('');
  const [representative, setRepresentative] = useState('');
  const [representativeRole, setRepresentativeRole] = useState('');

  const [email, setEmail] = useState('');
  const [additionalEmails, setAdditionalEmails] = useState<string[]>([]);
  const [phone, setPhone] = useState('');
  const [additionalPhones, setAdditionalPhones] = useState<string[]>([]);
  const [address, setAddress] = useState<StructuredAddress>({});

  const [fileRef, setFileRef] = useState('');
  const [notes, setNotes] = useState('');
  const [role, setRole] = useState<DossierRole>('client');

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setType(initial.type);
      setCivility(initial.civility ?? '');
      setFirstName(initial.firstName ?? '');
      setLastName(initial.lastName ?? '');
      setBirthDate(
        initial.birthDate
          ? new Date(initial.birthDate).toISOString().slice(0, 10)
          : ''
      );
      setBirthPlace(initial.birthPlace ?? '');
      setNationality(initial.nationality ?? '');
      setProfession(initial.profession ?? '');
      setCompanyName(initial.companyName ?? '');
      setLegalForm(initial.legalForm ?? '');
      setCapital(initial.capital != null ? String(initial.capital) : '');
      setSiret(initial.siret ?? '');
      setRcs(initial.rcs ?? '');
      setRcsCity(initial.rcsCity ?? '');
      setRepresentative(initial.representative ?? '');
      setRepresentativeRole(initial.representativeRole ?? '');
      setEmail(initial.email ?? '');
      setAdditionalEmails(initial.additionalEmails ?? []);
      setPhone(initial.phone ?? '');
      setAdditionalPhones(initial.additionalPhones ?? []);
      setAddress({
        addressNumber: initial.addressNumber,
        addressNumberSuffix: initial.addressNumberSuffix,
        addressStreet: initial.addressStreet,
        addressComplement: initial.addressComplement,
        addressPostalCode: initial.addressPostalCode,
        addressCity: initial.addressCity,
      });
      setFileRef(initial.fileRef ?? '');
      setNotes(initial.notes ?? '');
    } else {
      setType(presetType ?? 'physical');
      setCivility('');
      setFirstName('');
      setLastName('');
      setBirthDate('');
      setBirthPlace('');
      setNationality('');
      setProfession('');
      setCompanyName('');
      setLegalForm('');
      setCapital('');
      setSiret('');
      setRcs('');
      setRcsCity('');
      setRepresentative('');
      setRepresentativeRole('');
      setEmail('');
      setAdditionalEmails([]);
      setPhone('');
      setAdditionalPhones([]);
      setAddress({});
      setFileRef('');
      setNotes('');
      setRole(presetRole ?? 'client');
    }
  }, [open, initial, presetRole, presetType]);

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const now = new Date();
    // Normalisations classiques : nom en MAJUSCULES, prénom en Title case.
    const normalizedLast = lastName.trim().toUpperCase();
    const normalizedFirst = firstName
      .trim()
      .toLowerCase()
      .split(/\s+|-/)
      .map((w, i, arr) => {
        if (!w) return w;
        const cap = w.charAt(0).toUpperCase() + w.slice(1);
        // On préserve les traits d'union (-) en reconstruisant plus bas.
        return cap;
      })
      .join(' ')
      .replace(/\bDe\b/g, 'de')
      .replace(/\bDu\b/g, 'du');
    const composedAddress = composeAddress(address);
    const payload: Contact = {
      ...(initial ?? {}),
      type,
      civility: civility || undefined,
      firstName: normalizedFirst || undefined,
      lastName: normalizedLast || undefined,
      birthDate: birthDate ? new Date(birthDate) : undefined,
      birthPlace: birthPlace.trim() || undefined,
      nationality: nationality.trim() || undefined,
      profession: profession.trim() || undefined,
      companyName: companyName.trim() || undefined,
      legalForm: legalForm.trim() || undefined,
      capital: capital.trim() ? Number(capital.replace(/\s/g, '')) : undefined,
      siret: siret.trim() || undefined,
      rcs: rcs.trim() || undefined,
      rcsCity: rcsCity.trim() || undefined,
      representative: representative.trim() || undefined,
      representativeRole: representativeRole.trim() || undefined,
      email: email.trim() || undefined,
      additionalEmails: additionalEmails.map((e) => e.trim()).filter(Boolean),
      phone: phone.trim() || undefined,
      additionalPhones: additionalPhones.map((p) => p.trim()).filter(Boolean),
      addressNumber: address.addressNumber || undefined,
      addressNumberSuffix: address.addressNumberSuffix || undefined,
      addressStreet: address.addressStreet || undefined,
      addressComplement: address.addressComplement || undefined,
      addressPostalCode: address.addressPostalCode || undefined,
      addressCity: address.addressCity || undefined,
      address: composedAddress || undefined,
      fileRef: fileRef.trim() || undefined,
      notes: notes.trim() || undefined,
      tags: initial?.tags ?? [],
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    };
    onSave(payload, requireRole ? role : undefined);
  }

  const inputCls = cn(
    'w-full px-3 py-2 text-sm rounded-md',
    'bg-[var(--color-surface-raised)] border border-[var(--color-border)]',
    'focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]'
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl w-[560px] max-w-[90vw] max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)]">
          <h3 className="text-sm font-semibold">
            {initial?.id ? 'Modifier l\u2019intervenant' : 'Nouvel intervenant'}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--color-surface-raised)]">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3 overflow-auto">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as ContactType)}
                className={inputCls}
              >
                {Object.entries(CONTACT_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </Field>
            {requireRole && (
              <Field label="Rôle dans le dossier">
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as DossierRole)}
                  className={inputCls}
                >
                  {Object.entries(DOSSIER_ROLE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </Field>
            )}
          </div>

          {type === 'physical' ? (
            <>
              <div className="grid grid-cols-[110px_1fr_1fr] gap-3">
                <Field label="Civilité">
                  <select
                    value={civility}
                    onChange={(e) =>
                      setCivility(e.target.value as Civility | '')
                    }
                    className={inputCls}
                  >
                    <option value="">—</option>
                    <option value="M.">M.</option>
                    <option value="Mme">Mme</option>
                    <option value="Mlle">Mlle</option>
                    <option value="Me">Me (Maître)</option>
                    <option value="Pr.">Pr.</option>
                    <option value="Dr.">Dr.</option>
                  </select>
                </Field>
                <Field label="Prénom">
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="François"
                    className={inputCls}
                    autoComplete="given-name"
                  />
                </Field>
                <Field label="Nom">
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) =>
                      setLastName(e.target.value.toUpperCase())
                    }
                    placeholder="DUPONT"
                    className={cn(inputCls, 'uppercase')}
                    autoComplete="family-name"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Date de naissance">
                  <input
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Lieu de naissance">
                  <input
                    type="text"
                    value={birthPlace}
                    onChange={(e) => setBirthPlace(e.target.value)}
                    placeholder="Lyon"
                    className={inputCls}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Nationalité">
                  <input
                    type="text"
                    value={nationality}
                    onChange={(e) => setNationality(e.target.value)}
                    placeholder="française"
                    className={inputCls}
                  />
                </Field>
                <Field label="Profession">
                  <input
                    type="text"
                    value={profession}
                    onChange={(e) => setProfession(e.target.value)}
                    placeholder="cadre"
                    className={inputCls}
                  />
                </Field>
              </div>
            </>
          ) : (
            <>
              <Field label="Raison sociale">
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="SCI Martin"
                  className={inputCls}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Forme juridique">
                  <input
                    type="text"
                    value={legalForm}
                    onChange={(e) => setLegalForm(e.target.value)}
                    placeholder="SAS"
                    className={inputCls}
                  />
                </Field>
                <Field label="Capital social (€)">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={capital}
                    onChange={(e) =>
                      setCapital(e.target.value.replace(/[^\d]/g, ''))
                    }
                    placeholder="10000"
                    className={inputCls}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="SIRET">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={siret}
                    onChange={(e) =>
                      setSiret(e.target.value.replace(/\s/g, ''))
                    }
                    placeholder="12345678900012"
                    maxLength={14}
                    className={inputCls}
                  />
                </Field>
                <Field label="RCS">
                  <div className="grid grid-cols-[1fr_110px] gap-2">
                    <input
                      type="text"
                      value={rcs}
                      onChange={(e) => setRcs(e.target.value)}
                      placeholder="123 456 789"
                      className={inputCls}
                    />
                    <input
                      type="text"
                      value={rcsCity}
                      onChange={(e) => setRcsCity(e.target.value)}
                      placeholder="Paris"
                      className={inputCls}
                    />
                  </div>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Représentant légal">
                  <input
                    type="text"
                    value={representative}
                    onChange={(e) => setRepresentative(e.target.value)}
                    placeholder="M. Jean DUPONT"
                    className={inputCls}
                  />
                </Field>
                <Field label="Qualité du représentant">
                  <input
                    type="text"
                    value={representativeRole}
                    onChange={(e) => setRepresentativeRole(e.target.value)}
                    placeholder="Président"
                    className={inputCls}
                  />
                </Field>
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Adresses e-mail">
              <MultiInput
                primary={email}
                setPrimary={setEmail}
                extras={additionalEmails}
                setExtras={setAdditionalEmails}
                type="email"
                placeholder="avocat@cabinet.fr"
                icon={<Mail className="w-3.5 h-3.5" />}
                addLabel="Ajouter une adresse e-mail"
                autoComplete="email"
              />
            </Field>
            <Field label="Téléphones">
              <MultiInput
                primary={phone}
                setPrimary={setPhone}
                extras={additionalPhones}
                setExtras={setAdditionalPhones}
                type="tel"
                placeholder="06 12 34 56 78"
                icon={<Phone className="w-3.5 h-3.5" />}
                addLabel="Ajouter un numéro"
                autoComplete="tel"
              />
            </Field>
          </div>

          <Field label="Adresse postale">
            <StructuredAddressFields value={address} onChange={(patch) => setAddress((prev) => ({ ...prev, ...patch }))} />
          </Field>

          <Field label="Référence dossier (interne)">
            <input type="text" value={fileRef} onChange={(e) => setFileRef(e.target.value)} className={inputCls} placeholder="Ex. CLI-023" />
          </Field>

          <Field label="Notes">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={cn(inputCls, 'resize-none')} />
          </Field>

          <div className="flex justify-between gap-2 pt-3 border-t border-[var(--color-border)]">
            {onDelete ? (
              <button
                type="button"
                onClick={onDelete}
                className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-md bg-red-50 border border-red-200 text-red-600 hover:bg-red-100"
              >
                <Trash2 className="w-3.5 h-3.5" /> Supprimer
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm rounded-md bg-[var(--color-surface-raised)] hover:bg-[var(--color-border)]"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm rounded-md font-medium text-white bg-[var(--color-primary)] hover:opacity-90"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── AttachContactDialog : lier un contact existant au dossier ──────────────
function AttachContactDialog({
  open,
  dossierId,
  excludedIds,
  onClose,
}: {
  open: boolean;
  dossierId: number;
  excludedIds: number[];
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<DossierRole>('client');
  const all = useLiveQuery<Contact[]>(
    () => (open ? db.contacts.toArray() : Promise.resolve([] as Contact[])),
    [open]
  );

  if (!open) return null;

  const candidates = (all ?? []).filter(
    (c) => !excludedIds.includes(c.id!)
  );
  const q = search.toLowerCase();
  const filtered = candidates.filter((c) => {
    const label = contactDisplayName(c).toLowerCase();
    return (
      !q ||
      label.includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.fileRef ?? '').toLowerCase().includes(q)
    );
  });

  async function attach(c: Contact) {
    await attachContactToDossier(dossierId, c.id!, role, ['read']);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl w-[560px] max-w-[90vw] max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)]">
          <h3 className="text-sm font-semibold">Ajouter depuis l&apos;annuaire</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--color-surface-raised)]">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3 flex flex-col flex-1 overflow-hidden">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
              <input
                type="text"
                placeholder="Rechercher…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-md bg-[var(--color-surface-raised)] border border-[var(--color-border)]"
              />
            </div>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as DossierRole)}
              className="px-3 py-2 text-sm rounded-md bg-[var(--color-surface-raised)] border border-[var(--color-border)]"
            >
              {Object.entries(DOSSIER_ROLE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 overflow-auto border border-[var(--color-border)] rounded-md divide-y divide-[var(--color-border)]">
            {filtered.length === 0 ? (
              <div className="text-sm text-center py-6 text-[var(--color-text-muted)]">
                Aucun contact disponible.
              </div>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => attach(c)}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-[var(--color-surface-raised)] text-left"
                >
                  {c.type === 'physical' ? (
                    <User className="w-4 h-4 text-[var(--color-text-muted)]" />
                  ) : (
                    <Building2 className="w-4 h-4 text-[var(--color-text-muted)]" />
                  )}
                  <span className="flex-1 truncate font-medium">
                    {contactDisplayName(c)}
                  </span>
                  {c.email && (
                    <span className="text-xs text-[var(--color-text-muted)] truncate">
                      {c.email}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-[var(--color-text-muted)]">{label}</span>
      {children}
    </label>
  );
}

/** Saisie d'un champ principal + liste extensible de champs secondaires (+/–). */
function MultiInput({
  primary,
  setPrimary,
  extras,
  setExtras,
  type,
  placeholder,
  icon,
  addLabel,
  autoComplete,
}: {
  primary: string;
  setPrimary: (v: string) => void;
  extras: string[];
  setExtras: (v: string[]) => void;
  type: 'email' | 'tel';
  placeholder: string;
  icon?: React.ReactNode;
  addLabel: string;
  autoComplete?: string;
}) {
  const inputCls = cn(
    'flex-1 min-w-0 px-3 py-2 text-sm rounded-md',
    'bg-[var(--color-surface-raised)] border border-[var(--color-border)]',
    'text-[var(--color-text)]',
    'focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]'
  );

  const updateExtra = (i: number, v: string) =>
    setExtras(extras.map((e, idx) => (idx === i ? v : e)));
  const removeExtra = (i: number) =>
    setExtras(extras.filter((_, idx) => idx !== i));
  const addExtra = () => setExtras([...extras, '']);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        {icon && (
          <span className="text-[var(--color-text-muted)] flex-shrink-0">
            {icon}
          </span>
        )}
        <input
          type={type}
          value={primary}
          onChange={(e) => setPrimary(e.target.value)}
          placeholder={placeholder}
          className={inputCls}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          onClick={addExtra}
          title={addLabel}
          aria-label={addLabel}
          className={cn(
            'flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md',
            'border border-[var(--color-border)] bg-[var(--color-surface-raised)]',
            'text-[var(--color-text-muted)] hover:text-[var(--color-primary)]',
            'hover:border-[var(--color-primary)] transition-colors'
          )}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
      {extras.map((v, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
          <input
            type={type}
            value={v}
            onChange={(e) => updateExtra(i, e.target.value)}
            placeholder={placeholder}
            className={inputCls}
            autoComplete={autoComplete}
          />
          <button
            type="button"
            onClick={() => removeExtra(i)}
            title="Supprimer"
            aria-label="Supprimer ce champ"
            className={cn(
              'flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md',
              'border border-red-200 bg-red-50 text-red-500',
              'hover:bg-red-100 transition-colors'
            )}
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

