'use client';

import { useState } from 'react';
import { X, FileText, Scale, Mail, Users, Gavel, FileSignature, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

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
    content: `[Lieu], le [Date]\n\nMaître [Nom de l\'avocat]\n[Adresse du cabinet]\n\nÀ [Nom du destinataire]\n[Adresse]\n\nMise en demeure\n\nMonsieur / Madame,\n\nPar la présente, et en ma qualité d\'avocat de [Nom du client], je me vois dans l\'obligation de vous mettre en demeure de [objet de la mise en demeure].\n\nEn effet, [exposé des faits].\n\nEn conséquence, je vous demande de [demande précise] dans un délai de [X] jours à compter de la réception de la présente.\n\nA défaut, mon client se verra contraint d\'engager toute procédure judiciaire qu\'il estimera utile à la défense de ses intérêts.\n\nVeuillez agréer, Monsieur / Madame, l\'expression de mes salutations distinguées.\n\nMaître [Nom]`,
  },
  {
    id: '2',
    name: "Convention d'honoraires",
    category: 'Cabinet',
    description: "Modèle de convention d'honoraires",
    icon: FileSignature,
    content: `CONVENTION D\'HONORAIRES\n\nEntre les soussignés :\n\nMaître [Nom], avocat au Barreau de [Ville], dont le cabinet est situé [Adresse],\nci-après dénommé « l\'Avocat »,\n\nEt :\n[Nom du client], [qualité], domicilié(e) [Adresse],\nci-après dénommé(e) « le Client »,\n\nIl est convenu ce qui suit :\n\nArticle 1 - Objet de la mission\nLe Client confie à l\'Avocat la mission de [description de la mission].\n\nArticle 2 - Honoraires\nLes honoraires sont fixés à [montant] euros HT, soit [montant TTC] euros TTC.\n\nArticle 3 - Modalités de règlement\nLes honoraires seront réglés selon les modalités suivantes : [modalités].\n\nFait en deux exemplaires originaux,\nLe [Date]\n\nSignature du Client :                    Signature de l\'Avocat :`,
  },
  {
    id: '3',
    name: 'Assignation en référé',
    category: 'Contentieux',
    description: "Acte d'assignation devant le juge des référés",
    icon: Scale,
    content: `ASSIGNATION EN RÉFÉRÉ\n\nL\'AN [Année]\nLE [Date]\n\nÀ LA REQUÊTE DE :\n[Nom et qualité du demandeur], demeurant [Adresse],\nayant pour avocat Maître [Nom], avocat au Barreau de [Ville], [Adresse du cabinet].\n\nJ\'AI, [Nom de l\'huissier], Huissier de Justice [...]\n\nDONNÉ ASSIGNATION À :\n[Nom et qualité du défendeur], demeurant [Adresse],\n\nD\'AVOIR À COMPARAÎTRE devant Monsieur/Madame le Président du Tribunal judiciaire de [Ville], statuant en référé, [Adresse du tribunal],\n\nLE [Date d\'audience] À [Heure],\n\nPOUR :\n[Exposé des faits et de la demande]\n\nSOUS TOUTES RÉSERVES`,
  },
  {
    id: '4',
    name: 'Courrier client - accusé réception',
    category: 'Correspondance',
    description: 'Accusé de réception de dossier client',
    icon: Mail,
    content: `[Lieu], le [Date]\n\nObjet : Accusé de réception - Dossier [Référence]\n\nMonsieur / Madame,\n\nNous avons bien reçu les documents que vous nous avez transmis concernant votre affaire, et nous vous en remercions.\n\nNous avons enregistré votre dossier sous la référence [Référence].\n\nNous allons procéder à l\'étude de votre situation et reviendrons vers vous dans les meilleurs délais afin de vous communiquer notre analyse ainsi que les suites à donner.\n\nReste à votre disposition pour tout renseignement complémentaire.\n\nVeuillez agréer, Monsieur / Madame, l\'expression de mes salutations distinguées.\n\nMaître [Nom]`,
  },
  {
    id: '5',
    name: 'Conclusions en réponse',
    category: 'Contentieux',
    description: 'Trame de conclusions en réponse',
    icon: FileText,
    content: `TRIBUNAL JUDICIAIRE DE [VILLE]\n\nCONCLUSIONS EN RÉPONSE\n\nPour : [Nom du client], [qualité]\nContre : [Nom de la partie adverse], [qualité]\n\nRÉFÉRENCE : [Numéro RG]\nAUDIENCE DU : [Date]\n\nPLAISE AU TRIBUNAL\n\nI. RAPPEL DES FAITS\n\n[Exposé factuel]\n\nII. DISCUSSION\n\nA. Sur [Premier moyen]\n[Argumentation]\n\nB. Sur [Deuxième moyen]\n[Argumentation]\n\nIII. DEMANDES\n\nVu [textes applicables],\n\nIl est demandé au Tribunal de bien vouloir :\n- [Demande principale]\n- [Demande subsidiaire]\n- Condamner [la partie adverse] aux entiers dépens.\n\nSous toutes réserves.`,
  },
  {
    id: '6',
    name: 'Procuration',
    category: 'Cabinet',
    description: 'Mandat/procuration générale',
    icon: Users,
    content: `PROCURATION\n\nJe soussigné(e), [Nom complet], né(e) le [Date de naissance] à [Lieu], demeurant [Adresse complète],\n\ndonne par la présente procuration à :\n\nMaître [Nom de l\'avocat], avocat au Barreau de [Ville], dont le cabinet est situé [Adresse],\n\npouvoir général de me représenter, agir et signer en mon nom dans le cadre de [description de la mission], et notamment :\n\n- [Pouvoir 1]\n- [Pouvoir 2]\n- [Pouvoir 3]\n\nFait à [Lieu], le [Date]\n\nSignature :`,
  },
];

