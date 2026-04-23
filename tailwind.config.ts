import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        /* Mylaw brand — navy / gold / ivory */
        navy: {
          50:  '#F3F6FB',
          100: '#E4EAF2',
          200: '#C8D3E2',
          300: '#9AB0CC',
          400: '#6687B3',
          500: '#3A6699',
          600: '#27507F',
          700: '#1B3B65',
          800: '#122C4E',
          900: '#0B1F3A',
          950: '#070E1C',
        },
        gold: {
          50:  '#FEF9E9',
          100: '#FDF2D4',
          200: '#F9E7B2',
          300: '#F3D98E',
          400: '#ECC76A',
          500: '#E0B243',
          600: '#C79327',
          700: '#A87A1A',
          800: '#8C6310',
          900: '#6B4A05',
        },
        ivory: {
          50:  '#FAF8F3',
          100: '#F5F2EC',
          200: '#EDE8DE',
          300: '#DDD6C6',
        },
        slate: {
          50:  '#F4F5F8',
          100: '#E7EAEF',
          200: '#D3D8E0',
          300: '#B0B8C6',
          400: '#8B95A7',
          500: '#6B7489',
          600: '#4A5568',
          700: '#2E3749',
          800: '#1E2637',
          900: '#121826',
          950: '#0A0F1A',
        },
        /* Legacy alias kept so pre-existing components keep building.
           Maps to the Mylaw brand (navy). */
        primary: {
          DEFAULT: '#0B1F3A',
          50:  '#F3F6FB',
          100: '#E4EAF2',
          200: '#C8D3E2',
          300: '#9AB0CC',
          400: '#6687B3',
          500: '#3A6699',
          600: '#27507F',
          700: '#1B3B65',
          800: '#122C4E',
          900: '#0B1F3A',
          950: '#070E1C',
        },
        surface: {
          DEFAULT: '#FAF8F3',
          dark: '#070E1C',
        },
        sidebar: {
          DEFAULT: '#FFFFFF',
          dark: '#0F1A2E',
        },
      },
      fontFamily: {
        sans: ['Inter', 'var(--font-inter)', 'ui-sans-serif', 'system-ui'],
        serif: ['Fraunces', 'Source Serif Pro', 'Georgia', 'ui-serif'],
        mono: ['JetBrains Mono', 'ui-monospace'],
      },
      fontSize: {
        '2xs': ['11px', '1.3'],
      },
      spacing: {
        sidebar: '240px',
        'sidebar-collapsed': '64px',
        topbar: '56px',
      },
      borderRadius: {
        sm: '4px',
        md: '6px',
        lg: '8px',
        xl: '12px',
      },
      boxShadow: {
        xs: '0 1px 0 rgba(11, 31, 58, 0.04)',
        sm: '0 1px 2px rgba(11, 31, 58, 0.06), 0 1px 1px rgba(11, 31, 58, 0.04)',
        md: '0 2px 4px rgba(11, 31, 58, 0.06), 0 4px 8px rgba(11, 31, 58, 0.04)',
        lg: '0 4px 8px rgba(11, 31, 58, 0.06), 0 12px 24px rgba(11, 31, 58, 0.08)',
        xl: '0 8px 16px rgba(11, 31, 58, 0.08), 0 24px 48px rgba(11, 31, 58, 0.12)',
        focus: '0 0 0 3px rgba(201, 169, 97, 0.35)',
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(0.2, 0, 0, 1)',
      },
      transitionDuration: {
        DEFAULT: '180ms',
        fast: '120ms',
        slow: '280ms',
      },
      letterSpacing: {
        wider: '0.08em',
      },
    },
  },
  plugins: [],
};

export default config;
