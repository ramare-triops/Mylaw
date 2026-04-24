/**
 * GET /api/google-productivity/start?return=/
 * Démarre le flow OAuth PKCE pour les scopes Google Tasks + Calendar.
 * Génère un code_verifier, pose un cookie temporaire, puis 302 vers
 * le endpoint d'autorisation Google. Le retour est géré par /callback.
 */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';

const AUTHZ_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPES = [
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ');

function base64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function GET(req: NextRequest) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'Configuration serveur manquante' }, { status: 500 });
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  const redirectUri = `${appUrl.replace(/\/$/, '')}/api/google-productivity/callback`;
  const returnTo = req.nextUrl.searchParams.get('return') || '/';

  const verifier = base64Url(crypto.randomBytes(64));
  const challenge = base64Url(crypto.createHash('sha256').update(verifier).digest());
  const state = base64Url(crypto.randomBytes(24));

  const authz = new URL(AUTHZ_URL);
  authz.searchParams.set('client_id', clientId);
  authz.searchParams.set('redirect_uri', redirectUri);
  authz.searchParams.set('response_type', 'code');
  authz.searchParams.set('scope', SCOPES);
  authz.searchParams.set('code_challenge', challenge);
  authz.searchParams.set('code_challenge_method', 'S256');
  authz.searchParams.set('access_type', 'offline');
  authz.searchParams.set('prompt', 'consent');
  authz.searchParams.set('state', state);

  const response = NextResponse.redirect(authz.toString());
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 600,
    path: '/',
  };
  response.cookies.set('gprod_pkce_verifier', verifier, cookieOpts);
  response.cookies.set('gprod_pkce_redirect', redirectUri, cookieOpts);
  response.cookies.set('gprod_pkce_state', state, cookieOpts);
  response.cookies.set('gprod_pkce_return', returnTo, cookieOpts);
  return response;
}
