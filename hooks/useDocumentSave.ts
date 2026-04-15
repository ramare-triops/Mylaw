// hooks/useDocumentSave.ts
// Gestion de la sauvegarde avec double persistance : IndexedDB (local) + API serveur (sync multi-appareils)
// Même pattern que les réglages : local-first, puis propagation serveur asynchrone.

import { useState, useCallback, useEffect, useRef } from 'react'
import { db } from '@/lib/db'

export interface SaveState {
  isSaved: boolean
  isSaving: boolean
  lastSavedAt: Date | null
  hasUnsavedChanges: boolean
}

export interface UseDocumentSaveReturn extends SaveState {
  saveNow: (content: string, title?: string) => Promise<void>
  markAsChanged: (content: string) => void
  resetSaveState: () => void
}

/**
 * Hook de sauvegarde pour les documents Mylex.
 *
 * Stratégie de synchronisation (identique aux réglages) :
 * 1. Écriture immédiate dans IndexedDB (toujours disponible, offline-first)
 * 2. Propagation vers l'API serveur (/api/documents/:id) en arrière-plan
 *    → Si le serveur est indisponible, la donnée locale est prioritaire.
 *    → À la prochaine connexion, la version la plus récente (updatedAt) gagne.
 * 3. Auto-save déclenché 2 secondes après la dernière frappe (debounce).
 */
export function useDocumentSave(documentId: number): UseDocumentSaveReturn {
  const [isSaved, setIsSaved] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingContent = useRef<{ content: string; title?: string } | null>(null)
  const isMounted = useRef(true)

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [])

  /**
   * saveNow : sauvegarde synchrone immédiate.
   * Appelée par le bouton "Enregistrer" ou avant fermeture.
   */
  const saveNow = useCallback(
    async (content: string, title?: string) => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current)
        debounceTimer.current = null
      }

      if (!isMounted.current) return
      setIsSaving(true)

      const updatedAt = new Date()

      try {
        // ── 1. Persistance locale IndexedDB ──────────────────────────────
        const updatePayload: Partial<{ content: string; title: string; updatedAt: Date }> = {
          content,
          updatedAt,
        }
        if (title !== undefined) updatePayload.title = title

        await db.documents.update(documentId, updatePayload)

        // ── 2. Synchronisation serveur (même processus que les settings) ─
        //    On ne bloque pas l'UI sur cette étape.
        syncToServer(documentId, { content, title, updatedAt }).catch(() => {
          console.warn('[Mylex] Sync serveur échouée — le document est sauvegardé localement.')
        })

        if (isMounted.current) {
          setIsSaved(true)
          setHasUnsavedChanges(false)
          setLastSavedAt(updatedAt)
          pendingContent.current = null
        }
      } catch (err) {
        console.error('[Mylex] Erreur de sauvegarde locale :', err)
      } finally {
        if (isMounted.current) setIsSaving(false)
      }
    },
    [documentId]
  )

  /**
   * markAsChanged : signale une modification et programme l'auto-save.
   * À appeler à chaque onChange de l'éditeur TipTap.
   */
  const markAsChanged = useCallback(
    (content: string) => {
      pendingContent.current = { content }
      setIsSaved(false)
      setHasUnsavedChanges(true)

      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      debounceTimer.current = setTimeout(() => {
        if (pendingContent.current) {
          saveNow(pendingContent.current.content, pendingContent.current.title)
        }
      }, 2000)
    },
    [saveNow]
  )

  const resetSaveState = useCallback(() => {
    setIsSaved(true)
    setHasUnsavedChanges(false)
    pendingContent.current = null
  }, [])

  return { isSaved, isSaving, lastSavedAt, hasUnsavedChanges, saveNow, markAsChanged, resetSaveState }
}

// ─────────────────────────────────────────────────────────────────────────────
// Synchronisation serveur
// ─────────────────────────────────────────────────────────────────────────────
async function syncToServer(
  documentId: number,
  payload: { content: string; title?: string; updatedAt: Date }
) {
  const response = await fetch(`/api/documents/${documentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      updatedAt: payload.updatedAt.toISOString(),
    }),
  })

  if (!response.ok) {
    throw new Error(`Sync serveur échouée : ${response.status}`)
  }
}
