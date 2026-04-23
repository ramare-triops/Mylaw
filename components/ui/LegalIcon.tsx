import { type SVGProps } from 'react';

/**
 * Mylaw custom legal icons — stroke 1.75px, currentColor, 24×24.
 * For generic icons use `lucide-react`. These cover legal concepts
 * that Lucide doesn't handle well.
 */
export type LegalIconName =
  | 'scale'
  | 'gavel'
  | 'parchment'
  | 'courthouse'
  | 'seal'
  | 'deadline';

export interface LegalIconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: LegalIconName;
  size?: number;
}

export function LegalIcon({ name, size = 16, ...rest }: LegalIconProps) {
  const common: SVGProps<SVGSVGElement> = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    ...rest,
  };

  switch (name) {
    case 'scale':
      return (
        <svg {...common}>
          <path d="M12 3v18" />
          <path d="M5 8h14" />
          <path d="M7 8l-3 7a3 3 0 0 0 6 0l-3-7" />
          <path d="M17 8l-3 7a3 3 0 0 0 6 0l-3-7" />
          <path d="M8 21h8" />
        </svg>
      );
    case 'gavel':
      return (
        <svg {...common}>
          <path d="m14.5 2.5 7 7" />
          <path d="m10 6 4-4 7 7-4 4z" />
          <path d="m7 9 8 8" />
          <path d="M3 21h10" />
          <path d="m11 13-8 8" />
        </svg>
      );
    case 'parchment':
      return (
        <svg {...common}>
          <path d="M5 4h11l3 3v11a2 2 0 0 1-2 2H7" />
          <path d="M5 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h2V4z" />
          <path d="M10 9h6" />
          <path d="M10 13h6" />
          <path d="M10 17h4" />
        </svg>
      );
    case 'courthouse':
      return (
        <svg {...common}>
          <path d="M3 10h18" />
          <path d="M12 3l10 7H2z" />
          <path d="M5 10v9" />
          <path d="M9 10v9" />
          <path d="M15 10v9" />
          <path d="M19 10v9" />
          <path d="M2 21h20" />
        </svg>
      );
    case 'seal':
      return (
        <svg {...common}>
          <circle cx="12" cy="10" r="6" />
          <circle cx="12" cy="10" r="3" />
          <path d="M8.5 15 7 22l5-3 5 3-1.5-7" />
        </svg>
      );
    case 'deadline':
      return (
        <svg {...common}>
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l2.5 2" />
          <path d="M9 2h6" />
          <path d="M12 2v3" />
          <path d="m19 5-1.5 1.5" />
        </svg>
      );
  }
}
