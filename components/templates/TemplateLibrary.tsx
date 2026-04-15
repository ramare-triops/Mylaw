'use client';

import { useState } from 'react';
import { FileText, Scale, Mail, Users, Gavel, FileSignature, Search, Copy, Check } from 'lucide-react';

interface Template {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: React.ElementType;
  content: string;
}

const TEMPLATES: Template[] = [
  {
    id: '1',
    name: 'Mise en demeure',
    category: 'Contentieux',
    description: 'Lettre de mise en demeure formelle',
    icon: Gavel,
    content: `[Lieu], le [Date]

Maître [Nom de l'avocat]
[Adresse du cabinet]

À [Nom du destinataire]
[Adresse]

Mise en demeure

Monsieur / Madame,

Par la présente, et en ma qualité d'avocat de [Nom du client], je me vois dans l'obligation de vous mettre en demeure de [objet de la mise en demeure].

En effet, [exposé des faits].

En conséquence, je vous demande de [demande précise] dans un délai de [X] jours à compter de la réception de la présente.

A défaut, mon client se verra contraint d'engager toute procédure judiciaire qu'il estimera utile à la défense de ses intérêts.

Veuillez agréer, Monsieur / Madame, l'expression de mes salutations distinguées.

Maître [Nom]`,
  },
  {
    id: '2',
    name: 'Convention d\'honoraires',
    category: 'Cabinet',
    description: 'Modèle de convention d\'honoraires',
    icon: FileSignature,
    content: `CONVENTION D'HONORAIRES

Entre les soussignés :

Maître [Nom], avocat au Barreau de [Ville], dont le cabinet est situé [Adresse],
ci-après dénommé « l'Avocat »,

Et :
[Nom du client], [qualité], domicilié(e) [Adresse],
ci-après dénommé(e) « le Client »,

Il est convenu ce qui suit :

Article 1 - Objet de la mission
Le Client confie à l'Avocat la mission de [description de la mission].

Article 2 - Honoraires
Les honoraires sont fixés à [montant] euros HT, soit [montant TTC] euros TTC.

Article 3 - Modalités de règlement
Les honoraires seront réglés selon les modalités suivantes : [modalités].

Fait en deux exemplaires originaux,
Le [Date]

Signature du Client :                    Signature de l'Avocat :`,
  },
  {
    id: '3',
    name: 'Assignation en référé',
    category: 'Contentieux',
    description: 'Acte d\'assignation devant le juge des référés',
    icon: Scale,
    content: `ASSIGNATION EN RÉFÉRÉ

L'AN [Année]
LE [Date]

À LA REQUÊTE DE :
[Nom et qualité du demandeur], demeurant [Adresse],
ayant pour avocat Maître [Nom], avocat au Barreau de [Ville], [Adresse du cabinet].

J'AI, [Nom de l'huissier], Huissier de Justice [...]

DONNÉ ASSIGNATION À :
[Nom et qualité du défendeur], demeurant [Adresse],

D'AVOIR À COMPARAÎTRE devant Monsieur/Madame le Président du Tribunal judiciaire de [Ville], statuant en référé, [Adresse du tribunal],

LE [Date d'audience] À [Heure],

POUR :
[Exposé des faits et de la demande]

SOUS TOUTES RÉSERVES`,
  },
  {
    id: '4',
    name: 'Courrier client - accusé réception',
    category: 'Correspondance',
    description: 'Accusé de réception de dossier client',
    icon: Mail,
    content: `[Lieu], le [Date]

Objet : Accusé de réception - Dossier [Référence]

Monsieur / Madame,

Nous avons bien reçu les documents que vous nous avez transmis concernant votre affaire, et nous vous en remercions.

Nous avons enregistré votre dossier sous la référence [Référence].

Nous allons procéder à l'étude de votre situation et reviendrons vers vous dans les meilleurs délais afin de vous communiquer notre analyse ainsi que les suites à donner.

Reste à votre disposition pour tout renseignement complémentaire.

Veuillez agréer, Monsieur / Madame, l'expression de mes salutations distinguées.

Maître [Nom]`,
  },
  {
    id: '5',
    name: 'Conclusions en réponse',
    category: 'Contentieux',
    description: 'Trame de conclusions en réponse',
    icon: FileText,
    content: `TRIBUNAL JUDICIAIRE DE [VILLE]

CONCLUSIONS EN RÉPONSE

Pour : [Nom du client], [qualité]
Contre : [Nom de la partie adverse], [qualité]

RÉFÉRENCE : [Numéro RG]
AUDIENCE DU : [Date]

PLAISE AU TRIBUNAL

I. RAPPEL DES FAITS

[Exposé factuel]

II. DISCUSSION

A. Sur [Premier moyen]
[Argumentation]

B. Sur [Deuxième moyen]
[Argumentation]

III. DEMANDES

Vu [textes applicables],

Il est demandé au Tribunal de bien vouloir :
- [Demande principale]
- [Demande subsidiaire]
- Condamner [la partie adverse] aux entiers dépens.

Sous toutes réserves.`,
  },
  {
    id: '6',
    name: 'Procuration',
    category: 'Cabinet',
    description: 'Mandat/procuration générale',
    icon: Users,
    content: `PROCURATION

Je soussigné(e), [Nom complet], né(e) le [Date de naissance] à [Lieu], demeurant [Adresse complète],

donne par la présente procuration à :

Maître [Nom de l'avocat], avocat au Barreau de [Ville], dont le cabinet est situé [Adresse],

pouvoir général de me représenter, agir et signer en mon nom dans le cadre de [description de la mission], et notamment :

- [Pouvoir 1]
- [Pouvoir 2]
- [Pouvoir 3]

Fait à [Lieu], le [Date]

Signature :`,
  },
];

