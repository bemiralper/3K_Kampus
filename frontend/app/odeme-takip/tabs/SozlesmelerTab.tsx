"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  buildEqualTaksitRows,
  addMonths,
  clampTaksitSayisi,
  rowsMatchEqualPlan,
  type ManuelTaksitRow,
} from "../utils/taksitPlan";
import Link from "next/link";
import { useOdemePath } from "@/components/odeme-takip/OdemePathProvider";
import {
  Sozlesme, Taksit, TahsilatItem, TahsilatFormData, OdemeYontemi,
  Kalem, Indirim, Gecmis, KalemSecenegi, KalemTuruOption, SozlesmeSubTab,
} from "../types";
import {
  formatCurrency, formatDate, durumLabel, taksitDurumLabel, tahsilatTuruLabel,
  DurumBadge, API_BASE, postHeaders, egitimTuruLabel, kalemTuruLabel, odemeTuruLabel,
  taksitPeriyoduLabel, tahsilatDurumLabel, gecmisIslemTuruText, islemYapanText,
} from "../helpers";
import Pagination, { paginateList } from "../components/Pagination";
import { extractApiError } from "@/lib/api";
import { buildTaksitOdemeYontemleri, isCekSenetYontem as isCekSenetYontemTip } from "@/lib/finans/paymentMethodUtils";

// ─── Props ──────────────────────────────────────────────────

interface Props {
  sozlesmeler: Sozlesme[];
  selectedSozlesme: Sozlesme | null;
  searchTerm: string;
  odemeYontemleri: OdemeYontemi[];
  setSearchTerm: (v: string) => void;
  onSelectSozlesme: (id: number) => void;
  onCloseDetail: () => void;
  onStatusChange: (sozlesmeId: number, yeniDurum: string) => void;
  onTahsilatStart: (form: TahsilatFormData) => void;
  onTahsilatCancel: (tahsilatId: number) => void;
  onDelete: (sozlesmeId: number) => void;
  onMakbuz: (tahsilatId: number) => void;
  onOdemePlani: (sozlesmeId: number) => void;
  onSozlesmeBelgesi: (sozlesmeId: number) => void;
  onFesihBelgesi: (sozlesmeId: number) => void;
  onEdit: (sozlesmeId: number) => void;
  onKalemChanged: () => void;
  onWhatsAppPlan: (sozlesmeId: number, studentName?: string) => void;
  onWhatsAppSozlesme: (sozlesmeId: number, studentName?: string) => void;
  onWhatsAppMakbuz: (tahsilatId: number, studentName?: string) => void;
}

// ─── Badge Helper ───────────────────────────────────────────

function DurumBadgeModern({ durum, map }: { durum: string; map: Record<string, { label: string; color: string; bg: string }> }) {
  const d = map[durum] || { label: durum, color: "#6b7280", bg: "#f3f4f6" };
  const classMap: Record<string, string> = {
    "#059669": "success",
    "#dc2626": "danger",
    "#d97706": "warning",
    "#991b1b": "danger",
    "#2563eb": "info",
    "#6b7280": "primary",
    "#9ca3af": "primary",
  };
  const cls = classMap[d.color] || "primary";
  return <span className={`badge-modern ${cls}`}>{d.label}</span>;
}

// ─── Main Component ─────────────────────────────────────────

