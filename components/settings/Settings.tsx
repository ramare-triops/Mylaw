'use client';

import { useState, useEffect, useRef } from 'react';
import { User, Bell, Palette, Shield, Database, RefreshCw, Loader2, Check } from 'lucide-react';
import { getSetting, setSetting } from '@/lib/db';
import { DriveSyncSection } from './DriveSyncSection';
import { useDrive } from '@/components/providers/DriveSyncProvider';

const SECTIONS = [
  { id: 'profile',       label: 'Profil',           icon: User },
  { id: 'notifications', label: 'Notifications',    icon: Bell },
  { id: 'appearance',    label: 'Apparence',         icon: Palette },
  { id: 'sync',          label: 'Synchronisation',  icon: RefreshCw },
  { id: 'security',      label: 'Sécurité',          icon: Shield },
  { id: 'data',          label: 'Données',            icon: Database },
];

type Profile    = { firstName: string; lastName: string; email: string; barreau: string; cabinet: string; phone: string };
type Notifs     = { emailAlerts: boolean; deadlineReminders: boolean; newDocuments: boolean; weeklyDigest: boolean };
type Appearance = { theme: string; fontSize: string; compactMode: boolean };

const DEFAULT_PROFILE:    Profile    = { firstName: '', lastName: '', email: '', barreau: '', cabinet: '', phone: '' };
const DEFAULT_NOTIFS:     Notifs     = { emailAlerts: true, deadlineReminders: true, newDocuments: false, weeklyDigest: true };
const DEFAULT_APPEARANCE: Appearance = { theme: 'system', fontSize: 'medium', compactMode: false };

// États possibles du bouton Enregistrer
type SaveState = 'idle' | 'saving' | 'syncing' | 'done' | 'error';

export function Settings() {
  const [activeSection, setActiveSection] = useState('profile');
  const [loading, setLoading]             = useState(true);
  const [saveState, setSaveState]         = useState<SaveState>('idle');
  const doneTimer                         = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { status: driveStatus } = useDrive();

  const [profile,    setProfile]    = useState<Profile>(DEFAULT_PROFILE);
  const [notifs,     setNotifs]     = useState<Notifs>(DEFAULT_NOTIFS);
  const [appearance, setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE);

  useEffect(() => {
    async function load() {
      const [p, n, a] = await Promise.all([
        getSetting<Profile>('profile', DEFAULT_PROFILE),
        getSetting<Notifs>('notifications', DEFAULT_NOTIFS),
        getSetting<Appearance>('appearance', DEFAULT_APPEARANCE),
      ]);
      setProfile(p); setNotifs(n); setAppearance(a);
      setLoading(false);
    }
    load();
  }, []);

  // Suit le statut Drive pour mettre à jour le bouton après le clic Enregistrer
  useEffect(() => {
    if (saveState === 'idle' || saveState === 'done' || saveState === 'error') return;

    if (driveStatus === 'syncing') {
      setSaveState('syncing');
    } else if (driveStatus === 'connected' && saveState === 'syncing') {
      // Le sync vient de se terminer avec succès
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
      ]);
      // Le middleware Dexie déclenche scheduleSync automatiquement.
      // Si Drive n'est pas connecté, on passe directement en "done" local.
      if (driveStatus === 'idle' || driveStatus === 'disconnected') {
        setSaveState('done');
        if (doneTimer.current) clearTimeout(doneTimer.current);
        doneTimer.current = setTimeout(() => setSaveState('idle'), 2500);
      }
      // Sinon on attend l'effet qui surveille driveStatus → 'syncing' → 'connected'
    } catch {
      setSaveState('error');
      doneTimer.current = setTimeout(() => setSaveState('idle'), 3000);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center"
        style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
        Chargement…
      </div>
    );
  }

  return (
    <div className="flex h-full"
      style={{ background: 'var(--color-bg)', fontFamily: 'var(--font-body, Inter, sans-serif)' }}>

      {/* Sidebar */}
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
      <div className="flex-1 overflow-y-auto p-8" style={{ maxWidth: '640px' }}>

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

        {['profile', 'notifications', 'appearance'].includes(activeSection) && (
          <div style={{ marginTop: '24px' }}>
            <SaveButton state={saveState} onClick={handleSave} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Bouton Enregistrer avec états visuels ────────────────────────────────────

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
    <button
      onClick={onClick}
      disabled={isLoading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '7px',
        padding: '8px 24px',
        borderRadius: 'var(--radius-sm)',
        background: bg,
        color: '#fff',
        fontSize: 'var(--text-sm)',
        fontWeight: 500,
        opacity: isLoading ? 0.85 : 1,
        cursor: isLoading ? 'not-allowed' : 'pointer',
        transition: 'background var(--transition-interactive), opacity var(--transition-interactive)',
        border: 'none',
        minWidth: '160px',
        justifyContent: 'center',
      }}
    >
      {isLoading && (
        <Loader2
          size={14}
          style={{ animation: 'spin 0.8s linear infinite' }}
        />
      )}
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
