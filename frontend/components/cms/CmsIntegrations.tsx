'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { websiteCmsV2Api, type CmsIntegrations } from '@/lib/website-api';
import { absoluteSiteUrl } from '@/lib/site-url';

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
    label: 'Google Tag Manager (GTM)',
    placeholder: 'GTM-XXXXXXX',
    help: 'tagmanager.google.com → Konteyner kimliği (GTM-…). Yalnızca bu kodu yazın — Google\'ın verdiği <script> parçalarını yapıştırmanız gerekmez; site otomatik ekler. GA4\'ü GTM içinden yönetiyorsanız aşağıdaki GA4 alanını boş bırakın.',
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
    label: 'Head ek kodu (isteğe bağlı)',
    textarea: true,
    placeholder: '<!-- GTM dışı ek meta / script -->',
    help: 'GTM için bu alanı kullanmayın — yalnızca GTM kimliği yeterli. Diğer doğrulama veya üçüncü parti <head> kodları için.',
  },
  {
    key: 'body_start_code',
    label: 'Body başlangıç kodu (isteğe bağlı)',
    textarea: true,
    placeholder: '<!-- body açılışının hemen altı -->',
    help: 'GTM noscript parçası otomatik eklenir. Buraya yalnızca ek iframe / widget kodu gerekirse yapıştırın.',
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
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const uploadVerificationFile = async (file: File) => {
    setUploading(true);
    const res = await websiteCmsV2Api.uploadSearchConsoleFile(file);
    setUploading(false);
    if (res.success && res.data) {
      onMessage(`Search Console dosyası yüklendi: ${res.data.filename}`);
      await load();
    } else {
      onMessage(res.error || 'Dosya yüklenemedi', 'error');
    }
  };

  const removeVerificationFile = async () => {
    if (!confirm('Search Console doğrulama dosyası silinsin mi?')) return;
    const res = await websiteCmsV2Api.deleteSearchConsoleFile();
    if (res.success) {
      onMessage('Doğrulama dosyası kaldırıldı');
      await load();
    } else onMessage(res.error || 'Silinemedi', 'error');
  };

  const verificationFilename = data.search_console_html_filename || '';
  const verificationUrl = verificationFilename
    ? absoluteSiteUrl(`/${verificationFilename}`)
    : '';

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
        <section className="wam-settings-card" style={{ marginBottom: '1.5rem' }}>
          <div className="wam-settings-card-head">
            <span className="wam-settings-icon">🔍</span>
            <div>
              <h5>Google Search Console — HTML dosyası</h5>
              <p>
                search.google.com/search-console → Mülk ekle → <strong>HTML dosyası</strong> yöntemi.
                Google&apos;dan indirdiğiniz <code>google….html</code> dosyasını buradan yükleyin; site kökünde otomatik yayınlanır.
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginTop: '0.75rem' }}>
            <button
              type="button"
              className="wam-btn wam-btn-primary wam-btn-sm"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? 'Yükleniyor…' : verificationFilename ? 'Dosyayı Değiştir' : 'HTML Dosyası Yükle'}
            </button>
            {verificationFilename && (
              <button type="button" className="wam-btn wam-btn-danger wam-btn-sm" onClick={() => void removeVerificationFile()}>
                Dosyayı Kaldır
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".html,text/html"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadVerificationFile(f);
                e.target.value = '';
              }}
            />
          </div>
          {verificationFilename ? (
            <div className="wam-info-banner" style={{ marginTop: '0.75rem' }}>
              <div>
                <strong>Yüklü dosya:</strong> {verificationFilename}
                {verificationUrl && (
                  <>
                    <br />
                    <a href={verificationUrl} target="_blank" rel="noopener noreferrer">
                      {verificationUrl}
                    </a>
                    {' '}— tarayıcıda açılıp Google metnini göstermeli, sonra Search Console&apos;da Doğrula.
                  </>
                )}
              </div>
            </div>
          ) : (
            <p className="wam-field-hint" style={{ marginTop: '0.75rem' }}>
              Dosya adını değiştirmeyin. Doğrulama sonrası da dosyayı panelden silmeyin.
            </p>
          )}
          <div className="wam-field cms-field-help" style={{ marginTop: '1rem' }}>
            <label>Alternatif: HTML etiketi (meta content)</label>
            <p className="cms-field-hint">
              Dosya yerine HTML etiketi yöntemini seçtiyseniz yalnızca content değerini yapıştırın.
            </p>
            <input
              placeholder="google-site-verification content değeri"
              value={String(data.search_console_verification ?? '')}
              onChange={(e) => setData({ ...data, search_console_verification: e.target.value })}
            />
          </div>
        </section>

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
