'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { StickyNote, Plus, Check, Trash2, Link as LinkIcon, X, CloudOff, Loader2 } from 'lucide-react';
import { db, saveJot, deleteJot, toggleJotDone } from '@/lib/db';
import { Button, Card } from '@/components/ui';
import type { Jot } from '@/types';

/**
 * Jot / Quick note dashboard widget.
 *
 * Saisie rapide stockée en IndexedDB et synchronisée en temps réel avec
 * une liste Google Tasks dédiée « MyLaw ». Le serveur se charge de créer
 * la liste si elle n'existe pas encore. Aucune action manuelle :
 *   - au montage, toutes les notes non synchronisées sont poussées ;
 *   - à l'ajout, la note part immédiatement vers Google ;
 *   - au toggle / suppression, la tâche distante est mise à jour.
 */
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

  const syncAll = useCallback(async () => {
    if (syncInFlight.current) return;
    syncInFlight.current = true;
    setSyncing(true);
    setLastError(null);
    try {
      const rows = await db.jots.toArray();
      const pending = rows.filter((j) => !j.googleTaskId && !j.done);
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
      setLastSyncAt(new Date());
    } catch (err: any) {
      setLastError(err?.message ?? 'Synchronisation échouée');
    } finally {
      setSyncing(false);
      syncInFlight.current = false;
    }
  }, []);

  // Auto-sync dès que la connexion est établie.
  useEffect(() => {
    if (connected) void syncAll();
  }, [connected, syncAll]);

  // Auto-sync périodique très léger : si la page reste ouverte et que de
  // nouvelles notes sont ajoutées puis oubliées, on pousse en arrière-plan.
  useEffect(() => {
    if (!connected || !jots) return;
    const unpushed = jots.some((j) => !j.googleTaskId && !j.done);
    if (unpushed) {
      const t = setTimeout(() => void syncAll(), 300);
      return () => clearTimeout(t);
    }
  }, [jots, connected, syncAll]);

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
        }
      } catch { /* best-effort, la sync de fond rattrapera */ }
      finally {
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
      } catch { /* best-effort */ }
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
      } catch { /* best-effort */ }
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

  const visibleJots = (jots ?? [])
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
          <StickyNote className="w-4 h-4 text-[var(--color-primary)]" />
          Jot — notes rapides
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
            placeholder="Ajouter une note rapide…"
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
          Aucune note.
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
              aria-label={j.done ? 'Marquer non terminé' : 'Marquer terminé'}
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
              aria-label="Supprimer la note"
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
            Notes enregistrées localement uniquement.
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
