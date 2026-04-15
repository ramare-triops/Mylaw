'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { DriveClient, DriveStatus, MylawBackup } from '@/lib/drive-sync';
import { db, getSetting, setSetting } from '@/lib/db';

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';
const UPLOAD_DEBOUNCE_MS = 2000;

let clientInstance: DriveClient | null = null;
function getClient(): DriveClient {
  if (!clientInstance) clientInstance = new DriveClient(CLIENT_ID);
  return clientInstance;
}

export function useDriveSync() {
  const [status, setStatus] = useState<DriveStatus>('idle');
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const uploadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const client = getClient();

  useEffect(() => {
    if (!CLIENT_ID || typeof window === 'undefined') return;
    setStatus('loading');
    client.init()
      .then(async () => {
        const wasConnected = await getSetting<boolean>('drive_connected', false);
        if (wasConnected) {
          setNeedsReconnect(true);
          setStatus('disconnected');
        } else {
          setStatus('idle');
        }
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
      setNeedsReconnect(false);
      setStatus('connected');
    } catch (e: any) {
      setError(e?.message ?? 'Erreur de connexion Drive');
      setStatus('error');
    }
  }, []);

  const reconnect = useCallback(async () => {
    setStatus('loading');
    setError(null);
    setNeedsReconnect(false);
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
      setError(e?.message ?? 'Erreur de reconnexion Drive');
      setNeedsReconnect(true);
      setStatus('disconnected');
    }
  }, []);

  const disconnect = useCallback(async () => {
    client.signOut();
    await setSetting('drive_connected', false);
    setStatus('disconnected');
    setNeedsReconnect(false);
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

  return { status, lastSynced, error, needsReconnect, connect, reconnect, disconnect, syncNow, scheduleSync };
}

export async function buildBackup(): Promise<MylawBackup> {
  const [documents, folders, snippets, deadlines, templates, tools, aiChats] = await Promise.all([
    db.documents.toArray(),
    db.folders.toArray(),
    db.table('snippets').toArray(),
    db.table('deadlines').toArray(),
    db.table('templates').toArray(),
    db.table('tools').toArray(),
    db.table('aiChats').toArray(),
  ]);
  const settingsRows = await db.settings.toArray();
  const settings: Record<string, any> = {};
  for (const row of settingsRows) settings[row.key] = row.value;
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    documents, folders, snippets, deadlines, templates, tools, aiChats, settings,
  };
}

export async function restoreFromBackup(backup: MylawBackup): Promise<void> {
  await Promise.all([
    db.documents.clear(), db.folders.clear(),
    db.table('snippets').clear(), db.table('deadlines').clear(),
    db.table('templates').clear(), db.table('tools').clear(),
    db.table('aiChats').clear(), db.settings.clear(),
  ]);
  await Promise.all([
    backup.documents?.length  ? db.documents.bulkAdd(backup.documents)           : Promise.resolve(),
    backup.folders?.length    ? db.folders.bulkAdd(backup.folders)               : Promise.resolve(),
    backup.snippets?.length   ? db.table('snippets').bulkAdd(backup.snippets)    : Promise.resolve(),
    backup.deadlines?.length  ? db.table('deadlines').bulkAdd(backup.deadlines)  : Promise.resolve(),
    backup.templates?.length  ? db.table('templates').bulkAdd(backup.templates)  : Promise.resolve(),
    backup.tools?.length      ? db.table('tools').bulkAdd(backup.tools)          : Promise.resolve(),
    backup.aiChats?.length    ? db.table('aiChats').bulkAdd(backup.aiChats)      : Promise.resolve(),
  ]);
  for (const [key, value] of Object.entries(backup.settings ?? {})) {
    await db.settings.put({ key, value });
  }
}
