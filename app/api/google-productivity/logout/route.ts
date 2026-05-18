/**
 * POST /api/google-productivity/logout
 * Déconnecte le compte Google de MyLaw : supprime le cookie unifié
 * `mylaw_google_rt` ainsi que les anciens cookies legacy.
 */
import { NextResponse } from 'next/server';
import { clearGoogleCookies } from '@/lib/google-auth-server';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearGoogleCookies(response);
  return response;
}
