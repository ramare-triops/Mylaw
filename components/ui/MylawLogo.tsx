import { type SVGProps } from 'react';

export interface MylawLogoProps extends Omit<SVGProps<SVGSVGElement>, 'fill'> {
  size?: number;
}

/**
 * Mylaw monogram — colonnade + pediment.
 * Three columns under a gold architrave, on a navy square.
 * Reads clearly from 16px to 64px.
 */
export function MylawLogo({ size = 28, ...rest }: MylawLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Mylaw"
      {...rest}
    >
      <rect x="0" y="0" width="64" height="64" rx="6" fill="#0B1F3A" />
      <rect x="14" y="18" width="4" height="30" fill="#FAF8F3" />
      <rect x="30" y="18" width="4" height="30" fill="#FAF8F3" />
      <rect x="46" y="18" width="4" height="30" fill="#FAF8F3" />
      <rect x="10" y="14" width="44" height="3" fill="#C9A961" />
      <rect x="10" y="48" width="44" height="2" fill="#FAF8F3" />
    </svg>
  );
}
