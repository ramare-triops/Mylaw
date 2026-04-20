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

export function DossierContactsTab({ dossier }: Props) {
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);

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
      await attachContactToDossier(dossier.id!, id, role, ['read']);
    }
    setContactDialogOpen(false);
    setEditingContact(null);
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

        <div className="border border-[var(--color-border)] rounded-md overflow-hidden">
          <div className="grid grid-cols-[32px_1fr_180px_160px_120px_70px] gap-3 px-4 py-2 text-xs text-[var(--color-text-muted)] font-medium border-b border-[var(--color-border)] bg-[var(--color-surface-raised)]">
            <span />
            <span>Nom / Raison sociale</span>
            <span>Rôle</span>
            <span>Coordonnées</span>
            <span>Droits</span>
            <span />
          </div>
          {!dossierContacts || dossierContacts.length === 0 ? (
            <div className="py-10 text-center text-sm text-[var(--color-text-muted)]">
              Aucun intervenant sur ce dossier.
            </div>
          ) : (
            dossierContacts.map((dc, idx) => {
              const c = contacts?.[idx];
              if (!c) return null;
              return (
                <div
                  key={dc.id}
                  className="grid grid-cols-[32px_1fr_180px_160px_120px_70px] gap-3 px-4 py-3 items-center border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-surface-raised)]"
                >
                  <div className="flex-shrink-0">
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
                        permissions: [
                          e.target.value as DossierPermission,
                        ],
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
              );
            })
          )}
        </div>
      </div>

      <ContactDialog
        open={contactDialogOpen}
        initial={editingContact ?? undefined}
        requireRole={!editingContact}
        onClose={() => {
          setContactDialogOpen(false);
          setEditingContact(null);
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
    </>
  );
}

// ─── ContactDialog : créer / modifier un contact ─────────────────────────────
function ContactDialog({
  open,
  initial,
  requireRole,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  initial?: Contact;
  requireRole?: boolean;
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
  const [phone, setPhone] = useState('');
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
      setPhone(initial.phone ?? '');
      setAddress({
        addressNumber: initial.addressNumber,
        addressStreet: initial.addressStreet,
        addressComplement: initial.addressComplement,
        addressPostalCode: initial.addressPostalCode,
        addressCity: initial.addressCity,
      });
      setFileRef(initial.fileRef ?? '');
      setNotes(initial.notes ?? '');
    } else {
      setType('physical');
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
      setPhone('');
      setAddress({});
      setFileRef('');
      setNotes('');
      setRole('client');
    }
  }, [open, initial]);

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
      phone: phone.trim() || undefined,
      addressNumber: address.addressNumber || undefined,
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
            <Field label="Email">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} autoComplete="email" />
            </Field>
            <Field label="Téléphone">
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} autoComplete="tel" />
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
