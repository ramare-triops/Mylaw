/**
 * GET /api/outlook/token
 * Rafraîchit l'access_token Microsoft Graph depuis le refresh_token cookie.
 * Indique au client si la connexion Outlook est active.
 */
import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'mylaw_outlook_rt';

export async function GET(req: NextRequest) {
  try {
    const refreshToken = req.cookies.get(COOKIE_NAME)?.value;
    if (!refreshToken) {
      return NextResponse.json({ error: 'no_refresh_token' }, { status: 401 });
    }

    const clientId = process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID;
    const tenant = process.env.NEXT_PUBLIC_MICROSOFT_TENANT || 'common';
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    if (!clientId) {
      return NextResponse.json({ error: 'Configuration Microsoft manquante' }, { status: 500 });
    }

    const body = new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      grant_type: 'refresh_token',
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
      const response = NextResponse.json({ error: tokens.error }, { status: 401 });
      response.cookies.delete(COOKIE_NAME);
      return response;
    }

    // Microsoft peut rotater le refresh_token — on met à jour le cookie si fourni.
    const response = NextResponse.json({
      access_token: tokens.access_token,
      expires_in: tokens.expires_in,
    });
    if (tokens.refresh_token && tokens.refresh_token !== refreshToken) {
      response.cookies.set(COOKIE_NAME, tokens.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 90,
        path: '/',
      });
    }
    return response;
  } catch (err) {
    console.error('[outlook/token]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
