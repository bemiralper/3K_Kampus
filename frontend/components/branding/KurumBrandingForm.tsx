'use client';

import React, { useCallback, useRef, useState } from 'react';
import { uploadKurumBrandingFile, uploadSubeBrandingFile } from '@/lib/kurum-branding-api';
import {
  applyFavicon,
  getAppLogo,
  getFaviconUrl,
  getHeaderLogo,
  getLoginLogo,
  mergeBranding,
  resetFaviconCache,
  type KurumBranding,
} from '@/lib/kurum-branding';

type BrandingFormState = {
  gorunen_ad: string;
  slogan: string;
  login_arkaplan_rengi: string;
  login_arkaplan_rengi_2: string;
  tema_rengi: string;
};

type Props = {
  entityKind?: 'kurum' | 'sube';
  entityId: number | null;
  kurumKod?: string;
  form: BrandingFormState;
  onChange: (form: BrandingFormState) => void;
  previews: Pick<KurumBranding, 'login_logo_url' | 'app_logo_url' | 'favicon_url'>;
  onPreviewsChange: (previews: Props['previews']) => void;
  onAssetsChange?: () => void;
};

type UploadType = 'login-logo' | 'app-logo' | 'favicon';
type StudioTab = 'temel' | 'gorseller' | 'onizleme';

const ACCEPT_LOGO = 'image/png,image/jpeg,image/webp,image/svg+xml';
const ACCEPT_FAVICON = 'image/png,image/x-icon,image/vnd.microsoft.icon,image/jpeg,image/svg+xml';

const STUDIO_TABS: { id: StudioTab; label: string; icon: React.ReactNode }[] = [
  {
    id: 'temel',
    label: 'Temel',
    icon: <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />,
  },
  {
    id: 'gorseller',
    label: 'Görseller',
    icon: <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />,
  },
  {
    id: 'onizleme',
    label: 'Önizleme',
    icon: <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />,
  },
];

function UploadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z" />
    </svg>
  );
}

