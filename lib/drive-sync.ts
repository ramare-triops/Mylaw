/**
 * Google Drive Sync — lib/drive-sync.ts
 *
 * Stocke toutes les données Mylex dans un fichier JSON unique
 * dans l'espace AppData privé de Google Drive (invisible pour l'utilisateur
 * dans "Mon Drive", accessible uniquement par cette app).
 *
 * Nécessite : NEXT_PUBLIC_GOOGLE_CLIENT_ID dans .env.local
 */

const DRIVE_FILE_NAME = 'mylex-backup.json';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata';

declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MylexBackup {
  version: number;
  exportedAt: string;
  documents: any[];
  snippets: any[];
  deadlines: any[];
  settings: Record<string, any>;
  templates: any[];
}

export type DriveStatus =
  | 'idle'
  | 'loading'
  | 'connected'
  | 'syncing'
  | 'synced'
  | 'error'
  | 'disconnected';

// ─── Load Google API scripts ─────────────────────────────────────────────────

let gapiLoaded = false;
let gisLoaded = false;

export function loadGapiScript(): Promise<void> {
  return new Promise((resolve) => {
    if (gapiLoaded || typeof window === 'undefined') { resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => { gapiLoaded = true; resolve(); };
    document.head.appendChild(script);
  });
}

export function loadGisScript(): Promise<void> {
  return new Promise((resolve) => {
    if (gisLoaded || typeof window === 'undefined') { resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = () => { gisLoaded = true; resolve(); };
    document.head.appendChild(script);
  });
}

// ─── DriveClient ─────────────────────────────────────────────────────────────

export class DriveClient {
  private clientId: string;
  private tokenClient: any = null;
  private accessToken: string | null = null;
  private fileId: string | null = null;

  constructor(clientId: string) {
    this.clientId = clientId;
  }

  async init(): Promise<void> {
    await Promise.all([loadGapiScript(), loadGisScript()]);
    await new Promise<void>((resolve) =>
      window.gapi.load('client', resolve)
    );
    await window.gapi.client.init({
      discoveryDocs: [DISCOVERY_DOC],
    });
    this.tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: this.clientId,
      scope: SCOPES,
      callback: () => {},
    });
  }

  async signIn(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.tokenClient.callback = (resp: any) => {
        if (resp.error) { reject(new Error(resp.error)); return; }
        this.accessToken = resp.access_token;
        window.gapi.client.setToken({ access_token: resp.access_token });
        resolve();
      };
      this.tokenClient.requestAccessToken({ prompt: 'consent' });
    });
  }

  signOut(): void {
    if (this.accessToken) {
      window.google.accounts.oauth2.revoke(this.accessToken);
    }
    this.accessToken = null;
    this.fileId = null;
    window.gapi.client.setToken(null);
  }

  isConnected(): boolean {
    return !!this.accessToken;
  }

  // Find or create the backup file in appDataFolder
  private async resolveFileId(): Promise<string> {
    if (this.fileId) return this.fileId;

    const res = await window.gapi.client.drive.files.list({
      spaces: 'appDataFolder',
      fields: 'files(id, name)',
      q: `name = '${DRIVE_FILE_NAME}'`,
    });
    const files = res.result.files || [];
    if (files.length > 0) {
      this.fileId = files[0].id;
      return this.fileId!;
    }

    // Create the file
    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;
    const metadata = JSON.stringify({ name: DRIVE_FILE_NAME, parents: ['appDataFolder'] });
    const emptyBackup: MylexBackup = {
      version: 1, exportedAt: new Date().toISOString(),
      documents: [], snippets: [], deadlines: [], settings: {}, templates: [],
    };
    const body =
      delimiter + 'Content-Type: application/json\r\n\r\n' + metadata +
      delimiter + 'Content-Type: application/json\r\n\r\n' + JSON.stringify(emptyBackup) +
      closeDelimiter;

    const createRes = await window.gapi.client.request({
      path: '/upload/drive/v3/files',
      method: 'POST',
      params: { uploadType: 'multipart', fields: 'id' },
      headers: { 'Content-Type': `multipart/related; boundary="${boundary}"` },
      body,
    });
    this.fileId = createRes.result.id;
    return this.fileId!;
  }

  async download(): Promise<MylexBackup | null> {
    try {
      const fileId = await this.resolveFileId();
      const res = await window.gapi.client.drive.files.get({
        fileId,
        alt: 'media',
      });
      return res.result as MylexBackup;
    } catch {
      return null;
    }
  }

  async upload(backup: MylexBackup): Promise<void> {
    const fileId = await this.resolveFileId();
    backup.exportedAt = new Date().toISOString();
    await window.gapi.client.request({
      path: `/upload/drive/v3/files/${fileId}`,
      method: 'PATCH',
      params: { uploadType: 'media' },
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(backup),
    });
  }
}