const CATEGORIES = ['Aucun', ...Array.from(new Set(TEMPLATES.map((t) => t.category)))];

interface NewDocumentDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (title: string, templateContent: string) => void;
}

export function NewDocumentDialog({ open, onClose, onCreate }: NewDocumentDialogProps) {
  const [title, setTitle] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Aucun');
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);

  if (!open) return null;

  const filtered = selectedCategory === 'Aucun'
    ? TEMPLATES
    : TEMPLATES.filter((t) => t.category === selectedCategory);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const finalTitle = title.trim() || (selectedTemplate ? selectedTemplate.name : 'Nouveau document');
    onCreate(finalTitle, selectedTemplate?.content ?? '');
    // reset
    setTitle('');
    setSelectedTemplate(null);
    setSelectedCategory('Aucun');
  }

  function handleClose() {
    setTitle('');
    setSelectedTemplate(null);
    setSelectedCategory('Aucun');
    onClose();
  }

  return (
    // Overlay
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div
        className="relative flex flex-col rounded-xl shadow-2xl"
        style={{
          width: '760px',
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100vh - 64px)',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: 'var(--color-border)', flexShrink: 0 }}
        >
          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-text)' }}>
            Nouveau document
          </h2>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-md hover:bg-[var(--color-surface-offset)] transition-colors"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex flex-col gap-5 px-6 py-4" style={{ flexShrink: 0 }}>
            {/* Nom du document */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="doc-title"
                style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-text)' }}
              >
                Nom du document
              </label>
              <input
                id="doc-title"
                type="text"
                autoFocus
                placeholder={selectedTemplate ? selectedTemplate.name : 'Nouveau document'}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={cn(
                  'w-full px-3 py-2 rounded-md text-sm',
                  'bg-[var(--color-bg)] border border-[var(--color-border)]',
                  'text-[var(--color-text)] placeholder:text-[var(--color-text-muted)]',
                  'focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]'
                )}
              />
            </div>

            {/* Label galerie */}
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-text)' }}>
                Choisir un modèle
                <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: '6px' }}>
                  (optionnel)
                </span>
              </span>
              {/* Filtres catégories */}
              <div className="flex gap-1 flex-wrap">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
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
          </div>

          {/* Template gallery */}
          <div
            className="flex-1 overflow-y-auto px-6 pb-4"
            style={{ minHeight: 0 }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '10px',
              }}
            >
              {/* Card "Vide" */}
              <button
                type="button"
                onClick={() => setSelectedTemplate(null)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: '8px',
                  padding: '14px',
                  borderRadius: 'var(--radius-md)',
                  border: `2px solid ${selectedTemplate === null ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  background: selectedTemplate === null ? 'var(--color-primary-highlight)' : 'var(--color-bg)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all var(--transition-interactive)',
                }}
              >
                <div style={{
                  width: '32px', height: '32px', borderRadius: 'var(--radius-sm)',
                  background: selectedTemplate === null ? 'var(--color-primary)' : 'var(--color-surface-offset)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {selectedTemplate === null
                    ? <Check size={14} style={{ color: '#fff' }} />
                    : <FileText size={14} style={{ color: 'var(--color-text-muted)' }} />
                  }
                </div>
                <div>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: selectedTemplate === null ? 'var(--color-primary)' : 'var(--color-text)' }}>
                    Document vide
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                    Partir de zéro
                  </div>
                </div>
              </button>

              {/* Template cards */}
              {filtered.map((t) => {
                const Icon = t.icon;
                const isActive = selectedTemplate?.id === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTemplate(t)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: '8px',
                      padding: '14px',
                      borderRadius: 'var(--radius-md)',
                      border: `2px solid ${isActive ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      background: isActive ? 'var(--color-primary-highlight)' : 'var(--color-bg)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all var(--transition-interactive)',
                    }}
                  >
                    <div style={{
                      width: '32px', height: '32px', borderRadius: 'var(--radius-sm)',
                      background: isActive ? 'var(--color-primary)' : 'var(--color-surface-offset)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <Icon size={14} style={{ color: isActive ? '#fff' : 'var(--color-text-muted)' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: isActive ? 'var(--color-primary)' : 'var(--color-text)' }}>
                        {t.name}
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                        {t.description}
                      </div>
                    </div>
                    {/* Mini preview */}
                    <div
                      style={{
                        width: '100%',
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '8px 10px',
                        marginTop: '4px',
                        fontSize: '9px',
                        color: 'var(--color-text-muted)',
                        lineHeight: 1.5,
                        whiteSpace: 'pre-wrap',
                        overflow: 'hidden',
                        maxHeight: '70px',
                        pointerEvents: 'none',
                        userSelect: 'none',
                      }}
                    >
                      {t.content.slice(0, 200)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-end gap-3 px-6 py-4 border-t"
            style={{ borderColor: 'var(--color-border)', flexShrink: 0 }}
          >
            <button
              type="button"
              onClick={handleClose}
              className={cn(
                'px-4 py-2 rounded-md text-sm font-medium',
                'bg-[var(--color-surface-offset)] text-[var(--color-text)]',
                'hover:bg-[var(--color-surface-dynamic)] transition-colors'
              )}
            >
              Annuler
            </button>
            <button
              type="submit"
              className={cn(
                'px-4 py-2 rounded-md text-sm font-medium',
                'bg-[var(--color-primary)] text-white hover:opacity-90 transition-opacity'
              )}
            >
              Créer le document
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
