'use client';

import { useCallback, useEffect, useState } from 'react';
import SinavCalendarAdmin from '@/components/website-admin/SinavCalendarAdmin';
import {
  invalidateLandingCache,
  websiteAdminApi,
  type SinavTakvim,
} from '@/lib/website-api';
import s from '@/components/olcme/deneme/denemeTakvim.module.css';

export default function DenemeTakvimiPage() {
  const [sinavlar, setSinavlar] = useState<SinavTakvim[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');

  const flash = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setMessage(msg);
    setMessageType(type);
    window.setTimeout(() => setMessage(''), 4000);
  }, []);

  const reload = useCallback(async () => {
    const res = await websiteAdminApi.list<SinavTakvim>('sinav-takvim');
    if (res.success && res.data) {
      setSinavlar([...res.data].sort((a, b) => a.tarih.localeCompare(b.tarih)));
    } else {
      flash(res.error || 'Sınav takvimi yüklenemedi', 'error');
    }
    await invalidateLandingCache();
  }, [flash]);

  useEffect(() => {
    void reload().finally(() => setLoading(false));
  }, [reload]);

  return (
    <div className="section">
      {message && (
        <div className={`${s.toast} ${messageType === 'success' ? s.toastOk : s.toastBad}`} role="status">{message}</div>
      )}

      {loading ? (
        <p className={s.empty}>Yükleniyor…</p>
      ) : (
        <SinavCalendarAdmin sinavlar={sinavlar} onReload={reload} onMessage={flash} />
      )}
    </div>
  );
}
