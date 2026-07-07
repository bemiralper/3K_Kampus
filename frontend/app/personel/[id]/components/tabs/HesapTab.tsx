"use client";

import { useState } from "react";
import { PersonelDetay } from "../../types";
import { formatDateTime } from "../../utils";
import { apiPost } from "@/lib/api";

interface HesapTabProps {
  data: PersonelDetay;
  onRefresh: () => void;
}

export default function HesapTab({ data, onRefresh }: HesapTabProps) {
  const hasAccount = Boolean(data.has_user_account || data.user?.username);
  const isSharedAccount = Boolean(data.user_account_shared);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showCredentials, setShowCredentials] = useState(false);
  const [credentials, setCredentials] = useState<{ username: string; password: string } | null>(null);

  const handleCreateUser = async () => {
    if (!confirm('Bu personel için kullanıcı hesabı oluşturulacak. Devam etmek istiyor musunuz?')) {
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const result = await apiPost<{ username: string; temp_password: string }>(
        `/personel/api/${data.id}/create-user/`,
      );

      if (result.success && result.data) {
        setCredentials({
          username: result.data.username,
          password: result.data.temp_password,
        });
        setShowCredentials(true);
        setMessage({ type: 'success', text: 'Kullanıcı hesabı oluşturuldu!' });
        onRefresh();
      } else {
        setMessage({ type: 'error', text: result.error || 'İşlem başarısız' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Bir hata oluştu' });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!confirm('Şifre TC Kimlik numarasına sıfırlanacak. Devam etmek istiyor musunuz?')) {
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const result = await apiPost<{ temp_password: string }>(
        `/personel/api/${data.id}/reset-password/`,
      );

      if (result.success && result.data) {
        setCredentials({
          username: data.user?.username || data.email || data.tc_kimlik_no || '',
          password: result.data.temp_password,
        });
        setShowCredentials(true);
        setMessage({ type: 'success', text: 'Şifre sıfırlandı!' });
        onRefresh();
      } else {
        setMessage({ type: 'error', text: result.error || 'İşlem başarısız' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Bir hata oluştu' });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setMessage({ type: 'success', text: 'Panoya kopyalandı!' });
    setTimeout(() => setMessage(null), 2000);
  };

  return (
    <div className="hesap-tab">
      {/* Mesaj */}
      {message && (
        <div className={`alert-message ${message.type}`}>
          {message.type === 'success' ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Kimlik Bilgileri Gösterimi */}
      {showCredentials && credentials && (
        <div className="credentials-card">
          <div className="credentials-header">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <h4>Giriş Bilgileri</h4>
            <button className="close-btn" onClick={() => setShowCredentials(false)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div className="credentials-body">
            <div className="credential-item">
              <label>Kullanıcı Adı</label>
              <div className="credential-value">
                <span>{credentials.username}</span>
                <button onClick={() => copyToClipboard(credentials.username)} title="Kopyala">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                </button>
              </div>
            </div>
            <div className="credential-item">
              <label>Geçici Şifre (TC Kimlik No)</label>
              <div className="credential-value password">
                <span>{credentials.password}</span>
                <button onClick={() => copyToClipboard(credentials.password)} title="Kopyala">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                </button>
              </div>
            </div>
            <p className="credential-note">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="16" x2="12" y2="12"/>
                <line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
              Kullanıcı ilk girişte şifresini değiştirmek zorundadır.
            </p>
          </div>
        </div>
      )}

      {/* Hesap Durumu */}
      <div className="hesap-section">
        <h3>Hesap Durumu</h3>
        
        {hasAccount ? (
          <div className="hesap-status-card aktif">
            <div className="status-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
            <div className="status-info">
              <h4>Hesap Aktif</h4>
              <p>
                Bu personelin sisteme giriş yapabileceği bir kullanıcı hesabı mevcut.
                {isSharedAccount && data.user_account_owner_sube_ad && (
                  <span className="hesap-kurum-note">
                    {" "}
                    Hesap {data.user_account_owner_sube_ad} şubesindeki ana personel kaydına bağlıdır;
                    tüm şubelerde aynı kullanıcı adı ve şifre geçerlidir.
                  </span>
                )}
                {!isSharedAccount && data.user_ana_sube_ad && (
                  <span className="hesap-kurum-note">
                    {" "}
                    Giriş hesabı kurum genelindedir; ana personel kaydı {data.user_ana_sube_ad} şubesindedir.
                  </span>
                )}
              </p>
            </div>
          </div>
        ) : (
          <div className="hesap-status-card pasif">
            <div className="status-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
              </svg>
            </div>
            <div className="status-info">
              <h4>Hesap Yok</h4>
              <p>Bu personelin henüz bir kullanıcı hesabı bulunmuyor.</p>
            </div>
          </div>
        )}
      </div>

      {/* Hesap Detayları */}
      {hasAccount && data.user && (
        <div className="hesap-section">
          <h3>Hesap Detayları</h3>
          <div className="hesap-details-grid">
            <div className="detail-item">
              <label>Kullanıcı Adı</label>
              <span>{data.user.username}</span>
            </div>
            <div className="detail-item">
              <label>E-posta</label>
              <span>{data.user.email || '-'}</span>
            </div>
            <div className="detail-item">
              <label>Hesap Durumu</label>
              <span className={`status-badge ${data.user.is_active ? 'aktif' : 'pasif'}`}>
                {data.user.is_active ? 'Aktif' : 'Devre Dışı'}
              </span>
            </div>
            <div className="detail-item">
              <label>Son Giriş</label>
              <span>{data.user.last_login || 'Hiç giriş yapmadı'}</span>
            </div>
            <div className="detail-item">
              <label>Hesap Oluşturma</label>
              <span>{data.user.date_joined || '-'}</span>
            </div>
            <div className="detail-item">
              <label>Şifre Değişikliği</label>
              <span className={`status-badge ${data.must_change_password ? 'uyari' : 'aktif'}`}>
                {data.must_change_password ? 'Zorunlu' : 'Değiştirildi'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Eylemler */}
      <div className="hesap-section">
        <h3>İşlemler</h3>
        <div className="hesap-actions">
          {!hasAccount ? (
            <button 
              className="btn-modern btn-primary"
              onClick={handleCreateUser}
              disabled={loading || !data.tc_kimlik_no}
            >
              {loading ? (
                <span className="loading-spinner-sm"></span>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="8.5" cy="7" r="4"/>
                  <line x1="20" y1="8" x2="20" y2="14"/>
                  <line x1="23" y1="11" x2="17" y2="11"/>
                </svg>
              )}
              Kullanıcı Hesabı Oluştur
            </button>
          ) : (
            <button 
              className="btn-modern btn-warning"
              onClick={handleResetPassword}
              disabled={loading || !data.tc_kimlik_no}
            >
              {loading ? (
                <span className="loading-spinner-sm"></span>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              )}
              Şifreyi Sıfırla
            </button>
          )}

          {!data.tc_kimlik_no && (
            <p className="warning-text">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              Kullanıcı hesabı oluşturmak için TC Kimlik No gereklidir.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
