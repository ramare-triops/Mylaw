/**
 * POST /api/drive/auth
 *
 * Endpoint d'échange code → tokens pour le flow popup-PKCE
 * client-side. Conservé pour compatibilité ; le flow standard
 * passe par /api/google-productivity/start → /callback.
 *
 * Le refresh token est désormais stocké dans le cookie unifié
 * `mylaw_google_rt` (couvre Drive + Calendar + Tasks).
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  GOOGLE_RT_COOKIE,
  GOOGLE_COOKIE_MAX_AGE,
  LEGACY_DRIVE_COOKIE,
  LEGACY_PROD_COOKIE,
} from '@/lib/google-auth-server';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

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
      response.cookies.set(GOOGLE_RT_COOKIE, tokens.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: GOOGLE_COOKIE_MAX_AGE,
        path: '/',
      });
      response.cookies.delete(LEGACY_DRIVE_COOKIE);
      response.cookies.delete(LEGACY_PROD_COOKIE);
    }

    return response;
  } catch (err) {
    console.error('[drive/auth]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
