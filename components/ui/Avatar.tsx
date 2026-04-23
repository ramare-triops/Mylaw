import { cn } from '@/lib/utils';

export type AvatarVariant = 'brand' | 'accent' | 'steel' | 'paper';
export type AvatarShape = 'round' | 'square';

export interface AvatarProps {
  initials: string;
  size?: number;
  variant?: AvatarVariant;
  shape?: AvatarShape;
  className?: string;
}

const PALETTE: Record<AvatarVariant, { bg: string; fg: string; border?: string }> = {
  brand:  { bg: 'var(--navy-900)',   fg: 'var(--ivory-50)' },
  accent: { bg: 'var(--gold-500)',   fg: 'var(--navy-950)' },
  steel:  { bg: 'var(--navy-600)',   fg: 'var(--ivory-50)' },
  paper:  { bg: 'var(--ivory-100)',  fg: 'var(--navy-900)', border: '1px solid var(--ivory-300)' },
};

export function Avatar({
  initials,
  size = 32,
  variant = 'brand',
  shape = 'round',
  className,
}: AvatarProps) {
  const p = PALETTE[variant];
  return (
    <div
      className={cn('inline-flex shrink-0 items-center justify-center font-semibold leading-none', className)}
      style={{
        width: size,
        height: size,
        borderRadius: shape === 'round' ? 9999 : 4,
        background: p.bg,
        color: p.fg,
        border: p.border,
        fontSize: Math.round(size * 0.36),
        fontFamily: 'var(--font-sans)',
      }}
    >
      {initials}
    </div>
  );
}
