'use client';

import { useEffect, useState } from 'react';
import type { CoachStudentProfileStudent } from '@/lib/coach-api';
import { calculateAge, getAvatarGradient, getInitials } from '@/app/ogrenciler/[id]/utils';
import ProfilFotoUpload from '@/app/ogrenciler/[id]/components/ProfilFotoUpload';
import WhatsAppChatButton from '@/components/communication/WhatsAppChatButton';
import { resolveCoachStudentGradeLevel } from '@/lib/coach-student-display';
import CoachPhotoLightbox from '@/components/coach/CoachPhotoLightbox';

export interface CoachStudentInfoPanelProps {
  student: CoachStudentProfileStudent;
  onPhotoUpdate?: (url: string | null) => void;
  onNavigateVeli?: () => void;
  /** drawer | panel — footer / spacing farkı */
  variant?: 'drawer' | 'panel';
}

function getFullPhotoUrl(photoUrl: string | null | undefined) {
  if (!photoUrl) return null;
  if (photoUrl.startsWith('http')) return photoUrl;
  return photoUrl;
}

export default function CoachStudentInfoPanel({
  student,
  onPhotoUpdate,
  onNavigateVeli,
  variant = 'panel',
}: CoachStudentInfoPanelProps) {
  const [photoUrl, setPhotoUrl] = useState(getFullPhotoUrl(student.profil_foto));
  const [showLightbox, setShowLightbox] = useState(false);

  useEffect(() => {
    setPhotoUrl(getFullPhotoUrl(student.profil_foto));
  }, [student.profil_foto]);

  const age = student.dogum_tarihi ? calculateAge(student.dogum_tarihi) : null;
  const sinifLabel =
    typeof student.sinif === 'string' ? student.sinif : student.sinif?.ad || null;
  const sinifSeviyesiLabel = resolveCoachStudentGradeLevel(student);
  const displayName = student.full_name || student.tam_ad;
  const canEditPhoto = Boolean(onPhotoUpdate);

  const handlePhotoUpdate = (url: string | null) => {
    setPhotoUrl(getFullPhotoUrl(url));
    onPhotoUpdate?.(url);
  };

  return (
    <>
      {showLightbox && photoUrl && (
        <CoachPhotoLightbox
          photoUrl={photoUrl}
          alt={displayName}
          onClose={() => setShowLightbox(false)}
        />
      )}

      <div
        className={`student-profile-modern coach-student-info-panel coach-student-info-panel--${variant}`}
      >
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
                  <img src={photoUrl} alt={displayName} />
                </button>
              ) : (
                <div
                  className="student-avatar-xl"
                  style={{ background: getAvatarGradient(student.ad) }}
                >
                  {getInitials(student.ad, student.soyad)}
                </div>
              )}

              {canEditPhoto && (
                <ProfilFotoUpload
                  ogrenciId={student.id}
                  currentPhoto={photoUrl}
                  onSuccess={handlePhotoUpdate}
                />
              )}
            </div>

            <div className="student-avatar-meta">
              <span
                className={`student-status-pill ${student.aktif_mi === false ? 'inactive' : 'active'}`}
              >
                {student.aktif_mi === false ? 'Pasif' : 'Aktif'}
              </span>
            </div>
          </div>

          <div className="student-identity-info">
            <h1 className="student-name">{displayName}</h1>
            <div className="student-id-number">
              <span className="id-label">Öğrenci No</span>
              <span className="id-value">{student.okul_no || '---'}</span>
            </div>
            <div className="student-location-info">
              <div className="location-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                </svg>
                <span>{student.kurum?.ad || '-'}</span>
              </div>
              <div className="location-divider">/</div>
              <div className="location-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18" />
                  <path d="M9 21V9" />
                </svg>
                <span>{student.sube?.ad || '-'}</span>
              </div>
            </div>
            <div className="student-year-badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              {student.egitim_yili?.ad || '-'}
            </div>
          </div>
        </div>

        <div className="profile-divider" />

        <div className="student-profile-details">
          <div className="details-grid">
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
                <span className="detail-value">{student.tc_kimlik_no || '-'}</span>
              </div>
            </div>

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
                  {student.dogum_tarihi || '-'}
                  {age != null && <span className="age-chip">{age} yaş</span>}
                </span>
              </div>
            </div>

            <div className="detail-item">
              <div className="detail-icon purple">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="8" r="5" />
                  <path d="M20 21a8 8 0 0 0-16 0" />
                </svg>
              </div>
              <div className="detail-content">
                <span className="detail-label">Cinsiyet</span>
                <span className="detail-value">
                  {student.cinsiyet_display && student.cinsiyet_display !== '-'
                    ? student.cinsiyet_display
                    : '-'}
                </span>
              </div>
            </div>

            <div className="detail-item">
              <div className="detail-icon green">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                  <path d="M6 12v5c3 3 9 3 12 0v-5" />
                </svg>
              </div>
              <div className="detail-content">
                <span className="detail-label">Sınıf Seviyesi</span>
                <span className="detail-value">{sinifSeviyesiLabel || '-'}</span>
              </div>
            </div>

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
                <span className="detail-value">{sinifLabel || '-'}</span>
              </div>
            </div>

            <div className="detail-item">
              <div className="detail-icon cyan">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <div className="detail-content">
                <span className="detail-label">Kayıt Türü</span>
                <span className="detail-value">
                  {student.kayit_turu_display || student.kayit_turu || '-'}
                </span>
              </div>
            </div>

            <div className="detail-item">
              <div className="detail-icon amber">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              </div>
              <div className="detail-content">
                <span className="detail-label">Kayıt Tarihi</span>
                <span className="detail-value">{student.kayit_tarihi || '-'}</span>
              </div>
            </div>

            <div className="detail-item">
              <div className="detail-icon pink">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              </div>
              <div className="detail-content">
                <span className="detail-label">Telefon</span>
                <span className="detail-value with-action">
                  {student.telefon || '-'}
                  {student.telefon && (
                    <WhatsAppChatButton
                      phone={student.telefon}
                      ogrenciId={student.id}
                      contactLabel={displayName}
                      className="whatsapp-icon-btn"
                      title="Uygulama içi mesaj"
                      size={14}
                    />
                  )}
                </span>
              </div>
            </div>

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
                  {student.email || '-'}
                  {student.email && (
                    <a
                      href={`mailto:${student.email}`}
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

            <div className="detail-item detail-item-full">
              <div className="detail-icon indigo">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              </div>
              <div className="detail-content">
                <span className="detail-label">Adres</span>
                <span className="detail-value">{student.adres || '-'}</span>
              </div>
            </div>
          </div>

          {onNavigateVeli && (
            <button type="button" className="coach-info-veli-link" onClick={onNavigateVeli}>
              Veli sekmesine git →
            </button>
          )}
        </div>
      </div>
    </>
  );
}
