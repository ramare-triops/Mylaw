'use client';

import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'system',
  resolvedTheme: 'light',
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const stored = (localStorage.getItem('theme') as Theme) ?? 'system';
    setThemeState(stored);
  }, []);

  useEffect(() => {
    const apply = (t: Theme) => {
      let resolved: 'light' | 'dark' = 'light';
      if (t === 'dark') resolved = 'dark';
      else if (t === 'system') {
        resolved = window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
      }
      setResolvedTheme(resolved);
      document.documentElement.classList.toggle('dark', resolved === 'dark');
    };
    apply(theme);
  }, [theme]);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    localStorage.setItem('theme', t);
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
