'use client';

import type { AkademikKayit } from './types';

function kalemBadgeClass(tur: string): string {
  const known = [
    'grup_dersi',
    'ozel_ders',
    'premium',
    'yayin',
    'deneme',
    'ek_hizmet',
    'ek_hizmet_satisi',
    'paket',
  ];
  return known.includes(tur) ? `akademik-kalem-badge--${tur}` : 'akademik-kalem-badge--paket';
}

const FIELD_ICONS: Record<string, JSX.Element> = {
  sinif: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
      <path d="M6 12v5c3 3 9 3 12 0v-5" />
    </svg>
  ),
  seviye: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M7 16l4-6 3 3 5-8" />
    </svg>
  ),
  sube: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="10" width="16" height="10" rx="1" />
      <path d="M9 21V14h6v7M4 10l8-6 8 6" />
    </svg>
  ),
  okulno: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 8h.01M7 12h.01M7 16h.01M11 8h6M11 12h6M11 16h6" />
    </svg>
  ),
  tarih: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  ),
  giris: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <path d="M10 17l5-5-5-5M15 12H3" />
    </svg>
  ),
  okul: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3L2 8l10 5 10-5-10-5z" />
      <path d="M6 10.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-5.5" />
    </svg>
  ),
};

type Props = {
  kayitlar: AkademikKayit[];
  loading?: boolean;
  error?: string | null;
};

export default function GenelBakisPanel({ kayitlar, loading, error }: Props) {
  if (loading) {
    return (
      <div className="akademik-loading">
        <div className="akademik-spinner" />
        <p>Akademik bilgiler yükleniyor...</p>
      </div>
    );
  }

  if (error) {
    return <div className="alert-modern alert-error">{error}</div>;
  }

  if (kayitlar.length === 0) {
    return (
      <div className="empty-tab-content">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5">
          <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
          <path d="M6 12v5c3 3 9 3 12 0v-5" />
        </svg>
        <h4>Akademik Bilgiler</h4>
        <p>Bu öğrenciye ait akademik kayıt bulunmamaktadır.</p>
      </div>
    );
  }

  return (
    <div className="akademik-timeline">
      {kayitlar.map((kayit) => (
        <article
          key={kayit.id}
          className={`akademik-timeline-item${kayit.aktif_mi ? ' is-active' : ''}`}
        >
          <span className="akademik-timeline-dot" aria-hidden />
          <div className="akademik-card">
            <header className="akademik-card-header">
              <div className="akademik-card-year">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                  <path d="M6 12v5c3 3 9 3 12 0v-5" />
                </svg>
                {kayit.egitim_yili}
              </div>
              <span className={`akademik-aktif-badge${kayit.aktif_mi ? '' : ' pasif'}`}>
                {kayit.aktif_mi ? 'Aktif Kayıt' : 'Pasif'}
              </span>
            </header>

            <div className="akademik-card-body">
              <div className="akademik-info-grid">
                <div className="akademik-info-field">
                  <span className="akademik-info-label">
                    {FIELD_ICONS.sinif}
                    Sınıf
                  </span>
                  <span className="akademik-info-value">{kayit.sinif_ad || '—'}</span>
                </div>
                <div className="akademik-info-field">
                  <span className="akademik-info-label">
                    {FIELD_ICONS.seviye}
                    Seviye
                  </span>
                  <span className="akademik-info-value">{kayit.sinif_seviyesi || '—'}</span>
                </div>
                <div className="akademik-info-field">
                  <span className="akademik-info-label">
                    {FIELD_ICONS.sube}
                    Şube
                  </span>
                  <span className="akademik-info-value">{kayit.sube_ad || '—'}</span>
                </div>
                <div className="akademik-info-field">
                  <span className="akademik-info-label">
                    {FIELD_ICONS.okulno}
                    Okul No
                  </span>
                  <span className="akademik-info-value">{kayit.okul_no || '—'}</span>
                </div>
                <div className="akademik-info-field">
                  <span className="akademik-info-label">
                    {FIELD_ICONS.tarih}
                    Kayıt Tarihi
                  </span>
                  <span className="akademik-info-value">{kayit.kayit_tarihi || '—'}</span>
                </div>
                <div className="akademik-info-field">
                  <span className="akademik-info-label">
                    {FIELD_ICONS.giris}
                    Giriş Türü
                  </span>
                  <span className="akademik-info-value">{kayit.giris_turu_display || '—'}</span>
                </div>
                <div className="akademik-info-field">
                  <span className="akademik-info-label">
                    {FIELD_ICONS.okul}
                    {kayit.sinif_seviyesi?.toLowerCase().includes('mezun')
                      ? 'Mezun Olduğu Okul'
                      : 'Geldiği Okul'}
                  </span>
                  <span className="akademik-info-value">
                    {kayit.school_ad || kayit.geldigi_okul || '—'}
                  </span>
                </div>
              </div>

              {kayit.kalemler.length > 0 && (
                <div className="akademik-kalemler-section">
                  <h5 className="akademik-kalemler-title">Eğitim Kalemleri</h5>
                  <div className="akademik-kalem-badges">
                    {kayit.kalemler.map((kalem, idx) => (
                      <span
                        key={`${kalem.sozlesme_no}-${kalem.kalem_adi}-${idx}`}
                        className={`akademik-kalem-badge ${kalemBadgeClass(kalem.kalem_turu)}`}
                        title={kalem.sozlesme_no}
                      >
                        <span className="akademik-kalem-badge-type">{kalem.kalem_turu_display}</span>
                        {kalem.kalem_adi}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {kayit.ek_hizmetler.length > 0 && (
                <div className="akademik-ek-hizmetler">
                  <h5 className="akademik-kalemler-title">Ek Hizmetler</h5>
                  <div className="akademik-ek-hizmet-list">
                    {kayit.ek_hizmetler.map((eh, idx) => (
                      <span
                        key={`${eh.ad}-${idx}`}
                        className={`akademik-ek-hizmet-chip${eh.aktif_mi ? '' : ' inactive'}`}
                      >
                        {eh.ad}
                        {!eh.aktif_mi && ' (pasif)'}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
