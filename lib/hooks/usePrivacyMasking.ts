'use client';

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { usePrivacy } from '@/components/providers/PrivacyProvider';
import {
  buildMaskingEntries,
  maskDossierName,
  maskClientName,
  maskHtml,
  maskText,
  type MaskingEntry,
} from '@/lib/privacy';

/**
 * Hook réactif fournissant les helpers de masquage liés au mode
 * confidentialité.
 *
 * Tous les helpers sont des no-op tant que `privacyMode` est faux —
 * le composant peut donc les appeler sans condition. Quand le mode
 * est actif, les chaînes / fragments HTML reçus sont masqués selon
 * les règles définies dans `lib/privacy.ts`.
 */
export function usePrivacyMasking(dossierId?: number | null) {
  const { privacyMode } = usePrivacy();

  // Charge les intervenants + leurs contacts pour ce dossier (live).
  // Ces chargements ne s'exécutent que si on a un dossierId — sinon
  // ils retournent des tableaux vides et `entries` reste vide.
  const dossierContacts = useLiveQuery(
    async () => {
      if (!dossierId) return [];
      return db.dossierContacts.where('dossierId').equals(dossierId).toArray();
    },
    [dossierId],
  );

  const contacts = useLiveQuery(
    async () => {
      if (!dossierContacts || dossierContacts.length === 0) return [];
      const list = await db.contacts.bulkGet(
        dossierContacts.map((dc) => dc.contactId),
      );
      return list.filter(Boolean) as NonNullable<(typeof list)[number]>[];
    },
    [dossierContacts],
  );

  const fieldDefs = useLiveQuery(() => db.fieldDefs.toArray(), []);

  const entries: MaskingEntry[] = useMemo(() => {
    if (!privacyMode) return [];
    if (!contacts || contacts.length === 0) return [];
    return buildMaskingEntries(contacts, fieldDefs ?? []);
  }, [privacyMode, contacts, fieldDefs]);

  return useMemo(
    () => ({
      privacyMode,
      maskName: (name: string | null | undefined) =>
        privacyMode ? maskDossierName(name) : (name ?? ''),
      maskClient: (name: string | null | undefined) =>
        privacyMode ? maskClientName(name) : (name ?? ''),
      maskHtml: (html: string) =>
        privacyMode ? maskHtml(html, entries) : html,
      maskText: (text: string) =>
        privacyMode ? maskText(text, entries) : text,
      entries,
    }),
    [privacyMode, entries],
  );
}
