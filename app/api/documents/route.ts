import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// These routes act as thin API wrappers.
// All persistence is primarily handled client-side via Dexie.js (IndexedDB).
// These routes exist for server-side operations: export, AI processing, potential future sync.

const createDocSchema = z.object({
  title: z.string().min(1),
  type: z.enum(['draft', 'template', 'note', 'analysis', 'imported']),
  content: z.string().default(''),
  contentRaw: z.string().optional(),
  folderId: z.number().optional(),
  tags: z.array(z.string()).default([]),
  variables: z.record(z.string()).optional(),
  templateId: z.number().optional(),
  sourceFile: z.string().optional(),
  wordCount: z.number().default(0),
});

// POST /api/documents — validation endpoint (actual storage is in IndexedDB client-side)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = createDocSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid document data', details: parsed.error.flatten() }, { status: 400 });
    }
    // Return validated data — client stores in IndexedDB
    return NextResponse.json({ success: true, document: parsed.data });
  } catch (error) {
    console.error('[Documents Route Error]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/documents — health check endpoint
export async function GET() {
  return NextResponse.json({ status: 'ok', message: 'Documents API — data is stored locally in IndexedDB.' });
}
