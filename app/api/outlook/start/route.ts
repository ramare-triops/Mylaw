/**
 * GET /api/outlook/start?return=/
 * Démarre le flow OAuth2 (Microsoft Identity Platform) avec PKCE pour lire
 * la boîte de réception de l'utilisateur (scope Mail.Read).
 */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';

const SCOPES = 'offline_access Mail.Read User.Read';

function base64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function GET(req: NextRequest) {
  const clientId = process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID;
  const tenant = process.env.NEXT_PUBLIC_MICROSOFT_TENANT || 'common';
  if (!clientId) {
    const returnTo = req.nextUrl.searchParams.get('return') || '/';
    return NextResponse.redirect(new URL(`${returnTo}?outlook=error&reason=config`, req.url));
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  const redirectUri = `${appUrl.replace(/\/$/, '')}/api/outlook/callback`;
  const returnTo = req.nextUrl.searchParams.get('return') || '/';

  const verifier = base64Url(crypto.randomBytes(64));
  const challenge = base64Url(crypto.createHash('sha256').update(verifier).digest());
  const state = base64Url(crypto.randomBytes(24));

  const authz = new URL(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
  );
  authz.searchParams.set('client_id', clientId);
  authz.searchParams.set('response_type', 'code');
  authz.searchParams.set('redirect_uri', redirectUri);
  authz.searchParams.set('response_mode', 'query');
  authz.searchParams.set('scope', SCOPES);
  authz.searchParams.set('code_challenge', challenge);
  authz.searchParams.set('code_challenge_method', 'S256');
  authz.searchParams.set('state', state);
  authz.searchParams.set('prompt', 'select_account');

  const response = NextResponse.redirect(authz.toString());
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 600,
    path: '/',
  };
  response.cookies.set('outlook_pkce_verifier', verifier, cookieOpts);
  response.cookies.set('outlook_pkce_redirect', redirectUri, cookieOpts);
  response.cookies.set('outlook_pkce_state', state, cookieOpts);
  response.cookies.set('outlook_pkce_return', returnTo, cookieOpts);
  return response;
}
