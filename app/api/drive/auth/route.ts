/**
 * POST /api/drive/auth
 * Reçoit le code d'autorisation OAuth depuis le client (PKCE flow).
 * L'échange contre un access_token + refresh_token via l'API Google.
 * Stocke le refresh_token dans un cookie HttpOnly sécurisé.
 * Retourne l'access_token au client pour les appels Drive immédiats.
 */
import { NextRequest, NextResponse } from 'next/server';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const COOKIE_NAME = 'mylaw_drive_rt';
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

    // Échange du code contre les tokens
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

    // Stocke le refresh_token dans un cookie HttpOnly (inaccessible au JS)
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
    console.error('[drive/auth]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
