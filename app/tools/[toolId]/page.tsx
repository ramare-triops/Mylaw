'use client';

import { useParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { ToolView } from '@/components/tools/ToolView';

export default function ToolPage() {
  const params = useParams();
  return (
    <AppShell>
      <ToolView toolSlug={String(params.toolId)} />
    </AppShell>
  );
}
