// app/templates/[id]/edit/page.tsx
// Route dédiée à l'édition d'un modèle (accès direct par URL)
'use client'

import { AppShell } from '@/components/layout/AppShell'
import { TemplateLibrary } from '@/components/templates/TemplateLibrary'

// On réutilise TemplateLibrary qui gère en interne la navigation vers l'éditeur.
// Cette page sert de point d'entrée URL si besoin.
export default function TemplateEditPage() {
  return (
    <AppShell>
      <TemplateLibrary />
    </AppShell>
  )
}
