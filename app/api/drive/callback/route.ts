/**
 * GET /api/drive/callback
 * Page de retour après l'autorisation Google OAuth.
 * Reçoit le ?code= et ?state= de Google, échange le code contre les tokens
 * via /api/drive/auth, puis redirige vers la page Settings avec un flag de succès.
 */
import { NextRequest, NextResponse } from 'next/server';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const COOKIE_NAME = 'mylaw_drive_rt';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error || !code) {
    return NextResponse.redirect(
      new URL('/settings?drive=error&reason=' + (error ?? 'no_code'), req.url)
    );
  }

  // Récupérer le code_verifier depuis un cookie temporaire de session
  // (On ne peut pas lire sessionStorage côté serveur — on transmet via cookie temporaire)
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

    // Stocker le refresh_token dans un cookie HttpOnly permanent
    response.cookies.set(COOKIE_NAME, tokens.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    });

    // Supprimer les cookies PKCE temporaires
    response.cookies.delete('pkce_verifier');
    response.cookies.delete('pkce_redirect');
    response.cookies.delete('pkce_state');

    return response;
  } catch (err) {
    console.error('[drive/callback]', err);
    return NextResponse.redirect(new URL('/settings?drive=error&reason=server', req.url));
  }
}
