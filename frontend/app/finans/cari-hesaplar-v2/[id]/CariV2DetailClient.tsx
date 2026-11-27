"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useKurum } from "@/lib/contexts/KurumContext";
import { useFinansPath } from "@/components/finans/FinansPathProvider";
import { cariV2Service, CariV2Dosya } from "../../services/cari-v2-api";
import { cariHesapService } from "../../services/cari-hesap-api";
import {
  AylikNokta,
  CariEtiket,
  CariV2AcikKalem,
  CariV2AcikKalemler,
  CariV2Detail,
  CariV2Hareket,
  CariV2HareketOzet,
  CariV2Panel,
  CariV2Report,
  RISK_META,
  turMeta,
} from "../../types/cari-v2-types";
import CariV2FormDrawer from "../CariV2FormDrawer";
import SerbestOdemeModal from "../SerbestOdemeModal";
import SerbestTahsilatModal from "../SerbestTahsilatModal";
import GelirGiderFormDrawer from "../../gelir-gider-v2/GelirGiderFormDrawer";
import GelirDetayDrawer from "../../gelir-gider-v2/GelirDetayDrawer";
import GiderDetayDrawer from "../../gelir-gider-v2/GiderDetayDrawer";
import GelirTahsilatDrawer from "../../gelir-gider-v2/GelirTahsilatDrawer";
import GiderOdemeDrawer from "../../gelir-gider-v2/GiderOdemeDrawer";
import { GELIR_CONFIG, GIDER_CONFIG } from "../../gelir-gider-v2/gg-config";
import { ggService } from "../../gelir-gider-v2/gg-v2-api";
import type { GGDropdown, GGListItem, GGModul } from "../../gelir-gider-v2/gg-v2-types";
import "../cari-v2.css";

