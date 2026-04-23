import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type BadgeVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'accent';

export interface BadgeProps {
  variant?: BadgeVariant;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}

const STYLES: Record<BadgeVariant, { bg: string; fg: string }> = {
  neutral: { bg: 'var(--slate-50)',   fg: 'var(--slate-600)' },
  success: { bg: 'var(--success-bg)', fg: 'var(--success)'   },
  warning: { bg: 'var(--warning-bg)', fg: 'var(--warning)'   },
  danger:  { bg: 'var(--danger-bg)',  fg: 'var(--danger)'    },
  info:    { bg: 'var(--info-bg)',    fg: 'var(--info)'      },
  brand:   { bg: 'var(--brand)',      fg: 'var(--fg-on-brand)' },
  accent:  { bg: 'var(--terre-100)',  fg: 'var(--terre-800)' },
};

export function Badge({ variant = 'neutral', dot = false, children, className }: BadgeProps) {
  const s = STYLES[variant];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5',
        'text-[11px] font-semibold leading-tight whitespace-nowrap',
        className,
      )}
      style={{ background: s.bg, color: s.fg }}
    >
      {dot && (
        <span
          className="inline-block h-[5px] w-[5px] rounded-full"
          style={{ background: s.fg }}
          aria-hidden
        />
      )}
      {children}
    </span>
  );
}
