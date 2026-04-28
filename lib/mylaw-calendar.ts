/**
 * Helpers partagés autour du calendrier Google « Mylaw » (créé / résolu
 * via /api/google-calendar/mylaw-calendar). L'identifiant est mis en
 * cache dans la table `settings` pour ne pas re-interroger l'API à
 * chaque utilisation.
 */
import { getSetting, setSetting } from '@/lib/db';

export const MYLAW_CAL_SETTING = 'mylaw_google_calendar_id_v1';

export interface MylawCalendarLookup {
  /** Identifiant du calendrier dédié, ou `null` si indisponible. */
  id: string | null;
  /**
   * Vrai quand l'API a renvoyé 401/403 — l'utilisateur est connecté à
   * Google mais avec un scope insuffisant ; il doit reconnecter Google
   * Agenda pour autoriser le scope `calendar` complet.
   */
  reauth: boolean;
}

export async function getCachedMylawCalendarId(): Promise<string> {
  return getSetting<string>(MYLAW_CAL_SETTING, '');
}

export async function clearCachedMylawCalendarId(): Promise<void> {
  await setSetting(MYLAW_CAL_SETTING, '');
}

/**
 * Renvoie l'id du calendrier « Mylaw », en interrogeant l'API si l'on
 * n'a rien en cache. Crée le calendrier au passage si nécessaire.
 */
export async function ensureMylawCalendarId(): Promise<MylawCalendarLookup> {
  const cached = await getCachedMylawCalendarId();
  if (cached) return { id: cached, reauth: false };
  try {
    const res = await fetch('/api/google-calendar/mylaw-calendar');
    if (res.status === 401 || res.status === 403) {
      return { id: null, reauth: true };
    }
    if (!res.ok) return { id: null, reauth: false };
    const data = await res.json();
    const id = (data?.calendarId as string) || '';
    if (id) await setSetting(MYLAW_CAL_SETTING, id);
    return { id: id || null, reauth: false };
  } catch {
    return { id: null, reauth: false };
  }
}
