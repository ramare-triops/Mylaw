import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface EyebrowProps {
  children: ReactNode;
  className?: string;
}

export function Eyebrow({ children, className }: EyebrowProps) {
  return (
    <div
      className={cn(
        'text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-secondary)]',
        className,
      )}
    >
      {children}
    </div>
  );
}
