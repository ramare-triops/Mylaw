// lib/field-defs.ts
/**
 * Registre des catégories de champs + seed initial + helpers d'accès DB.
 *
 * - `FIELD_CATEGORIES` : catégories « système » (identité, coordonnées,
 *   société, dates, montants, conditionnels, autres). La liste est figée
 *   (les libellés peuvent évoluer mais les id restent stables).
 * - `SEED_FIELD_DEFS` : définitions par défaut insérées au premier
 *   démarrage de l'utilisateur. Reprend l'équivalent des anciens
 *   `PRESET_GROUPS` (TemplateFieldsPanel) et des
 *   `DEFAULT_CONDITIONAL_TAGS` (brick-variables).
 * - `seedFieldDefsIfNeeded` : insère les seeds si la table est vide et
 *   qu'aucun seed n'a encore été lancé. Gardé par un flag en settings.
 */

import { db, getSetting, setSetting } from './db';
import type { FieldDef, FieldDefType } from '@/types/field-def';

export interface FieldCategoryDef {
  id: string;
  label: string;
  color: string;
}

export const FIELD_CATEGORIES: FieldCategoryDef[] = [
  { id: 'identity',    label: 'Identité',      color: '#01696f' },
  { id: 'coords',      label: 'Coordonnées',   color: '#c2410c' },
  { id: 'company',     label: 'Société',       color: '#7c3aed' },
  { id: 'dates',       label: 'Dates',         color: '#4f46e5' },
  { id: 'amounts',     label: 'Montants',      color: '#15803d' },
  { id: 'legal',       label: 'Contentieux',   color: '#be185d' },
  { id: 'conditional', label: 'Conditionnels', color: '#6d28d9' },
  { id: 'custom',      label: 'Autres',        color: '#6b7280' },
];

export function findCategory(id: string): FieldCategoryDef {
  return FIELD_CATEGORIES.find((c) => c.id === id) ?? FIELD_CATEGORIES[FIELD_CATEGORIES.length - 1];
}

/* ─── Slugification pour le champ `name` ────────────────────────────────── */

export function slugifyFieldName(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase() || 'champ';
}

/* ─── Seed initial ──────────────────────────────────────────────────────── */

type Seed = Omit<FieldDef, 'id' | 'createdAt' | 'updatedAt'>;

const now = () => new Date();

const IDENTITY: Seed[] = [
  { label: 'Nom',                name: 'Nom',                type: 'name',    color: '#01696f', category: 'identity', placeholder: 'Ex : Dupont',                isSeed: true, contactPath: 'lastName' },
  { label: 'Prénom',             name: 'Prénom',             type: 'name',    color: '#01696f', category: 'identity', placeholder: 'Ex : Jean',                  isSeed: true, contactPath: 'firstName' },
  { label: 'Nom complet',        name: 'Nom complet',        type: 'name',    color: '#01696f', category: 'identity', placeholder: 'Ex : Jean Dupont',           isSeed: true, contactPath: 'fullName' },
  { label: 'Civilité',           name: 'Civilité',           type: 'text',    color: '#01696f', category: 'identity', placeholder: 'M. / Mme',                   isSeed: true, contactPath: 'civility' },
  { label: 'Qualité',            name: 'Qualité',            type: 'text',    color: '#01696f', category: 'identity', placeholder: 'Ex : Directeur général',     isSeed: true, contactPath: 'representativeRole' },
  { label: 'Date de naissance',  name: 'Date de naissance',  type: 'date',    color: '#4f46e5', category: 'identity', placeholder: 'Ex : 01/01/1980',            isSeed: true, contactPath: 'birthDate' },
  { label: 'Lieu de naissance',  name: 'Lieu de naissance',  type: 'address', color: '#c2410c', category: 'identity', placeholder: 'Ex : Paris',                 isSeed: true, contactPath: 'birthPlace' },
  { label: 'Nationalité',        name: 'Nationalité',        type: 'text',    color: '#01696f', category: 'identity', placeholder: 'Ex : française',             isSeed: true, contactPath: 'nationality' },
  { label: 'Profession',         name: 'Profession',         type: 'text',    color: '#01696f', category: 'identity', placeholder: 'Ex : cadre',                 isSeed: true, contactPath: 'profession' },
];

