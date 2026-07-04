"use client";

import { PersonelDetay } from "../types";
import { formatPhoneNumber, getInitials, formatWhatsAppLink } from "../utils";
import { resolveMediaUrl } from "@/lib/resolve-media-url";

interface PersonelProfilKartProps {
  data: PersonelDetay;
}

export default function PersonelProfilKart({ data }: PersonelProfilKartProps) {
  return (
    <div className="personel-profil-kart">
      {/* Üst Kısım - Avatar ve İsim */}
      <div className="profil-header">
        <div className="profil-avatar">
          {data.fotograf ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={resolveMediaUrl(data.fotograf) || ""} alt={data.tam_ad} />
          ) : (
            getInitials(data.tam_ad)
          )}
        </div>
        <h2 className="profil-isim">{data.tam_ad}</h2>
        <p className="profil-tc">{data.tc_kimlik_no || 'TC Girilmemiş'}</p>
        
        <div className="profil-badges">
          {data.kurum && (
            <span className="profil-badge">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              </svg>
              {data.kurum.ad}
            </span>
          )}
          {data.sube && (
            <span className="profil-badge">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              {data.sube.ad}
            </span>
          )}
        </div>
      </div>

      {/* Alt Kısım - İletişim Bilgileri */}
      <div className="profil-body">
        <div className="profil-info-grid">
          {/* Cep Telefonu */}
          <div className="profil-info-item">
            <div className="icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
            </div>
            <div className="content">
              <label>Cep Telefonu</label>
              {data.cep_telefon ? (
                <a href={formatWhatsAppLink(data.cep_telefon)} target="_blank" rel="noopener noreferrer">
                  {formatPhoneNumber(data.cep_telefon)}
                </a>
              ) : (
                <span>-</span>
              )}
            </div>
          </div>

          {/* E-posta */}
          <div className="profil-info-item">
            <div className="icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
            </div>
            <div className="content">
              <label>E-posta</label>
              {data.email ? (
                <a href={`mailto:${data.email}`}>{data.email}</a>
              ) : (
                <span>-</span>
              )}
            </div>
          </div>

          {/* Doğum Tarihi */}
          <div className="profil-info-item">
            <div className="icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <div className="content">
              <label>Doğum Tarihi</label>
              <span>{data.dogum_tarihi || '-'}</span>
            </div>
          </div>

          {/* Cinsiyet */}
          <div className="profil-info-item">
            <div className="icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="8" r="4"/>
                <path d="M20 21a8 8 0 1 0-16 0"/>
              </svg>
            </div>
            <div className="content">
              <label>Cinsiyet</label>
              <span>{data.cinsiyet_display || '-'}</span>
            </div>
          </div>

          {/* İl / İlçe */}
          {(data.il || data.ilce) && (
            <div className="profil-info-item">
              <div className="icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
              </div>
              <div className="content">
                <label>Konum</label>
                <span>{[data.ilce, data.il].filter(Boolean).join(' / ') || '-'}</span>
              </div>
            </div>
          )}

          {/* Acil Durum */}
          {(data.acil_durum_kisi || data.acil_durum_telefon) && (
            <div className="profil-info-item">
              <div className="icon" style={{ background: 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
              <div className="content">
                <label>Acil Durum</label>
                <span>{data.acil_durum_kisi} {data.acil_durum_telefon && `- ${formatPhoneNumber(data.acil_durum_telefon)}`}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
