'use client';

import { useDrive } from '@/components/providers/DriveSyncProvider';
import { Cloud, Loader, X } from 'lucide-react';
import { useState } from 'react';

export function ReconnectBanner() {
  const { needsReconnect, status, reconnect } = useDrive();
  const [dismissed, setDismissed] = useState(false);

  if (!needsReconnect || dismissed) return null;

  const isLoading = status === 'loading' || status === 'syncing';

  return (
    <div
      role="alert"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '12px', padding: '10px 20px',
        background: 'var(--color-primary)', color: '#fff',
        fontSize: 'var(--text-sm)', boxShadow: 'var(--shadow-md)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Cloud size={15} />
        <span>
          Vos données sont synchronisées sur Google Drive. 
          <strong>Reconnectez-vous pour charger la dernière version.</strong>
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <button
          onClick={reconnect}
          disabled={isLoading}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '5px 14px', borderRadius: 'var(--radius-sm)',
            background: '#fff', color: 'var(--color-primary)',
            fontSize: 'var(--text-sm)', fontWeight: 600,
            opacity: isLoading ? 0.7 : 1,
            cursor: isLoading ? 'not-allowed' : 'pointer', border: 'none',
          }}
        >
          {isLoading
            ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} />
            : <Cloud size={13} />}
          {isLoading ? 'Chargement…' : 'Se reconnecter'}
        </button>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Fermer"
          style={{
            display: 'flex', alignItems: 'center', padding: '4px',
            borderRadius: 'var(--radius-sm)', background: 'transparent',
            color: 'rgba(255,255,255,0.8)', border: 'none', cursor: 'pointer',
          }}
        >
          <X size={15} />
        </button>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
