// components/templates/TemplateLibrary.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  FileText, Scale, Mail, Users, Gavel, FileSignature,
  Search, Plus, Pencil, Copy, Trash2, MoreVertical, Tag,
  CalendarDays, Eye,
} from 'lucide-react'
import { TemplateEditorView } from './TemplateEditorView'
import type { TemplateField } from './TemplateFieldsPanel'
import { db, getSetting, setSetting } from '@/lib/db'

export interface Template {
  id: string
  name: string
  category: string
  description: string
  icon: string
  content: string
  fields: TemplateField[]
  createdAt: string
  updatedAt: string
  isCustom?: boolean
  /**
   * Catégorie documentaire (Courrier, Acte, Pièce, Conclusions…) appliquée
   * automatiquement lors de la création d'un document à partir de ce modèle.
   * Indépendante de `category` qui classe le modèle lui-même (Contentieux,
   * Cabinet, Correspondance) pour la bibliothèque.
   */
  documentCategory?: string
}

// ─── Modèles par défaut ───────────────────────────────────────────────────────
const DEFAULT_TEMPLATES: Template[] = [
  {
    id: 'tpl-1',
    name: 'Mise en demeure',
    category: 'Contentieux',
    description: 'Lettre de mise en demeure formelle',
    icon: 'gavel',
    content: '<p><strong>[Lieu]</strong>, le <strong>[Date]</strong></p><p>Maître <strong>[Nom de l\'avocat]</strong><br>[Adresse du cabinet]</p><p>À <strong>[Nom du destinataire]</strong><br>[Adresse]</p><h2>Mise en demeure</h2><p>Monsieur / Madame,</p><p>Par la présente, et en ma qualité d\'avocat de <strong>[Nom du client]</strong>, je me vois dans l\'obligation de vous mettre en demeure de <strong>[objet de la mise en demeure]</strong>.</p><p>En effet, <strong>[exposé des faits]</strong>.</p><p>En conséquence, je vous demande de <strong>[demande précise]</strong> dans un délai de <strong>[X jours]</strong> à compter de la réception de la présente.</p><p>À défaut, mon client se verra contraint d\'engager toute procédure judiciaire qu\'il estimera utile à la défense de ses intérêts.</p><p>Veuillez agréer, Monsieur / Madame, l\'expression de mes salutations distinguées.</p><p>Maître <strong>[Nom]</strong></p>',
    fields: [
      { id: 'f1', name: 'lieu', label: 'Lieu', type: 'address', defaultValue: '', required: true, placeholder: 'Ex : Paris' },
      { id: 'f2', name: 'date', label: 'Date', type: 'date', defaultValue: '', required: true, placeholder: 'Ex : 16 avril 2026' },
      { id: 'f3', name: 'nom_avocat', label: "Nom de l'avocat", type: 'name', defaultValue: '', required: true, placeholder: 'Votre nom' },
      { id: 'f4', name: 'adresse_cabinet', label: 'Adresse du cabinet', type: 'address', defaultValue: '', required: true, placeholder: '' },
      { id: 'f5', name: 'nom_destinataire', label: 'Nom du destinataire', type: 'name', defaultValue: '', required: true, placeholder: '' },
      { id: 'f6', name: 'nom_client', label: 'Nom du client', type: 'name', defaultValue: '', required: true, placeholder: '' },
      { id: 'f7', name: 'objet', label: 'Objet de la mise en demeure', type: 'text', defaultValue: '', required: true, placeholder: '' },
      { id: 'f8', name: 'expose_faits', label: 'Exposé des faits', type: 'text', defaultValue: '', required: true, placeholder: '' },
      { id: 'f9', name: 'demande_precise', label: 'Demande précise', type: 'text', defaultValue: '', required: true, placeholder: '' },
      { id: 'f10', name: 'x_jours', label: 'Délai (jours)', type: 'duration', defaultValue: '15', required: true, placeholder: 'Ex : 15' },
    ],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    isCustom: false,
    documentCategory: 'Courrier',
  },
  {
    id: 'tpl-2',
    name: "Convention d'honoraires",
    category: 'Cabinet',
    description: "Modèle de convention d'honoraires",
    icon: 'file-signature',
    content: '<h1>CONVENTION D\'HONORAIRES</h1><p>Entre les soussignés :</p><p>Maître <strong>[Nom avocat]</strong>, avocat au Barreau de <strong>[Ville barreau]</strong>, dont le cabinet est situé <strong>[Adresse cabinet]</strong>,<br>ci-après dénommé « l\'Avocat »,</p><p>Et :</p><p><strong>[Nom client]</strong>, <strong>[qualité client]</strong>, domicilié(e) <strong>[Adresse client]</strong>,<br>ci-après dénommé(e) « le Client »,</p><p>Il est convenu ce qui suit :</p><h3>Article 1 - Objet de la mission</h3><p>Le Client confie à l\'Avocat la mission de <strong>[description mission]</strong>.</p><h3>Article 2 - Honoraires</h3><p>Les honoraires sont fixés à <strong>[montant HT]</strong> euros HT, soit <strong>[montant TTC]</strong> euros TTC.</p><h3>Article 3 - Modalités de règlement</h3><p>Les honoraires seront réglés selon les modalités suivantes : <strong>[modalités paiement]</strong>.</p><p>Fait en deux exemplaires originaux,<br>Le <strong>[date signature]</strong></p><p>Signature du Client :&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Signature de l\'Avocat :</p>',
    fields: [
      { id: 'f1', name: 'nom_avocat', label: "Nom de l'avocat", type: 'name', defaultValue: '', required: true, placeholder: '' },
      { id: 'f2', name: 'ville_barreau', label: 'Ville du barreau', type: 'address', defaultValue: '', required: true, placeholder: 'Ex : Paris' },
      { id: 'f3', name: 'adresse_cabinet', label: 'Adresse du cabinet', type: 'address', defaultValue: '', required: false, placeholder: '' },
      { id: 'f4', name: 'nom_client', label: 'Nom du client', type: 'name', defaultValue: '', required: true, placeholder: '' },
      { id: 'f5', name: 'qualite_client', label: 'Qualité du client', type: 'text', defaultValue: '', required: false, placeholder: 'Ex : particulier, société…' },
      { id: 'f6', name: 'adresse_client', label: 'Adresse du client', type: 'address', defaultValue: '', required: true, placeholder: '' },
      { id: 'f7', name: 'description_mission', label: 'Description de la mission', type: 'text', defaultValue: '', required: true, placeholder: '' },
      { id: 'f8', name: 'montant_ht', label: 'Montant HT', type: 'price', defaultValue: '', required: true, placeholder: 'Ex : 1 500' },
      { id: 'f9', name: 'montant_ttc', label: 'Montant TTC', type: 'price', defaultValue: '', required: true, placeholder: 'Ex : 1 800' },
      { id: 'f10', name: 'modalites_paiement', label: 'Modalités de paiement', type: 'text', defaultValue: '', required: true, placeholder: '' },
      { id: 'f11', name: 'date_signature', label: 'Date de signature', type: 'date', defaultValue: '', required: true, placeholder: '' },
    ],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    isCustom: false,
    documentCategory: 'Contrat',
  },
  {
    id: 'tpl-3',
    name: 'Assignation en référé',
    category: 'Contentieux',
    description: "Acte d'assignation devant le juge des référés",
    icon: 'scale',
    content: '<h1>ASSIGNATION EN RÉFÉRÉ</h1><p>L\'AN <strong>[année]</strong><br>LE <strong>[date acte]</strong></p><p>À LA REQUÊTE DE :<br><strong>[nom demandeur]</strong>, demeurant <strong>[adresse demandeur]</strong>,<br>ayant pour avocat Maître <strong>[nom avocat]</strong>, avocat au Barreau de <strong>[ville barreau]</strong>, <strong>[adresse cabinet]</strong>.</p><p>DONNÉ ASSIGNATION À :<br><strong>[nom défendeur]</strong>, demeurant <strong>[adresse défendeur]</strong>,</p><p>D\'AVOIR À COMPARAÎTRE devant le Président du Tribunal judiciaire de <strong>[ville tribunal]</strong>, statuant en référé,</p><p>LE <strong>[date audience]</strong> À <strong>[heure audience]</strong>,</p><p>POUR :<br><strong>[exposé demande]</strong></p><p>SOUS TOUTES RÉSERVES</p>',
    fields: [
      { id: 'f1', name: 'annee', label: 'Année', type: 'date', defaultValue: '', required: true, placeholder: '' },
      { id: 'f2', name: 'date_acte', label: "Date de l'acte", type: 'date', defaultValue: '', required: true, placeholder: '' },
      { id: 'f3', name: 'nom_demandeur', label: 'Nom du demandeur', type: 'name', defaultValue: '', required: true, placeholder: '' },
      { id: 'f4', name: 'adresse_demandeur', label: 'Adresse du demandeur', type: 'address', defaultValue: '', required: true, placeholder: '' },
      { id: 'f5', name: 'nom_avocat', label: "Nom de l'avocat", type: 'name', defaultValue: '', required: true, placeholder: '' },
      { id: 'f6', name: 'nom_defendeur', label: 'Nom du défendeur', type: 'name', defaultValue: '', required: true, placeholder: '' },
      { id: 'f7', name: 'adresse_defendeur', label: 'Adresse du défendeur', type: 'address', defaultValue: '', required: true, placeholder: '' },
      { id: 'f8', name: 'ville_tribunal', label: 'Ville du tribunal', type: 'address', defaultValue: '', required: true, placeholder: '' },
      { id: 'f9', name: 'date_audience', label: "Date d'audience", type: 'date', defaultValue: '', required: true, placeholder: '' },
      { id: 'f10', name: 'heure_audience', label: "Heure d'audience", type: 'text', defaultValue: '', required: true, placeholder: 'Ex : 9h00' },
      { id: 'f11', name: 'expose_demande', label: 'Exposé de la demande', type: 'text', defaultValue: '', required: true, placeholder: '' },
    ],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    isCustom: false,
    documentCategory: 'Acte',
  },
  {
    id: 'tpl-4',
    name: 'Courrier - accusé de réception',
    category: 'Correspondance',
    description: 'Accusé de réception de dossier client',
    icon: 'mail',
    content: '<p><strong>[lieu]</strong>, le <strong>[date]</strong></p><p>Objet : Accusé de réception — Dossier <strong>[référence dossier]</strong></p><p>Monsieur / Madame,</p><p>Nous avons bien reçu les documents que vous nous avez transmis concernant votre affaire, et nous vous en remercions.</p><p>Nous avons enregistré votre dossier sous la référence <strong>[référence dossier]</strong>.</p><p>Nous allons procéder à l\'étude de votre situation et reviendrons vers vous dans les meilleurs délais afin de vous communiquer notre analyse ainsi que les suites à donner.</p><p>Reste à votre disposition pour tout renseignement complémentaire.</p><p>Veuillez agréer, Monsieur / Madame, l\'expression de mes salutations distinguées.</p><p>Maître <strong>[nom avocat]</strong></p>',
    fields: [
      { id: 'f1', name: 'lieu', label: 'Lieu', type: 'address', defaultValue: '', required: true, placeholder: '' },
      { id: 'f2', name: 'date', label: 'Date', type: 'date', defaultValue: '', required: true, placeholder: '' },
      { id: 'f3', name: 'reference_dossier', label: 'Référence du dossier', type: 'reference', defaultValue: '', required: true, placeholder: 'Ex : 2026-042' },
      { id: 'f4', name: 'nom_avocat', label: "Nom de l'avocat", type: 'name', defaultValue: '', required: true, placeholder: '' },
    ],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    isCustom: false,
    documentCategory: 'Courrier',
  },
  {
    id: 'tpl-5',
    name: 'Conclusions en réponse',
    category: 'Contentieux',
    description: 'Trame de conclusions en réponse',
    icon: 'file-text',
    content: '<p style="text-align:center"><strong>TRIBUNAL JUDICIAIRE DE [ville tribunal]</strong></p><h1 style="text-align:center">CONCLUSIONS EN RÉPONSE</h1><p><strong>Pour :</strong> [nom client], [qualité client]<br><strong>Contre :</strong> [nom adverse], [qualité adverse]</p><p><strong>RÉFÉRENCE :</strong> [numéro RG]<br><strong>AUDIENCE DU :</strong> [date audience]</p><h2>PLAISE AU TRIBUNAL</h2><h3>I. RAPPEL DES FAITS</h3><p>[exposé factuel]</p><h3>II. DISCUSSION</h3><h4>A. Sur [premier moyen]</h4><p>[argumentation premier moyen]</p><h4>B. Sur [deuxième moyen]</h4><p>[argumentation deuxième moyen]</p><h3>III. DEMANDES</h3><p>Vu [textes applicables],</p><p>Il est demandé au Tribunal de bien vouloir :</p><ul><li>[demande principale]</li><li>[demande subsidiaire]</li><li>Condamner [nom adverse] aux entiers dépens.</li></ul><p>Sous toutes réserves.</p>',
    fields: [
      { id: 'f1', name: 'ville_tribunal', label: 'Ville du tribunal', type: 'address', defaultValue: '', required: true, placeholder: '' },
      { id: 'f2', name: 'nom_client', label: 'Nom du client', type: 'name', defaultValue: '', required: true, placeholder: '' },
      { id: 'f3', name: 'qualite_client', label: 'Qualité du client', type: 'text', defaultValue: '', required: false, placeholder: '' },
      { id: 'f4', name: 'nom_adverse', label: 'Nom de la partie adverse', type: 'name', defaultValue: '', required: true, placeholder: '' },
      { id: 'f5', name: 'numero_rg', label: 'Numéro RG', type: 'reference', defaultValue: '', required: true, placeholder: '' },
      { id: 'f6', name: 'date_audience', label: "Date d'audience", type: 'date', defaultValue: '', required: true, placeholder: '' },
    ],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    isCustom: false,
    documentCategory: 'Conclusions',
  },
  {
    id: 'tpl-6',
    name: 'Procuration',
    category: 'Cabinet',
    description: 'Mandat / procuration générale',
    icon: 'users',
    content: '<h1 style="text-align:center">PROCURATION</h1><p>Je soussigné(e), <strong>[nom complet mandant]</strong>, né(e) le <strong>[date naissance]</strong> à <strong>[lieu naissance]</strong>, demeurant <strong>[adresse mandant]</strong>,</p><p>donne par la présente procuration à :</p><p>Maître <strong>[nom avocat]</strong>, avocat au Barreau de <strong>[ville barreau]</strong>, dont le cabinet est situé <strong>[adresse cabinet]</strong>,</p><p>pouvoir général de me représenter, agir et signer en mon nom dans le cadre de <strong>[description mission]</strong>, et notamment :</p><ul><li>[pouvoir 1]</li><li>[pouvoir 2]</li><li>[pouvoir 3]</li></ul><p>Fait à <strong>[lieu signature]</strong>, le <strong>[date signature]</strong></p><p>Signature :</p>',
    fields: [
      { id: 'f1', name: 'nom_complet_mandant', label: 'Nom complet du mandant', type: 'name', defaultValue: '', required: true, placeholder: '' },
      { id: 'f2', name: 'date_naissance', label: 'Date de naissance', type: 'date', defaultValue: '', required: true, placeholder: '' },
      { id: 'f3', name: 'lieu_naissance', label: 'Lieu de naissance', type: 'address', defaultValue: '', required: true, placeholder: '' },
      { id: 'f4', name: 'adresse_mandant', label: 'Adresse du mandant', type: 'address', defaultValue: '', required: true, placeholder: '' },
      { id: 'f5', name: 'nom_avocat', label: "Nom de l'avocat", type: 'name', defaultValue: '', required: true, placeholder: '' },
      { id: 'f6', name: 'description_mission', label: 'Description de la mission', type: 'text', defaultValue: '', required: true, placeholder: '' },
      { id: 'f7', name: 'lieu_signature', label: 'Lieu de signature', type: 'address', defaultValue: '', required: true, placeholder: '' },
      { id: 'f8', name: 'date_signature', label: 'Date de signature', type: 'date', defaultValue: '', required: true, placeholder: '' },
    ],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    isCustom: false,
    documentCategory: 'Acte',
  },
]

