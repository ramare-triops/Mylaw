'use client';

import { useState, useEffect, useRef } from 'react';
import { User, Bell, Palette, Shield, Database, RefreshCw, Loader2, Check, FileText, Plus, Trash2 } from 'lucide-react';
import { getSetting, setSetting } from '@/lib/db';
import { DriveSyncSection } from './DriveSyncSection';
import { useDrive } from '@/components/providers/DriveSyncProvider';
import type { TextExpansionEntry } from '@/components/editor/extensions/TextExpansion';

const SECTIONS = [
  { id: 'profile',       label: 'Profil',           icon: User },
  { id: 'notifications', label: 'Notifications',    icon: Bell },
  { id: 'appearance',    label: 'Apparence',         icon: Palette },
  { id: 'editor',        label: 'Éditeur',           icon: FileText },
  { id: 'sync',          label: 'Synchronisation',  icon: RefreshCw },
  { id: 'security',      label: 'Sécurité',          icon: Shield },
  { id: 'data',          label: 'Données',            icon: Database },
];

type Profile    = { firstName: string; lastName: string; email: string; barreau: string; cabinet: string; phone: string };
type Notifs     = { emailAlerts: boolean; deadlineReminders: boolean; newDocuments: boolean; weeklyDigest: boolean };
type Appearance = { theme: string; fontSize: string; compactMode: boolean };
export type EditorPrefs = {
  fontFamily:       string;
  fontSize:         string;
  lineHeight:       string;
  pageMargin:       string;
  spellcheck:       boolean;
  autoSave:         boolean;
  autoSaveDelay:    string;
  showWordCount:    boolean;
  showStatusBar:    boolean;
  defaultTextAlign: string;
  textExpansions:   TextExpansionEntry[];
};

const DEFAULT_PROFILE:    Profile    = { firstName: '', lastName: '', email: '', barreau: '', cabinet: '', phone: '' };
const DEFAULT_NOTIFS:     Notifs     = { emailAlerts: true, deadlineReminders: true, newDocuments: false, weeklyDigest: true };
const DEFAULT_APPEARANCE: Appearance = { theme: 'system', fontSize: 'medium', compactMode: false };
export const DEFAULT_EDITOR_PREFS: EditorPrefs = {
  fontFamily:       "Georgia, serif",
  fontSize:         "12",
  lineHeight:       "1.8",
  pageMargin:       "normal",
  spellcheck:       true,
  autoSave:         true,
  autoSaveDelay:    "2",
  showWordCount:    true,
  showStatusBar:    true,
  defaultTextAlign: "left",
  textExpansions:   [],
};

const FONT_FAMILIES = [
  { label: 'Georgia (défaut)',      value: 'Georgia, serif' },
  { label: 'Source Serif 4',        value: "'Source Serif 4', Georgia, serif" },
  { label: 'Times New Roman',       value: "'Times New Roman', Times, serif" },
  { label: 'Geist',                 value: "'Geist', 'Inter', sans-serif" },
  { label: 'Inter',                 value: "'Inter', sans-serif" },
  { label: 'Arial',                 value: 'Arial, Helvetica, sans-serif' },
  { label: 'Courier New',           value: "'Courier New', Courier, monospace" },
  { label: 'JetBrains Mono',        value: "'JetBrains Mono', 'Courier New', monospace" },
];
const FONT_SIZES   = ['8','9','10','11','12','14','16','18','20','24'];
const LINE_HEIGHTS = [
  { label: 'Simple (1.0)',      value: '1.0' },
  { label: 'Condensé (1.4)',    value: '1.4' },
  { label: 'Normal (1.6)',      value: '1.6' },
  { label: 'Aéré (1.8)',        value: '1.8' },
  { label: 'Double (2.0)',      value: '2.0' },
  { label: 'Très aéré (2.4)',   value: '2.4' },
];
const PAGE_MARGINS = [
  { label: 'Étroites  (15 mm)', value: 'narrow' },
  { label: 'Normales  (20 mm)', value: 'normal' },
  { label: 'Larges    (25 mm)', value: 'wide' },
  { label: 'Très larges (30 mm)', value: 'extra-wide' },
];
const TEXT_ALIGNS = [
  { label: 'Gauche',   value: 'left' },
  { label: 'Centre',   value: 'center' },
  { label: 'Droite',   value: 'right' },
  { label: 'Justifié', value: 'justify' },
];
const AUTO_SAVE_DELAYS = [
  { label: '1 seconde',   value: '1' },
  { label: '2 secondes',  value: '2' },
  { label: '5 secondes',  value: '5' },
  { label: '10 secondes', value: '10' },
  { label: '30 secondes', value: '30' },
];

