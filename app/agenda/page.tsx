'use client';

import { AppShell } from '@/components/layout/AppShell';
import { AgendaPage } from '@/components/agenda/AgendaPage';

export default function Agenda() {
  return (
    <AppShell>
      <AgendaPage />
    </AppShell>
  );
}