// ─── Persistance Dexie (avec migration depuis localStorage) ───────────────────
// Les modèles custom et les défauts sont stockés dans db.templates.
// L'ID Dexie (numérique auto-incrémenté) est converti en string pour l'UI.
// Au premier chargement, si localStorage contient d'anciennes données
// (clé mylaw_templates_v1), on les migre vers Dexie puis on purge.

const LS_KEY = 'mylaw_templates_v1'

/**
 * Migration one-shot : déplace les modèles depuis localStorage vers Dexie,
 * puis efface la clé localStorage. Idempotent via le flag
 * `templates_migrated_v1` dans db.settings.
 */
async function migrateLocalStorageIfNeeded(): Promise<void> {
  const done = await getSetting<boolean>('templates_migrated_v1', false)
  if (done) return
  if (typeof window === 'undefined') { await setSetting('templates_migrated_v1', true); return }
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Template[]
      if (Array.isArray(parsed) && parsed.length > 0) {
        for (const tpl of parsed) {
          const { id: _ignored, ...rest } = tpl
          await db.table('templates').add(rest as unknown as Record<string, unknown>)
        }
      }
      localStorage.removeItem(LS_KEY)
    }
  } catch { /* migration best-effort */ }
  await setSetting('templates_migrated_v1', true)
}

