'use client';

import { ThemeProvider } from './ThemeProvider';
import { UIStateProvider } from './UIStateProvider';
import { PrivacyProvider } from './PrivacyProvider';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <PrivacyProvider>
        <UIStateProvider>{children}</UIStateProvider>
      </PrivacyProvider>
    </ThemeProvider>
  );
}
