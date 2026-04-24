'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { StickyNote, Plus, Check, Trash2, RefreshCw, Link as LinkIcon, X, CloudOff } from 'lucide-react';
import { db, saveJot, deleteJot, toggleJotDone } from '@/lib/db';
import { Button, Card } from '@/components/ui';
import type { Jot } from '@/types';

/**
 * Jot / Quick note dashboard widget.
 * Saisie rapide stockée en IndexedDB, avec bouton « Sync Google Tasks »
 * qui pousse chaque jot non encore synchronisé vers la liste @default de
 * l'utilisateur. La connexion utilise /api/google-productivity/start.
 */
export function JotCard() {
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState<boolean | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const jots = useLiveQuery(() => db.jots.toArray(), []);

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

  // Gère le retour OAuth : si ?gprod=connected dans l'URL, on rafraîchit.
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

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const content = input.trim();
    if (!content) return;
    const now = new Date();
    await saveJot({ content, done: false, createdAt: now, updatedAt: now });
    setInput('');
  }

  async function handleToggle(id: number, currentlyDone: boolean, remoteId?: string) {
    await toggleJotDone(id);
    // Reflète le changement côté Google Tasks si le jot y est lié.
    if (connected && remoteId) {
      try {
        await fetch(`/api/google-tasks?id=${encodeURIComponent(remoteId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: currentlyDone ? 'needsAction' : 'completed' }),
        });
      } catch { /* best-effort */ }
    }
  }

  async function handleDelete(jot: Jot) {
    if (jot.id == null) return;
    if (connected && jot.googleTaskId) {
      try {
        await fetch(`/api/google-tasks?id=${encodeURIComponent(jot.googleTaskId)}`, { method: 'DELETE' });
      } catch { /* best-effort */ }
    }
    await deleteJot(jot.id);
  }

  async function handleConnect() {
    const returnTo = typeof window !== 'undefined' ? window.location.pathname : '/';
    window.location.href = `/api/google-productivity/start?return=${encodeURIComponent(returnTo)}`;
  }

  async function handleDisconnect() {
    await fetch('/api/google-productivity/logout', { method: 'POST' });
    setConnected(false);
  }

  async function syncAll() {
    if (!connected) return;
    setSyncing(true);
    setLastError(null);
    try {
      const pending = (jots ?? []).filter((j) => !j.googleTaskId && !j.done);
      for (const j of pending) {
        const res = await fetch('/api/google-tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: j.content }),
        });
        if (!res.ok) continue;
        const data = await res.json();
        if (j.id && data.task?.id) {
          await saveJot({
            ...j,
            googleTaskId: data.task.id,
            googleTaskListId: '@default',
            googleSyncedAt: new Date(),
          });
        }
      }
    } catch (err: any) {
      setLastError(err?.message ?? 'Sync échouée');
    } finally {
      setSyncing(false);
    }
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
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshCw className={'w-3.5 h-3.5 ' + (syncing ? 'animate-spin' : '')} />}
              onClick={syncAll}
              disabled={syncing}
              title="Pousser les notes non synchronisées vers Google Tasks"
            >
              Sync
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<X className="w-3.5 h-3.5" />}
              onClick={handleDisconnect}
              title="Déconnecter Google Tasks"
            >
              Déconnecter
            </Button>
          </div>
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
              onClick={() => j.id != null && handleToggle(j.id, j.done, j.googleTaskId)}
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
              {j.googleTaskId && (
                <div className="mt-0.5 flex items-center gap-1 text-[10px] text-[var(--fg-tertiary)]">
                  <LinkIcon className="h-3 w-3" />
                  Synchronisé Google Tasks
                </div>
              )}
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

      {connected === false && (
        <div className="flex items-center gap-2 border-t border-[var(--border-subtle)] px-5 py-2 text-[11px] text-[var(--fg-tertiary)]">
          <CloudOff className="h-3 w-3" />
          Les notes sont enregistrées en local uniquement.
        </div>
      )}
      {lastError && (
        <div className="border-t border-[var(--border-subtle)] px-5 py-2 text-[11px] text-red-600">
          {lastError}
        </div>
      )}
    </Card>
  );
}
