import { type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface CardProps {
  children: ReactNode;
  title?: ReactNode;
  actions?: ReactNode;
  padding?: number;
  flat?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function Card({
  children,
  title,
  actions,
  padding = 20,
  flat = false,
  className,
  style,
}: CardProps) {
  return (
    <div
      className={cn('overflow-hidden rounded-sm', className)}
      style={{
        background: 'var(--bg-surface)',
        border: flat ? '1px solid var(--border-subtle)' : 'none',
        boxShadow: flat ? 'none' : 'var(--shadow-sm)',
        ...style,
      }}
    >
      {title && (
        <div
          className="flex items-center justify-between border-b border-[var(--border-subtle)]"
          style={{ padding: `14px ${padding}px` }}
        >
          <div className="text-[14px] font-semibold leading-tight text-[var(--fg-primary)]">
            {title}
          </div>
          {actions}
        </div>
      )}
      <div style={{ padding }}>{children}</div>
    </div>
  );
}
