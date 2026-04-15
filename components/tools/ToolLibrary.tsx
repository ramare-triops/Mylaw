'use client';

import Link from 'next/link';
import { TOOLS_REGISTRY } from '@/lib/tools-registry';
import { cn } from '@/lib/utils';

const CATEGORY_LABELS: Record<string, string> = {
  writing: 'Rédaction',
  research: 'Recherche & Analyse',
  time: 'Gestion du temps',
  correspondence: 'Correspondance',
  organization: 'Organisation',
};

export function ToolLibrary() {
  const byCategory = TOOLS_REGISTRY.reduce(
    (acc, tool) => {
      if (!acc[tool.category]) acc[tool.category] = [];
      acc[tool.category].push(tool);
      return acc;
    },
    {} as Record<string, typeof TOOLS_REGISTRY>
  );

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-xl font-semibold text-[var(--color-text)] mb-6">Bibliothèque d'outils</h1>

      {Object.entries(byCategory).map(([cat, tools]) => (
        <section key={cat} className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-muted)] mb-3">
            {CATEGORY_LABELS[cat] ?? cat}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {tools.map((tool) => {
              const Icon = tool.icon;
              return (
                <Link
                  key={tool.slug}
                  href={`/tools/${tool.slug}`}
                  className={cn(
                    'flex items-start gap-3 p-4 rounded-lg border border-[var(--color-border)]',
                    'bg-[var(--color-surface-raised)] hover:border-[var(--color-primary)]',
                    'transition-colors group'
                  )}
                >
                  <div className="p-2 rounded-md bg-[var(--color-primary-light)] flex-shrink-0">
                    <Icon className="w-4 h-4 text-[var(--color-primary)]" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-[var(--color-text)] group-hover:text-[var(--color-primary)] transition-colors">
                      {tool.name}
                    </div>
                    <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
                      {tool.description}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
