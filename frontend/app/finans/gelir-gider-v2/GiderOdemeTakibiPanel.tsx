"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DatePicker, App as AntApp } from "antd";
import type { Dayjs } from "dayjs";
import { useKurum } from "@/lib/contexts/KurumContext";
import FinansCariHesapCell from "@/components/finans/FinansCariHesapCell";
import { ggService } from "./gg-v2-api";
import { DATE, GGListItem, GGOdemeTakibiSatir, TL } from "./gg-v2-types";
import "./gider-odeme-takibi.css";

const DURUM_OPTS = [
  { value: "", label: "Tüm durumlar" },
  { value: "gecikti", label: "Gecikmiş" },
  { value: "bugun", label: "Bugün" },
  { value: "yaklasiyor", label: "Yaklaşan" },
  { value: "bekliyor", label: "Bekliyor" },
  { value: "kismi_odendi", label: "Kısmi Ödendi" },
  { value: "odendi", label: "Ödendi" },
];

const DONEM_OPTS = [
  { value: "", label: "Tüm tarihler" },
  { value: "bugun", label: "Bugün" },
  { value: "7gun", label: "Önümüzdeki 7 Gün" },
  { value: "bu_hafta", label: "Bu Hafta" },
  { value: "bu_ay", label: "Bu Ay" },
  { value: "gelecek_ay", label: "Gelecek Ay" },
  { value: "ozel", label: "Özel Tarih Aralığı" },
];

const TIP_OPTS = [
  { value: "", label: "Tüm tipler" },
  { value: "tek", label: "Tek Ödeme" },
  { value: "taksitli", label: "Taksitli" },
];

const HIZLI: { key: string; label: string }[] = [
  { key: "tumu", label: "Tümü" },
  { key: "gecikti", label: "Gecikenler" },
  { key: "bugun", label: "Bugün" },
  { key: "7gun", label: "7 Gün" },
  { key: "bu_ay", label: "Bu Ay" },
  { key: "taksitli", label: "Taksitliler" },
];

const DONEM_LABEL: Record<string, string> = Object.fromEntries(DONEM_OPTS.map((o) => [o.value, o.label]));
const DURUM_LABEL: Record<string, string> = Object.fromEntries(DURUM_OPTS.map((o) => [o.value, o.label]));
const TIP_LABEL: Record<string, string> = Object.fromEntries(TIP_OPTS.map((o) => [o.value, o.label]));

interface Props {
  kurumId: number;
  subeId: number | null;
  reloadTick: number;
  kategoriler?: { id: number; ad: string; parent_id: number | null }[];
  onOpenDetay: (row: GGListItem, taksitId: number) => void;
  onOpenOde: (row: GGListItem, taksitId: number) => void;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function vadeMeta(vade: string | null) {
  if (!vade) return { tone: "secondary" as const, label: "—", row: "" };
  const days = Math.round((startOfDay(new Date(vade)) - startOfDay(new Date())) / 86400000);
  if (days < 0) return { tone: "danger" as const, label: `${Math.abs(days)} gün gecikti`, row: "got-row--late" };
  if (days === 0) return { tone: "warning" as const, label: "Bugün", row: "got-row--today" };
  if (days <= 7) return { tone: "warning" as const, label: `${days} gün kaldı`, row: "" };
  return { tone: "info" as const, label: `${days} gün kaldı`, row: "" };
}

function durumBadge(durum: string) {
  if (durum.includes("gecik")) return "danger";
  if (durum === "bugun") return "warning";
  if (durum.includes("yaklas")) return "info";
  if (durum === "odendi" || (durum.includes("odendi") && !durum.includes("kismi"))) return "success";
  if (durum.includes("kismi")) return "warning";
  if (durum.includes("iptal")) return "secondary";
  return "primary";
}

function belgeNo(r: GGOdemeTakibiSatir) {
  return r.gider.belge_no || r.gider.islem_belge_no || r.gider.fatura_no || null;
}

export default function GiderOdemeTakibiPanel({
  kurumId, subeId, reloadTick, kategoriler = [], onOpenDetay, onOpenOde,
}: Props) {
  const { message } = AntApp.useApp();
  const { filteredSubeler, globalSubeAccess } = useKurum();
  const [rows, setRows] = useState<GGOdemeTakibiSatir[]>([]);
  const [total, setTotal] = useState(0);
  const [toplamTutar, setToplamTutar] = useState("0");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [durum, setDurum] = useState("");
  const [donem, setDonem] = useState("");
  const [ozelRange, setOzelRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [odemeTipi, setOdemeTipi] = useState("");
  const [kategoriId, setKategoriId] = useState<number | undefined>();
  const [filtreSube, setFiltreSube] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const showSube = (filteredSubeler?.length ?? 0) > 1 || globalSubeAccess;

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debounced, durum, donem, ozelRange, odemeTipi, kategoriId, filtreSube, pageSize]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await ggService.odemeTakibi({
        kurum_id: kurumId,
        sube_id: subeId,
        page,
        page_size: pageSize,
        arama: debounced || undefined,
        durum: durum || undefined,
        donem: donem || undefined,
        odeme_tipi: odemeTipi || undefined,
        gider_kategorisi_id: kategoriId,
        filtre_sube_id: filtreSube || undefined,
        baslangic: donem === "ozel" && ozelRange?.[0] ? ozelRange[0].format("YYYY-MM-DD") : undefined,
        bitis: donem === "ozel" && ozelRange?.[1] ? ozelRange[1].format("YYYY-MM-DD") : undefined,
      });
      setRows(res.results);
      setTotal(res.total);
      setToplamTutar(res.toplam_tutar || "0");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Ödeme takibi yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [kurumId, subeId, page, pageSize, debounced, durum, donem, ozelRange, odemeTipi, kategoriId, filtreSube, message]);

