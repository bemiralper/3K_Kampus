'use client';

import { useEffect, useState } from 'react';
import type { CoachStudentProfileStudent } from '@/lib/coach-api';
import { calculateAge } from '@/app/ogrenciler/[id]/utils';
import ProfilFotoUpload from '@/app/ogrenciler/[id]/components/ProfilFotoUpload';
import CoachStudentAvatar from '@/components/coach/students/CoachStudentAvatar';
import PhoneContactLinks from '@/components/coach/PhoneContactLinks';

interface CoachStudentInfoDrawerProps {
  student: CoachStudentProfileStudent;
  onClose: () => void;
  onNavigateVeli?: () => void;
  onPhotoUpdate?: (url: string | null) => void;
}

function InfoField({
  label,
  value,
  children,
}: {
  label: string;
  value?: string | null;
  children?: React.ReactNode;
}) {
  const display = value?.trim() || null;
  return (
    <div className="coach-info-field">
      <span className="coach-info-field-label">{label}</span>
      {children ?? (
        <span className="coach-info-field-value">{display || '—'}</span>
      )}
    </div>
  );
}

function InfoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="coach-info-section coach-info-section-card">
      <h3 className="coach-info-section-title">{title}</h3>
      <div className="coach-info-drawer-grid">{children}</div>
    </section>
  );
}

export default function CoachStudentInfoDrawer({
  student,
  onClose,
  onNavigateVeli,
  onPhotoUpdate,
}: CoachStudentInfoDrawerProps) {
  const [photoUrl, setPhotoUrl] = useState(student.profil_foto ?? null);

  useEffect(() => {
    setPhotoUrl(student.profil_foto ?? null);
  }, [student.profil_foto]);

  const sinifLabel =
    typeof student.sinif === 'string' ? student.sinif : student.sinif?.ad ?? null;
  const age = student.dogum_tarihi ? calculateAge(student.dogum_tarihi) : null;
  const dogumDisplay = student.dogum_tarihi
    ? age != null
      ? `${student.dogum_tarihi} (${age} yaş)`
      : student.dogum_tarihi
    : null;

  const emailHref = student.email ? `mailto:${student.email}` : null;
  const veliTel = student.veli_telefon ?? student.veli?.telefon ?? null;
  const veliName = student.veli_ad_soyad || student.veli_adi || student.veli?.ad || null;
  const veliTuruDisplay =
    student.veli?.veli_turu_display ??
    student.veliler?.find((v) => v.varsayilan)?.veli_turu_display ??
    student.veliler?.[0]?.veli_turu_display ??
    null;

  const handlePhotoUpdate = (url: string | null) => {
    setPhotoUrl(url);
    onPhotoUpdate?.(url);
  };

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div className="coach-drawer-overlay" onClick={onClose} role="presentation">
      <div
        className="coach-drawer coach-drawer-wide coach-info-drawer coach-info-drawer-enter"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="coach-info-drawer-title"
      >
        <div className="coach-drawer-handle" aria-hidden="true" />

        <div className="coach-drawer-header">
          <h2 id="coach-info-drawer-title" className="coach-drawer-title">
            Öğrenci Bilgileri
          </h2>
          <button
            type="button"
            className="coach-drawer-close"
            onClick={onClose}
            aria-label="Kapat"
          >
            ×
          </button>
        </div>

        <div className="coach-info-drawer-hero">
          <div className="coach-info-avatar-ring">
            <div className="student-avatar-shell coach-info-avatar-shell">
              <CoachStudentAvatar
                ad={student.ad}
                soyad={student.soyad}
                profilFoto={photoUrl}
                size="md"
                enableLightbox
                altName={student.full_name || student.tam_ad}
              />
              {onPhotoUpdate && (
                <ProfilFotoUpload
                  ogrenciId={student.id}
                  currentPhoto={photoUrl}
                  onSuccess={handlePhotoUpdate}
                />
              )}
            </div>
          </div>
          <div className="coach-info-drawer-hero-body">
            <div className="coach-info-drawer-name">{student.full_name || student.tam_ad}</div>
            <div className="coach-info-status">
              {student.kayit_turu_display && (
                <span className="coach-info-status-chip">{student.kayit_turu_display}</span>
              )}
              {student.cinsiyet_display && student.cinsiyet_display !== '-' && (
                <span className="coach-info-status-chip">{student.cinsiyet_display}</span>
              )}
              <span
                className={`coach-info-status-chip${student.aktif_mi === false ? ' is-inactive' : ''}`}
              >
                {student.aktif_mi === false ? 'Pasif' : 'Aktif'}
              </span>
            </div>
          </div>
        </div>

        <InfoSection title="Kimlik">
          <InfoField label="TC Kimlik No" value={student.tc_kimlik_no} />
          <InfoField label="Doğum Tarihi" value={dogumDisplay} />
        </InfoSection>

        <InfoSection title="Okul">
          <InfoField label="Kurum" value={student.kurum?.ad} />
          <InfoField label="Şube" value={student.sube?.ad} />
          <InfoField label="Eğitim Yılı" value={student.egitim_yili?.ad} />
          <InfoField label="Sınıf Seviyesi" value={student.sinif_seviyesi?.ad} />
          <InfoField label="Sınıf" value={sinifLabel} />
          <InfoField label="Okul No" value={student.okul_no ?? undefined} />
        </InfoSection>

        <InfoSection title="İletişim">
          <InfoField label="Telefon">
            <PhoneContactLinks phone={student.telefon} />
          </InfoField>
          <InfoField label="E-posta">
            {student.email ? (
              <a href={emailHref!} className="coach-info-link">
                {student.email}
              </a>
            ) : (
              <span className="coach-info-field-value">—</span>
            )}
          </InfoField>
          <InfoField label="Adres" value={student.adres} />
        </InfoSection>

        <InfoSection title="Veli">
          <InfoField label="Yakınlık" value={veliTuruDisplay} />
          <InfoField label="Ad Soyad" value={veliName} />
          <InfoField label="Telefon">
            <PhoneContactLinks phone={veliTel} />
          </InfoField>
        </InfoSection>

        {onNavigateVeli && (
          <button type="button" className="coach-info-veli-link" onClick={onNavigateVeli}>
            Veli sekmesine git →
          </button>
        )}
      </div>
    </div>
  );
}
