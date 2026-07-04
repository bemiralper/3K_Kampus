'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { getDefaultHomePath } from '@/lib/auth-routes';
import { fetchKurumBrandingByKod } from '@/lib/kurum-branding-api';
import KurumBrandingHead from '@/components/branding/KurumBrandingHead';
import {
  DEFAULT_BRANDING,
  getLoginLogo,
  LOGIN_KURUM_KOD_KEY,
  mergeBranding,
  type KurumBranding,
} from '@/lib/kurum-branding';

function LoginLoading({ bg1, bg2 }: { bg1: string; bg2: string }) {
  return (
    <div className="login-loading">
      <div className="spinner" />
      <style jsx>{`
        .login-loading {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, ${bg1} 0%, ${bg2} 50%, ${bg1} 100%);
        }
        .spinner {
          width: 50px;
          height: 50px;
          border: 4px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, login, isAuthenticated, isLoading } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [branding, setBranding] = useState<KurumBranding>(DEFAULT_BRANDING);
  const [brandingLoaded, setBrandingLoaded] = useState(false);

  const kurumKod = searchParams.get('kurum')?.trim() || '';

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (kurumKod) {
        const res = await fetchKurumBrandingByKod(kurumKod);
        if (!cancelled && res.success && res.data) {
          setBranding(res.data);
          sessionStorage.setItem(LOGIN_KURUM_KOD_KEY, kurumKod);
        }
      } else {
        const saved = sessionStorage.getItem(LOGIN_KURUM_KOD_KEY);
        if (saved) {
          const res = await fetchKurumBrandingByKod(saved);
          if (!cancelled && res.success && res.data) setBranding(res.data);
        }
      }
      if (!cancelled) setBrandingLoaded(true);
    };
    load();
    return () => { cancelled = true; };
  }, [kurumKod]);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push(getDefaultHomePath(user));
    }
  }, [isAuthenticated, isLoading, router, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    const result = await login(username, password);
    if (result.success) {
      if (kurumKod) sessionStorage.setItem(LOGIN_KURUM_KOD_KEY, kurumKod);
      router.push(getDefaultHomePath(result.user ?? user));
    } else {
      setError(result.error || 'Giriş başarısız');
      setIsSubmitting(false);
    }
  };

  const b = mergeBranding(branding);
  const bg1 = b.login_arkaplan_rengi;
  const bg2 = b.login_arkaplan_rengi_2;
  const theme = b.tema_rengi;
  const loginLogo = getLoginLogo(b);
  const hasCustomLoginLogo = Boolean(branding.login_logo_url);
  const displayTitle = b.gorunen_ad.toUpperCase();
  const year = new Date().getFullYear();

  if (isLoading || !brandingLoaded) {
    return <LoginLoading bg1={bg1} bg2={bg2} />;
  }

  if (isAuthenticated) {
    return <LoginLoading bg1={bg1} bg2={bg2} />;
  }

  return (
    <>
      <KurumBrandingHead branding={b} />
      <div className="login-container">
        <div className="brand-section">
          <div className="brand-content">
            <div className="logo-container">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={loginLogo}
                alt={b.gorunen_ad}
                className={`brand-logo${hasCustomLoginLogo ? ' brand-logo--custom' : ''}`}
                width={100}
                height={100}
              />
            </div>
            <h1 className="brand-title">{displayTitle}</h1>
            {b.slogan && <p className="brand-subtitle">{b.slogan}</p>}
            <div className="brand-features">
              <div className="feature-item">
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                </svg>
                <span>Modern Eğitim Yönetimi</span>
              </div>
              <div className="feature-item">
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                </svg>
                <span>Öğrenci Takip Sistemi</span>
              </div>
              <div className="feature-item">
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
                </svg>
                <span>Kapsamlı Raporlama</span>
              </div>
            </div>
          </div>
          <div className="brand-footer">
            <p>© {year} {b.gorunen_ad}. Tüm hakları saklıdır.</p>
          </div>
        </div>

        <div className="form-section">
          <div className="form-card">
            <div className="form-header">
              <h2>Hoş Geldiniz</h2>
              <p>Devam etmek için giriş yapın</p>
            </div>

            {error && (
              <div className="error-message">
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                </svg>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="username">Kullanıcı Adı</label>
                <div className="input-wrapper">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                  </svg>
                  <input
                    type="text"
                    id="username"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="Kullanıcı adınızı girin"
                    required
                    autoComplete="username"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="password">Şifre</label>
                <div className="input-wrapper">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                    <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
                  </svg>
                  <input
                    type="password"
                    id="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Şifrenizi girin"
                    required
                    autoComplete="current-password"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <button type="submit" className="login-button" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <span className="button-spinner" />
                    <span>Giriş yapılıyor...</span>
                  </>
                ) : (
                  <>
                    <span>Giriş Yap</span>
                    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                      <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
                    </svg>
                  </>
                )}
              </button>
            </form>

            <div className="form-footer">
              <p>Şifrenizi mi unuttunuz? <a href="#">Yardım alın</a></p>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .login-container { display: flex; min-height: 100vh; background: #f8fafc; }
        .brand-section {
          flex: 1; display: flex; flex-direction: column; justify-content: space-between;
          padding: 3rem;
          background: linear-gradient(135deg, ${bg1} 0%, ${bg2} 50%, ${bg1} 100%);
          color: white; position: relative; overflow: hidden;
        }
        .brand-section::before {
          content: ''; position: absolute; top: -50%; right: -50%; width: 100%; height: 100%;
          background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 50%);
          pointer-events: none;
        }
        .brand-content {
          position: relative; z-index: 1; display: flex; flex-direction: column;
          align-items: center; justify-content: center; flex: 1;
        }
        .logo-container { margin-bottom: 1.5rem; }
        .brand-logo { opacity: 0.95; object-fit: contain; }
        .brand-logo:not(.brand-logo--custom) { filter: brightness(0) invert(1); }
        .brand-title {
          font-size: 2.5rem; font-weight: 700; margin: 0 0 0.5rem;
          letter-spacing: 3px; text-align: center;
        }
        .brand-subtitle {
          font-size: 1.25rem; opacity: 0.9; margin: 0 0 3rem; font-weight: 300; text-align: center;
        }
        .brand-features {
          display: flex; flex-direction: column; gap: 1rem; padding: 2rem;
          background: rgba(255,255,255,0.1); border-radius: 16px; backdrop-filter: blur(10px);
        }
        .feature-item { display: flex; align-items: center; gap: 1rem; font-size: 0.95rem; opacity: 0.9; }
        .brand-footer { position: relative; z-index: 1; text-align: center; }
        .brand-footer p { margin: 0; font-size: 0.85rem; opacity: 0.7; }
        .form-section {
          flex: 1; display: flex; align-items: center; justify-content: center;
          padding: 2rem; background: #f8fafc;
        }
        .form-card {
          width: 100%; max-width: 420px; padding: 3rem; background: white;
          border-radius: 24px; box-shadow: 0 4px 30px rgba(0,0,0,0.08);
        }
        .form-header { text-align: center; margin-bottom: 2rem; }
        .form-header h2 { font-size: 1.75rem; font-weight: 700; color: ${bg1}; margin: 0 0 0.5rem; }
        .form-header p { font-size: 0.95rem; color: #64748b; margin: 0; }
        .error-message {
          display: flex; align-items: center; gap: 0.75rem; padding: 1rem;
          background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px;
          color: #dc2626; margin-bottom: 1.5rem; font-size: 0.9rem;
        }
        .form-group { margin-bottom: 1.5rem; }
        .form-group label {
          display: block; font-size: 0.875rem; font-weight: 600;
          color: #374151; margin-bottom: 0.5rem;
        }
        .input-wrapper { position: relative; display: flex; align-items: center; }
        .input-wrapper svg { position: absolute; left: 1rem; color: #94a3b8; pointer-events: none; }
        .input-wrapper input {
          width: 100%; padding: 0.875rem 1rem 0.875rem 3rem; font-size: 1rem;
          border: 2px solid #e2e8f0; border-radius: 12px; background: #f8fafc; color: #1e293b;
        }
        .input-wrapper input:focus {
          outline: none; border-color: ${theme}; background: white;
          box-shadow: 0 0 0 4px ${theme}22;
        }
        .login-button {
          width: 100%; display: flex; align-items: center; justify-content: center; gap: 0.5rem;
          padding: 1rem 1.5rem; font-size: 1rem; font-weight: 600; color: white;
          background: linear-gradient(135deg, ${bg1} 0%, ${bg2} 100%);
          border: none; border-radius: 12px; cursor: pointer; margin-top: 0.5rem;
        }
        .login-button:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 25px ${bg1}44; }
        .login-button:disabled { opacity: 0.8; cursor: not-allowed; }
        .button-spinner {
          width: 20px; height: 20px; border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white; border-radius: 50%; animation: spin 1s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .form-footer {
          text-align: center; margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid #e2e8f0;
        }
        .form-footer p { font-size: 0.875rem; color: #64748b; margin: 0; }
        .form-footer a { color: ${theme}; text-decoration: none; font-weight: 500; }
        @media (max-width: 992px) {
          .login-container { flex-direction: column; }
          .brand-section { flex: none; padding: 2rem; }
          .brand-features, .brand-footer { display: none; }
        }
      `}</style>
    </>
  );
}

export default function LoginPageClient() {
  return (
    <Suspense fallback={<LoginLoading bg1={DEFAULT_BRANDING.login_arkaplan_rengi} bg2={DEFAULT_BRANDING.login_arkaplan_rengi_2} />}>
      <LoginPageInner />
    </Suspense>
  );
}
