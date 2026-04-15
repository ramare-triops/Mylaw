'use client';

import { AppShell } from '@/components/layout/AppShell';
import { AIInterface } from '@/components/ai/AIInterface';

export default function AIPage() {
  return (
    <AppShell>
      <AIInterface />
    </AppShell>
  );
}
