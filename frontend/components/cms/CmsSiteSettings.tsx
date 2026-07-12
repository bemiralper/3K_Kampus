'use client';

import { useEffect, useState } from 'react';
import { websiteAdminApi, invalidateLandingCache, type SiteSettings } from '@/lib/website-api';
import SiteSettingsPanel from '@/components/website-admin/SiteSettingsPanel';

type Props = {
  onMessage: (msg: string, type?: 'success' | 'error') => void;
};

/**
 * CMS v2 paneli içinde eski (landing) Site Ayarları formunu barındırır.
 * Hero başlıkları, dönen kelimeler, galeri görselleri, iletişim ve SEO
 * ayarları buradan düzenlenir; kayıt legacy /settings/ endpoint'ine gider.
 */
export default function CmsSiteSettings({ onMessage }: Props) {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await websiteAdminApi.getSettings();
      if (cancelled) return;
      setLoading(false);
      if (res.success && res.data) setSettings(res.data);
      else onMessage(res.error || 'Ayarlar yüklenemedi', 'error');
    })();
    return () => { cancelled = true; };
  }, [onMessage]);

  const save = async (data?: SiteSettings) => {
    const payload = data ?? settings;
    if (!payload) return;
    setSaving(true);
    const res = await websiteAdminApi.updateSettings(payload);
    setSaving(false);
    if (res.success) {
      onMessage('Site ayarları kaydedildi');
      if (res.data) setSettings(res.data);
      await invalidateLandingCache();
    } else {
      onMessage(res.error || 'Kaydedilemedi', 'error');
    }
  };

  if (loading) return <div className="wam-empty" style={{ padding: '2rem' }}>Yükleniyor…</div>;
  if (!settings) return <div className="wam-empty" style={{ padding: '2rem' }}>Ayarlar bulunamadı</div>;

  return (
    <SiteSettingsPanel
      settings={settings}
      onChange={setSettings}
      onSave={() => save()}
      onSaveSettings={save}
      saving={saving}
      onMessage={onMessage}
      autoSaveOnGalleryUpload
    />
  );
}