  useEffect(() => { load(); }, [load, reloadTick]);

  const temizle = () => {
    setSearch("");
    setDebounced("");
    setDurum("");
    setDonem("");
    setOzelRange(null);
    setOdemeTipi("");
    setKategoriId(undefined);
    setFiltreSube("");
    setPage(1);
  };

  const hizliUygula = (key: string) => {
    if (key === "tumu") {
      temizle();
      return;
    }
    if (key === "gecikti") {
      setDurum("gecikti");
      setDonem("");
      setOzelRange(null);
      return;
    }
    if (key === "taksitli") {
      setOdemeTipi("taksitli");
      return;
    }
    setDonem(key);
    if (key !== "ozel") setOzelRange(null);
  };

  const aktifHizli = useMemo(() => {
    if (!durum && !donem && !odemeTipi && !kategoriId && !filtreSube && !debounced) return "tumu";
    if (durum === "gecikti" && !donem) return "gecikti";
    if (donem === "bugun" && !durum) return "bugun";
    if (donem === "7gun") return "7gun";
    if (donem === "bu_ay") return "bu_ay";
    if (odemeTipi === "taksitli" && !durum && !donem) return "taksitli";
    return "";
  }, [durum, donem, odemeTipi, kategoriId, filtreSube, debounced]);

  const kategoriAd = kategoriler.find((k) => k.id === kategoriId)?.ad;
  const subeAd = filtreSube === "all"
    ? "Tüm Şubeler"
    : filteredSubeler.find((s) => String(s.id) === filtreSube)?.ad;

