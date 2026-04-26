'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  X,
  Mail,
  Plus,
  Paperclip,
  FileText,
  AlertTriangle,
  UserPlus,
  Search,
  ChevronLeft,
} from 'lucide-react';
import {
  db,
  getDossierContactsWithRole,
} from '@/lib/db';
import { buildDocxBlob } from '@/lib/export';
import { cn } from '@/lib/utils';
import type {
  Dossier,
  Document as MylawDocument,
  Attachment,
  Contact,
  DossierRole,
} from '@/types';

interface Props {
  open: boolean;
  dossier: Dossier;
  onClose: () => void;
}

/**
 * Pièce jointe préparée pour l'envoi : référence vers un document
 * Mylaw ou une pièce déjà importée, plus l'option de conversion PDF.
 *
 * Quand `asPdf` est vrai pour un document Mylaw, le contenu sera
 * exporté en PDF (via le pipeline `exportPdf`) au moment de l'envoi.
 * Pour une pièce déjà importée, on conserve le binaire d'origine ; la
 * conversion PDF d'un binaire arbitraire dépasse le cadre de l'envoi
 * (Word, Excel… ne se convertissent pas en PDF côté navigateur).
 */
interface MailAttachment {
  key: string;
  kind: 'doc' | 'attachment';
  id: number;
  title: string;
  asPdf: boolean;
}

/** Rôles correspondant aux confrères auxquels on doit envoyer en
 *  contradictoire — confrère adverse + propre avocat collaborateur. */
const COUNSEL_ROLES: DossierRole[] = ['adversaryCounsel', 'ownCounsel'];

