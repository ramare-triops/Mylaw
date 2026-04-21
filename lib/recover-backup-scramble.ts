// lib/recover-backup-scramble.ts
/**
 * Récupération one-shot du décalage de tables provoqué par un bug de
 * `buildBackup` dans `drive-merge.ts` (commits `8f723ef..cfb5d48`).
 *
 * Le bug : `db.table('fieldDefs').toArray()` avait été inséré dans le
 * `Promise.all` mais **sans** que la variable correspondante soit ajoutée
 * dans le destructuring. Résultat : toutes les variables à partir de
 * `sessions` recevaient les données de la table suivante. Le backup
 * remontait alors sur Drive avec des tables croisées ; chaque merge
 * entrant propageait la bête dans la DB locale :
 *
 *   sessions table        ← contenait fieldDefs records
 *   dossiers table        ← contenait sessions records
 *   contacts table        ← contenait dossiers records    (!)
 *   dossierContacts       ← contenait contacts records    (!)
 *   documentContacts      ← contenait dossierContacts
 *   timeEntries           ← contenait documentContacts
 *   expenses              ← contenait timeEntries
 *   fixedFees             ← contenait expenses
 *   invoices              ← contenait fixedFees
 *   documentLinks         ← contenait invoices
 *   documentVersions      ← contenait documentLinks
 *
 * `recoverFromFieldDefsScramble()` détecte l'anomalie (heuristique sur la
 * forme des objets de chaque table) et, si elle est présente, déplace
 * tout le monde à sa place en une transaction. Idempotent : la seconde
 * exécution ne détecte plus rien à faire et retourne `notScrambled`.
 *
 * Exposé aussi sur `window.mylaw_recover()` en dev, pour pouvoir être
 * déclenché à la main depuis la console du navigateur.
 */

import { db } from './db';

type RecoverResult =
  | { kind: 'notScrambled' }
  | { kind: 'scrambled'; counts: Record<string, number> }
  | { kind: 'error'; message: string };

/**
 * Heuristique : la table `dossiers` est censée contenir des objets avec
 * `reference`, `name`, `type` et `status`. Si on y trouve plutôt des
 * objets avec `toolId` et `date` (forme d'une session), alors la DB est
 * décalée.
 */
async function isScrambled(): Promise<boolean> {
  const sample = await db.dossiers.limit(3).toArray();
  if (sample.length === 0) return false;
  const first = sample[0] as Record<string, unknown>;
  const looksLikeDossier = 'reference' in first && 'name' in first && 'type' in first;
  const looksLikeSession = 'toolId' in first || ('date' in first && !('reference' in first));
  return !looksLikeDossier && looksLikeSession;
}

export async function recoverFromFieldDefsScramble(): Promise<RecoverResult> {
  try {
    const scrambled = await isScrambled();
    if (!scrambled) return { kind: 'notScrambled' };

    // Snapshot de chaque table DANS SA POSITION ACTUELLE (décalée) avant
    // de réécrire. L'ordre reflète le décalage :
    //   `dossiers` tient la donnée « sessions »,
    //   `contacts` tient la donnée « dossiers », etc.
    const sessionsData          = await db.dossiers.toArray();         // actually sessions
    const dossiersData          = await db.contacts.toArray();         // actually dossiers
    const contactsData          = await db.dossierContacts.toArray();  // actually contacts
    const dossierContactsData   = await db.documentContacts.toArray(); // actually dossierContacts
    const documentContactsData  = await db.timeEntries.toArray();      // actually documentContacts
    const timeEntriesData       = await db.expenses.toArray();         // actually timeEntries
    const expensesData          = await db.fixedFees.toArray();        // actually expenses
    const fixedFeesData         = await db.invoices.toArray();         // actually fixedFees
    const invoicesData          = await db.documentLinks.toArray();    // actually invoices
    const documentLinksData     = await db.documentVersions.toArray(); // actually documentLinks
    // `documentVersions` originales ont été perdues par le bug (leur
    // slot est tombé hors du tableau destructuré). On ne peut rien en
    // tirer depuis la DB locale ; elles doivent se reconstruire à la
    // demande via l'historique des documents si nécessaire.

    await db.transaction(
      'rw',
      [
        db.sessions, db.dossiers, db.contacts, db.dossierContacts,
        db.documentContacts, db.timeEntries, db.expenses, db.fixedFees,
        db.invoices, db.documentLinks, db.documentVersions,
      ],
      async () => {
        // On vide toutes les tables concernées puis on réécrit chaque
        // jeu dans la bonne table. `bulkAdd` respecte l'id présent sur
        // chaque enregistrement (car la table a `++id`).
        await Promise.all([
          db.sessions.clear(),
          db.dossiers.clear(),
          db.contacts.clear(),
          db.dossierContacts.clear(),
          db.documentContacts.clear(),
          db.timeEntries.clear(),
          db.expenses.clear(),
          db.fixedFees.clear(),
          db.invoices.clear(),
          db.documentLinks.clear(),
          db.documentVersions.clear(),
        ]);

        if (sessionsData.length)         await db.sessions.bulkAdd(sessionsData as never);
        if (dossiersData.length)         await db.dossiers.bulkAdd(dossiersData as never);
        if (contactsData.length)         await db.contacts.bulkAdd(contactsData as never);
        if (dossierContactsData.length)  await db.dossierContacts.bulkAdd(dossierContactsData as never);
        if (documentContactsData.length) await db.documentContacts.bulkAdd(documentContactsData as never);
        if (timeEntriesData.length)      await db.timeEntries.bulkAdd(timeEntriesData as never);
        if (expensesData.length)         await db.expenses.bulkAdd(expensesData as never);
        if (fixedFeesData.length)        await db.fixedFees.bulkAdd(fixedFeesData as never);
        if (invoicesData.length)         await db.invoices.bulkAdd(invoicesData as never);
        if (documentLinksData.length)    await db.documentLinks.bulkAdd(documentLinksData as never);
      },
    );

    return {
      kind: 'scrambled',
      counts: {
        dossiers:         dossiersData.length,
        contacts:         contactsData.length,
        dossierContacts:  dossierContactsData.length,
        documentContacts: documentContactsData.length,
        timeEntries:      timeEntriesData.length,
        expenses:         expensesData.length,
        fixedFees:        fixedFeesData.length,
        invoices:         invoicesData.length,
        documentLinks:    documentLinksData.length,
      },
    };
  } catch (e) {
    return { kind: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

// Expose en dev sur la console : `window.mylaw_recover()`.
if (typeof window !== 'undefined') {
  (window as unknown as { mylaw_recover?: typeof recoverFromFieldDefsScramble }).mylaw_recover =
    recoverFromFieldDefsScramble;
}
