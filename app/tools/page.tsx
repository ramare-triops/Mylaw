'use client';

import { AppShell } from '@/components/layout/AppShell';
import { ToolLibrary } from '@/components/tools/ToolLibrary';

export default function ToolsPage() {
  return (
    <AppShell>
      <ToolLibrary />
    </AppShell>
  );
}
