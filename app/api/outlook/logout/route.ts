import { NextResponse } from 'next/server';
const COOKIE_NAME = 'mylaw_outlook_rt';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(COOKIE_NAME);
  return response;
}