const CATEGORIES = ['Tous', ...Array.from(new Set(TEMPLATES.map((t) => t.category)))];

const CATEGORY_LABELS: Record<string, string> = {
  Contentieux: 'Contentieux',
  Cabinet: 'Gestion du cabinet',
  Correspondance: 'Correspondance',
};

export function TemplateLibrary() {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Tous');
  const [selected, setSelected] = useState<Template | null>(null);
  const [copied, setCopied] = useState(false);

  const filtered = TEMPLATES.filter((t) => {
    const matchSearch =
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase());
    const matchCat = selectedCategory === 'Tous' || t.category === selectedCategory;
    return matchSearch && matchCat;
  });

  function copyContent() {
    if (!selected) return;
    navigator.clipboard.writeText(selected.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <div className="flex h-full" style={{ background: 'var(--color-bg)', fontFamily: 'var(--font-body, Inter, sans-serif)' }}>
      {/* Left panel */}
      <div
        className="flex flex-col border-r"
        style={{ width: '320px', flexShrink: 0, borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-text)', marginBottom: '12px' }}>
            Modèles
          </h1>
          {/* Search */}
          <div className="relative" style={{ marginBottom: '10px' }}>
            <Search size={13} className="absolute" style={{ left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            <input
              type="text"
              placeholder="Rechercher un modèle..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                paddingLeft: '28px',
                paddingRight: '8px',
                paddingTop: '6px',
                paddingBottom: '6px',
                fontSize: 'var(--text-xs)',
                background: 'var(--color-surface-offset)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--color-text)',
                outline: 'none',
              }}
            />
          </div>
          {/* Category filters */}
          <div className="flex gap-1 flex-wrap">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                style={{
                  fontSize: 'var(--text-xs)',
                  padding: '3px 10px',
                  borderRadius: 'var(--radius-full)',
                  background: selectedCategory === cat ? 'var(--color-primary)' : 'var(--color-surface-offset)',
                  color: selectedCategory === cat ? '#fff' : 'var(--color-text-muted)',
                  fontWeight: selectedCategory === cat ? 600 : 400,
                  transition: 'all var(--transition-interactive)',
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto py-2">
          {filtered.length === 0 && (
            <p style={{ padding: '24px 20px', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', textAlign: 'center' }}>
              Aucun modèle trouvé
            </p>
          )}
          {filtered.map((t) => {
            const Icon = t.icon;
            const isActive = selected?.id === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setSelected(t)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  padding: '10px 16px',
                  textAlign: 'left',
                  background: isActive ? 'var(--color-primary-highlight)' : 'transparent',
                  borderLeft: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
                  transition: 'all var(--transition-interactive)',
                }}
              >
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: 'var(--radius-sm)',
                    background: isActive ? 'var(--color-primary)' : 'var(--color-surface-offset)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Icon size={14} style={{ color: isActive ? '#fff' : 'var(--color-text-muted)' }} />
                </div>
                <div>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: isActive ? 'var(--color-primary)' : 'var(--color-text)' }}>
                    {t.name}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                    {t.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right panel - preview */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selected ? (
          <>
            <div
              className="flex items-center justify-between px-6 py-4 border-b"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
            >
              <div>
                <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-text)' }}>{selected.name}</h2>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                  {CATEGORY_LABELS[selected.category] ?? selected.category}
                </span>
              </div>
              <button
                onClick={copyContent}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-sm)',
                  background: copied ? 'var(--color-success)' : 'var(--color-primary)',
                  color: '#fff',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 500,
                  transition: 'background var(--transition-interactive)',
                }}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copié !' : 'Copier'}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <pre
                style={{
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'var(--font-body, Inter, sans-serif)',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-text)',
                  lineHeight: 1.8,
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '24px',
                }}
              >
                {selected.content}
              </pre>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center" style={{ color: 'var(--color-text-muted)' }}>
            <FileText size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
            <p style={{ fontSize: 'var(--text-base)', fontWeight: 500, color: 'var(--color-text-muted)' }}>
              Sélectionnez un modèle
            </p>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-faint)', marginTop: '4px' }}>
              {TEMPLATES.length} modèles disponibles
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
