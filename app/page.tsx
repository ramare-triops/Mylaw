'use client';

import { AppShell } from '@/components/layout/AppShell';
import { Dashboard } from '@/components/dashboard/Dashboard';

export default function Home() {
  return (
    <AppShell>
      <Dashboard />
    </AppShell>
  );
}
