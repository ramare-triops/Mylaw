// types/field-def.ts
/**
 * Définition d'un champ réutilisable — partagée entre tous les modèles.
 *
 * Un `FieldDef` décrit un type de variable insérable depuis l'onglet
 * « Champs » de la boîte à outils. Il porte son identifiant-slug, son
 * libellé humain, son type fonctionnel (qui conditionne l'icône, la
 * couleur par défaut et la validation à la saisie) et sa catégorie
 * (regroupement dans le panneau). Les champs de type `conditional`
 * portent deux options (ex : « M » / « Mme »).
 *
 * Les `FieldDef` vivent dans `db.fieldDefs`. Ils sont seedés à partir de
 * la liste intégrée (PRESET_GROUPS + DEFAULT_CONDITIONAL_TAGS) au premier
 * démarrage puis modifiables par l'utilisateur via `FieldsEditorModal`.
 */

export type FieldDefType =
  | 'text'          // texte libre
  | 'name'          // nom propre (Title Case)
  | 'date'          // date
  | 'number'        // nombre entier ou décimal
  | 'price'         // prix / montant
  | 'duration'      // durée (ex : « 15 jours »)
  | 'address'       // adresse postale
  | 'email'         // adresse e-mail
  | 'phone'         // numéro de téléphone
  | 'reference'     // référence (SIRET, RCS, n° dossier…)
  | 'url'           // URL
  | 'conditional';  // choix binaire résolu depuis un contact (ex : M/Mme)

/**
 * Mapping déterministe d'un `FieldDef` vers une propriété d'un `Contact`.
 *
 * Quand une variable de brique ou de modèle porte ce chemin, le résolveur
 * (voir `lib/contact-variables.ts::contactVariableValue`) évite la
 * correspondance floue et va droit à la valeur — indispensable pour
 * l'auto-remplissage fiable des blocs d'identification à partir des
 * intervenants d'un dossier.
 *
 * `'fullName'` et `'addressComposed'` sont des valeurs dérivées (non
 * stockées brutes sur `Contact`) qui s'agrègent à la résolution.
 */
export type ContactFieldPath =
  | 'civility'
  | 'firstName'
  | 'lastName'
  | 'fullName'
  | 'birthDate'
  | 'birthPlace'
  | 'nationality'
  | 'profession'
  | 'companyName'
  | 'legalForm'
  | 'capital'
  | 'siret'
  | 'rcs'
  | 'rcsCity'
  | 'representative'
  | 'representativeRole'
  | 'email'
  | 'phone'
  | 'address'
  | 'addressComposed'
  | 'addressNumber'
  | 'addressStreet'
  | 'addressComplement'
  | 'addressPostalCode'
  | 'addressCity'
  | 'addressCountry';

export interface FieldDef {
  id?: number;
  /** Libellé humain affiché dans la chip et dans la variable. */
  label: string;
  /** Identifiant-slug utilisé comme nom de variable `[name]`. */
  name: string;
  type: FieldDefType;
  /** Couleur du chip (hex). */
  color: string;
  /** Id de catégorie (voir `FIELD_CATEGORIES` dans lib/field-defs.ts). */
  category: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  /** Pour type === 'conditional' : les deux options séparées (« M », « Mme »). */
  conditionalA?: string;
  conditionalB?: string;
  /**
   * Binding déterministe vers une propriété d'un `Contact`. Quand le champ
   * est utilisé dans une brique d'identification attachée à un rôle du
   * dossier, la valeur est tirée directement du contact correspondant sans
   * passer par la correspondance floue.
   */
  contactPath?: ContactFieldPath;
  /** Seed immuable : empêche l'utilisateur de supprimer un champ fourni par défaut. */
  isSeed?: boolean;
  createdAt: Date;
  updatedAt: Date;
}
