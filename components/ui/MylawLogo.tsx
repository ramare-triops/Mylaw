import { type SVGProps } from 'react';

export interface MylawLogoProps extends Omit<SVGProps<SVGSVGElement>, 'fill'> {
  size?: number;
}

/**
 * Mylaw monogram — two trapezoidal "rabats" (lawyer's white collar bands)
 * suggesting an M, on a verdigris rounded square.
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
      <rect x="0" y="0" width="64" height="64" rx="8" fill="#0F3028" />
      {/* Left rabat tab — flared trapezoid */}
      <path d="M20 13 L28 13 L30 51 L10 51 Z" fill="#FAF5E6" />
      {/* Right rabat tab — mirror */}
      <path d="M36 13 L44 13 L54 51 L34 51 Z" fill="#FAF5E6" />
    </svg>
  );
}
