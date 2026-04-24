'use client';

import { useCallback, useEffect, useState } from 'react';
import { Mail, RefreshCw, Link as LinkIcon, X, ExternalLink } from 'lucide-react';
import { Button, Card } from '@/components/ui';

interface OutlookMessage {
  id: string;
  subject: string;
  from: string;
  fromAddress: string;
  receivedAt: string;
  isRead: boolean;
  preview: string;
  webLink: string | null;
}

function relativeTime(iso: string, now: Date): string {
  const date = new Date(iso);
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'hier';
  if (days < 7) return `il y a ${days} jours`;
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

export function OutlookCard() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<OutlookMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = new Date();

  const loadMessages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/outlook/messages?top=6');
      if (res.status === 401) {
        setConnected(false);
        setMessages([]);
        return;
      }
      if (!res.ok) {
        setError('Lecture des messages impossible.');
        return;
      }
      const data = await res.json();
      setConnected(true);
      setMessages(data.messages ?? []);
    } catch {
      setError('Erreur réseau.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  // Retour OAuth — si ?outlook=connected, on recharge.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('outlook')) {
      void loadMessages();
      sp.delete('outlook');
      sp.delete('reason');
      const clean = sp.toString();
      const url = window.location.pathname + (clean ? '?' + clean : '');
      window.history.replaceState({}, '', url);
    }
  }, [loadMessages]);

  function handleConnect() {
    const returnTo = typeof window !== 'undefined' ? window.location.pathname : '/';
    window.location.href = `/api/outlook/start?return=${encodeURIComponent(returnTo)}`;
  }

  async function handleDisconnect() {
    await fetch('/api/outlook/logout', { method: 'POST' });
    setConnected(false);
    setMessages([]);
  }

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <Mail className="w-4 h-4 text-[var(--color-primary)]" />
          Boîte Outlook
        </span>
      }
      padding={0}
      actions={
        connected ? (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshCw className={'w-3.5 h-3.5 ' + (loading ? 'animate-spin' : '')} />}
              onClick={loadMessages}
              disabled={loading}
            >
              Actualiser
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<X className="w-3.5 h-3.5" />}
              onClick={handleDisconnect}
              title="Déconnecter Outlook"
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
            Connecter Outlook
          </Button>
        )
      }
    >
      {connected === false && (
        <div className="px-5 py-8 text-center">
          <Mail className="mx-auto h-8 w-8 text-[var(--fg-tertiary)] opacity-50" />
          <p className="mt-3 text-sm text-[var(--fg-secondary)]">
            Connectez votre compte Microsoft pour afficher vos derniers emails.
          </p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={handleConnect}>
            Connecter Outlook
          </Button>
        </div>
      )}

      {connected && messages.length === 0 && !loading && (
        <div
          className="px-5 py-8 text-center text-[var(--fg-secondary)]"
          style={{ fontFamily: 'var(--font-serif)', fontSize: 15 }}
        >
          Boîte de réception vide.
        </div>
      )}

      {connected &&
        messages.map((m, i) => (
          <a
            key={m.id}
            href={m.webLink ?? undefined}
            target={m.webLink ? '_blank' : undefined}
            rel={m.webLink ? 'noopener noreferrer' : undefined}
            className={
              'flex w-full items-start gap-3 px-5 py-3 transition-colors ' +
              'hover:bg-[var(--bg-surface-alt)] ' +
              (i === 0 ? '' : 'border-t border-[var(--border-subtle)]')
            }
          >
            <div
              className={
                'mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ' +
                (m.isRead ? 'bg-[var(--border-default)]' : 'bg-[var(--color-primary)]')
              }
              aria-label={m.isRead ? 'Lu' : 'Non lu'}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span
                  className="truncate font-semibold text-[var(--fg-primary)]"
                  style={{ fontSize: 13 }}
                >
                  {m.from}
                </span>
                <span className="flex-shrink-0 text-[11px] text-[var(--fg-tertiary)]">
                  {relativeTime(m.receivedAt, now)}
                </span>
              </div>
              <div className="mt-0.5 truncate text-[12px] text-[var(--fg-primary)]">
                {m.subject}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-[var(--fg-secondary)]">
                {m.preview}
              </div>
            </div>
            {m.webLink && (
              <ExternalLink className="mt-1 h-3 w-3 flex-shrink-0 text-[var(--fg-tertiary)]" />
            )}
          </a>
        ))}

      {error && (
        <div className="border-t border-[var(--border-subtle)] px-5 py-2 text-[11px] text-red-600">
          {error}
        </div>
      )}
    </Card>
  );
}
