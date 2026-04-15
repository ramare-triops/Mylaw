'use client';

import { AppShell } from '@/components/layout/AppShell';
import { DocumentEditor } from '@/components/editor/DocumentEditor';
import { useParams } from 'next/navigation';

export default function DocumentEditorPage() {
  const params = useParams();
  const docId = Number(params.docId);

  return (
    <AppShell>
      <DocumentEditor docId={docId} />
    </AppShell>
  );
}
