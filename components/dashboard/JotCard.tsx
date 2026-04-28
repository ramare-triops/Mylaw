'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ListTodo,
  Plus,
  Check,
  Trash2,
  Link as LinkIcon,
  X,
  CloudOff,
  Loader2,
} from 'lucide-react';
import { db, saveJot, deleteJot, toggleJotDone } from '@/lib/db';
import { Button, Card } from '@/components/ui';
import type { Jot } from '@/types';

/**
 * Liste de tâches du tableau de bord.
 *
 * Persistance locale en IndexedDB + synchronisation bidirectionnelle
 * avec une liste Google Tasks dédiée intitulée « MyLaw » :
 *
 *   - Push : ajout, complétion et suppression locales sont
 *     immédiatement propagées vers Google.
 *   - Pull : au montage, à chaque retour de focus / visibilité, et
 *     toutes les 60 s tant que la page reste ouverte, on tire l'état
 *     actuel de la liste Google (y compris tâches cochées des
 *     14 derniers jours) et on réconcilie :
 *       · si une tâche locale a un `googleTaskId` mais qu'elle n'est
 *         plus présente côté Google → suppression locale (la tâche a
 *         été supprimée depuis le téléphone) ;
 *       · sinon on aligne `done`, `completedAt` et `content` sur ce
 *         que dit Google.
 *
 * Affichage : tâches ouvertes + tâches terminées il y a moins de
 * 7 jours, triées par date de création décroissante. Les tâches
 * cochées plus anciennes restent en base mais disparaissent du widget.
 */

/** Fenêtre de visibilité des tâches terminées, en millisecondes. */
const DONE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** Cadence du pull périodique côté client. */
const PULL_INTERVAL_MS = 60_000;

interface RemoteTask {
  id: string;
  title?: string;
  status?: 'needsAction' | 'completed';
  completed?: string;
  updated?: string;
}