/**
 * Seed des modèles par défaut dans Dexie (une seule fois). On s'assure qu'ils
 * ne sont pas ré-insérés si l'utilisateur les a déjà supprimés intentionnellement.
 */
async function seedDefaultsIfNeeded(): Promise<void> {
  const seeded = await getSetting<boolean>('templates_seeded_v1', false)
  if (seeded) return
  const count = await db.table('templates').count()
  if (count === 0) {
    for (const tpl of DEFAULT_TEMPLATES) {
      const { id: _ignored, ...rest } = tpl
      await db.table('templates').add(rest as unknown as Record<string, unknown>)
    }
  }
  await setSetting('templates_seeded_v1', true)
}

async function loadTemplatesFromDexie(): Promise<Template[]> {
  const rows = await db.table('templates').toArray() as Array<Record<string, unknown> & { id: number }>
  return rows.map((r) => ({
    ...(r as unknown as Template),
    id: String(r.id),
  }))
}

/** Sauvegarde un modèle (UI → Dexie). Accepte un id string, convertit en numérique. */
async function putTemplateToDexie(tpl: Template): Promise<number> {
  const { id, ...rest } = tpl
  const numericId = Number(id)
  if (Number.isFinite(numericId) && numericId > 0) {
    await db.table('templates').put({ id: numericId, ...rest } as unknown as Record<string, unknown>)
    return numericId
  }
  // Nouveau modèle : Dexie auto-assigne l'id
  return Number(await db.table('templates').add(rest as unknown as Record<string, unknown>))
}

