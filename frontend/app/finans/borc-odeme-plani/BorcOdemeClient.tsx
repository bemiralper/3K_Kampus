"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useKurum } from "@/lib/contexts/KurumContext";
import { useAuth } from "@/lib/contexts/AuthContext";
import { useFinansPath } from "@/components/finans/FinansPathProvider";
import FinansRowsExportMenu from "@/components/finans/FinansRowsExportMenu";
import {
  buildGecikenExportRows,
  buildSonOdemeExportRows,
  buildYaklasanExportRows,
  GECIKEN_EXPORT_COLUMNS,
  SON_ODEME_EXPORT_COLUMNS,
  YAKLASAN_EXPORT_COLUMNS,
} from "./borc-odeme-export";
import { giderKaydiService, giderOdemeService } from "../services/gider-kaydi-api";
import { FinansHttpError } from "../services/finans-http";
import { financialAccountService } from "../services/finans-api";
import { useOdemeYontemleriForMaliHesap } from "../hooks/useOdemeYontemleriForMaliHesap";
import IslemMasrafiFields from "@/components/finans/IslemMasrafiFields";
import { EMPTY_ISLEM_MASRAFI, buildIslemMasrafiPayload } from "../types/islem-masrafi-types";
import { islemMasrafiGoster } from "../utils/islem-masrafi-eligibility";
import {
  GiderTaksit, GiderOdeme, GiderOdemeCreatePayload, GiderOzet,
} from "../types/gider-types";
import FinansCariHesapCell from "@/components/finans/FinansCariHesapCell";
import "@/components/finans/finans-list.css";

interface BorcOdemeClientProps {
  embedded?: boolean;
}

/* ═══ Style atoms (Ödeme Drawer için) ═══ */
const inputCls = "w-full px-3.5 py-2.5 bg-gray-50/80 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 outline-none transition-all duration-200 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 hover:border-gray-300";
const selectCls = "w-full px-3.5 py-2.5 bg-gray-50/80 border border-gray-200 rounded-xl text-sm text-gray-900 outline-none transition-all duration-200 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 hover:border-gray-300 appearance-none cursor-pointer";