export default function SozlesmelerTab({
  sozlesmeler, selectedSozlesme, searchTerm, odemeYontemleri,
  setSearchTerm, onSelectSozlesme, onCloseDetail, onStatusChange,
  onTahsilatStart, onTahsilatCancel, onDelete, onMakbuz, onOdemePlani, onSozlesmeBelgesi, onFesihBelgesi, onEdit, onKalemChanged,
  onWhatsAppPlan, onWhatsAppSozlesme, onWhatsAppMakbuz,
}: Props) {
  const { href } = useOdemePath();
  const [subTab, setSubTab] = useState<SozlesmeSubTab>("genel");
  const [durumFilter, setDurumFilter] = useState(""); // ← Tüm durumlar

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // Kalem ekleme state
  const [showKalemDrawer, setShowKalemDrawer] = useState(false);
  const [kalemTurleri, setKalemTurleri] = useState<KalemTuruOption[]>([]);
  const [seciliKalemTuru, setSeciliKalemTuru] = useState("");
  const [kalemSecenekleri, setKalemSecenekleri] = useState<KalemSecenegi[]>([]);
  const [mevcutGrupDersi, setMevcutGrupDersi] = useState<{ kalem_id: number; kalem_adi: string; ucretsiz?: boolean } | null>(null);
  const [mevcutDeneme, setMevcutDeneme] = useState<{ kalem_id: number; kalem_adi: string; ucretsiz?: boolean } | null>(null);
  const [seciliKalemId, setSeciliKalemId] = useState<number | null>(null);
  const [kalemIndirimOrani, setKalemIndirimOrani] = useState("0");
  const [kalemNetFiyat, setKalemNetFiyat] = useState("");
  const [indirimMode, setIndirimMode] = useState<"oran" | "net">("oran");
  const [kalemLoading, setKalemLoading] = useState(false);
  const [kalemSaving, setKalemSaving] = useState(false);
  const [kalemFiltre, setKalemFiltre] = useState<{ sinif_seviyesi_ad?: string | null; alan_ad?: string | null } | null>(null);
  const [kalemFiltreUyarisi, setKalemFiltreUyarisi] = useState("");

  // Kalem çıkarma
  const [removeKalemId, setRemoveKalemId] = useState<number | null>(null);
  const [removeSaving, setRemoveSaving] = useState(false);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, durumFilter]);

  // Filtreleme
  const filteredSozlesmeler = sozlesmeler.filter((s) => {
    const term = searchTerm.toLowerCase();
    const matchSearch = !term || (
      s.sozlesme_no.toLowerCase().includes(term) ||
      (s.ogrenci && `${s.ogrenci.ad} ${s.ogrenci.soyad}`.toLowerCase().includes(term)) ||
      s.paket_adi.toLowerCase().includes(term)
    );
    const matchDurum = !durumFilter || s.durum === durumFilter;
    return matchSearch && matchDurum;
  });

  const pagedSozlesmeler = paginateList(filteredSozlesmeler, currentPage, pageSize);

  useEffect(() => { setSubTab("genel"); }, [selectedSozlesme?.id]);

  // ─── Kalem Fonksiyonları ──────────────────────────────────

  const fetchKalemTurleri = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/kalem-turleri/`, { credentials: "include" });
      const data = await res.json();
      setKalemTurleri(Array.isArray(data) ? data : []);
    } catch { setKalemTurleri([]); }
  }, []);

  const fetchKalemSecenekleri = useCallback(async (tur: string) => {
    if (!selectedSozlesme) return;
    setKalemLoading(true);
    try {
      const params = new URLSearchParams({ tur });
      if (selectedSozlesme.ogrenci?.id) params.set("ogrenci_id", String(selectedSozlesme.ogrenci.id));
      if (selectedSozlesme.egitim_yili_id) params.set("egitim_yili_id", String(selectedSozlesme.egitim_yili_id));
      if (selectedSozlesme.kurum_id) params.set("kurum_id", String(selectedSozlesme.kurum_id));
      if (selectedSozlesme.sube_id) params.set("sube_id", String(selectedSozlesme.sube_id));
      params.set("sozlesme_id", String(selectedSozlesme.id));
      const res = await fetch(`${API_BASE}/kalem-secenekleri/?${params}`, { credentials: "include" });
      const data = await res.json();
      setKalemSecenekleri(Array.isArray(data?.secenekler) ? data.secenekler : []);
      setMevcutGrupDersi(data?.mevcut_grup_dersi || null);
      setMevcutDeneme(data?.mevcut_deneme || null);
      setKalemFiltre(data?.filtre || null);
      setKalemFiltreUyarisi(data?.filtre_uyarisi || "");
    } catch {
      setKalemSecenekleri([]);
      setMevcutGrupDersi(null);
      setMevcutDeneme(null);
      setKalemFiltre(null);
      setKalemFiltreUyarisi("");
    }
    setKalemLoading(false);
  }, [selectedSozlesme]);

  const handleKalemTuruChange = (tur: string) => {
    setSeciliKalemTuru(tur);
    setSeciliKalemId(null);
    if (tur) fetchKalemSecenekleri(tur);
    else {
      setKalemSecenekleri([]);
      setMevcutGrupDersi(null);
      setMevcutDeneme(null);
      setKalemFiltre(null);
      setKalemFiltreUyarisi("");
    }
  };

  const handleKalemEkle = async (replaceConfirmed = false) => {
    if (!selectedSozlesme || !seciliKalemId || !seciliKalemTuru) return;
    const secenek = kalemSecenekleri.find(k => k.id === seciliKalemId);
    if (!secenek) return;

    const denemeDegisiyor =
      seciliKalemTuru === "deneme" &&
      mevcutDeneme &&
      mevcutDeneme.kalem_id !== seciliKalemId;

    if (denemeDegisiyor && !replaceConfirmed) {
      const mesaj = mevcutDeneme.ucretsiz
        ? `Mevcut ücretsiz deneme paketi "${mevcutDeneme.kalem_adi}" kaldırılacak. "${secenek.ad}" yeni paket olarak ücretsiz eklenecek. Onaylıyor musunuz?`
        : `Mevcut ücretli deneme paketi "${mevcutDeneme.kalem_adi}" kaldırılacak ve "${secenek.ad}" (${formatCurrency(secenek.kdv_dahil_fiyat || secenek.fiyat)}) ile değiştirilecek. Onaylıyor musunuz?`;
      if (!window.confirm(mesaj)) return;
      replaceConfirmed = true;
    }

    setKalemSaving(true);
    try {
      const secenekFiyat = secenek.kdv_dahil_fiyat || secenek.fiyat;
      const ucretsizDeneme = denemeDegisiyor && !!mevcutDeneme?.ucretsiz;
      const oran = ucretsizDeneme ? 0 : (parseFloat(kalemIndirimOrani) || 0);
      const hedefNet = ucretsizDeneme ? 0 : (parseFloat(kalemNetFiyat) || 0);
      const indirimTutar = ucretsizDeneme
        ? secenekFiyat
        : indirimMode === "net"
          ? Math.max(0, Math.round(secenekFiyat - hedefNet))
          : Math.round(secenekFiyat * oran / 100);
      const netTutar = ucretsizDeneme ? 0 : Math.max(0, secenekFiyat - indirimTutar);

      const res = await fetch(`${API_BASE}/sozlesmeler/${selectedSozlesme.id}/kalem-ekle/`, {
        method: "POST",
        headers: postHeaders(),
        credentials: "include",
        body: JSON.stringify({
          kalem_turu: seciliKalemTuru,
          kalem_id: secenek.id,
          kalem_adi: secenek.ad,
          brut_tutar: secenek.fiyat,
          kdv_orani: secenek.kdv_orani,
          indirim_orani: oran,
          indirim_tutari: indirimTutar,
          net_tutar: netTutar,
          replace_confirmed: replaceConfirmed,
        }),
      });
      if (res.ok) {
        setShowKalemDrawer(false);
        setSeciliKalemTuru("");
        setSeciliKalemId(null);
        setKalemIndirimOrani("0");
        setKalemNetFiyat("");
        setIndirimMode("oran");
        setMevcutGrupDersi(null);
        setMevcutDeneme(null);
        onKalemChanged();
      } else {
        const err = await res.json();
        if (
          !replaceConfirmed &&
          (err.code === "grup_degistirme_onayi_gerekli" || err.code === "deneme_degistirme_onayi_gerekli")
        ) {
          if (window.confirm(err.error || "Mevcut paket değiştirilecek. Onaylıyor musunuz?")) {
            setKalemSaving(false);
            await handleKalemEkle(true);
            return;
          }
        } else {
          alert(err.error || "Kalem eklenemedi");
        }
      }
    } catch { alert("Bağlantı hatası"); }
    setKalemSaving(false);
  };

  const handleKalemCikar = async (kalemId: number) => {
    setRemoveSaving(true);
    try {
      const res = await fetch(`${API_BASE}/kalemler/${kalemId}/cikar/`, {
        method: "DELETE",
        headers: postHeaders(),
        credentials: "include",
      });
      if (res.ok) {
        setRemoveKalemId(null);
        onKalemChanged();
      } else {
        const err = await res.json();
        alert(err.error || "Kalem çıkarılamadı");
      }
    } catch { alert("Bağlantı hatası"); }
    setRemoveSaving(false);
  };

  // ═══════════════════════════════════════════════════════════
  // LİSTE GÖRÜNÜMÜ
  // ═══════════════════════════════════════════════════════════

  if (!selectedSozlesme) {
    return (
      <div>
        {/* Üst bar: Card modern header ile */}
        <div className="card-modern">
          <div className="card-modern-header">
            <h3>
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Sözleşmeler
            </h3>
            <div className="card-modern-header-actions">
              <div className="search-modern">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Sözleşme no, öğrenci adı veya paket ara..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <select
                className="odeme-form-control"
                value={durumFilter}
                onChange={(e) => setDurumFilter(e.target.value)}
                style={{ minWidth: 140, padding: "8px 12px", fontSize: 13 }}
              >
                <option value="">Tüm Durumlar</option>
                {Object.entries(durumLabel).map(([key, val]) => (
                  <option key={key} value={key}>{val.label}</option>
                ))}
              </select>
              <Link href={href("sozlesme-olustur")} className="btn-modern btn-primary">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Yeni Sözleşme
              </Link>
            </div>
          </div>

          <div className="card-modern-body">
            {filteredSozlesmeler.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📋</div>
                <h4>Sözleşme bulunamadı</h4>
                <p>Kriterlere uygun sözleşme bulunamadı</p>
              </div>
            ) : (
              <>
                <table className="table-modern">
                  <thead>
                    <tr>
                      <th>Sözleşme No</th>
                      <th>Öğrenci</th>
                      <th>Paket</th>
                      <th>Durum</th>
                      <th style={{ textAlign: "right" }}>Net Tutar</th>
                      <th style={{ textAlign: "right" }}>Ödenen</th>
                      <th style={{ textAlign: "right" }}>Kalan</th>
                      <th style={{ textAlign: "center" }}>İlerleme</th>
                      <th style={{ textAlign: "center" }}>Tarih</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedSozlesmeler.map((s) => (
                      <tr key={s.id} onClick={() => onSelectSozlesme(s.id)} style={{ cursor: "pointer" }}>
                        <td>
                          <span style={{ fontWeight: 700, color: "var(--primary)" }}>{s.sozlesme_no}</span>
                        </td>
                        <td>
                          <div className="cell-info">
                            <span className="cell-primary">{s.ogrenci ? `${s.ogrenci.ad} ${s.ogrenci.soyad}` : "-"}</span>
                            {s.ogrenci?.ogrenci_no && <span className="cell-secondary">{s.ogrenci.ogrenci_no}</span>}
                          </div>
                        </td>
                        <td>
                          <div style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {s.paket_adi}
                          </div>
                        </td>
                        <td><DurumBadgeModern durum={s.durum} map={durumLabel} /></td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>{formatCurrency(s.net_tutar)}</td>
                        <td style={{ textAlign: "right", color: "#059669", fontWeight: 600 }}>{formatCurrency(s.toplam_odenen)}</td>
                        <td style={{ textAlign: "right", color: s.kalan_borc > 0 ? "#dc2626" : "#059669", fontWeight: 600 }}>{formatCurrency(s.kalan_borc)}</td>
                        <td style={{ textAlign: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
                            <div style={{ width: 60, height: 6, borderRadius: 3, background: "var(--border-color)", overflow: "hidden" }}>
                              <div style={{
                                height: "100%", borderRadius: 3,
                                background: s.odeme_yuzdesi >= 100 ? "var(--success)" : "var(--primary)",
                                width: `${Math.min(s.odeme_yuzdesi, 100)}%`,
                              }} />
                            </div>
                            <span style={{ fontSize: 11, color: "var(--text-muted)", minWidth: 30 }}>%{Math.round(s.odeme_yuzdesi)}</span>
                          </div>
                        </td>
                        <td style={{ textAlign: "center", color: "var(--text-muted)" }}>{formatDate(s.olusturma_tarihi)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ padding: "0 14px", borderTop: "1px solid #f1f4f9" }}>
                  <Pagination
                    currentPage={currentPage}
                    totalItems={filteredSozlesmeler.length}
                    pageSize={pageSize}
                    onPageChange={setCurrentPage}
                    onPageSizeChange={setPageSize}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // DETAY GÖRÜNÜMÜ
  // ═══════════════════════════════════════════════════════════

  const s = selectedSozlesme;
  const subTabs: { key: SozlesmeSubTab; label: string; icon: string }[] = [
    { key: "genel", label: "Genel Bilgiler", icon: "📋" },
    { key: "kalemler", label: `Kalemler (${s.kalemler?.length || 0})`, icon: "📦" },
    { key: "odeme-plani", label: `Ödeme Planı (${s.taksitler?.length || 0})`, icon: "📅" },
    { key: "tahsilatlar", label: `Tahsilatlar (${s.tahsilatlar?.length || 0})`, icon: "💰" },
    { key: "belgeler", label: "Belgeler", icon: "📄" },
  ];

  const durumGecisleri: Record<string, { label: string; color: string; durum: string }[]> = {
    taslak: [
      { label: "Aktifleştir", color: "#059669", durum: "aktif" },
      { label: "İptal Et", color: "#dc2626", durum: "iptal" },
    ],
    aktif: [
      { label: "Dondur", color: "#d97706", durum: "dondurulmus" },
      { label: "Tamamla", color: "#2563eb", durum: "tamamlandi" },
      { label: "Feshet", color: "#991b1b", durum: "feshedilmis" },
      { label: "İptal Et", color: "#dc2626", durum: "iptal" },
    ],
    dondurulmus: [
      { label: "Aktifleştir", color: "#059669", durum: "aktif" },
      { label: "Feshet", color: "#991b1b", durum: "feshedilmis" },
      { label: "İptal Et", color: "#dc2626", durum: "iptal" },
    ],
  };

  const mevcutGecisler = durumGecisleri[s.durum] || [];

  return (
    <div>
      {/* Geri butonu + Başlık */}
      <div className="odeme-detail-header">
        <button className="btn-modern btn-secondary" onClick={onCloseDetail}>
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Listeye Dön
        </button>
        <div className="odeme-detail-title">
          <h2>
            {s.ogrenci ? `${s.ogrenci.ad} ${s.ogrenci.soyad}` : "—"}
            {s.paket_adi && (
              <span className="odeme-detail-package"> • {s.paket_adi}</span>
            )}
            <DurumBadgeModern durum={s.durum} map={durumLabel} />
            {s.versiyon && s.versiyon > 1 && (
              <span className="badge-modern" style={{ background: "#f5f3ff", color: "#7c3aed" }}>v{s.versiyon}</span>
            )}
          </h2>
          <p className="odeme-detail-contract-no">{s.sozlesme_no}</p>
        </div>

        <div className="odeme-detail-actions">
          {(s.durum === "taslak" || s.durum === "aktif") && (
            <button className="btn-modern btn-primary" onClick={() => onEdit(s.id)}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Düzenle
            </button>
          )}
          {mevcutGecisler.map((g) => (
            <button
              key={g.durum}
              className="btn-modern btn-secondary"
              style={{ color: g.color, borderColor: g.color }}
              onClick={() => onStatusChange(s.id, g.durum)}
            >{g.label}</button>
          ))}
          {s.durum === "taslak" && (
            <button
              className="btn-modern btn-secondary"
              style={{ color: "#dc2626", borderColor: "#dc2626" }}
              onClick={() => onDelete(s.id)}
            >🗑️ Sil</button>
          )}
        </div>
      </div>

      {/* Finans Kartları */}
      <div className="odeme-stats">
        {[
          { label: "Brüt Toplam", value: formatCurrency(s.brut_tutar), color: "var(--primary)" },
          { label: "İndirim", value: `-${formatCurrency(s.toplam_indirim_tutari)}`, color: "#dc2626" },
          { label: "Net Tutar", value: formatCurrency(s.net_tutar), color: "#7c3aed" },
          { label: "Ödenen", value: formatCurrency(s.toplam_odenen), color: "#059669" },
          { label: "Kalan", value: formatCurrency(s.kalan_borc), color: s.kalan_borc > 0 ? "#d97706" : "#059669" },
          { label: "Gecikmiş", value: formatCurrency(
            (s.taksitler || []).filter(t => t.durum === 'beklemede' && t.vade_tarihi && new Date(t.vade_tarihi) < new Date()).reduce((sum, t) => sum + t.kalan_tutar, 0)
          ), color: "#dc2626" },
        ].map((card, i) => (
          <div key={i} className="odeme-stat">
            <div className="odeme-stat-label">{card.label}</div>
            <div className="odeme-stat-value" style={{ color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* İlerleme barı */}
      <div className="odeme-progress-bar">
        <span className="odeme-progress-bar-label">Ödeme İlerlemesi</span>
        <div className="odeme-progress-track">
          <div
            className={`odeme-progress-fill ${s.odeme_yuzdesi >= 100 ? "complete" : ""}`}
            style={{ width: `${Math.min(s.odeme_yuzdesi, 100)}%` }}
          />
        </div>
        <span className="odeme-progress-value">%{Math.round(s.odeme_yuzdesi)}</span>
      </div>

      {/* Sub-tabs (pill style) */}
      <div className="odeme-subtabs">
        {subTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSubTab(tab.key)}
            className={`odeme-subtab ${subTab === tab.key ? "active" : ""}`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Sub-tab content */}
      <div className="card-modern">
        <div className="card-modern-body" style={{ padding: 24 }}>
          {subTab === "genel" && <GenelSubTab sozlesme={s} />}
          {subTab === "kalemler" && (
            <KalemlerSubTab
              sozlesme={s}
              onAddClick={() => { fetchKalemTurleri(); setShowKalemDrawer(true); }}
              onRemoveClick={setRemoveKalemId}
            />
          )}
          {subTab === "odeme-plani" && (
            <OdemePlaniSubTab
              sozlesme={s}
              odemeYontemleri={odemeYontemleri}
              onTahsilatStart={onTahsilatStart}
              onOdemePlani={onOdemePlani}
              onRefresh={onKalemChanged}
              onWhatsAppPlan={() => onWhatsAppPlan(
                s.id,
                s.ogrenci ? `${s.ogrenci.ad} ${s.ogrenci.soyad}`.trim() : undefined,
              )}
            />
          )}
          {subTab === "tahsilatlar" && (
            <TahsilatlarSubTab
              sozlesme={s}
              onTahsilatCancel={onTahsilatCancel}
              onMakbuz={onMakbuz}
              onWhatsAppMakbuz={(id) => onWhatsAppMakbuz(
                id,
                s.ogrenci ? `${s.ogrenci.ad} ${s.ogrenci.soyad}`.trim() : undefined,
              )}
            />
          )}
          {subTab === "belgeler" && (
            <BelgelerSubTab
              sozlesme={s}
              onSozlesmeBelgesi={onSozlesmeBelgesi}
              onOdemePlani={onOdemePlani}
              onFesihBelgesi={onFesihBelgesi}
              onMakbuz={onMakbuz}
              onWhatsAppPlan={() => onWhatsAppPlan(
                s.id,
                s.ogrenci ? `${s.ogrenci.ad} ${s.ogrenci.soyad}`.trim() : undefined,
              )}
              onWhatsAppSozlesme={() => onWhatsAppSozlesme(
                s.id,
                s.ogrenci ? `${s.ogrenci.ad} ${s.ogrenci.soyad}`.trim() : undefined,
              )}
              onWhatsAppMakbuz={(id) => onWhatsAppMakbuz(
                id,
                s.ogrenci ? `${s.ogrenci.ad} ${s.ogrenci.soyad}`.trim() : undefined,
              )}
            />
          )}
        </div>
      </div>

      {/* Geçmiş */}
      {s.gecmis && s.gecmis.length > 0 && (
        <div className="card-modern" style={{ marginTop: 20 }}>
          <div className="card-modern-header">
            <h3>📜 İşlem Geçmişi</h3>
          </div>
          <div className="card-modern-body" style={{ padding: "12px 16px" }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "88px 120px 1fr 140px",
              gap: "6px 10px",
              padding: "6px 8px",
              borderBottom: "1px solid var(--border-color, #e5e7eb)",
              fontSize: 10,
              fontWeight: 700,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: 0.4,
            }}>
              <span>Tarih</span>
              <span>İşlem</span>
              <span>Açıklama</span>
              <span style={{ textAlign: "right" }}>Yetkili</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", maxHeight: 220, overflowY: "auto" }}>
              {s.gecmis.map((g) => (
                <div
                  key={g.id}
                  className="odeme-gecmis-item"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "88px 120px 1fr 140px",
                    gap: "6px 10px",
                    alignItems: "start",
                    padding: "8px",
                    borderBottom: "1px solid #f1f5f9",
                  }}
                >
                  <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                    {formatDate(g.islem_tarihi)}
                  </span>
                  <span className="badge-modern primary" style={{ fontSize: 10, padding: "2px 6px", justifySelf: "start" }}>
                    {gecmisIslemTuruText(g.islem_turu, g.islem_turu_label)}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.45 }}>{g.aciklama}</span>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: g.islem_yapan?.trim() ? "#334155" : "#9ca3af",
                    textAlign: "right",
                    lineHeight: 1.45,
                  }}>
                    {islemYapanText(g.islem_yapan)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── Kalem Ekleme Drawer ─────────────────────── */}
      {showKalemDrawer && (
        <>
          <div className="odeme-drawer-overlay" onClick={() => setShowKalemDrawer(false)} />
          <div className="odeme-drawer">
            <div className="odeme-drawer-header">
              <h3>📦 Kalem Ekle</h3>
              <button className="odeme-drawer-close" onClick={() => setShowKalemDrawer(false)}>✕</button>
            </div>
            <div className="odeme-drawer-body">
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div className="odeme-form-group">
                  <label className="odeme-form-label">Kalem Türü *</label>
                  <select className="odeme-form-control" value={seciliKalemTuru} onChange={(e) => handleKalemTuruChange(e.target.value)}>
                    <option value="">Seçin...</option>
                    {kalemTurleri.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                {seciliKalemTuru && (
                  <>
                    {kalemFiltre?.sinif_seviyesi_ad && (
                      <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "8px 12px", background: "#f0f9ff", borderRadius: 8, border: "1px solid #bae6fd" }}>
                        {kalemFiltre.sinif_seviyesi_ad}
                        {kalemFiltre.alan_ad ? ` • ${kalemFiltre.alan_ad}` : ""} sınıf seviyesine uygun paketler listeleniyor.
                      </div>
                    )}
                    {kalemFiltreUyarisi && (
                      <div className="odeme-warning" style={{ marginBottom: 0 }}>
                        <div className="odeme-warning-title">{kalemFiltreUyarisi}</div>
                      </div>
                    )}
                    {seciliKalemTuru === "grup_dersi" && mevcutGrupDersi && (
                      <div className="odeme-warning" style={{ marginBottom: 0 }}>
                        <div className="odeme-warning-title">Mevcut grup dersi: {mevcutGrupDersi.kalem_adi}</div>
                        <p style={{ margin: "6px 0 0", fontSize: 13 }}>
                          Aynı anda yalnızca bir grup dersi olabilir. Yeni seçim mevcut paketin yerini alır.
                        </p>
                      </div>
                    )}
                    {seciliKalemTuru === "deneme" && mevcutDeneme && (
                      <div className="odeme-warning" style={{ marginBottom: 0 }}>
                        <div className="odeme-warning-title">Mevcut deneme: {mevcutDeneme.kalem_adi}</div>
                        <p style={{ margin: "6px 0 0", fontSize: 13 }}>
                          Aynı anda yalnızca bir deneme paketi olabilir.
                          {mevcutDeneme.ucretsiz
                            ? " Mevcut paket ücretsiz; farklı bir paket seçerseniz yeni paket de ücretsiz kaydedilir."
                            : " Mevcut paket ücretli; farklı bir paket seçerseniz değiştirme onayı istenir ve yeni paket fiyatı uygulanır."}
                        </p>
                      </div>
                    )}
                    {seciliKalemTuru === "deneme" && mevcutDeneme && seciliKalemId && seciliKalemId !== mevcutDeneme.kalem_id && (
                      <div className="odeme-warning" style={{ marginBottom: 0, borderColor: "#f59e0b", background: "#fffbeb" }}>
                        <div className="odeme-warning-title" style={{ color: "#b45309" }}>Deneme paketi değişecek</div>
                        <p style={{ margin: "6px 0 0", fontSize: 13 }}>
                          {mevcutDeneme.ucretsiz
                            ? "Seçtiğiniz paket mevcut ücretsiz denemenin yerine ücretsiz olarak geçecek."
                            : "Seçtiğiniz paket mevcut ücretli denemenin yerine geçecek; kaydetmeden önce onay istenecek."}
                        </p>
                      </div>
                    )}
                    {seciliKalemTuru === "ozel_ders" && (
                      <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>
                        Özel derslerde sınır yoktur; öğrenci sahip olmadığı özel ders paketlerini ekleyebilir (grup dersi ile birlikte de alınabilir).
                      </div>
                    )}
                  <div className="odeme-form-group">
                    <label className="odeme-form-label">Paket / Hizmet Seçimi *</label>
                    {kalemLoading ? (
                      <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)" }}>Yükleniyor...</div>
                    ) : kalemSecenekleri.length === 0 ? (
                      <div className="odeme-warning" style={{ marginBottom: 0 }}>
                        <div className="odeme-warning-title">Bu türde aktif paket/hizmet bulunamadı</div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 250, overflowY: "auto" }}>
                        {kalemSecenekleri.map((k) => (
                          <div
                            key={k.id}
                            onClick={() => setSeciliKalemId(k.id)}
                            className={`odeme-kalem-card ${seciliKalemId === k.id ? "selected" : ""}`}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span style={{ fontWeight: 600, fontSize: 13 }}>{k.ad}</span>
                              <span style={{ fontWeight: 700, color: "var(--primary)", fontSize: 13 }}>{formatCurrency(k.fiyat)}</span>
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                              KDV: %{k.kdv_orani} • KDV Dahil: {formatCurrency(k.kdv_dahil_fiyat)}
                              {k.kod && ` • Kod: ${k.kod}`}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  </>
                )}

                {/* İndirim */}
                {seciliKalemId && (() => {
                  const secenek = kalemSecenekleri.find(k => k.id === seciliKalemId);
                  if (!secenek) return null;
                  const kdvDahil = secenek.kdv_dahil_fiyat;
                  const ucretsizDeneme =
                    seciliKalemTuru === "deneme" &&
                    !!mevcutDeneme?.ucretsiz &&
                    mevcutDeneme.kalem_id !== seciliKalemId;

                  if (ucretsizDeneme) {
                    return (
                      <div className="odeme-form-group">
                        <div style={{ padding: "12px 14px", background: "#ecfdf5", borderRadius: 8, border: "1px solid #a7f3d0", fontSize: 13 }}>
                          <strong>Ücretsiz deneme korunacak:</strong> Yeni paket katalog fiyatı {formatCurrency(kdvDahil)} olsa da sözleşmeye <strong>₺0</strong> olarak eklenecek.
                        </div>
                      </div>
                    );
                  }

                  const handleOranChange = (val: string) => {
                    setKalemIndirimOrani(val);
                    setIndirimMode("oran");
                    const oran = parseFloat(val) || 0;
                    const net = kdvDahil * (1 - oran / 100);
                    setKalemNetFiyat(net > 0 ? net.toFixed(2) : "0");
                  };

                  const handleNetChange = (val: string) => {
                    setKalemNetFiyat(val);
                    setIndirimMode("net");
                    const net = parseFloat(val) || 0;
                    if (kdvDahil > 0) {
                      const oran = ((1 - net / kdvDahil) * 100);
                      setKalemIndirimOrani(oran >= 0 ? oran.toFixed(2) : "0");
                    }
                  };

                  return (
                    <div className="odeme-form-group">
                      <label className="odeme-form-label">İndirim Hesaplama</label>
                      <div className="odeme-mode-switch">
                        <button type="button" className={`odeme-mode-btn ${indirimMode === "oran" ? "active" : ""}`} onClick={() => setIndirimMode("oran")}>% Oran Gir</button>
                        <button type="button" className={`odeme-mode-btn ${indirimMode === "net" ? "active" : ""}`} onClick={() => setIndirimMode("net")}>Net Fiyat Gir</button>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div>
                          <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>İndirim Oranı (%)</label>
                          <input
                            className="odeme-form-control"
                            type="number" min="0" max="100" step="0.01"
                            value={kalemIndirimOrani}
                            onChange={(e) => handleOranChange(e.target.value)}
                            style={{ borderColor: indirimMode === "oran" ? "var(--primary)" : undefined, background: indirimMode === "oran" ? "#f0f7ff" : undefined }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Hedef Net Fiyat (₺)</label>
                          <input
                            className="odeme-form-control"
                            type="number" min="0" max={kdvDahil} step="0.01"
                            value={kalemNetFiyat}
                            onChange={(e) => handleNetChange(e.target.value)}
                            style={{ borderColor: indirimMode === "net" ? "var(--primary)" : undefined, background: indirimMode === "net" ? "#f0f7ff" : undefined }}
                          />
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
                        {indirimMode === "oran"
                          ? `KDV dahil ${formatCurrency(kdvDahil)} üzerinden %${kalemIndirimOrani} indirim`
                          : `KDV dahil ${formatCurrency(kdvDahil)} → Hedef: ${formatCurrency(parseFloat(kalemNetFiyat) || 0)} (%${kalemIndirimOrani} indirim)`
                        }
                      </div>
                    </div>
                  );
                })()}

                {/* Özet */}
                {seciliKalemId && (() => {
                  const secenek = kalemSecenekleri.find(k => k.id === seciliKalemId);
                  if (!secenek) return null;
                  const ind = parseFloat(kalemIndirimOrani) || 0;
                  const indTutar = indirimMode === "net"
                    ? Math.max(0, secenek.kdv_dahil_fiyat - (parseFloat(kalemNetFiyat) || 0))
                    : secenek.kdv_dahil_fiyat * ind / 100;
                  const net = secenek.kdv_dahil_fiyat - indTutar;
                  return (
                    <div className="odeme-preview">
                      <div className="odeme-preview-title">Kalem Özeti</div>
                      <div className="odeme-preview-grid" style={{ fontSize: 13 }}>
                        <span style={{ color: "var(--text-muted)" }}>Brüt:</span>
                        <span style={{ textAlign: "right", fontWeight: 600 }}>{formatCurrency(secenek.fiyat)}</span>
                        <span style={{ color: "var(--text-muted)" }}>KDV ({secenek.kdv_orani}%):</span>
                        <span style={{ textAlign: "right" }}>{formatCurrency(secenek.kdv_tutari)}</span>
                        <span style={{ color: "var(--text-muted)" }}>KDV Dahil:</span>
                        <span style={{ textAlign: "right" }}>{formatCurrency(secenek.kdv_dahil_fiyat)}</span>
                        {ind > 0 && <>
                          <span style={{ color: "#dc2626" }}>İndirim ({ind}%):</span>
                          <span style={{ textAlign: "right", color: "#dc2626" }}>-{formatCurrency(indTutar)}</span>
                        </>}
                        <span style={{ fontWeight: 700, borderTop: "1px solid var(--border-color)", paddingTop: 6 }}>Net Tutar:</span>
                        <span style={{ textAlign: "right", fontWeight: 700, color: "var(--primary)", borderTop: "1px solid var(--border-color)", paddingTop: 6 }}>{formatCurrency(net)}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
            <div className="odeme-drawer-footer">
              <button className="btn-modern btn-secondary" style={{ flex: 1 }} onClick={() => setShowKalemDrawer(false)}>İptal</button>
              <button
                className="btn-modern btn-primary"
                style={{ flex: 1 }}
                onClick={() => handleKalemEkle()}
                disabled={kalemSaving || !seciliKalemId}
              >{kalemSaving ? "Ekleniyor..." : "Kalem Ekle"}</button>
            </div>
          </div>
        </>
      )}

      {/* Kalem Çıkarma Modal */}
      {removeKalemId && (
        <>
          <div className="odeme-modal-overlay" onClick={() => setRemoveKalemId(null)} />
          <div className="odeme-modal odeme-modal-sm">
            <h3 style={{ color: "#dc2626" }}>⚠️ Kalem Çıkar</h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.6 }}>
              Bu kalemi sözleşmeden çıkarmak istediğinize emin misiniz? Sözleşme tutarı ve taksit planı otomatik güncellenecektir.
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <button className="btn-modern btn-secondary" style={{ flex: 1 }} onClick={() => setRemoveKalemId(null)}>Vazgeç</button>
              <button
                className="btn-modern"
                style={{ flex: 1, background: "#dc2626", color: "#fff" }}
                onClick={() => handleKalemCikar(removeKalemId)}
                disabled={removeSaving}
              >{removeSaving ? "Çıkarılıyor..." : "Çıkar"}</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SUB-TAB COMPONENTS
// ═══════════════════════════════════════════════════════════════

// ─── GENEL BİLGİLER ─────────────────────────────────────────

function GenelSubTab({ sozlesme: s }: { sozlesme: Sozlesme }) {
  const InfoRow = ({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) => (
    <div className="odeme-info-row">
      <span className="odeme-info-label">{label}</span>
      <span className={`odeme-info-value ${highlight ? "highlight" : ""}`}>{value}</span>
    </div>
  );

  return (
    <div className="odeme-info-grid">
      <div className="odeme-info-section">
        <h4>📋 Sözleşme Bilgileri</h4>
        <InfoRow label="Sözleşme No" value={s.sozlesme_no} highlight />
        <InfoRow label="Eğitim Türü" value={egitimTuruLabel[s.egitim_turu || ""] || s.egitim_turu || "-"} />
        <InfoRow label="Ödeme Türü" value={odemeTuruLabel[s.odeme_turu] || s.odeme_turu} />
        <InfoRow label="Taksit Periyodu" value={taksitPeriyoduLabel[s.taksit_periyodu || ""] || s.taksit_periyodu || "-"} />
        <InfoRow label="Taksit Sayısı" value={s.taksit_sayisi} />
        <InfoRow label="Başlangıç Tarihi" value={formatDate(s.baslangic_tarihi || null)} />
        <InfoRow label="Bitiş Tarihi" value={formatDate(s.bitis_tarihi || null)} />
        <InfoRow label="İlk Ödeme Tarihi" value={formatDate(s.ilk_odeme_tarihi || null)} />
        <InfoRow label="Oluşturma Tarihi" value={formatDate(s.olusturma_tarihi)} />
        {s.versiyon && s.versiyon > 1 && <InfoRow label="Versiyon" value={`v${s.versiyon} (${formatDate(s.revizyon_tarihi || null)})`} />}
      </div>

      <div className="odeme-info-section">
        <h4>💰 Mali Bilgiler</h4>
        <InfoRow label="Brüt Tutar" value={formatCurrency(s.brut_tutar)} />
        <InfoRow label="KDV Oranı" value={`%${s.kdv_orani}`} />
        <InfoRow label="KDV Tutarı" value={formatCurrency(s.kdv_tutari)} />
        <InfoRow label="KDV Dahil" value={formatCurrency(s.kdv_dahil_tutar)} />
        <InfoRow label="Toplam İndirim" value={<span style={{ color: s.toplam_indirim_tutari > 0 ? "#dc2626" : "inherit" }}>-{formatCurrency(s.toplam_indirim_tutari)}</span>} />
        <InfoRow label="Net Tutar" value={formatCurrency(s.net_tutar)} highlight />

        <div style={{ marginTop: 20 }}>
          <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>⚖️ Hukuki Bilgiler</h4>
          <InfoRow
            label="Muacceliyet Durumu"
            value={
              <span className={`badge-modern ${s.muacceliyet_durumu ? "danger" : "success"}`} style={{ fontSize: 11, padding: "2px 8px" }}>
                {s.muacceliyet_durumu ? "Aktif" : "Pasif"}
              </span>
            }
          />
          <InfoRow label="Cayma Süresi" value={`${s.cayma_suresi || 14} gün`} />
          {s.odeme_yontemi && <InfoRow label="Ödeme Yöntemi" value={s.odeme_yontemi.ad} />}
          {s.yetkili_personel && <InfoRow label="Yetkili Personel" value={s.yetkili_personel} />}
        </div>

        {s.notlar && (
          <div className="odeme-preview" style={{ marginTop: 16 }}>
            <div className="odeme-preview-title">📝 Notlar</div>
            <div style={{ fontSize: 13, color: "var(--text-color)", whiteSpace: "pre-wrap" }}>{s.notlar}</div>
          </div>
        )}
      </div>

      {/* İndirimler */}
      {s.indirimler && s.indirimler.length > 0 && (
        <div style={{ gridColumn: "1 / -1" }}>
          <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700 }}>🏷️ İndirimler</h4>
          <table className="table-modern">
            <thead>
              <tr>
                <th>İndirim Türü</th>
                <th style={{ textAlign: "right" }}>Oran (%)</th>
                <th style={{ textAlign: "right" }}>Tutar</th>
                <th style={{ textAlign: "center" }}>Onay</th>
                <th>Açıklama</th>
              </tr>
            </thead>
            <tbody>
              {s.indirimler.map((ind) => (
                <tr key={ind.id}>
                  <td>{ind.indirim_turu?.ad || "-"}</td>
                  <td style={{ textAlign: "right" }}>%{ind.oran}</td>
                  <td style={{ textAlign: "right", fontWeight: 600, color: "#dc2626" }}>-{formatCurrency(ind.tutar)}</td>
                  <td style={{ textAlign: "center" }}>
                    <span className={`badge-modern ${ind.onay_durumu === "onaylandi" ? "success" : ind.onay_durumu === "reddedildi" ? "danger" : "warning"}`}>
                      {ind.onay_durumu === "onaylandi" ? "Onaylandı" : ind.onay_durumu === "reddedildi" ? "Reddedildi" : "Beklemede"}
                    </span>
                  </td>
                  <td>{ind.aciklama || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── KALEMLER SUB-TAB ───────────────────────────────────────

function KalemlerSubTab({ sozlesme: s, onAddClick, onRemoveClick }: { sozlesme: Sozlesme; onAddClick: () => void; onRemoveClick: (id: number) => void }) {
  const canEdit = s.durum === "taslak" || s.durum === "aktif";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>📦 Sözleşme Kalemleri</h4>
        {canEdit && (
          <button className="btn-modern btn-primary" onClick={onAddClick}>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Kalem Ekle
          </button>
        )}
      </div>

      {!s.kalemler || s.kalemler.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📦</div>
          <h4>Henüz kalem eklenmemiş</h4>
          <p>Sözleşmeye kalem eklemek için yukarıdaki butonu kullanın</p>
        </div>
      ) : (
        <table className="table-modern">
          <thead>
            <tr>
              <th>Kalem Adı</th>
              <th>Tür</th>
              <th style={{ textAlign: "right" }}>Brüt</th>
              <th style={{ textAlign: "right" }}>KDV</th>
              <th style={{ textAlign: "right" }}>İndirim</th>
              <th style={{ textAlign: "right" }}>Net</th>
              {canEdit && <th style={{ textAlign: "center", width: 60 }}>İşlem</th>}
            </tr>
          </thead>
          <tbody>
            {s.kalemler.map((k) => (
              <tr key={k.id}>
                <td style={{ fontWeight: 600 }}>{k.kalem_adi}</td>
                <td><span className="badge-modern primary">{kalemTuruLabel[k.kalem_turu] || k.kalem_turu}</span></td>
                <td style={{ textAlign: "right" }}>{formatCurrency(k.brut_tutar)}</td>
                <td style={{ textAlign: "right", color: "var(--text-muted)" }}>
                  {formatCurrency(k.kdv_tutari)} <span style={{ fontSize: 10 }}>(%{k.kdv_orani})</span>
                </td>
                <td style={{ textAlign: "right", color: k.indirim_tutari > 0 ? "#dc2626" : "var(--text-muted)" }}>
                  {k.indirim_tutari > 0 ? `-${formatCurrency(k.indirim_tutari)} (%${k.indirim_orani})` : "-"}
                </td>
                <td style={{ textAlign: "right", fontWeight: 700 }}>{formatCurrency(k.net_tutar)}</td>
                {canEdit && (
                  <td style={{ textAlign: "center" }}>
                    <div className="row-actions" style={{ opacity: 1 }}>
                      <button className="row-action-btn danger" title="Kalemi çıkar" onClick={() => onRemoveClick(k.id)}>
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: "linear-gradient(135deg, #f8f9fb 0%, #f1f4f9 100%)" }}>
              <td colSpan={canEdit ? 5 : 5} style={{ textAlign: "right", fontWeight: 700, padding: "14px 20px" }}>Toplam Net:</td>
              <td style={{ textAlign: "right", fontWeight: 700, color: "var(--primary)", fontSize: 15, padding: "14px 20px" }}>
                {formatCurrency(s.kalemler.reduce((t, k) => t + k.net_tutar, 0))}
              </td>
              {canEdit && <td style={{ padding: "14px 20px" }}></td>}
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}

// ─── ÖDEME PLANI SUB-TAB ────────────────────────────────────

function OdemePlaniSubTab({
  sozlesme: s, odemeYontemleri, onTahsilatStart, onOdemePlani, onRefresh, onWhatsAppPlan,
}: {
  sozlesme: Sozlesme; odemeYontemleri: OdemeYontemi[];
  onTahsilatStart: (form: TahsilatFormData) => void;
  onOdemePlani: (id: number) => void;
  onRefresh: () => void;
  onWhatsAppPlan: () => void;
}) {
  const [showCreator, setShowCreator] = useState(false);
  const [taksitSayisi, setTaksitSayisi] = useState(String(s.taksit_sayisi || 1));
  const [ilkOdeme, setIlkOdeme] = useState(s.ilk_odeme_tarihi || "");
  const [periyot, setPeriyot] = useState(s.taksit_periyodu || "aylik");
  const [pesinat, setPesinat] = useState("");
  const [taksitPlanDirty, setTaksitPlanDirty] = useState(false);
  const [manuelRows, setManuelRows] = useState<ManuelTaksitRow[]>([{ tutar: "", vade_tarihi: "" }]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [editingTaksitId, setEditingTaksitId] = useState<number | null>(null);
  const [editTutar, setEditTutar] = useState("");
  const [editVade, setEditVade] = useState("");

  const canEdit = s.durum === "taslak" || s.durum === "aktif";
  const isAktif = s.durum === "aktif";
  const isCekSenetSozlesme = s.odeme_turu === "cek_senet";

  const taksitler = s.taksitler || [];
  const odenmisTaksitler = taksitler.filter(t => t.durum === "odendi" || t.durum === "kismi_odendi");
  const toplamOdenmis = odenmisTaksitler.reduce((sum, t) => sum + t.odenen_tutar, 0);
  const pesinatTutar = parseFloat(pesinat) || 0;
  const kalanTutar = s.net_tutar - (isAktif ? toplamOdenmis : pesinatTutar);
  const hedefTutar = isAktif && odenmisTaksitler.length > 0 ? kalanTutar : s.net_tutar;
  const korunanOdeme = isAktif && odenmisTaksitler.length > 0;
  const taksitSayisiInt = parseInt(taksitSayisi, 10) || 1;
  const effectivePesinat = korunanOdeme ? 0 : pesinatTutar;

  const defaultCekYontemId = useMemo(() => {
    if (!isCekSenetSozlesme) return "" as number | "";
    const cekYontemleri = odemeYontemleri.filter(isCekSenetYontemTip);
    return cekYontemleri.length === 1 ? cekYontemleri[0].id : "";
  }, [isCekSenetSozlesme, odemeYontemleri]);

  const taksitPlanOptions = useMemo(
    () => ({
      preserveFrom: manuelRows,
      defaultOdemeYontemiId: defaultCekYontemId,
    }),
    [manuelRows, defaultCekYontemId],
  );

  const rebuildEqualPlan = useCallback(
    (count: number) => {
      if (hedefTutar <= 0 || !ilkOdeme) return;
      const safeCount = clampTaksitSayisi(count);
      setManuelRows(
        buildEqualTaksitRows(hedefTutar, effectivePesinat, safeCount, ilkOdeme, periyot, taksitPlanOptions),
      );
    },
    [hedefTutar, effectivePesinat, ilkOdeme, periyot, taksitPlanOptions],
  );

  const applyTaksitSayisi = useCallback(
    (raw: number) => {
      const safeCount = clampTaksitSayisi(raw);
      setTaksitSayisi(String(safeCount));
      setTaksitPlanDirty(false);
      rebuildEqualPlan(safeCount);
    },
    [rebuildEqualPlan],
  );

  useEffect(() => {
    if (taksitPlanDirty || hedefTutar <= 0 || !ilkOdeme) return;
    rebuildEqualPlan(taksitSayisiInt);
  }, [hedefTutar, effectivePesinat, taksitSayisiInt, ilkOdeme, periyot, taksitPlanDirty, rebuildEqualPlan]);

  const handleManuelDateChange = (index: number, value: string) => {
    setTaksitPlanDirty(true);
    const rows = [...manuelRows];
    rows[index].vade_tarihi = value;
    for (let i = index + 1; i < rows.length; i++) {
      rows[i].vade_tarihi = addMonths(value, i - index);
    }
    setManuelRows(rows);
  };

  const handleManuelTutarChange = (index: number, value: string) => {
    setTaksitPlanDirty(true);
    const rows = [...manuelRows];
    rows[index].tutar = value;
    let ustToplam = 0;
    for (let i = 0; i <= index; i++) ustToplam += parseFloat(rows[i].tutar) || 0;
    const altSatirSayisi = rows.length - index - 1;
    if (altSatirSayisi > 0) {
      const kalanBakiye = hedefTutar - ustToplam;
      const herBirine = Math.max(0, kalanBakiye / altSatirSayisi);
      const yuvarlanmis = Math.floor(herBirine);
      for (let i = index + 1; i < rows.length; i++) {
        rows[i].tutar = i === rows.length - 1
          ? String(Math.round(hedefTutar - ustToplam - yuvarlanmis * (altSatirSayisi - 1)))
          : String(yuvarlanmis);
      }
    }
    setManuelRows(rows);
  };

  const manuelToplam = manuelRows.reduce((sum, r) => sum + (parseFloat(r.tutar) || 0), 0);
  const validRows = manuelRows.filter(r => r.tutar && r.vade_tarihi);
  const isEqualPlan = rowsMatchEqualPlan(validRows, hedefTutar, effectivePesinat, taksitSayisiInt, ilkOdeme, periyot);

  const handleSave = async () => {
    setSaveError("");
    if (!ilkOdeme) {
      setSaveError("İlk vade tarihi zorunludur.");
      return;
    }
    if (validRows.length === 0) {
      setSaveError("En az bir taksit için tutar ve vade tarihi girin.");
      return;
    }
    if (Math.abs(manuelToplam - hedefTutar) >= 1) {
      setSaveError(`Plan toplamı (${formatCurrency(manuelToplam)}) hedef tutarla (${formatCurrency(hedefTutar)}) uyuşmuyor.`);
      return;
    }
    if (korunanOdeme && taksitPlanDirty) {
      setSaveError("Ödenmiş taksitler varken satır düzenlemesi yapılamaz. Parametreleri değiştirip «Eşit Böl» kullanın.");
      return;
    }

    let yontem: string;
    if (korunanOdeme) {
      yontem = "kalani_bol";
    } else if (isEqualPlan) {
      yontem = "esit";
    } else {
      yontem = "manuel";
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        yontem,
        taksit_sayisi: taksitSayisiInt,
        ilk_odeme_tarihi: ilkOdeme,
        periyot,
      };
      if (yontem === "esit") {
        body.pesinat = effectivePesinat;
      } else if (yontem === "manuel") {
        body.taksitler = validRows.map(r => ({
          tutar: parseFloat(r.tutar),
          vade_tarihi: r.vade_tarihi,
          ...(isCekSenetSozlesme && r.odeme_yontemi_id ? { odeme_yontemi_id: Number(r.odeme_yontemi_id) } : {}),
        }));
      }

      if (isCekSenetSozlesme) {
        const oyPlan = buildTaksitOdemeYontemleri(validRows);
        if (oyPlan.length) {
          body.taksit_odeme_yontemleri = oyPlan;
        }
      }

      const res = await fetch(`${API_BASE}/sozlesmeler/${s.id}/taksit-plani/`, {
        method: "POST",
        headers: postHeaders(),
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setShowCreator(false);
        setSaveError("");
        setTaksitPlanDirty(false);
        onRefresh();
      } else {
        const err = await res.json().catch(() => null);
        setSaveError(extractApiError(err, res, "Taksit planı oluşturulamadı"));
      }
    } catch {
      setSaveError("Bağlantı hatası. Lütfen tekrar deneyin.");
    }
    setSaving(false);
  };

  const handleTaksitEdit = async (taksitId: number) => {
    try {
      const res = await fetch(`${API_BASE}/taksitler/${taksitId}/update/`, {
        method: "PUT",
        headers: postHeaders(),
        credentials: "include",
        body: JSON.stringify({
          tutar: parseFloat(editTutar),
          vade_tarihi: editVade,
        }),
      });
      if (res.ok) {
        setEditingTaksitId(null);
        onRefresh();
      } else {
        const err = await res.json();
        alert(err.error || "Taksit güncellenemedi");
      }
    } catch { alert("Bağlantı hatası"); }
  };

  const yontemLabel = (id?: number | null) => {
    if (!id) return "—";
    const y = odemeYontemleri.find(o => o.id === id);
    return y ? y.ad : `#${id}`;
  };
  const isCekSenetYontem = (id?: number | null) => {
    if (!id) return false;
    const y = odemeYontemleri.find(o => o.id === id);
    return isCekSenetYontemTip(y);
  };
  const cekSenetYontemVar = odemeYontemleri.some((oy) => isCekSenetYontemTip(oy));

  const planSaveDisabled = saving || !ilkOdeme || validRows.length === 0 || Math.abs(manuelToplam - hedefTutar) >= 1;

  return (
    <div>
      {/* Finans Özeti */}
      <div className="odeme-stats" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
        {[
          { label: "Brüt Tutar", value: formatCurrency(s.brut_tutar), color: "var(--text-color)" },
          { label: "Toplam İndirim", value: `-${formatCurrency(s.toplam_indirim_tutari)}`, color: "#dc2626" },
          { label: "Net Sözleşme", value: formatCurrency(s.net_tutar), color: "var(--primary)" },
          { label: "Toplam Ödenen", value: formatCurrency(toplamOdenmis), color: "#059669" },
          { label: "Kalan Tutar", value: formatCurrency(s.net_tutar - toplamOdenmis), color: (s.net_tutar - toplamOdenmis) > 0 ? "#d97706" : "#059669" },
        ].map((c, i) => (
          <div key={i} className="odeme-stat">
            <div className="odeme-stat-label">{c.label}</div>
            <div className="odeme-stat-value" style={{ color: c.color, fontSize: 16 }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>📅 Taksit Planı</h4>
        <div style={{ display: "flex", gap: 8 }}>
          {canEdit && (
            <button
              className={`btn-modern ${showCreator ? "" : "btn-primary"}`}
              style={showCreator ? { background: "#dc2626", color: "#fff" } : {}}
              onClick={() => setShowCreator(!showCreator)}
            >
              {showCreator ? "✕ Kapat" : "🔧 Taksit Planı Oluştur"}
            </button>
          )}
          <button className="btn-modern btn-secondary" onClick={() => onOdemePlani(s.id)}>🖨️ Yazdır</button>
          <button
            type="button"
            className="btn-modern"
            style={{ background: "#25D366", color: "#fff" }}
            onClick={(e) => { e.stopPropagation(); onWhatsAppPlan(); }}
          >
            WhatsApp
          </button>
        </div>
      </div>

      {/* Taksit Planı Oluşturucu */}
      {showCreator && (
        <div className="odeme-creator" style={{ borderRadius: 12, border: "1px solid #e5e7eb", padding: 20, marginBottom: 20, background: "#fff" }}>
          {korunanOdeme && (
            <div className="odeme-warning" style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: "#fffbeb", border: "1px solid #fde68a" }}>
              <div className="odeme-warning-title" style={{ fontWeight: 700, color: "#92400e" }}>
                🔒 {odenmisTaksitler.length} taksit ödenmiş ({formatCurrency(toplamOdenmis)}) — korunacak
              </div>
              <div className="odeme-warning-text" style={{ fontSize: 13, color: "#78350f", marginTop: 4 }}>
                Kalan bakiye {formatCurrency(kalanTutar)} yeni plana eşit bölünecek. Satır düzenlemesi devre dışı.
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
            {[
              { label: korunanOdeme ? "Kalan Tutar" : "Net Sözleşme", value: formatCurrency(hedefTutar), color: "var(--primary)" },
              { label: "Peşinat", value: !korunanOdeme && pesinatTutar > 0 ? formatCurrency(pesinatTutar) : "-", color: "#059669" },
              { label: "Taksitlenecek", value: formatCurrency(Math.max(0, hedefTutar - effectivePesinat)), color: "#d97706" },
            ].map((c, i) => (
              <div key={i} style={{ padding: "12px 14px", borderRadius: 8, background: "#f9fafb", border: "1px solid #e5e7eb" }}>
                <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>{c.label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: c.color }}>{c.value}</div>
              </div>
            ))}
          </div>

          {!korunanOdeme && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16, padding: 14, borderRadius: 10, background: "#f9fafb", border: "1px solid #e5e7eb" }}>
              <div className="odeme-form-group">
                <label className="odeme-form-label">Peşinat (₺) <span style={{ color: "#9ca3af", fontWeight: 400 }}>opsiyonel</span></label>
                <input className="odeme-form-control" type="number" min="0" step="1000" value={pesinat}
                  onChange={e => { setPesinat(e.target.value); setTaksitPlanDirty(false); }} placeholder="0" />
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
            <div className="odeme-form-group">
              <label className="odeme-form-label">Taksit Sayısı {effectivePesinat > 0 && !korunanOdeme && <span style={{ color: "#9ca3af" }}>(peşinat dahil)</span>}</label>
              <input className="odeme-form-control" type="number" min="1" max="48" value={taksitSayisi}
                onChange={e => applyTaksitSayisi(parseInt(e.target.value, 10) || 1)} />
            </div>
            <div className="odeme-form-group">
              <label className="odeme-form-label">İlk Vade</label>
              <input className="odeme-form-control" type="date" value={ilkOdeme}
                onChange={e => { setIlkOdeme(e.target.value); setTaksitPlanDirty(false); }} />
            </div>
            <div className="odeme-form-group">
              <label className="odeme-form-label">Periyot</label>
              <select className="odeme-form-control" value={periyot}
                onChange={e => { setPeriyot(e.target.value); setTaksitPlanDirty(false); }}>
                {Object.entries(taksitPeriyoduLabel).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div className="odeme-form-group" style={{ display: "flex", alignItems: "flex-end" }}>
              <button type="button" className="btn-modern btn-secondary" style={{ width: "100%" }}
                onClick={() => applyTaksitSayisi(taksitSayisiInt)}>
                ↻ Eşit Böl
              </button>
            </div>
          </div>

          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
            Taksit sayısı girildiğinde plan otomatik oluşur. Satırları düzenlerseniz manuel plan olarak kaydedilir.
            {isCekSenetSozlesme && !cekSenetYontemVar && (
              <span style={{ display: "block", marginTop: 6, color: "#b45309" }}>
                Çek/senet seçmek için önce Finans → Tanımlar → Ödeme Yöntemleri&apos;nden tipi Çek veya Senet olan bir yöntem tanımlayın (mali hesap gerekmez).
              </span>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 16, borderRadius: 12, background: "#fafafa", border: "1px solid #e5e7eb" }}>
            <div style={{ display: "grid", gridTemplateColumns: isCekSenetSozlesme ? "40px 1fr 1fr 1fr 40px" : "40px 1fr 1fr 40px", gap: 8, fontSize: 11, fontWeight: 600, color: "#6b7280" }}>
              <span>#</span><span>Tutar (₺)</span><span>Vade Tarihi</span>
              {isCekSenetSozlesme && <span>Ödeme Yöntemi</span>}
              <span></span>
            </div>
            {manuelRows.map((row, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: isCekSenetSozlesme ? "40px 1fr 1fr 1fr 40px" : "40px 1fr 1fr 40px", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>{i + 1}</span>
                <input className="odeme-form-control" type="number" min="0" step="1" value={row.tutar}
                  disabled={korunanOdeme}
                  onChange={e => handleManuelTutarChange(i, e.target.value)} placeholder="Tutar" />
                <input className="odeme-form-control" type="date" value={row.vade_tarihi}
                  disabled={korunanOdeme}
                  onChange={e => handleManuelDateChange(i, e.target.value)} />
                {isCekSenetSozlesme && (
                  <select
                    className="odeme-form-control"
                    value={row.odeme_yontemi_id ?? ""}
                    disabled={korunanOdeme}
                    onChange={(e) => {
                      const rows = [...manuelRows];
                      rows[i].odeme_yontemi_id = e.target.value ? Number(e.target.value) : "";
                      setManuelRows(rows);
                      setTaksitPlanDirty(true);
                    }}
                  >
                    <option value="">Seçiniz...</option>
                    {odemeYontemleri.map((oy) => (
                      <option key={oy.id} value={oy.id}>
                        {oy.ad}{isCekSenetYontemTip(oy) ? " (çek/senet)" : ""}
                      </option>
                    ))}
                  </select>
                )}
                {!korunanOdeme && (
                  <button type="button" onClick={() => {
                    if (manuelRows.length <= 1) return;
                    applyTaksitSayisi(taksitSayisiInt - 1);
                  }}
                    disabled={manuelRows.length <= 1}
                    style={{ border: "none", background: "none", cursor: "pointer", color: "#dc2626", fontSize: 16, opacity: manuelRows.length <= 1 ? 0.3 : 1 }}>✕</button>
                )}
              </div>
            ))}
            {!korunanOdeme && (
              <button type="button" onClick={() => applyTaksitSayisi(taksitSayisiInt + 1)}
                className="btn-modern btn-secondary" style={{ justifyContent: "center", border: "1px dashed var(--border-color)" }}>
                + Taksit Ekle
              </button>
            )}
            <div className="odeme-preview" style={{ background: Math.abs(manuelToplam - hedefTutar) < 1 ? "#ecfdf5" : "#fef2f2", borderColor: Math.abs(manuelToplam - hedefTutar) < 1 ? "#bbf7d0" : "#fecaca" }}>
              <div className="odeme-preview-grid">
                <span>Plan Toplamı:</span><span style={{ fontWeight: 700, textAlign: "right" }}>{formatCurrency(manuelToplam)}</span>
                <span>Hedef:</span><span style={{ fontWeight: 700, textAlign: "right" }}>{formatCurrency(hedefTutar)}</span>
              </div>
              {Math.abs(manuelToplam - hedefTutar) >= 1 && (
                <div style={{ fontSize: 11, color: "#dc2626", marginTop: 4 }}>⚠️ Fark: {formatCurrency(Math.abs(manuelToplam - hedefTutar))}</div>
              )}
            </div>
          </div>

          {/* Kaydet */}
          {saveError && (
            <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", fontSize: 13 }}>
              {saveError}
            </div>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
            <button className="btn-modern btn-secondary" onClick={() => { setShowCreator(false); setSaveError(""); }}>Vazgeç</button>
            <button
              className="btn-modern btn-primary"
              onClick={handleSave}
              disabled={planSaveDisabled}
            >{saving ? "Oluşturuluyor..." : "✅ Planı Oluştur"}</button>
          </div>
        </div>
      )}

      {/* Taksit Tablosu */}
      {!taksitler || taksitler.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📅</div>
          <h4>Taksit planı oluşturulmamış</h4>
          <p>{canEdit ? "Yukarıdaki \"Taksit Planı Oluştur\" butonunu kullanın" : ""}</p>
        </div>
      ) : (
        <table className="table-modern">
          <thead>
            <tr>
              <th style={{ width: 50 }}>#</th>
              <th>Vade Tarihi</th>
              <th style={{ textAlign: "right" }}>Tutar</th>
              <th style={{ textAlign: "right" }}>Ödenen</th>
              <th style={{ textAlign: "right" }}>Kalan</th>
              {isCekSenetSozlesme && <th>Ödeme Yöntemi</th>}
              <th style={{ textAlign: "center" }}>Durum</th>
              <th style={{ textAlign: "center", width: 140 }}>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {taksitler.map((t) => {
              const gecikmisMi = t.durum === "beklemede" && t.vade_tarihi && new Date(t.vade_tarihi) < new Date();
              const editable = canEdit && (t.durum === "beklemede" || t.durum === "gecikti");
              const isEditing = editingTaksitId === t.id;

              return (
                <tr key={t.id} className={gecikmisMi ? "odeme-taksit-gecikmi" : t.durum === "odendi" ? "odeme-taksit-odendi" : ""}>
                  <td style={{ fontWeight: 700, color: "var(--text-muted)" }}>{t.taksit_no}</td>
                  <td>
                    {isEditing ? (
                      <input className="odeme-form-control" type="date" value={editVade} onChange={e => setEditVade(e.target.value)} style={{ width: 140, padding: "4px 8px" }} />
                    ) : (
                      <>
                        {formatDate(t.vade_tarihi)}
                        {gecikmisMi && <span className="badge-modern danger" style={{ marginLeft: 6, fontSize: 10, padding: "2px 6px" }}>GECİKMİŞ</span>}
                      </>
                    )}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {isEditing ? (
                      <input className="odeme-form-control" type="number" step="0.01" value={editTutar} onChange={e => setEditTutar(e.target.value)} style={{ width: 100, padding: "4px 8px", textAlign: "right" }} />
                    ) : (
                      <span style={{ fontWeight: 600 }}>{formatCurrency(t.tutar)}</span>
                    )}
                  </td>
                  <td style={{ textAlign: "right", color: "#059669" }}>{formatCurrency(t.odenen_tutar)}</td>
                  <td style={{ textAlign: "right", fontWeight: 600, color: t.kalan_tutar > 0 ? "#dc2626" : "#059669" }}>{formatCurrency(t.kalan_tutar)}</td>
                  {isCekSenetSozlesme && (
                    <td>
                      {yontemLabel(t.odeme_yontemi_id)}
                      {isCekSenetYontem(t.odeme_yontemi_id) && (
                        <div style={{ fontSize: 10, color: "#64748b" }}>Portföy kaydı plan kaydında oluşur</div>
                      )}
                    </td>
                  )}
                  <td style={{ textAlign: "center" }}>
                    <DurumBadgeModern durum={gecikmisMi ? "gecikti" : t.durum} map={taksitDurumLabel} />
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                      {isEditing ? (
                        <>
                          <button className="btn-modern btn-success" style={{ padding: "3px 10px", fontSize: 11 }} onClick={() => handleTaksitEdit(t.id)}>✓</button>
                          <button className="btn-modern btn-secondary" style={{ padding: "3px 10px", fontSize: 11 }} onClick={() => setEditingTaksitId(null)}>✕</button>
                        </>
                      ) : (
                        <>
                          {editable && (
                            <button
                              className="row-action-btn"
                              onClick={() => { setEditingTaksitId(t.id); setEditTutar(String(t.tutar)); setEditVade(t.vade_tarihi || ""); }}
                              title="Düzenle"
                            >
                              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          )}
                          {t.kalan_tutar > 0 && s.durum === "aktif" && !isCekSenetYontem(t.odeme_yontemi_id) && (
                            <button
                              className="btn-modern btn-success"
                              style={{ padding: "3px 10px", fontSize: 11 }}
                              onClick={() => onTahsilatStart({
                                sozlesme_id: String(s.id),
                                taksit_id: String(t.id),
                                odeme_yontemi_id: "",
                                tutar: String(t.kalan_tutar),
                                tahsilat_tarihi: new Date().toISOString().slice(0, 10),
                                referans_no: "",
                                aciklama: "",
                              })}
                            >💰 Tahsil</button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: "linear-gradient(135deg, #f8f9fb 0%, #f1f4f9 100%)" }}>
              <td colSpan={3} style={{ textAlign: "right", fontWeight: 700, padding: "14px 20px" }}>Toplam:</td>
              <td style={{ textAlign: "right", fontWeight: 700, padding: "14px 20px" }}>{formatCurrency(taksitler.reduce((s, t) => s + t.tutar, 0))}</td>
              <td style={{ textAlign: "right", fontWeight: 700, color: "#059669", padding: "14px 20px" }}>{formatCurrency(taksitler.reduce((s, t) => s + t.odenen_tutar, 0))}</td>
              <td style={{ textAlign: "right", fontWeight: 700, color: "#dc2626", padding: "14px 20px" }}>{formatCurrency(taksitler.reduce((s, t) => s + t.kalan_tutar, 0))}</td>
              <td colSpan={2} style={{ padding: "14px 20px" }}></td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}

// ─── TAHSİLATLAR SUB-TAB ───────────────────────────────────

function TahsilatlarSubTab({
  sozlesme: s, onTahsilatCancel, onMakbuz, onWhatsAppMakbuz,
}: {
  sozlesme: Sozlesme;
  onTahsilatCancel: (id: number) => void;
  onMakbuz: (id: number) => void;
  onWhatsAppMakbuz: (tahsilatId: number) => void;
}) {
  return (
    <div>
      <h4 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700 }}>💰 Tahsilat Geçmişi</h4>

      {!s.tahsilatlar || s.tahsilatlar.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">💰</div>
          <h4>Henüz tahsilat kaydı yok</h4>
          <p>Taksit planından tahsilat kaydı oluşturabilirsiniz</p>
        </div>
      ) : (
        <table className="table-modern">
          <thead>
            <tr>
              <th>Tarih</th>
              <th style={{ textAlign: "center" }}>Taksit</th>
              <th style={{ textAlign: "right" }}>Tutar</th>
              <th>Tür</th>
              <th>Ödeme Yöntemi</th>
              <th>Referans</th>
              <th style={{ textAlign: "center" }}>Durum</th>
              <th style={{ textAlign: "center" }}>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {s.tahsilatlar.map((th) => (
              <tr key={th.id} style={{ opacity: th.durum === "iptal_edildi" ? 0.5 : 1 }}>
                <td>{formatDate(th.tahsilat_tarihi)}</td>
                <td style={{ textAlign: "center", fontWeight: 600 }}>
                  {th.dagitim && th.dagitim.length > 1
                    ? th.dagitim.map((d: any) => `#${d.taksit_no}`).join(", ")
                    : th.dagitim && th.dagitim.length === 1
                      ? `#${th.dagitim[0].taksit_no}`
                      : th.taksit_no ? `#${th.taksit_no}` : "-"
                  }
                </td>
                <td style={{ textAlign: "right", fontWeight: 700 }}>{formatCurrency(th.tutar)}</td>
                <td><span className="badge-modern primary" style={{ fontSize: 11 }}>{tahsilatTuruLabel[th.tahsilat_turu] || th.tahsilat_turu}</span></td>
                <td>{th.odeme_yontemi?.ad || "-"}</td>
                <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{th.referans_no || "-"}</td>
                <td style={{ textAlign: "center" }}>
                  <DurumBadgeModern durum={th.durum} map={tahsilatDurumLabel} />
                </td>
                <td style={{ textAlign: "center" }}>
                  <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                    <button className="row-action-btn" onClick={() => onMakbuz(th.id)} title="Makbuz">
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </button>
                    {th.durum === "aktif" && (
                      <button
                        className="row-action-btn"
                        onClick={() => onWhatsAppMakbuz(th.id)}
                        title="WhatsApp"
                        style={{ color: "#25D366" }}
                      >
                        <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                          <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.75.75 0 00.917.917l4.458-1.495A11.95 11.95 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.714 9.714 0 01-4.95-1.35l-.355-.21-3.131 1.05 1.05-3.131-.21-.355A9.714 9.714 0 012.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z" />
                        </svg>
                      </button>
                    )}
                    {th.durum === "aktif" && (
                      <button className="row-action-btn danger" onClick={() => onTahsilatCancel(th.id)} title="İptal Et">
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── BELGELER SUB-TAB ───────────────────────────────────────

function BelgelerSubTab({
  sozlesme: s, onSozlesmeBelgesi, onOdemePlani, onFesihBelgesi, onMakbuz,
  onWhatsAppPlan, onWhatsAppSozlesme, onWhatsAppMakbuz,
}: {
  sozlesme: Sozlesme;
  onSozlesmeBelgesi: (id: number) => void;
  onOdemePlani: (id: number) => void;
  onFesihBelgesi: (id: number) => void;
  onMakbuz: (tahsilatId: number) => void;
  onWhatsAppPlan: () => void;
  onWhatsAppSozlesme: () => void;
  onWhatsAppMakbuz: (tahsilatId: number) => void;
}) {
  const aktifTahsilatlar = (s.tahsilatlar || [])
    .filter((t: any) => t.durum === 'aktif')
    .sort((a: any, b: any) => {
      const da = a.tahsilat_tarihi || ''; const db = b.tahsilat_tarihi || '';
      return db.localeCompare(da);
    });

  const belgeler = [
    { icon: "📄", label: "Sözleşme Belgesi", desc: "Detaylı sözleşme metni ve imza alanları", action: () => onSozlesmeBelgesi(s.id), whatsapp: onWhatsAppSozlesme, always: true },
    { icon: "📅", label: "Ödeme Planı", desc: "Taksit tablosu ve ödeme takvimi", action: () => onOdemePlani(s.id), whatsapp: onWhatsAppPlan, always: true },
    { icon: "📋", label: "Fesih Belgesi", desc: "Fesih detayları ve iade hesabı", action: () => onFesihBelgesi(s.id), always: s.durum === "feshedilmis" },
  ];

  return (
    <div>
      <h4 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700 }}>📄 Belgeler</h4>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
        {belgeler.filter(b => b.always).map((b, i) => (
          <div key={i} className="odeme-belge-card">
            <div onClick={b.action} style={{ cursor: "pointer" }}>
              <div className="odeme-belge-icon">{b.icon}</div>
              <div className="odeme-belge-label">{b.label}</div>
              <div className="odeme-belge-desc">{b.desc}</div>
            </div>
            {b.whatsapp && (
              <button
                type="button"
                className="btn-modern"
                style={{ marginTop: 10, width: "100%", background: "#25D366", color: "#fff", justifyContent: "center" }}
                onClick={(e) => { e.stopPropagation(); b.whatsapp?.(); }}
              >
                WhatsApp
              </button>
            )}
          </div>
        ))}
      </div>

      <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700 }}>🧾 Tahsilat Makbuzları</h4>
      {aktifTahsilatlar.length === 0 ? (
        <div className="empty-state" style={{ padding: 32 }}>
          <div className="empty-state-icon" style={{ width: 60, height: 60, fontSize: 24 }}>🧾</div>
          <h4 style={{ fontSize: 15 }}>Henüz aktif tahsilat kaydı yok</h4>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {aktifTahsilatlar.map((th: any) => (
            <div key={th.id} className="odeme-makbuz-item">
              <div onClick={() => onMakbuz(th.id)} style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, cursor: "pointer" }}>
                <div className="cell-icon blue" style={{ width: 36, height: 36, fontSize: 18, borderRadius: 8 }}>🧾</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    MKB-{String(th.id).padStart(6, '0')}
                    {th.dagitim && th.dagitim.length > 0
                      ? <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> • Taksit {th.dagitim.map((d: any) => `#${d.taksit_no}`).join(", ")}</span>
                      : th.taksit_no && <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> • Taksit #{th.taksit_no}</span>
                    }
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {th.tahsilat_tarihi ? new Date(th.tahsilat_tarihi).toLocaleDateString("tr-TR") : "-"}
                    {th.odeme_yontemi?.ad && ` • ${th.odeme_yontemi.ad}`}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#059669" }}>{formatCurrency(th.tutar)}</div>
                <button
                  type="button"
                  className="btn-modern"
                  style={{ background: "#25D366", color: "#fff", padding: "4px 10px", fontSize: 12 }}
                  onClick={(e) => { e.stopPropagation(); onWhatsAppMakbuz(th.id); }}
                >
                  WhatsApp
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