const TL = (n: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(n || 0);
const DATE = (s: string | null) => (s ? new Date(s).toLocaleDateString("tr-TR") : "—");

// Export için değer biçimleyiciler (backend tabloyu olduğu gibi basar)
const EXP_MONEY = (v: unknown) => Number(v || 0).toFixed(2);
const EXP_DATE = (s: unknown) => (s ? new Date(String(s)).toLocaleDateString("tr-TR") : "");

type ExpFormat = "pdf" | "xlsx" | "csv";

/** Cari karttan açılan kaynak belge: detay çekmecesi veya tahsilat/ödeme çekmecesi. */
interface BelgeEkrani {
  modul: GGModul;
  row: GGListItem;
  dropdown: GGDropdown | null;
  mod: "detay" | "islem";
  taksitId: number | null;
  mahsup: boolean;
}
type OpenBelge = (
  modul: GGModul,
  kaynakId: number,
  mod: BelgeEkrani["mod"],
  opts?: { taksitId?: number | null; mahsup?: boolean },
) => void;

const HAREKET_PAGE_SIZE = 50;
/** Backend hareketler ucunun izin verdiği en büyük sayfa boyutu. */
const HAREKET_EXPORT_PAGE_SIZE = 500;

async function downloadTabExport(
  cariId: number,
  kurumId: number,
  format: ExpFormat,
  title: string,
  columns: { key: string; label: string }[],
  rows: Record<string, unknown>[],
) {
  const isToplamRow = (r: Record<string, unknown>) =>
    String(r.kategori || r.fatura_no || r.islem_turu || r.islem || r.tur || "") === "TOPLAM";
  const dataRows = rows.filter((r) => !isToplamRow(r));
  const toplamRow = rows.find(isToplamRow);
  const sumKey = (key: string) => dataRows.reduce((s, r) => s + Number(r[key] || 0), 0);
  const titleLower = title.toLowerCase();
  const filters_meta: Record<string, unknown> = {
    kurum_id: kurumId,
    rapor_adi: title,
    report_kind: titleLower.includes("hareket") || titleLower.includes("tahsilat") || titleLower.includes("ödeme")
      ? "cari_ekstre"
      : "cari_ozet",
  };

  if (columns.some((c) => c.key === "net_tutar") && titleLower.includes("gelir")) {
    const toplamGelir = sumKey("net_tutar");
    const tahsil = sumKey("tahsil_edilen");
    const kalan = sumKey("kalan");
    filters_meta.report_totals = { toplam_gelir: toplamGelir, tahsil_edilen: tahsil, kalan };
    filters_meta.summary_chips = [
      { label: "Toplam Gelir", value: toplamGelir, type: "currency" },
      { label: "Tahsil Edilen", value: tahsil, type: "currency" },
      { label: "Kalan", value: kalan, type: "currency" },
    ];
    filters_meta.cari_ozet_fields = [
      { label: "Toplam Gelir", value: `${toplamGelir.toFixed(2)} ₺` },
      { label: "Tahsil Edilen", value: `${tahsil.toFixed(2)} ₺` },
      { label: "Kalan", value: `${kalan.toFixed(2)} ₺` },
    ];
  } else if (columns.some((c) => c.key === "net_tutar") && titleLower.includes("gider")) {
    const toplamGider = sumKey("net_tutar");
    const odenen = sumKey("odenen_toplam");
    const kalan = sumKey("kalan");
    filters_meta.report_totals = { toplam_gider: toplamGider, odenen, kalan };
    filters_meta.summary_chips = [
      { label: "Toplam Gider", value: toplamGider, type: "currency" },
      { label: "Ödenen", value: odenen, type: "currency" },
      { label: "Kalan", value: kalan, type: "currency" },
    ];
    filters_meta.cari_ozet_fields = [
      { label: "Toplam Gider", value: `${toplamGider.toFixed(2)} ₺` },
      { label: "Ödenen", value: `${odenen.toFixed(2)} ₺` },
      { label: "Kalan", value: `${kalan.toFixed(2)} ₺` },
    ];
  } else if (columns.some((c) => c.key === "borc" || c.key === "alacak")) {
    let toplamBorc = 0;
    let toplamAlacak = 0;
    for (const r of dataRows) {
      toplamBorc += Number(r.borc || 0);
      toplamAlacak += Number(r.alacak || 0);
    }
    // Satırlar yeniden eskiye sıralı: kapanış TOPLAM satırında, yoksa en yeni satırda.
    const lastBakiye = Number((toplamRow ?? dataRows[0])?.bakiye || 0);
    filters_meta.report_totals = {
      toplam_borc: toplamBorc,
      toplam_alacak: toplamAlacak,
      net_bakiye: lastBakiye,
    };
    filters_meta.summary_chips = [
      { label: "Toplam Borç", value: toplamBorc, type: "currency" },
      { label: "Toplam Alacak", value: toplamAlacak, type: "currency" },
      { label: "Net Bakiye", value: lastBakiye, type: "currency" },
    ];
    filters_meta.cari_ozet_fields = [
      { label: "Toplam Borç", value: `${toplamBorc.toFixed(2)} ₺` },
      { label: "Toplam Alacak", value: `${toplamAlacak.toFixed(2)} ₺` },
      { label: "Net Bakiye", value: `${lastBakiye.toFixed(2)} ₺` },
    ];
  }

  const { blob, filename } = await cariV2Service.tabExport(cariId, {
    format,
    orientation: "landscape",
    title,
    columns,
    rows,
    filters_meta,
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || `${title}.${format}`;
  a.click();
  URL.revokeObjectURL(url);
}

function TabExportBar({
  cariId, kurumId, title, columns, rows, total, loadRows,
}: {
  cariId: number; kurumId: number; title: string;
  columns: { key: string; label: string }[];
  rows: Record<string, unknown>[];
  /** Sayfalı listelerde filtreye uyan toplam kayıt sayısı. */
  total?: number;
  /** Sayfalı listelerde dışa aktarma için tüm filtreli satırları getirir. */
  loadRows?: () => Promise<Record<string, unknown>[]>;
}) {
  const [busy, setBusy] = useState(false);
  const kayitSayisi = total ?? rows.length;
  const run = async (format: ExpFormat) => {
    if (!kayitSayisi) return;
    setBusy(true);
    try {
      const exportRows = loadRows ? await loadRows() : rows;
      await downloadTabExport(cariId, kurumId, format, title, columns, exportRows);
    }
    catch (e) { alert(e instanceof Error ? e.message : "Dışa aktarma başarısız."); }
    finally { setBusy(false); }
  };
  return (
    <div className="cv2-toolbar" style={{ marginBottom: 10, justifyContent: "flex-end" }}>
      <span className="cv2-muted" style={{ fontSize: 12, marginRight: "auto" }}>{kayitSayisi} kayıt</span>
      <button className="cv2-btn cv2-btn--sm" disabled={busy || !kayitSayisi} onClick={() => run("pdf")}>PDF</button>
      <button className="cv2-btn cv2-btn--sm" disabled={busy || !kayitSayisi} onClick={() => run("xlsx")}>Excel</button>
      <button className="cv2-btn cv2-btn--sm" disabled={busy || !kayitSayisi} onClick={() => run("csv")}>CSV</button>
    </div>
  );
}

const REPORTS = [
  { slug: "ekstre", label: "Cari Ekstre" },
  { slug: "hareket-raporu", label: "Hareket Raporu" },
  { slug: "gelir-analizi", label: "Gelir Analizi" },
  { slug: "gider-analizi", label: "Gider Analizi" },
  { slug: "yaslandirma", label: "Vade Yaşlandırma (0–30 / 31–60 / 61–90 / 90+ gün)" },
  { slug: "risk-analizi", label: "Risk Analizi" },
  { slug: "tahsilat-performansi", label: "Tahsilat Performansı" },
  { slug: "odeme-performansi", label: "Ödeme Performansı" },
];

function durumBadgeMeta(rawDurum: string): { bg: string; fg: string } {
  const d = (rawDurum || "").toLowerCase();
  if (d.includes("tahsil_edildi") || (d.includes("odendi") && !d.includes("kismi"))) {
    return { bg: "#ecfdf5", fg: "#059669" };
  }
  if (d.includes("kismi")) return { bg: "#fffbeb", fg: "#d97706" };
  if (d.includes("iptal") || d.includes("gecik")) return { bg: "#fef2f2", fg: "#dc2626" };
  if (d.includes("taslak")) return { bg: "#f1f5f9", fg: "#475569" };
  return { bg: "#eff6ff", fg: "#2563eb" };
}

type Tab = "ozet" | "genel" | "hareketler" | "gelirler" | "giderler" | "tahsilatlar" | "odemeler" | "dosyalar" | "notlar" | "raporlar" | "yetkiler";

export default function CariV2DetailClient({ cariId }: { cariId: number }) {
  const { activeKurum, activeSube } = useKurum();
  const { href } = useFinansPath();
  const router = useRouter();
  const kurumId = activeKurum?.id;
  const subeId = activeSube?.id ?? null;

  const [detail, setDetail] = useState<CariV2Detail | null>(null);
  const [panel, setPanel] = useState<CariV2Panel | null>(null);
  const [etiketler, setEtiketler] = useState<CariEtiket[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("ozet");
  const [reloadSeq, setReloadSeq] = useState(0);
  const [showEditCari, setShowEditCari] = useState(false);
  const [showSerbestOdeme, setShowSerbestOdeme] = useState(false);
  const [showSerbestTahsilat, setShowSerbestTahsilat] = useState(false);
  const [ggModalModul, setGgModalModul] = useState<GGModul | null>(null);
  const [ggDropdown, setGgDropdown] = useState<GGDropdown | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: "success" | "error" } | null>(null);
  const [belge, setBelge] = useState<BelgeEkrani | null>(null);

  const showToast = useCallback((msg: string, tone: "success" | "error" = "success") => {
    setToast({ msg, tone });
  }, []);

  /** Kaynak gelir/gider kaydını cari karttan çıkmadan detay veya tahsilat/ödeme ekranında açar. */
  const openBelge = useCallback(
    async (modul: GGModul, kaynakId: number, mod: BelgeEkrani["mod"], opts?: { taksitId?: number | null; mahsup?: boolean }) => {
      if (!kurumId) return;
      try {
        const [row, dd] = await Promise.all([
          ggService.get(modul, kaynakId),
          ggService.dropdown(modul, kurumId, subeId).catch(() => null),
        ]);
        setBelge({ modul, row, dropdown: dd, mod, taksitId: opts?.taksitId ?? null, mahsup: !!opts?.mahsup });
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Kaynak belge açılamadı.", "error");
      }
    },
    [kurumId, subeId, showToast],
  );

  const reload = useCallback(async () => {
    try {
      const [d, p] = await Promise.all([cariV2Service.get(cariId), cariV2Service.panel(cariId)]);
      setDetail(d);
      setPanel(p);
      setReloadSeq((s) => s + 1);
    } catch {
      /* keep existing */
    }
  }, [cariId]);

  const openQuickGG = useCallback(
    async (modul: GGModul) => {
      if (!kurumId) return;
      setGgModalModul(modul);
      try {
        const dd = await ggService.dropdown(modul, kurumId, subeId);
        setGgDropdown(dd);
      } catch {
        setGgDropdown(null);
      }
    },
    [kurumId, subeId],
  );

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [d, p] = await Promise.all([cariV2Service.get(cariId), cariV2Service.panel(cariId)]);
        setDetail(d); setPanel(p);
      } catch {
        setDetail(null);
      } finally { setLoading(false); }
    })();
  }, [cariId]);

  useEffect(() => {
    if (!kurumId) return;
    cariV2Service.etiketler(kurumId, subeId).then(setEtiketler).catch(() => setEtiketler([]));
  }, [kurumId, subeId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  if (loading) return <div className="cv2-loading"><div className="cv2-spinner" />Cari yükleniyor…</div>;
  if (!detail) return <div className="cv2-empty">Cari hesap bulunamadı.</div>;

  const meta = turMeta(detail.hesap_turu);
  const ozet = detail.ozet;
  const risk = ozet ? RISK_META[ozet.risk_durumu] : RISK_META.normal;

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: "ozet", label: "Özet / Açık Kalemler", show: true },
    { id: "genel", label: "Genel Bilgi", show: true },
    { id: "hareketler", label: "Hareketler", show: true },
    { id: "gelirler", label: "Gelirler", show: ["musteri", "karma", "gelir_hesabi", "diger"].includes(detail.hesap_turu) },
    { id: "giderler", label: "Giderler", show: ["tedarikci", "karma", "gider_hesabi", "diger"].includes(detail.hesap_turu) },
    { id: "tahsilatlar", label: "Tahsilatlar", show: true },
    { id: "odemeler", label: "Ödemeler", show: true },
    { id: "dosyalar", label: "Dosyalar", show: true },
    { id: "notlar", label: "Notlar", show: true },
    { id: "raporlar", label: "Raporlar", show: true },
    { id: "yetkiler", label: "Yetkiler", show: true },
  ];

  const canGelir = ["musteri", "karma", "gelir_hesabi", "diger"].includes(detail.hesap_turu);
  const canGider = ["tedarikci", "karma", "gider_hesabi", "diger"].includes(detail.hesap_turu);
  const showTahsilatBtn = canGelir || detail.bakiye > 0;
  const showOdemeBtn = canGider || detail.bakiye < 0;

  return (
    <div className="cv2-page">
      {toast && (
        <div
          style={{
            position: "fixed",
            top: 20,
            right: 20,
            zIndex: 3000,
            background: toast.tone === "error" ? "#dc2626" : "#059669",
            color: "white",
            padding: "12px 18px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            boxShadow: "0 8px 24px rgba(15, 23, 42, 0.25)",
          }}
        >
          {toast.msg}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <button className="cv2-btn cv2-btn--sm" onClick={() => router.push(href("cari-hesaplar-v2"))}>
          ← Cari Listesi
        </button>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="cv2-btn cv2-btn--sm" onClick={() => setShowEditCari(true)}>
            ✏ Cariyi Düzenle
          </button>
          {canGelir && kurumId && (
            <button
              type="button"
              className="cv2-btn cv2-btn--sm"
              style={{ borderColor: "#bbf7d0", background: "#f0fdf4", color: "#15803d", fontWeight: 600 }}
              onClick={() => openQuickGG("gelir")}
            >
              + Gelir Ekle
            </button>
          )}
          {canGider && kurumId && (
            <button
              type="button"
              className="cv2-btn cv2-btn--sm"
              style={{ borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c", fontWeight: 600 }}
              onClick={() => openQuickGG("gider")}
            >
              + Gider Ekle
            </button>
          )}
          {showTahsilatBtn && (
            <button
              type="button"
              className="cv2-btn cv2-btn--sm"
              style={{ borderColor: "#bfdbfe", background: "#eff6ff", color: "#1d4ed8", fontWeight: 600 }}
              onClick={() => setShowSerbestTahsilat(true)}
            >
              💵 Tahsilat Al
            </button>
          )}
          {showOdemeBtn && (
            <button
              type="button"
              className="cv2-btn cv2-btn--primary cv2-btn--sm"
              onClick={() => setShowSerbestOdeme(true)}
            >
              💰 Ödeme Yap
            </button>
          )}
        </div>
      </div>

      {/* Üst özet */}
      <div className="cv2-detail-head">
        <div className="cv2-detail-top">
          <div className="cv2-avatar" style={{ width: 52, height: 52, fontSize: 24, background: `${meta.renk}1a`, color: meta.renk }}>{meta.ikon}</div>
          <div className="cv2-detail-title">
            <h1>{detail.gorunen_ad}</h1>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span className="cv2-badge" style={{ background: `${meta.renk}1a`, color: meta.renk }}>{meta.label}</span>
              <span className="cv2-badge" style={{ background: detail.aktif_mi ? "#ecfdf5" : "#f1f5f9", color: detail.aktif_mi ? "#059669" : "#64748b" }}>{detail.aktif_mi ? "Aktif" : "Pasif"}</span>
              {ozet && <span className="cv2-badge" style={{ background: risk.bg, color: risk.renk }}>Risk: {ozet.risk_durumu_display}</span>}
              <span className="cv2-cari-sub">{detail.hesap_kodu} {detail.vergi_no && `· VN: ${detail.vergi_no}`}</span>
              {detail.etiketler.map((e) => (
                <span key={e.id} className="cv2-badge" style={{ background: `${e.renk}1a`, color: e.renk }}>{e.ad}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="cv2-detail-metrics">
          <Metric label="Net Bakiye" value={TL(detail.bakiye)} tone={detail.bakiye < 0 ? "neg" : detail.bakiye > 0 ? "pos" : undefined} />
          {ozet && <Metric label="Açık Alacak (Belge)" value={TL(ozet.acik_alacak_belge)} tone="pos" />}
          {ozet && <Metric label="Açık Borç (Belge)" value={TL(ozet.acik_borc_belge)} tone="neg" />}
          {Number(detail.serbest_tahsilat_bakiye ?? 0) > 0 && (
            <Metric label="Serbest Tahsilat (Mahsup)" value={TL(Number(detail.serbest_tahsilat_bakiye))} tone="pos" />
          )}
          {Number(detail.serbest_bakiye ?? 0) > 0 && (
            <Metric label="Serbest Ödeme (Mahsup)" value={TL(Number(detail.serbest_bakiye))} tone="pos" />
          )}
          {ozet && <Metric label="Geciken Tahsilat" value={TL(ozet.vadesi_gecmis_tahsilat)} tone={ozet.vadesi_gecmis_tahsilat ? "neg" : undefined} />}
          {ozet && <Metric label="Geciken Ödeme" value={TL(ozet.vadesi_gecmis_odeme)} tone={ozet.vadesi_gecmis_odeme ? "neg" : undefined} />}
          <Metric label="Son İşlem" value={DATE(ozet?.son_islem_tarihi ?? detail.updated_at)} />
          <Metric label="Risk Skoru" value={ozet ? `${ozet.risk_skoru}` : "—"} />
        </div>
      </div>

      {/* Türe özel panel */}
      {panel && <TypePanel panel={panel} />}

      {/* Sekmeler */}
      <div>
        <div className="cv2-tabs">
          {tabs.filter((t) => t.show).map((t) => (
            <button key={t.id} className={`cv2-tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>
        <div className="cv2-tabpanel">
          {tab === "ozet" && (
            <AcikKalemlerTab
              cariId={cariId}
              reloadSeq={reloadSeq}
              mahsupTahsilat={Number(detail.serbest_tahsilat_bakiye ?? 0)}
              mahsupOdeme={Number(detail.serbest_bakiye ?? 0)}
              onBelge={openBelge}
            />
          )}
          {tab === "genel" && <GenelTab detail={detail} />}
          {tab === "hareketler" && <HareketlerTab cariId={cariId} kurumId={kurumId!} reloadSeq={reloadSeq} onChanged={reload} onToast={showToast} onOpenBelge={openBelge} title={`${detail.gorunen_ad} — Hareketler`} />}
          {tab === "gelirler" && <TabTable cariId={cariId} kurumId={kurumId!} reloadSeq={reloadSeq} title={`${detail.gorunen_ad} — Gelirler`} tab="gelirler" columns={[["fatura_no", "Fatura No"], ["fatura_tarihi", "Tarih"], ["kategori", "Kategori"], ["net_tutar", "Toplam Tutar", true], ["tahsil_edilen", "Tahsil Edilen", true], ["kalan", "Kalan", true], ["durum", "Durum"]]} />}
          {tab === "giderler" && <TabTable cariId={cariId} kurumId={kurumId!} reloadSeq={reloadSeq} title={`${detail.gorunen_ad} — Giderler`} tab="giderler" columns={[["fatura_no", "Fatura No"], ["fatura_tarihi", "Tarih"], ["kategori", "Kategori"], ["net_tutar", "Toplam Tutar", true], ["odenen_toplam", "Ödenen", true], ["kalan", "Kalan", true], ["durum", "Durum"]]} />}
          {tab === "tahsilatlar" && <HareketlerTab cariId={cariId} kurumId={kurumId!} reloadSeq={reloadSeq} onChanged={reload} onToast={showToast} onOpenBelge={openBelge} islemTuru="tahsilat" title={`${detail.gorunen_ad} — Tahsilatlar`} />}
          {tab === "odemeler" && <HareketlerTab cariId={cariId} kurumId={kurumId!} reloadSeq={reloadSeq} onChanged={reload} onToast={showToast} onOpenBelge={openBelge} islemTuru="odeme,mahsup" title={`${detail.gorunen_ad} — Ödemeler`} />}
          {tab === "dosyalar" && <DosyalarTab cariId={cariId} />}
          {tab === "notlar" && <NotlarTab detail={detail} />}
          {tab === "raporlar" && <RaporlarTab cariId={cariId} kurumId={kurumId!} subeId={subeId} />}
          {tab === "yetkiler" && <YetkilerTab />}
        </div>
      </div>

      {showEditCari && kurumId && (
        <CariV2FormDrawer
          kurumId={kurumId}
          subeId={subeId}
          cariId={detail.id}
          etiketler={etiketler}
          onClose={() => setShowEditCari(false)}
          onSaved={() => {
            setShowEditCari(false);
            void reload();
          }}
          onToast={(msg, type) => showToast(msg, type === "error" ? "error" : "success")}
        />
      )}

      {ggModalModul && kurumId && (
        <GelirGiderFormDrawer
          cfg={ggModalModul === "gider" ? GIDER_CONFIG : GELIR_CONFIG}
          open={!!ggModalModul}
          kurumId={kurumId}
          subeId={subeId}
          dropdown={ggDropdown}
          editing={null}
          lockedCariId={detail.id}
          lockedCariUnvan={detail.unvan}
          onDropdownRefresh={() => openQuickGG(ggModalModul)}
          onClose={() => setGgModalModul(null)}
          onSaved={() => {
            setGgModalModul(null);
            showToast(
              ggModalModul === "gider" ? "Gider kaydı eklendi." : "Gelir kaydı eklendi.",
              "success",
            );
            void reload();
          }}
        />
      )}

      {showSerbestTahsilat && (
        <SerbestTahsilatModal
          cariHesapId={detail.id}
          cariHesapAdi={detail.gorunen_ad}
          bakiye={detail.bakiye}
          onClose={() => setShowSerbestTahsilat(false)}
          onSuccess={(msg) => {
            showToast(msg, "success");
            void reload();
          }}
        />
      )}

      {showSerbestOdeme && (
        <SerbestOdemeModal
          cariHesapId={detail.id}
          cariHesapAdi={detail.gorunen_ad}
          bakiye={detail.bakiye}
          onClose={() => setShowSerbestOdeme(false)}
          onSuccess={(msg) => {
            showToast(msg, "success");
            void reload();
          }}
        />
      )}

      {belge?.mod === "detay" && belge.modul === "gelir" && (
        <GelirDetayDrawer
          open
          row={belge.row}
          onClose={() => setBelge(null)}
          onTahsilEt={(row) => setBelge({ ...belge, row, mod: "islem", mahsup: false })}
          onReload={() => void reload()}
        />
      )}
      {belge?.mod === "detay" && belge.modul === "gider" && (
        <GiderDetayDrawer
          open
          row={belge.row}
          highlightTaksitId={belge.taksitId}
          onClose={() => setBelge(null)}
          onOde={(row) => setBelge({ ...belge, row, mod: "islem", mahsup: false })}
          onReload={() => void reload()}
        />
      )}
      {belge?.mod === "islem" && belge.modul === "gelir" && (
        <GelirTahsilatDrawer
          open
          row={belge.row}
          dropdown={belge.dropdown}
          initialMahsup={belge.mahsup}
          onClose={() => setBelge(null)}
          onSaved={() => void reload()}
        />
      )}
      {belge?.mod === "islem" && belge.modul === "gider" && (
        <GiderOdemeDrawer
          open
          row={belge.row}
          dropdown={belge.dropdown}
          initialTaksitId={belge.taksitId}
          initialMahsup={belge.mahsup}
          onClose={() => setBelge(null)}
          onSaved={() => void reload()}
        />
      )}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  return (
    <div className="cv2-metric">
      <span>{label}</span>
      <strong className={tone === "pos" ? "cv2-pos" : tone === "neg" ? "cv2-neg" : ""}>{value}</strong>
    </div>
  );
}

const AY_KISA = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

function ayEtiket(ay: string) {
  const parts = ay.split("-");
  const month = Number(parts[1] || 1);
  return AY_KISA[month - 1] || ay;
}

function MiniChart({ data, title, gider }: { data: AylikNokta[]; title: string; gider?: boolean }) {
  const points = data.slice(-12);
  if (!points.some((d) => d.toplam > 0)) return null;
  const max = Math.max(...points.map((d) => d.toplam), 1);
  const first = points[0]?.ay || "";
  const last = points[points.length - 1]?.ay || "";
  const donem = first && last ? `${ayEtiket(first)} ${first.slice(0, 4)} – ${ayEtiket(last)} ${last.slice(0, 4)}` : "";
  return (
    <div className="cv2-chart-block">
      <div className="cv2-chart-head">
        <strong>{title}</strong>
        {donem && <span>{donem}</span>}
      </div>
      <div className="cv2-chart" role="img" aria-label={title}>
        {points.map((d) => (
          <div className="cv2-bar-wrap" key={d.ay} title={`${ayEtiket(d.ay)} ${d.ay.slice(0, 4)}: ${TL(d.toplam)}`}>
            <div
              className={`cv2-bar ${gider ? "cv2-bar--gider" : ""} ${d.toplam <= 0 ? "cv2-bar--empty" : ""}`}
              style={{ height: `${Math.max((d.toplam / max) * 100, d.toplam > 0 ? 6 : 2)}%` }}
            />
            <span className="cv2-bar-label">{ayEtiket(d.ay)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TypePanel({ panel }: { panel: CariV2Panel }) {
  return (
    <div className="cv2-panels">
      {panel.musteri && (
        <div className="cv2-panel">
          <h3>Müşteri Özeti</h3>
          <div className="cv2-detail-metrics">
            <Metric label="Toplam Satış" value={TL(panel.musteri.toplam_satis)} />
            <Metric label="Toplam Tahsilat" value={TL(panel.musteri.toplam_tahsilat)} tone="pos" />
            <Metric label="Net Alacak" value={TL(panel.musteri.acik_alacak)} tone="pos" />
          </div>
          <MiniChart data={panel.musteri.satis_analizi} title="Son 12 ay satış faturaları" />
        </div>
      )}
      {panel.tedarikci && (
        <div className="cv2-panel">
          <h3>Tedarikçi Özeti</h3>
          <div className="cv2-detail-metrics">
            <Metric label="Toplam Alış" value={TL(panel.tedarikci.toplam_alis)} />
            <Metric label="Toplam Ödeme" value={TL(panel.tedarikci.toplam_odeme)} tone="neg" />
            <Metric label="Net Borç" value={TL(panel.tedarikci.acik_borc)} tone="neg" />
          </div>
          <MiniChart data={panel.tedarikci.tedarik_analizi} title="Son 12 ay alış faturaları" gider />
        </div>
      )}
      {panel.gelir && (
        <div className="cv2-panel">
          <h3>Gelir Analizi</h3>
          <div className="cv2-detail-metrics">
            <Metric label="Toplam Gelir" value={TL(panel.gelir.toplam_gelir)} tone="pos" />
            <Metric label="Tahsil Edilen" value={TL(panel.gelir.tahsil_edilen)} tone="pos" />
            <Metric label="Bekleyen" value={TL(panel.gelir.bekleyen_gelir)} />
          </div>
          <MiniChart data={panel.gelir.aylik_grafik} title="Son 12 ay gelir faturaları" />
        </div>
      )}
      {panel.gider && (
        <div className="cv2-panel">
          <h3>Gider Analizi</h3>
          <div className="cv2-detail-metrics">
            <Metric label="Toplam Gider" value={TL(panel.gider.toplam_gider)} tone="neg" />
            <Metric label="Ödenen" value={TL(panel.gider.odenen)} tone="neg" />
            <Metric label="Kalan" value={TL(panel.gider.kalan)} />
            <Metric label="Taslak Tutarı" value={TL(panel.gider.onay_bekleyen)} />
          </div>
          <MiniChart data={panel.gider.aylik_grafik} title="Son 12 ay gider faturaları" gider />
        </div>
      )}
      {panel.net && (
        <div className="cv2-panel">
          <h3>Gelir / Gider Farkı</h3>
          <div className="cv2-detail-metrics">
            <Metric label="Toplam Gelir" value={TL(panel.net.toplam_gelir ?? 0)} tone="pos" />
            <Metric label="Toplam Gider" value={TL(panel.net.toplam_gider ?? 0)} tone="neg" />
            <Metric
              label="Fark (Gelir − Gider)"
              value={TL(panel.net.gelir_gider_fark ?? 0)}
              tone={(panel.net.gelir_gider_fark ?? 0) >= 0 ? "pos" : "neg"}
            />
          </div>
        </div>
      )}
      {panel.diger && (
        <div className="cv2-panel">
          <h3>Hesap Özeti</h3>
          <div className="cv2-detail-metrics">
            <Metric label="Net Bakiye" value={TL(panel.diger.net_bakiye)} />
            <Metric label="Toplam Borç" value={TL(panel.diger.toplam_borc)} />
            <Metric label="Toplam Alacak" value={TL(panel.diger.toplam_alacak)} />
          </div>
        </div>
      )}
    </div>
  );
}

function GenelTab({ detail }: { detail: CariV2Detail }) {
  const rows: [string, string][] = [
    ["Ünvan", detail.unvan], ["Hesap Kodu", detail.hesap_kodu], ["Kategori", detail.kategori || "—"],
    ["Vergi No", detail.vergi_no || "—"], ["Vergi Dairesi", detail.vergi_dairesi || "—"],
    ["Telefon", detail.telefon || "—"], ["E-posta", detail.email || "—"],
    ["Yetkili", detail.yetkili_kisi || "—"], ["Yetkili Tel.", detail.yetkili_telefon || "—"],
    ["İl / İlçe", `${detail.il || "—"} / ${detail.ilce || "—"}`], ["Adres", detail.adres || "—"],
    ["Banka", detail.banka_adi || "—"], ["IBAN", detail.iban || "—"],
    ["Risk Limiti", detail.risk_limiti ? TL(detail.risk_limiti) : "Limitsiz"],
    ["Varsayılan Vade", `${detail.varsayilan_vade_gun} gün`], ["Para Birimi", detail.para_birimi],
  ];
  return (
    <div className="cv2-formgrid">
      {rows.map(([k, v]) => (
        <div className="cv2-metric" key={k}><span>{k}</span><strong style={{ fontSize: 14 }}>{v}</strong></div>
      ))}
    </div>
  );
}

const bugunISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function vadeDurumu(k: CariV2AcikKalem): { label: string; bg: string; fg: string } {
  if (k.gecikme_gun > 0) return { label: `${k.gecikme_gun} gün gecikti`, bg: "#fef2f2", fg: "#dc2626" };
  if (k.vade_tarihi === bugunISO()) return { label: "Bugün", bg: "#fffbeb", fg: "#b45309" };
  return { label: "Vadesi gelmedi", bg: "#f1f5f9", fg: "#475569" };
}

function AcikKalemlerTab({
  cariId,
  reloadSeq,
  mahsupTahsilat,
  mahsupOdeme,
  onBelge,
}: {
  cariId: number;
  reloadSeq: number;
  mahsupTahsilat: number;
  mahsupOdeme: number;
  onBelge: OpenBelge;
}) {
  const [data, setData] = useState<CariV2AcikKalemler | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let iptal = false;
    setLoading(true);
    cariV2Service
      .acikKalemler(cariId)
      .then((d) => { if (!iptal) setData(d); })
      .catch(() => { if (!iptal) setData(null); })
      .finally(() => { if (!iptal) setLoading(false); });
    return () => { iptal = true; };
  }, [cariId, reloadSeq]);

  if (loading) return <div className="cv2-loading"><div className="cv2-spinner" />Açık kalemler yükleniyor…</div>;
  if (!data) return <div className="cv2-empty">Açık kalemler yüklenemedi.</div>;

  const { kalemler, ozet } = data;
  return (
    <div>
      <div className="cv2-detail-metrics" style={{ marginBottom: 10 }}>
        <Metric label={`Tahsil Edilecek (${ozet.acik_tahsilat_adet} belge)`} value={TL(ozet.acik_alacak_belge)} tone="pos" />
        <Metric label={`Ödenecek (${ozet.acik_odeme_adet} belge)`} value={TL(ozet.acik_borc_belge)} tone="neg" />
        <Metric label="Geciken Tahsilat" value={TL(ozet.geciken_tahsilat)} tone={ozet.geciken_tahsilat ? "neg" : undefined} />
        <Metric label="Geciken Ödeme" value={TL(ozet.geciken_odeme)} tone={ozet.geciken_odeme ? "neg" : undefined} />
      </div>
      <div className="cv2-muted" style={{ fontSize: 12, marginBottom: 10 }}>
        Net bakiye karşılıklı borç ve alacağı birbirinden düşer. Bu listede her belge kendi vadesi ve kalan tutarıyla ayrı gösterilir.
      </div>

      {!kalemler.length ? (
        <div className="cv2-empty">Açık (kalanı olan) belge yok.</div>
      ) : (
        <div className="cv2-tablewrap">
          <table className="cv2-table cv2-table--compact">
            <thead>
              <tr>
                <th>Tür</th>
                <th>Belge</th>
                <th>Açıklama</th>
                <th>Belge Tarihi</th>
                <th>Vade</th>
                <th>Gecikme</th>
                <th className="cv2-num">Tutar</th>
                <th className="cv2-num">Ödenen</th>
                <th className="cv2-num">Kalan</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {kalemler.map((k) => {
                const vd = vadeDurumu(k);
                const gelir = k.tip === "gelir";
                const mahsupVar = gelir ? mahsupTahsilat > 0 : mahsupOdeme > 0;
                return (
                  <tr key={`${k.tip}-${k.kaynak_id}-${k.taksit_id ?? 0}`}>
                    <td>
                      <span className="cv2-badge" style={gelir ? { background: "#ecfdf5", color: "#059669" } : { background: "#fef2f2", color: "#dc2626" }}>
                        {gelir ? "Tahsil Edilecek" : "Ödenecek"}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="cv2-linkbtn"
                        title="Kaynak belgeyi aç"
                        onClick={() => onBelge(k.tip, k.kaynak_id, "detay", { taksitId: k.taksit_id })}
                      >
                        {k.belge_no || "Belgeyi Aç"}
                      </button>
                    </td>
                    <td>{k.aciklama || "—"}</td>
                    <td>{DATE(k.belge_tarihi)}</td>
                    <td>{DATE(k.vade_tarihi)}</td>
                    <td><span className="cv2-badge" style={{ background: vd.bg, color: vd.fg }}>{vd.label}</span></td>
                    <td className="cv2-num">{TL(k.tutar)}</td>
                    <td className="cv2-num">{TL(k.odenen)}</td>
                    <td className="cv2-num"><strong>{TL(k.kalan)}</strong></td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button
                        type="button"
                        className="cv2-btn cv2-btn--sm"
                        onClick={() => onBelge(k.tip, k.kaynak_id, "islem", { taksitId: k.taksit_id })}
                      >
                        {gelir ? "Tahsilat Al" : "Ödeme Yap"}
                      </button>
                      {mahsupVar && (
                        <button
                          type="button"
                          className="cv2-btn cv2-btn--sm"
                          style={{ marginLeft: 6 }}
                          title={gelir ? "Serbest tahsilat bakiyesinden mahsup et" : "Serbest ödeme bakiyesinden mahsup et"}
                          onClick={() => onBelge(k.tip, k.kaynak_id, "islem", { taksitId: k.taksit_id, mahsup: true })}
                        >
                          Mahsup Et
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function HareketlerTab({
  cariId,
  kurumId,
  islemTuru,
  reloadSeq,
  onChanged,
  onToast,
  onOpenBelge,
  title,
}: {
  cariId: number;
  kurumId: number;
  islemTuru?: string;
  reloadSeq: number;
  onChanged: () => void;
  onToast: (msg: string, tone?: "success" | "error") => void;
  onOpenBelge: OpenBelge;
  title: string;
}) {
  const [rows, setRows] = useState<CariV2Hareket[]>([]);
  const [ozet, setOzet] = useState<CariV2HareketOzet | null>(null);
  const [baslangic, setBaslangic] = useState("");
  const [bitis, setBitis] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  useEffect(() => {
    setPage(1);
  }, [islemTuru, baslangic, bitis]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await cariV2Service.hareketler(cariId, {
        page,
        page_size: HAREKET_PAGE_SIZE,
        islem_turu: islemTuru,
        baslangic: baslangic || undefined,
        bitis: bitis || undefined,
      });
      setRows(res.results);
      setOzet(res.ozet ?? null);
      setCount(res.count);
      setTotalPages(Math.max(1, res.total_pages));
    } catch {
      setRows([]);
      setOzet(null);
      setCount(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [cariId, islemTuru, baslangic, bitis, page]);

  useEffect(() => {
    void load();
  }, [load, reloadSeq]);

  const handleSerbestIptal = async (h: CariV2Hareket) => {
    const isTahsilat = h.kaynak_tip === "SerbestTahsilat";
    if (!confirm(`Bu serbest ${isTahsilat ? "tahsilat" : "ödeme"} işlemi (${TL(h.tutar)}) iptal edilsin mi? Kasa/banka ve cari bakiye geri alınır.`)) {
      return;
    }
    setCancellingId(h.id);
    try {
      if (isTahsilat) {
        await cariHesapService.serbestTahsilatIptal(h.id);
      } else {
        await cariHesapService.serbestOdemeIptal(h.id);
      }
      onToast("Serbest işlem iptal edildi.", "success");
      await load();
      onChanged();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "İptal edilemedi.", "error");
    } finally {
      setCancellingId(null);
    }
  };

  const exportColumns = [
    { key: "islem_tarihi", label: "Tarih" },
    { key: "islem_turu", label: "İşlem" },
    { key: "aciklama", label: "Açıklama" },
    { key: "belge_no", label: "Belge" },
    { key: "borc", label: "Borç" },
    { key: "alacak", label: "Alacak" },
    { key: "bakiye", label: "Bakiye" },
  ];
  const toExportRow = (h: CariV2Hareket): Record<string, unknown> => ({
    islem_tarihi: EXP_DATE(h.islem_tarihi),
    islem_turu: h.islem_turu_display,
    aciklama: h.aciklama || "",
    belge_no: h.belge_no || "",
    borc: h.yon === "borc" ? EXP_MONEY(h.tutar) : "",
    alacak: h.yon === "alacak" ? EXP_MONEY(h.tutar) : "",
    bakiye: EXP_MONEY(h.yuruyen_bakiye),
  });

  /** Ekrandaki sayfadan bağımsız: filtreye uyan tüm satırlar + aynı kümenin TOPLAM satırı. */
  const loadExportRows = async () => {
    const args = {
      page_size: HAREKET_EXPORT_PAGE_SIZE,
      islem_turu: islemTuru,
      baslangic: baslangic || undefined,
      bitis: bitis || undefined,
    };
    const first = await cariV2Service.hareketler(cariId, { ...args, page: 1 });
    const all = [...first.results];
    for (let p = 2; p <= first.total_pages; p += 1) {
      all.push(...(await cariV2Service.hareketler(cariId, { ...args, page: p })).results);
    }
    const out = all.map(toExportRow);
    if (all.length && first.ozet) {
      out.push({
        islem_tarihi: "",
        islem_turu: "TOPLAM",
        aciklama: "",
        belge_no: "",
        borc: EXP_MONEY(first.ozet.toplam_borc),
        alacak: EXP_MONEY(first.ozet.toplam_alacak),
        bakiye: EXP_MONEY(first.ozet.kapanis_bakiye),
      });
    }
    return out;
  };

  return (
    <div>
      <div className="cv2-toolbar" style={{ marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <label className="cv2-muted" style={{ fontSize: 12 }}>Başlangıç:</label>
          <input type="date" className="cv2-btn cv2-btn--sm" value={baslangic} onChange={(e) => setBaslangic(e.target.value)} />
          <label className="cv2-muted" style={{ fontSize: 12 }}>Bitiş:</label>
          <input type="date" className="cv2-btn cv2-btn--sm" value={bitis} onChange={(e) => setBitis(e.target.value)} />
          {(baslangic || bitis) && (
            <button className="cv2-btn cv2-btn--sm" onClick={() => { setBaslangic(""); setBitis(""); }}>
              Temizle
            </button>
          )}
        </div>
        <div style={{ flex: 1 }} />
      </div>

      {ozet && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            padding: "8px 14px",
            marginBottom: 10,
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            fontSize: 12.5,
          }}
        >
          <span>Devreden Bakiye: <strong>{TL(ozet.devreden_bakiye)}</strong></span>
          <span>{ozet.filtreli ? "Listelenen Borç" : "Dönem Borç"}: <strong className="cv2-pos">{TL(ozet.toplam_borc)}</strong></span>
          <span>{ozet.filtreli ? "Listelenen Alacak" : "Dönem Alacak"}: <strong className="cv2-neg">{TL(ozet.toplam_alacak)}</strong></span>
          <span>Kapanış Bakiyesi: <strong>{TL(ozet.kapanis_bakiye)}</strong></span>
          {ozet.filtreli && (
            <span className="cv2-muted">Kapanış, cari hesabın tüm hareketleriyle hesaplanır.</span>
          )}
        </div>
      )}

      <TabExportBar
        cariId={cariId}
        kurumId={kurumId}
        title={title}
        columns={exportColumns}
        rows={[]}
        total={count}
        loadRows={loadExportRows}
      />

      {loading ? (
        <div className="cv2-loading"><div className="cv2-spinner" />Yükleniyor…</div>
      ) : !rows.length ? (
        <div className="cv2-empty">Seçili kriterlere uygun hareket bulunamadı.</div>
      ) : (
        <div className="cv2-tablewrap">
          <table className="cv2-table cv2-table--compact">
            <thead>
              <tr>
                <th>Tarih</th>
                <th>İşlem</th>
                <th>Açıklama</th>
                <th>Belge</th>
                <th className="cv2-num">Borç</th>
                <th className="cv2-num">Alacak</th>
                <th className="cv2-num">Bakiye</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => {
                const canCancelSerbest =
                  (h.kaynak_tip === "SerbestOdeme" || h.kaynak_tip === "SerbestTahsilat") &&
                  !h.iptal_edildi_mi;
                return (
                  <tr key={h.id} style={h.iptal_edildi_mi ? { opacity: 0.55 } : undefined}>
                    <td>{DATE(h.islem_tarihi)}</td>
                    <td>
                      {h.islem_turu_display}
                      {h.iptal_edildi_mi && (
                        <span className="cv2-badge" style={{ marginLeft: 6, background: "#fef2f2", color: "#dc2626" }}>
                          İptal Edildi
                        </span>
                      )}
                    </td>
                    <td>{h.aciklama || "—"}</td>
                    <td>
                      {h.kaynak_belge ? (
                        <button
                          type="button"
                          className="cv2-linkbtn"
                          title="Kaynak belgeyi aç"
                          onClick={() => onOpenBelge(h.kaynak_belge!.tip, h.kaynak_belge!.id, "detay")}
                        >
                          {h.belge_no || "Belgeyi Aç"}
                        </button>
                      ) : (
                        h.belge_no || "—"
                      )}
                    </td>
                    <td className="cv2-num">{h.yon === "borc" ? TL(h.tutar) : "—"}</td>
                    <td className="cv2-num">{h.yon === "alacak" ? TL(h.tutar) : "—"}</td>
                    <td className="cv2-num">{TL(h.yuruyen_bakiye)}</td>
                    <td style={{ textAlign: "right" }}>
                      {canCancelSerbest && (
                        <button
                          type="button"
                          className="cv2-btn cv2-btn--sm"
                          style={{ color: "#dc2626", borderColor: "#fecaca" }}
                          disabled={cancellingId === h.id}
                          onClick={() => handleSerbestIptal(h)}
                        >
                          {cancellingId === h.id ? "…" : "İptal Et"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {count > HAREKET_PAGE_SIZE && (
        <div className="cv2-toolbar" style={{ marginTop: 10, justifyContent: "flex-end", gap: 8 }}>
          <span className="cv2-muted" style={{ fontSize: 12, marginRight: "auto" }}>
            {(page - 1) * HAREKET_PAGE_SIZE + 1}–{Math.min(page * HAREKET_PAGE_SIZE, count)} / {count} hareket
          </span>
          <button className="cv2-btn cv2-btn--sm" disabled={loading || page <= 1} onClick={() => setPage((p) => p - 1)}>‹ Önceki</button>
          <span className="cv2-muted" style={{ fontSize: 12 }}>{page} / {totalPages}</span>
          <button className="cv2-btn cv2-btn--sm" disabled={loading || page >= totalPages} onClick={() => setPage((p) => p + 1)}>Sonraki ›</button>
        </div>
      )}
    </div>
  );
}

function TabTable({ cariId, kurumId, reloadSeq, title, tab, columns }: { cariId: number; kurumId: number; reloadSeq: number; title: string; tab: string; columns: [string, string, boolean?][] }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      setLoading(true);
      try { setRows((await cariV2Service.tab(cariId, tab)) as Record<string, unknown>[]); }
      catch { setRows([]); } finally { setLoading(false); }
    })();
  }, [cariId, tab, reloadSeq]);
  if (loading) return <div className="cv2-loading"><div className="cv2-spinner" />Yükleniyor…</div>;
  if (!rows.length) return <div className="cv2-empty">Kayıt bulunamadı.</div>;

  const exportColumns = columns.map(([key, label]) => ({ key, label }));
  const exportRows = rows.map((r) => {
    const out: Record<string, unknown> = {};
    for (const [key, , num] of columns) {
      if (key === "durum") {
        out[key] = String(r.durum_label || r.durum || "");
      } else {
        out[key] = num ? EXP_MONEY(r[key]) : key.includes("tarih") ? EXP_DATE(r[key]) : String(r[key] ?? "");
      }
    }
    return out;
  });
  if (rows.length) {
    const total: Record<string, unknown> = {};
    for (const [key, , num] of columns) {
      if (num) {
        total[key] = EXP_MONEY(rows.reduce((s, r) => s + Number(r[key] || 0), 0));
      } else if (key === "kategori" || key === "durum" || key === "fatura_no") {
        total[key] = key === "kategori" || key === "fatura_no" ? "TOPLAM" : "";
      } else {
        total[key] = "";
      }
    }
    exportRows.push(total);
  }

  return (
    <div>
      <TabExportBar cariId={cariId} kurumId={kurumId} title={title} columns={exportColumns} rows={exportRows} />
      <div className="cv2-tablewrap">
        <table className="cv2-table cv2-table--compact">
          <thead><tr>{columns.map(([, label, num]) => <th key={label} className={num ? "cv2-num" : ""}>{label}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {columns.map(([key, label, num]) => {
                  if (key === "durum") {
                    const badge = durumBadgeMeta(String(r.durum || ""));
                    return (
                      <td key={label}>
                        <span className="cv2-badge" style={{ background: badge.bg, color: badge.fg }}>
                          {String(r.durum_label || r.durum || "—")}
                        </span>
                      </td>
                    );
                  }
                  return (
                    <td key={label} className={num ? "cv2-num" : ""}>
                      {num ? TL(Number(r[key])) : key.includes("tarih") ? DATE(String(r[key])) : String(r[key] ?? "—")}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NotlarTab({ detail }: { detail: CariV2Detail }) {
  return <div style={{ whiteSpace: "pre-wrap", color: detail.notlar ? "#1e293b" : "#94a3b8" }}>{detail.notlar || "Not girilmemiş."}</div>;
}

const DOSYA_TURLERI = [
  { value: "sozlesme", label: "Sözleşme" },
  { value: "fatura", label: "Fatura" },
  { value: "teklif", label: "Teklif" },
  { value: "dekont", label: "Dekont / Makbuz" },
  { value: "diger", label: "Diğer" },
];

function DosyalarTab({ cariId }: { cariId: number }) {
  const [rows, setRows] = useState<CariV2Dosya[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [tur, setTur] = useState("diger");
  const [aciklama, setAciklama] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await cariV2Service.dosyalar(cariId)); }
    catch { setRows([]); } finally { setLoading(false); }
  }, [cariId]);
  useEffect(() => { load(); }, [load]);

  const upload = async () => {
    if (!file) { setErr("Lütfen bir dosya seçin."); return; }
    setErr(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("dosya", file);
      fd.append("dosya_adi", file.name);
      fd.append("dosya_turu", tur);
      if (aciklama) fd.append("aciklama", aciklama);
      await cariV2Service.dosyaYukle(cariId, fd);
      setFile(null); setAciklama(""); setTur("diger");
      const input = document.getElementById("cv2-dosya-input") as HTMLInputElement | null;
      if (input) input.value = "";
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Dosya yüklenemedi.");
    } finally { setUploading(false); }
  };

  const remove = async (d: CariV2Dosya) => {
    if (!confirm(`"${d.dosya_adi}" silinsin mi?`)) return;
    try { await cariV2Service.dosyaSil(cariId, d.id); load(); }
    catch (e) { alert(e instanceof Error ? e.message : "Silinemedi."); }
  };

  return (
    <div>
      <div className="cv2-panel" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Evrak / Dosya Yükle</h3>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label className="cv2-muted" style={{ fontSize: 12 }}>Dosya</label>
            <input id="cv2-dosya-input" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label className="cv2-muted" style={{ fontSize: 12 }}>Tür</label>
            <select className="cv2-btn" value={tur} onChange={(e) => setTur(e.target.value)}>
              {DOSYA_TURLERI.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 200 }}>
            <label className="cv2-muted" style={{ fontSize: 12 }}>Açıklama (opsiyonel)</label>
            <input className="cv2-btn" style={{ textAlign: "left" }} value={aciklama} onChange={(e) => setAciklama(e.target.value)} placeholder="Örn. 2026 sözleşmesi" />
          </div>
          <button className="cv2-btn cv2-btn--primary cv2-btn--sm" disabled={uploading || !file} onClick={upload}>
            {uploading ? "Yükleniyor…" : "Yükle"}
          </button>
        </div>
        {err && <div className="cv2-neg" style={{ marginTop: 8, fontSize: 13 }}>{err}</div>}
      </div>

      {loading ? <div className="cv2-loading"><div className="cv2-spinner" />Yükleniyor…</div> :
        !rows.length ? <div className="cv2-empty">Bu cariye ait dosya yok.</div> : (
          <div className="cv2-tablewrap">
            <table className="cv2-table cv2-table--compact">
              <thead><tr><th>Dosya Adı</th><th>Tür</th><th>Açıklama</th><th>Boyut</th><th>Yükleyen</th><th>Tarih</th><th></th></tr></thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id}>
                    <td>{d.dosya_url ? <a href={d.dosya_url} target="_blank" rel="noreferrer">{d.dosya_adi}</a> : d.dosya_adi}</td>
                    <td>{d.dosya_turu_display}</td>
                    <td>{d.aciklama || "—"}</td>
                    <td>{d.dosya_boyutu_fmt}</td>
                    <td>{d.yukleyen_adi || "—"}</td>
                    <td>{DATE(d.created_at)}</td>
                    <td>
                      <button className="cv2-btn cv2-btn--sm" style={{ color: "#dc2626", borderColor: "#fecaca" }} onClick={() => remove(d)}>Sil</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}

function RaporlarTab({ cariId, kurumId, subeId }: { cariId: number; kurumId: number; subeId: number | null }) {
  const [slug, setSlug] = useState("ekstre");
  const [baslangic, setBaslangic] = useState("");
  const [bitis, setBitis] = useState("");
  const [report, setReport] = useState<CariV2Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const buildParams = useCallback(() => {
    const p: Record<string, string> = { cari_hesap_id: String(cariId) };
    if (baslangic) p.baslangic = baslangic;
    if (bitis) p.bitis = bitis;
    return p;
  }, [cariId, baslangic, bitis]);

  const load = useCallback(async () => {
    setLoading(true); setReport(null);
    try { setReport(await cariV2Service.report(slug, kurumId, subeId, buildParams())); }
    catch { setReport(null); } finally { setLoading(false); }
  }, [slug, kurumId, subeId, buildParams]);
  useEffect(() => { load(); }, [load]);

  const doExport = async (format: "pdf" | "excel" | "csv") => {
    const params = buildParams();
    setBusy(true);
    try {
      const { blob, filename } = await cariV2Service.reportExport(slug, {
        format, kurum_id: kurumId, sube_id: subeId, params,
        filters_meta: { kurum_id: kurumId },
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Dışa aktarma başarısız.");
    } finally { setBusy(false); }
  };

  return (
    <div>
      <div className="cv2-toolbar" style={{ marginBottom: 14, flexWrap: "wrap" }}>
        <select className="cv2-btn" value={slug} onChange={(e) => setSlug(e.target.value)}>
          {REPORTS.map((r) => <option key={r.slug} value={r.slug}>{r.label}</option>)}
        </select>
        <input type="date" className="cv2-btn cv2-btn--sm" value={baslangic} onChange={(e) => setBaslangic(e.target.value)} title="Başlangıç tarihi" />
        <input type="date" className="cv2-btn cv2-btn--sm" value={bitis} onChange={(e) => setBitis(e.target.value)} title="Bitiş tarihi" />
        {(baslangic || bitis) && (
          <button className="cv2-btn cv2-btn--sm" onClick={() => { setBaslangic(""); setBitis(""); }}>Temizle</button>
        )}
        {(slug === "yaslandirma" || slug === "risk-analizi") && (
          <span className="cv2-muted" style={{ fontSize: 12 }}>
            {bitis ? `${DATE(bitis)} sonu itibarıyla` : "Bugün itibarıyla"}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button className="cv2-btn cv2-btn--sm" disabled={busy} onClick={() => doExport("pdf")}>PDF</button>
        <button className="cv2-btn cv2-btn--sm" disabled={busy} onClick={() => doExport("excel")}>Excel</button>
        <button className="cv2-btn cv2-btn--sm" disabled={busy} onClick={() => doExport("csv")}>CSV</button>
      </div>
      {loading ? <div className="cv2-loading"><div className="cv2-spinner" />Rapor hazırlanıyor…</div> :
        !report || report.error ? <div className="cv2-empty">{report?.error || "Rapor verisi yok."}</div> : (
          <>
            {report.kpis?.length > 0 && (
              <div className="cv2-kpis">
                {report.kpis.map((k, i) => (
                  <div className="cv2-kpi" key={i}>
                    <span>{k.label}</span>
                    <strong>{k.format === "tl" ? TL(k.value) : k.format === "percent" ? `%${k.value}` : k.value}</strong>
                  </div>
                ))}
              </div>
            )}
            {report.rows?.length > 0 ? (
              <div className="cv2-tablewrap">
                <table className="cv2-table cv2-table--compact">
                  <thead><tr>{report.columns.map((c) => <th key={c.key} className={c.format === "tl" || c.format === "percent" ? "cv2-num" : ""}>{c.label}</th>)}</tr></thead>
                  <tbody>
                    {report.rows.map((row, i) => (
                      <tr key={i}>
                        {report.columns.map((c) => (
                          <td key={c.key} className={c.format === "tl" || c.format === "percent" ? "cv2-num" : ""}>
                            {c.format === "tl" ? TL(Number(row[c.key])) : c.format === "percent" ? `%${Number(row[c.key])}` : String(row[c.key] ?? "—")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="cv2-empty">Bu rapor için veri bulunamadı.</div>}
          </>
        )}
    </div>
  );
}

function YetkilerTab() {
  const [perms, setPerms] = useState<Awaited<ReturnType<typeof cariV2Service.yetkiler>> | null>(null);
  useEffect(() => { cariV2Service.yetkiler().then(setPerms).catch(() => setPerms(null)); }, []);
  if (!perms) return <div className="cv2-loading"><div className="cv2-spinner" />Yükleniyor…</div>;
  const items: [string, boolean][] = [
    ["Görüntüleme", perms.can_view], ["Oluşturma", perms.can_create], ["Düzenleme", perms.can_edit],
    ["Silme", perms.can_delete], ["Yönetim (tam yetki)", perms.can_manage], ["Dışa Aktarma", perms.can_export],
  ];
  return (
    <div>
      <div className="cv2-muted" style={{ marginBottom: 12 }}>
        Aktif rol: <strong>{perms.role_name || (perms.is_superuser ? "Süper Yönetici" : "—")}</strong>
      </div>
      <div className="cv2-formgrid">
        {items.map(([k, v]) => (
          <div className="cv2-metric" key={k}>
            <span>{k}</span>
            <strong className={v ? "cv2-pos" : "cv2-neg"}>{v ? "İzinli" : "Yetkisiz"}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
