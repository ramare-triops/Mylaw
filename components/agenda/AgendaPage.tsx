'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar as CalendarIcon, RefreshCw, Link as LinkIcon, AlertTriangle } from 'lucide-react';
import { DeadlineTracker } from '@/components/tools/DeadlineTracker';
import {
  ensureMylawCalendarId,
  clearCachedMylawCalendarId,
} from '@/lib/mylaw-calendar';

interface CalendarItem {
  id: string;
  summary: string;
  primary: boolean;
  backgroundColor?: string;
  selected: boolean;
}

const EMBED_BASE = 'https://calendar.google.com/calendar/embed';

/** Couleurs (hex sans #) que l'on cycle pour les `color=` de l'iframe. */
const FALLBACK_COLORS = ['039BE5', '7986CB', '33B679', 'F4511E', 'E67C73'];

function buildEmbedUrl(srcIds: string[], colors: string[]): string {
  if (srcIds.length === 0) return '';
  const params = new URLSearchParams();
  srcIds.forEach((id, i) => {
    params.append('src', id);
    // URLSearchParams encode automatiquement le # en %23 (format attendu
    // par Google Calendar embed).
    const hex = (colors[i] || FALLBACK_COLORS[i % FALLBACK_COLORS.length]).replace('#', '');
    params.append('color', `#${hex}`);
  });
  params.set('ctz', 'Europe/Paris');
  params.set('wkst', '2'); // semaine commençant lundi
  params.set('mode', 'WEEK');
  params.set('showTitle', '0');
  params.set('showPrint', '0');
  params.set('showCalendars', '1');
  params.set('showTabs', '1');
  params.set('showNav', '1');
  params.set('showDate', '1');
  params.set('showTz', '0');
  return `${EMBED_BASE}?${params.toString()}`;
}