const COORDS: Seed[] = [
  { label: 'Adresse',     name: 'Adresse',     type: 'address', color: '#c2410c', category: 'coords', placeholder: 'Ex : 12 rue de la Paix',      isSeed: true, contactPath: 'addressComposed' },
  { label: 'Code postal', name: 'Code postal', type: 'text',    color: '#c2410c', category: 'coords', placeholder: 'Ex : 75001',                  isSeed: true, contactPath: 'addressPostalCode' },
  { label: 'Ville',       name: 'Ville',       type: 'address', color: '#c2410c', category: 'coords', placeholder: 'Ex : Paris',                  isSeed: true, contactPath: 'addressCity' },
  { label: 'Pays',        name: 'Pays',        type: 'address', color: '#c2410c', category: 'coords', placeholder: 'Ex : France',                 isSeed: true, contactPath: 'addressCountry' },
  { label: 'Téléphone',   name: 'Téléphone',   type: 'phone',   color: '#c2410c', category: 'coords', placeholder: 'Ex : 06 12 34 56 78',         isSeed: true, contactPath: 'phone' },
  { label: 'Email',       name: 'Email',       type: 'email',   color: '#c2410c', category: 'coords', placeholder: 'Ex : jean@exemple.fr',        isSeed: true, contactPath: 'email' },
];

const COMPANY: Seed[] = [
  { label: 'Nom de la société', name: 'Nom de la société', type: 'name',      color: '#7c3aed', category: 'company', placeholder: 'Ex : Acme SAS',                 isSeed: true, contactPath: 'companyName' },
  { label: 'Forme juridique',   name: 'Forme juridique',   type: 'text',      color: '#7c3aed', category: 'company', placeholder: 'Ex : SAS / SARL / SCI',         isSeed: true, contactPath: 'legalForm' },
  { label: 'Capital social',    name: 'Capital social',    type: 'price',     color: '#15803d', category: 'company', placeholder: 'Ex : 10 000',                   isSeed: true, contactPath: 'capital' },
  { label: 'Numéro RCS',        name: 'Numéro RCS',        type: 'reference', color: '#be185d', category: 'company', placeholder: 'Ex : 123 456 789',              isSeed: true, contactPath: 'rcs' },
  { label: 'Ville RCS',         name: 'Ville RCS',         type: 'address',   color: '#c2410c', category: 'company', placeholder: 'Ex : Paris',                    isSeed: true, contactPath: 'rcsCity' },
  { label: 'Adresse du siège',  name: 'Adresse du siège',  type: 'address',   color: '#c2410c', category: 'company', placeholder: '',                              isSeed: true, contactPath: 'addressComposed' },
  { label: 'Représentant légal',name: 'Représentant légal',type: 'name',      color: '#7c3aed', category: 'company', placeholder: '',                              isSeed: true, contactPath: 'representative' },
];

const LEGAL: Seed[] = [
  { label: "Nom de l'avocat",   name: "Nom de l'avocat",   type: 'name',      color: '#be185d', category: 'legal', placeholder: 'Ex : Maître Martin',     isSeed: true },
  { label: 'Ville du barreau',  name: 'Ville du barreau',  type: 'address',   color: '#be185d', category: 'legal', placeholder: 'Ex : Paris',             isSeed: true },
  { label: 'Adresse du cabinet',name: 'Adresse du cabinet',type: 'address',   color: '#be185d', category: 'legal', placeholder: '',                        isSeed: true },
  { label: 'Tribunal',          name: 'Tribunal',          type: 'text',      color: '#be185d', category: 'legal', placeholder: 'Ex : TJ de Paris',       isSeed: true },
  { label: 'N° de dossier',     name: 'N° de dossier',     type: 'reference', color: '#be185d', category: 'legal', placeholder: 'Ex : 2024-00123',        isSeed: true },
];

const DATES: Seed[] = [
  { label: 'Date',           name: 'Date',           type: 'date', color: '#4f46e5', category: 'dates', placeholder: 'Ex : 01/01/2025', isSeed: true },
  { label: 'Lieu',           name: 'Lieu',           type: 'address', color: '#c2410c', category: 'dates', placeholder: 'Ex : Paris',     isSeed: true },
  { label: 'Date de signature', name: 'Date de signature', type: 'date', color: '#4f46e5', category: 'dates', placeholder: '', isSeed: true },
];

const AMOUNTS: Seed[] = [
  { label: 'Montant', name: 'Montant', type: 'price',    color: '#15803d', category: 'amounts', placeholder: 'Ex : 1 000',   isSeed: true },
  { label: 'Durée',   name: 'Durée',   type: 'duration', color: '#7c3aed', category: 'amounts', placeholder: 'Ex : 15 jours', isSeed: true },
  { label: 'Nombre',  name: 'Nombre',  type: 'number',   color: '#15803d', category: 'amounts', placeholder: 'Ex : 2',        isSeed: true },
];

