// app/documents/[docId]/page.tsx
// Page d'édition intégrée dans l'AppShell : sidebar + topbar restent visibles.

'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { db } from '@/lib/db'
import type { Document } from '@/lib/db'
import { AppShell } from '@/components/layout/AppShell'
import { DocumentEditorWrapper } from '@/components/editor/DocumentEditorWrapper'
import { Loader2 } from 'lucide-react'

export default function DocumentEditorPage() {
  const params = useParams()
  const docId = Number(params.docId)

  const [document, setDocument] = useState<Document | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!docId || isNaN(docId)) {
      setError('Identifiant de document invalide.')
      setLoading(false)
      return
    }
    db.documents.get(docId)
      .then((doc) => { if (!doc) setError('Document introuvable.'); else setDocument(doc) })
      .catch(() => setError('Impossible de charger le document.'))
      .finally(() => setLoading(false))
  }, [docId])

  if (loading) return (
    <AppShell>
      <div className="flex items-center justify-center h-full gap-3 text-[var(--color-text-muted)]">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-[var(--text-sm)]">Chargement du document…</span>
      </div>
    </AppShell>
  )

  if (error || !document) return (
    <AppShell>
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <p className="text-[var(--text-base)] text-[var(--color-error)]">{error ?? 'Document introuvable.'}</p>
        <a href="/documents" className="text-[var(--text-sm)] text-[var(--color-primary)] hover:underline">← Retour à la bibliothèque</a>
      </div>
    </AppShell>
  )

  return (
    <AppShell>
      <DocumentEditorWrapper document={document} />
    </AppShell>
  )
}
