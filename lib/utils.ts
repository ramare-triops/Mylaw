import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function extractVariables(content: string): string[] {
  const regex = /\{\{([A-Z_][A-Z0-9_]*)(?::[^}]+)?\}\}/g;
  const matches: string[] = [];
  let m;
  while ((m = regex.exec(content)) !== null) {
    if (!matches.includes(m[1])) matches.push(m[1]);
  }
  return matches;
}

export function replaceVariables(
  content: string,
  values: Record<string, string>
): string {
  return content.replace(
    /\{\{([A-Z_][A-Z0-9_]*)(?::[^}]+)?\}\}/g,
    (match, name) => values[name] ?? match
  );
}

export function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date));
}

export function formatDateTime(date: Date | string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export function generateId(prefix = 'tab'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '…' : str;
}

export function detectLongSentences(
  text: string,
  threshold = 35
): number[] {
  const sentences = text.split(/[.!?]\s/);
  return sentences
    .map((s, i) => ({ i, words: s.split(/\s+/).filter(Boolean).length }))
    .filter(({ words }) => words > threshold)
    .map(({ i }) => i);
}
