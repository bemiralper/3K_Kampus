"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Table, Tag, Button, Input, Space, Empty, Tooltip, Pagination, Select, DatePicker,
  App as AntApp, Grid, Card,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { SearchOutlined, DollarOutlined, CloseOutlined } from "@ant-design/icons";
import type { Dayjs } from "dayjs";
import { useKurum } from "@/lib/contexts/KurumContext";
import { ggService } from "./gg-v2-api";
import {
  DATE, GGListItem, GGOdemeTakibiSatir, TL, odemeDurumRenk,
} from "./gg-v2-types";

const DURUM_OPTS = [
  { value: "", label: "Tümü" },
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
  { value: "", label: "Tümü" },
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

function kisalt(text: string, max = 56) {
  const t = (text || "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function fieldLabel(label: string, children: React.ReactNode) {
  return (
    <div style={{ minWidth: 160, flex: "1 1 160px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

export default function GiderOdemeTakibiPanel({
  kurumId, subeId, reloadTick, kategoriler = [], onOpenDetay, onOpenOde,
}: Props) {
  const { message } = AntApp.useApp();
  const screens = Grid.useBreakpoint();
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
  const [filtreSube, setFiltreSube] = useState<string>("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const showSube = (filteredSubeler?.length ?? 0) > 1 || globalSubeAccess;

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [debounced, durum, donem, ozelRange, odemeTipi, kategoriId, filtreSube, pageSize]);

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

  const columns: ColumnsType<GGOdemeTakibiSatir> = [
    {
      title: "Vade",
      dataIndex: "vade_tarihi",
      width: 120,
      render: (v: string | null) => (
        <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{DATE(v)}</span>
      ),
    },
    {
      title: "Gider",
      key: "gider",
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.gider_adi}</div>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>{r.gider.cari_hesap?.unvan || "—"}</div>
        </div>
      ),
    },
    {
      title: "Açıklama",
      dataIndex: "aciklama",
      ellipsis: true,
      render: (v: string, r) => {
        const text = v || "—";
        return (
          <Tooltip title={text}>
            <span style={{ color: r.aciklama_kaynak === "odeme" ? "#334155" : "#64748b" }}>
              {kisalt(text)}
            </span>
          </Tooltip>
        );
      },
    },
    {
      title: "Taksit",
      key: "taksit",
      width: 90,
      align: "center",
      render: (_, r) => r.taksit_label ? (
        <Tag color="blue" style={{ fontWeight: 700, margin: 0 }}>{r.taksit_label}</Tag>
      ) : <span style={{ color: "#94a3b8" }}>—</span>,
    },
    {
      title: "Tutar",
      dataIndex: "tutar",
      width: 130,
      align: "right",
      render: (v, r) => (
        <div>
          <strong>{TL(v)}</strong>
          {Number(r.odenen_tutar) > 0 && Number(r.kalan_tutar) > 0 ? (
            <div style={{ fontSize: 11, color: "#dc2626" }}>Kalan {TL(r.kalan_tutar)}</div>
          ) : null}
        </div>
      ),
    },
    {
      title: "Durum",
      dataIndex: "durum",
      width: 130,
      render: (_, r) => <Tag color={odemeDurumRenk(r.durum)}>{r.durum_label}</Tag>,
    },
    {
      title: "",
      key: "islem",
      width: 88,
      render: (_, r) => r.odenebilir_mi ? (
        <Button
          type="primary"
          size="small"
          icon={<DollarOutlined />}
          onClick={(e) => { e.stopPropagation(); onOpenOde(r.gider, r.taksit_id); }}
        >
          Öde
        </Button>
      ) : null,
    },
  ];

  return (
    <div>
      <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: 12 } }}>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Gider, tedarikçi veya açıklama ara..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ marginBottom: 12 }}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
          {fieldLabel("Durum", (
            <Select
              allowClear
              style={{ width: "100%" }}
              placeholder="Tümü"
              value={durum || undefined}
              onChange={(v) => setDurum(v ?? "")}
              options={DURUM_OPTS.filter((o) => o.value)}
            />
          ))}
          {fieldLabel("Ödeme Tarihi", (
            <Select
              allowClear
              style={{ width: "100%" }}
              placeholder="Tüm tarihler"
              value={donem || undefined}
              onChange={(v) => { setDonem(v ?? ""); if (v !== "ozel") setOzelRange(null); }}
              options={DONEM_OPTS.filter((o) => o.value)}
            />
          ))}
          {fieldLabel("Gider Türü", (
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ width: "100%" }}
              placeholder="Tüm türler"
              value={kategoriId}
              onChange={(v) => setKategoriId(v)}
              options={kategoriler.map((k) => ({ value: k.id, label: k.ad }))}
            />
          ))}
          {fieldLabel("Ödeme Tipi", (
            <Select
              allowClear
              style={{ width: "100%" }}
              placeholder="Tümü"
              value={odemeTipi || undefined}
              onChange={(v) => setOdemeTipi(v ?? "")}
              options={TIP_OPTS.filter((o) => o.value)}
            />
          ))}
          {showSube && fieldLabel("Şube", (
            <Select
              allowClear
              style={{ width: "100%" }}
              placeholder="Aktif şube"
              value={filtreSube || undefined}
              onChange={(v) => setFiltreSube(v ?? "")}
              options={[
                ...(globalSubeAccess || (filteredSubeler?.length ?? 0) > 1
                  ? [{ value: "all", label: "Tüm Şubeler" }]
                  : []),
                ...(filteredSubeler ?? []).map((s) => ({ value: String(s.id), label: s.ad })),
              ]}
            />
          ))}
        </div>
        {donem === "ozel" && (
          <DatePicker.RangePicker
            style={{ width: screens.md ? 320 : "100%", marginBottom: 10 }}
            format="DD.MM.YYYY"
            value={ozelRange}
            onChange={(v) => setOzelRange(v)}
            placeholder={["Başlangıç", "Bitiş"]}
          />
        )}
        <Space wrap size={[6, 6]} style={{ marginBottom: aktifChip.length ? 10 : 0 }}>
          {HIZLI.map((h) => (
            <Button
              key={h.key}
              size="small"
              type={aktifHizli === h.key ? "primary" : "default"}
              ghost={aktifHizli === h.key}
              onClick={() => hizliUygula(h.key)}
            >
              {h.label}
            </Button>
          ))}
        </Space>
        {aktifChip.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 10 }}>
            <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Aktif filtreler:</span>
            {aktifChip.map((c) => (
              <Tag
                key={c.key}
                closable
                closeIcon={<CloseOutlined />}
                onClose={(e) => { e.preventDefault(); c.clear(); }}
                style={{ marginInlineEnd: 0 }}
              >
                {c.label}
              </Tag>
            ))}
            <Button type="link" size="small" onClick={temizle}>Filtreleri Temizle</Button>
          </div>
        )}
      </Card>

      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        flexWrap: "wrap", gap: 8, marginBottom: 10,
      }}>
        <div style={{ color: "#334155", fontSize: 13 }}>
          <strong>{total}</strong> ödeme bulundu
          {total > 0 && (
            <span style={{ marginLeft: 10, color: "#0f172a", fontWeight: 800 }}>
              Toplam: {TL(toplamTutar)}
            </span>
          )}
        </div>
        <div style={{ color: "#64748b", fontSize: 12 }}>
          Vadeye göre sıralı. Satıra tıklayarak ödeme planını açın.
        </div>
      </div>

      <Table<GGOdemeTakibiSatir>
        rowKey="taksit_id"
        size="middle"
        loading={loading}
        columns={columns}
        dataSource={rows}
        pagination={false}
        locale={{ emptyText: <Empty description="Takip edilecek ödeme yok" /> }}
        scroll={{ x: 860 }}
        onRow={(r) => ({
          onClick: () => onOpenDetay(r.gider, r.taksit_id),
          style: { cursor: "pointer" },
        })}
      />
      {total > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "12px 0 0" }}>
          <Pagination
            current={page}
            pageSize={pageSize}
            total={total}
            showSizeChanger={!!screens.md}
            onChange={(p, ps) => { setPage(p); setPageSize(ps); }}
          />
        </div>
      )}
    </div>
  );
}
