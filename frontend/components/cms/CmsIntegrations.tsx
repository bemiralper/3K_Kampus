'use client';

import { useCallback, useEffect, useState } from 'react';
import { websiteCmsV2Api, type CmsIntegrations } from '@/lib/website-api';

type Props = {
  onMessage: (msg: string, type?: 'success' | 'error') => void;
};

type FieldDef = {
  key: string;
  label: string;
  placeholder?: string;
  help: string;
  textarea?: boolean;
};

const FIELDS: FieldDef[] = [
  {
    key: 'ga4_id',
    label: 'GA4 Ölçüm Kimliği',
    placeholder: 'G-XXXXXXXXXX',
    help: 'Google Analytics → Yönetici → Veri akışları → Web akışı → Ölçüm kimliği. Biçim: G- ile başlar.',
  },
  {
    key: 'gtm_id',
    label: 'Google Tag Manager',
    placeholder: 'GTM-XXXXXXX',
    help: 'tagmanager.google.com → Konteyner kimliği. GA4 zaten doluysa çoğu kurum için GTM zorunlu değildir.',
  },
  {
    key: 'search_console_verification',
    label: 'Search Console doğrulama kodu',
    placeholder: 'googleXXXXXXXXXXXXXXXX.html içindeki meta content değeri',
    help: 'search.google.com/search-console → Mülk ekle → HTML etiketi yöntemi. Yalnızca content="…" arasındaki kodu yapıştırın (meta etiketin tamamını değil).',
  },
  {
    key: 'google_ads_id',
    label: 'Google Ads dönüşüm kimliği',
    placeholder: 'AW-XXXXXXXXX',
    help: 'Google Ads → Araçlar → Dönüşümler. İsteğe bağlı; reklam dönüşümü takip ediyorsanız.',
  },
  {
    key: 'meta_pixel_id',
    label: 'Meta Pixel ID',
    placeholder: '123456789012345',
    help: 'business.facebook.com → Olay Yöneticisi → Veri kaynakları → Pixel. Sadece rakam kimliği.',
  },
  {
    key: 'clarity_id',
    label: 'Microsoft Clarity proje ID',
    placeholder: 'abcdefghij',
    help: 'clarity.microsoft.com → Proje ayarları → Tracking code içindeki kimlik. Isı haritası / oturum kaydı için.',
  },
  {
    key: 'recaptcha_site_key',
    label: 'reCAPTCHA site key (genel)',
    placeholder: '6Le…',
    help: 'google.com/recaptcha/admin → Site ekle (v2 veya v3) → Site key. Form spam koruması için.',
  },
  {
    key: 'recaptcha_secret_key',
    label: 'reCAPTCHA secret key (gizli)',
    placeholder: '6Le…',
    help: 'Aynı reCAPTCHA panelinden Secret key. Sunucu doğrulaması için; paylaşmayın.',
  },
  {
    key: 'robots_txt',
    label: 'robots.txt',
    textarea: true,
    placeholder: 'User-agent: *\nAllow: /\nSitemap: https://www.3kkampus.com/sitemap.xml',
    help: 'Arama motoruna hangi yolların taranacağını söyler. Sitemap satırında canlı domain kullanın (https://www.3kkampus.com). Admin/API yollarını Disallow edin.',
  },
  {
    key: 'head_code',
    label: 'Head ek kodu',
    textarea: true,
    placeholder: '<!-- doğrulama veya ek meta -->',
    help: 'İsteğe bağlı. <head> içine gidecek ekstra HTML/script. GA4 için ayrı alan yeterli; buraya yalnızca özel etiketler.',
  },
  {
    key: 'body_end_code',
    label: 'Body sonu ek kodu',
    textarea: true,
    placeholder: '<!-- chat widget vb. -->',
    help: 'Sayfa kapanmadan önce çalışacak chat / pixel noscript gibi kodlar. Boş bırakabilirsiniz.',
  },
];

const TEST_SERVICES = [
  { id: 'ga4', label: 'GA4 Testi' },
  { id: 'gtm', label: 'GTM Testi' },
  { id: 'search_console', label: 'Search Console Testi' },
];

export default function CmsIntegrations({ onMessage }: Props) {
  const [data, setData] = useState<CmsIntegrations>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await websiteCmsV2Api.getIntegrations();
    setLoading(false);
    if (res.success && res.data) setData(res.data);
    else onMessage(res.error || 'Entegrasyonlar yüklenemedi', 'error');
  }, [onMessage]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setSaving(true);
    const res = await websiteCmsV2Api.patchIntegrations(data);
    setSaving(false);
    if (res.success) onMessage('Entegrasyonlar kaydedildi');
    else onMessage(res.error || 'Kayıt başarısız', 'error');
  };

  const test = async (service: string) => {
    const res = await websiteCmsV2Api.testIntegration(service);
    if (res.success && res.data) {
      onMessage(res.data.ok ? `Başarılı: ${res.data.detail}` : `Hata: ${res.data.detail}`, res.data.ok ? 'success' : 'error');
    } else onMessage(res.error || 'Test başarısız', 'error');
  };

  if (loading) return <div className="wam-empty">Yükleniyor…</div>;

  return (
    <div className="wam-panel">
      <div className="wam-panel-header">
        <div>
          <h3>Entegrasyonlar</h3>
          <p>Her alanın altında nereden alınacağı ve ne yazılacağı kısaca açıklanır.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {TEST_SERVICES.map((s) => (
            <button key={s.id} type="button" className="btn btn-secondary btn-sm" onClick={() => test(s.id)}>
              {s.label}
            </button>
          ))}
          <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={save}>
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </div>
      <div className="wam-panel-body">
        {FIELDS.map((f) => (
          <div key={f.key} className="wam-field cms-field-help" style={{ marginBottom: '1.25rem' }}>
            <label>{f.label}</label>
            <p className="cms-field-hint">{f.help}</p>
            {f.textarea ? (
              <textarea
                rows={5}
                placeholder={f.placeholder}
                value={String(data[f.key] ?? '')}
                onChange={(e) => setData({ ...data, [f.key]: e.target.value })}
              />
            ) : (
              <input
                placeholder={f.placeholder}
                value={String(data[f.key] ?? '')}
                onChange={(e) => setData({ ...data, [f.key]: e.target.value })}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
