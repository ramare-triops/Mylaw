/**
 * POST /api/outlook/auth
 * Échange un code d'autorisation OAuth2 (Microsoft Identity Platform) via PKCE
 * contre un access_token + refresh_token. Les tokens Microsoft Graph
 * permettent de lire la boîte mail principale de l'utilisateur (Mail.Read).
 * Le refresh_token est stocké dans un cookie HttpOnly.
 */
import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'mylaw_outlook_rt';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 90; // 90 jours (durée refresh token MS)

export async function POST(req: NextRequest) {
  try {
    const { code, codeVerifier, redirectUri } = await req.json();
    if (!code || !codeVerifier || !redirectUri) {
      return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 });
    }

    const clientId = process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID;
    const tenant = process.env.NEXT_PUBLIC_MICROSOFT_TENANT || 'common';
    // Note : les applis MSAL SPA n'exigent pas de client secret avec PKCE,
    // mais on en accepte un si l'app est configurée en "Web".
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    if (!clientId) {
      return NextResponse.json({ error: 'Configuration Microsoft manquante' }, { status: 500 });
    }

    const body = new URLSearchParams({
      code,
      client_id: clientId,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
      scope: 'offline_access Mail.Read User.Read',
    });
    if (clientSecret) body.set('client_secret', clientSecret);

    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      },
    );

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
    console.error('[outlook/auth]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
