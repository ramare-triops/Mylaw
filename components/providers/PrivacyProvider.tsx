'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

interface PrivacyContextValue {
  privacyMode: boolean;
  setPrivacyMode: (v: boolean) => void;
  togglePrivacyMode: () => void;
}

const PrivacyContext = createContext<PrivacyContextValue>({
  privacyMode: false,
  setPrivacyMode: () => {},
  togglePrivacyMode: () => {},
});

const STORAGE_KEY = 'privacy_mode';

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [privacyMode, setPrivacyModeState] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'true') setPrivacyModeState(true);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('privacy-mode', privacyMode);
  }, [privacyMode]);

  const setPrivacyMode = useCallback((v: boolean) => {
    setPrivacyModeState(v);
    try {
      localStorage.setItem(STORAGE_KEY, v ? 'true' : 'false');
    } catch {
      /* ignore */
    }
  }, []);

  const togglePrivacyMode = useCallback(() => {
    setPrivacyMode(!privacyMode);
  }, [privacyMode, setPrivacyMode]);

  return (
    <PrivacyContext.Provider value={{ privacyMode, setPrivacyMode, togglePrivacyMode }}>
      {children}
    </PrivacyContext.Provider>
  );
}

export const usePrivacy = () => useContext(PrivacyContext);
