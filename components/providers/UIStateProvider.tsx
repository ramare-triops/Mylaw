'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import type { UIState, OpenTab } from '@/types';

const DEFAULT_STATE: UIState = {
  openTabs: [],
  activeTabId: null,
  sidebarCollapsed: false,
  activeDocumentScrollY: 0,
};

interface UIStateContextValue extends UIState {
  openTab: (tab: OpenTab) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  toggleSidebar: () => void;
}

const UIStateContext = createContext<UIStateContextValue>({
  ...DEFAULT_STATE,
  openTab: () => {},
  closeTab: () => {},
  setActiveTab: () => {},
  toggleSidebar: () => {},
});

export function UIStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UIState>(DEFAULT_STATE);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('mylex-ui-state');
      if (stored) setState(JSON.parse(stored) as UIState);
    } catch {
      // ignore
    }
  }, []);

  const persist = (next: UIState) => {
    setState(next);
    localStorage.setItem('mylex-ui-state', JSON.stringify(next));
  };

  const openTab = useCallback(
    (tab: OpenTab) => {
      const existing = state.openTabs.find((t) => t.id === tab.id);
      if (existing) {
        persist({ ...state, activeTabId: tab.id });
      } else {
        persist({
          ...state,
          openTabs: [...state.openTabs, tab],
          activeTabId: tab.id,
        });
      }
    },
    [state]
  );

  const closeTab = useCallback(
    (tabId: string) => {
      const tabs = state.openTabs.filter((t) => t.id !== tabId);
      const activeTabId =
        state.activeTabId === tabId ? (tabs[tabs.length - 1]?.id ?? null) : state.activeTabId;
      persist({ ...state, openTabs: tabs, activeTabId });
    },
    [state]
  );

  const setActiveTab = useCallback(
    (tabId: string) => persist({ ...state, activeTabId: tabId }),
    [state]
  );

  const toggleSidebar = useCallback(
    () => persist({ ...state, sidebarCollapsed: !state.sidebarCollapsed }),
    [state]
  );

  return (
    <UIStateContext.Provider
      value={{ ...state, openTab, closeTab, setActiveTab, toggleSidebar }}
    >
      {children}
    </UIStateContext.Provider>
  );
}

export const useUIState = () => useContext(UIStateContext);
