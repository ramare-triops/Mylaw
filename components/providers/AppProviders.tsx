'use client';

import { ThemeProvider } from './ThemeProvider';
import { UIStateProvider } from './UIStateProvider';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <UIStateProvider>{children}</UIStateProvider>
    </ThemeProvider>
  );
}
