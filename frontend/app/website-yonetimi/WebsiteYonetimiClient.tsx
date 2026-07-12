'use client';

import { useCallback, useState } from 'react';
import CmsShell from '@/components/cms/CmsShell';
import '@/components/website-admin/website-admin.css';

export default function WebsiteYonetimiClient() {
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');

  const flash = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(''), 4000);
  }, []);

  return (
    <div className="section">
      <div className="page-header">
        <div>
          <h2>Web Sitesi</h2>
          <p className="muted">Kurumun herkese açık web sitesini yönetin</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <a href="/" target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
            Siteyi Önizle ↗
          </a>
        </div>
      </div>

      {message && (
        <div className={`wam-toast ${messageType}`}>{message}</div>
      )}

      <CmsShell onMessage={flash} />
    </div>
  );
}
