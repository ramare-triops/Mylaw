// app/api/documents/[id]/route.ts
// Route de synchronisation serveur — PATCH pour mettre à jour un document.
// Même pattern de synchronisation que /api/settings :
//   - Validation Zod de l'input
//   - Écriture en base (SQLite via Prisma / Turso en Phase 2)
//   - Stratégie last-write-wins basée sur updatedAt
// En Phase 1, cette route répond 200 sans persistance serveur.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const PatchDocumentSchema = z.object({
  content: z.string().optional(),
  title: z.string().optional(),
  updatedAt: z.string().datetime().optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const docId = Number(params.id)
    if (isNaN(docId)) {
      return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 })
    }

    const body = await request.json()
    const parsed = PatchDocumentSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: parsed.error.flatten() },
        { status: 422 }
      )
    }

    // ── Phase 2 : décommenter pour activer la persistance serveur ────────
    // await prisma.document.upsert({
    //   where: { id: docId },
    //   update: {
    //     ...parsed.data,
    //     updatedAt: parsed.data.updatedAt ? new Date(parsed.data.updatedAt) : new Date(),
    //   },
    //   create: {
    //     id: docId,
    //     ...parsed.data,
    //     createdAt: new Date(),
    //     updatedAt: new Date(),
    //   },
    // })
    // ────────────────────────────────────────────────────────────────────

    return NextResponse.json({
      success: true,
      id: docId,
      syncedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[Mylex API] Erreur sync document :', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const docId = Number(params.id)
  if (isNaN(docId)) {
    return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 })
  }

  // ── Phase 2 : récupération depuis Prisma/Turso ───────────────────────
  // const doc = await prisma.document.findUnique({ where: { id: docId } })
  // if (!doc) return NextResponse.json({ error: 'Document introuvable' }, { status: 404 })
  // return NextResponse.json(doc)

  return NextResponse.json({ message: 'Sync serveur non activée (Phase 1)' }, { status: 501 })
}
