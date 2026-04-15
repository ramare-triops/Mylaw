'use client';

import { AppShell } from '@/components/layout/AppShell';
import { DocumentList } from '@/components/documents/DocumentList';

export default function DocumentsPage() {
  return (
    <AppShell>
      <DocumentList />
    </AppShell>
  );
}
