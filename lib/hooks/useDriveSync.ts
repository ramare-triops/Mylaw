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
  const uploadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const client = getClient();

  /**
   * Au démarrage : tente un rafraîchissement silencieux via le cookie.
   * Si le cookie existe, charge automatiquement les données Drive.
   * L'utilisateur ne voit aucun popup.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Vérifier si on revient du callback OAuth avec ?drive=connected
    const params = new URLSearchParams(window.location.search);
    if (params.get('drive') === 'connected') {
      // Nettoyer l'URL sans recharger la page
      window.history.replaceState({}, '', window.location.pathname);
      // Charger immédiatement les données Drive
      loadFromDriveAfterAuth();
      return;
    }

    // Sinon, tenter le rafraîchissement silencieux
    setStatus('loading');
    client.trySilentRefresh().then(async (ok) => {
      if (ok) {
        setStatus('syncing');
        try {
          const remote = await client.download();
          if (remote && remote.exportedAt) {
            await restoreFromBackup(remote);
          }
          await setSetting('drive_connected', true);
          setLastSynced(new Date());
          setStatus('connected');
        } catch {
          setStatus('connected'); // connecté mais restauration échouée
        }
      } else {
        const wasConnected = await getSetting<boolean>('drive_connected', false);
        setStatus(wasConnected ? 'disconnected' : 'idle');
      }
    });
  }, []);

  async function loadFromDriveAfterAuth() {
    setStatus('syncing');
    try {
      client['_isConnected'] = true; // marquer connecté après callback
      const remote = await client.download();
      if (remote && remote.exportedAt) {
        await restoreFromBackup(remote);
      }
      await setSetting('drive_connected', true);
      setLastSynced(new Date());
      setStatus('connected');
    } catch {
      setStatus('error');
    }
  }

  /**
   * connect() : lance le flow OAuth PKCE.
   * Redirige vers Google, puis /api/drive/callback gère le retour.
   */
  const connect = useCallback(async () => {
    setError(null);
    try {
      // Stocker le verifier dans un cookie temporaire (lisible côté serveur dans /callback)
      const verifier = generateRandomString(64);
      const challenge = await generateCodeChallenge(verifier);
      const redirectUri = `${window.location.origin}/api/drive/callback`;
      const state = generateRandomString(16);

      // Cookie temporaire pour le callback
      document.cookie = `pkce_verifier=${verifier}; path=/; max-age=300; samesite=lax`;
      document.cookie = `pkce_redirect=${encodeURIComponent(redirectUri)}; path=/; max-age=300; samesite=lax`;
      document.cookie = `pkce_state=${state}; path=/; max-age=300; samesite=lax`;

      const params = new URLSearchParams({
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

      window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    } catch (e: any) {
      setError(e?.message ?? 'Erreur d'initialisation OAuth');
    }
  }, []);

  const disconnect = useCallback(async () => {
    await client.signOut();
    await setSetting('drive_connected', false);
    setStatus('idle');
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

// ─── Helpers PKCE (dupliqués côté client) ───────────────────────────────────────────

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

// ─── Backup / Restore ────────────────────────────────────────────────────────────────────

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
