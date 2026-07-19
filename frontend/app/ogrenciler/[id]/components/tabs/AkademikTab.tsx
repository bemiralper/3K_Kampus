"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import "../../ogrenci-akademik.css";

type AkademikKalem = {
  kalem_turu: string;
  kalem_turu_display: string;
  kalem_adi: string;
  sozlesme_no: string;
  durum: string;
};

type AkademikEkHizmet = {
  ad: string;
  aktif_mi: boolean;
};

type AkademikKayit = {
  id: number;
  egitim_yili: string;
  sinif_ad: string;
  sinif_seviyesi: string;
  sube_ad: string;
  okul_no: string;
  kayit_tarihi: string;
  giris_turu_display: string;
  giris_tarihi: string;
  geldigi_okul: string;
  school_id?: number | null;
  school_ad?: string;
  aktif_mi: boolean;
  kalemler: AkademikKalem[];
  ek_hizmetler: AkademikEkHizmet[];
};

interface AkademikTabProps {
  ogrenciId: number;
}

function kalemBadgeClass(tur: string): string {
  const known = ["grup_dersi", "ozel_ders", "premium", "yayin", "deneme", "ek_hizmet", "ek_hizmet_satisi", "paket"];
  return known.includes(tur) ? `akademik-kalem-badge--${tur}` : "akademik-kalem-badge--paket";
}

export default function AkademikTab({ ogrenciId }: AkademikTabProps) {
  const [kayitlar, setKayitlar] = useState<AkademikKayit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    apiGet<{ kayitlar?: AkademikKayit[] }>(`/ogrenciler/api/${ogrenciId}/akademik/`)
      .then((res) => {
        if (cancelled) return;
        if (res.success) {
          const data = (res.data || res) as { kayitlar?: AkademikKayit[] };
          setKayitlar(data.kayitlar || []);
        } else {
          setError(res.error || "Akademik veriler yüklenemedi");
        }
      })
      .catch(() => {
        if (!cancelled) setError("Akademik veriler yüklenirken hata oluştu");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ogrenciId]);

  if (loading) {
    return (
      <div className="tab-panel akademik-tab">
        <div className="akademik-loading">
          <div className="akademik-spinner" />
          <p>Akademik bilgiler yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="tab-panel">
        <div className="alert-modern alert-error">{error}</div>
      </div>
    );
  }

  if (kayitlar.length === 0) {
    return (
      <div className="tab-panel">
        <div className="empty-tab-content">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5">
            <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
            <path d="M6 12v5c3 3 9 3 12 0v-5" />
          </svg>
          <h4>Akademik Bilgiler</h4>
          <p>Bu öğrenciye ait akademik kayıt bulunmamaktadır.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tab-panel akademik-tab">
      <div className="akademik-timeline">
        {kayitlar.map((kayit) => (
          <article
            key={kayit.id}
            className={`akademik-timeline-item${kayit.aktif_mi ? " is-active" : ""}`}
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
                <span className={`akademik-aktif-badge${kayit.aktif_mi ? "" : " pasif"}`}>
                  {kayit.aktif_mi ? "Aktif Kayıt" : "Pasif"}
                </span>
              </header>

              <div className="akademik-card-body">
                <div className="akademik-info-grid">
                  <div className="akademik-info-field">
                    <span className="akademik-info-label">Sınıf</span>
                    <span className="akademik-info-value">{kayit.sinif_ad || "—"}</span>
                  </div>
                  <div className="akademik-info-field">
                    <span className="akademik-info-label">Seviye</span>
                    <span className="akademik-info-value">{kayit.sinif_seviyesi || "—"}</span>
                  </div>
                  <div className="akademik-info-field">
                    <span className="akademik-info-label">Şube</span>
                    <span className="akademik-info-value">{kayit.sube_ad || "—"}</span>
                  </div>
                  <div className="akademik-info-field">
                    <span className="akademik-info-label">Okul No</span>
                    <span className="akademik-info-value">{kayit.okul_no || "—"}</span>
                  </div>
                  <div className="akademik-info-field">
                    <span className="akademik-info-label">Kayıt Tarihi</span>
                    <span className="akademik-info-value">{kayit.kayit_tarihi || "—"}</span>
                  </div>
                  <div className="akademik-info-field">
                    <span className="akademik-info-label">Giriş Türü</span>
                    <span className="akademik-info-value">{kayit.giris_turu_display || "—"}</span>
                  </div>
                  <div className="akademik-info-field">
                    <span className="akademik-info-label">
                      {kayit.sinif_seviyesi?.toLowerCase().includes("mezun")
                        ? "Mezun Olduğu Okul"
                        : "Geldiği Okul"}
                    </span>
                    <span className="akademik-info-value">
                      {kayit.school_ad || kayit.geldigi_okul || "—"}
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
                          className={`akademik-ek-hizmet-chip${eh.aktif_mi ? "" : " inactive"}`}
                        >
                          {eh.ad}
                          {!eh.aktif_mi && " (pasif)"}
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
    </div>
  );
}
