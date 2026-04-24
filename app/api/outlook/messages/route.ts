/**
 * GET /api/outlook/messages?top=6
 * Renvoie les derniers emails reçus (Inbox). Rafraîchit silencieusement
 * l'access_token depuis le cookie HttpOnly avant d'interroger Microsoft Graph.
 */
import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'mylaw_outlook_rt';

async function getAccessToken(req: NextRequest): Promise<string | null> {
  const refreshToken = req.cookies.get(COOKIE_NAME)?.value;
  if (!refreshToken) return null;
  const clientId = process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID;
  const tenant = process.env.NEXT_PUBLIC_MICROSOFT_TENANT || 'common';
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId) return null;
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    grant_type: 'refresh_token',
    scope: 'offline_access Mail.Read User.Read',
  });
  if (clientSecret) body.set('client_secret', clientSecret);
  const res = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    },
  );
  const tokens = await res.json();
  if (tokens.error) return null;
  return tokens.access_token as string;
}

export async function GET(req: NextRequest) {
  const access = await getAccessToken(req);
  if (!access) return NextResponse.json({ error: 'not_connected' }, { status: 401 });
  const top = Math.min(Number(req.nextUrl.searchParams.get('top') ?? '6') || 6, 25);
  const url =
    `https://graph.microsoft.com/v1.0/me/messages` +
    `?$top=${top}&$orderby=receivedDateTime desc` +
    `&$select=id,subject,from,receivedDateTime,isRead,bodyPreview,webLink`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${access}` },
  });
  if (!res.ok) {
    return NextResponse.json({ error: 'graph_fetch_failed' }, { status: res.status });
  }
  const data = await res.json();
  const messages = (data.value ?? []).map((m: any) => ({
    id: m.id,
    subject: m.subject || '(sans objet)',
    from: m.from?.emailAddress?.name || m.from?.emailAddress?.address || '—',
    fromAddress: m.from?.emailAddress?.address || '',
    receivedAt: m.receivedDateTime,
    isRead: !!m.isRead,
    preview: m.bodyPreview || '',
    webLink: m.webLink || null,
  }));
  return NextResponse.json({ messages });
}
