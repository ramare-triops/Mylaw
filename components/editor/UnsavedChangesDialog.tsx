// components/editor/UnsavedChangesDialog.tsx
// Dialogue de confirmation lorsque l'utilisateur tente de fermer un document non enregistré.

'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, Save, X, Trash2 } from 'lucide-react'

interface UnsavedChangesDialogProps {
  open: boolean
  isSaving: boolean
  documentTitle: string
  onSaveAndClose: () => void
  onDiscardAndClose: () => void
  onCancel: () => void
}

export function UnsavedChangesDialog({
  open,
  isSaving,
  documentTitle,
  onSaveAndClose,
  onDiscardAndClose,
  onCancel,
}: UnsavedChangesDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="
            fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2
            w-full max-w-[440px] mx-4
            bg-[var(--color-surface)] border border-[var(--color-border)]
            rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)]
            p-6
            data-[state=open]:animate-in data-[state=closed]:animate-out
            data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
            data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95
            data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]
            data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]
            duration-150
          "
          aria-describedby="unsaved-desc"
        >
          <div className="flex items-start gap-3 mb-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[var(--color-warning-highlight)] flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-[var(--color-warning)]" strokeWidth={2} />
            </div>
            <div>
              <Dialog.Title className="text-[var(--text-base)] font-semibold text-[var(--color-text)] leading-tight">
                Modifications non enregistrées
              </Dialog.Title>
              <p id="unsaved-desc" className="text-[var(--text-sm)] text-[var(--color-text-muted)] mt-1">
                Le document{' '}
                <span className="font-medium text-[var(--color-text)]">
                  &laquo;&nbsp;{documentTitle || 'Sans titre'}&nbsp;&raquo;
                </span>{' '}
                contient des modifications qui n'ont pas encore été enregistrées.
              </p>
            </div>
          </div>

          <div className="h-px bg-[var(--color-divider)] mb-4" />

          <div className="flex flex-col gap-2">
            <button
              onClick={onSaveAndClose}
              disabled={isSaving}
              className="
                w-full flex items-center justify-center gap-2
                h-9 px-4 rounded-[var(--radius-md)]
                bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]
                text-[var(--color-text-inverse)] text-[var(--text-sm)] font-medium
                transition-colors duration-[var(--transition-interactive)]
                disabled:opacity-60 disabled:cursor-not-allowed
                focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] focus-visible:outline-offset-2
              "
            >
              {isSaving ? (
                <>
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Enregistrement…
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Enregistrer et fermer
                </>
              )}
            </button>

            <button
              onClick={onDiscardAndClose}
              disabled={isSaving}
              className="
                w-full flex items-center justify-center gap-2
                h-9 px-4 rounded-[var(--radius-md)]
                bg-[var(--color-error-highlight)] hover:bg-[var(--color-error-highlight)]/80
                text-[var(--color-error)] text-[var(--text-sm)] font-medium
                transition-colors duration-[var(--transition-interactive)]
                disabled:opacity-60 disabled:cursor-not-allowed
                focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-error)] focus-visible:outline-offset-2
              "
            >
              <Trash2 className="w-4 h-4" />
              Fermer sans enregistrer
            </button>

            <button
              onClick={onCancel}
              className="
                w-full flex items-center justify-center gap-2
                h-9 px-4 rounded-[var(--radius-md)]
                bg-transparent hover:bg-[var(--color-surface-offset)]
                text-[var(--color-text-muted)] text-[var(--text-sm)]
                border border-[var(--color-border)]
                transition-colors duration-[var(--transition-interactive)]
                focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] focus-visible:outline-offset-2
              "
            >
              <X className="w-4 h-4" />
              Annuler — continuer l'édition
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
