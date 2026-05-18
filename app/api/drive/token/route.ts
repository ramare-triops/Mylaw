/**
 * GET /api/drive/token
 *
 * Rafraîchit l'access_token Drive. Conservé pour rétro-compatibilité
 * avec le hook `useDriveSync` qui appelle ce chemin au démarrage ;
 * le refresh utilise désormais le cookie unifié `mylaw_google_rt`
 * (avec retombée sur `mylaw_drive_rt` pour les anciennes connexions).
 *
 * Ne supprime le cookie QUE pour `invalid_grant` — les erreurs
 * transitoires laissent l'utilisateur connecté.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  getGoogleAccessToken,
  clearGoogleCookies,
  isFatalRefreshError,
} from '@/lib/google-auth-server';

export async function GET(req: NextRequest) {
  const result = await getGoogleAccessToken(req, 'drive');
  if (result.accessToken) {
    return NextResponse.json({
      access_token: result.accessToken,
      expires_in: result.expiresIn,
    });
  }

  if (result.error === 'no_refresh_token') {
    return NextResponse.json({ error: 'no_refresh_token' }, { status: 401 });
  }

  const response = NextResponse.json(
    { error: result.error ?? 'token_error' },
    { status: 401 },
  );
  if (isFatalRefreshError(result.error)) {
    clearGoogleCookies(response);
  }
  return response;
}