async function deleteTemplateFromDexie(id: string): Promise<void> {
  const numericId = Number(id)
  // Garde stricte : un id valide est un entier > 0. Les valeurs falsy
  // (0, NaN, '') doivent être ignorées sinon Dexie peut interpréter
  // un appel `.delete(undefined)` / `.delete(0)` de manière inattendue.
  if (!Number.isInteger(numericId) || numericId <= 0) return
  await db.table('templates').where(':id').equals(numericId).delete()
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function contentToPreviewHtml(content: string): string {
  if (!content) return '<em style="color:#9ca3af">Modèle vide</em>'
  const trimmed = content.trim()
  if (trimmed.startsWith('{"type":"doc"')) {
    try {
      const doc = JSON.parse(trimmed)
      return tiptapJsonToHtml(doc)
    } catch {
      return '<em style="color:#9ca3af">Contenu non lisible</em>'
    }
  }
  return trimmed
}

function tiptapJsonToHtml(node: Record<string, unknown>): string {
  const type = node.type as string
  const content = (node.content as Record<string, unknown>[] | undefined) ?? []
  const attrs = (node.attrs as Record<string, unknown>) ?? {}
  const children = content.map(tiptapJsonToHtml).join('')

  function applyMarks(text: string, marks: Record<string, unknown>[]): string {
    return marks.reduce((acc, mark) => {
      const mt = mark.type as string
      if (mt === 'bold')      return `<strong>${acc}</strong>`
      if (mt === 'italic')    return `<em>${acc}</em>`
      if (mt === 'underline') return `<u>${acc}</u>`
      if (mt === 'strike')    return `<s>${acc}</s>`
      if (mt === 'code')      return `<code>${acc}</code>`
      if (mt === 'link') {
        const href = (mark.attrs as Record<string,string>)?.href ?? '#'
        return `<a href="${href}">${acc}</a>`
      }
      if (mt === 'highlight') {
        const color = (mark.attrs as Record<string,string>)?.color ?? '#fef08a'
        return `<mark style="background:${color}">${acc}</mark>`
      }
      if (mt === 'textStyle') {
        const style: string[] = []
        const ta = (mark.attrs as Record<string, string | undefined>)
        if (ta?.color) style.push(`color:${ta.color}`)
        if (ta?.fontSize) style.push(`font-size:${ta.fontSize}`)
        if (ta?.fontFamily) style.push(`font-family:${ta.fontFamily}`)
        return style.length ? `<span style="${style.join(';')}">${acc}</span>` : acc
      }
      return acc
    }, text)
  }

  switch (type) {
    case 'doc': return children
    case 'paragraph': {
      const align = attrs.textAlign as string | undefined
      const style = align && align !== 'left' ? ` style="text-align:${align}"` : ''
      return `<p${style}>${children || '&nbsp;'}</p>`
    }
    case 'heading': {
      const level = (attrs.level as number) ?? 1
      const align = attrs.textAlign as string | undefined
      const style = align && align !== 'left' ? ` style="text-align:${align}"` : ''
      return `<h${level}${style}>${children}</h${level}>`
    }
    case 'text': {
      const marks = (node.marks as Record<string, unknown>[]) ?? []
      const raw = (node.text as string ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      return applyMarks(raw, marks)
    }
    case 'hardBreak': return '<br>'
    case 'horizontalRule': return '<hr>'
    case 'bulletList': return `<ul>${children}</ul>`
    case 'orderedList': return `<ol>${children}</ol>`
    case 'listItem': return `<li>${children}</li>`
    case 'taskList': return `<ul style="list-style:none;padding-left:0">${children}</ul>`
    case 'taskItem': {
      const checked = attrs.checked ? 'checked' : ''
      return `<li style="display:flex;gap:6px"><input type="checkbox" ${checked} disabled /><span>${children}</span></li>`
    }
    case 'blockquote': return `<blockquote>${children}</blockquote>`
    case 'codeBlock': return `<pre><code>${children}</code></pre>`
    case 'code': return `<code>${children}</code>`
    case 'table': return `<table>${children}</table>`
    case 'tableRow': return `<tr>${children}</tr>`
    case 'tableCell': return `<td>${children}</td>`
    case 'tableHeader': return `<th>${children}</th>`
    case 'image': return `<img src="${attrs.src}" alt="${attrs.alt ?? ''}" style="max-width:100%">`
    case 'variableField': {
      const name = attrs.name as string ?? ''
      return `<span data-variable-field="" data-variable-name="${name}" data-preview-var="">${name}</span>`
    }
    default: return children
  }
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso))
  } catch { return iso }
}

