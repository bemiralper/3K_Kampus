'use client';

import { useCallback, useEffect, useState } from 'react';
import { websiteCmsV2Api, resolveMediaUrl, type CmsTheme } from '@/lib/website-api';

type Props = {
  onMessage: (msg: string, type?: 'success' | 'error') => void;
};

export default function CmsThemePanel({ onMessage }: Props) {
  const [theme, setTheme] = useState<CmsTheme>({});
  const [footerJson, setFooterJson] = useState('{}');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await websiteCmsV2Api.getTheme();
    setLoading(false);
    if (res.success && res.data) {
      setTheme(res.data);
      setFooterJson(JSON.stringify(res.data.footer_config || {}, null, 2));
    } else onMessage(res.error || 'Tema yüklenemedi', 'error');
  }, [onMessage]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    let footer_config: Record<string, unknown> = {};
    try {
      footer_config = JSON.parse(footerJson || '{}') as Record<string, unknown>;
    } catch {
      onMessage('Alt bilgi ayarları geçerli JSON değil', 'error');
      return;
    }
    setSaving(true);
    const res = await websiteCmsV2Api.patchTheme({ ...theme, footer_config });
    setSaving(false);
    if (res.success) onMessage('Tema kaydedildi');
    else onMessage(res.error || 'Kayıt başarısız', 'error');
  };

  const syncFromKurum = async () => {
    setSyncing(true);
    const res = await websiteCmsV2Api.ensureHealth();
    setSyncing(false);
    if (res.success) {
      onMessage('Kurum logosu / favicon senkronize edildi');
      await load();
    } else {
      onMessage(res.error || 'Senkron başarısız', 'error');
    }
  };

  if (loading) return <div className="wam-empty">Yükleniyor…</div>;

  const colorFields: Array<{ key: keyof CmsTheme; label: string }> = [
    { key: 'primary_color', label: 'Ana Renk' },
    { key: 'secondary_color', label: 'İkincil Renk' },
    { key: 'accent_color', label: 'Vurgu Rengi' },
  ];

  return (
    <div className="wam-panel">
      <div className="wam-panel-header">
        <div>
          <h3>Görünüm</h3>
          <p>Logo kurum oluştururken yüklediğiniz branding’den gelir; buradan da değiştirebilirsiniz.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary btn-sm" disabled={syncing} onClick={syncFromKurum}>
            {syncing ? 'Senkronize ediliyor…' : 'Kurumdan Çek'}
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={save}>
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </div>
      <div className="wam-panel-body">
        <div className="wam-field cms-field-help" style={{ marginBottom: '0.875rem' }}>
          <label>Logo URL</label>
          <p className="cms-field-hint">
            Kurum Yönetimi → kurum düzenle → Uygulama / Login logosu. “Kurumdan çek” ile otomatik dolar.
            Örnek: /media/kurum_branding/2/app_logo.png
          </p>
          <input
            value={theme.logo_url || ''}
            placeholder="/media/kurum_branding/…/app_logo.png"
            onChange={(e) => setTheme({ ...theme, logo_url: e.target.value })}
          />
          {theme.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={resolveMediaUrl(theme.logo_url) || theme.logo_url} alt="Logo önizleme" style={{ height: 40, marginTop: 8, objectFit: 'contain' }} />
          ) : null}
        </div>
        <div className="wam-field cms-field-help" style={{ marginBottom: '0.875rem' }}>
          <label>Favicon URL</label>
          <p className="cms-field-hint">Kurum branding favicon alanı. Örnek: /media/kurum_branding/2/favicon.png</p>
          <input
            value={theme.favicon_url || ''}
            placeholder="/media/kurum_branding/…/favicon.png"
            onChange={(e) => setTheme({ ...theme, favicon_url: e.target.value })}
          />
        </div>
        {colorFields.map((f) => (
          <div key={f.key} className="wam-field" style={{ marginBottom: '0.875rem' }}>
            <label>{f.label}</label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="color"
                value={String(theme[f.key] || '#0262a7')}
                onChange={(e) => setTheme({ ...theme, [f.key]: e.target.value })}
                style={{ width: 40, height: 36, padding: 0, border: '1px solid #e2e8f0', borderRadius: 6 }}
              />
              <input
                value={String(theme[f.key] || '')}
                onChange={(e) => setTheme({ ...theme, [f.key]: e.target.value })}
                style={{ flex: 1 }}
              />
            </div>
          </div>
        ))}
        <div className="wam-field cms-field-help" style={{ marginBottom: '0.875rem' }}>
          <label>Font başlık</label>
          <p className="cms-field-hint">Örn. &quot;Segoe UI&quot;, Georgia, veya Google Font adı</p>
          <input
            value={theme.font_heading || ''}
            placeholder='Segoe UI'
            onChange={(e) => setTheme({ ...theme, font_heading: e.target.value })}
          />
        </div>
        <div className="wam-field cms-field-help" style={{ marginBottom: '0.875rem' }}>
          <label>Font gövde</label>
          <p className="cms-field-hint">Metin fontu — boş bırakırsanız sistem fontu kullanılır</p>
          <input
            value={theme.font_body || ''}
            placeholder="system-ui"
            onChange={(e) => setTheme({ ...theme, font_body: e.target.value })}
          />
        </div>
        <div className="wam-field cms-field-help" style={{ marginBottom: '0.875rem' }}>
          <label>Alt Bilgi Ayarları (JSON)</label>
          <p className="cms-field-hint">
            copyright, title, description, telefon, eposta, adres alanları. Örnek değerlerle gelir; değiştirin.
          </p>
          <textarea
            rows={8}
            value={footerJson}
            onChange={(e) => setFooterJson(e.target.value)}
            style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
          />
        </div>
        <div className="wam-field cms-field-help">
          <label>Özel CSS</label>
          <p className="cms-field-hint">İleri seviye. Site genelinde ek stil kuralları.</p>
          <textarea
            rows={6}
            value={theme.custom_css || ''}
            onChange={(e) => setTheme({ ...theme, custom_css: e.target.value })}
            style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
          />
        </div>
      </div>
    </div>
  );
}
