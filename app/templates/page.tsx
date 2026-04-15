'use client';

import { AppShell } from '@/components/layout/AppShell';
import { TemplateLibrary } from '@/components/templates/TemplateLibrary';

export default function TemplatesPage() {
  return (
    <AppShell>
      <TemplateLibrary />
    </AppShell>
  );
}
