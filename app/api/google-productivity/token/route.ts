/**
 * GET /api/google-productivity/token
 *
 * Rafraîchit l'access_token pour les API Google à partir du refresh
 * token unifié (avec retombée sur les cookies legacy). Utilisé par les
 * pages Agenda, Échéances et Jot pour vérifier la connexion et obtenir
 * un access token frais.
 *
 * Ne supprime le cookie QUE pour les erreurs Google `invalid_grant`
 * (refresh token réellement révoqué). Les erreurs transitoires
 * (réseau, rate limit) renvoient un 401 sans casser la connexion.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  getGoogleAccessToken,
  clearGoogleCookies,
  isFatalRefreshError,
} from '@/lib/google-auth-server';

export async function GET(req: NextRequest) {
  const result = await getGoogleAccessToken(req, 'productivity');
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