  const aktifChip: { key: string; label: string; clear: () => void }[] = [];
  if (debounced) aktifChip.push({ key: "q", label: `“${debounced}”`, clear: () => { setSearch(""); setDebounced(""); } });
  if (durum) aktifChip.push({ key: "durum", label: DURUM_LABEL[durum] || durum, clear: () => setDurum("") });
  if (donem === "ozel" && ozelRange?.[0] && ozelRange?.[1]) {
    aktifChip.push({
      key: "donem",
      label: `${ozelRange[0].format("DD.MM.YYYY")} – ${ozelRange[1].format("DD.MM.YYYY")}`,
      clear: () => { setDonem(""); setOzelRange(null); },
    });
  } else if (donem) {
    aktifChip.push({ key: "donem", label: DONEM_LABEL[donem] || donem, clear: () => { setDonem(""); setOzelRange(null); } });
  }
  if (odemeTipi) aktifChip.push({ key: "tip", label: TIP_LABEL[odemeTipi] || odemeTipi, clear: () => setOdemeTipi("") });
  if (kategoriId) aktifChip.push({ key: "kat", label: kategoriAd || "Kategori", clear: () => setKategoriId(undefined) });
  if (filtreSube) aktifChip.push({ key: "sube", label: subeAd || "Şube", clear: () => setFiltreSube("") });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  return (
    <div className="card-modern got-panel">
      <div className="card-modern-header">
        <h3>
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Ödeme Takibi
          {total > 0 && <span className="badge-modern primary">{total}</span>}
        </h3>
        <div className="card-modern-header-actions">
          <div className="search-modern">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="search"
              placeholder="Gider, tedarikçi veya açıklama ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className="got-select" value={durum} onChange={(e) => setDurum(e.target.value)}>
            {DURUM_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select
            className="got-select"
            value={donem}
            onChange={(e) => {
              setDonem(e.target.value);
              if (e.target.value !== "ozel") setOzelRange(null);
            }}
          >
            {DONEM_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select
            className="got-select"
            value={kategoriId ?? ""}
            onChange={(e) => setKategoriId(e.target.value ? Number(e.target.value) : undefined)}
          >
            <option value="">Tüm türler</option>
            {kategoriler.map((k) => <option key={k.id} value={k.id}>{k.ad}</option>)}
          </select>
          <select className="got-select" value={odemeTipi} onChange={(e) => setOdemeTipi(e.target.value)}>
            {TIP_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {showSube && (
            <select className="got-select" value={filtreSube} onChange={(e) => setFiltreSube(e.target.value)}>
              <option value="">Aktif şube</option>
              {(globalSubeAccess || (filteredSubeler?.length ?? 0) > 1) && (
                <option value="all">Tüm Şubeler</option>
              )}
              {(filteredSubeler ?? []).map((s) => (
                <option key={s.id} value={String(s.id)}>{s.ad}</option>
              ))}
            </select>
          )}
          {total > 0 && <span className="badge-modern danger">Toplam: {TL(toplamTutar)}</span>}
        </div>
      </div>

      <div className="got-chips">
        {HIZLI.map((h) => (
          <button
            key={h.key}
            type="button"
            className={`got-chip${aktifHizli === h.key ? " got-chip--on" : ""}`}
            onClick={() => hizliUygula(h.key)}
          >
            {h.label}
          </button>
        ))}
      </div>

      {donem === "ozel" && (
        <div className="got-range">
          <DatePicker.RangePicker
            style={{ width: "min(360px, 100%)" }}
            format="DD.MM.YYYY"
            value={ozelRange}
            onChange={(v) => setOzelRange(v)}
            placeholder={["Başlangıç", "Bitiş"]}
          />
        </div>
      )}

      {aktifChip.length > 0 && (
        <div className="got-active">
          {aktifChip.map((c) => (
            <span key={c.key} className="got-tag">
              {c.label}
              <button type="button" onClick={c.clear} aria-label="Filtreyi kaldır">×</button>
            </span>
          ))}
          <button type="button" onClick={temizle}>Filtreleri temizle</button>
        </div>
      )}

      {loading ? (
        <div className="got-loading">
          <div className="got-spin" />
          Yükleniyor...
        </div>
      ) : rows.length === 0 ? (
        <div className="empty-state got-empty">
          <div className="empty-state-icon">📅</div>
          <h4>Takip edilecek ödeme yok</h4>
          <p>Filtrelere uygun vadesi gelen veya bekleyen ödeme bulunamadı.</p>
        </div>
      ) : (
        <div className="card-modern-body">
          <table className="table-modern">
            <thead>
              <tr>
                <th>Tedarikçi / Gider</th>
                <th>Taksit</th>
                <th>Vade</th>
                <th>Kalan Gün</th>
                <th style={{ textAlign: "right" }}>Tutar</th>
                <th style={{ textAlign: "right" }}>Ödenen</th>
                <th style={{ textAlign: "right" }}>Kalan</th>
                <th>Durum</th>
                <th style={{ width: 92 }}>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const vade = vadeMeta(r.vade_tarihi);
                const no = belgeNo(r);
                const sub = [r.gider_adi, no].filter(Boolean).join(" · ");
                return (
                  <tr
                    key={r.taksit_id}
                    className={vade.row}
                    onClick={() => onOpenDetay(r.gider, r.taksit_id)}
                  >
                    <td data-label="Tedarikçi / Gider">
                      <FinansCariHesapCell
                        name={r.gider.cari_hesap?.unvan || r.gider_adi || "—"}
                        subtitle={sub !== (r.gider.cari_hesap?.unvan || "") ? sub : r.aciklama || null}
                      />
                      {r.aciklama && r.gider.cari_hesap?.unvan ? (
                        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4, maxWidth: 320 }}>
                          {r.aciklama}
                        </div>
                      ) : null}
                    </td>
                    <td data-label="Taksit">
                      {r.taksit_label
                        ? <span className="badge-modern info">{r.taksit_label}</span>
                        : <span style={{ color: "#94a3b8" }}>—</span>}
                    </td>
                    <td data-label="Vade">
                      <span className="date-text" style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                        {DATE(r.vade_tarihi)}
                      </span>
                    </td>
                    <td data-label="Kalan Gün">
                      <span className={`badge-modern ${vade.tone}`}>{vade.label}</span>
                    </td>
                    <td className="got-num" data-label="Tutar">{TL(r.tutar)}</td>
                    <td className="got-num" data-label="Ödenen" style={{ color: "#059669" }}>{TL(r.odenen_tutar)}</td>
                    <td className="got-num" data-label="Kalan" style={{ fontWeight: 700, color: Number(r.kalan_tutar) > 0 ? "#dc2626" : "#059669" }}>
                      {TL(r.kalan_tutar)}
                    </td>
                    <td data-label="Durum">
                      <span className={`badge-modern ${durumBadge(r.durum)}`}>{r.durum_label}</span>
                    </td>
                    <td data-label="İşlem">
                      {r.odenebilir_mi ? (
                        <button
                          type="button"
                          className="got-ode"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenOde(r.gider, r.taksit_id);
                          }}
                        >
                          Öde
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {total > 0 && (
        <div className="got-pager">
          <div className="got-pager__info">
            {startItem}–{endItem} / {total} ödeme
          </div>
          <div className="got-pager__nav">
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              aria-label="Sayfa boyutu"
            >
              {[15, 25, 50, 100].map((n) => (
                <option key={n} value={n}>{n} / sayfa</option>
              ))}
            </select>
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</button>
            <button type="button" className="got-on">{page} / {totalPages}</button>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>›</button>
          </div>
        </div>
      )}
    </div>
  );
}
