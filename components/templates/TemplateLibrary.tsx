// components/templates/TemplateLibrary.tsx
// Bibliothèque de modèles avec CRUD complet + éditeur intégré
'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  FileText, Scale, Mail, Users, Gavel, FileSignature,
  Search, Plus, Pencil, Copy, Trash2, MoreVertical,
} from 'lucide-react'
import { TemplateEditorView } from './TemplateEditorView'
import type { TemplateField } from './TemplateFieldsPanel'

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
      { id: 'f3', name: 'nom_avocat', label: 'Nom de l\'avocat', type: 'name', defaultValue: '', required: true, placeholder: 'Votre nom' },
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
  },
  {
    id: 'tpl-2',
    name: "Convention d'honoraires",
    category: 'Cabinet',
    description: "Modèle de convention d'honoraires",
    icon: 'file-signature',
    content: '<h1>CONVENTION D\'HONORAIRES</h1><p>Entre les soussignés :</p><p>Maître <strong>[Nom avocat]</strong>, avocat au Barreau de <strong>[Ville barreau]</strong>, dont le cabinet est situé <strong>[Adresse cabinet]</strong>,<br>ci-après dénommé « l\'Avocat »,</p><p>Et :</p><p><strong>[Nom client]</strong>, <strong>[qualité client]</strong>, domicilié(e) <strong>[Adresse client]</strong>,<br>ci-après dénommé(e) « le Client »,</p><p>Il est convenu ce qui suit :</p><h3>Article 1 - Objet de la mission</h3><p>Le Client confie à l\'Avocat la mission de <strong>[description mission]</strong>.</p><h3>Article 2 - Honoraires</h3><p>Les honoraires sont fixés à <strong>[montant HT]</strong> euros HT, soit <strong>[montant TTC]</strong> euros TTC.</p><h3>Article 3 - Modalités de règlement</h3><p>Les honoraires seront réglés selon les modalités suivantes : <strong>[modalités paiement]</strong>.</p><p>Fait en deux exemplaires originaux,<br>Le <strong>[date signature]</strong></p><p>Signature du Client :&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Signature de l\'Avocat :</p>',
    fields: [
      { id: 'f1', name: 'nom_avocat', label: 'Nom de l\'avocat', type: 'name', defaultValue: '', required: true, placeholder: '' },
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
  },
  {
    id: 'tpl-3',
    name: 'Assignation en référé',
    category: 'Contentieux',
    description: 'Acte d\'assignation devant le juge des référés',
    icon: 'scale',
    content: '<h1>ASSIGNATION EN RÉFÉRÉ</h1><p>L\'AN <strong>[année]</strong><br>LE <strong>[date acte]</strong></p><p>À LA REQUÊTE DE :<br><strong>[nom demandeur]</strong>, demeurant <strong>[adresse demandeur]</strong>,<br>ayant pour avocat Maître <strong>[nom avocat]</strong>, avocat au Barreau de <strong>[ville barreau]</strong>, <strong>[adresse cabinet]</strong>.</p><p>DONNÉ ASSIGNATION À :<br><strong>[nom défendeur]</strong>, demeurant <strong>[adresse défendeur]</strong>,</p><p>D\'AVOIR À COMPARAÎTRE devant le Président du Tribunal judiciaire de <strong>[ville tribunal]</strong>, statuant en référé,</p><p>LE <strong>[date audience]</strong> À <strong>[heure audience]</strong>,</p><p>POUR :<br><strong>[exposé demande]</strong></p><p>SOUS TOUTES RÉSERVES</p>',
    fields: [
      { id: 'f1', name: 'annee', label: 'Année', type: 'date', defaultValue: '', required: true, placeholder: '' },
      { id: 'f2', name: 'date_acte', label: 'Date de l\'acte', type: 'date', defaultValue: '', required: true, placeholder: '' },
      { id: 'f3', name: 'nom_demandeur', label: 'Nom du demandeur', type: 'name', defaultValue: '', required: true, placeholder: '' },
      { id: 'f4', name: 'adresse_demandeur', label: 'Adresse du demandeur', type: 'address', defaultValue: '', required: true, placeholder: '' },
      { id: 'f5', name: 'nom_avocat', label: 'Nom de l\'avocat', type: 'name', defaultValue: '', required: true, placeholder: '' },
      { id: 'f6', name: 'nom_defendeur', label: 'Nom du défendeur', type: 'name', defaultValue: '', required: true, placeholder: '' },
      { id: 'f7', name: 'adresse_defendeur', label: 'Adresse du défendeur', type: 'address', defaultValue: '', required: true, placeholder: '' },
      { id: 'f8', name: 'ville_tribunal', label: 'Ville du tribunal', type: 'address', defaultValue: '', required: true, placeholder: '' },
      { id: 'f9', name: 'date_audience', label: 'Date d\'audience', type: 'date', defaultValue: '', required: true, placeholder: '' },
      { id: 'f10', name: 'heure_audience', label: 'Heure d\'audience', type: 'text', defaultValue: '', required: true, placeholder: 'Ex : 9h00' },
      { id: 'f11', name: 'expose_demande', label: 'Exposé de la demande', type: 'text', defaultValue: '', required: true, placeholder: '' },
    ],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    isCustom: false,
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
      { id: 'f4', name: 'nom_avocat', label: 'Nom de l\'avocat', type: 'name', defaultValue: '', required: true, placeholder: '' },
    ],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    isCustom: false,
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
      { id: 'f6', name: 'date_audience', label: 'Date d\'audience', type: 'date', defaultValue: '', required: true, placeholder: '' },
    ],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    isCustom: false,
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
      { id: 'f5', name: 'nom_avocat', label: 'Nom de l\'avocat', type: 'name', defaultValue: '', required: true, placeholder: '' },
      { id: 'f6', name: 'description_mission', label: 'Description de la mission', type: 'text', defaultValue: '', required: true, placeholder: '' },
      { id: 'f7', name: 'lieu_signature', label: 'Lieu de signature', type: 'address', defaultValue: '', required: true, placeholder: '' },
      { id: 'f8', name: 'date_signature', label: 'Date de signature', type: 'date', defaultValue: '', required: true, placeholder: '' },
    ],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    isCustom: false,
  },
]