export function AgendaPage() {
  const [calendarConnected, setCalendarConnected] = useState<boolean | null>(null);
  const [calendars, setCalendars] = useState<CalendarItem[]>([]);
  const [mylawId, setMylawId] = useState<string | null>(null);
  const [reauthNeeded, setReauthNeeded] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  /** Charge la liste des calendriers + résout l'id du calendrier Mylaw. */
  const refreshCalendars = useCallback(async () => {
    try {
      const tokenRes = await fetch('/api/google-productivity/token');
      const connected = tokenRes.ok;
      setCalendarConnected(connected);
      if (!connected) return;

      // 1) Lookup Mylaw (création à la volée si besoin).
      const mylaw = await ensureMylawCalendarId();
      if (mylaw.reauth) setReauthNeeded(true);
      else setReauthNeeded(false);
      setMylawId(mylaw.id);

      // 2) calendarList pour pouvoir afficher le primary dans l'embed.
      const listRes = await fetch('/api/google-calendar/list');
      if (listRes.status === 401 || listRes.status === 403) {
        setReauthNeeded(true);
        setCalendars([]);
        return;
      }
      if (!listRes.ok) {
        setCalendars([]);
        return;
      }
      const data = await listRes.json();
      setCalendars(Array.isArray(data?.calendars) ? data.calendars : []);
    } catch {
      setCalendarConnected(false);
    }
  }, []);

  useEffect(() => {
    void refreshCalendars();
  }, [refreshCalendars]);

  // Retour OAuth : si on revient avec ?gprod=connected, on rafraîchit.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('gprod') === 'connected') {
      void refreshCalendars();
      sp.delete('gprod');
      sp.delete('reason');
      const clean = sp.toString();
      const url = window.location.pathname + (clean ? '?' + clean : '');
      window.history.replaceState({}, '', url);
    }
  }, [refreshCalendars]);

  function connectCalendar() {
    const returnTo = typeof window !== 'undefined' ? window.location.pathname : '/agenda';
    window.location.href =
      `/api/google-productivity/start?return=${encodeURIComponent(returnTo)}`;
  }

  async function reconnectCalendar() {
    await fetch('/api/google-productivity/logout', { method: 'POST' });
    await clearCachedMylawCalendarId();
    connectCalendar();
  }

  // Construit l'URL d'embed à partir de TOUS les calendriers visibles dans
  // Google Agenda (champ `selected` à true côté calendarList — c'est le
  // même filtre qu'utilise Google par défaut). On force seulement la
  // présence du calendrier « Mylaw » même si l'utilisateur l'a masqué.
  const embedUrl = useMemo(() => {
    const srcIds: string[] = [];
    const colors: string[] = [];

    const seen = new Set<string>();
    const pushCal = (id: string, bg?: string) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      srcIds.push(id);
      colors.push((bg || '#039BE5').replace('#', ''));
    };

    // 1) Mylaw d'abord pour qu'il soit visible et coloré « brand ».
    if (mylawId) {
      const meta = calendars.find((c) => c.id === mylawId);
      pushCal(mylawId, meta?.backgroundColor || '#0B57D0');
    }
    // 2) Tous les autres calendriers que l'utilisateur a cochés dans
    // Google Agenda (EFB, perso, équipe, jours fériés, etc.).
    calendars.forEach((c) => {
      if (c.selected) pushCal(c.id, c.backgroundColor);
    });

    return buildEmbedUrl(srcIds, colors);
  }, [mylawId, calendars]);

  return (
    <div className="flex h-full min-h-0 w-full">
      {/* ── Colonne 2/3 : Google Calendar embed ─────────────────────── */}
      <section
        className="flex flex-1 min-w-0 flex-col border-r"
        style={{
          borderColor: 'var(--color-border)',
          background: 'var(--color-bg)',
          flexBasis: '66.666%',
        }}
      >
        <header
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
        >
          <div className="flex items-center gap-2">
            <CalendarIcon size={18} style={{ color: 'var(--color-primary)' }} />
            <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-text)' }}>
              Agenda
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {calendarConnected && (
              <button
                onClick={() => setRefreshKey((k) => k + 1)}
                title="Rafraîchir l'agenda"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: 'var(--text-xs)',
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--color-surface-offset)',
                  color: 'var(--color-text-muted)',
                  fontWeight: 500,
                }}
              >
                <RefreshCw size={12} /> Rafraîchir
              </button>
            )}
          </div>
        </header>

        {/* Bannière de re-connexion si scope insuffisant. */}
        {calendarConnected && reauthNeeded && (
          <div
            className="flex items-center justify-between gap-3 px-6 py-3 border-b"
            style={{
              background: 'oklch(from var(--color-warning) l c h / 0.08)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)',
              fontSize: 'var(--text-sm)',
            }}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} style={{ color: 'var(--color-warning)' }} />
              <span>
                Reconnectez Google Agenda pour autoriser l'accès au calendrier
                « Mylaw ».
              </span>
            </div>
            <button
              onClick={reconnectCalendar}
              style={{
                fontSize: 'var(--text-xs)',
                padding: '4px 12px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-primary)',
                color: '#fff',
                fontWeight: 500,
              }}
            >
              Reconnecter Google Agenda
            </button>
          </div>
        )}

        <div className="flex-1 min-h-0">
          {calendarConnected === false && (
            <div
              className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <CalendarIcon size={40} style={{ opacity: 0.25 }} />
              <p style={{ fontSize: 'var(--text-base)' }}>
                Connectez Google Agenda pour afficher votre agenda ici.
              </p>
              <button
                onClick={connectCalendar}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--color-primary)',
                  color: '#fff',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 500,
                }}
              >
                <LinkIcon size={14} /> Connecter Google Agenda
              </button>
            </div>
          )}

          {calendarConnected && embedUrl && (
            <iframe
              key={refreshKey}
              title="Google Agenda"
              src={embedUrl}
              className="h-full w-full border-0"
              style={{ background: '#fff' }}
            />
          )}

          {calendarConnected && !embedUrl && !reauthNeeded && (
            <div
              className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <CalendarIcon size={32} style={{ opacity: 0.25 }} />
              <p style={{ fontSize: 'var(--text-sm)' }}>
                Préparation de votre agenda…
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ── Colonne 1/3 : Suivi des délais ──────────────────────────── */}
      <aside
        className="flex min-w-0 flex-col"
        style={{ flexBasis: '33.333%' }}
      >
        <DeadlineTracker />
      </aside>
    </div>
  );
}
