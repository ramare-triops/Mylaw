/**
 * GET /api/google-productivity/callback
 * Retour OAuth Google après consentement Tasks/Calendar. Échange le code
 * contre des tokens en utilisant le code_verifier stocké dans un cookie
 * temporaire, puis pose le refresh_token dans un cookie HttpOnly longue
 * durée et redirige vers `?return=…` mémorisé au démarrage.
 */
import { NextRequest, NextResponse } from 'next/server';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const COOKIE_NAME = 'mylaw_google_productivity_rt';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const state = searchParams.get('state');

  const returnTo = req.cookies.get('gprod_pkce_return')?.value || '/';

  if (error || !code) {
    return NextResponse.redirect(
      new URL(`${returnTo}?gprod=error&reason=${error ?? 'no_code'}`, req.url),
    );
  }

  const verifier = req.cookies.get('gprod_pkce_verifier')?.value;
  const redirectUri = req.cookies.get('gprod_pkce_redirect')?.value;
  const expectedState = req.cookies.get('gprod_pkce_state')?.value;
  if (!verifier || !redirectUri || !expectedState || expectedState !== state) {
    return NextResponse.redirect(new URL(`${returnTo}?gprod=error&reason=missing_pkce`, req.url));
  }

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL(`${returnTo}?gprod=error&reason=config`, req.url));
  }

  try {
    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: verifier,
      }),
    });
    const tokens = await tokenRes.json();
    if (tokens.error || !tokens.refresh_token) {
      return NextResponse.redirect(
        new URL(`${returnTo}?gprod=error&reason=${tokens.error ?? 'no_refresh_token'}`, req.url),
      );
    }

    const response = NextResponse.redirect(new URL(`${returnTo}?gprod=connected`, req.url));
    response.cookies.set(COOKIE_NAME, tokens.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    });
    response.cookies.delete('gprod_pkce_verifier');
    response.cookies.delete('gprod_pkce_redirect');
    response.cookies.delete('gprod_pkce_state');
    response.cookies.delete('gprod_pkce_return');
    return response;
  } catch (err) {
    console.error('[google-productivity/callback]', err);
    return NextResponse.redirect(new URL(`${returnTo}?gprod=error&reason=server`, req.url));
  }
}
