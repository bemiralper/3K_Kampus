"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";

/* ─── Tip Tanımları ─── */
interface TaksitItem {
  id: number;
  taksit_no: number;
  vade_tarihi: string | null;
  tutar: number;
  odenen_tutar: number;
  kalan_tutar: number;
  durum: string;
}

interface TahsilatItem {
  id: number;
  tutar: number;
  tahsilat_tarihi: string | null;
  taksit_no: number | null;
  tahsilat_turu: string;
  odeme_yontemi_ad: string;
  durum: string;
  referans_no: string;
  aciklama: string;
  dagitim?: { taksit_no: number; tutar: number }[];
}

interface FesihInfo {
  fesih_tarihi: string;
  fesih_nedeni: string;
  iade_tutari: number;
  iade_yapildi_mi: boolean;
}

interface SozlesmeItem {
  id: number;
  sozlesme_no: string;
  durum: string;
  paket_adi: string;
  paket_turu: string;
  egitim_turu: string;
  brut_tutar: number;
  kdv_orani: number;
  kdv_tutari: number;
  kdv_dahil_tutar: number;
  toplam_indirim_tutari: number;
  net_tutar: number;
  odeme_turu: string;
  taksit_sayisi: number;
  baslangic_tarihi: string | null;
  bitis_tarihi: string | null;
  toplam_odenen: number;
  kalan_borc: number;
  odeme_yuzdesi: number;
  egitim_yili: string;
  veli_adi: string;
  odeme_yontemi_ad: string;
  vadesi_gecen_toplam: number;
  vadesi_gecen_sayisi: number;
  taksitler: TaksitItem[];
  tahsilatlar: TahsilatItem[];
  fesih?: FesihInfo;
}

interface UyariItem {
  tip: "vadesi_gecmis" | "dondurulmus" | "feshedilmis" | "fesih" | "tum_odemeler_tamam";
  mesaj: string;
  detay?: string;
}

interface FinansOzet {
  toplam_sozlesme: number;
  toplam_net_tutar: number;
  toplam_odenen: number;
  toplam_kalan: number;
  odeme_yuzdesi: number;
  vadesi_gecen_toplam: number;
  vadesi_gecen_sayisi: number;
}

interface FinansOzetResponse {
  sozlesmeler: SozlesmeItem[];
  ozet: FinansOzet;
}

/* ─── Yardımcı Fonksiyonlar ─── */
const KURUM_COLOR = "#0262a7";
const KURUM_LIGHT = "#0380d4";

function formatMoney(val: string | number): string {
  const num = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(num)) return "0,00 ₺";
  return num.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₺";
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  const date = new Date(d);
  return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function durumLabel(durum: string): string {
  const map: Record<string, string> = {
    AKTIF: "Aktif",
    TASLAK: "Taslak",
    IPTAL: "İptal",
    DONDURULMUS: "Dondurulmuş",
    FESHEDILMIS: "Feshedilmiş",
    TAMAMLANDI: "Tamamlandı",
    BEKLEMEDE: "Beklemede",
    KISMI_ODENDI: "Kısmi Ödendi",
    ODENDI: "Ödendi",
    GECIKTI: "Gecikti",
    AKTIF_TAHSILAT: "Aktif",
    IPTAL_EDILDI: "İptal Edildi",
  };
  return map[durum] || durum;
}

function durumColor(durum: string): { bg: string; text: string } {
  switch (durum) {
    case "AKTIF":
    case "ODENDI":
    case "AKTIF_TAHSILAT":
      return { bg: "#dcfce7", text: "#166534" };
    case "GECIKTI":
      return { bg: "#fef2f2", text: "#991b1b" };
    case "FESHEDILMIS":
    case "IPTAL":
    case "IPTAL_EDILDI":
      return { bg: "#fef2f2", text: "#991b1b" };
    case "DONDURULMUS":
      return { bg: "#fefce8", text: "#854d0e" };
    case "KISMI_ODENDI":
      return { bg: "#eff6ff", text: "#1e40af" };
    case "BEKLEMEDE":
    case "TASLAK":
      return { bg: "#f1f5f9", text: "#475569" };
    case "TAMAMLANDI":
      return { bg: "#f0fdf4", text: "#14532d" };
    default:
      return { bg: "#f1f5f9", text: "#475569" };
  }
}

/* ─── Bileşen ─── */
interface FinansTabProps {
  ogrenciId: number;
}

