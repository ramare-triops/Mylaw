/**
 * Authentification Google unifiée — utilisée par toutes les routes
 * /api/drive/*, /api/google-calendar/*, /api/google-tasks/*.
 *
 * Un seul refresh token couvre désormais l'ensemble des intégrations
 * Google : Drive (sauvegarde) + Calendar (agenda) + Tasks. Il est stocké
 * dans un cookie HttpOnly unique (`mylaw_google_rt`).
 *
 * Pour ne pas casser les utilisateurs déjà connectés avec l'ancien
 * système (cookies séparés `mylaw_drive_rt` et
 * `mylaw_google_productivity_rt`), on lit en priorité le cookie unifié
 * puis on retombe sur les cookies legacy.
 */
import type { NextRequest } from 'next/server';

export const GOOGLE_RT_COOKIE = 'mylaw_google_rt';
export const LEGACY_DRIVE_COOKIE = 'mylaw_drive_rt';
export const LEGACY_PROD_COOKIE = 'mylaw_google_productivity_rt';

export const GOOGLE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 an

/**
 * Scopes demandés par le flow unifié. L'ordre n'a pas d'importance pour
 * Google mais on regroupe par produit pour la lisibilité.
 */
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/tasks',
  'openid',
  'email',
].join(' ');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

/**
 * Indique quel scope l'appelant a besoin de couvrir, pour choisir le
 * bon cookie legacy quand le cookie unifié n'est pas (encore) posé.
 *
 * - `drive` : routes /api/drive/*
 * - `productivity` : routes /api/google-calendar/* et /api/google-tasks/*
 * - `any` (défaut) : on prend le premier cookie disponible
 */
export type GoogleService = 'drive' | 'productivity' | 'any';

/**
 * Lit le refresh token disponible. Priorité au cookie unifié (qui
 * couvre tous les scopes). Sinon retombe sur le cookie legacy adapté
 * au service appelant, ce qui préserve la connexion existante des
 * utilisateurs qui n'ont pas encore fait le re-consent unifié.
 */
export function getGoogleRefreshToken(
  req: NextRequest,
  service: GoogleService = 'any',
): string | null {
  const unified = req.cookies.get(GOOGLE_RT_COOKIE)?.value;
  if (unified) return unified;

  const drive = req.cookies.get(LEGACY_DRIVE_COOKIE)?.value;
  const prod = req.cookies.get(LEGACY_PROD_COOKIE)?.value;

  if (service === 'drive') return drive ?? prod ?? null;
  if (service === 'productivity') return prod ?? drive ?? null;
  return drive ?? prod ?? null;
}

export interface RefreshResult {
  /** Access token frais, ou null en cas d'erreur. */
  accessToken: string | null;
  /** Durée de validité (secondes) renvoyée par Google. */
  expiresIn: number | null;
  /**
   * Code d'erreur Google si l'échange a échoué. `invalid_grant` signale
   * un refresh token définitivement révoqué — l'appelant doit alors
   * supprimer les cookies pour que l'utilisateur reconnecte.
   */
  error: string | null;
}

/**
 * Échange un refresh token contre un access token via l'API Google
 * OAuth. Retourne un objet structuré plutôt qu'un simple `string | null`
 * pour que l'appelant distingue erreur fatale (révocation) et erreur
 * transitoire (réseau, rate-limit).
 */
export async function refreshGoogleAccessToken(
  refreshToken: string,
): Promise<RefreshResult> {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { accessToken: null, expiresIn: null, error: 'config_missing' };
  }

  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
      }),
    });
    const data = await res.json().catch(() => ({} as any));
    if (data?.error) {
      return {
        accessToken: null,
        expiresIn: null,
        error: typeof data.error === 'string' ? data.error : 'token_error',
      };
    }
    return {
      accessToken: (data.access_token as string) ?? null,
      expiresIn: typeof data.expires_in === 'number' ? data.expires_in : null,
      error: null,
    };
  } catch {
    return { accessToken: null, expiresIn: null, error: 'network' };
  }
}

/**
 * Erreurs Google qui indiquent un refresh token définitivement
 * invalide (révoqué ou expiré au-delà de la limite Google). Toute
 * autre erreur est considérée comme transitoire et ne doit PAS
 * provoquer la suppression du cookie.
 */
export function isFatalRefreshError(error: string | null): boolean {
  if (!error) return false;
  return error === 'invalid_grant' || error === 'invalid_token';
}

/**
 * Raccourci : obtient un access token directement depuis la requête.
 * Retourne aussi le code d'erreur pour que l'appelant puisse décider
 * d'invalider les cookies ou non.
 *
 * Le paramètre `service` détermine quel cookie legacy interroger
 * quand le cookie unifié n'est pas (encore) posé.
 */
export async function getGoogleAccessToken(
  req: NextRequest,
  service: GoogleService = 'any',
): Promise<RefreshResult> {
  const refreshToken = getGoogleRefreshToken(req, service);
  if (!refreshToken) {
    return { accessToken: null, expiresIn: null, error: 'no_refresh_token' };
  }
  return refreshGoogleAccessToken(refreshToken);
}

/**
 * Supprime tous les cookies Google (unifié + legacy) sur une réponse
 * donnée. Utilisé par les routes /logout et lors d'une révocation
 * détectée (invalid_grant).
 */
export function clearGoogleCookies(response: {
  cookies: {
    delete: (name: string) => void;
  };
}): void {
  response.cookies.delete(GOOGLE_RT_COOKIE);
  response.cookies.delete(LEGACY_DRIVE_COOKIE);
  response.cookies.delete(LEGACY_PROD_COOKIE);
}
