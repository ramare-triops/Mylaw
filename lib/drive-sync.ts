/**
 * Google Drive Sync — lib/drive-sync.ts
 *
 * Architecture OAuth PKCE + refresh token HttpOnly cookie.
 * Tous les appels Drive passent par les routes /api/drive/* côté serveur.
 * Le client ne stocke aucun token — le cookie HttpOnly fait foi.
 */

export interface MylawBackup {
  version: number;
  exportedAt: string;
  documents: any[];
  folders: any[];
  snippets: any[];
  deadlines: any[];
  settings: Record<string, any>;
  templates: any[];
  tools: any[];
  aiChats: any[];
  /** Briques de contenu réutilisables */
  bricks: any[];
  /** Étiquettes d'information structurées */
  infoLabels: any[];
  /** Sessions d'utilisation des outils (ajouté v3.1) */
  sessions?: any[];
}

export type DriveStatus =
  | 'idle'
  | 'loading'
  | 'connected'
  | 'syncing'
  | 'error'
  | 'disconnected';

export class DriveClient {
  private clientId: string;

  constructor(clientId: string) {
    this.clientId = clientId;
  }

  /**
   * Tente un rafraîchissement silencieux via le cookie HttpOnly.
   * Retourne true si le cookie existe et permet d'obtenir un access token.
   */
  async trySilentRefresh(): Promise<boolean> {
    try {
      const res = await fetch('/api/drive/token');
      if (!res.ok) return false;
      const data = await res.json();
      return !!data.access_token;
    } catch {
      return false;
    }
  }

  async signOut(): Promise<void> {
    await fetch('/api/drive/logout', { method: 'POST' });
  }

  /**
   * Télécharge le backup depuis Drive via le proxy sécurisé.
   * Retourne aussi le modifiedTime remonté par Drive (header X-Drive-Modified-Time)
   * pour que l'appelant puisse tracer d'où vient la version pulled.
   */
  async download(): Promise<{ backup: MylawBackup; modifiedTime: string | null } | null> {
    try {
      const res = await fetch('/api/drive/sync');
      if (res.status === 204) return null;
      if (!res.ok) return null;
      const backup = await res.json();
      return { backup, modifiedTime: res.headers.get('X-Drive-Modified-Time') };
    } catch {
      return null;
    }
  }

  /**
   * Récupère uniquement le modifiedTime du fichier Drive. Utilisé pour le polling
   * périodique : on évite de re-télécharger tout le backup si rien n'a changé.
   * Retourne null si le fichier n'existe pas encore ou si le token est invalide.
   */
  async fetchRemoteMeta(): Promise<{ modifiedTime: string | null } | null> {
    try {
      const res = await fetch('/api/drive/sync?metaOnly=1');
      if (res.status === 204 || !res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  /**
   * Uploade le backup vers Drive via le proxy sécurisé.
   * Ne lance pas d'exception si le cookie est absent — le serveur retourne 401 silencieusement.
   * Retourne le modifiedTime du fichier après upload (pour détecter nos propres uploads au poll).
   */
  async upload(backup: MylawBackup): Promise<{ modifiedTime: string | null } | null> {
    const res = await fetch('/api/drive/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(backup),
    });
    if (res.status === 401) return null;
    if (!res.ok) throw new Error(`Drive upload failed: ${res.status}`);
    const data = await res.json().catch(() => ({}));
    return { modifiedTime: data.modifiedTime ?? null };
  }
}
