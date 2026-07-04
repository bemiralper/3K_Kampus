"use client";

import { AktiviteLog, PersonelStats } from "../../types";
import { formatDateTime, timeAgo } from "../../utils";

interface AktiviteTabProps {
  aktiviteler: AktiviteLog[];
  stats: PersonelStats;
}

const getActivityIcon = (eylem: string) => {
  switch (eylem) {
    case 'LOGIN':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
          <polyline points="10 17 15 12 10 7"/>
          <line x1="15" y1="12" x2="3" y2="12"/>
        </svg>
      );
    case 'LOGOUT':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
      );
    case 'SAYFA_GORUNTULENME':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      );
    case 'ISLEM':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
        </svg>
      );
    case 'SIFRE_DEGISTIRME':
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      );
    default:
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      );
  }
};

const getActivityColor = (eylem: string) => {
  switch (eylem) {
    case 'LOGIN':
      return 'success';
    case 'LOGOUT':
      return 'warning';
    case 'SAYFA_GORUNTULENME':
      return 'info';
    case 'ISLEM':
      return 'primary';
    case 'SIFRE_DEGISTIRME':
      return 'purple';
    default:
      return 'default';
  }
};

const getActivityLabel = (eylem: string) => {
  switch (eylem) {
    case 'LOGIN':
      return 'Giriş';
    case 'LOGOUT':
      return 'Çıkış';
    case 'SAYFA_GORUNTULENME':
      return 'Sayfa Görüntüleme';
    case 'ISLEM':
      return 'İşlem';
    case 'SIFRE_DEGISTIRME':
      return 'Şifre Değişikliği';
    default:
      return eylem;
  }
};

export default function AktiviteTab({ aktiviteler, stats }: AktiviteTabProps) {
  return (
    <div className="aktivite-tab">
      {/* İstatistikler */}
      <div className="aktivite-stats">
        <div className="stat-card">
          <div className="stat-icon toplam">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
            </svg>
          </div>
          <div className="stat-info">
            <span className="stat-value">{stats.toplam_giris}</span>
            <span className="stat-label">Toplam Giriş</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon bu-ay">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          <div className="stat-info">
            <span className="stat-value">{stats.bu_ay_giris}</span>
            <span className="stat-label">Bu Ay</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon bu-hafta">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <div className="stat-info">
            <span className="stat-value">{stats.bu_hafta_giris}</span>
            <span className="stat-label">Bu Hafta</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon son-giris">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
              <polyline points="10 17 15 12 10 7"/>
              <line x1="15" y1="12" x2="3" y2="12"/>
            </svg>
          </div>
          <div className="stat-info">
            <span className="stat-value-small">{stats.son_giris ? timeAgo(stats.son_giris) : '-'}</span>
            <span className="stat-label">Son Giriş</span>
          </div>
        </div>
      </div>

      {/* Aktivite Listesi */}
      <div className="aktivite-section">
        <div className="section-header">
          <h3>Aktivite Geçmişi</h3>
          <span className="aktivite-count">{aktiviteler.length} kayıt</span>
        </div>

        {aktiviteler.length === 0 ? (
          <div className="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
            </svg>
            <p>Henüz aktivite kaydı bulunmuyor</p>
          </div>
        ) : (
          <div className="aktivite-list">
            {aktiviteler.map((aktivite) => (
              <div key={aktivite.id} className={`aktivite-item ${getActivityColor(aktivite.eylem)}`}>
                <div className={`aktivite-icon ${getActivityColor(aktivite.eylem)}`}>
                  {getActivityIcon(aktivite.eylem)}
                </div>
                <div className="aktivite-content">
                  <div className="aktivite-header">
                    <span className={`aktivite-badge ${getActivityColor(aktivite.eylem)}`}>
                      {getActivityLabel(aktivite.eylem)}
                    </span>
                    <span className="aktivite-time">{timeAgo(aktivite.created_at)}</span>
                  </div>
                  {aktivite.detay && (
                    <p className="aktivite-detay">{aktivite.detay}</p>
                  )}
                  <div className="aktivite-meta">
                    {aktivite.ip_adresi && (
                      <span className="meta-item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
                          <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
                          <line x1="6" y1="6" x2="6.01" y2="6"/>
                          <line x1="6" y1="18" x2="6.01" y2="18"/>
                        </svg>
                        {aktivite.ip_adresi}
                      </span>
                    )}
                    {aktivite.sayfa_url && (
                      <span className="meta-item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                          <polyline points="15 3 21 3 21 9"/>
                          <line x1="10" y1="14" x2="21" y2="3"/>
                        </svg>
                        {aktivite.sayfa_url}
                      </span>
                    )}
                    <span className="meta-item date">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                        <line x1="16" y1="2" x2="16" y2="6"/>
                        <line x1="8" y1="2" x2="8" y2="6"/>
                        <line x1="3" y1="10" x2="21" y2="10"/>
                      </svg>
                      {formatDateTime(aktivite.created_at)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
