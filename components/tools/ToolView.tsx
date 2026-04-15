'use client';

import { useState } from 'react';
import { getToolBySlug } from '@/lib/tools-registry';
import { db } from '@/lib/db';
import { useLiveQuery } from 'dexie-react-hooks';

interface Props {
  toolSlug: string;
}

export function ToolView({ toolSlug }: Props) {
  const tool = getToolBySlug(toolSlug);
  const toolRecord = useLiveQuery(() => db.tools.where('slug').equals(toolSlug).first());
  const [config, setConfig] = useState<Record<string, unknown>>({});

  if (!tool) {
    return (
      <div className="p-6 text-[var(--color-text-muted)]">Outil introuvable : {toolSlug}</div>
    );
  }

  const ToolComponent = tool.component;

  const handleConfigChange = async (newConfig: Record<string, unknown>) => {
    setConfig(newConfig);
    if (toolRecord?.id) {
      await db.tools.update(toolRecord.id, { config: newConfig, lastUsedAt: new Date() });
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[var(--color-border)] flex-shrink-0">
        <tool.icon className="w-5 h-5 text-[var(--color-primary)]" />
        <h1 className="text-lg font-semibold text-[var(--color-text)]">{tool.name}</h1>
      </div>
      <div className="flex-1 overflow-auto">
        <ToolComponent
          config={toolRecord?.config ?? tool.defaultConfig ?? config}
          onConfigChange={handleConfigChange}
        />
      </div>
    </div>
  );
}
