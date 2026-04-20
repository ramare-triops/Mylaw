/**
 * Store en mémoire partagé entre les routes /api/open-office/*.
 * Conserve temporairement (TTL 5 min) les fichiers Office envoyés par le
 * client pour qu'ils puissent être récupérés par Word / Excel / PowerPoint
 * via le protocole ms-word / ms-excel / ms-powerpoint (Office URI Scheme).
 *
 * Stocké sur `globalThis` pour survivre aux hot-reloads de Next.js en dev.
 */

export interface OfficeTokenEntry {
  data: Buffer;
  mime: string;
  name: string;
  expires: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __mylaw_officeTokenStore: Map<string, OfficeTokenEntry> | undefined;
  // eslint-disable-next-line no-var
  var __mylaw_officeTokenCleanup: NodeJS.Timeout | undefined;
}

function getStore(): Map<string, OfficeTokenEntry> {
  if (!globalThis.__mylaw_officeTokenStore) {
    globalThis.__mylaw_officeTokenStore = new Map<string, OfficeTokenEntry>();
  }
  if (!globalThis.__mylaw_officeTokenCleanup) {
    globalThis.__mylaw_officeTokenCleanup = setInterval(() => {
      const now = Date.now();
      const store = globalThis.__mylaw_officeTokenStore!;
      store.forEach((v, k) => {
        if (v.expires < now) store.delete(k);
      });
    }, 30_000);
    // Laisse Node.js sortir proprement même si le timer tourne
    globalThis.__mylaw_officeTokenCleanup.unref?.();
  }
  return globalThis.__mylaw_officeTokenStore;
}

export const tokenStore = getStore();

/** TTL d'un token (5 min — assez pour que Word récupère le fichier). */
export const TOKEN_TTL_MS = 5 * 60 * 1000;

/** Taille max acceptée côté serveur (50 Mo). */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
