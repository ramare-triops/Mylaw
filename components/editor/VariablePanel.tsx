'use client';

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  variables: string[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
  onClose: () => void;
}

export function VariablePanel({ variables, values, onChange, onClose }: Props) {
  return (
    <aside
      className={cn(
        'w-72 flex-shrink-0 border-l border-[var(--color-border)]',
        'bg-[var(--color-surface-raised)] overflow-y-auto animate-slide-in-right'
      )}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
        <h3 className="text-sm font-semibold text-[var(--color-text)]">Variables</h3>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-[var(--color-surface)] text-[var(--color-text-muted)]"
          aria-label="Fermer le panneau"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {variables.map((name) => (
          <div key={name}>
            <label
              htmlFor={`var-${name}`}
              className="block text-xs font-medium text-[var(--color-text-muted)] mb-1 font-mono"
            >
              {`{{${name}}}`}
            </label>
            <input
              id={`var-${name}`}
              type="text"
              value={values[name] ?? ''}
              onChange={(e) => onChange(name, e.target.value)}
              placeholder={`Valeur de ${name}`}
              className={cn(
                'w-full px-3 py-1.5 text-sm rounded-md',
                'bg-[var(--color-surface)] border border-[var(--color-border)]',
                'text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)]',
                'focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]'
              )}
            />
          </div>
        ))}
      </div>
    </aside>
  );
}