// ─── Icônes ───────────────────────────────────────────────────────────────────
const ICON_MAP: Record<string, React.ElementType> = {
  'gavel': Gavel,
  'file-signature': FileSignature,
  'scale': Scale,
  'mail': Mail,
  'file-text': FileText,
  'users': Users,
}

function TemplateIcon({ icon, size = 14 }: { icon: string; size?: number }) {
  const Icon = ICON_MAP[icon] ?? FileText
  return <Icon size={size} />
}

const CATEGORY_COLORS: Record<string, string> = {
  Contentieux: '#dc2626',
  Cabinet: '#01696f',
  Correspondance: '#2563eb',
}

// ─── Panneau d'aperçu ─────────────────────────────────────────────────────────
function TemplatePreview({ template, onEdit }: { template: Template; onEdit: () => void }) {
  const catColor = CATEGORY_COLORS[template.category] ?? '#6b7280'
  const previewHtml = contentToPreviewHtml(template.content)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px 12px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
            <div style={{ width: '40px', height: '40px', flexShrink: 0, borderRadius: 'var(--radius-md)', background: `${catColor}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: catColor }}>
              <TemplateIcon icon={template.icon} size={18} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {template.name}
                </h2>
                {template.isCustom && (
                  <span style={{ fontSize: '9px', background: 'var(--color-primary-highlight)', color: 'var(--color-primary)', padding: '1px 6px', borderRadius: 'var(--radius-full)', fontWeight: 600, flexShrink: 0 }}>Perso</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 'var(--text-xs)', color: catColor, fontWeight: 600 }}>{template.category}</span>
                {template.description && (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{template.description}</span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onEdit}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 16px', flexShrink: 0, borderRadius: 'var(--radius-md)', background: 'var(--color-primary)', color: '#fff', fontSize: 'var(--text-sm)', fontWeight: 500, cursor: 'pointer' }}
          >
            <Pencil size={13} /> Modifier
          </button>
        </div>
        <div style={{ display: 'flex', gap: '16px', marginTop: '10px', flexWrap: 'wrap' }}>
          {template.fields.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              <Tag size={11} style={{ color: 'var(--color-primary)' }} />
              {template.fields.length} champ{template.fields.length !== 1 ? 's' : ''}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            <CalendarDays size={11} />
            Modifié le {formatDate(template.updatedAt)}
          </div>
          {template.fields.length > 0 && (
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '2px' }}>
              {template.fields.slice(0, 6).map((f) => (
                <span key={f.id} style={{ fontSize: '10px', padding: '1px 7px', borderRadius: '10px', background: 'var(--color-surface-offset)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', fontFamily: 'monospace' }}>
                  [{f.name}]
                </span>
              ))}
              {template.fields.length > 6 && (
                <span style={{ fontSize: '10px', color: 'var(--color-text-faint)' }}>+{template.fields.length - 6} autres</span>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', background: '#e8e8e8', padding: '24px' }}>
        <div style={{ width: '100%', maxWidth: '700px', margin: '0 auto', background: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)', padding: '32px 36px', minHeight: '400px' }}>
          <div className="tpl-preview-content" dangerouslySetInnerHTML={{ __html: previewHtml }} />
        </div>
      </div>

      <style jsx global>{`
        .tpl-preview-content { font-family: Georgia, serif; font-size: 12pt; line-height: 1.65; color: #28251d; }
        .tpl-preview-content h1 { font-size: 1.6em; font-weight: 700; margin: 0.8em 0 0.4em; }
        .tpl-preview-content h2 { font-size: 1.3em; font-weight: 700; margin: 0.8em 0 0.35em; }
        .tpl-preview-content h3 { font-size: 1.1em; font-weight: 600; margin: 0.7em 0 0.3em; }
        .tpl-preview-content h4 { font-size: 1em; font-weight: 600; margin: 0.6em 0 0.25em; }
        .tpl-preview-content p  { margin-bottom: 0.7em; }
        .tpl-preview-content ul, .tpl-preview-content ol { padding-left: 1.5em; margin-bottom: 0.7em; }
        .tpl-preview-content table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 0.9em; }
        .tpl-preview-content th, .tpl-preview-content td { border: 1px solid #d1d5db; padding: 0.4em 0.65em; }
        .tpl-preview-content th { background: #f9fafb; font-weight: 600; }
        .tpl-preview-content blockquote { border-left: 3px solid #01696f; padding: 0.4em 0 0.4em 1em; margin: 0.8em 0; color: #6b7280; font-style: italic; }
        .tpl-preview-content a { color: #01696f; text-decoration: underline; }
        .tpl-preview-content pre { background: #f8f8f8; border: 1px solid #e5e7eb; border-radius: 4px; padding: 0.75em 1em; font-size: 0.85em; overflow-x: auto; }
        .tpl-preview-content [data-preview-var] {
          display: inline-flex; align-items: center;
          font-size: 0.8em; font-weight: 600;
          padding: 0.05em 0.5em; border-radius: 4px;
          border: 1.5px solid #01696f;
          color: #01696f; background: rgba(1,105,111,0.08);
          vertical-align: baseline; line-height: 1.5; margin: 0 1px;
          font-family: 'Georgia', serif;
        }
      `}</style>
    </div>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────
export function TemplateLibrary() {
  const [templates, setTemplates]         = useState<Template[]>([])
  const [search, setSearch]               = useState('')
  const [selectedCategory, setSelectedCategory] = useState('Tous')
  const [editingTemplate, setEditingTemplate]   = useState<Template | null>(null)
  const [previewTemplate, setPreviewTemplate]   = useState<Template | null>(null)
  const [menuOpen, setMenuOpen]                 = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      await migrateLocalStorageIfNeeded()
      await seedDefaultsIfNeeded()
      const loaded = await loadTemplatesFromDexie()
      setTemplates(loaded)
      if (loaded.length > 0) setPreviewTemplate(loaded[0])
    })()
  }, [])

  /** Recharge depuis Dexie et met à jour l'état local (préserve la sélection). */
  const reload = useCallback(async () => {
    const loaded = await loadTemplatesFromDexie()
    setTemplates(loaded)
    return loaded
  }, [])

  const categories = ['Tous', ...Array.from(new Set(templates.map((t) => t.category)))]

  const filtered = templates.filter((t) => {
    const matchSearch =
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase())
    const matchCat = selectedCategory === 'Tous' || t.category === selectedCategory
    return matchSearch && matchCat
  })

  async function createNew() {
    const newTpl: Omit<Template, 'id'> = {
      name: 'Nouveau modèle',
      category: 'Cabinet',
      description: '',
      icon: 'file-text',
      content: '',
      fields: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isCustom: true,
    }
    const newId = Number(await db.table('templates').add(newTpl as unknown as Record<string, unknown>))
    const tpl: Template = { ...newTpl, id: String(newId) }
    await reload()
    setEditingTemplate(tpl)
  }

  function handleEdit(tpl: Template) {
    setEditingTemplate(tpl)
    setMenuOpen(null)
  }

  async function handleDuplicate(tpl: Template) {
    const { id: _ignored, ...rest } = tpl
    const copyBase = {
      ...rest,
      name: `${tpl.name} (copie)`,
      isCustom: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await db.table('templates').add(copyBase as unknown as Record<string, unknown>)
    await reload()
    setMenuOpen(null)
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Supprimer ce modèle ?')) return
    await deleteTemplateFromDexie(id)
    const next = await reload()
    if (previewTemplate?.id === id) setPreviewTemplate(next[0] ?? null)
    setMenuOpen(null)
  }

  async function handleSave(updated: Template) {
    const stamped: Template = { ...updated, updatedAt: new Date().toISOString() }
    await putTemplateToDexie(stamped)
    await reload()
    setEditingTemplate(stamped)
    setPreviewTemplate(stamped)
  }

  if (editingTemplate) {
    const current = templates.find((t) => t.id === editingTemplate.id) ?? editingTemplate
    return (
      <TemplateEditorView
        template={current}
        onSave={handleSave}
        onClose={() => setEditingTemplate(null)}
      />
    )
  }

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--color-bg)', fontFamily: 'var(--font-body, Inter, sans-serif)' }}>
      <div style={{ width: '300px', flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-text)' }}>Modèles</h1>
            <button onClick={createNew} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: 'var(--radius-md)', background: 'var(--color-primary)', color: '#fff', fontSize: 'var(--text-xs)', fontWeight: 500, cursor: 'pointer' }}>
              <Plus size={12} /> Nouveau
            </button>
          </div>
          <div style={{ position: 'relative', marginBottom: '8px' }}>
            <Search size={12} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            <input type="text" placeholder="Rechercher…" value={search} onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', paddingLeft: '26px', paddingRight: '8px', paddingTop: '5px', paddingBottom: '5px', fontSize: 'var(--text-xs)', background: 'var(--color-surface-offset)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', outline: 'none' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {categories.map((cat) => (
              <button key={cat} onClick={() => setSelectedCategory(cat)}
                style={{ fontSize: 'var(--text-xs)', padding: '2px 9px', borderRadius: 'var(--radius-full)', background: selectedCategory === cat ? 'var(--color-primary)' : 'var(--color-surface-offset)', color: selectedCategory === cat ? '#fff' : 'var(--color-text-muted)', fontWeight: selectedCategory === cat ? 600 : 400, cursor: 'pointer' }}
              >{cat}</button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {filtered.length === 0 && (
            <p style={{ padding: '24px 16px', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', textAlign: 'center' }}>Aucun modèle trouvé</p>
          )}
          {filtered.map((t) => (
            <TemplateListItem
              key={t.id}
              template={t}
              isSelected={previewTemplate?.id === t.id}
              isMenuOpen={menuOpen === t.id}
              onSelect={() => { setPreviewTemplate(t); setMenuOpen(null) }}
              onEdit={() => handleEdit(t)}
              onDuplicate={() => handleDuplicate(t)}
              onDelete={() => handleDelete(t.id)}
              onMenuToggle={() => setMenuOpen(menuOpen === t.id ? null : t.id)}
            />
          ))}
        </div>
        <div style={{ padding: '8px 14px', borderTop: '1px solid var(--color-border)', fontSize: 'var(--text-xs)', color: 'var(--color-text-faint)' }}>
          {templates.length} modèle{templates.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'hidden' }}>
        {previewTemplate ? (
          <TemplatePreview template={previewTemplate} onEdit={() => handleEdit(previewTemplate)} />
        ) : (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px' }}>
            <FileText size={48} style={{ opacity: 0.12 }} />
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>Sélectionnez un modèle</p>
            <button onClick={createNew} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 18px', borderRadius: 'var(--radius-md)', background: 'var(--color-primary)', color: '#fff', fontSize: 'var(--text-sm)', fontWeight: 500, cursor: 'pointer' }}>
              <Plus size={14} /> Créer un modèle
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Item de liste ────────────────────────────────────────────────────────────
function TemplateListItem({
  template, isSelected, isMenuOpen,
  onSelect, onEdit, onDuplicate, onDelete, onMenuToggle,
}: {
  template: Template
  isSelected: boolean
  isMenuOpen: boolean
  onSelect: () => void
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
  onMenuToggle: () => void
}) {
  const catColor = CATEGORY_COLORS[template.category] ?? '#6b7280'

  return (
    <div
      onClick={onSelect}
      style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '9px 12px', borderBottom: '1px solid var(--color-border)', background: isSelected ? 'var(--color-primary-highlight)' : 'transparent', borderLeft: isSelected ? '3px solid var(--color-primary)' : '3px solid transparent', cursor: 'pointer', transition: 'background 0.1s' }}
      onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'var(--color-surface-offset)' }}
      onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
    >
      <div style={{ width: '30px', height: '30px', borderRadius: 'var(--radius-sm)', background: `${catColor}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: catColor }}>
        <TemplateIcon icon={template.icon} size={14} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '1px' }}>
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: isSelected ? 600 : 500, color: isSelected ? 'var(--color-primary)' : 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {template.name}
          </span>
          {template.isCustom && (
            <span style={{ fontSize: '9px', background: 'var(--color-primary-highlight)', color: 'var(--color-primary)', padding: '0 5px', borderRadius: '10px', fontWeight: 600, flexShrink: 0 }}>Perso</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ fontSize: '10px', color: catColor, fontWeight: 500 }}>{template.category}</span>
          {template.fields.length > 0 && (
            <span style={{ fontSize: '10px', color: 'var(--color-text-faint)' }}>· {template.fields.length} champs</span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '3px', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
        <button onClick={onEdit} title="Modifier"
          style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '3px 7px', borderRadius: 'var(--radius-sm)', background: 'var(--color-primary)', color: '#fff', fontSize: '10px', fontWeight: 500, cursor: 'pointer' }}>
          <Pencil size={9} /> Modifier
        </button>
        <div style={{ position: 'relative' }}>
          <button onClick={onMenuToggle}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
            <MoreVertical size={11} />
          </button>
          {isMenuOpen && (
            <div style={{ position: 'absolute', right: 0, top: '100%', zIndex: 50, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)', padding: '4px', minWidth: '130px' }}>
              <button onClick={onDuplicate} style={menuItemStyle}><Copy size={11} /> Dupliquer</button>
              <button onClick={onDelete} style={{ ...menuItemStyle, color: 'var(--color-error)' }}><Trash2 size={11} /> Supprimer</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const menuItemStyle: React.CSSProperties = {
  width: '100%', display: 'flex', alignItems: 'center', gap: '7px',
  padding: '6px 10px', fontSize: 'var(--text-xs)', color: 'var(--color-text)',
  background: 'transparent', borderRadius: 'var(--radius-sm)',
  cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s',
}