export default function FinansTab({ ogrenciId }: FinansTabProps) {
  const [data, setData] = useState<FinansOzetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSozlesmeIdx, setSelectedSozlesmeIdx] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiGet<FinansOzetResponse>(`/ogrenciler/api/${ogrenciId}/finans-ozet/`)
      .then((res) => {
        if (!cancelled) {
          if (res.success && res.data) {
            setData(res.data);
          } else {
            setError(res.error || "Finans bilgileri yüklenemedi.");
          }
          setSelectedSozlesmeIdx(0);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || "Finans bilgileri yüklenemedi.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [ogrenciId]);

  /* Loading */
  if (loading) {
    return (
      <div className="tab-panel">
        <div className="finans-loading">
          <div className="finans-spinner" />
          <p>Finansal bilgiler yükleniyor...</p>
        </div>
        <style jsx>{`
          .finans-loading { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:80px 20px; gap:16px; }
          .finans-spinner { width:40px; height:40px; border:3px solid #e2e8f0; border-top-color:${KURUM_COLOR}; border-radius:50%; animation:fSpin .8s linear infinite; }
          @keyframes fSpin { to { transform:rotate(360deg); } }
          .finans-loading p { color:#64748b; font-size:14px; }
        `}</style>
      </div>
    );
  }

  /* Error */
  if (error) {
    return (
      <div className="tab-panel">
        <div className="finans-error">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          <p>{error}</p>
        </div>
        <style jsx>{`
          .finans-error { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:80px 20px; gap:12px; }
          .finans-error p { color:#ef4444; font-size:14px; }
        `}</style>
      </div>
    );
  }

  /* No Data */
  if (!data || data.sozlesmeler.length === 0) {
    return (
      <div className="tab-panel">
        <div className="empty-tab-content">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5">
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
          <h4>Finans Bilgileri</h4>
          <p>Bu öğrenciye ait finansal kayıt bulunmamaktadır.</p>
        </div>
      </div>
    );
  }

  const { sozlesmeler, ozet } = data;
  const aktifSozlesme = sozlesmeler[selectedSozlesmeIdx] || sozlesmeler[0];

  // Uyarıları backend verisinden türet
  const uyarilar: UyariItem[] = [];

  // 🔴 Gecikmiş taksitler
  if (ozet.vadesi_gecen_sayisi > 0) {
    uyarilar.push({
      tip: "vadesi_gecmis",
      mesaj: `${ozet.vadesi_gecen_sayisi} taksit gecikmiş — ${formatMoney(ozet.vadesi_gecen_toplam)}`,
    });
  }

  // 🟡 Dondurulmuş sözleşmeler
  sozlesmeler.forEach((s) => {
    if (s.durum === "DONDURULMUS") {
      uyarilar.push({ tip: "dondurulmus", mesaj: `Sözleşme dondurulmuş durumda`, detay: s.sozlesme_no });
    }
  });

  // 🔵 Fesih yapılmış sözleşmeler
  sozlesmeler.forEach((s) => {
    if (s.fesih) {
      uyarilar.push({
        tip: "fesih",
        mesaj: `Fesih yapıldı — İade: ${formatMoney(s.fesih.iade_tutari)}`,
        detay: `${s.sozlesme_no} • ${s.fesih.fesih_nedeni}${s.fesih.iade_yapildi_mi ? " • İade yapıldı" : " • İade bekliyor"}`,
      });
    } else if (s.durum === "FESHEDILMIS") {
      uyarilar.push({ tip: "feshedilmis", mesaj: `Sözleşme feshedilmiş`, detay: s.sozlesme_no });
    }
  });

  // 🟢 Tüm ödemeler tamamlandı
  if (ozet.toplam_kalan <= 0 && ozet.toplam_odenen > 0 && ozet.vadesi_gecen_sayisi === 0) {
    uyarilar.push({ tip: "tum_odemeler_tamam", mesaj: "Ödeme planı tamamlandı" });
  }

  return (
    <div className="tab-panel finans-tab">
      {/* ═══ DURUM KARTLARI ═══ */}
      {uyarilar.length > 0 && (
        <div className="finans-durum-kartlari">
          {uyarilar.map((u, i) => (
            <div key={i} className={`finans-durum-kart finans-durum-kart--${u.tip}`}>
              <span className="finans-durum-dot" />
              <div className="finans-durum-content">
                <span className="finans-durum-mesaj">{u.mesaj}</span>
                {u.detay && <span className="finans-durum-detay">{u.detay}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ BÖLÜM 1: FİNANSAL ÖZET KARTLARI ═══ */}
      <div className="finans-ozet-grid">
        <div className="finans-ozet-card">
          <div className="finans-ozet-card-icon" style={{ background: "linear-gradient(135deg, #eff6ff, #dbeafe)" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={KURUM_COLOR} strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
          </div>
          <div className="finans-ozet-card-content">
            <span className="finans-ozet-card-label">Sözleşme Tutarı</span>
            <span className="finans-ozet-card-value">{formatMoney(ozet.toplam_net_tutar)}</span>
          </div>
        </div>

        <div className="finans-ozet-card">
          <div className="finans-ozet-card-icon" style={{ background: "linear-gradient(135deg, #f0fdf4, #dcfce7)" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
          </div>
          <div className="finans-ozet-card-content">
            <span className="finans-ozet-card-label">Toplam Ödenen</span>
            <span className="finans-ozet-card-value" style={{ color: "#16a34a" }}>{formatMoney(ozet.toplam_odenen)}</span>
          </div>
        </div>

        <div className="finans-ozet-card">
          <div className="finans-ozet-card-icon" style={{ background: "linear-gradient(135deg, #fef2f2, #fecaca)" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <div className="finans-ozet-card-content">
            <span className="finans-ozet-card-label">Kalan Borç</span>
            <span className="finans-ozet-card-value" style={{ color: "#dc2626" }}>{formatMoney(ozet.toplam_kalan)}</span>
          </div>
        </div>

        {ozet.vadesi_gecen_sayisi > 0 && (
          <div className="finans-ozet-card finans-ozet-card--gecikti">
            <div className="finans-ozet-card-icon" style={{ background: "linear-gradient(135deg, #fef2f2, #fecaca)" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <div className="finans-ozet-card-content">
              <span className="finans-ozet-card-label">Gecikmiş ({ozet.vadesi_gecen_sayisi} taksit)</span>
              <span className="finans-ozet-card-value" style={{ color: "#dc2626" }}>{formatMoney(ozet.vadesi_gecen_toplam)}</span>
            </div>
          </div>
        )}

        <div className="finans-ozet-card">
          <div className="finans-ozet-card-icon finans-ozet-progress-wrap" style={{ background: "linear-gradient(135deg, #f5f3ff, #ede9fe)" }}>
            <svg width="48" height="48" viewBox="0 0 48 48" className="finans-progress-ring">
              <circle cx="24" cy="24" r="18" fill="none" stroke="#e2e8f0" strokeWidth="4" />
              <circle cx="24" cy="24" r="18" fill="none" stroke={KURUM_COLOR} strokeWidth="4"
                strokeDasharray={`${(ozet.odeme_yuzdesi / 100) * 113.1} 113.1`}
                strokeLinecap="round" transform="rotate(-90 24 24)" />
              <text x="24" y="26" textAnchor="middle" fontSize="11" fontWeight="700" fill={KURUM_COLOR}>
                %{Math.round(ozet.odeme_yuzdesi)}
              </text>
            </svg>
          </div>
          <div className="finans-ozet-card-content">
            <span className="finans-ozet-card-label">Ödeme Oranı</span>
            <span className="finans-ozet-card-value" style={{ color: KURUM_COLOR }}>%{ozet.odeme_yuzdesi.toFixed(1)}</span>
          </div>
        </div>
      </div>

      {/* ═══ SÖZLEŞME SEÇİCİ (Birden fazla varsa) ═══ */}
      {sozlesmeler.length > 1 && (
        <div className="finans-sozlesme-selector">
          <label>Sözleşme Seçin:</label>
          <select value={selectedSozlesmeIdx} onChange={(e) => setSelectedSozlesmeIdx(Number(e.target.value))}>
            {sozlesmeler.map((s, i) => (
              <option key={s.id} value={i}>
                {s.sozlesme_no} — {s.paket_adi} ({durumLabel(s.durum)})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* ═══ BÖLÜM 2: AKTİF SÖZLEŞME BİLGİSİ ═══ */}
      <div className="card-modern finans-card">
        <div className="card-modern-header finans-card-header">
          <h3>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            Sözleşme Bilgileri
          </h3>
          <span className="finans-durum-badge" style={{ background: durumColor(aktifSozlesme.durum).bg, color: durumColor(aktifSozlesme.durum).text }}>
            {durumLabel(aktifSozlesme.durum)}
          </span>
        </div>
        <div className="card-modern-body" style={{ padding: '20px 24px' }}>
          <div className="finans-sozlesme-grid">
            <div className="finans-sozlesme-field">
              <span className="finans-field-label">Sözleşme No</span>
              <span className="finans-field-value">{aktifSozlesme.sozlesme_no}</span>
            </div>
            <div className="finans-sozlesme-field">
              <span className="finans-field-label">Eğitim Paketi</span>
              <span className="finans-field-value">{aktifSozlesme.paket_adi || "—"}</span>
            </div>
            <div className="finans-sozlesme-field">
              <span className="finans-field-label">Eğitim Türü</span>
              <span className="finans-field-value">{aktifSozlesme.egitim_turu || "—"}</span>
            </div>
            <div className="finans-sozlesme-field">
              <span className="finans-field-label">Eğitim Yılı</span>
              <span className="finans-field-value">{aktifSozlesme.egitim_yili || "—"}</span>
            </div>
            <div className="finans-sozlesme-field">
              <span className="finans-field-label">Veli</span>
              <span className="finans-field-value">{aktifSozlesme.veli_adi || "—"}</span>
            </div>
            <div className="finans-sozlesme-field">
              <span className="finans-field-label">Ödeme Türü</span>
              <span className="finans-field-value">{aktifSozlesme.odeme_turu || "—"}</span>
            </div>
            <div className="finans-sozlesme-field">
              <span className="finans-field-label">Ödeme Yöntemi</span>
              <span className="finans-field-value">{aktifSozlesme.odeme_yontemi_ad || "—"}</span>
            </div>
            <div className="finans-sozlesme-field">
              <span className="finans-field-label">Taksit Sayısı</span>
              <span className="finans-field-value">{aktifSozlesme.taksit_sayisi || "—"}</span>
            </div>
            <div className="finans-sozlesme-field">
              <span className="finans-field-label">Başlangıç</span>
              <span className="finans-field-value">{formatDate(aktifSozlesme.baslangic_tarihi)}</span>
            </div>
            <div className="finans-sozlesme-field">
              <span className="finans-field-label">Bitiş</span>
              <span className="finans-field-value">{formatDate(aktifSozlesme.bitis_tarihi)}</span>
            </div>
          </div>

          {/* Fesih Bilgisi */}
          {aktifSozlesme.fesih && (
            <div className="finans-fesih-bilgi">
              <h4>Fesih Bilgisi</h4>
              <div className="finans-fesih-grid">
                <div className="finans-sozlesme-field">
                  <span className="finans-field-label">Fesih Tarihi</span>
                  <span className="finans-field-value">{formatDate(aktifSozlesme.fesih.fesih_tarihi)}</span>
                </div>
                <div className="finans-sozlesme-field">
                  <span className="finans-field-label">Fesih Nedeni</span>
                  <span className="finans-field-value">{aktifSozlesme.fesih.fesih_nedeni}</span>
                </div>
                <div className="finans-sozlesme-field">
                  <span className="finans-field-label">İade Tutarı</span>
                  <span className="finans-field-value">{formatMoney(aktifSozlesme.fesih.iade_tutari)}</span>
                </div>
                <div className="finans-sozlesme-field">
                  <span className="finans-field-label">İade Durumu</span>
                  <span className="finans-field-value" style={{ color: aktifSozlesme.fesih.iade_yapildi_mi ? "#16a34a" : "#dc2626" }}>
                    {aktifSozlesme.fesih.iade_yapildi_mi ? "İade Yapıldı ✓" : "İade Bekliyor"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Fiyat Dökümü */}
          <div className="finans-fiyat-dokum">
            <h4>Fiyat Dökümü</h4>
            <div className="finans-fiyat-rows">
              <div className="finans-fiyat-row">
                <span>Brüt Tutar</span>
                <span>{formatMoney(aktifSozlesme.brut_tutar)}</span>
              </div>
              {aktifSozlesme.kdv_tutari > 0 && (
                <div className="finans-fiyat-row">
                  <span>KDV (%{aktifSozlesme.kdv_orani})</span>
                  <span>{formatMoney(aktifSozlesme.kdv_tutari)}</span>
                </div>
              )}
              {aktifSozlesme.toplam_indirim_tutari > 0 && (
                <div className="finans-fiyat-row finans-fiyat-row--indirim">
                  <span>İndirim</span>
                  <span>-{formatMoney(aktifSozlesme.toplam_indirim_tutari)}</span>
                </div>
              )}
              <div className="finans-fiyat-row finans-fiyat-row--net">
                <span>Net Tutar</span>
                <span>{formatMoney(aktifSozlesme.net_tutar)}</span>
              </div>
            </div>
          </div>

          {/* Mini İlerleme Barı */}
          <div className="finans-sozlesme-progress">
            <div className="finans-progress-info">
              <span>Ödenen: <strong>{formatMoney(aktifSozlesme.toplam_odenen)}</strong></span>
              <span>Kalan: <strong>{formatMoney(aktifSozlesme.kalan_borc)}</strong></span>
            </div>
            <div className="finans-progress-bar-bg">
              <div className="finans-progress-bar-fill" style={{ width: `${Math.min(aktifSozlesme.odeme_yuzdesi, 100)}%` }} />
            </div>
            <span className="finans-progress-pct">%{aktifSozlesme.odeme_yuzdesi.toFixed(1)}</span>
          </div>
        </div>
      </div>

      {/* ═══ BÖLÜM 3: TAKSİT PLANI ═══ */}
      <div className="card-modern finans-card">
        <div className="card-modern-header finans-card-header">
          <h3>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Taksit Planı
            <span className="finans-taksit-count">{aktifSozlesme.taksitler.length} taksit</span>
          </h3>
        </div>
        <div className="card-modern-body" style={{ padding: 0 }}>
          {aktifSozlesme.taksitler.length === 0 ? (
            <div className="finans-table-empty">Taksit kaydı bulunmamaktadır.</div>
          ) : (
            <div className="finans-table-wrap">
              <table className="finans-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Vade Tarihi</th>
                    <th style={{ textAlign: "right" }}>Tutar</th>
                    <th style={{ textAlign: "right" }}>Ödenen</th>
                    <th style={{ textAlign: "right" }}>Kalan</th>
                    <th style={{ textAlign: "center" }}>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {aktifSozlesme.taksitler.map((t) => {
                    const isGecikti = t.durum === "GECIKTI";
                    return (
                      <tr key={t.id} className={isGecikti ? "finans-row-gecikti" : ""}>
                        <td>{t.taksit_no}</td>
                        <td>{formatDate(t.vade_tarihi)}</td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>{formatMoney(t.tutar)}</td>
                        <td style={{ textAlign: "right", color: "#16a34a" }}>{formatMoney(t.odenen_tutar)}</td>
                        <td style={{ textAlign: "right", color: t.kalan_tutar > 0 ? "#dc2626" : "#64748b" }}>
                          {formatMoney(t.kalan_tutar)}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <span className="finans-durum-badge finans-durum-badge--sm"
                            style={{ background: durumColor(t.durum).bg, color: durumColor(t.durum).text }}>
                            {durumLabel(t.durum)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ═══ BÖLÜM 4: SON TAHSİLATLAR ═══ */}
      <div className="card-modern finans-card">
        <div className="card-modern-header finans-card-header">
          <h3>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            Son Tahsilatlar
          </h3>
        </div>
        <div className="card-modern-body" style={{ padding: 0 }}>
          {aktifSozlesme.tahsilatlar.length === 0 ? (
            <div className="finans-table-empty">Tahsilat kaydı bulunmamaktadır.</div>
          ) : (
            <div className="finans-table-wrap">
              <table className="finans-table">
                <thead>
                  <tr>
                    <th>Tarih</th>
                    <th style={{ textAlign: "right" }}>Tutar</th>
                    <th style={{ textAlign: "center" }}>Taksit</th>
                    <th>Tür</th>
                    <th>Yöntem</th>
                    <th style={{ textAlign: "center" }}>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {aktifSozlesme.tahsilatlar.map((th) => (
                    <tr key={th.id}>
                      <td>{formatDate(th.tahsilat_tarihi)}</td>
                      <td style={{ textAlign: "right", fontWeight: 600, color: "#16a34a" }}>{formatMoney(th.tutar)}</td>
                      <td style={{ textAlign: "center" }}>
                        {th.dagitim && th.dagitim.length > 1
                          ? th.dagitim.map(d => `#${d.taksit_no}`).join(", ")
                          : th.dagitim && th.dagitim.length === 1
                            ? `#${th.dagitim[0].taksit_no}`
                            : th.taksit_no ?? "—"
                        }
                      </td>
                      <td>{th.tahsilat_turu || "—"}</td>
                      <td>{th.odeme_yontemi_ad || "—"}</td>
                      <td style={{ textAlign: "center" }}>
                        <span className="finans-durum-badge finans-durum-badge--sm"
                          style={{ background: durumColor(th.durum).bg, color: durumColor(th.durum).text }}>
                          {durumLabel(th.durum)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ═══ CSS ═══ */}
      <style jsx>{`
        .finans-tab { display:flex; flex-direction:column; gap:20px; min-width:0; max-width:100%; }

        /* ── Durum Kartları ── */
        .finans-durum-kartlari { display:flex; flex-direction:column; gap:8px; }
        .finans-durum-kart {
          display:flex; align-items:center; gap:12px;
          padding:14px 18px; border-radius:12px; font-size:14px;
          border-left:4px solid transparent;
        }
        .finans-durum-dot {
          width:10px; height:10px; border-radius:50%; flex-shrink:0;
        }
        .finans-durum-content { display:flex; flex-direction:column; gap:2px; }
        .finans-durum-mesaj { font-weight:700; font-size:14px; }
        .finans-durum-detay { font-size:12px; opacity:.75; }

        .finans-durum-kart--vadesi_gecmis { background:#fef2f2; border-left-color:#ef4444; color:#991b1b; }
        .finans-durum-kart--vadesi_gecmis .finans-durum-dot { background:#ef4444; box-shadow:0 0 0 3px rgba(239,68,68,.2); }

        .finans-durum-kart--dondurulmus { background:#fefce8; border-left-color:#f59e0b; color:#854d0e; }
        .finans-durum-kart--dondurulmus .finans-durum-dot { background:#f59e0b; box-shadow:0 0 0 3px rgba(245,158,11,.2); }

        .finans-durum-kart--tum_odemeler_tamam { background:#f0fdf4; border-left-color:#22c55e; color:#166534; }
        .finans-durum-kart--tum_odemeler_tamam .finans-durum-dot { background:#22c55e; box-shadow:0 0 0 3px rgba(34,197,94,.2); }

        .finans-durum-kart--fesih { background:#eff6ff; border-left-color:#3b82f6; color:#1e40af; }
        .finans-durum-kart--fesih .finans-durum-dot { background:#3b82f6; box-shadow:0 0 0 3px rgba(59,130,246,.2); }

        .finans-durum-kart--feshedilmis { background:#fef2f2; border-left-color:#ef4444; color:#991b1b; }
        .finans-durum-kart--feshedilmis .finans-durum-dot { background:#ef4444; box-shadow:0 0 0 3px rgba(239,68,68,.2); }

        /* ── Özet Grid ── */
        .finans-ozet-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:16px; min-width:0; }
        .finans-ozet-card--gecikti { border-color:#fecaca; }
        .finans-ozet-card {
          display:flex; align-items:center; gap:14px;
          background:#fff; border:1px solid #e2e8f0; border-radius:12px;
          padding:18px 16px; transition:box-shadow .2s;
        }
        .finans-ozet-card:hover { box-shadow:0 4px 12px rgba(0,0,0,.06); }
        .finans-ozet-card-icon { width:52px; height:52px; border-radius:12px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        .finans-ozet-progress-wrap { width:52px; height:52px; padding:0; }
        .finans-progress-ring { display:block; }
        .finans-ozet-card-content { display:flex; flex-direction:column; gap:4px; min-width:0; }
        .finans-ozet-card-label { font-size:12px; color:#64748b; font-weight:500; }
        .finans-ozet-card-value { font-size:18px; font-weight:700; color:#1e293b; white-space:nowrap; }

        /* ── Sözleşme Seçici ── */
        .finans-sozlesme-selector { display:flex; align-items:center; gap:12px; padding:12px 16px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; }
        .finans-sozlesme-selector label { font-size:13px; font-weight:600; color:#475569; white-space:nowrap; }
        .finans-sozlesme-selector select {
          flex:1; padding:8px 12px; border:1px solid #cbd5e1; border-radius:8px;
          font-size:13px; color:#1e293b; background:#fff; outline:none; cursor:pointer;
        }
        .finans-sozlesme-selector select:focus { border-color:${KURUM_COLOR}; box-shadow:0 0 0 3px rgba(2,98,167,.12); }

        /* ── Finans Kart ── */
        .finans-card { min-width:0; max-width:100%; overflow:hidden; box-sizing:border-box; }

        /* ── Kart Header ── */
        .finans-card-header { display:flex; align-items:center; justify-content:space-between; }
        .finans-card-header h3 { display:flex; align-items:center; gap:8px; }

        /* ── Durum Badge ── */
        .finans-durum-badge { display:inline-flex; padding:4px 12px; border-radius:20px; font-size:12px; font-weight:600; }
        .finans-durum-badge--sm { padding:3px 10px; font-size:11px; }

        /* ── Sözleşme Detay Grid ── */
        .finans-sozlesme-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(180px, 1fr)); gap:16px; padding-bottom:16px; border-bottom:1px solid #f1f5f9; min-width:0; }
        .finans-sozlesme-field { display:flex; flex-direction:column; gap:3px; min-width:0; overflow:hidden; }
        .finans-field-label { font-size:11px; color:#94a3b8; font-weight:500; text-transform:uppercase; letter-spacing:.5px; }
        .finans-field-value { font-size:14px; color:#1e293b; font-weight:600; overflow:hidden; text-overflow:ellipsis; }

        /* ── Fesih Bilgisi ── */
        .finans-fesih-bilgi { margin-top:16px; padding:16px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; }
        .finans-fesih-bilgi h4 { font-size:13px; font-weight:600; color:#1e40af; margin-bottom:12px; }
        .finans-fesih-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(180px, 1fr)); gap:16px; }

        /* ── Fiyat Dökümü ── */
        .finans-fiyat-dokum { margin-top:16px; padding-bottom:16px; border-bottom:1px solid #f1f5f9; }
        .finans-fiyat-dokum h4 { font-size:13px; font-weight:600; color:#475569; margin-bottom:10px; }
        .finans-fiyat-rows { display:flex; flex-direction:column; gap:6px; max-width:360px; }
        .finans-fiyat-row { display:flex; justify-content:space-between; font-size:13px; color:#475569; padding:4px 0; }
        .finans-fiyat-row--indirim span:last-child { color:#16a34a; font-weight:600; }
        .finans-fiyat-row--net { border-top:1px solid #e2e8f0; padding-top:8px; margin-top:4px; font-weight:700; color:#1e293b; font-size:14px; }

        /* ── İlerleme Barı ── */
        .finans-sozlesme-progress { margin-top:16px; }
        .finans-progress-info { display:flex; justify-content:space-between; font-size:12px; color:#64748b; margin-bottom:6px; }
        .finans-progress-info strong { color:#1e293b; }
        .finans-progress-bar-bg { width:100%; height:10px; background:#e2e8f0; border-radius:99px; overflow:hidden; }
        .finans-progress-bar-fill { height:100%; background:linear-gradient(90deg, ${KURUM_COLOR}, ${KURUM_LIGHT}); border-radius:99px; transition:width .6s ease; }
        .finans-progress-pct { font-size:12px; font-weight:700; color:${KURUM_COLOR}; margin-top:4px; display:inline-block; }

        /* ── Taksit Count ── */
        .finans-taksit-count { font-size:12px; font-weight:500; color:#94a3b8; margin-left:4px; }

        /* ── Tablo ── */
        .finans-table-wrap { overflow-x:auto; min-width:0; max-width:100%; }
        .finans-table { width:100%; border-collapse:collapse; font-size:13px; }
        .finans-table thead th {
          padding:10px 14px; text-align:left; font-size:11px; font-weight:600;
          color:#64748b; text-transform:uppercase; letter-spacing:.5px;
          background:#f8fafc; border-bottom:1px solid #e2e8f0;
        }
        .finans-table tbody td { padding:10px 14px; border-bottom:1px solid #f1f5f9; color:#334155; }
        .finans-table tbody tr:hover { background:#f8fafc; }
        .finans-row-gecikti { background:#fef2f2 !important; }
        .finans-row-gecikti:hover { background:#fee2e2 !important; }
        .finans-table-empty { padding:32px 20px; text-align:center; color:#94a3b8; font-size:13px; }

        /* ── Responsive ── */
        @media (max-width: 1024px) {
          .finans-ozet-grid { grid-template-columns:repeat(2, 1fr); }
        }
        @media (max-width: 640px) {
          .finans-ozet-grid { grid-template-columns:1fr; }
          .finans-ozet-card-value { font-size:16px; }
        }
      `}</style>
    </div>
  );
}
