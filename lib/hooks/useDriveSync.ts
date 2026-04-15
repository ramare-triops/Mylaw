'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { DriveClient, DriveStatus, MylawBackup } from '@/lib/drive-sync';
import { db, getSetting, setSetting, registerDriveSyncCallback, setRestoreInProgress } from '@/lib/db';

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';

// Debounce : attend 3s d'inactivité avant d'uploader (comme Google Docs ~2s)
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
  // Ref pour accéder au status courant dans les callbacks sans re-créer scheduleSync
  const statusRef = useRef<DriveStatus>('idle');
  const uploadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const client = getClient();

  function updateStatus(s: DriveStatus) {
    statusRef.current = s;
    setStatus(s);
  }

  // ─── scheduleSync : déclenché par le middleware Dexie à chaque écriture ───
  // On utilise statusRef (pas status) pour éviter de recréer la fonction à chaque render
  const scheduleSync = useCallback(() => {
    // Ne sync que si connecté ou en train de syncer (pas idle/disconnected/error)
    const currentStatus = statusRef.current;
    if (currentStatus === 'idle' || currentStatus === 'disconnected' || currentStatus === 'loading') return;

    if (uploadTimer.current) clearTimeout(uploadTimer.current);
    updateStatus('syncing');

    uploadTimer.current = setTimeout(async () => {
      try {
        const backup = await buildBackup();
        await client.upload(backup);
        setLastSynced(new Date());
        updateStatus('connected');
      } catch {
        updateStatus('error');
      }
    }, UPLOAD_DEBOUNCE_MS);
  }, []); // deps vides intentionnellement — on lit statusRef

  // Enregistre le callback dans db.ts dès que le composant monte
  useEffect(() => {
    registerDriveSyncCallback(scheduleSync);
  }, [scheduleSync]);

  // ─── Au démarrage : silent refresh + pull Drive ───
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Retour du callback OAuth ?
    const params = new URLSearchParams(window.location.search);
    if (params.get('drive') === 'connected') {
      window.history.replaceState({}, '', window.location.pathname);
      loadFromDrive();
      return;
    }

    // Tentative silent refresh via cookie
    updateStatus('loading');
    client.trySilentRefresh().then(async (ok) => {
      if (ok) {
        await loadFromDrive();
      } else {
        const wasConnected = await getSetting<boolean>('drive_connected', false);
        updateStatus(wasConnected ? 'disconnected' : 'idle');
      }
    });
  }, []);

  // Pull Drive : télécharge + restaure
  async function loadFromDrive() {
    updateStatus('syncing');
    try {
      const remote = await client.download();
      if (remote && remote.exportedAt) {
        setRestoreInProgress(true);
        await restoreFromBackup(remote);
        setRestoreInProgress(false);
      }
      await setSetting('drive_connected', true);
      setLastSynced(new Date());
      updateStatus('connected');
    } catch {
      setRestoreInProgress(false);
      updateStatus('error');
    }
  }

  // ─── connect() : lance le flow OAuth PKCE ───
  const connect = useCallback(async () => {
    setError(null);
    try {
      const verifier = generateRandomString(64);
      const challenge = await generateCodeChallenge(verifier);
      const redirectUri = `${window.location.origin}/api/drive/callback`;
      const state = generateRandomString(16);

      document.cookie = `pkce_verifier=${verifier}; path=/; max-age=300; samesite=lax`;
      document.cookie = `pkce_redirect=${encodeURIComponent(redirectUri)}; path=/; max-age=300; samesite=lax`;
      document.cookie = `pkce_state=${state}; path=/; max-age=300; samesite=lax`;

      const urlParams = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/drive.appdata openid email',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        access_type: 'offline',
        prompt: 'consent',
        state,
      });

      window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${urlParams}`;
    } catch (e: any) {
      setError(e?.message ?? "Erreur d'initialisation OAuth");
    }
  }, []);

  const disconnect = useCallback(async () => {
    await client.signOut();
    await setSetting('drive_connected', false);
    updateStatus('idle');
    setLastSynced(null);
  }, []);

  const syncNow = useCallback(async () => {
    updateStatus('syncing');
    try {
      const backup = await buildBackup();
      await client.upload(backup);
      setLastSynced(new Date());
      updateStatus('connected');
    } catch (e: any) {
      setError(e?.message ?? 'Erreur de synchronisation');
      updateStatus('error');
    }
  }, []);

  return { status, lastSynced, error, connect, disconnect, syncNow, scheduleSync };
}

// ─── Helpers PKCE ─────────────────────────────────────────────────────────

function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => chars[b % chars.length]).join('');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ─── Backup / Restore ────────────────────────────────────────────────────────

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
