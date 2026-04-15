/**
 * GET /api/drive/token
 * Rafraîchit l'access_token à partir du refresh_token stocké dans le cookie.
 * Appelé au démarrage de l'app et quand l'access_token expire.
 * Retourne un nouvel access_token sans aucune interaction utilisateur.
 */
import { NextRequest, NextResponse } from 'next/server';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const COOKIE_NAME = 'mylaw_drive_rt';

export async function GET(req: NextRequest) {
  try {
    const refreshToken = req.cookies.get(COOKIE_NAME)?.value;

    if (!refreshToken) {
      return NextResponse.json({ error: 'no_refresh_token' }, { status: 401 });
    }

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: 'Configuration serveur manquante' }, { status: 500 });
    }

    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
      }),
    });

    const tokens = await tokenRes.json();

    if (tokens.error) {
      // Refresh token révoqué ou expiré — on supprime le cookie
      const response = NextResponse.json({ error: tokens.error }, { status: 401 });
      response.cookies.delete(COOKIE_NAME);
      return response;
    }

    return NextResponse.json({
      access_token: tokens.access_token,
      expires_in: tokens.expires_in,
    });
  } catch (err) {
    console.error('[drive/token]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