export default function BorcOdemeClient({ embedded }: BorcOdemeClientProps = {}) {
  const { homeHref, portalHomeHref } = useFinansPath();
  const { activeKurum, activeSube } = useKurum();
  const { user } = useAuth();
  const kurumId = activeKurum?.id;

  const [tab, setTab] = useState<"geciken" | "yaklasan" | "odemeler">("geciken");
  const [ozet, setOzet] = useState<GiderOzet | null>(null);
  const [gecikenTaksitler, setGecikenTaksitler] = useState<GiderTaksit[]>([]);
  const [yaklasanVadeler, setYaklasanVadeler] = useState<GiderTaksit[]>([]);
  const [sonOdemeler, setSonOdemeler] = useState<GiderOdeme[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Ödeme Drawer
  const [odemeDrawer, setOdemeDrawer] = useState<{ open: boolean; taksit: GiderTaksit | null }>({ open: false, taksit: null });

  const fetchAll = useCallback(async () => {
    if (!kurumId) return;
    setLoading(true);
    try {
      const baseParams: Record<string, string> = { kurum_id: String(kurumId) };
      if (activeSube?.id) baseParams.sube_id = String(activeSube.id);
      const [ozetRes, gecikenRes, yaklasanRes, sonRes] = await Promise.all([
        giderKaydiService.ozet({ ...baseParams }),
        giderKaydiService.gecikenTaksitler(kurumId, activeSube?.id),
        giderKaydiService.yaklasanVadeler(kurumId, 14, { subeId: activeSube?.id }),
        giderOdemeService.sonOdemeler({ ...baseParams, limit: "20" }),
      ]);
      setOzet(ozetRes);
      setGecikenTaksitler(gecikenRes);
      setYaklasanVadeler(yaklasanRes);
      setSonOdemeler(sonRes);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [kurumId, activeSube?.id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => {
    if (success || error) {
      const t = setTimeout(() => { setSuccess(""); setError(""); }, 4000);
      return () => clearTimeout(t);
    }
  }, [success, error]);

  const handleOdemeYap = (taksit: GiderTaksit) => {
    if (Number(taksit.kalan_tutar) <= 0) {
      setError("Bu taksitin kalan borcu yok; liste yenileniyor.");
      fetchAll();
      return;
    }
    setOdemeDrawer({ open: true, taksit });
  };

  const handleOdemeSuccess = (msg: string) => {
    setSuccess(msg);
    setOdemeDrawer({ open: false, taksit: null });
    fetchAll();
  };

  const exportFiltersBase = useMemo(
    () => ({
      kurum_id: kurumId,
      sube_id: activeSube?.id,
      raporu_olusturan: user
        ? `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.username
        : undefined,
      report_kind: "borc_odeme_takip",
      para_birimi: "TL",
    }),
    [kurumId, activeSube?.id, user],
  );

  if (!kurumId) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
          <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="#9ca3af" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-gray-800 mb-1">Kurum Seçiniz</h3>
        <p className="text-sm text-gray-500">Borç/Ödeme takibi için üst menüden bir kurum seçin.</p>
      </div>
    );
  }

  return (
    <div className={embedded ? "" : "space-y-5"}>
      {/* Toast Notifications */}
      {error && (
        <div className="fixed bottom-6 right-6 z-[250] px-5 py-3.5 rounded-xl text-sm font-semibold text-white shadow-lg flex items-center gap-2 bg-gradient-to-r from-red-600 to-red-700">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          {error}
        </div>
      )}
      {success && (
        <div className="fixed bottom-6 right-6 z-[250] px-5 py-3.5 rounded-xl text-sm font-semibold text-white shadow-lg flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-emerald-700">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          {success}
        </div>
      )}

      {/* Header — embedded modda card-modern-header */}
      {embedded ? (
        <div className="card-modern-header">
          <h3>Borç / Ödeme Takip</h3>
          <div className="card-modern-header-actions">
            <span className="text-[12px] text-gray-500">
              {gecikenTaksitler.length > 0 && `${gecikenTaksitler.length} geciken · `}
              {yaklasanVadeler.length > 0 && `${yaklasanVadeler.length} yaklaşan`}
            </span>
          </div>
        </div>
      ) : (
        <div className="hero-header">
          <div className="hero-content">
            <div className="hero-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                <line x1="1" y1="10" x2="23" y2="10" />
              </svg>
            </div>
            <div className="hero-text">
              <h1>Borç / Ödeme Planı</h1>
              <div className="hero-breadcrumb">
                <a href={portalHomeHref}>Ana Sayfa</a>
                <span>/</span>
                <a href={homeHref}>Finans</a>
                <span>/</span>
                <span>Borç / Ödeme Planı</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Stats */}
      {!embedded && ozet && (
        <div className="quick-stats">
          <div className="quick-stat">
            <div className="quick-stat-icon blue">
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <div className="quick-stat-info">
              <h4>{fmt(ozet.toplam_gider)}</h4>
              <span>Toplam Gider</span>
            </div>
          </div>
          <div className="quick-stat">
            <div className="quick-stat-icon green">
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <div className="quick-stat-info">
              <h4>{fmt(ozet.toplam_odenen)}</h4>
              <span>Toplam Ödenen</span>
            </div>
          </div>
          <div className="quick-stat">
            <div className="quick-stat-icon orange">
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
            </div>
            <div className="quick-stat-info">
              <h4>{ozet.bekleyen_sayi}</h4>
              <span>Bekleyen</span>
            </div>
          </div>
          <div className="quick-stat">
            <div className={`quick-stat-icon ${ozet.geciken_taksit_sayi > 0 ? "red" : "green"}`}>
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
            </div>
            <div className="quick-stat-info">
              <h4>{ozet.geciken_taksit_sayi}</h4>
              <span>Geciken Taksit</span>
            </div>
          </div>
        </div>
      )}

      {/* Tab Bar — tabs-modern yapısı */}
      <div className={`${embedded ? "px-5 pt-4" : ""}`}>
        <div className="tabs-modern">
          <a
            className={`tab-modern ${tab === "geciken" ? "active" : ""}`}
            onClick={(e) => { e.preventDefault(); setTab("geciken"); }}
            href="#"
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
            Geciken Taksitler
            {gecikenTaksitler.length > 0 && <span className="tab-count">{gecikenTaksitler.length}</span>}
          </a>
          <a
            className={`tab-modern ${tab === "yaklasan" ? "active" : ""}`}
            onClick={(e) => { e.preventDefault(); setTab("yaklasan"); }}
            href="#"
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Yaklaşan Vadeler
            {yaklasanVadeler.length > 0 && <span className="tab-count">{yaklasanVadeler.length}</span>}
          </a>
          <a
            className={`tab-modern ${tab === "odemeler" ? "active" : ""}`}
            onClick={(e) => { e.preventDefault(); setTab("odemeler"); }}
            href="#"
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
            Son Ödemeler
            {sonOdemeler.length > 0 && <span className="tab-count">{sonOdemeler.length}</span>}
          </a>
        </div>
      </div>

      {/* Tab Content */}
      <div className={`${embedded ? "px-5 pb-5" : ""}`}>
      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-8 h-8 border-[3px] border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <p className="mt-3 text-sm text-gray-400">Yükleniyor...</p>
          </div>
        </div>
      ) : (
        <>
          {tab === "geciken" && (
            <GecikenTaksitlerTab
              taksitler={gecikenTaksitler}
              onOdemeYap={handleOdemeYap}
              exportFiltersMeta={{ ...exportFiltersBase, rapor_adi: "Geciken Taksitler" }}
            />
          )}
          {tab === "yaklasan" && (
            <YaklasanVadelerTab
              taksitler={yaklasanVadeler}
              onOdemeYap={handleOdemeYap}
              exportFiltersMeta={{ ...exportFiltersBase, rapor_adi: "Yaklaşan Vadeler" }}
            />
          )}
          {tab === "odemeler" && (
            <SonOdemelerTab
              odemeler={sonOdemeler}
              exportFiltersMeta={{ ...exportFiltersBase, rapor_adi: "Son Ödemeler" }}
            />
          )}
        </>
      )}
      </div>

      {/* Ödeme Drawer */}
      <OdemeDrawer
        taksit={odemeDrawer.taksit}
        open={odemeDrawer.open}
        kurumId={kurumId}
        onClose={() => setOdemeDrawer({ open: false, taksit: null })}
        onSuccess={handleOdemeSuccess}
      />
    </div>
  );
}

/* ═══ Özet Kartı ═══ */
function SummaryCard({ icon, label, value, bgColor, iconBg, iconColor, highlight }: {
  icon: React.ReactNode; label: string; value: string; bgColor: string; iconBg: string; iconColor: string; highlight?: boolean;
}) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:-translate-y-0.5 hover:shadow-md transition-all ${highlight ? "ring-2 ring-red-300" : ""}`}>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl ${iconBg} ${iconColor} flex items-center justify-center shrink-0`}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-xs font-medium text-gray-500 truncate">{label}</div>
          <div className="text-lg font-bold text-gray-900 truncate">{value}</div>
        </div>
      </div>
    </div>
  );
}

function odenebilirTaksitler(items: GiderTaksit[]): GiderTaksit[] {
  return items.filter((t) => Number(t.kalan_tutar) > 0);
}

/* ═══ Geciken Taksitler Tab ═══ */
function GecikenTaksitlerTab({
  taksitler,
  onOdemeYap,
  exportFiltersMeta,
}: {
  taksitler: GiderTaksit[];
  onOdemeYap: (t: GiderTaksit) => void;
  exportFiltersMeta: Record<string, unknown>;
}) {
  const rows = odenebilirTaksitler(taksitler);
  const exportRows = buildGecikenExportRows(taksitler);
  if (rows.length === 0) {
    return (
      <div className="card-modern">
        <div className="card-modern-body">
          <div className="empty-state">
            <div className="empty-state-icon">✅</div>
            <h4>Geciken taksit yok!</h4>
            <p>Tüm ödemeleriniz güncel görünüyor.</p>
          </div>
        </div>
      </div>
    );
  }

  const bugun = new Date();

  return (
    <div className="card-modern">
      <div className="card-modern-header">
        <h3>
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
          {rows.length} taksit vadesi geçmiş
        </h3>
        <div className="card-modern-header-actions">
          <span className="badge-modern danger">Toplam: {fmt(rows.reduce((a, t) => a + Number(t.kalan_tutar), 0))}</span>
          <FinansRowsExportMenu
            title="Geciken Taksitler"
            columns={[...GECIKEN_EXPORT_COLUMNS]}
            rows={exportRows}
            filtersMeta={exportFiltersMeta}
            filenamePrefix="geciken-taksitler"
          />
        </div>
      </div>
      <div className="card-modern-body">
        <table className="table-modern">
          <thead>
            <tr>
              <th>Tedarikçi / Fatura</th>
              <th>Taksit</th>
              <th>Vade Tarihi</th>
              <th>Geciken Gün</th>
              <th style={{ textAlign: "right" }}>Tutar</th>
              <th style={{ textAlign: "right" }}>Ödenen</th>
              <th style={{ textAlign: "right" }}>Kalan</th>
              <th style={{ width: "120px" }}>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const vade = new Date(t.vade_tarihi);
              const gecenGun = Math.floor((bugun.getTime() - vade.getTime()) / (1000 * 60 * 60 * 24));
              return (
                <tr key={t.id}>
                  <td>
                    <FinansCariHesapCell
                      name={t.cari_hesap_adi || "—"}
                      subtitle={t.fatura_no || `Gider #${t.gider_kaydi_id}`}
                    />
                  </td>
                  <td>
                    <span className="badge-modern info">#{t.taksit_no}</span>
                  </td>
                  <td>
                    <span className="date-text">{t.vade_tarihi}</span>
                  </td>
                  <td>
                    <span className={`badge-modern ${gecenGun > 30 ? "danger" : gecenGun > 7 ? "warning" : "warning"}`}>
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01" /></svg>
                      {gecenGun} gün
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{Number(t.tutar).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺</span>
                  </td>
                  <td style={{ textAlign: "right", color: "#059669" }}>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{Number(t.odenen_tutar).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺</span>
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 700, color: "#dc2626" }}>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{Number(t.kalan_tutar).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺</span>
                  </td>
                  <td>
                    <div className="row-actions" style={{ opacity: 1 }}>
                      <button onClick={() => onOdemeYap(t)} className="row-action-btn" title="Ödeme Yap" style={{ background: "#ecfdf5", borderColor: "#a7f3d0", color: "#059669" }}>
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: "#fef2f2" }}>
              <td colSpan={6} style={{ textAlign: "right", fontWeight: 600, fontSize: "13px" }}>Toplam Geciken:</td>
              <td style={{ textAlign: "right", fontWeight: 700, color: "#dc2626", fontSize: "15px", fontVariantNumeric: "tabular-nums" }}>{fmt(rows.reduce((a, t) => a + Number(t.kalan_tutar), 0))}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/* ═══ Yaklaşan Vadeler Tab ═══ */
function YaklasanVadelerTab({
  taksitler,
  onOdemeYap,
  exportFiltersMeta,
}: {
  taksitler: GiderTaksit[];
  onOdemeYap: (t: GiderTaksit) => void;
  exportFiltersMeta: Record<string, unknown>;
}) {
  const rows = odenebilirTaksitler(taksitler);
  const exportRows = buildYaklasanExportRows(taksitler);
  if (rows.length === 0) {
    return (
      <div className="card-modern">
        <div className="card-modern-body">
          <div className="empty-state">
            <div className="empty-state-icon">📅</div>
            <h4>Önümüzdeki 14 günde vade yok</h4>
            <p>Yaklaşan ödeme bulunmuyor.</p>
          </div>
        </div>
      </div>
    );
  }

  const bugun = new Date();

  return (
    <div className="card-modern">
      <div className="card-modern-header">
        <h3>
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          Önümüzdeki 14 günde {rows.length} taksit vadesi dolacak
        </h3>
        <div className="card-modern-header-actions">
          <span className="badge-modern warning">Toplam: {fmt(rows.reduce((a, t) => a + Number(t.kalan_tutar), 0))}</span>
          <FinansRowsExportMenu
            title="Yaklaşan Vadeler"
            columns={[...YAKLASAN_EXPORT_COLUMNS]}
            rows={exportRows}
            filtersMeta={exportFiltersMeta}
            filenamePrefix="yaklasan-vadeler"
          />
        </div>
      </div>
      <div className="card-modern-body">
        <table className="table-modern">
          <thead>
            <tr>
              <th>Tedarikçi / Fatura</th>
              <th>Taksit</th>
              <th>Vade Tarihi</th>
              <th>Kalan Gün</th>
              <th style={{ textAlign: "right" }}>Tutar</th>
              <th style={{ textAlign: "right" }}>Kalan</th>
              <th style={{ width: "120px" }}>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const vade = new Date(t.vade_tarihi);
              const kalanGun = Math.max(0, Math.ceil((vade.getTime() - bugun.getTime()) / (1000 * 60 * 60 * 24)));
              return (
                <tr key={t.id}>
                  <td>
                    <FinansCariHesapCell
                      name={t.cari_hesap_adi || "—"}
                      subtitle={t.fatura_no ? `#${t.fatura_no}` : `GK-${t.gider_kaydi_id}`}
                    />
                  </td>
                  <td>
                    <span className="badge-modern info">#{t.taksit_no}</span>
                  </td>
                  <td>
                    <span className="date-text">{t.vade_tarihi}</span>
                  </td>
                  <td>
                    <span className={`badge-modern ${kalanGun <= 3 ? "danger" : kalanGun <= 7 ? "warning" : "info"}`}>
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      {kalanGun} gün
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(Number(t.tutar))}</span>
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 700, color: "#ea580c" }}>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(Number(t.kalan_tutar))}</span>
                  </td>
                  <td>
                    <div className="row-actions" style={{ opacity: 1 }}>
                      <button onClick={() => onOdemeYap(t)} className="row-action-btn" title="Ödeme Yap" style={{ background: "#ecfdf5", borderColor: "#a7f3d0", color: "#059669" }}>
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: "#fffbeb" }}>
              <td colSpan={5} style={{ textAlign: "right", fontWeight: 600, fontSize: "13px" }}>Toplam:</td>
              <td style={{ textAlign: "right", fontWeight: 700, color: "#ea580c", fontSize: "15px", fontVariantNumeric: "tabular-nums" }}>{fmt(rows.reduce((a, t) => a + Number(t.kalan_tutar), 0))}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/* ═══ Son Ödemeler Tab ═══ */
function SonOdemelerTab({
  odemeler,
  exportFiltersMeta,
}: {
  odemeler: GiderOdeme[];
  exportFiltersMeta: Record<string, unknown>;
}) {
  const exportRows = buildSonOdemeExportRows(odemeler);
  if (odemeler.length === 0) {
    return (
      <div className="card-modern">
        <div className="card-modern-body">
          <div className="empty-state">
            <div className="empty-state-icon">💳</div>
            <h4>Henüz ödeme yapılmamış</h4>
            <p>Gider kayıtlarınıza ödeme yaparak burada görebilirsiniz.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card-modern">
      <div className="card-modern-header">
        <h3>
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          Son {odemeler.length} ödeme
        </h3>
        <div className="card-modern-header-actions">
          <span className="badge-modern success">Toplam: {fmt(odemeler.reduce((a, o) => a + Number(o.tutar), 0))}</span>
          <FinansRowsExportMenu
            title="Son Ödemeler"
            columns={[...SON_ODEME_EXPORT_COLUMNS]}
            rows={exportRows}
            filtersMeta={exportFiltersMeta}
            filenamePrefix="son-odemeler"
          />
        </div>
      </div>
      <div className="card-modern-body">
        <table className="table-modern">
          <thead>
            <tr>
              <th>Tarih</th>
              <th>Tedarikçi</th>
              <th>Fatura No</th>
              <th>Yöntem</th>
              <th>Hesap</th>
              <th style={{ textAlign: "right" }}>Tutar</th>
              <th>Durum</th>
            </tr>
          </thead>
          <tbody>
            {odemeler.map((o) => (
              <tr key={o.id}>
                <td>
                  <span className="date-text">{o.odeme_tarihi}</span>
                </td>
                <td>
                  <FinansCariHesapCell name={o.cari_hesap_adi} />
                </td>
                <td>
                  <span className="cell-secondary" style={{ fontFamily: "monospace" }}>{o.fatura_no || "—"}</span>
                </td>
                <td>
                  <span className="badge-modern primary">
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                    {o.odeme_yontemi_adi}
                  </span>
                </td>
                <td>{o.mali_hesap_adi}</td>
                <td style={{ textAlign: "right", fontWeight: 700, color: "#059669", fontVariantNumeric: "tabular-nums" }}>{fmt(Number(o.tutar))}</td>
                <td>
                  <span className={`badge-modern ${o.durum === "aktif" ? "success" : "danger"}`}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      {o.durum === "aktif" ? (
                        <polyline points="20 6 9 17 4 12" />
                      ) : (
                        <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>
                      )}
                    </svg>
                    {o.durum_display}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: "#ecfdf5" }}>
              <td colSpan={5} style={{ textAlign: "right", fontWeight: 600, fontSize: "13px" }}>Toplam:</td>
              <td style={{ textAlign: "right", fontWeight: 700, color: "#059669", fontSize: "15px", fontVariantNumeric: "tabular-nums" }}>{fmt(odemeler.reduce((a, o) => a + Number(o.tutar), 0))}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/* ═══ Ödeme Drawer (Slide-Over) ═══ */
function OdemeDrawer({
  taksit,
  open,
  onClose,
  onSuccess,
  kurumId,
}: {
  taksit: GiderTaksit | null;
  open: boolean;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  kurumId: number | undefined;
}) {
  const { activeSube } = useKurum();
  const [tutar, setTutar] = useState("");
  const [yontemId, setYontemId] = useState("");
  const [hesapId, setHesapId] = useState("");
  const [tarih, setTarih] = useState(new Date().toISOString().slice(0, 10));
  const [aciklama, setAciklama] = useState("");
  const [masrafForm, setMasrafForm] = useState({ ...EMPTY_ISLEM_MASRAFI });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [hesaplar, setHesaplar] = useState<{ id: number; ad: string; tip: string; sube_ad?: string }[]>([]);
  const hesapOdemeYontemleri = useOdemeYontemleriForMaliHesap(
    kurumId,
    hesapId ? Number(hesapId) : null,
    activeSube?.id,
  );

  // Taksit değişince formu sıfırla
  useEffect(() => {
    if (taksit && open) {
      setTutar(String(taksit.kalan_tutar));
      setYontemId("");
      setHesapId("");
      setTarih(new Date().toISOString().slice(0, 10));
      setAciklama("");
      setMasrafForm({ ...EMPTY_ISLEM_MASRAFI });
      setError("");
    }
  }, [taksit, open]);

  // Dropdown verileri
  useEffect(() => {
    if (!kurumId || !open) return;
    financialAccountService.dropdownByKurum(kurumId, activeSube?.id).then((r) => setHesaplar(r.mali_hesaplar || [])).catch(() => {});
  }, [kurumId, open, activeSube?.id]);

  const selectedYontem = hesapOdemeYontemleri.find((y) => String(y.id) === yontemId);
  const selectedHesap = hesaplar.find((h) => String(h.id) === hesapId);
  const masrafVisible = islemMasrafiGoster(selectedYontem?.tip, selectedHesap?.tip);

  if (!taksit) return null;

  const kalanTutar = Number(taksit.kalan_tutar);
  if (kalanTutar <= 0) return null;
  const odenenTutar = Number(taksit.tutar) - kalanTutar;
  const tutarNum = parseFloat(tutar) || 0;
  const isValid = tutarNum > 0 && tutarNum <= kalanTutar && yontemId && hesapId && tarih;

  const handleSubmit = async () => {
    if (!isValid || saving) return;
    setSaving(true);
    try {
      const masraf = buildIslemMasrafiPayload(masrafForm);
      const payload: GiderOdemeCreatePayload = {
        gider_kaydi_id: taksit.gider_kaydi_id,
        gider_taksit_id: taksit.id,
        odeme_yontemi_id: Number(yontemId),
        mali_hesap_id: Number(hesapId),
        tutar: tutarNum,
        odeme_tarihi: tarih,
        aciklama: aciklama || undefined,
        ...masraf,
      };
      await giderOdemeService.create(taksit.gider_kaydi_id, payload);
      onSuccess("Ödeme başarıyla kaydedildi");
    } catch (err: unknown) {
      if (err instanceof FinansHttpError) {
        setError(err.fieldErrors.gider_kaydi || err.fieldErrors.tutar || err.message);
      } else {
        setError(err instanceof Error ? err.message : "Ödeme kaydedilemedi!");
      }
    } finally {
      setSaving(false);
    }
  };

  const quickAmounts = [
    { label: "Tam", value: kalanTutar },
    { label: "½", value: Math.round(kalanTutar / 2 * 100) / 100 },
    { label: "¼", value: Math.round(kalanTutar / 4 * 100) / 100 },
  ];

  return (
    <>
      {/* Backdrop */}
      {open && <div className="fixed inset-0 bg-black/30 z-[150] transition-opacity" onClick={onClose} />}

      {/* Drawer */}
      <div className={`fixed top-0 right-0 h-full w-full max-w-[520px] bg-white shadow-2xl z-[200] transition-transform duration-300 flex flex-col ${open ? "translate-x-0" : "translate-x-full"}`}>
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-100 flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-md">
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Ödeme Yap</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {taksit.cari_hesap_adi || '—'} • Taksit #{taksit.taksit_no}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/80 rounded-xl p-3 border border-gray-100">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Tutar</div>
              <div className="text-sm font-bold text-gray-800">{fmt(Number(taksit.tutar))}</div>
            </div>
            <div className="bg-white/80 rounded-xl p-3 border border-emerald-100">
              <div className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">Ödenen</div>
              <div className="text-sm font-bold text-emerald-700">{fmt(odenenTutar)}</div>
            </div>
            <div className="bg-white/80 rounded-xl p-3 border border-orange-100">
              <div className="text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-1">Kalan</div>
              <div className="text-sm font-bold text-orange-700">{fmt(kalanTutar)}</div>
            </div>
          </div>
        </div>

        {/* Form body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Hata mesajı */}
          {error && (
            <div className="flex items-center gap-3 bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-[13px]">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {error}
              <button onClick={() => setError("")} className="ml-auto text-rose-400 hover:text-rose-600">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          )}
          {/* Tutar */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Ödeme Tutarı *</label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={kalanTutar}
                value={tutar}
                onChange={(e) => setTutar(e.target.value)}
                className={inputCls + " pr-8 text-lg font-bold"}
                placeholder="0.00"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-semibold">₺</span>
            </div>
            {/* Quick amount buttons */}
            <div className="flex gap-2 mt-2">
              {quickAmounts.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => setTutar(String(q.value))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    parseFloat(tutar) === q.value
                      ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                      : "bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700"
                  }`}
                >
                  {q.label} ({fmt(q.value)})
                </button>
              ))}
            </div>
            {tutarNum > kalanTutar && (
              <p className="text-xs text-red-500 mt-1">Tutar, kalan tutardan ({fmt(kalanTutar)}) büyük olamaz.</p>
            )}
          </div>

          {/* Mali Hesap */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Mali Hesap *</label>
            <select value={hesapId} onChange={(e) => { setHesapId(e.target.value); setYontemId(""); }} className={selectCls}>
              <option value="">Seçiniz...</option>
              {hesaplar.map((h) => (
                <option key={h.id} value={h.id}>{h.ad}{h.sube_ad ? ` (${h.sube_ad})` : ""}</option>
              ))}
            </select>
          </div>

          {/* Ödeme Yöntemi */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Ödeme Yöntemi *</label>
            <select value={yontemId} onChange={(e) => setYontemId(e.target.value)} className={selectCls} disabled={!hesapId}>
              <option value="">{hesapId ? "Seçiniz..." : "Önce mali hesap seçin"}</option>
              {hesapOdemeYontemleri.map((y) => (
                <option key={y.id} value={y.id}>{y.ad}</option>
              ))}
            </select>
          </div>

          {/* Tarih */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Ödeme Tarihi *</label>
            <input type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} className={inputCls} />
          </div>

          {/* Açıklama */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Açıklama</label>
            <textarea
              value={aciklama}
              onChange={(e) => setAciklama(e.target.value)}
              rows={3}
              className={inputCls + " resize-none"}
              placeholder="İsteğe bağlı açıklama..."
            />
          </div>

          <IslemMasrafiFields
            visible={masrafVisible}
            form={masrafForm}
            onChange={(patch) => setMasrafForm((prev) => ({ ...prev, ...patch }))}
          />
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3 flex-shrink-0">
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 transition-colors">
            İptal
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isValid || saving}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all flex items-center gap-2"
          >
            {saving ? (
              <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" /><path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" className="opacity-75" /></svg>Kaydediliyor...</>
            ) : (
              <>
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                Ödemeyi Kaydet
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}

/* ═══ Helpers ═══ */
function fmt(value: number): string {
  return `${value.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺`;
}
