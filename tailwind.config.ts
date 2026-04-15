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
        primary: {
          DEFAULT: '#01696f',
          50: '#f0fafb',
          100: '#d9f2f3',
          200: '#b3e6e8',
          300: '#7dd3d6',
          400: '#44b8bc',
          500: '#289ca1',
          600: '#237d82',
          700: '#01696f',
          800: '#1a5356',
          900: '#1b4548',
          950: '#0a2b2d',
        },
        surface: {
          DEFAULT: '#f7f4ef',
          dark: '#1a1a1a',
        },
        sidebar: {
          DEFAULT: '#f0ece4',
          dark: '#141414',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
        serif: ['Georgia', 'Source Serif 4', 'ui-serif'],
        mono: ['JetBrains Mono', 'ui-monospace'],
      },
      spacing: {
        sidebar: '256px',
        topbar: '52px',
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },
    },
  },
  plugins: [],
};

export default config;
