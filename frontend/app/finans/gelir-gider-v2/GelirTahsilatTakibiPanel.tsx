"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DatePicker, App as AntApp } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import FinansCariHesapCell from "@/components/finans/FinansCariHesapCell";
import { ggService } from "./gg-v2-api";
import { DATE, GGFilters, GGListItem, TL } from "./gg-v2-types";
import "./gider-odeme-takibi.css";

/** Backend `tahsil_durumu` filtresi; "bekleyen" = onaylı + kısmi tahsil (açık kayıtlar). */
const DURUM_OPTS = [
  { value: "bekleyen", label: "Tüm açık tahsilatlar" },
  { value: "gecikti", label: "Gecikmiş" },
  { value: "kismi", label: "Kısmi Tahsil" },
  { value: "ileri_tarihli", label: "İleri Tarihli" },
  { value: "tamamlanan", label: "Tahsil Edildi" },
];

const DONEM_OPTS = [
  { value: "", label: "Tüm vadeler" },
  { value: "bugun", label: "Bugün" },
  { value: "7gun", label: "Önümüzdeki 7 Gün" },
  { value: "bu_ay", label: "Bu Ay" },
  { value: "gelecek_ay", label: "Gelecek Ay" },
  { value: "ozel", label: "Özel Tarih Aralığı" },
];

const HIZLI: { key: string; label: string }[] = [
  { key: "tumu", label: "Tüm Açıklar" },
  { key: "gecikti", label: "Gecikenler" },
  { key: "bugun", label: "Bugün" },
  { key: "7gun", label: "7 Gün" },
  { key: "bu_ay", label: "Bu Ay" },
];

const DONEM_LABEL: Record<string, string> = Object.fromEntries(DONEM_OPTS.map((o) => [o.value, o.label]));
const DURUM_LABEL: Record<string, string> = Object.fromEntries(DURUM_OPTS.map((o) => [o.value, o.label]));

const ISO = "YYYY-MM-DD";

function vadeAraligi(donem: string, ozel: [Dayjs | null, Dayjs | null] | null): Pick<GGFilters, "vade_baslangic" | "vade_bitis"> {
  const bugun = dayjs();
  switch (donem) {
    case "bugun":
      return { vade_baslangic: bugun.format(ISO), vade_bitis: bugun.format(ISO) };
    case "7gun":
      return { vade_baslangic: bugun.format(ISO), vade_bitis: bugun.add(7, "day").format(ISO) };
    case "bu_ay":
      return { vade_baslangic: bugun.startOf("month").format(ISO), vade_bitis: bugun.endOf("month").format(ISO) };
    case "gelecek_ay": {
      const ay = bugun.add(1, "month");
      return { vade_baslangic: ay.startOf("month").format(ISO), vade_bitis: ay.endOf("month").format(ISO) };
    }
    case "ozel":
      return {
        vade_baslangic: ozel?.[0]?.format(ISO),
        vade_bitis: ozel?.[1]?.format(ISO),
      };
    default:
      return {};
  }
}

function vadeMeta(vade: string | null, acik: boolean) {
  if (!vade) return { tone: "secondary" as const, label: "—", row: "" };
  if (!acik) return { tone: "success" as const, label: "Tahsil edildi", row: "" };
  const days = dayjs(vade).startOf("day").diff(dayjs().startOf("day"), "day");
  if (days < 0) return { tone: "danger" as const, label: `${Math.abs(days)} gün gecikti`, row: "got-row--late" };
  if (days === 0) return { tone: "warning" as const, label: "Bugün", row: "got-row--today" };
  if (days <= 7) return { tone: "warning" as const, label: `${days} gün kaldı`, row: "" };
  return { tone: "info" as const, label: `${days} gün kaldı`, row: "" };
}

function durumBadge(durum: string | undefined) {
  if (durum === "gecikti") return "danger";
  if (durum === "kismi_tahsil") return "warning";
  if (durum === "tahsil_edildi") return "success";
  if (durum === "ileri_tarihli") return "info";
  if (durum === "iptal") return "secondary";
  return "primary";
}

interface Props {
  kurumId: number;
  subeId: number | null;
  reloadTick: number;
  onOpenDetay: (row: GGListItem) => void;
  onOpenTahsil: (row: GGListItem) => void;
}

