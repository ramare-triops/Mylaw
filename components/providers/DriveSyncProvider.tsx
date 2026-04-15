'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useDriveSync } from '@/lib/hooks/useDriveSync';
import type { DriveStatus } from '@/lib/drive-sync';

interface DriveSyncContextType {
  status: DriveStatus;
  lastSynced: Date | null;
  error: string | null;
  needsReconnect: boolean;
  connect: () => Promise<void>;
  reconnect: () => Promise<void>;
  disconnect: () => Promise<void>;
  syncNow: () => Promise<void>;
  scheduleSync: () => void;
}

const DriveSyncContext = createContext<DriveSyncContextType | null>(null);

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
