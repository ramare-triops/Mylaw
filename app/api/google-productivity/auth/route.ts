/**
 * POST /api/google-productivity/auth
 * Échange un code d'autorisation OAuth PKCE contre un access_token + refresh_token
 * pour les scopes Google Tasks + Google Calendar. Ce flow est distinct de
 * /api/drive/auth : chaque intégration a son cookie propre pour éviter qu'une
 * révocation utilisateur sur Drive n'emporte Tasks/Calendar et inversement.
 */
import { NextRequest, NextResponse } from 'next/server';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const COOKIE_NAME = 'mylaw_google_productivity_rt';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 an

export async function POST(req: NextRequest) {
  try {
    const { code, codeVerifier, redirectUri } = await req.json();
    if (!code || !codeVerifier || !redirectUri) {
      return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 });
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
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      }),
    });

    const tokens = await tokenRes.json();
    if (tokens.error) {
      return NextResponse.json({ error: tokens.error_description ?? tokens.error }, { status: 400 });
    }

    const response = NextResponse.json({
      access_token: tokens.access_token,
      expires_in: tokens.expires_in,
    });
    if (tokens.refresh_token) {
      response.cookies.set(COOKIE_NAME, tokens.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: COOKIE_MAX_AGE,
        path: '/',
      });
    }
    return response;
  } catch (err) {
    console.error('[google-productivity/auth]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