export function MailComposeDialog({ open, dossier, onClose }: Props) {
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  // Le contradictoire ne concerne que la copie (Cc) — l'avocat ne le
  // pose ni sur les destinataires directs, ni sur les copies cachées.
  // Cocher la case déclenche l'ajout automatique des adresses des
  // confrères en Cc et un bandeau d'avertissement bien visible.
  const [contradictoire, setContradictoire] = useState(false);
  // La copie informelle (Cci) est masquée par défaut pour gagner de
  // la place. Un libellé cliquable la déploie.
  const [bccVisible, setBccVisible] = useState(false);
  const [attachments, setAttachments] = useState<MailAttachment[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [importTarget, setImportTarget] = useState<'to' | 'cc' | 'bcc' | null>(null);
  const [sending, setSending] = useState(false);

  // Suivi des adresses injectées automatiquement par le toggle
  // « Contradictoire » : on les enregistre lors de l'ajout pour pouvoir
  // les retirer fidèlement quand l'avocat décoche, sans toucher aux
  // adresses qu'il aurait tapées à la main (ou qui auraient été
  // ajoutées via l'import depuis les intervenants).
  const autoInjectedRef = useRef<Set<string>>(new Set());

  // Réinitialise les champs à chaque ouverture pour ne pas reposter
  // un brouillon de la session précédente sans le savoir.
  useEffect(() => {
    if (!open) return;
    setTo('');
    setCc('');
    setBcc('');
    setSubject('');
    setBody('');
    setContradictoire(false);
    setBccVisible(false);
    setAttachments([]);
    setPickerOpen(false);
    setImportTarget(null);
    setSending(false);
    autoInjectedRef.current = new Set();
  }, [open]);

  // Charge les intervenants du dossier — sert (1) à l'import de
  // destinataires, (2) à l'auto-ajout des confrères en Cc quand le
  // contradictoire est activé.
  const dossierContacts = useLiveQuery(
    async () => (open ? getDossierContactsWithRole(dossier.id!) : []),
    [open, dossier.id],
  );

  const counselEmails = useMemo(() => {
    if (!dossierContacts) return [] as string[];
    const emails: string[] = [];
    for (const dc of dossierContacts) {
      if (!COUNSEL_ROLES.includes(dc.dossierContact.role)) continue;
      const e = dc.contact.email?.trim();
      if (e) emails.push(e);
    }
    return Array.from(new Set(emails));
  }, [dossierContacts]);

  // Synchronisation Cc ↔ contradictoire :
  //   - À l'activation, on injecte les adresses des confrères en Cc
  //     et on mémorise dans `autoInjectedRef` les adresses
  //     effectivement ajoutées (celles qui n'y étaient pas déjà).
  //   - Au décochage, on retire ces mêmes adresses de Cc — sans
  //     toucher aux adresses tapées à la main ni à celles importées
  //     manuellement depuis les intervenants. Critique pour la
  //     sécurité : un envoi avec des confrères oubliés en copie
  //     serait une faute professionnelle.
  useEffect(() => {
    if (contradictoire) {
      if (counselEmails.length === 0) return;
      setCc((prev) => {
        const before = parseEmails(prev);
        const beforeKeys = new Set(before.map((e) => e.toLowerCase()));
        const merged = mergeEmails(prev, counselEmails);
        for (const email of counselEmails) {
          if (!beforeKeys.has(email.toLowerCase())) {
            autoInjectedRef.current.add(email.toLowerCase());
          }
        }
        return merged;
      });
    } else {
      if (autoInjectedRef.current.size === 0) return;
      const toRemove = autoInjectedRef.current;
      setCc((prev) => removeEmails(prev, toRemove));
      autoInjectedRef.current = new Set();
    }
  }, [contradictoire, counselEmails]);

  if (!open) return null;

  function handleAttach(picked: MailAttachment[]) {
    setAttachments((prev) => {
      const existing = new Set(prev.map((a) => a.key));
      const merged = [...prev];
      for (const item of picked) {
        if (!existing.has(item.key)) merged.push(item);
      }
      return merged;
    });
    setPickerOpen(false);
  }

  function removeAttachment(key: string) {
    setAttachments((prev) => prev.filter((a) => a.key !== key));
  }

  function togglePdf(key: string) {
    setAttachments((prev) =>
      prev.map((a) => (a.key === key ? { ...a, asPdf: !a.asPdf } : a)),
    );
  }

  /**
   * Ouvre le client mail système avec la commande `mailto:` (sujet,
   * corps, destinataires). Les pièces jointes ne peuvent pas voyager
   * via `mailto:` ; on les télécharge donc localement pour que
   * l'utilisateur les rattache manuellement dans son client mail.
   */
  async function handleSend() {
    setSending(true);
    try {
      // 1) Téléchargement local des pièces — chaque blob est offert
      //    avec le nom logique attendu côté client mail.
      for (const a of attachments) {
        await downloadAttachment(a);
      }

      // 2) Composition du `mailto:`. Les destinataires sont nettoyés
      //    et concaténés ; l'objet et le corps sont URL-encodés.
      const url = buildMailtoUrl({
        to,
        cc,
        bcc,
        subject,
        body: contradictoire
          ? `[CONTRADICTOIRE]\n\n${body}`
          : body,
      });
      window.location.href = url;
      onClose();
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl w-[760px] max-w-[95vw] max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)]">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Mail className="w-4 h-4 text-[var(--color-primary)]" />
            Nouveau courriel
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--color-surface-raised)]"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Bandeau Contradictoire — visible dès qu'au moins une
            section est marquée contradictoire. Couleur ambre vif pour
            empêcher tout envoi accidentel sans que la mention ne
            saute aux yeux. */}
        {contradictoire && (
          <div className="flex items-start gap-2 px-5 py-2.5 border-b border-amber-300 bg-amber-50 text-amber-900">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div className="text-xs leading-snug">
              <strong>Envoi en contradictoire</strong> — les adresses
              des confrères du dossier ont été ajoutées en copie (Cc).
              Vérifiez la liste avant l'envoi.
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <RecipientField
            label="Destinataires"
            sublabel="À"
            value={to}
            onChange={setTo}
            onImport={() => setImportTarget('to')}
          />
          <RecipientField
            label="Copie"
            sublabel="Cc"
            value={cc}
            onChange={setCc}
            contradictoire={contradictoire}
            onContradictoireChange={setContradictoire}
            onImport={() => setImportTarget('cc')}
          />

          {/* Cci masquée par défaut — un libellé cliquable la déploie
              pour gagner de la verticalité dans le dialogue. */}
          {bccVisible ? (
            <RecipientField
              label="Copie informelle"
              sublabel="Cci"
              value={bcc}
              onChange={setBcc}
              onImport={() => setImportTarget('bcc')}
            />
          ) : (
            <button
              type="button"
              onClick={() => setBccVisible(true)}
              className="text-xs text-[var(--color-primary)] hover:underline"
            >
              Cci
            </button>
          )}

          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">
              Objet
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={`${dossier.reference} — ${dossier.name}`}
              className="w-full px-3 py-2 text-sm rounded-md bg-[var(--color-surface-raised)] border border-[var(--color-border)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
          </div>

          {/* Pièces jointes — placées entre Objet et Message comme
              dans la plupart des clients mail (Outlook, Gmail), ce
              qui colle à l'attendu de l'avocat qui pense « j'ajoute
              les pièces avant d'écrire le corps ». */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-[var(--color-text-muted)] flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5" />
                Pièces jointes
                {attachments.length > 0 && (
                  <span className="text-[var(--color-text-faint)]">
                    ({attachments.length})
                  </span>
                )}
              </label>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-[var(--color-surface-raised)] border border-[var(--color-border)] hover:bg-[var(--color-border)]"
              >
                <Plus className="w-3 h-3" /> Ajouter
              </button>
            </div>

            {attachments.length === 0 ? (
              <div className="text-xs text-[var(--color-text-faint)] italic px-3 py-2 rounded-md border border-dashed border-[var(--color-border)]">
                Aucune pièce jointe. Cliquez sur « Ajouter » pour
                sélectionner des documents du dossier.
              </div>
            ) : (
              <ul className="divide-y divide-[var(--color-border)] border border-[var(--color-border)] rounded-md">
                {attachments.map((a) => (
                  <li
                    key={a.key}
                    className="flex items-center gap-2 px-3 py-2 text-sm"
                  >
                    <FileText className="w-4 h-4 text-[var(--color-text-muted)] flex-shrink-0" />
                    <span className="flex-1 truncate">{a.title}</span>
                    <label
                      className={cn(
                        'flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded cursor-pointer select-none',
                        a.asPdf
                          ? 'bg-red-50 text-red-700 border border-red-200'
                          : 'bg-[var(--color-surface-raised)] text-[var(--color-text-muted)] border border-[var(--color-border)]',
                        a.kind === 'attachment' &&
                          'opacity-50 cursor-not-allowed',
                      )}
                      title={
                        a.kind === 'attachment'
                          ? "La conversion PDF n'est appliquée qu'aux documents Mylaw."
                          : 'Convertir le document en PDF avant envoi'
                      }
                    >
                      <input
                        type="checkbox"
                        checked={a.asPdf}
                        disabled={a.kind === 'attachment'}
                        onChange={() => togglePdf(a.key)}
                        className="w-3 h-3 accent-red-600"
                      />
                      PDF
                    </label>
                    <button
                      type="button"
                      onClick={() => removeAttachment(a.key)}
                      className="p-1 rounded hover:bg-[var(--color-surface-raised)]"
                      aria-label="Retirer la pièce"
                    >
                      <X className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">
              Message
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className="w-full px-3 py-2 text-sm rounded-md bg-[var(--color-surface-raised)] border border-[var(--color-border)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] resize-none"
              placeholder="Rédigez votre message…"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-[var(--color-border)]">
          <span className="text-[11px] text-[var(--color-text-faint)]">
            Les pièces jointes sont téléchargées localement, à
            rattacher dans le client mail.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm rounded-md bg-[var(--color-surface-raised)] hover:bg-[var(--color-border)]"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !to.trim()}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md text-white',
                'bg-[var(--color-primary)] hover:opacity-90',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              <Mail className="w-3.5 h-3.5" />
              {sending ? 'Envoi…' : 'Envoyer'}
            </button>
          </div>
        </div>
      </div>

      {/* Sub-dialog : sélection de pièces depuis le dossier */}
      {pickerOpen && (
        <AttachmentPickerDialog
          dossierId={dossier.id!}
          alreadyPickedKeys={new Set(attachments.map((a) => a.key))}
          onConfirm={handleAttach}
          onCancel={() => setPickerOpen(false)}
        />
      )}

      {/* Sub-dialog : import de destinataires depuis les contacts du
          dossier — alimente le champ correspondant. */}
      {importTarget && (
        <ContactPickerDialog
          dossierId={dossier.id!}
          onPick={(emails) => {
            const next = mergeEmails(
              importTarget === 'to' ? to : importTarget === 'cc' ? cc : bcc,
              emails,
            );
            if (importTarget === 'to') setTo(next);
            else if (importTarget === 'cc') setCc(next);
            else setBcc(next);
            setImportTarget(null);
          }}
          onCancel={() => setImportTarget(null)}
        />
      )}
    </div>
  );
}

// ─── Sous-composants ──────────────────────────────────────────────────────────

function RecipientField({
  label,
  sublabel,
  value,
  onChange,
  contradictoire,
  onContradictoireChange,
  onImport,
}: {
  label: string;
  sublabel: string;
  value: string;
  onChange: (v: string) => void;
  /** Optionnel : seulement la section Cc porte le toggle Contradictoire. */
  contradictoire?: boolean;
  onContradictoireChange?: (v: boolean) => void;
  onImport: () => void;
}) {
  const showContradictoire =
    contradictoire !== undefined && !!onContradictoireChange;
  return (
    <div
      className={cn(
        'rounded-md border px-3 py-2 transition-colors',
        contradictoire
          ? 'border-amber-300 bg-amber-50/40'
          : 'border-[var(--color-border)] bg-[var(--color-surface-raised)]',
      )}
    >
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-medium text-[var(--color-text-muted)]">
          {label}{' '}
          <span className="text-[var(--color-text-faint)] font-normal">
            ({sublabel})
          </span>
        </label>
        <div className="flex items-center gap-3">
          {showContradictoire && (
            <label
              className={cn(
                'flex items-center gap-1 text-[11px] cursor-pointer select-none',
                contradictoire
                  ? 'text-amber-800 font-semibold'
                  : 'text-[var(--color-text-muted)]',
              )}
            >
              <input
                type="checkbox"
                checked={contradictoire}
                onChange={(e) => onContradictoireChange!(e.target.checked)}
                className="w-3 h-3 accent-amber-600"
              />
              Contradictoire
            </label>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="adresse@exemple.com, autre@exemple.com"
          className="flex-1 px-2 py-1.5 text-sm rounded bg-[var(--color-surface)] border border-[var(--color-border)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
        />
        <button
          type="button"
          onClick={onImport}
          title="Importer depuis les intervenants du dossier"
          aria-label="Importer depuis les intervenants du dossier"
          className="flex items-center justify-center h-8 w-8 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-primary)] hover:bg-[var(--color-surface-raised)] flex-shrink-0"
        >
          <UserPlus className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

// ─── Picker pièces jointes ────────────────────────────────────────────────────

function AttachmentPickerDialog({
  dossierId,
  alreadyPickedKeys,
  onConfirm,
  onCancel,
}: {
  dossierId: number;
  alreadyPickedKeys: Set<string>;
  onConfirm: (picked: MailAttachment[]) => void;
  onCancel: () => void;
}) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const docs = useLiveQuery<MylawDocument[]>(
    () => db.documents.where('dossierId').equals(dossierId).toArray(),
    [dossierId],
  );
  const attachments = useLiveQuery<Attachment[]>(
    () => db.attachments.where('dossierId').equals(dossierId).toArray(),
    [dossierId],
  );

  type Item = {
    key: string;
    kind: 'doc' | 'attachment';
    id: number;
    title: string;
  };
  const items: Item[] = useMemo(() => {
    const list: Item[] = [];
    for (const d of docs ?? []) {
      if (d.id == null) continue;
      list.push({
        key: `doc-${d.id}`,
        kind: 'doc',
        id: d.id,
        title: d.title || 'Sans titre',
      });
    }
    for (const a of attachments ?? []) {
      if (a.id == null) continue;
      list.push({
        key: `att-${a.id}`,
        kind: 'attachment',
        id: a.id,
        title: a.name,
      });
    }
    return list;
  }, [docs, attachments]);

  const filtered = items.filter((it) =>
    it.title.toLowerCase().includes(search.toLowerCase()),
  );

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleConfirm() {
    const picked: MailAttachment[] = [];
    for (const it of items) {
      if (!selected.has(it.key)) continue;
      picked.push({
        key: it.key,
        kind: it.kind,
        id: it.id,
        title: it.title,
        asPdf: false,
      });
    }
    onConfirm(picked);
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl w-[560px] max-w-[90vw] max-h-[80vh] flex flex-col">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-[var(--color-border)]">
          <button
            onClick={onCancel}
            className="p-1 rounded hover:bg-[var(--color-surface-raised)]"
            aria-label="Retour au courriel"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h3 className="text-sm font-semibold flex-1">
            Sélectionner des pièces jointes
          </h3>
          <span className="text-xs text-[var(--color-text-muted)]">
            {selected.size} sélectionnée{selected.size > 1 ? 's' : ''}
          </span>
        </div>
        <div className="px-4 py-3 border-b border-[var(--color-border)]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher dans les documents du dossier…"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-md bg-[var(--color-surface-raised)] border border-[var(--color-border)]"
            />
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {filtered.length === 0 ? (
            <div className="text-sm text-center py-8 text-[var(--color-text-muted)]">
              Aucun document.
            </div>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {filtered.map((it) => {
                const already = alreadyPickedKeys.has(it.key);
                const checked = selected.has(it.key);
                return (
                  <li key={it.key}>
                    <label
                      className={cn(
                        'flex items-center gap-3 px-4 py-2 text-sm cursor-pointer',
                        already
                          ? 'opacity-50 cursor-not-allowed'
                          : 'hover:bg-[var(--color-surface-raised)]',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked || already}
                        disabled={already}
                        onChange={() => toggle(it.key)}
                        className="w-4 h-4 accent-[var(--color-primary)]"
                      />
                      <FileText className="w-4 h-4 text-[var(--color-text-muted)] flex-shrink-0" />
                      <span className="flex-1 truncate">{it.title}</span>
                      {already && (
                        <span className="text-[10px] text-[var(--color-text-faint)] uppercase tracking-wider">
                          Déjà ajouté
                        </span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-[var(--color-border)]">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded-md bg-[var(--color-surface-raised)] hover:bg-[var(--color-border)]"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={selected.size === 0}
            className="px-3 py-1.5 text-sm font-medium rounded-md bg-[var(--color-primary)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Ajouter ({selected.size})
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Picker contacts (import destinataires) ───────────────────────────────────

function ContactPickerDialog({
  dossierId,
  onPick,
  onCancel,
}: {
  dossierId: number;
  onPick: (emails: string[]) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const dossierContacts = useLiveQuery(
    () => getDossierContactsWithRole(dossierId),
    [dossierId],
  );

  const items = useMemo(() => {
    return (dossierContacts ?? [])
      .map((dc) => ({ contact: dc.contact, role: dc.dossierContact.role }))
      .filter((it) => !!it.contact.email);
  }, [dossierContacts]);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleConfirm() {
    const emails = items
      .filter((it) => it.contact.id != null && selected.has(it.contact.id))
      .map((it) => it.contact.email!.trim())
      .filter(Boolean);
    onPick(Array.from(new Set(emails)));
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl w-[480px] max-w-[90vw] max-h-[80vh] flex flex-col">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-[var(--color-border)]">
          <h3 className="text-sm font-semibold flex-1">
            Importer des destinataires
          </h3>
          <span className="text-xs text-[var(--color-text-muted)]">
            {selected.size} sélectionné{selected.size > 1 ? 's' : ''}
          </span>
          <button
            onClick={onCancel}
            className="p-1 rounded hover:bg-[var(--color-surface-raised)]"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          {items.length === 0 ? (
            <div className="text-sm text-center py-8 text-[var(--color-text-muted)]">
              Aucun intervenant du dossier ne porte d'adresse email.
            </div>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {items.map((it) => (
                <li key={it.contact.id}>
                  <label className="flex items-center gap-3 px-4 py-2 text-sm cursor-pointer hover:bg-[var(--color-surface-raised)]">
                    <input
                      type="checkbox"
                      checked={selected.has(it.contact.id!)}
                      onChange={() => toggle(it.contact.id!)}
                      className="w-4 h-4 accent-[var(--color-primary)]"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium">
                        {contactDisplayName(it.contact)}
                      </div>
                      <div className="truncate text-xs text-[var(--color-text-muted)]">
                        {it.contact.email}
                        {' · '}
                        {ROLE_LABELS[it.role] ?? it.role}
                      </div>
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-[var(--color-border)]">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded-md bg-[var(--color-surface-raised)] hover:bg-[var(--color-border)]"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={selected.size === 0}
            className="px-3 py-1.5 text-sm font-medium rounded-md bg-[var(--color-primary)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Ajouter ({selected.size})
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROLE_LABELS: Partial<Record<DossierRole, string>> = {
  client: 'Client',
  adversary: 'Partie adverse',
  adversaryCounsel: 'Confrère adverse',
  ownCounsel: 'Avocat du cabinet',
  collaborator: 'Collaborateur',
  trainee: 'Stagiaire',
  assistant: 'Assistant',
  expert: 'Expert',
  bailiff: 'Huissier',
  judge: 'Juge',
  court: 'Juridiction',
  witness: 'Témoin',
  other: 'Autre',
};

function contactDisplayName(c: Contact): string {
  if (c.companyName) return c.companyName;
  const parts = [c.firstName, c.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : c.email ?? 'Sans nom';
}

/** Découpe un champ libre en liste d'adresses nettoyées. */
function parseEmails(raw: string): string[] {
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Concatène les adresses email d'un champ libre avec celles passées en
 * paramètre, en évitant les doublons (insensible à la casse).
 */
function mergeEmails(existing: string, additions: string[]): string {
  const current = parseEmails(existing);
  const seen = new Set(current.map((s) => s.toLowerCase()));
  const next = [...current];
  for (const a of additions) {
    const trimmed = a.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(trimmed);
  }
  return next.join(', ');
}

/**
 * Retire d'un champ libre les adresses dont la version en minuscules
 * figure dans `toRemove`. Préserve la casse et l'ordre des adresses
 * restantes (celles que l'utilisateur a tapées ou importées).
 */
function removeEmails(existing: string, toRemove: Set<string>): string {
  if (toRemove.size === 0) return existing;
  return parseEmails(existing)
    .filter((e) => !toRemove.has(e.toLowerCase()))
    .join(', ');
}

function buildMailtoUrl(opts: {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
}): string {
  const params: string[] = [];
  const cc = cleanList(opts.cc);
  const bcc = cleanList(opts.bcc);
  if (cc) params.push(`cc=${encodeURIComponent(cc)}`);
  if (bcc) params.push(`bcc=${encodeURIComponent(bcc)}`);
  if (opts.subject) params.push(`subject=${encodeURIComponent(opts.subject)}`);
  if (opts.body) params.push(`body=${encodeURIComponent(opts.body)}`);
  const to = cleanList(opts.to);
  return `mailto:${encodeURIComponent(to)}${params.length ? `?${params.join('&')}` : ''}`;
}

function cleanList(raw: string): string {
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(',');
}

/**
 * Télécharge une pièce jointe localement. Pour les documents Mylaw
 * marqués `asPdf`, on déclenche une impression vers PDF (le navigateur
 * propose la boîte de dialogue d'enregistrement). Pour les autres, on
 * exporte un .docx ou on ré-télécharge le binaire d'origine.
 */
async function downloadAttachment(a: MailAttachment): Promise<void> {
  if (a.kind === 'doc') {
    const doc = await db.documents.get(a.id);
    if (!doc) return;
    if (a.asPdf) {
      // Conversion via le pipeline `exportPdf` existant — ouvre une
      // fenêtre d'impression où l'utilisateur choisit « Enregistrer
      // au format PDF ». C'est interactif : si plusieurs PDF doivent
      // être convertis, l'utilisateur les enchaîne.
      const { exportPdf } = await import('@/lib/export');
      await exportPdf(doc.title || 'document', doc.content);
      return;
    }
    const blob = await buildDocxBlob(doc.content);
    triggerDownload(blob, sanitizeFilename(doc.title || 'document') + '.docx');
    return;
  }

  // Pièce déjà importée : on re-télécharge le binaire d'origine.
  const att = await db.attachments.get(a.id);
  if (!att) return;
  triggerDownload(att.blob, att.name);
}

function triggerDownload(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
}
