// hooks/useDocumentSave.ts
// Sauvegarde double persistance : IndexedDB (local-first) + API serveur (sync).
// Le délai d'auto-save est maintenant paramétrable depuis les préférences éditeur.

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
 * @param documentId   ID du document dans IndexedDB
 * @param autoSaveDelay  Délai en ms avant auto-save (0 = désactivé). Défaut: 2000 ms.
 */
export function useDocumentSave(documentId: number, autoSaveDelay = 2000): UseDocumentSaveReturn {
  const [isSaved,            setIsSaved]            = useState(true)
  const [isSaving,           setIsSaving]           = useState(false)
  const [lastSavedAt,        setLastSavedAt]        = useState<Date | null>(null)
  const [hasUnsavedChanges,  setHasUnsavedChanges]  = useState(false)

  const debounceTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingContent = useRef<{ content: string; title?: string } | null>(null)
  const isMounted      = useRef(true)
  // Garde une référence stable au délai pour éviter de redéclarer markAsChanged
  const autoSaveDelayRef = useRef(autoSaveDelay)

  useEffect(() => { autoSaveDelayRef.current = autoSaveDelay }, [autoSaveDelay])

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [])

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
        const updatePayload: Partial<{ content: string; title: string; updatedAt: Date }> = { content, updatedAt }
        if (title !== undefined) updatePayload.title = title
        await db.documents.update(documentId, updatePayload)

        syncToServer(documentId, { content, title, updatedAt }).catch(() => {
          console.warn('[Mylex] Sync serveur échouée — document sauvegardé localement.')
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

  const markAsChanged = useCallback(
    (content: string) => {
      pendingContent.current = { content }
      setIsSaved(false)
      setHasUnsavedChanges(true)

      if (debounceTimer.current) clearTimeout(debounceTimer.current)

      // Si autoSaveDelay === 0, pas d'auto-save
      if (autoSaveDelayRef.current <= 0) return

      debounceTimer.current = setTimeout(() => {
        if (pendingContent.current) {
          saveNow(pendingContent.current.content, pendingContent.current.title)
        }
      }, autoSaveDelayRef.current)
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

async function syncToServer(
  documentId: number,
  payload: { content: string; title?: string; updatedAt: Date }
) {
  const response = await fetch(`/api/documents/${documentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, updatedAt: payload.updatedAt.toISOString() }),
  })
  if (!response.ok) throw new Error(`Sync serveur échouée : ${response.status}`)
}
