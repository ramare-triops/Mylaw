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
  brand:  { bg: 'var(--brand)',          fg: 'var(--fg-on-brand)' },
  accent: { bg: 'var(--accent)',         fg: 'var(--fg-on-accent)' },
  steel:  { bg: 'var(--verdigris-600)',  fg: 'var(--lin-50)' },
  paper:  { bg: 'var(--lin-100)',        fg: 'var(--brand)', border: '1px solid var(--lin-300)' },
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
