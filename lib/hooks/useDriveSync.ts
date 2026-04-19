'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { DriveClient, DriveStatus } from '@/lib/drive-sync';
import { getSetting, setSetting, registerDriveSyncCallback, setRestoreInProgress } from '@/lib/db';
import { buildBackup, mergeFromBackup } from '@/lib/drive-merge';

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';

// ─── Paramètres de timing ──────────────────────────────────────────────────
const UPLOAD_DEBOUNCE_MS = 1500;   // Debounce court : on sauvegarde vite après une saisie
const POLL_INTERVAL_MS   = 30_000; // Polling Drive toutes les 30 s
const RETRY_BASE_MS      = 2_000;  // Premier retry après 2 s, puis exponentiel
const RETRY_MAX_MS       = 60_000; // Backoff plafonné à 1 min
const RETRY_MAX_ATTEMPTS = 6;

let clientInstance: DriveClient | null = null;
function getClient(): DriveClient {
  if (!clientInstance) clientInstance = new DriveClient(CLIENT_ID);
  return clientInstance;
}

export function useDriveSync() {
  const [status,     setStatus]     = useState<DriveStatus>('idle');
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [error,      setError]      = useState<string | null>(null);

  const statusRef      = useRef<DriveStatus>('idle');
  const uploadTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimer      = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAttempt   = useRef<number>(0);
  const syncInFlight   = useRef<boolean>(false);
  const pendingSync    = useRef<boolean>(false);
  const lastRemoteTime = useRef<string | null>(null);
  // Devient true quand l'utilisateur (ou du code applicatif) modifie Dexie.
  // Retombe à false après un upload réussi. Empêche le ping-pong entre appareils
  // (sans ce flag, chaque poll déclencherait un ré-upload identique).
  const localDirty     = useRef<boolean>(false);

  const client = getClient();

  function updateStatus(s: DriveStatus) {
    statusRef.current = s;
    setStatus(s);
  }

  // ─── Cœur de la synchronisation : pull → merge → push conditionnel ──────
  // - On pull toujours (pour détecter les modifs des autres appareils)
  // - On push UNIQUEMENT si localDirty ou forcePush
  const runSyncCycle = useCallback(async (
    opts: { forcePush?: boolean } = {},
  ): Promise<boolean> => {
    if (syncInFlight.current) { pendingSync.current = true; return false; }
    const s = statusRef.current;
    if (s === 'idle' || s === 'disconnected' || s === 'loading') return false;

    // On fige le bit local dès l'entrée pour éviter qu'une écriture entre
    // le pull et le push l'efface prématurément.
    const shouldPush = opts.forcePush === true || localDirty.current;
    localDirty.current = false;

    syncInFlight.current = true;
    updateStatus('syncing');
    try {
      // ── 1. PULL ───────────────────────────────────────────────────────
      const localSyncedAt = await getSetting<string | null>('last_synced_at', null);
      const remote = await client.download();

      let remoteExportedAt: string | null = null;
      if (remote !== null) {
        remoteExportedAt = remote.backup?.exportedAt ?? null;
        const remoteNewer = !localSyncedAt
          || (remoteExportedAt && Date.parse(remoteExportedAt) > Date.parse(localSyncedAt));
        if (remoteNewer) {
          setRestoreInProgress(true);
          try {
            await mergeFromBackup(remote.backup, localSyncedAt);
          } finally {
            setRestoreInProgress(false);
          }
        }
        if (remote.modifiedTime) lastRemoteTime.current = remote.modifiedTime;
      }

      // ── 2. PUSH (conditionnel) ────────────────────────────────────────
      if (shouldPush) {
        const backup = await buildBackup();
        const uploadResult = await client.upload(backup);
        if (uploadResult?.modifiedTime) lastRemoteTime.current = uploadResult.modifiedTime;
        await setSetting('last_synced_at', backup.exportedAt);
      } else if (remoteExportedAt) {
        // Pas de push mais on a pullé : aligner last_synced_at sur le distant
        // pour que le prochain cycle n'ait pas à re-pull le même backup.
        await setSetting('last_synced_at', remoteExportedAt);
      }

      // ── 3. Marqueurs de succès ───────────────────────────────────────
      await setSetting('last_sync_success_at', new Date().toISOString());
      await setSetting('last_sync_error', null);
      setLastSynced(new Date());
      setError(null);
      updateStatus('connected');
      retryAttempt.current = 0;
      return true;
    } catch (e: any) {
      // Si on avait prévu de push, remarque qu'on a toujours du dirty à propager
      if (shouldPush) localDirty.current = true;
      const msg = e?.message ?? 'Erreur de synchronisation';
      setError(msg);
      await setSetting('last_sync_error', msg).catch(() => {});
      updateStatus('error');
      scheduleRetry();
      return false;
    } finally {
      syncInFlight.current = false;
      if (pendingSync.current) {
        pendingSync.current = false;
        scheduleSync();
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Retry avec backoff exponentiel ─────────────────────────────────────
  const scheduleRetry = useCallback(() => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    if (retryAttempt.current >= RETRY_MAX_ATTEMPTS) return;
    const delay = Math.min(RETRY_BASE_MS * Math.pow(2, retryAttempt.current), RETRY_MAX_MS);
    retryAttempt.current += 1;
    retryTimer.current = setTimeout(() => { void runSyncCycle(); }, delay);
  }, [runSyncCycle]);

  // ─── Debounced schedule — appelé par le middleware Dexie ────────────────
  const scheduleSync = useCallback(() => {
    // Chaque appel du middleware signifie : « un record user-editable vient
    // de changer ». On marque dirty et on arme un timer d'upload.
    localDirty.current = true;
    const s = statusRef.current;
    if (s === 'idle' || s === 'disconnected' || s === 'loading') return;
    if (uploadTimer.current) clearTimeout(uploadTimer.current);
    uploadTimer.current = setTimeout(() => { void runSyncCycle(); }, UPLOAD_DEBOUNCE_MS);
  }, [runSyncCycle]);

  useEffect(() => {
    registerDriveSyncCallback(scheduleSync);
  }, [scheduleSync]);

  // ─── Au démarrage : silent refresh + first pull ─────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    if (params.get('drive') === 'connected') {
      window.history.replaceState({}, '', window.location.pathname);
      void initialLoad();
      return;
    }

    updateStatus('loading');
    client.trySilentRefresh().then(async (ok) => {
      if (ok) {
        await initialLoad();
      } else {
        const wasConnected = await getSetting<boolean>('drive_connected', false);
        updateStatus(wasConnected ? 'disconnected' : 'idle');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function initialLoad() {
    updateStatus('syncing');
    try {
      const localSyncedAt = await getSetting<string | null>('last_synced_at', null);
      const remote = await client.download();

      if (remote === null) {
        // Pas de fichier Drive : premier upload à faire, Dexie intact.
        await setSetting('drive_connected', true);
        updateStatus('connected');
        localDirty.current = true; // force le push initial
        void runSyncCycle({ forcePush: true });
        startPolling();
        return;
      }

      setRestoreInProgress(true);
      try {
        await mergeFromBackup(remote.backup, localSyncedAt);
      } finally {
        setRestoreInProgress(false);
      }

      if (remote.modifiedTime) lastRemoteTime.current = remote.modifiedTime;
      await setSetting('last_synced_at', remote.backup.exportedAt ?? new Date().toISOString());
      await setSetting('last_sync_success_at', new Date().toISOString());
      await setSetting('drive_connected', true);
      setLastSynced(new Date());
      setError(null);
      updateStatus('connected');
      startPolling();
      // Au cas où des modifs locales existent (créées offline), on les pousse
      if (localDirty.current) void runSyncCycle();
    } catch (e: any) {
      setRestoreInProgress(false);
      setError(e?.message ?? 'Erreur de chargement Drive');
      updateStatus('error');
    }
  }

  // ─── Polling : détecte les modifications venant des autres appareils ────
  function startPolling() {
    if (pollTimer.current) return;
    pollTimer.current = setInterval(async () => {
      if (statusRef.current !== 'connected') return;
      if (syncInFlight.current) return;
      // Requête "metaOnly" : on ne télécharge que le modifiedTime
      const meta = await client.fetchRemoteMeta();
      if (!meta?.modifiedTime) return;
      if (lastRemoteTime.current && meta.modifiedTime === lastRemoteTime.current) return;
      // Drive a changé depuis notre dernier pull → pull + merge (pas de push sauf dirty)
      lastRemoteTime.current = meta.modifiedTime;
      void runSyncCycle();
    }, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
  }

  // Relance un cycle quand l'onglet redevient visible
  useEffect(() => {
    if (typeof document === 'undefined') return;
    function onVisible() {
      if (document.visibilityState === 'visible' && statusRef.current === 'connected') {
        void runSyncCycle();
      }
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [runSyncCycle]);

  // Reconnexion réseau → synchro immédiate
  useEffect(() => {
    if (typeof window === 'undefined') return;
    function onOnline() {
      if (statusRef.current === 'error' || statusRef.current === 'connected') {
        void runSyncCycle();
      }
    }
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [runSyncCycle]);

  // Cleanup timers au démontage
  useEffect(() => {
    return () => {
      if (uploadTimer.current) clearTimeout(uploadTimer.current);
      if (retryTimer.current)  clearTimeout(retryTimer.current);
      stopPolling();
    };
  }, []);

  // ─── Actions publiques ──────────────────────────────────────────────────

  const connect = useCallback(async () => {
    setError(null);
    try {
      const verifier    = generateRandomString(64);
      const challenge   = await generateCodeChallenge(verifier);
      const redirectUri = `${window.location.origin}/api/drive/callback`;
      const state       = generateRandomString(16);

      document.cookie = `pkce_verifier=${verifier}; path=/; max-age=300; samesite=lax`;
      document.cookie = `pkce_redirect=${encodeURIComponent(redirectUri)}; path=/; max-age=300; samesite=lax`;
      document.cookie = `pkce_state=${state}; path=/; max-age=300; samesite=lax`;

      const urlParams = new URLSearchParams({
        client_id:             CLIENT_ID,
        redirect_uri:          redirectUri,
        response_type:         'code',
        scope:                 'https://www.googleapis.com/auth/drive.appdata openid email',
        code_challenge:        challenge,
        code_challenge_method: 'S256',
        access_type:           'offline',
        prompt:                'consent',
        state,
      });
      window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${urlParams}`;
    } catch (e: any) {
      setError(e?.message ?? "Erreur d'initialisation OAuth");
    }
  }, []);

  const disconnect = useCallback(async () => {
    stopPolling();
    if (uploadTimer.current) clearTimeout(uploadTimer.current);
    if (retryTimer.current)  clearTimeout(retryTimer.current);
    await client.signOut();
    await setSetting('drive_connected', false);
    await setSetting('last_synced_at', null);
    updateStatus('idle');
    setLastSynced(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncNow = useCallback(async () => {
    retryAttempt.current = 0;
    await runSyncCycle({ forcePush: true });
  }, [runSyncCycle]);

  // needsReconnect : l'utilisateur était connecté, son refresh token a expiré ou
  // a été révoqué. Affiche une bannière pour le prévenir.
  const needsReconnect = status === 'disconnected';

  return {
    status, lastSynced, error,
    connect, disconnect, syncNow, scheduleSync,
    // Alias sémantiques utilisés par ReconnectBanner
    needsReconnect,
    reconnect: connect,
  };
}

// ─── Backwards-compat exports ──────────────────────────────────────────────
export { buildBackup, mergeFromBackup as restoreFromBackup } from '@/lib/drive-merge';

// ─── Helpers PKCE ──────────────────────────────────────────────────────────

function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => chars[b % chars.length]).join('');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data    = encoder.encode(verifier);
  const digest  = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