const CONDITIONALS: Seed[] = [
  { label: 'M / Mme',            name: 'M/Mme',            type: 'conditional', color: '#6d28d9', category: 'conditional', conditionalA: 'M',        conditionalB: 'Mme',        isSeed: true },
  { label: 'né / née',           name: 'né/née',           type: 'conditional', color: '#6d28d9', category: 'conditional', conditionalA: 'né',       conditionalB: 'née',        isSeed: true },
  { label: 'inscrit / inscrite', name: 'inscrit/inscrite', type: 'conditional', color: '#6d28d9', category: 'conditional', conditionalA: 'inscrit',  conditionalB: 'inscrite',   isSeed: true },
  { label: 'le / la',            name: 'le/la',            type: 'conditional', color: '#6d28d9', category: 'conditional', conditionalA: 'le',       conditionalB: 'la',         isSeed: true },
  { label: 'du / de la',         name: 'du/de la',         type: 'conditional', color: '#6d28d9', category: 'conditional', conditionalA: 'du',       conditionalB: 'de la',      isSeed: true },
];

export const SEED_FIELD_DEFS: Seed[] = [
  ...IDENTITY,
  ...COORDS,
  ...COMPANY,
  ...LEGAL,
  ...DATES,
  ...AMOUNTS,
  ...CONDITIONALS,
];

/* ─── Seed : insère les défauts à la première ouverture ─────────────────── */

/**
 * Insère les `FieldDef` par défaut si la table est vide (ou si seuls des
 * champs non-seed user-created existent), et pose le flag
 * `fielddefs_seeded_v1` en `db.settings` pour ne plus jamais ré-insérer. Les
 * champs manquants par leur nom sont ajoutés, pas les doublons — les
 * modifications utilisateur sont respectées.
 *
 * Cas particulier self-healing : si la table est totalement vide alors que
 * le drapeau est posé (perte de données — scramble de sync passé, clear
 * accidentel…), on re-seed quand même. Une table partiellement peuplée
 * est laissée telle quelle : l'utilisateur peut avoir supprimé
 * volontairement certains seeds et on respecte ce choix.
 */
export async function seedFieldDefsIfNeeded(): Promise<void> {
  try {
    const existing = (await db.fieldDefs.toArray()) as FieldDef[];
    const done = await getSetting<boolean>('fielddefs_seeded_v1', false);

    // Migration `contactPath` : les seeds posés avant l'introduction de
    // `FieldDef.contactPath` n'en ont pas. On back-fill depuis le seed
    // courant (match par `name`) — pour les seed records uniquement, pour
    // ne pas toucher aux champs user-created.
    await backfillContactPathOnSeeds(existing);

    if (done && existing.length > 0) return;
    const existingNames = new Set(existing.map((f) => f.name));
    const toInsert = SEED_FIELD_DEFS
      .filter((s) => !existingNames.has(s.name))
      .map((s) => ({ ...s, createdAt: now(), updatedAt: now() } as FieldDef));
    if (toInsert.length > 0) await db.fieldDefs.bulkAdd(toInsert);
  } catch {
    /* best-effort */
  }
  await setSetting('fielddefs_seeded_v1', true);
}

/**
 * Back-fille `contactPath` sur les enregistrements seed déjà présents en
 * base. Idempotent : ne touche que les seeds qui n'ont pas encore de
 * `contactPath` et dont le nom correspond à une entrée du seed courant
 * portant ce chemin.
 */
async function backfillContactPathOnSeeds(existing: FieldDef[]): Promise<void> {
  const seedByName = new Map(SEED_FIELD_DEFS.map((s) => [s.name, s]));
  const updates: FieldDef[] = [];
  for (const f of existing) {
    if (!f.isSeed) continue;
    if (f.contactPath !== undefined) continue;
    const seed = seedByName.get(f.name);
    if (!seed?.contactPath) continue;
    updates.push({ ...f, contactPath: seed.contactPath, updatedAt: now() });
  }
  if (updates.length > 0) await db.fieldDefs.bulkPut(updates);
}

/* ─── CRUD helpers ──────────────────────────────────────────────────────── */

export async function createFieldDef(partial: Omit<FieldDef, 'id' | 'createdAt' | 'updatedAt'>): Promise<number> {
  const n = now();
  const id = await db.fieldDefs.add({ ...partial, createdAt: n, updatedAt: n } as FieldDef);
  return Number(id);
}

export async function updateFieldDef(id: number, patch: Partial<FieldDef>): Promise<void> {
  const existing = await db.fieldDefs.get(id);
  if (!existing) return;
  await db.fieldDefs.put({ ...existing, ...patch, id, updatedAt: now() } as FieldDef);
}

export async function deleteFieldDef(id: number): Promise<void> {
  await db.fieldDefs.delete(id);
}

/* ─── Mapping type → icône (lucide) — utilisé par l'UI ──────────────────── */

export const FIELD_TYPE_LABELS: Record<FieldDefType, string> = {
  text:        'Texte libre',
  name:        'Nom propre',
  date:        'Date',
  number:      'Nombre',
  price:       'Prix / montant',
  duration:    'Durée',
  address:     'Adresse',
  email:       'E-mail',
  phone:       'Téléphone',
  reference:   'Référence',
  url:         'URL',
  conditional: 'Conditionnel (2 options)',
};
