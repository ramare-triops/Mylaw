'use client';

import { AIPanel } from './AIPanel';

export function AIInterface() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)] mb-2">Interface IA</h1>
      <p className="text-[var(--color-text-muted)] text-sm">
        Ouvrez le panel IA avec <kbd className="px-1.5 py-0.5 rounded bg-[var(--color-surface-raised)] border border-[var(--color-border)] text-xs">Alt+I</kbd> depuis n'importe quel écran.
      </p>
    </div>
  );
}
