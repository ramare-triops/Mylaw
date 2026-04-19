'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useDriveSync } from '@/lib/hooks/useDriveSync';
import type { DriveStatus } from '@/lib/drive-sync';

interface DriveSyncContextType {
  status: DriveStatus;
  lastSynced: Date | null;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  syncNow: () => Promise<void>;
  scheduleSync: () => void;
  /** Vrai si le refresh token a expiré : affichage de la bannière de reconnexion. */
  needsReconnect: boolean;
  /** Alias sémantique de connect() pour la bannière. */
  reconnect: () => Promise<void>;
}

const DriveSyncContext = createContext<DriveSyncContextType | null>(null);

/**
 * DriveSyncProvider monte useDriveSync() une seule fois au niveau racine.
 * Le useEffect interne enregistre scheduleSync dans db.ts via registerDriveSyncCallback,
 * ce qui branche le middleware Dexie — toute écriture Dexie déclenche alors
 * automatiquement un upload Drive debounced.
 */
export function DriveSyncProvider({ children }: { children: ReactNode }) {
  const driveSync = useDriveSync();
  return (
    <DriveSyncContext.Provider value={driveSync}>
      {children}
    </DriveSyncContext.Provider>
  );
}

export function useDrive() {
  const ctx = useContext(DriveSyncContext);
  if (!ctx) throw new Error('useDrive must be used within DriveSyncProvider');
  return ctx;
}