// ─── Persistance localStorage ─────────────────────────────────────────────────
const LS_KEY = 'mylaw_templates_v1'

function loadTemplates(): Template[] {
  if (typeof window === 'undefined') return DEFAULT_TEMPLATES
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return DEFAULT_TEMPLATES
    const parsed = JSON.parse(raw) as Template[]
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_TEMPLATES
    return parsed
  } catch {
    return DEFAULT_TEMPLATES
  }
}

function saveTemplates(templates: Template[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(LS_KEY, JSON.stringify(templates))
}

function generateId(): string {
  return `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
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

// ─── Composant principal ──────────────────────────────────────────────────────
export function TemplateLibrary() {
  const [templates, setTemplates]     = useState<Template[]>([]
  )
  const [search, setSearch]           = useState('')
  const [selectedCategory, setSelectedCategory] = useState('Tous')
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)
  const [menuOpen, setMenuOpen]       = useState<string | null>(null)

  // Hydratation côté client
  useEffect(() => {
    setTemplates(loadTemplates())
  }, [])

  const persist = useCallback((tpls: Template[]) => {
    setTemplates(tpls)
    saveTemplates(tpls)
  }, [])

  const categories = ['Tous', ...Array.from(new Set(templates.map((t) => t.category)))]

  const filtered = templates.filter((t) => {
    const matchSearch =
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase())
    const matchCat = selectedCategory === 'Tous' || t.category === selectedCategory
    return matchSearch && matchCat
  })

  // ── Actions ──────────────────────────────────────────────────────────────────
  function createNew() {
    const tpl: Template = {
      id: generateId(),
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
    persist([...templates, tpl])
    setEditingTemplate(tpl)
  }

  function handleEdit(tpl: Template) {
    setEditingTemplate(tpl)
    setMenuOpen(null)
  }

  function handleDuplicate(tpl: Template) {
    const copy: Template = {
      ...tpl,
      id: generateId(),
      name: `${tpl.name} (copie)`,
      isCustom: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    persist([...templates, copy])
    setMenuOpen(null)
  }

  function handleDelete(id: string) {
    if (!window.confirm('Supprimer ce modèle ?')) return
    persist(templates.filter((t) => t.id !== id))
    setMenuOpen(null)
  }

  function handleSave(updated: Template) {
    persist(templates.map((t) => (t.id === updated.id ? updated : t)))
    setEditingTemplate(updated) // Garder l'éditeur ouvert avec les données à jour
  }

  // ── Mode édition ─────────────────────────────────────────────────────────────
  if (editingTemplate) {
    // Récupère la version la plus à jour depuis l'état
    const current = templates.find((t) => t.id === editingTemplate.id) ?? editingTemplate
    return (
      <TemplateEditorView
        template={current}
        onSave={handleSave}
        onClose={() => setEditingTemplate(null)}
      />
    )
  }

  // ── Mode bibliothèque ─────────────────────────────────────────────────────────
  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        background: 'var(--color-bg)',
        fontFamily: 'var(--font-body, Inter, sans-serif)',
      }}
    >
      {/* ── Panneau gauche : liste ── */}
      <div
        style={{
          width: '320px',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid var(--color-border)',
          background: 'var(--color-surface)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-text)' }}>Modèles</h1>
            <button
              onClick={createNew}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '5px 10px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-primary)',
                color: '#fff',
                fontSize: 'var(--text-xs)',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'background var(--transition-interactive)',
              }}
            >
              <Plus size={12} />
              Nouveau
            </button>
          </div>

          {/* Recherche */}
          <div style={{ position: 'relative', marginBottom: '8px' }}>
            <Search size={12} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            <input
              type="text"
              placeholder="Rechercher un modèle…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                paddingLeft: '26px',
                paddingRight: '8px',
                paddingTop: '5px',
                paddingBottom: '5px',
                fontSize: 'var(--text-xs)',
                background: 'var(--color-surface-offset)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--color-text)',
                outline: 'none',
              }}
            />
          </div>

          {/* Filtres catégorie */}
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                style={{
                  fontSize: 'var(--text-xs)',
                  padding: '2px 9px',
                  borderRadius: 'var(--radius-full)',
                  background: selectedCategory === cat ? 'var(--color-primary)' : 'var(--color-surface-offset)',
                  color: selectedCategory === cat ? '#fff' : 'var(--color-text-muted)',
                  fontWeight: selectedCategory === cat ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'all var(--transition-interactive)',
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Liste */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {filtered.length === 0 && (
            <p style={{ padding: '24px 20px', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', textAlign: 'center' }}>
              Aucun modèle trouvé
            </p>
          )}
          {filtered.map((t) => (
            <TemplateListItem
              key={t.id}
              template={t}
              isMenuOpen={menuOpen === t.id}
              onEdit={() => handleEdit(t)}
              onDuplicate={() => handleDuplicate(t)}
              onDelete={() => handleDelete(t.id)}
              onMenuToggle={() => setMenuOpen(menuOpen === t.id ? null : t.id)}
            />
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--color-border)', fontSize: 'var(--text-xs)', color: 'var(--color-text-faint)' }}>
          {templates.length} modèle{templates.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* ── Panneau droit : aperçu vide ── */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-text-muted)',
          gap: '16px',
        }}
      >
        <FileText size={52} style={{ opacity: 0.15 }} />
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 'var(--text-base)', fontWeight: 500, color: 'var(--color-text-muted)', marginBottom: '6px' }}>
            Sélectionnez ou créez un modèle
          </p>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-faint)', maxWidth: '320px', lineHeight: 1.6 }}>
            Cliquez sur un modèle pour l'éditer, ou créez-en un nouveau avec le bouton <strong>Nouveau</strong>.
          </p>
        </div>
        <button
          onClick={createNew}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 18px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-primary)',
            color: '#fff',
            fontSize: 'var(--text-sm)',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          <Plus size={14} />
          Créer un modèle
        </button>
      </div>
    </div>
  )
}

// ─── Item de liste ────────────────────────────────────────────────────────────
function TemplateListItem({
  template, isMenuOpen,
  onEdit, onDuplicate, onDelete, onMenuToggle,
}: {
  template: Template
  isMenuOpen: boolean
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
  onMenuToggle: () => void
}) {
  const catColor = CATEGORY_COLORS[template.category] ?? '#6b7280'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        padding: '10px 14px',
        position: 'relative',
        borderBottom: '1px solid var(--color-border)',
        transition: 'background var(--transition-interactive)',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--color-surface-offset)' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
    >
      {/* Icône */}
      <div
        style={{
          width: '34px', height: '34px',
          borderRadius: 'var(--radius-sm)',
          background: `${catColor}15`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          color: catColor,
        }}
      >
        <TemplateIcon icon={template.icon} size={15} />
      </div>

      {/* Infos */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {template.name}
          </span>
          {template.isCustom && (
            <span style={{ fontSize: '9px', background: 'var(--color-primary-highlight)', color: 'var(--color-primary)', padding: '1px 5px', borderRadius: 'var(--radius-full)', fontWeight: 600, flexShrink: 0 }}>
              Perso
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '10px', color: catColor, fontWeight: 500 }}>{template.category}</span>
          {template.fields.length > 0 && (
            <span style={{ fontSize: '10px', color: 'var(--color-text-faint)' }}>
              · {template.fields.length} champ{template.fields.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
        <button
          onClick={onEdit}
          title="Modifier"
          style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            padding: '4px 8px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-primary)',
            color: '#fff',
            fontSize: '11px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          <Pencil size={10} />
          Modifier
        </button>

        {/* Menu contextuel */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={onMenuToggle}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '26px', height: '26px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border)',
              background: 'transparent',
              color: 'var(--color-text-muted)',
              cursor: 'pointer',
            }}
          >
            <MoreVertical size={12} />
          </button>

          {isMenuOpen && (
            <div
              style={{
                position: 'absolute',
                right: 0,
                top: '100%',
                zIndex: 50,
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-md)',
                padding: '4px',
                minWidth: '140px',
              }}
            >
              <button
                onClick={onDuplicate}
                style={menuItemStyle}
              >
                <Copy size={11} /> Dupliquer
              </button>
              <button
                onClick={onDelete}
                style={{ ...menuItemStyle, color: 'var(--color-error)' }}
              >
                <Trash2 size={11} /> Supprimer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const menuItemStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: '7px',
  padding: '6px 10px',
  fontSize: 'var(--text-xs)',
  color: 'var(--color-text)',
  background: 'transparent',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'background var(--transition-interactive)',
}
