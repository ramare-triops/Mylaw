'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { DriveClient, DriveStatus, MylawBackup } from '@/lib/drive-sync';
import { db, getSetting, setSetting } from '@/lib/db';

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';
const UPLOAD_DEBOUNCE_MS = 3000;

let clientInstance: DriveClient | null = null;
function getClient(): DriveClient {
  if (!clientInstance) clientInstance = new DriveClient(CLIENT_ID);
  return clientInstance;
}

export function useDriveSync() {
  const [status, setStatus] = useState<DriveStatus>('idle');
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uploadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const client = getClient();

  useEffect(() => {
    if (!CLIENT_ID || typeof window === 'undefined') return;
    setStatus('loading');
    client.init()
      .then(async () => {
        const wasConnected = await getSetting<boolean>('drive_connected', false);
        setStatus(wasConnected ? 'disconnected' : 'idle');
      })
      .catch(() => setStatus('idle'));
  }, []);

  const connect = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      await client.init();
      await client.signIn();
      setStatus('syncing');
      const remote = await client.download();
      if (remote) await restoreFromBackup(remote);
      await setSetting('drive_connected', true);
      setLastSynced(new Date());
      setStatus('connected');
    } catch (e: any) {
      setError(e?.message ?? 'Erreur de connexion');
      setStatus('error');
    }
  }, []);

  const disconnect = useCallback(async () => {
    client.signOut();
    await setSetting('drive_connected', false);
    setStatus('disconnected');
    setLastSynced(null);
  }, []);

  const syncNow = useCallback(async () => {
    if (!client.isConnected()) return;
    setStatus('syncing');
    try {
      const backup = await buildBackup();
      await client.upload(backup);
      setLastSynced(new Date());
      setStatus('connected');
    } catch (e: any) {
      setError(e?.message ?? 'Erreur de synchronisation');
      setStatus('error');
    }
  }, []);

  const scheduleSync = useCallback(() => {
    if (!client.isConnected()) return;
    if (uploadTimer.current) clearTimeout(uploadTimer.current);
    setStatus('syncing');
    uploadTimer.current = setTimeout(async () => {
      try {
        const backup = await buildBackup();
        await client.upload(backup);
        setLastSynced(new Date());
        setStatus('connected');
      } catch {
        setStatus('error');
      }
    }, UPLOAD_DEBOUNCE_MS);
  }, []);

  return { status, lastSynced, error, connect, disconnect, syncNow, scheduleSync };
}

async function buildBackup(): Promise<MylawBackup> {
  const [documents, snippets, deadlines, templates] = await Promise.all([
    db.documents.toArray(),
    db.table('snippets').toArray(),
    db.table('deadlines').toArray(),
    db.table('templates').toArray(),
  ]);
  const settingsRows = await db.settings.toArray();
  const settings: Record<string, any> = {};
  for (const row of settingsRows) settings[row.key] = row.value;
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    documents, snippets, deadlines, templates, settings,
  };
}

async function restoreFromBackup(backup: MylawBackup): Promise<void> {
  await Promise.all([
    db.documents.clear(),
    db.table('snippets').clear(),
    db.table('deadlines').clear(),
    db.table('templates').clear(),
    db.settings.clear(),
  ]);
  if (backup.documents?.length) await db.documents.bulkAdd(backup.documents);
  if (backup.snippets?.length) await db.table('snippets').bulkAdd(backup.snippets);
  if (backup.deadlines?.length) await db.table('deadlines').bulkAdd(backup.deadlines);
  if (backup.templates?.length) await db.table('templates').bulkAdd(backup.templates);
  for (const [key, value] of Object.entries(backup.settings ?? {})) {
    await db.settings.put({ key, value });
  }
}
