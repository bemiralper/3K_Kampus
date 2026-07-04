"use client";

import { useState } from "react";
import { OgrenciDetay } from "../types";
import { getAvatarGradient, getInitials, calculateAge } from "../utils";
import WhatsAppChatButton from "@/components/communication/WhatsAppChatButton";
import ProfilFotoUpload from "./ProfilFotoUpload";
import OgrenciKocAtama from "./OgrenciKocAtama";

interface OgrenciProfilKartProps {
  data: OgrenciDetay;
  onEditClick?: () => void;
  onPhotoUpdate?: (newPhotoUrl: string | null) => void;
  showEkHizmetler?: boolean;
}

export default function OgrenciProfilKart({
  data,
  onEditClick,
  onPhotoUpdate,
  showEkHizmetler = true,
}: OgrenciProfilKartProps) {
  const age = calculateAge(data.dogum_tarihi);
  const [showLightbox, setShowLightbox] = useState(false);

  // Fotoğraf URL'ini oluştur - next.config.js rewrite ile /media/* backend'e yönlendirilir
  const getFullPhotoUrl = (photoUrl: string | null | undefined) => {
    if (!photoUrl) return null;
    // Zaten tam URL ise direkt döndür
    if (photoUrl.startsWith('http')) return photoUrl;
    // /media/... formatında ise olduğu gibi döndür (rewrite ile backend'e yönlendirilir)
    return photoUrl;
  };

  const photoUrl = getFullPhotoUrl(data.profil_foto);

  return (
    <>
    {/* Lightbox Modal */}
    {showLightbox && photoUrl && (
      <div 
        className="photo-lightbox-overlay"
        onClick={() => setShowLightbox(false)}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
          cursor: 'zoom-out',
        }}
      >
        <button
          onClick={() => setShowLightbox(false)}
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            border: 'none',
            background: 'rgba(255, 255, 255, 0.1)',
            color: 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
            e.currentTarget.style.transform = 'scale(1.1)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            maxWidth: '90vw',
            maxHeight: '90vh',
            borderRadius: '16px',
            overflow: 'hidden',
            boxShadow: '0 25px 80px rgba(0, 0, 0, 0.5)',
          }}
        >
          <img 
            src={photoUrl} 
            alt={data.tam_ad}
            style={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              objectFit: 'contain',
              display: 'block',
            }}
          />
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            color: 'white',
            fontSize: '16px',
            fontWeight: '500',
            textShadow: '0 2px 4px rgba(0,0,0,0.5)',
          }}
        >
          {data.tam_ad}
        </div>
      </div>
    )}

    <div className="student-profile-modern">
      {/* Edit Button - Top Right */}
      {onEditClick && (
        <button 
          onClick={onEditClick}
          className="profile-edit-btn"
          title="Bilgileri Düzenle"
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            border: '1px solid #e2e8f0',
            background: 'white',
            color: '#64748b',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s',
            zIndex: 10,
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'linear-gradient(135deg, #3b82f6, #6366f1)';
            e.currentTarget.style.color = 'white';
            e.currentTarget.style.borderColor = 'transparent';
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.3)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'white';
            e.currentTarget.style.color = '#64748b';
            e.currentTarget.style.borderColor = '#e2e8f0';
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
      )}
      
      {/* Left - Avatar & Identity */}
      <div className="student-profile-identity">
        <div className="student-avatar-wrapper">
          <div className="student-avatar-shell">
            {photoUrl ? (
              <button
                type="button"
                className="student-avatar-xl student-avatar-photo"
                onClick={() => setShowLightbox(true)}
                title="Fotoğrafı büyüt"
              >
                <img src={photoUrl} alt={data.tam_ad} />
              </button>
            ) : (
              <div
                className="student-avatar-xl"
                style={{ background: getAvatarGradient(data.ad) }}
              >
                {getInitials(data.ad, data.soyad)}
              </div>
            )}

            {onPhotoUpdate && (
              <ProfilFotoUpload
                ogrenciId={data.id}
                currentPhoto={data.profil_foto}
                onSuccess={onPhotoUpdate}
              />
            )}
          </div>

          <div className="student-avatar-meta">
            <span className={`student-status-pill ${data.aktif_mi ? 'active' : 'inactive'}`}>
              {data.aktif_mi ? 'Aktif' : 'Pasif'}
            </span>
          </div>
        </div>
        
        <div className="student-identity-info">
          <h1 className="student-fullname">{data.tam_ad}</h1>
          <div className="student-id-number">
            <span className="id-label">Öğrenci No</span>
            <span className="id-value">{data.okul_no || '---'}</span>
          </div>
          <div className="student-location-info">
            <div className="location-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              </svg>
              <span>{data.kurum?.ad || '-'}</span>
            </div>
            <div className="location-divider">/</div>
            <div className="location-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18" />
                <path d="M9 21V9" />
              </svg>
              <span>{data.sube?.ad || '-'}</span>
            </div>
          </div>
          <div className="student-year-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            {data.egitim_yili?.ad || '-'}
          </div>

          <OgrenciKocAtama studentId={data.id} studentName={data.tam_ad} />
        </div>
      </div>

      {/* Divider */}
      <div className="profile-divider"></div>

      {/* Right - Details Grid */}
      <div className="student-profile-details">
        <div className="details-grid">
          {/* TC Kimlik */}
          <div className="detail-item">
            <div className="detail-icon blue">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="14" rx="2" />
                <line x1="7" y1="9" x2="17" y2="9" />
                <line x1="7" y1="13" x2="12" y2="13" />
              </svg>
            </div>
            <div className="detail-content">
              <span className="detail-label">TC Kimlik No</span>
              <span className="detail-value">{data.tc_kimlik_no || '-'}</span>
            </div>
          </div>

          {/* Doğum Tarihi */}
          <div className="detail-item">
            <div className="detail-icon orange">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <div className="detail-content">
              <span className="detail-label">Doğum Tarihi</span>
              <span className="detail-value">
                {data.dogum_tarihi || '-'}
                {age && <span className="age-chip">{age} yaş</span>}
              </span>
            </div>
          </div>

          {/* Cinsiyet */}
          <div className="detail-item">
            <div className="detail-icon purple">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="8" r="5" />
                <path d="M20 21a8 8 0 0 0-16 0" />
              </svg>
            </div>
            <div className="detail-content">
              <span className="detail-label">Cinsiyet</span>
              <span className="detail-value">{data.cinsiyet_display}</span>
            </div>
          </div>

          {/* Sınıf Seviyesi */}
          <div className="detail-item">
            <div className="detail-icon green">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                <path d="M6 12v5c3 3 9 3 12 0v-5" />
              </svg>
            </div>
            <div className="detail-content">
              <span className="detail-label">Sınıf Seviyesi</span>
              <span className="detail-value">{data.sinif_seviyesi?.ad || '-'}</span>
            </div>
          </div>

          {/* Sınıf */}
          <div className="detail-item">
            <div className="detail-icon teal">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div className="detail-content">
              <span className="detail-label">Sınıfı</span>
              <span className="detail-value">{data.sinif?.ad || '-'}</span>
            </div>
          </div>

          {/* Kayıt Tarihi */}
          <div className="detail-item">
            <div className="detail-icon amber">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <div className="detail-content">
              <span className="detail-label">Kayıt Tarihi</span>
              <span className="detail-value">{data.kayit_tarihi || '-'}</span>
            </div>
          </div>

          {/* Telefon */}
          <div className="detail-item">
            <div className="detail-icon pink">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </div>
            <div className="detail-content">
              <span className="detail-label">Telefon</span>
              <span className="detail-value with-action">
                {data.telefon || '-'}
                {data.telefon && (
                  <WhatsAppChatButton
                    phone={data.telefon}
                    ogrenciId={data.id}
                    contactLabel={`${data.ad} ${data.soyad}`.trim()}
                    className="whatsapp-icon-btn"
                    title="Uygulama içi mesaj"
                    size={14}
                  />
                )}
              </span>
            </div>
          </div>

          {/* E-posta */}
          <div className="detail-item">
            <div className="detail-icon cyan">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            </div>
            <div className="detail-content">
              <span className="detail-label">E-posta</span>
              <span className="detail-value with-action">
                {data.email || '-'}
                {data.email && (
                  <a 
                    href={`mailto:${data.email}`}
                    className="email-icon-btn"
                    title="E-posta Gönder"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </a>
                )}
              </span>
            </div>
          </div>

          {/* Adres - Full Width */}
          <div className="detail-item detail-item-full">
            <div className="detail-icon indigo">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </div>
            <div className="detail-content">
              <span className="detail-label">Adres</span>
              <span className="detail-value">{data.adres || '-'}</span>
            </div>
          </div>

          {/* Ek Hizmetler - Full Width */}
          {showEkHizmetler && data.ek_hizmetler && data.ek_hizmetler.length > 0 && (
            <div className="detail-item detail-item-full">
              <div className="detail-icon amber">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              </div>
              <div className="detail-content">
                <span className="detail-label">Ek Hizmetler</span>
                <span className="detail-value">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                    {data.ek_hizmetler.map(h => (
                      <span
                        key={h.id}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 500,
                          background: h.hizmet_turu === 'kutuphane' ? '#dbeafe' 
                            : h.hizmet_turu === 'kocluk' ? '#fef3c7' 
                            : '#d1fae5',
                          color: h.hizmet_turu === 'kutuphane' ? '#1e40af' 
                            : h.hizmet_turu === 'kocluk' ? '#92400e' 
                            : '#065f46',
                        }}
                      >
                        {h.hizmet_turu === 'kutuphane' ? '📚' : h.hizmet_turu === 'kocluk' ? '🎯' : '📋'}
                        {h.ad}
                        {h.dahil_mi && (
                          <span style={{ 
                            fontSize: '10px', 
                            opacity: 0.7,
                            fontWeight: 400,
                          }}>
                            (dahil)
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