export default function GelirTahsilatTakibiPanel({ kurumId, subeId, reloadTick, onOpenDetay, onOpenTahsil }: Props) {
  const { message } = AntApp.useApp();
  const [rows, setRows] = useState<GGListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [toplamKalan, setToplamKalan] = useState("0");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [durum, setDurum] = useState("bekleyen");
  const [donem, setDonem] = useState("");
  const [ozelRange, setOzelRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debounced, durum, donem, ozelRange, pageSize]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const filters: GGFilters = {
        tahsil_durumu: durum,
        ...vadeAraligi(donem, ozelRange),
        ...(debounced ? { arama: debounced } : {}),
      };
      const res = await ggService.list("gelir", {
        kurum_id: kurumId,
        sube_id: subeId,
        page,
        page_size: pageSize,
        sort: "vade_tarihi",
        filters,
      });
      setRows(res.results);
      setTotal(res.total);
      setToplamKalan(res.totals?.toplam_kalan || "0");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Tahsilat takibi yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [kurumId, subeId, page, pageSize, debounced, durum, donem, ozelRange, message]);

  useEffect(() => { load(); }, [load, reloadTick]);

  const temizle = () => {
    setSearch("");
    setDebounced("");
    setDurum("bekleyen");
    setDonem("");
    setOzelRange(null);
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
    setDurum("bekleyen");
    setDonem(key);
    setOzelRange(null);
  };

  const aktifHizli = useMemo(() => {
    if (debounced) return "";
    if (durum === "bekleyen" && !donem) return "tumu";
    if (durum === "gecikti" && !donem) return "gecikti";
    if (durum === "bekleyen" && ["bugun", "7gun", "bu_ay"].includes(donem)) return donem;
    return "";
  }, [durum, donem, debounced]);

  const aktifChip: { key: string; label: string; clear: () => void }[] = [];
  if (debounced) aktifChip.push({ key: "q", label: `“${debounced}”`, clear: () => { setSearch(""); setDebounced(""); } });
  if (durum !== "bekleyen") aktifChip.push({ key: "durum", label: DURUM_LABEL[durum] || durum, clear: () => setDurum("bekleyen") });
  if (donem === "ozel" && ozelRange?.[0] && ozelRange?.[1]) {
    aktifChip.push({
      key: "donem",
      label: `${ozelRange[0].format("DD.MM.YYYY")} – ${ozelRange[1].format("DD.MM.YYYY")}`,
      clear: () => { setDonem(""); setOzelRange(null); },
    });
  } else if (donem) {
    aktifChip.push({ key: "donem", label: DONEM_LABEL[donem] || donem, clear: () => { setDonem(""); setOzelRange(null); } });
  }

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
          Tahsilat Takibi
          {total > 0 && <span className="badge-modern primary">{total}</span>}
        </h3>
        <div className="card-modern-header-actions">
          <div className="search-modern">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="search"
              placeholder="Müşteri, belge no veya açıklama ara..."
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
          {total > 0 && <span className="badge-modern success">Kalan: {TL(toplamKalan)}</span>}
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
            placeholder={["Vade başlangıç", "Vade bitiş"]}
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
          <h4>Takip edilecek tahsilat yok</h4>
          <p>Filtrelere uygun vadesi gelen veya bekleyen tahsilat bulunamadı.</p>
        </div>
      ) : (
        <div className="card-modern-body">
          <table className="table-modern">
            <thead>
              <tr>
                <th>Müşteri / Gelir</th>
                <th>Belge</th>
                <th>Vade</th>
                <th>Kalan Gün</th>
                <th style={{ textAlign: "right" }}>Tutar</th>
                <th style={{ textAlign: "right" }}>Tahsil Edilen</th>
                <th style={{ textAlign: "right" }}>Kalan</th>
                <th>Durum</th>
                <th style={{ width: 92 }}>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const acik = Number(r.kalan_tutar) > 0;
                const vade = vadeMeta(r.vade_tarihi, acik);
                const no = r.belge_no || r.islem_belge_no || r.fatura_no;
                return (
                  <tr key={r.id} className={vade.row} onClick={() => onOpenDetay(r)}>
                    <td data-label="Müşteri / Gelir">
                      <FinansCariHesapCell
                        name={r.cari_hesap?.unvan || r.gelir_kategorisi?.ad || "—"}
                        subtitle={r.aciklama || r.gelir_kategorisi?.ad || null}
                      />
                    </td>
                    <td data-label="Belge">{no || <span style={{ color: "#94a3b8" }}>—</span>}</td>
                    <td data-label="Vade">
                      <span className="date-text" style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                        {DATE(r.vade_tarihi)}
                      </span>
                    </td>
                    <td data-label="Kalan Gün">
                      <span className={`badge-modern ${vade.tone}`}>{vade.label}</span>
                    </td>
                    <td className="got-num" data-label="Tutar">{TL(r.net_tutar)}</td>
                    <td className="got-num" data-label="Tahsil Edilen" style={{ color: "#059669" }}>{TL(r.tahsil_edilen)}</td>
                    <td className="got-num" data-label="Kalan" style={{ fontWeight: 700, color: acik ? "#dc2626" : "#059669" }}>
                      {TL(r.kalan_tutar)}
                    </td>
                    <td data-label="Durum">
                      <span className={`badge-modern ${durumBadge(r.tahsil_durumu)}`}>{r.tahsil_durumu_label || r.durum_label}</span>
                    </td>
                    <td data-label="İşlem">
                      {r.tahsil_edilebilir_mi ? (
                        <button
                          type="button"
                          className="got-ode"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenTahsil(r);
                          }}
                        >
                          Tahsil Et
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
            {startItem}–{endItem} / {total} tahsilat
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
