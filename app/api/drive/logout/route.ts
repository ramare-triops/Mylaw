/**
 * POST /api/drive/logout
 * Supprime le cookie refresh_token pour déconnecter Drive.
 */
import { NextResponse } from 'next/server';

const COOKIE_NAME = 'mylaw_drive_rt';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(COOKIE_NAME);
  return response;
}
