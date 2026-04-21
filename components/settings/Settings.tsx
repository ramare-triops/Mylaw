'use client';

import { useState, useEffect, useRef } from 'react';
import { User, Bell, Palette, Shield, Database, RefreshCw, Loader2, Check, FileText, Download, Trash2, Briefcase } from 'lucide-react';
import { db, getSetting, setSetting } from '@/lib/db';
import { DriveSyncSection } from './DriveSyncSection';
import { useDrive } from '@/components/providers/DriveSyncProvider';
import { buildBackup } from '@/lib/drive-merge';
import {
  CABINET_IDENTITY_KEY,
  type CabinetIdentity as CabinetIdentityExt,
} from '@/lib/cabinet-identity';

const SECTIONS = [
  { id: 'profile',       label: 'Profil',           icon: User },
  { id: 'cabinet',       label: 'Cabinet',           icon: Briefcase },
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

type CabinetIdentity = CabinetIdentityExt;

const DEFAULT_CABINET: CabinetIdentity = {
  civility:          '',
  firstName:         '',
  lastName:          '',
  birthDate:         '',
  birthPlace:        '',
  nationality:       '',
  profession:        'Avocat',
  barreau:           '',
  cabinet:           '',
  structureType:     '',
  capital:           '',
  siret:             '',
  rcs:               '',
  rcsCity:           '',
  vatNumber:         '',
  toque:             '',
  email:             '',
  phone:             '',
  fax:               '',
  website:           '',
  addressStreet:     '',
  addressComplement: '',
  addressPostalCode: '',
  addressCity:       '',
  addressCountry:    'France',
};

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
  defaultZoom:      number;
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
  defaultZoom:      100,
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
const ZOOM_LEVELS = [
  { label: '50 %',  value: 50 },
  { label: '75 %',  value: 75 },
  { label: '90 %',  value: 90 },
  { label: '100 % (normal)', value: 100 },
  { label: '110 %', value: 110 },
  { label: '125 %', value: 125 },
  { label: '150 %', value: 150 },
  { label: '175 %', value: 175 },
  { label: '200 %', value: 200 },
];

type SaveState = 'idle' | 'saving' | 'syncing' | 'done' | 'error';

export function Settings() {
  const [activeSection, setActiveSection] = useState('profile');
  const [loading, setLoading]             = useState(true);
  const [saveState, setSaveState]         = useState<SaveState>('idle');
  const doneTimer                         = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevDriveStatus                   = useRef<string>('');

  const { status: driveStatus } = useDrive();

  const [profile,      setProfile]      = useState<Profile>(DEFAULT_PROFILE);
  const [cabinet,      setCabinet]      = useState<CabinetIdentity>(DEFAULT_CABINET);
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
    const [p, c, n, a, e] = await Promise.all([
      getSetting<Profile>('profile', DEFAULT_PROFILE),
      getSetting<CabinetIdentity>(CABINET_IDENTITY_KEY, DEFAULT_CABINET),
      getSetting<Notifs>('notifications', DEFAULT_NOTIFS),
      getSetting<Appearance>('appearance', DEFAULT_APPEARANCE),
      getSetting<EditorPrefs>('editorPrefs', DEFAULT_EDITOR_PREFS),
    ]);
    // Fusion des champs Profil dans Cabinet au premier chargement : les
    // utilisateurs existants retrouvent leur nom/prénom/email/phone sans
    // avoir à les ressaisir. `p` a priorité sur `c` quand `c` est vide,
    // pour garantir la reprise propre.
    const merged: CabinetIdentity = {
      ...DEFAULT_CABINET,
      ...c,
      firstName: c.firstName || p.firstName,
      lastName:  c.lastName  || p.lastName,
      email:     c.email     || p.email,
      phone:     c.phone     || p.phone,
      barreau:   c.barreau   || p.barreau,
      cabinet:   c.cabinet   || p.cabinet,
    };
    setProfile(p); setCabinet(merged); setNotifs(n); setAppearance(a); setEditorPrefs(e);
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
        setSetting(CABINET_IDENTITY_KEY, cabinet),
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

        {activeSection === 'cabinet' && (
          <>
            <Section title="Identité de l'avocat" description="Fiche d'intervenant personnelle — sert à remplir le bloc « Avocat du cabinet » des modèles quand aucun intervenant ownCounsel n'est renseigné dans le dossier.">
              <Field label="Civilité">
                <select style={inputStyle} value={cabinet.civility} onChange={e => setCabinet(c => ({ ...c, civility: e.target.value }))}>
                  <option value="">—</option>
                  <option value="M.">M.</option>
                  <option value="Mme">Mme</option>
                </select>
              </Field>
              <Field label="Prénom"><input style={inputStyle} value={cabinet.firstName} onChange={e => setCabinet(c => ({ ...c, firstName: e.target.value }))} placeholder="Jean" /></Field>
              <Field label="Nom"><input style={inputStyle} value={cabinet.lastName} onChange={e => setCabinet(c => ({ ...c, lastName: e.target.value }))} placeholder="Dupont" /></Field>
              <Field label="Date de naissance"><input style={inputStyle} type="date" value={cabinet.birthDate} onChange={e => setCabinet(c => ({ ...c, birthDate: e.target.value }))} /></Field>
              <Field label="Lieu de naissance"><input style={inputStyle} value={cabinet.birthPlace} onChange={e => setCabinet(c => ({ ...c, birthPlace: e.target.value }))} placeholder="Paris" /></Field>
              <Field label="Nationalité"><input style={inputStyle} value={cabinet.nationality} onChange={e => setCabinet(c => ({ ...c, nationality: e.target.value }))} placeholder="française" /></Field>
              <Field label="Profession"><input style={inputStyle} value={cabinet.profession} onChange={e => setCabinet(c => ({ ...c, profession: e.target.value }))} placeholder="Avocat" /></Field>
            </Section>

            <div style={{ height: '24px' }} />

            <Section title="Structure d'exercice" description="Informations portées sur la première page des assignations, conclusions, conventions d'honoraires.">
              <Field label="Barreau d'inscription"><input style={inputStyle} value={cabinet.barreau} onChange={e => setCabinet(c => ({ ...c, barreau: e.target.value }))} placeholder="Paris" /></Field>
              <Field label="Toque / Palais"><input style={inputStyle} value={cabinet.toque} onChange={e => setCabinet(c => ({ ...c, toque: e.target.value }))} placeholder="P123" /></Field>
              <Field label="Nom du cabinet / raison sociale"><input style={inputStyle} value={cabinet.cabinet} onChange={e => setCabinet(c => ({ ...c, cabinet: e.target.value }))} placeholder="SELARL Dupont & Associés" /></Field>
              <Field label="Forme juridique"><input style={inputStyle} value={cabinet.structureType} onChange={e => setCabinet(c => ({ ...c, structureType: e.target.value }))} placeholder="SELARL / SELAS / AARPI / EI…" /></Field>
              <Field label="Capital social"><input style={inputStyle} value={cabinet.capital} onChange={e => setCabinet(c => ({ ...c, capital: e.target.value }))} placeholder="10 000 €" /></Field>
              <Field label="SIRET"><input style={inputStyle} value={cabinet.siret} onChange={e => setCabinet(c => ({ ...c, siret: e.target.value }))} placeholder="123 456 789 00012" /></Field>
              <Field label="Numéro RCS"><input style={inputStyle} value={cabinet.rcs} onChange={e => setCabinet(c => ({ ...c, rcs: e.target.value }))} placeholder="Paris B 123 456 789" /></Field>
              <Field label="Ville du RCS"><input style={inputStyle} value={cabinet.rcsCity} onChange={e => setCabinet(c => ({ ...c, rcsCity: e.target.value }))} placeholder="Paris" /></Field>
              <Field label="Numéro de TVA"><input style={inputStyle} value={cabinet.vatNumber} onChange={e => setCabinet(c => ({ ...c, vatNumber: e.target.value }))} placeholder="FR12345678901" /></Field>
            </Section>

            <div style={{ height: '24px' }} />

            <Section title="Coordonnées" description="">
              <Field label="Email"><input style={inputStyle} type="email" value={cabinet.email} onChange={e => setCabinet(c => ({ ...c, email: e.target.value }))} placeholder="jean.dupont@cabinet.fr" /></Field>
              <Field label="Téléphone"><input style={inputStyle} value={cabinet.phone} onChange={e => setCabinet(c => ({ ...c, phone: e.target.value }))} placeholder="+33 1 00 00 00 00" /></Field>
              <Field label="Fax"><input style={inputStyle} value={cabinet.fax} onChange={e => setCabinet(c => ({ ...c, fax: e.target.value }))} placeholder="+33 1 00 00 00 01" /></Field>
              <Field label="Site web"><input style={inputStyle} value={cabinet.website} onChange={e => setCabinet(c => ({ ...c, website: e.target.value }))} placeholder="https://cabinet.fr" /></Field>
            </Section>

            <div style={{ height: '24px' }} />

            <Section title="Adresse postale du cabinet" description="">
              <Field label="Rue"><input style={inputStyle} value={cabinet.addressStreet} onChange={e => setCabinet(c => ({ ...c, addressStreet: e.target.value }))} placeholder="12 rue de la Paix" /></Field>
              <Field label="Complément"><input style={inputStyle} value={cabinet.addressComplement} onChange={e => setCabinet(c => ({ ...c, addressComplement: e.target.value }))} placeholder="Bâtiment A, 3e étage" /></Field>
              <Field label="Code postal"><input style={inputStyle} value={cabinet.addressPostalCode} onChange={e => setCabinet(c => ({ ...c, addressPostalCode: e.target.value }))} placeholder="75001" /></Field>
              <Field label="Ville"><input style={inputStyle} value={cabinet.addressCity} onChange={e => setCabinet(c => ({ ...c, addressCity: e.target.value }))} placeholder="Paris" /></Field>
              <Field label="Pays"><input style={inputStyle} value={cabinet.addressCountry} onChange={e => setCabinet(c => ({ ...c, addressCountry: e.target.value }))} placeholder="France" /></Field>
            </Section>
          </>
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
            <Section title="Mise en page" description="Dimensions, marges et affichage de la page A4">
              <Field label="Marges de page">
                <select style={inputStyle} value={editorPrefs.pageMargin} onChange={e => setEp({ pageMargin: e.target.value })}>
                  {PAGE_MARGINS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </Field>
              <Field label="Zoom par défaut à l'ouverture">
                <select
                  style={inputStyle}
                  value={editorPrefs.defaultZoom ?? 100}
                  onChange={e => setEp({ defaultZoom: Number(e.target.value) })}
                >
                  {ZOOM_LEVELS.map(z => (
                    <option key={z.value} value={z.value}>{z.label}</option>
                  ))}
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
          <Section title="Sécurité" description="Gestion du compte Google associé à l'application">
            <div style={cardStyle}>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-text)', marginBottom: '4px' }}>Compte Google</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: '12px', lineHeight: 1.6 }}>
                MyLaw s&apos;appuie sur votre compte Google pour la connexion et le stockage sur Drive.
                Le mot de passe et la double authentification (2FA) sont gérés directement par Google.
              </div>
              <a
                href="https://myaccount.google.com/security"
                target="_blank"
                rel="noopener noreferrer"
                style={{ ...btnOutlineStyle, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Shield size={13} /> Gérer la sécurité Google
              </a>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-text)', marginBottom: '4px' }}>Révoquer l&apos;accès de MyLaw</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: '12px', lineHeight: 1.6 }}>
                Retire l&apos;autorisation Drive accordée à l&apos;application. Vos données locales restent intactes ;
                vous devrez vous reconnecter pour reprendre la synchronisation.
              </div>
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
                style={{ ...btnOutlineStyle, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Shield size={13} /> Autorisations Google
              </a>
            </div>
          </Section>
        )}

        {activeSection === 'data' && (
          <DataSection />
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

// ─── Data section : export JSON + suppression locale ──────────────────────
// L'export appelle buildBackup() (même payload que la sync Drive) et déclenche
// un téléchargement navigateur. La suppression vide toutes les tables Dexie
// user-editable après double confirmation.
function DataSection() {
  const [exporting, setExporting]         = useState(false);
  const [deleting,  setDeleting]          = useState(false);
  const [confirmStep, setConfirmStep]     = useState<0 | 1 | 2>(0);
  const [error, setError]                 = useState<string | null>(null);

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    setError(null);
    try {
      const backup = await buildBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      a.download = `mylaw-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.message ?? 'Échec de l’export');
    } finally {
      setExporting(false);
    }
  }

  async function handleDeleteAll() {
    if (deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await Promise.all([
        db.documents.clear(),
        db.folders.clear(),
        db.table('snippets').clear(),
        db.table('deadlines').clear(),
        db.table('templates').clear(),
        db.table('tools').clear(),
        db.table('aiChats').clear(),
        db.table('bricks').clear(),
        db.table('infoLabels').clear(),
        db.table('sessions').clear(),
        db.history.clear(),
      ]);
      // Supprime aussi les settings utilisateur (mais PAS les flags de sync,
      // qui seront réinitialisés naturellement).
      const rows = await db.settings.toArray();
      const toDelete = rows
        .map(r => r.key)
        .filter(k => !['drive_connected', 'last_synced_at', 'last_sync_error', 'last_sync_success_at'].includes(k));
      await db.settings.bulkDelete(toDelete);
      setConfirmStep(0);
      // Recharge la page pour remettre l'interface à zéro proprement
      if (typeof window !== 'undefined') window.location.reload();
    } catch (e: any) {
      setError(e?.message ?? 'Échec de la suppression');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Section title="Données" description="Exportez ou effacez vos données locales">
      <div style={cardStyle}>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-text)', marginBottom: '4px' }}>
          Exporter mes données
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: '12px', lineHeight: 1.6 }}>
          Télécharge une copie complète (JSON) : documents, dossiers, modèles, briques, étiquettes,
          échéances, paramètres. Même format que la sauvegarde Drive.
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          style={{ ...btnOutlineStyle, display: 'inline-flex', alignItems: 'center', gap: '6px', opacity: exporting ? 0.7 : 1, cursor: exporting ? 'wait' : 'pointer' }}
        >
          {exporting
            ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />
            : <Download size={13} />}
          {exporting ? 'Préparation…' : 'Exporter en JSON'}
        </button>
      </div>

      <div style={{ ...cardStyle, border: '1px solid var(--color-error)' }}>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-error)', marginBottom: '4px' }}>
          Zone dangereuse
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: '12px', lineHeight: 1.6 }}>
          Efface <strong>toutes</strong> vos données locales (documents, briques, échéances, paramètres…).
          <br />
          Si la synchronisation Drive est active, elle propagera la suppression sur vos autres appareils.
          <br />
          <span style={{ color: 'var(--color-error)' }}>Cette action est irréversible.</span>
        </div>

        {confirmStep === 0 && (
          <button
            onClick={() => setConfirmStep(1)}
            style={{ ...btnOutlineStyle, borderColor: 'var(--color-error)', color: 'var(--color-error)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Trash2 size={13} /> Supprimer mes données
          </button>
        )}
        {confirmStep === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-error)', fontWeight: 600 }}>
              Confirmer la suppression ? Avez-vous exporté vos données au préalable ?
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setConfirmStep(2)}
                style={{ padding: '6px 14px', fontSize: 'var(--text-xs)', borderRadius: 'var(--radius-sm)', background: 'var(--color-error)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}
              >
                Oui, continuer
              </button>
              <button
                onClick={() => setConfirmStep(0)}
                style={btnOutlineStyle}
              >
                Annuler
              </button>
            </div>
          </div>
        )}
        {confirmStep === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-error)', fontWeight: 600 }}>
              Dernière confirmation : toutes les données locales vont être effacées.
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleDeleteAll}
                disabled={deleting}
                style={{ padding: '6px 14px', fontSize: 'var(--text-xs)', borderRadius: 'var(--radius-sm)', background: 'var(--color-error)', color: '#fff', border: 'none', cursor: deleting ? 'wait' : 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px', opacity: deleting ? 0.7 : 1 }}
              >
                {deleting && <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />}
                {deleting ? 'Suppression…' : 'Tout supprimer définitivement'}
              </button>
              <button onClick={() => setConfirmStep(0)} style={btnOutlineStyle} disabled={deleting}>
                Annuler
              </button>
            </div>
          </div>
        )}

        {error && (
          <div style={{ marginTop: '10px', fontSize: 'var(--text-xs)', color: 'var(--color-error)' }}>
            {error}
          </div>
        )}
      </div>
    </Section>
  );
}