export function JotCard() {
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState<boolean | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const jots = useLiveQuery(() => db.jots.toArray(), []);

  const syncInFlight = useRef(false);

  const checkConnection = useCallback(async () => {
    try {
      const res = await fetch('/api/google-productivity/token');
      setConnected(res.ok);
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    void checkConnection();
  }, [checkConnection]);

  // Retour OAuth — rafraîchir l'état de connexion après consentement.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('gprod')) {
      void checkConnection();
      sp.delete('gprod');
      sp.delete('reason');
      const clean = sp.toString();
      const url = window.location.pathname + (clean ? '?' + clean : '');
      window.history.replaceState({}, '', url);
    }
  }, [checkConnection]);

  /**
   * Synchronisation complète, dans cet ordre :
   *   1. Push des tâches locales sans `googleTaskId` (ajouts hors ligne).
   *   2. Pull de la liste Google (actives + terminées des 14 derniers jours).
   *   3. Réconciliation : alignement / suppression locale.
   */
  const syncAll = useCallback(async () => {
    if (syncInFlight.current) return;
    syncInFlight.current = true;
    setSyncing(true);
    setLastError(null);
    try {
      const rows = await db.jots.toArray();

      // ── Push des ajouts pas encore poussés ──────────────────────
      const pending = rows.filter(
        (j) => !j.googleTaskId && !j.done && !j.pendingDelete,
      );
      for (const j of pending) {
        if (j.id == null) continue;
        const res = await fetch('/api/google-tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: j.content }),
        });
        if (!res.ok) continue;
        const data = await res.json();
        if (data.task?.id) {
          await saveJot({
            ...j,
            googleTaskId: data.task.id,
            googleTaskListId: data.listId ?? 'mylaw',
            googleSyncedAt: new Date(),
          });
        }
      }

      // ── Pull bidirectionnel ────────────────────────────────────
      const pullRes = await fetch('/api/google-tasks?showCompleted=true');
      if (pullRes.ok) {
        const payload = await pullRes.json();
        const remote: RemoteTask[] = payload.items ?? [];
        const remoteListId: string | undefined = payload.listId;
        const remoteById = new Map<string, RemoteTask>();
        for (const t of remote) remoteById.set(t.id, t);

        // 1. Mise à jour des tâches locales connues côté Google.
        const fresh = await db.jots.toArray();
        for (const local of fresh) {
          if (!local.googleTaskId) continue;
          const r = remoteById.get(local.googleTaskId);
          if (!r) {
            // Présente localement, absente de la fenêtre Google des
            // 14 derniers jours → on la considère supprimée si elle
            // était déjà cochée OU si elle n'a jamais été touchée
            // depuis plus de 14 jours. Une tâche active manquante
            // signifie « supprimée à distance » : suppression locale.
            if (local.id != null) await deleteJot(local.id);
            continue;
          }
          const remoteDone = r.status === 'completed';
          const remoteCompletedAt = r.completed
            ? new Date(r.completed)
            : remoteDone
              ? new Date()
              : undefined;
          const remoteContent = (r.title ?? '').trim();
          const needsUpdate =
            remoteDone !== local.done ||
            (remoteContent && remoteContent !== local.content) ||
            (remoteDone &&
              remoteCompletedAt &&
              (!local.completedAt ||
                remoteCompletedAt.getTime() !== local.completedAt.getTime()));
          if (needsUpdate) {
            await saveJot({
              ...local,
              content: remoteContent || local.content,
              done: remoteDone,
              completedAt: remoteDone ? remoteCompletedAt : undefined,
              googleSyncedAt: new Date(),
            });
          }
        }

        // 2. Tâches Google sans pendant local → import.
        const knownRemoteIds = new Set(
          fresh
            .map((j) => j.googleTaskId)
            .filter((s): s is string => Boolean(s)),
        );
        const cutoff = Date.now() - DONE_WINDOW_MS;
        for (const r of remote) {
          if (knownRemoteIds.has(r.id)) continue;
          const remoteDone = r.status === 'completed';
          const completedAt = r.completed ? new Date(r.completed) : undefined;
          // Évite d'importer les vieilles tâches cochées hors fenêtre
          // d'affichage : elles n'apparaîtront pas dans le widget de
          // toute façon, et on ne veut pas polluer la base locale.
          if (remoteDone && completedAt && completedAt.getTime() < cutoff) {
            continue;
          }
          const now = new Date();
          await saveJot({
            content: (r.title ?? '').trim() || 'Sans titre',
            done: remoteDone,
            completedAt: remoteDone ? completedAt : undefined,
            createdAt: r.updated ? new Date(r.updated) : now,
            updatedAt: now,
            googleTaskId: r.id,
            googleTaskListId: remoteListId,
            googleSyncedAt: now,
          });
        }
      }

      setLastSyncAt(new Date());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Synchronisation échouée';
      setLastError(message);
    } finally {
      setSyncing(false);
      syncInFlight.current = false;
    }
  }, []);

  // Auto-sync dès que la connexion est établie.
  useEffect(() => {
    if (connected) void syncAll();
  }, [connected, syncAll]);

  // Pull périodique + au retour de focus / visibilité — c'est ce qui
  // permet à une coche faite sur le téléphone de remonter en quelques
  // dizaines de secondes côté Mylaw.
  useEffect(() => {
    if (!connected) return;
    const id = window.setInterval(() => void syncAll(), PULL_INTERVAL_MS);
    const onFocus = () => void syncAll();
    const onVisibility = () => {
      if (!document.hidden) void syncAll();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [connected, syncAll]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const content = input.trim();
    if (!content) return;
    const now = new Date();
    const id = await saveJot({ content, done: false, createdAt: now, updatedAt: now });
    setInput('');

    // Push immédiat vers Google Tasks si connecté.
    if (connected) {
      setSyncing(true);
      setLastError(null);
      try {
        const res = await fetch('/api/google-tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: content }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.task?.id) {
            const current = await db.jots.get(id);
            if (current) {
              await saveJot({
                ...current,
                googleTaskId: data.task.id,
                googleTaskListId: data.listId ?? 'mylaw',
                googleSyncedAt: new Date(),
              });
            }
            setLastSyncAt(new Date());
          }
        } else {
          // On affiche un message explicite plutôt que d'avaler
          // silencieusement l'erreur — c'est ce qui faisait croire
          // à l'utilisateur que la tâche n'était pas envoyée alors
          // qu'aucune trace n'était visible.
          let info = '';
          try {
            const payload = await res.json();
            info = payload?.detail ? ` (${payload.detail.slice(0, 120)})` : '';
          } catch {
            /* corps non JSON */
          }
          setLastError(
            `Google Tasks a refusé l'ajout (HTTP ${res.status})${info}.`,
          );
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erreur réseau';
        setLastError(`Synchronisation impossible : ${message}.`);
      } finally {
        setSyncing(false);
      }
    }
  }

  async function handleToggle(jot: Jot) {
    if (jot.id == null) return;
    const willBeDone = !jot.done;
    await toggleJotDone(jot.id);
    if (connected && jot.googleTaskId) {
      // On transmet la liste d'origine pour gérer les anciennes tâches @default.
      const url = new URL('/api/google-tasks', window.location.origin);
      url.searchParams.set('id', jot.googleTaskId);
      if (jot.googleTaskListId) url.searchParams.set('listId', jot.googleTaskListId);
      try {
        await fetch(url.toString(), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: willBeDone ? 'completed' : 'needsAction' }),
        });
      } catch {
        /* best-effort */
      }
    }
  }

  async function handleDelete(jot: Jot) {
    if (jot.id == null) return;
    if (connected && jot.googleTaskId) {
      const url = new URL('/api/google-tasks', window.location.origin);
      url.searchParams.set('id', jot.googleTaskId);
      if (jot.googleTaskListId) url.searchParams.set('listId', jot.googleTaskListId);
      try {
        await fetch(url.toString(), { method: 'DELETE' });
      } catch {
        /* best-effort */
      }
    }
    await deleteJot(jot.id);
  }

  function handleConnect() {
    const returnTo = typeof window !== 'undefined' ? window.location.pathname : '/';
    window.location.href = `/api/google-productivity/start?return=${encodeURIComponent(returnTo)}`;
  }

  async function handleDisconnect() {
    await fetch('/api/google-productivity/logout', { method: 'POST' });
    setConnected(false);
    setLastSyncAt(null);
  }

  /**
   * Tâches affichées : ouvertes + terminées il y a moins de 7 jours.
   * Les tâches cochées plus anciennes restent en base (utile pour la
   * réconciliation) mais sortent du widget pour ne pas l'encombrer.
   */
  const cutoff = Date.now() - DONE_WINDOW_MS;
  const visibleJots = (jots ?? [])
    .filter((j) => {
      if (!j.done) return true;
      const t = j.completedAt
        ? new Date(j.completedAt).getTime()
        : new Date(j.updatedAt).getTime();
      return t >= cutoff;
    })
    .slice()
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    })
    .slice(0, 8);

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <ListTodo className="w-4 h-4 text-[var(--color-primary)]" />
          Liste de tâches
        </span>
      }
      padding={0}
      actions={
        connected ? (
          <Button
            variant="ghost"
            size="sm"
            icon={<X className="w-3.5 h-3.5" />}
            onClick={handleDisconnect}
            title="Déconnecter Google Tasks"
          >
            Déconnecter
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            icon={<LinkIcon className="w-3.5 h-3.5" />}
            onClick={handleConnect}
          >
            Connecter Google Tasks
          </Button>
        )
      }
    >
      <div className="border-b border-[var(--border-subtle)] px-5 py-3">
        <form onSubmit={handleAdd} className="flex items-center gap-2">
          <Plus className="h-4 w-4 text-[var(--fg-tertiary)]" />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ajouter une tâche…"
            className="flex-1 bg-transparent text-sm text-[var(--fg-primary)] placeholder:text-[var(--fg-tertiary)] focus:outline-none"
          />
          {input.trim() && (
            <Button type="submit" size="sm" variant="primary">
              Ajouter
            </Button>
          )}
        </form>
      </div>

      {visibleJots.length === 0 ? (
        <div
          className="px-5 py-8 text-center text-[var(--fg-secondary)]"
          style={{ fontFamily: 'var(--font-serif)', fontSize: 15 }}
        >
          Aucune tâche.
        </div>
      ) : (
        visibleJots.map((j, i) => (
          <div
            key={j.id}
            className={
              'group flex items-start gap-3 px-5 py-2.5 ' +
              (i === 0 ? '' : 'border-t border-[var(--border-subtle)]')
            }
          >
            <button
              onClick={() => handleToggle(j)}
              aria-label={j.done ? 'Marquer non terminée' : 'Marquer terminée'}
              className={
                'mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ' +
                (j.done
                  ? 'border-emerald-500 bg-emerald-500 text-white'
                  : 'border-[var(--border-default)] hover:border-[var(--color-primary)]')
              }
            >
              {j.done && <Check className="h-3 w-3" />}
            </button>
            <div className="min-w-0 flex-1">
              <div
                className={
                  'text-sm ' +
                  (j.done
                    ? 'text-[var(--fg-tertiary)] line-through'
                    : 'text-[var(--fg-primary)]')
                }
              >
                {j.content}
              </div>
            </div>
            <button
              onClick={() => handleDelete(j)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-[var(--fg-tertiary)] hover:text-red-500"
              aria-label="Supprimer la tâche"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))
      )}

      <div className="flex items-center gap-2 border-t border-[var(--border-subtle)] px-5 py-2 text-[11px] text-[var(--fg-tertiary)]">
        {connected === null && <span>Vérification…</span>}
        {connected === false && (
          <>
            <CloudOff className="h-3 w-3" />
            Tâches enregistrées localement uniquement.
          </>
        )}
        {connected === true && (
          <>
            {syncing ? (
              <Loader2 className="h-3 w-3 animate-spin text-[var(--color-primary)]" />
            ) : (
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
            )}
            <span>
              {syncing
                ? 'Synchronisation avec MyLaw…'
                : lastSyncAt
                  ? `Synchronisé avec MyLaw · ${relativeTime(lastSyncAt)}`
                  : 'Synchronisé avec la liste MyLaw'}
            </span>
          </>
        )}
      </div>
      {lastError && (
        <div className="border-t border-[var(--border-subtle)] px-5 py-2 text-[11px] text-red-600">
          {lastError}
        </div>
      )}
    </Card>
  );
}

function relativeTime(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 10) return "à l'instant";
  if (s < 60) return `il y a ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  return date.toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
