'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Send, Sparkles, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AIMessage } from '@/types';

export function AIPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 'i') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg: AIMessage = { role: 'user', content: input, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, userMsg].map(({ role, content }) => ({ role, content })) }),
      });

      if (!res.ok) throw new Error('AI unavailable');

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '', timestamp: new Date() },
      ]);

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        assistantContent += chunk;
        setMessages((prev) => [
          ...prev.slice(0, -1),
          { role: 'assistant', content: assistantContent, timestamp: new Date() },
        ]);
      }
    } catch {
      setAiAvailable(false);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '⚠️ L\'assistant IA est temporairement indisponible. Vérifiez votre clé API dans les paramètres.',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className={cn(
        'fixed right-0 top-0 h-full w-[400px] z-30 flex flex-col animate-slide-in-right',
        'bg-[var(--color-surface)] border-l border-[var(--color-border)] shadow-xl'
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)] flex-shrink-0">
        <Sparkles className="w-4 h-4 text-[var(--color-primary)]" />
        <span className="font-semibold text-sm text-[var(--color-text)]">Assistant IA</span>
        {!aiAvailable && (
          <span className="ml-2 text-xs text-[var(--color-warning)] bg-orange-50 px-2 py-0.5 rounded">
            Hors ligne
          </span>
        )}
        <button
          onClick={() => setOpen(false)}
          className="ml-auto p-1 rounded hover:bg-[var(--color-surface-raised)] text-[var(--color-text-muted)]"
          aria-label="Fermer l'assistant IA"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-8 text-[var(--color-text-muted)]">
            <Bot className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Posez une question sur votre document ou demandez une assistance juridique.</p>
            <p className="text-xs mt-2 opacity-60">Raccourci : Alt+I</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={cn(
              'flex',
              msg.role === 'user' ? 'justify-end' : 'justify-start'
            )}
          >
            <div
              className={cn(
                'max-w-[85%] rounded-lg px-3 py-2 text-sm',
                msg.role === 'user'
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-[var(--color-surface-raised)] text-[var(--color-text)]'
              )}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-[var(--color-surface-raised)] rounded-lg px-3 py-2">
              <div className="ai-typing flex gap-1">
                <span /><span /><span />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-[var(--color-border)] flex-shrink-0">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Votre question… (Entrée pour envoyer)"
            rows={2}
            className={cn(
              'flex-1 resize-none px-3 py-2 text-sm rounded-md',
              'bg-[var(--color-surface-raised)] border border-[var(--color-border)]',
              'text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)]',
              'focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]'
            )}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            className={cn(
              'px-3 py-2 rounded-md transition-opacity',
              'bg-[var(--color-primary)] text-white',
              (!input.trim() || loading) && 'opacity-40 cursor-not-allowed'
            )}
            aria-label="Envoyer"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
