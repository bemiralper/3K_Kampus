"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useKurum } from "@/lib/contexts/KurumContext";
import { useFinansPath } from "@/components/finans/FinansPathProvider";
import { cariV2Service, CariV2Dosya } from "../../services/cari-v2-api";
import {
  AylikNokta,
  CariV2Detail,
  CariV2Hareket,
  CariV2Panel,
  CariV2Report,
  RISK_META,
  turMeta,
} from "../../types/cari-v2-types";
import SerbestOdemeModal from "../SerbestOdemeModal";
import "../cari-v2.css";

const TL = (n: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(n || 0);
const DATE = (s: string | null) => (s ? new Date(s).toLocaleDateString("tr-TR") : "—");

// Export için değer biçimleyiciler (backend tabloyu olduğu gibi basar)
const EXP_MONEY = (v: unknown) => Number(v || 0).toFixed(2);
const EXP_DATE = (s: unknown) => (s ? new Date(String(s)).toLocaleDateString("tr-TR") : "");

type ExpFormat = "pdf" | "xlsx" | "csv";

async function downloadTabExport(
  cariId: number,
  kurumId: number,
  format: ExpFormat,
  title: string,
  columns: { key: string; label: string }[],
  rows: Record<string, unknown>[],
) {
  const { blob, filename } = await cariV2Service.tabExport(cariId, {
    format,
    orientation: "landscape",
    title,
    columns,
    rows,
    filters_meta: { kurum_id: kurumId, rapor_adi: title },
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || `${title}.${format}`;
  a.click();
  URL.revokeObjectURL(url);
}

function TabExportBar({
  cariId, kurumId, title, columns, rows,
}: {
  cariId: number; kurumId: number; title: string;
  columns: { key: string; label: string }[];
  rows: Record<string, unknown>[];
}) {
  const [busy, setBusy] = useState(false);
  const run = async (format: ExpFormat) => {
    if (!rows.length) return;
    setBusy(true);
    try { await downloadTabExport(cariId, kurumId, format, title, columns, rows); }
    catch (e) { alert(e instanceof Error ? e.message : "Dışa aktarma başarısız."); }
    finally { setBusy(false); }
  };
  return (
    <div className="cv2-toolbar" style={{ marginBottom: 10, justifyContent: "flex-end" }}>
      <span className="cv2-muted" style={{ fontSize: 12, marginRight: "auto" }}>{rows.length} kayıt</span>
      <button className="cv2-btn cv2-btn--sm" disabled={busy || !rows.length} onClick={() => run("pdf")}>PDF</button>
      <button className="cv2-btn cv2-btn--sm" disabled={busy || !rows.length} onClick={() => run("xlsx")}>Excel</button>
      <button className="cv2-btn cv2-btn--sm" disabled={busy || !rows.length} onClick={() => run("csv")}>CSV</button>
    </div>
  );
}

const REPORTS = [
  { slug: "ekstre", label: "Cari Ekstre", cariScoped: true },
  { slug: "hesap-ozeti", label: "Hesap Özeti" },
  { slug: "borc-listesi", label: "Borç Listesi" },
  { slug: "alacak-listesi", label: "Alacak Listesi" },
  { slug: "gelir-analizi", label: "Gelir Analizi" },
  { slug: "gider-analizi", label: "Gider Analizi" },
  { slug: "hareket-raporu", label: "Hareket Raporu", cariScoped: true },
  { slug: "yaslandirma", label: "Yaşlandırma" },
  { slug: "risk-analizi", label: "Risk Analizi" },
  { slug: "tahsilat-performansi", label: "Tahsilat Performansı" },
  { slug: "odeme-performansi", label: "Ödeme Performansı" },
];

type Tab = "genel" | "hareketler" | "gelirler" | "giderler" | "tahsilatlar" | "odemeler" | "dosyalar" | "notlar" | "raporlar" | "yetkiler";

export default function CariV2DetailClient({ cariId }: { cariId: number }) {
  const { activeKurum, activeSube } = useKurum();
  const { href } = useFinansPath();
  const router = useRouter();
  const kurumId = activeKurum?.id;
  const subeId = activeSube?.id ?? null;

  const [detail, setDetail] = useState<CariV2Detail | null>(null);
  const [panel, setPanel] = useState<CariV2Panel | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("genel");
  const [showSerbestOdeme, setShowSerbestOdeme] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [d, p] = await Promise.all([cariV2Service.get(cariId), cariV2Service.panel(cariId)]);
      setDetail(d);
      setPanel(p);
    } catch {
      /* keep existing */
    }
  }, [cariId]);

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

  return (
    <div className="cv2-page">
      {toast && (
        <div
          style={{
            position: "fixed",
            top: 20,
            right: 20,
            zIndex: 3000,
            background: "#059669",
            color: "white",
            padding: "12px 18px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            boxShadow: "0 8px 24px rgba(5, 150, 105, 0.35)",
          }}
        >
          {toast}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <button className="cv2-btn cv2-btn--sm" onClick={() => router.push(href("cari-hesaplar-v2"))}>
          ← Cari Listesi
        </button>
        <button
          type="button"
          className="cv2-btn cv2-btn--primary"
          onClick={() => setShowSerbestOdeme(true)}
        >
          Serbest Ödeme
        </button>
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
          <Metric label="Verecek (Borç)" value={TL(detail.acik_borc)} tone="neg" />
          <Metric label="Alacak" value={TL(detail.acik_alacak)} tone="pos" />
          {ozet && <Metric label="Vadesi Geçmiş" value={TL(ozet.vadesi_gecmis)} tone={ozet.vadesi_gecmis ? "neg" : undefined} />}
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
          {tab === "genel" && <GenelTab detail={detail} />}
          {tab === "hareketler" && <HareketlerTab cariId={cariId} kurumId={kurumId!} title={`${detail.gorunen_ad} — Hareketler`} />}
          {tab === "gelirler" && <TabTable cariId={cariId} kurumId={kurumId!} title={`${detail.gorunen_ad} — Gelirler`} tab="gelirler" columns={[["fatura_no", "Fatura No"], ["fatura_tarihi", "Tarih"], ["kategori", "Kategori"], ["net_tutar", "Tutar", true], ["tahsil_edilen", "Tahsil", true], ["kalan", "Kalan", true], ["durum", "Durum"]]} />}
          {tab === "giderler" && <TabTable cariId={cariId} kurumId={kurumId!} title={`${detail.gorunen_ad} — Giderler`} tab="giderler" columns={[["fatura_no", "Fatura No"], ["fatura_tarihi", "Tarih"], ["kategori", "Kategori"], ["net_tutar", "Tutar", true], ["odenen_toplam", "Ödenen", true], ["kalan", "Kalan", true], ["durum", "Durum"]]} />}
          {tab === "tahsilatlar" && <HareketlerTab cariId={cariId} kurumId={kurumId!} islemTuru="tahsilat" title={`${detail.gorunen_ad} — Tahsilatlar`} />}
          {tab === "odemeler" && <HareketlerTab cariId={cariId} kurumId={kurumId!} islemTuru="odeme,mahsup" title={`${detail.gorunen_ad} — Ödemeler`} />}
          {tab === "dosyalar" && <DosyalarTab cariId={cariId} />}
          {tab === "notlar" && <NotlarTab detail={detail} />}
          {tab === "raporlar" && <RaporlarTab cariId={cariId} kurumId={kurumId!} subeId={subeId} />}
          {tab === "yetkiler" && <YetkilerTab />}
        </div>
      </div>

      {showSerbestOdeme && (
        <SerbestOdemeModal
          cariHesapId={detail.id}
          cariHesapAdi={detail.gorunen_ad}
          bakiye={detail.bakiye}
          onClose={() => setShowSerbestOdeme(false)}
          onSuccess={(msg) => {
            setToast(msg);
            void reload();
          }}
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

function MiniChart({ data, gider }: { data: AylikNokta[]; gider?: boolean }) {
  if (!data.length) return <div className="cv2-muted" style={{ fontSize: 12 }}>Grafik verisi yok.</div>;
  const max = Math.max(...data.map((d) => d.toplam), 1);
  return (
    <div className="cv2-chart">
      {data.slice(-12).map((d) => (
        <div className="cv2-bar-wrap" key={d.ay}>
          <div className={`cv2-bar ${gider ? "cv2-bar--gider" : ""}`} style={{ height: `${(d.toplam / max) * 100}%` }} title={TL(d.toplam)} />
          <span className="cv2-bar-label">{d.ay.slice(2)}</span>
        </div>
      ))}
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
            <Metric label="Açık Alacak" value={TL(panel.musteri.acik_alacak)} tone="pos" />
          </div>
          <MiniChart data={panel.musteri.satis_analizi} />
        </div>
      )}
      {panel.tedarikci && (
        <div className="cv2-panel">
          <h3>Tedarikçi Özeti</h3>
          <div className="cv2-detail-metrics">
            <Metric label="Toplam Alış" value={TL(panel.tedarikci.toplam_alis)} />
            <Metric label="Toplam Ödeme" value={TL(panel.tedarikci.toplam_odeme)} tone="neg" />
            <Metric label="Açık Borç" value={TL(panel.tedarikci.acik_borc)} tone="neg" />
          </div>
          <MiniChart data={panel.tedarikci.tedarik_analizi} gider />
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
          <MiniChart data={panel.gelir.aylik_grafik} />
        </div>
      )}
      {panel.gider && (
        <div className="cv2-panel">
          <h3>Gider Analizi</h3>
          <div className="cv2-detail-metrics">
            <Metric label="Toplam Gider" value={TL(panel.gider.toplam_gider)} tone="neg" />
            <Metric label="Ödenen" value={TL(panel.gider.odenen)} tone="neg" />
            <Metric label="Kalan" value={TL(panel.gider.kalan)} />
            <Metric label="Onay Bekleyen" value={TL(panel.gider.onay_bekleyen)} />
          </div>
          <MiniChart data={panel.gider.aylik_grafik} gider />
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

function HareketlerTab({ cariId, kurumId, islemTuru, title }: { cariId: number; kurumId: number; islemTuru?: string; title: string }) {
  const [rows, setRows] = useState<CariV2Hareket[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await cariV2Service.hareketler(cariId, { page_size: 200, islem_turu: islemTuru });
        setRows(res.results);
      } catch { setRows([]); } finally { setLoading(false); }
    })();
  }, [cariId, islemTuru]);
  if (loading) return <div className="cv2-loading"><div className="cv2-spinner" />Yükleniyor…</div>;
  if (!rows.length) return <div className="cv2-empty">Hareket bulunamadı.</div>;

  const exportColumns = [
    { key: "islem_tarihi", label: "Tarih" },
    { key: "islem_turu", label: "İşlem" },
    { key: "aciklama", label: "Açıklama" },
    { key: "belge_no", label: "Belge" },
    { key: "borc", label: "Borç" },
    { key: "alacak", label: "Alacak" },
    { key: "bakiye", label: "Bakiye" },
  ];
  const exportRows = rows.map((h) => ({
    islem_tarihi: EXP_DATE(h.islem_tarihi),
    islem_turu: h.islem_turu_display,
    aciklama: h.aciklama || "",
    belge_no: h.belge_no || "",
    borc: h.yon === "borc" ? EXP_MONEY(h.tutar) : "",
    alacak: h.yon === "alacak" ? EXP_MONEY(h.tutar) : "",
    bakiye: EXP_MONEY(h.bakiye_sonrasi),
  }));

  return (
    <div>
      <TabExportBar cariId={cariId} kurumId={kurumId} title={title} columns={exportColumns} rows={exportRows} />
      <div className="cv2-tablewrap">
        <table className="cv2-table cv2-table--compact">
          <thead><tr><th>Tarih</th><th>İşlem</th><th>Açıklama</th><th>Belge</th><th className="cv2-num">Borç</th><th className="cv2-num">Alacak</th><th className="cv2-num">Bakiye</th></tr></thead>
          <tbody>
            {rows.map((h) => (
              <tr key={h.id}>
                <td>{DATE(h.islem_tarihi)}</td>
                <td>{h.islem_turu_display}</td>
                <td>{h.aciklama || "—"}</td>
                <td>{h.belge_no || "—"}</td>
                <td className="cv2-num">{h.yon === "borc" ? TL(h.tutar) : "—"}</td>
                <td className="cv2-num">{h.yon === "alacak" ? TL(h.tutar) : "—"}</td>
                <td className="cv2-num">{TL(h.bakiye_sonrasi)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TabTable({ cariId, kurumId, title, tab, columns }: { cariId: number; kurumId: number; title: string; tab: string; columns: [string, string, boolean?][] }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      setLoading(true);
      try { setRows((await cariV2Service.tab(cariId, tab)) as Record<string, unknown>[]); }
      catch { setRows([]); } finally { setLoading(false); }
    })();
  }, [cariId, tab]);
  if (loading) return <div className="cv2-loading"><div className="cv2-spinner" />Yükleniyor…</div>;
  if (!rows.length) return <div className="cv2-empty">Kayıt bulunamadı.</div>;

  const exportColumns = columns.map(([key, label]) => ({ key, label }));
  const exportRows = rows.map((r) => {
    const out: Record<string, unknown> = {};
    for (const [key, , num] of columns) {
      out[key] = num ? EXP_MONEY(r[key]) : key.includes("tarih") ? EXP_DATE(r[key]) : String(r[key] ?? "");
    }
    return out;
  });

  return (
    <div>
      <TabExportBar cariId={cariId} kurumId={kurumId} title={title} columns={exportColumns} rows={exportRows} />
      <div className="cv2-tablewrap">
        <table className="cv2-table cv2-table--compact">
          <thead><tr>{columns.map(([, label, num]) => <th key={label} className={num ? "cv2-num" : ""}>{label}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {columns.map(([key, label, num]) => (
                  <td key={label} className={num ? "cv2-num" : ""}>
                    {num ? TL(Number(r[key])) : key.includes("tarih") ? DATE(String(r[key])) : String(r[key] ?? "—")}
                  </td>
                ))}
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
  const [report, setReport] = useState<CariV2Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setReport(null);
    const def = REPORTS.find((r) => r.slug === slug);
    const params: Record<string, string> = def?.cariScoped ? { cari_hesap_id: String(cariId) } : {};
    try { setReport(await cariV2Service.report(slug, kurumId, subeId, params)); }
    catch { setReport(null); } finally { setLoading(false); }
  }, [slug, cariId, kurumId, subeId]);
  useEffect(() => { load(); }, [load]);

  const doExport = async (format: "pdf" | "excel" | "csv") => {
    const def = REPORTS.find((r) => r.slug === slug);
    const params: Record<string, string> = def?.cariScoped ? { cari_hesap_id: String(cariId) } : {};
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
      <div className="cv2-toolbar" style={{ marginBottom: 14 }}>
        <select className="cv2-btn" value={slug} onChange={(e) => setSlug(e.target.value)}>
          {REPORTS.map((r) => <option key={r.slug} value={r.slug}>{r.label}</option>)}
        </select>
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
