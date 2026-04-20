'use client';

import { AppShell } from '@/components/layout/AppShell';
import { DossierList } from '@/components/dossiers/DossierList';

export default function DossiersPage() {
  return (
    <AppShell>
      <DossierList />
    </AppShell>
  );
}
