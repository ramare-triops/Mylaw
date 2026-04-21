/**
 * Variables et étiquettes partagées entre l'éditeur de briques et le
 * panneau Champs de l'éditeur de modèle.
 *
 * La source de vérité à l'exécution est `db.settings` :
 *   - `brick_text_vars`  → suggestions de variables texte  (TextVar[])
 *   - `brick_cond_vars`  → variables conditionnelles       (CondVar[])
 *
 * Les constantes ci-dessous ne servent qu'à (1) seeder ces deux clés à la
 * première ouverture et (2) offrir un fallback pour l'UI lorsque la DB
 * n'a pas encore été lue. Les deux consommateurs (BricksEditorModal et
 * FieldsTabContent) les importent pour rester alignés.
 */

export interface TextVar {
  id: string
  name: string
}

export interface CondVar {
  id: string
  label: string
  value: string
}

export const DEFAULT_SUGGESTED_TAGS: readonly string[] = [
  'Nom', 'Prénom', 'Date de naissance', 'Lieu de naissance', 'Nationalité', 'Adresse',
  'Nom de la société', 'Forme juridique', 'Capital social', 'Numéro RCS', 'Ville RCS',
  'Adresse du siège', 'Représentant légal', 'Qualité',
  "Nom de l'avocat", 'Ville du barreau', 'Adresse du cabinet',
  'Date', 'Lieu', 'Montant', 'Durée', 'Tribunal', 'Nombre',
]

export const DEFAULT_CONDITIONAL_TAGS: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'M / Mme',            value: 'M/Mme'            },
  { label: 'né / née',           value: 'né/née'           },
  { label: 'inscrit / inscrite', value: 'inscrit/inscrite' },
  { label: 'le / la',            value: 'le/la'            },
  { label: 'du / de la',         value: 'du/de la'         },
]
