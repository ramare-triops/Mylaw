'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'accent' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  iconPosition?: 'leading' | 'trailing';
  fullWidth?: boolean;
}

const SIZE: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-[13px]',
  lg: 'px-5 py-2.5 text-sm',
};

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--brand)] text-[var(--fg-on-brand)] hover:bg-[var(--brand-hover)] active:bg-[var(--brand-active)]',
  secondary:
    'bg-[var(--bg-surface)] text-[var(--fg-primary)] border border-[var(--border-default)] hover:bg-[var(--bg-surface-alt)]',
  ghost:
    'bg-transparent text-[var(--fg-primary)] hover:bg-[var(--bg-surface-alt)]',
  accent:
    'bg-[var(--accent)] text-[var(--fg-on-accent)] hover:bg-[var(--accent-hover)]',
  danger:
    'bg-[var(--danger-bg)] text-[var(--danger)] hover:opacity-90',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon, iconPosition = 'leading', fullWidth, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      {...rest}
      className={cn(
        'inline-flex items-center gap-2 whitespace-nowrap rounded-sm font-semibold',
        'transition-colors duration-fast ease-standard',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        SIZE[size],
        VARIANT[variant],
        fullWidth && 'w-full justify-center',
        className,
      )}
    >
      {icon && iconPosition === 'leading' && <span className="inline-flex shrink-0">{icon}</span>}
      {children}
      {icon && iconPosition === 'trailing' && <span className="inline-flex shrink-0">{icon}</span>}
    </button>
  );
});
