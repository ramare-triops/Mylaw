'use client';

import { useDrive } from '@/components/providers/DriveSyncProvider';
import { Cloud, CloudOff, RefreshCw, CheckCircle, AlertCircle, Loader } from 'lucide-react';

export function DriveSyncSection() {
  const { status, lastSynced, error, connect, disconnect, syncNow } = useDrive();

  const isConnected = status === 'connected' || status === 'synced' || status === 'syncing';
  const isSyncing = status === 'syncing' || status === 'loading';

  const statusConfig: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
    idle:         { label: 'Non connecté',     color: 'var(--color-text-muted)', Icon: CloudOff },
    loading:      { label: 'Initialisation…',  color: 'var(--color-text-muted)', Icon: Loader },
    disconnected: { label: 'Déconnecté',       color: 'var(--color-text-muted)', Icon: CloudOff },
    connected:    { label: 'Connecté',         color: 'var(--color-success)',    Icon: CheckCircle },
    syncing:      { label: 'Synchronisation…', color: 'var(--color-primary)',    Icon: Loader },
    synced:       { label: 'Synchronisé',      color: 'var(--color-success)',    Icon: CheckCircle },
    error:        { label: 'Erreur',           color: 'var(--color-error)',      Icon: AlertCircle },
  };

  const cfg = statusConfig[status] ?? statusConfig.idle;
  const StatusIcon = cfg.Icon;

  return (
    <div style={{
      padding: '20px',
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        <Cloud size={18} style={{ color: 'var(--color-primary)' }} />
        <div>
          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text)' }}>
            Synchronisation Google Drive
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: '1px' }}>
            Vos données sont sauvegardées dans votre Drive et accessibles sur tous vos appareils
          </div>
        </div>
      </div>

      {/* Status badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px' }}>
        <StatusIcon
          size={13}
          style={{
            color: cfg.color,
            animation: isSyncing ? 'spin 1s linear infinite' : 'none',
          }}
        />
        <span style={{ fontSize: 'var(--text-xs)', color: cfg.color, fontWeight: 500 }}>
          {cfg.label}
        </span>
        {lastSynced && (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-faint)', marginLeft: '8px' }}>
            — dernière sync {lastSynced.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div style={{
          padding: '8px 12px',
          background: 'var(--color-error-highlight)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 'var(--text-xs)',
          color: 'var(--color-error)',
          marginBottom: '12px',
        }}>
          {error}
        </div>
      )}

      {/* What is synced */}
      <div style={{
        padding: '10px 12px',
        background: 'var(--color-surface-offset)',
        borderRadius: 'var(--radius-sm)',
        fontSize: 'var(--text-xs)',
        color: 'var(--color-text-muted)',
        marginBottom: '16px',
        lineHeight: 1.7,
      }}>
        <strong style={{ color: 'var(--color-text)' }}>Données synchronisées :</strong><br />
        Documents · Snippets · Échéances · Paramètres · Modèles personnalisés
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {!isConnected ? (
          <button
            onClick={connect}
            disabled={isSyncing}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '7px 16px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-primary)',
              color: '#fff',
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              opacity: isSyncing ? 0.7 : 1,
              cursor: isSyncing ? 'not-allowed' : 'pointer',
            }}
          >
            <Cloud size={14} />
            Connecter Google Drive
          </button>
        ) : (
          <>
            <button
              onClick={syncNow}
              disabled={isSyncing}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '7px 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-primary)',
                color: '#fff',
                fontSize: 'var(--text-sm)',
                fontWeight: 500,
                opacity: isSyncing ? 0.7 : 1,
                cursor: isSyncing ? 'not-allowed' : 'pointer',
              }}
            >
              <RefreshCw size={13} style={{ animation: isSyncing ? 'spin 1s linear infinite' : 'none' }} />
              Synchroniser maintenant
            </button>
            <button
              onClick={disconnect}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '7px 14px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                background: 'transparent',
                color: 'var(--color-text-muted)',
                fontSize: 'var(--text-sm)',
                cursor: 'pointer',
              }}
            >
              <CloudOff size={13} />
              Déconnecter
            </button>
          </>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
