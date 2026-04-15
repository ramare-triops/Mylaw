/**
 * Google Drive Sync — lib/drive-sync.ts
 *
 * Architecture OAuth PKCE + refresh token HttpOnly cookie.
 *
 * FLUX DE CONNEXION :
 * 1. L'utilisateur clique "Connecter Drive"
 * 2. On génère un code_verifier PKCE + on redirige vers Google OAuth
 * 3. Google rappelle l'app avec un ?code=...
 * 4. On envoie le code à /api/drive/auth qui l'échange contre access+refresh tokens
 * 5. Le refresh token est stocké dans un cookie HttpOnly (sécurisé, invisible au JS)
 * 6. Les prochains démarrages : /api/drive/token rafraîchit l'access token automatiquement
 * 7. Tous les appels Drive passent par /api/drive/sync (proxy sécurisé)
 *
 * Nécessite : NEXT_PUBLIC_GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET dans .env.local
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
}

export type DriveStatus =
  | 'idle'
  | 'loading'
  | 'connected'
  | 'syncing'
  | 'error'
  | 'disconnected';

// ─── Helpers PKCE ───────────────────────────────────────────────────────────────────

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

// ─── DriveClient ─────────────────────────────────────────────────────────────────

const SCOPES = [
  'https://www.googleapis.com/auth/drive.appdata',
  'openid',
  'email',
].join(' ');

export class DriveClient {
  private clientId: string;
  private codeVerifier: string | null = null;
  private _isConnected = false;

  constructor(clientId: string) {
    this.clientId = clientId;
  }

  /**
   * Tente un rafraîchissement silencieux du token via le cookie.
   * Retourne true si l'utilisateur est déjà connecté, false sinon.
   */
  async trySilentRefresh(): Promise<boolean> {
    try {
      const res = await fetch('/api/drive/token');
      if (!res.ok) return false;
      const data = await res.json();
      this._isConnected = !!data.access_token;
      return this._isConnected;
    } catch {
      return false;
    }
  }

  /**
   * Lance le flow OAuth PKCE.
   * Ouvre la popup Google et retourne une Promise qui se résout
   * quand l'utilisateur a autorisé l'app (via handleOAuthCallback).
   */
  async startOAuthFlow(): Promise<void> {
    if (typeof window === 'undefined') return;

    this.codeVerifier = generateRandomString(64);
    const codeChallenge = await generateCodeChallenge(this.codeVerifier);
    const redirectUri = `${window.location.origin}/api/drive/callback`;
    const state = generateRandomString(16);

    // Stocker le verifier et state en mémoire de session (sessionStorage)
    sessionStorage.setItem('pkce_verifier', this.codeVerifier);
    sessionStorage.setItem('pkce_state', state);
    sessionStorage.setItem('pkce_redirect', redirectUri);

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  /**
   * Échange le code OAuth reçu dans l'URL contre les tokens.
   * Appeler depuis la page de callback (/api/drive/callback).
   */
  async handleOAuthCode(code: string): Promise<void> {
    const codeVerifier = sessionStorage.getItem('pkce_verifier');
    const redirectUri = sessionStorage.getItem('pkce_redirect');
    if (!codeVerifier || !redirectUri) throw new Error('PKCE state manquant');

    const res = await fetch('/api/drive/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, codeVerifier, redirectUri }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? 'Erreur authentification');
    }

    sessionStorage.removeItem('pkce_verifier');
    sessionStorage.removeItem('pkce_state');
    sessionStorage.removeItem('pkce_redirect');
    this._isConnected = true;
  }

  async signOut(): Promise<void> {
    await fetch('/api/drive/logout', { method: 'POST' });
    this._isConnected = false;
  }

  isConnected(): boolean {
    return this._isConnected;
  }

  /**
   * Télécharge le backup depuis Drive via le proxy sécurisé.
   */
  async download(): Promise<MylawBackup | null> {
    try {
      const res = await fetch('/api/drive/sync');
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  /**
   * Uploade le backup vers Drive via le proxy sécurisé.
   */
  async upload(backup: MylawBackup): Promise<void> {
    await fetch('/api/drive/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(backup),
    });
  }
}
