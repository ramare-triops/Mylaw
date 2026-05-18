/**
 * GET /api/drive/callback
 *
 * Page de retour OAuth historique (flow PKCE 100% client-side
 * orchestré par useDriveSync.connect avant l'unification). Conservé
 * pour rétro-compatibilité : si Google nous renvoie ici, on échange
 * le code et on pose le refresh_token dans le cookie UNIFIÉ
 * `mylaw_google_rt`.
 *
 * Le flow standard depuis l'unification passe par
 * /api/google-productivity/start → /callback. Cette route peut être
 * supprimée une fois que tous les clients sont à jour.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  GOOGLE_RT_COOKIE,
  GOOGLE_COOKIE_MAX_AGE,
  LEGACY_DRIVE_COOKIE,
  LEGACY_PROD_COOKIE,
} from '@/lib/google-auth-server';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error || !code) {
    return NextResponse.redirect(
      new URL('/settings?drive=error&reason=' + (error ?? 'no_code'), req.url)
    );
  }

  const codeVerifier = req.cookies.get('pkce_verifier')?.value;
  const redirectUri = req.cookies.get('pkce_redirect')?.value;

  if (!codeVerifier || !redirectUri) {
    return NextResponse.redirect(new URL('/settings?drive=error&reason=missing_pkce', req.url));
  }

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  try {
    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId!,
        client_secret: clientSecret!,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      }),
    });

    const tokens = await tokenRes.json();

    if (tokens.error || !tokens.refresh_token) {
      return NextResponse.redirect(
        new URL('/settings?drive=error&reason=' + (tokens.error ?? 'no_refresh_token'), req.url)
      );
    }

    const response = NextResponse.redirect(new URL('/settings?drive=connected', req.url));

    response.cookies.set(GOOGLE_RT_COOKIE, tokens.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: GOOGLE_COOKIE_MAX_AGE,
      path: '/',
    });
    response.cookies.delete(LEGACY_DRIVE_COOKIE);
    response.cookies.delete(LEGACY_PROD_COOKIE);

    response.cookies.delete('pkce_verifier');
    response.cookies.delete('pkce_redirect');
    response.cookies.delete('pkce_state');

    return response;
  } catch (err) {
    console.error('[drive/callback]', err);
    return NextResponse.redirect(new URL('/settings?drive=error&reason=server', req.url));
  }
}
