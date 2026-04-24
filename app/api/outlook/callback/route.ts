/**
 * GET /api/outlook/callback
 * Reçoit le ?code= de Microsoft Identity, l'échange contre des tokens via
 * le verifier PKCE du cookie temporaire, et pose le refresh_token dans un
 * cookie HttpOnly longue durée.
 */
import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'mylaw_outlook_rt';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 90;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const state = searchParams.get('state');

  const returnTo = req.cookies.get('outlook_pkce_return')?.value || '/';

  if (error || !code) {
    return NextResponse.redirect(
      new URL(`${returnTo}?outlook=error&reason=${error ?? 'no_code'}`, req.url),
    );
  }

  const verifier = req.cookies.get('outlook_pkce_verifier')?.value;
  const redirectUri = req.cookies.get('outlook_pkce_redirect')?.value;
  const expectedState = req.cookies.get('outlook_pkce_state')?.value;
  if (!verifier || !redirectUri || !expectedState || expectedState !== state) {
    return NextResponse.redirect(new URL(`${returnTo}?outlook=error&reason=missing_pkce`, req.url));
  }

  const clientId = process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID;
  const tenant = process.env.NEXT_PUBLIC_MICROSOFT_TENANT || 'common';
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId) {
    return NextResponse.redirect(new URL(`${returnTo}?outlook=error&reason=config`, req.url));
  }

  try {
    const body = new URLSearchParams({
      code,
      client_id: clientId,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: verifier,
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
    if (tokens.error || !tokens.refresh_token) {
      return NextResponse.redirect(
        new URL(`${returnTo}?outlook=error&reason=${tokens.error ?? 'no_refresh_token'}`, req.url),
      );
    }

    const response = NextResponse.redirect(new URL(`${returnTo}?outlook=connected`, req.url));
    response.cookies.set(COOKIE_NAME, tokens.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    });
    response.cookies.delete('outlook_pkce_verifier');
    response.cookies.delete('outlook_pkce_redirect');
    response.cookies.delete('outlook_pkce_state');
    response.cookies.delete('outlook_pkce_return');
    return response;
  } catch (err) {
    console.error('[outlook/callback]', err);
    return NextResponse.redirect(new URL(`${returnTo}?outlook=error&reason=server`, req.url));
  }
}