function LogoUploadTile({
  title,
  subtitle,
  surface,
  surfaceStyle,
  previewUrl,
  accept,
  uploading,
  disabled,
  onUpload,
}: {
  title: string;
  subtitle: string;
  surface: 'dark' | 'light' | 'checkered';
  surfaceStyle?: React.CSSProperties;
  previewUrl: string;
  accept: string;
  uploading: boolean;
  disabled: boolean;
  onUpload: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const openPicker = () => {
    if (!disabled && !uploading) inputRef.current?.click();
  };

  return (
    <div className={`logo-tile${disabled ? ' is-disabled' : ''}`}>
      <button
        type="button"
        className={`logo-tile-stage logo-tile-stage--${surface}${dragOver ? ' is-dragover' : ''}`}
        style={surfaceStyle}
        onClick={openPicker}
        onDragOver={e => { e.preventDefault(); if (!disabled) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file && !disabled) onUpload(file);
        }}
        disabled={disabled || uploading}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={previewUrl} alt={title} />
        <span className="logo-tile-overlay">
          {uploading ? 'Yükleniyor…' : 'Değiştir'}
        </span>
      </button>

      <div className="logo-tile-meta">
        <div>
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>
        <button type="button" className="logo-tile-btn" onClick={openPicker} disabled={disabled || uploading}>
          <UploadIcon />
          Yükle
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        disabled={disabled || uploading}
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function ColorSwatch({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const colorRef = useRef<HTMLInputElement>(null);

  return (
    <div className="color-swatch">
      <button
        type="button"
        className="color-swatch-preview"
        style={{ background: value }}
        onClick={() => colorRef.current?.click()}
        aria-label={`${label} rengini seç`}
      />
      <div className="color-swatch-body">
        <span className="color-swatch-label">{label}</span>
        <span className="color-swatch-hint">{hint}</span>
        <input
          type="text"
          className="brand-input brand-input--mono"
          value={value}
          onChange={e => onChange(e.target.value)}
          spellCheck={false}
        />
      </div>
      <input
        ref={colorRef}
        type="color"
        className="color-swatch-native"
        value={value}
        onChange={e => onChange(e.target.value)}
        tabIndex={-1}
        aria-hidden
      />
    </div>
  );
}

export default function KurumBrandingForm({
  entityKind = 'kurum',
  entityId,
  kurumKod = '',
  form,
  onChange,
  previews,
  onPreviewsChange,
  onAssetsChange,
}: Props) {
  const [activeTab, setActiveTab] = useState<StudioTab>('temel');
  const [uploading, setUploading] = useState<UploadType | null>(null);
  const [toast, setToast] = useState<{ type: 'error' | 'success' | 'info'; text: string } | null>(null);

  const previewBranding: KurumBranding = {
    gorunen_ad: form.gorunen_ad || 'Kurum Adı',
    slogan: form.slogan,
    login_logo_url: previews.login_logo_url,
    app_logo_url: previews.app_logo_url,
    favicon_url: previews.favicon_url,
    login_arkaplan_rengi: form.login_arkaplan_rengi,
    login_arkaplan_rengi_2: form.login_arkaplan_rengi_2,
    tema_rengi: form.tema_rengi,
  };

  const loginLogo = getLoginLogo(previewBranding);
  const appLogo = getAppLogo(previewBranding);
  const headerLogo = getHeaderLogo(previewBranding);
  const favicon = getFaviconUrl(previewBranding);
  const uploadsDisabled = !entityId;
  const isPublicSite = entityKind === 'kurum';

  const handleUpload = useCallback(async (type: UploadType, file: File) => {
    if (!entityId) {
      setToast({ type: 'info', text: 'Önce kaydı tamamlayın, ardından görselleri yükleyin.' });
      return;
    }

    const maxMb = type === 'favicon' ? 2 : 5;
    if (file.size > maxMb * 1024 * 1024) {
      setToast({ type: 'error', text: `Dosya boyutu ${maxMb} MB sınırını aşıyor.` });
      return;
    }

    setToast(null);
    setUploading(type);

    const res = entityKind === 'sube'
      ? await uploadSubeBrandingFile(entityId, type, file)
      : await uploadKurumBrandingFile(entityId, type, file);
    setUploading(null);

    if (res.success && res.data) {
      const nextPreviews = {
        login_logo_url: res.data.login_logo_url,
        app_logo_url: res.data.app_logo_url,
        favicon_url: res.data.favicon_url,
      };
      onPreviewsChange(nextPreviews);
      onChange({
        ...form,
        gorunen_ad: res.data.gorunen_ad,
        slogan: res.data.slogan,
        login_arkaplan_rengi: res.data.login_arkaplan_rengi,
        login_arkaplan_rengi_2: res.data.login_arkaplan_rengi_2,
        tema_rengi: res.data.tema_rengi,
      });
      resetFaviconCache();
      const brandingForFavicon = mergeBranding({
        ...form,
        ...nextPreviews,
        gorunen_ad: res.data.gorunen_ad || form.gorunen_ad,
        slogan: res.data.slogan ?? form.slogan,
      });
      applyFavicon(brandingForFavicon, { force: true });
      onAssetsChange?.();
      const labels: Record<UploadType, string> = {
        'login-logo': 'Koyu zemin logosu',
        'app-logo': 'Açık zemin logosu',
        favicon: 'Favicon',
      };
      setToast({ type: 'success', text: `${labels[type]} kaydedildi.` });
    } else {
      setToast({ type: 'error', text: res.error || 'Yükleme başarısız.' });
    }
  }, [entityId, entityKind, form, onChange, onPreviewsChange, onAssetsChange]);

  return (
    <div className="brand-studio">
      <div
        className="brand-hero"
        style={{
          background: `linear-gradient(135deg, ${form.login_arkaplan_rengi}, ${form.login_arkaplan_rengi_2})`,
        }}
      >
        <div className="brand-hero-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={loginLogo} alt="" />
        </div>
        <div className="brand-hero-text">
          <strong>{form.gorunen_ad || 'Kurum adı'}</strong>
          <span>{form.slogan || 'Slogan'}</span>
        </div>
        <span className="brand-hero-accent" style={{ background: form.tema_rengi }} />
      </div>

      {uploadsDisabled && (
        <div className="brand-toast brand-toast--info">
          {isPublicSite
            ? 'Kurumu kaydettikten sonra anasayfa logolarını yükleyebilirsiniz.'
            : 'Şubeyi kaydettikten sonra uygulama logolarını yükleyebilirsiniz.'}
        </div>
      )}
      {toast && (
        <div className={`brand-toast brand-toast--${toast.type}`}>{toast.text}</div>
      )}

      <nav className="brand-tabs" aria-label="Marka ayarları">
        {STUDIO_TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            className={`brand-tab${activeTab === tab.id ? ' is-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">{tab.icon}</svg>
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'temel' && (
        <div className="brand-panel">
          <div className="brand-panel-block">
            <h4>Kimlik</h4>
            <p className="brand-panel-desc">
              {isPublicSite
                ? 'Anasayfa, giriş ekranı ve kurumsal sitede görünür. Şube bazlı marka ayrı ayarlanır.'
                : 'Bu şubeye giriş yapıldığında uygulama sidebar ve sekme başlığında kullanılır.'}
            </p>
            <div className="brand-field-grid">
              <label className="brand-field">
                <span>Görünen ad</span>
                <input
                  type="text"
                  className="brand-input"
                  value={form.gorunen_ad}
                  onChange={e => onChange({ ...form, gorunen_ad: e.target.value })}
                  placeholder={isPublicSite ? 'Anasayfa ve giriş ekranı' : 'Uygulama sidebar ve sekme'}
                />
              </label>
              <label className="brand-field">
                <span>Slogan</span>
                <input
                  type="text"
                  className="brand-input"
                  value={form.slogan}
                  onChange={e => onChange({ ...form, slogan: e.target.value })}
                  placeholder="Giriş ekranı alt metni"
                />
              </label>
            </div>
          </div>

          <div className="brand-panel-block">
            <h4>Renk paleti</h4>
            <p className="brand-panel-desc">
              {isPublicSite
                ? 'Anasayfa gradyanı ve vurgu rengi (login olmadan görünen site).'
                : 'Giriş sonrası uygulama gradyanı ve sidebar vurgu rengi.'}
            </p>
            <div className="color-swatch-grid">
              <ColorSwatch
                label="Giriş — başlangıç"
                hint="Gradyan sol üst"
                value={form.login_arkaplan_rengi}
                onChange={v => onChange({ ...form, login_arkaplan_rengi: v })}
              />
              <ColorSwatch
                label="Giriş — bitiş"
                hint="Gradyan sağ alt"
                value={form.login_arkaplan_rengi_2}
                onChange={v => onChange({ ...form, login_arkaplan_rengi_2: v })}
              />
              <ColorSwatch
                label="Tema rengi"
                hint="Butonlar · sidebar"
                value={form.tema_rengi}
                onChange={v => onChange({ ...form, tema_rengi: v })}
              />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'gorseller' && (
        <div className="brand-panel">
          <div className="brand-panel-block">
            <h4>Logolar</h4>
            <p className="brand-panel-desc">
              Koyu ve açık zemin için ayrı logo yükleyin. Sistem doğru yüzeyde otomatik kullanır.
            </p>
            <div className="logo-tile-grid">
              <LogoUploadTile
                title="Koyu zemin"
                subtitle="Giriş · koyu sidebar"
                surface="dark"
                surfaceStyle={{
                  background: `linear-gradient(135deg, ${form.login_arkaplan_rengi}, ${form.login_arkaplan_rengi_2})`,
                }}
                previewUrl={loginLogo}
                accept={ACCEPT_LOGO}
                uploading={uploading === 'login-logo'}
                disabled={uploadsDisabled}
                onUpload={f => handleUpload('login-logo', f)}
              />
              <LogoUploadTile
                title="Açık zemin"
                subtitle="Header · uygulama sidebar"
                surface="light"
                previewUrl={appLogo}
                accept={ACCEPT_LOGO}
                uploading={uploading === 'app-logo'}
                disabled={uploadsDisabled}
                onUpload={f => handleUpload('app-logo', f)}
              />
            </div>
          </div>

          <div className="brand-panel-block">
            <h4>Favicon</h4>
            <p className="brand-panel-desc">Tarayıcı sekmesi ve yer imi simgesi (.png veya .ico).</p>
            <div className="favicon-row">
              <LogoUploadTile
                title="Favicon"
                subtitle="Sekme · yer imi"
                surface="checkered"
                previewUrl={favicon}
                accept={ACCEPT_FAVICON}
                uploading={uploading === 'favicon'}
                disabled={uploadsDisabled}
                onUpload={f => handleUpload('favicon', f)}
              />
              <div className="browser-tab-preview">
                <div className="browser-tab-preview-chrome">
                  <span className="browser-tab-dot" />
                  <span className="browser-tab-dot" />
                  <span className="browser-tab-dot" />
                </div>
                <div className="browser-tab-preview-tab">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={favicon} alt="" width={14} height={14} />
                  <span>{form.gorunen_ad || 'Kurum'}</span>
                </div>
                <p>Sekme önizlemesi</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'onizleme' && (
        <div className="brand-panel">
          <div className="brand-panel-block">
            <h4>Kullanım yerleri</h4>
            <p className="brand-panel-desc">Yüklediğiniz marka öğelerinin gerçek yüzeylerdeki hali.</p>
            <div className="preview-mocks">
              <div
                className="preview-mock preview-mock--login"
                style={{
                  background: `linear-gradient(135deg, ${form.login_arkaplan_rengi}, ${form.login_arkaplan_rengi_2})`,
                }}
              >
                <span className="preview-mock-tag">Giriş</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={loginLogo} alt="" />
                <strong>{form.gorunen_ad || 'Kurum'}</strong>
                <small>{form.slogan || 'Slogan'}</small>
              </div>
              <div className="preview-mock preview-mock--header">
                <span className="preview-mock-tag">Anasayfa</span>
                <div className="preview-mock-header-row">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={headerLogo} alt="" />
                  <span>{form.gorunen_ad || 'Kurum'}</span>
                </div>
              </div>
              <div className="preview-mock preview-mock--sidebar">
                <span className="preview-mock-tag">Uygulama</span>
                <div className="preview-mock-sidebar-row">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={appLogo} alt="" />
                  <span>{form.gorunen_ad || 'Kurum'}</span>
                </div>
              </div>
            </div>
            {isPublicSite && kurumKod && (
              <a
                className="brand-external-link"
                href={`/login?kurum=${encodeURIComponent(kurumKod)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Giriş sayfasını aç
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>
              </a>
            )}
            {isPublicSite && (
              <a
                className="brand-external-link"
                href="/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Anasayfayı önizle
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>
              </a>
            )}
          </div>
        </div>
      )}

      <style jsx global>{`
        .brand-studio {
          --brand-accent: #0262a7;
          --brand-surface: #f8fafc;
          --brand-border: #e2e8f0;
          --brand-text: #0f172a;
          --brand-muted: #64748b;
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin: -8px -4px 0;
        }
        .brand-studio .brand-input {
          width: 100%;
          padding: 11px 14px;
          border: 1px solid var(--brand-border);
          border-radius: 10px;
          font-size: 14px;
          color: var(--brand-text);
          background: #fff;
          transition: border-color 0.15s, box-shadow 0.15s;
          box-sizing: border-box;
        }
        .brand-studio .brand-input:focus {
          outline: none;
          border-color: var(--brand-accent);
          box-shadow: 0 0 0 3px rgba(2, 98, 167, 0.12);
        }
        .brand-studio .brand-input::placeholder {
          color: #94a3b8;
        }
        .brand-studio .brand-input--mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 13px;
          padding: 8px 10px;
          margin-top: 6px;
        }
        .brand-hero {
          position: relative;
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 18px 20px;
          border-radius: 16px;
          overflow: hidden;
          color: #fff;
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
        }
        .brand-hero-logo {
          width: 52px;
          height: 52px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.12);
          border-radius: 14px;
          backdrop-filter: blur(4px);
        }
        .brand-hero-logo img {
          max-width: 40px;
          max-height: 40px;
          object-fit: contain;
        }
        .brand-hero-text {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .brand-hero-text strong {
          font-size: 16px;
          font-weight: 700;
          letter-spacing: -0.02em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .brand-hero-text span {
          font-size: 12px;
          opacity: 0.85;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .brand-hero-accent {
          position: absolute;
          right: 16px;
          top: 16px;
          width: 10px;
          height: 10px;
          border-radius: 999px;
          box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.25);
        }
        .brand-toast {
          padding: 11px 14px;
          border-radius: 10px;
          font-size: 13px;
          line-height: 1.45;
        }
        .brand-toast--info {
          background: #eff6ff;
          color: #1d4ed8;
        }
        .brand-toast--error {
          background: #fef2f2;
          color: #b91c1c;
        }
        .brand-toast--success {
          background: #ecfdf5;
          color: #047857;
        }
        .brand-tabs {
          display: flex;
          gap: 4px;
          padding: 4px;
          background: var(--brand-surface);
          border-radius: 12px;
        }
        .brand-tab {
          flex: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 10px 8px;
          border: none;
          border-radius: 9px;
          background: transparent;
          color: var(--brand-muted);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s, color 0.15s, box-shadow 0.15s;
        }
        .brand-tab:hover {
          color: var(--brand-text);
        }
        .brand-tab.is-active {
          background: #fff;
          color: var(--brand-accent);
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
        }
        .brand-panel {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .brand-panel-block h4 {
          margin: 0 0 4px;
          font-size: 14px;
          font-weight: 700;
          color: var(--brand-text);
          letter-spacing: -0.01em;
        }
        .brand-panel-desc {
          margin: 0 0 14px;
          font-size: 13px;
          color: var(--brand-muted);
          line-height: 1.5;
        }
        .brand-field-grid {
          display: grid;
          gap: 14px;
        }
        .brand-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .brand-field > span {
          font-size: 12px;
          font-weight: 600;
          color: #475569;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .color-swatch-grid {
          display: grid;
          gap: 10px;
        }
        .color-swatch {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 12px;
          background: var(--brand-surface);
          border-radius: 12px;
        }
        .color-swatch-preview {
          width: 44px;
          height: 44px;
          flex-shrink: 0;
          border: none;
          border-radius: 12px;
          cursor: pointer;
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
          transition: transform 0.15s;
        }
        .color-swatch-preview:hover {
          transform: scale(1.05);
        }
        .color-swatch-body {
          flex: 1;
          min-width: 0;
        }
        .color-swatch-label {
          display: block;
          font-size: 13px;
          font-weight: 600;
          color: var(--brand-text);
        }
        .color-swatch-hint {
          display: block;
          font-size: 11px;
          color: var(--brand-muted);
          margin-top: 1px;
        }
        .color-swatch-native {
          position: absolute;
          opacity: 0;
          width: 0;
          height: 0;
          pointer-events: none;
        }
        .logo-tile-grid {
          display: grid;
          gap: 12px;
        }
        .logo-tile.is-disabled {
          opacity: 0.55;
        }
        .logo-tile-stage {
          position: relative;
          width: 100%;
          height: 120px;
          border: none;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          overflow: hidden;
          transition: box-shadow 0.15s, transform 0.15s;
        }
        .logo-tile-stage--dark {
          box-shadow: 0 4px 16px rgba(15, 23, 42, 0.15);
        }
        .logo-tile-stage--light {
          background: #fff;
          box-shadow: inset 0 0 0 1px var(--brand-border);
        }
        .logo-tile-stage--checkered {
          background: repeating-conic-gradient(#f1f5f9 0% 25%, #fff 0% 50%) 50% / 14px 14px;
          box-shadow: inset 0 0 0 1px var(--brand-border);
        }
        .logo-tile-stage img {
          max-width: 70%;
          max-height: 80px;
          object-fit: contain;
          position: relative;
          z-index: 1;
        }
        .logo-tile-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(15, 23, 42, 0.45);
          color: #fff;
          font-size: 13px;
          font-weight: 600;
          opacity: 0;
          transition: opacity 0.15s;
          z-index: 2;
        }
        .logo-tile-stage:hover .logo-tile-overlay,
        .logo-tile-stage.is-dragover .logo-tile-overlay {
          opacity: 1;
        }
        .logo-tile-stage:disabled {
          cursor: not-allowed;
        }
        .logo-tile-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-top: 10px;
        }
        .logo-tile-meta strong {
          display: block;
          font-size: 13px;
          font-weight: 700;
          color: var(--brand-text);
        }
        .logo-tile-meta span {
          display: block;
          font-size: 11px;
          color: var(--brand-muted);
          margin-top: 2px;
        }
        .logo-tile-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          border: none;
          border-radius: 9px;
          background: var(--brand-accent);
          color: #fff;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          flex-shrink: 0;
          transition: opacity 0.15s;
        }
        .logo-tile-btn:hover:not(:disabled) {
          opacity: 0.9;
        }
        .logo-tile-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .favicon-row {
          display: grid;
          gap: 12px;
        }
        .browser-tab-preview {
          padding: 14px;
          background: var(--brand-surface);
          border-radius: 14px;
        }
        .browser-tab-preview-chrome {
          display: flex;
          gap: 5px;
          margin-bottom: 10px;
        }
        .browser-tab-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #cbd5e1;
        }
        .browser-tab-preview-tab {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 7px 14px 7px 10px;
          background: #fff;
          border-radius: 10px 10px 0 0;
          box-shadow: 0 -1px 0 var(--brand-border);
          font-size: 12px;
          font-weight: 500;
          color: #334155;
        }
        .browser-tab-preview-tab img {
          border-radius: 2px;
        }
        .browser-tab-preview p {
          margin: 8px 0 0;
          font-size: 11px;
          color: var(--brand-muted);
        }
        .preview-mocks {
          display: grid;
          gap: 12px;
        }
        .preview-mock {
          border-radius: 14px;
          padding: 16px;
          min-height: 100px;
        }
        .preview-mock-tag {
          display: inline-block;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          opacity: 0.7;
          margin-bottom: 10px;
        }
        .preview-mock--login {
          color: #fff;
          text-align: center;
          box-shadow: 0 6px 20px rgba(15, 23, 42, 0.12);
        }
        .preview-mock--login img {
          height: 40px;
          object-fit: contain;
          margin: 0 auto 8px;
          display: block;
        }
        .preview-mock--login strong {
          display: block;
          font-size: 15px;
        }
        .preview-mock--login small {
          display: block;
          margin-top: 4px;
          font-size: 12px;
          opacity: 0.85;
        }
        .preview-mock--header {
          background: #fff;
          box-shadow: inset 0 0 0 1px var(--brand-border);
        }
        .preview-mock--sidebar {
          background: #1e293b;
          color: #fff;
        }
        .preview-mock-header-row,
        .preview-mock-sidebar-row {
          display: flex;
          align-items: center;
          gap: 10px;
          font-weight: 600;
          font-size: 14px;
        }
        .preview-mock-header-row img,
        .preview-mock-sidebar-row img {
          height: 32px;
          object-fit: contain;
        }
        .brand-external-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin-top: 14px;
          color: var(--brand-accent);
          font-size: 13px;
          font-weight: 600;
          text-decoration: none;
        }
        .brand-external-link:hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}

export type { BrandingFormState };