type SaveState = 'idle' | 'saving' | 'syncing' | 'done' | 'error';

// ─── Composant Expansions de texte ───────────────────────────────────────────

function TextExpansionsEditor({
  expansions,
  onChange,
}: {
  expansions: TextExpansionEntry[];
  onChange: (expansions: TextExpansionEntry[]) => void;
}) {
  const [abbr,  setAbbr]  = useState('');
  const [expand, setExpand] = useState('');

  const handleAdd = () => {
    const trimAbbr   = abbr.trim();
    const trimExpand = expand.trim();
    if (!trimAbbr || !trimExpand) return;
    if (expansions.some(e => e.abbreviation === trimAbbr)) return; // doublon
    onChange([...expansions, { abbreviation: trimAbbr, expansion: trimExpand }]);
    setAbbr('');
    setExpand('');
  };

  const handleRemove = (index: number) => {
    onChange(expansions.filter((_, i) => i !== index));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Formulaire d'ajout */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 2fr auto',
        gap: '8px',
        alignItems: 'flex-end',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-muted)' }}>
            Raccourci
          </label>
          <input
            style={inputStyle}
            value={abbr}
            onChange={e => setAbbr(e.target.value)}
            placeholder="ca"
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-muted)' }}>
            Expansion
          </label>
          <input
            style={inputStyle}
            value={expand}
            onChange={e => setExpand(e.target.value)}
            placeholder="Cour d'appel"
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
          />
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={!abbr.trim() || !expand.trim()}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            padding: '7px 12px',
            fontSize: 'var(--text-sm)', fontWeight: 500,
            background: 'var(--color-primary)', color: '#fff',
            border: 'none', borderRadius: 'var(--radius-sm)',
            cursor: 'pointer', opacity: (!abbr.trim() || !expand.trim()) ? 0.5 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          <Plus size={14} /> Ajouter
        </button>
      </div>

      {/* Liste des expansions */}
      {expansions.length === 0 ? (
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
          Aucune expansion configurée. Ajoutez-en une ci-dessus.
        </p>
      ) : (
        <div style={{
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
            <thead>
              <tr style={{ background: 'var(--color-surface-offset)', borderBottom: '1px solid var(--color-border)' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500, color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>Raccourci</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500, color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>Expansion</th>
                <th style={{ width: '40px' }} />
              </tr>
            </thead>
            <tbody>
              {expansions.map((entry, i) => (
                <tr
                  key={i}
                  style={{
                    borderBottom: i < expansions.length - 1 ? '1px solid var(--color-border)' : 'none',
                    background: 'var(--color-surface)',
                  }}
                >
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: 'var(--color-primary)', fontWeight: 600 }}>
                    {entry.abbreviation}
                  </td>
                  <td style={{ padding: '8px 12px', color: 'var(--color-text)' }}>
                    {entry.expansion}
                  </td>
                  <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => handleRemove(i)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: '28px', height: '28px', borderRadius: 'var(--radius-sm)',
                        border: 'none', background: 'transparent',
                        color: 'var(--color-text-muted)', cursor: 'pointer',
                      }}
                      title="Supprimer"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function Settings() {
  const [activeSection, setActiveSection] = useState('profile');
  const [loading, setLoading]             = useState(true);
  const [saveState, setSaveState]         = useState<SaveState>('idle');
  const doneTimer                         = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevDriveStatus                   = useRef<string>('');

  const { status: driveStatus } = useDrive();

  const [profile,      setProfile]      = useState<Profile>(DEFAULT_PROFILE);
  const [notifs,       setNotifs]       = useState<Notifs>(DEFAULT_NOTIFS);
  const [appearance,   setAppearance]   = useState<Appearance>(DEFAULT_APPEARANCE);
  const [editorPrefs,  setEditorPrefs]  = useState<EditorPrefs>(DEFAULT_EDITOR_PREFS);

  useEffect(() => { loadFromDexie(); }, []);

  useEffect(() => {
    const prev = prevDriveStatus.current;
    prevDriveStatus.current = driveStatus;
    if (driveStatus === 'connected' && (prev === 'loading' || prev === 'syncing')) {
      loadFromDexie();
    }
  }, [driveStatus]);

  async function loadFromDexie() {
    setLoading(true);
    const [p, n, a, e] = await Promise.all([
      getSetting<Profile>('profile', DEFAULT_PROFILE),
      getSetting<Notifs>('notifications', DEFAULT_NOTIFS),
      getSetting<Appearance>('appearance', DEFAULT_APPEARANCE),
      getSetting<EditorPrefs>('editorPrefs', DEFAULT_EDITOR_PREFS),
    ]);
    setProfile(p); setNotifs(n); setAppearance(a);
    // Assure la rétrocompatibilité si textExpansions absent de la DB
    setEditorPrefs({ ...DEFAULT_EDITOR_PREFS, ...e, textExpansions: e.textExpansions ?? [] });
    setLoading(false);
  }

  useEffect(() => {
    if (saveState === 'idle' || saveState === 'done' || saveState === 'error') return;
    if (driveStatus === 'syncing') {
      setSaveState('syncing');
    } else if (driveStatus === 'connected' && saveState === 'syncing') {
      setSaveState('done');
      if (doneTimer.current) clearTimeout(doneTimer.current);
      doneTimer.current = setTimeout(() => setSaveState('idle'), 2500);
    } else if (driveStatus === 'error' && saveState === 'syncing') {
      setSaveState('error');
      if (doneTimer.current) clearTimeout(doneTimer.current);
      doneTimer.current = setTimeout(() => setSaveState('idle'), 3000);
    }
  }, [driveStatus, saveState]);

  async function handleSave() {
    if (saveState === 'saving' || saveState === 'syncing') return;
    setSaveState('saving');
    try {
      await Promise.all([
        setSetting('profile', profile),
        setSetting('notifications', notifs),
        setSetting('appearance', appearance),
        setSetting('editorPrefs', editorPrefs),
      ]);
      if (driveStatus === 'idle' || driveStatus === 'disconnected') {
        setSaveState('done');
        if (doneTimer.current) clearTimeout(doneTimer.current);
        doneTimer.current = setTimeout(() => setSaveState('idle'), 2500);
      }
    } catch {
      setSaveState('error');
      doneTimer.current = setTimeout(() => setSaveState('idle'), 3000);
    }
  }

  const isDriveLoading = driveStatus === 'loading' || driveStatus === 'syncing';

  if (loading && isDriveLoading) {
    return (
      <div className="flex h-full items-center justify-center" style={{ gap: '10px', color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
        <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} />
        Synchronisation en cours…
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center" style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
        Chargement…
      </div>
    );
  }

  const setEp = (patch: Partial<EditorPrefs>) => setEditorPrefs(p => ({ ...p, ...patch }));

  return (
    <div className="flex h-full"
      style={{ background: 'var(--color-bg)', fontFamily: 'var(--font-body, Inter, sans-serif)' }}>

      {/* Sidebar navigation */}
      <div className="flex flex-col border-r py-4"
        style={{ width: '220px', flexShrink: 0, borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
        <h1 style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-text)', padding: '0 16px 16px' }}>
          Paramètres
        </h1>
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveSection(id)} style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '8px 16px',
            fontSize: 'var(--text-sm)',
            fontWeight: activeSection === id ? 600 : 400,
            color: activeSection === id ? 'var(--color-primary)' : 'var(--color-text-muted)',
            background: activeSection === id ? 'var(--color-primary-highlight)' : 'transparent',
            borderLeft: activeSection === id ? '2px solid var(--color-primary)' : '2px solid transparent',
            textAlign: 'left',
            transition: 'all var(--transition-interactive)',
            width: '100%',
          }}>
            <Icon size={15} />{label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8" style={{ maxWidth: '680px' }}>

        {activeSection === 'profile' && (
          <Section title="Profil" description="Vos informations professionnelles">
            <Field label="Prénom"><input style={inputStyle} value={profile.firstName} onChange={e => setProfile(p => ({ ...p, firstName: e.target.value }))} placeholder="Jean" /></Field>
            <Field label="Nom"><input style={inputStyle} value={profile.lastName}  onChange={e => setProfile(p => ({ ...p, lastName:  e.target.value }))} placeholder="Dupont" /></Field>
            <Field label="Email"><input style={inputStyle} type="email" value={profile.email} onChange={e => setProfile(p => ({ ...p, email: e.target.value }))} placeholder="jean.dupont@cabinet.fr" /></Field>
            <Field label="Barreau"><input style={inputStyle} value={profile.barreau} onChange={e => setProfile(p => ({ ...p, barreau: e.target.value }))} placeholder="Paris" /></Field>
            <Field label="Cabinet"><input style={inputStyle} value={profile.cabinet} onChange={e => setProfile(p => ({ ...p, cabinet: e.target.value }))} placeholder="Cabinet Dupont & Associés" /></Field>
            <Field label="Téléphone"><input style={inputStyle} value={profile.phone}   onChange={e => setProfile(p => ({ ...p, phone:   e.target.value }))} placeholder="+33 1 00 00 00 00" /></Field>
          </Section>
        )}

        {activeSection === 'notifications' && (
          <Section title="Notifications" description="Gérez vos préférences de notifications">
            <Toggle label="Alertes par email"     description="Recevez les alertes importantes par email"     checked={notifs.emailAlerts}        onChange={v => setNotifs(n => ({ ...n, emailAlerts:        v }))} />
            <Toggle label="Rappels d'échéances"  description="Soyez prévenu avant chaque échéance"          checked={notifs.deadlineReminders}  onChange={v => setNotifs(n => ({ ...n, deadlineReminders:  v }))} />
            <Toggle label="Nouveaux documents"    description="Notification lors de l'ajout de documents"    checked={notifs.newDocuments}       onChange={v => setNotifs(n => ({ ...n, newDocuments:       v }))} />
            <Toggle label="Résumé hebdomadaire"  description="Un résumé de votre activité chaque semaine"  checked={notifs.weeklyDigest}       onChange={v => setNotifs(n => ({ ...n, weeklyDigest:       v }))} />
          </Section>
        )}

        {activeSection === 'appearance' && (
          <Section title="Apparence" description="Personnalisez l'interface">
            <Field label="Thème">
              <select style={inputStyle} value={appearance.theme} onChange={e => setAppearance(a => ({ ...a, theme: e.target.value }))}>
                <option value="system">Système (automatique)</option>
                <option value="light">Clair</option>
                <option value="dark">Sombre</option>
              </select>
            </Field>
            <Field label="Taille du texte">
              <select style={inputStyle} value={appearance.fontSize} onChange={e => setAppearance(a => ({ ...a, fontSize: e.target.value }))}>
                <option value="small">Petite</option>
                <option value="medium">Moyenne</option>
                <option value="large">Grande</option>
              </select>
            </Field>
            <Toggle label="Mode compact" description="Réduire l'espacement de l'interface" checked={appearance.compactMode} onChange={v => setAppearance(a => ({ ...a, compactMode: v }))} />
          </Section>
        )}

        {/* ─── ONGLET ÉDITEUR ─────────────────────────────────────────────── */}
        {activeSection === 'editor' && (
          <>
            {/* Typographie */}
            <Section title="Typographie" description="Police et mise en forme par défaut de vos nouveaux documents">
              <Field label="Police par défaut">
                <select style={inputStyle} value={editorPrefs.fontFamily} onChange={e => setEp({ fontFamily: e.target.value })}>
                  {FONT_FAMILIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </Field>
              <Field label="Taille de police par défaut (pt)">
                <select style={inputStyle} value={editorPrefs.fontSize} onChange={e => setEp({ fontSize: e.target.value })}>
                  {FONT_SIZES.map(s => <option key={s} value={s}>{s} pt</option>)}
                </select>
              </Field>
              <Field label="Interligne par défaut">
                <select style={inputStyle} value={editorPrefs.lineHeight} onChange={e => setEp({ lineHeight: e.target.value })}>
                  {LINE_HEIGHTS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </Field>
              <Field label="Alignement par défaut">
                <select style={inputStyle} value={editorPrefs.defaultTextAlign} onChange={e => setEp({ defaultTextAlign: e.target.value })}>
                  {TEXT_ALIGNS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </Field>
            </Section>

            <div style={{ height: '24px' }} />

            {/* Mise en page */}
            <Section title="Mise en page" description="Dimensions et marges de la page A4">
              <Field label="Marges de page">
                <select style={inputStyle} value={editorPrefs.pageMargin} onChange={e => setEp({ pageMargin: e.target.value })}>
                  {PAGE_MARGINS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </Field>
            </Section>

            <div style={{ height: '24px' }} />

            {/* Comportement */}
            <Section title="Comportement" description="Options d'édition et de sauvegarde automatique">
              <Toggle
                label="Sauvegarde automatique"
                description="Enregistre le document automatiquement pendant la saisie"
                checked={editorPrefs.autoSave}
                onChange={v => setEp({ autoSave: v })}
              />
              {editorPrefs.autoSave && (
                <Field label="Délai avant sauvegarde automatique">
                  <select style={inputStyle} value={editorPrefs.autoSaveDelay} onChange={e => setEp({ autoSaveDelay: e.target.value })}>
                    {AUTO_SAVE_DELAYS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </Field>
              )}
              <Toggle
                label="Correcteur orthographique"
                description="Active le correcteur du navigateur dans l'éditeur"
                checked={editorPrefs.spellcheck}
                onChange={v => setEp({ spellcheck: v })}
              />
              <Toggle
                label="Afficher le compteur de mots"
                description="Nombre de mots et caractères dans la barre de statut"
                checked={editorPrefs.showWordCount}
                onChange={v => setEp({ showWordCount: v })}
              />
              <Toggle
                label="Afficher la barre de statut"
                description="Barre d'informations en bas de l'éditeur"
                checked={editorPrefs.showStatusBar}
                onChange={v => setEp({ showStatusBar: v })}
              />
            </Section>

            <div style={{ height: '24px' }} />

            {/* Expansions de texte */}
            <Section
              title="Expansions de texte"
              description="Définissez des raccourcis qui se remplacent automatiquement par leur expansion quand vous tapez Espace ou Entrée."
            >
              <TextExpansionsEditor
                expansions={editorPrefs.textExpansions ?? []}
                onChange={expansions => setEp({ textExpansions: expansions })}
              />
            </Section>

            <div style={{ height: '24px' }} />

            {/* Prévisualisation */}
            <Section title="Aperçu" description="Rendu approximatif de vos réglages">
              <div style={{
                padding: '24px 28px',
                background: 'white',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                minHeight: '120px',
              }}>
                <p style={{
                  fontFamily: editorPrefs.fontFamily,
                  fontSize: `${editorPrefs.fontSize}pt`,
                  lineHeight: editorPrefs.lineHeight,
                  textAlign: editorPrefs.defaultTextAlign as React.CSSProperties['textAlign'],
                  color: '#28251d',
                  margin: 0,
                }}>
                  Ceci est un aperçu de votre document avec les paramètres actuels.
                  La police <strong>{FONT_FAMILIES.find(f => f.value === editorPrefs.fontFamily)?.label ?? editorPrefs.fontFamily}</strong>,
                  en taille <strong>{editorPrefs.fontSize} pt</strong>,
                  avec un interligne de <strong>{editorPrefs.lineHeight}</strong>.
                </p>
              </div>
            </Section>
          </>
        )}
        {/* ─────────────────────────────────────────────────────────────────── */}

        {activeSection === 'sync' && (
          <Section title="Synchronisation" description="Sauvegardez vos données sur tous vos appareils">
            <DriveSyncSection />
          </Section>
        )}

        {activeSection === 'security' && (
          <Section title="Sécurité" description="Protégez votre compte">
            <div style={cardStyle}>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-text)', marginBottom: '4px' }}>Mot de passe</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: '12px' }}>Dernière modification il y a 30 jours</div>
              <button style={btnOutlineStyle}>Modifier le mot de passe</button>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-text)', marginBottom: '4px' }}>Double authentification</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: '12px' }}>Ajoutez une couche de sécurité supplémentaire</div>
              <button style={btnOutlineStyle}>Configurer la 2FA</button>
            </div>
          </Section>
        )}

        {activeSection === 'data' && (
          <Section title="Données" description="Exportez ou supprimez vos données">
            <div style={cardStyle}>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-text)', marginBottom: '4px' }}>Exporter mes données</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: '12px' }}>Téléchargez une copie de tous vos documents et paramètres</div>
              <button style={btnOutlineStyle}>Exporter en JSON</button>
            </div>
            <div style={{ ...cardStyle, border: '1px solid var(--color-error)' }}>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-error)', marginBottom: '4px' }}>Zone dangereuse</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: '12px' }}>La suppression de votre compte est irréversible</div>
              <button style={{ ...btnOutlineStyle, borderColor: 'var(--color-error)', color: 'var(--color-error)' }}>Supprimer mon compte</button>
            </div>
          </Section>
        )}

        {['profile', 'notifications', 'appearance', 'editor'].includes(activeSection) && (
          <div style={{ marginTop: '24px' }}>
            <SaveButton state={saveState} onClick={handleSave} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Bouton Enregistrer ───────────────────────────────────────────────────────

function SaveButton({ state, onClick }: { state: SaveState; onClick: () => void }) {
  const isLoading = state === 'saving' || state === 'syncing';
  const isDone    = state === 'done';
  const isError   = state === 'error';

  const bg = isDone  ? 'var(--color-success)'
           : isError ? 'var(--color-error)'
           : 'var(--color-primary)';

  const label = isDone    ? 'Synchronisé ✓'
              : isError   ? 'Erreur — réessayer'
              : isLoading ? (state === 'saving' ? 'Enregistrement…' : 'Synchronisation…')
              : 'Enregistrer';

  return (
    <button onClick={onClick} disabled={isLoading} style={{
      display: 'inline-flex', alignItems: 'center', gap: '7px',
      padding: '8px 24px', borderRadius: 'var(--radius-sm)',
      background: bg, color: '#fff',
      fontSize: 'var(--text-sm)', fontWeight: 500,
      opacity: isLoading ? 0.85 : 1,
      cursor: isLoading ? 'not-allowed' : 'pointer',
      transition: 'background var(--transition-interactive), opacity var(--transition-interactive)',
      border: 'none', minWidth: '160px', justifyContent: 'center',
    }}>
      {isLoading && <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />}
      {isDone && <Check size={14} />}
      {label}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </button>
  );
}

// ─── Composants utilitaires ───────────────────────────────────────────────────

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-text)' }}>{title}</h2>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginTop: '2px' }}>{description}</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-muted)' }}>{label}</label>
      {children}
    </div>
  );
}

function Toggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 14px', background: 'var(--color-surface)',
      border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    }}>
      <div>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-text)' }}>{label}</div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: '1px' }}>{description}</div>
      </div>
      <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)} style={{
        width: '40px', height: '22px', borderRadius: 'var(--radius-full)',
        background: checked ? 'var(--color-primary)' : 'var(--color-surface-offset)',
        border: '1px solid var(--color-border)', position: 'relative', flexShrink: 0,
        transition: 'background var(--transition-interactive)',
      }}>
        <span style={{
          position: 'absolute', top: '2px', left: checked ? '20px' : '2px',
          width: '16px', height: '16px', borderRadius: '50%', background: '#fff',
          transition: 'left var(--transition-interactive)', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </button>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '7px 10px', fontSize: 'var(--text-sm)',
  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', outline: 'none', width: '100%',
};
const btnOutlineStyle: React.CSSProperties = {
  padding: '6px 14px', fontSize: 'var(--text-xs)', borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--color-border)', background: 'transparent',
  color: 'var(--color-text-muted)', cursor: 'pointer',
};
const cardStyle: React.CSSProperties = {
  padding: '16px', background: 'var(--color-surface)',
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
};
