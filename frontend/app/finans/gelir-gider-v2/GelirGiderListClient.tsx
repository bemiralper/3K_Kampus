"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Table,
  Card,
  Row,
  Col,
  Statistic,
  Button,
  Input,
  Segmented,
  Space,
  Tag,
  Dropdown,
  Checkbox,
  Select,
  DatePicker,
  InputNumber,
  Empty,
  Drawer,
  Modal,
  Tooltip,
  Popconfirm,
  Alert,
  App as AntApp,
  Grid,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { MenuProps } from "antd";
import type { DefaultOptionType } from "antd/es/select";
import {
  PlusOutlined,
  ReloadOutlined,
  FilterOutlined,
  SettingOutlined,
  SearchOutlined,
  DownloadOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  StopOutlined,
  TableOutlined,
  AppstoreOutlined,
  BarsOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import Link from "next/link";
import { useKurum } from "@/lib/contexts/KurumContext";
import { useFinansPath } from "@/components/finans/FinansPathProvider";
import { ggService } from "./gg-v2-api";
import { cekSenetV2Service } from "../services/cek-senet-v2-api";
import type { CekSenetV2Dashboard } from "../types/cek-senet-v2-types";
import { fmtTL } from "@/components/finans/FinansFilterBar";
import {
  DATE,
  GGDashboard,
  GGDropdown,
  GGFilters,
  GGListItem,
  GGModul,
  TL,
} from "./gg-v2-types";
import { ModulConfig, getConfig, ikinciTanimOf, kategoriOf } from "./gg-config";
import GelirGiderFormDrawer from "./GelirGiderFormDrawer";
import GiderOdemeDrawer from "./GiderOdemeDrawer";
import GelirTahsilatDrawer from "./GelirTahsilatDrawer";
import { FinansHttpError } from "../services/finans-http";
import { DollarOutlined } from "@ant-design/icons";

type ViewMode = "table" | "compact" | "card";

interface ColDef {
  key: string;
  label: string;
  num?: boolean;
}

function columnDefs(cfg: ModulConfig): ColDef[] {
  return [
    { key: "belge", label: "Belge / Cari" },
    { key: "kategori", label: cfg.kategoriLabel },
    { key: "ikinci", label: cfg.ikinciTanimLabel },
    { key: "tarih", label: "Tarih" },
    { key: "vade", label: "Vade" },
    { key: "net_tutar", label: "Net Tutar", num: true },
    { key: "kdv_tutar", label: "KDV", num: true },
    { key: "odenen", label: cfg.odenenLabel, num: true },
    { key: "kalan_tutar", label: "Kalan", num: true },
    { key: "durum", label: "Durum" },
    { key: "etiketler", label: "Etiketler" },
    { key: "olusturan", label: "Kullanıcı" },
    { key: "islemler", label: "" },
  ];
}

const DEFAULT_VISIBLE = [
  "belge", "kategori", "tarih", "net_tutar", "odenen", "kalan_tutar", "durum", "islemler",
];

const durumRenk = (durum: string): string => {
  if (durum.includes("tahsil_edildi") || durum.includes("odendi")) return "green";
  if (durum.includes("kismi")) return "gold";
  if (durum.includes("iptal")) return "red";
  if (durum.includes("onay")) return "blue";
  return "default";
};

export default function GelirGiderListClient({ modul }: { modul: GGModul }) {
  const cfg = useMemo(() => getConfig(modul), [modul]);
  const COL_KEY = `gg_${modul}_columns`;
  const VIEW_KEY = `gg_${modul}_view`;
  const SAVED_KEY = `gg_${modul}_savedviews`;

  const { message, modal } = AntApp.useApp();
  const { activeKurum, activeSube } = useKurum();
  const { homeHref } = useFinansPath();
  const screens = Grid.useBreakpoint();
  const kurumId = activeKurum?.id;
  const subeId = activeSube?.id ?? null;

  const [dashboard, setDashboard] = useState<GGDashboard | null>(null);
  const [cekPortfoy, setCekPortfoy] = useState<CekSenetV2Dashboard["kpi"] | null>(null);
  const [dropdown, setDropdown] = useState<GGDropdown | null>(null);
  const [items, setItems] = useState<GGListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [visibleCols, setVisibleCols] = useState<string[]>(DEFAULT_VISIBLE);

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filters, setFilters] = useState<GGFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState<string>("-fatura_tarihi");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<GGListItem | null>(null);
  const [odemeRow, setOdemeRow] = useState<GGListItem | null>(null);
  const [savedViews, setSavedViews] = useState<{ ad: string; filters: GGFilters; sort: string }[]>([]);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; row: GGListItem } | null>(null);

  // localStorage tercihleri
  useEffect(() => {
    try {
      const c = localStorage.getItem(COL_KEY);
      if (c) setVisibleCols(JSON.parse(c));
      const v = localStorage.getItem(VIEW_KEY) as ViewMode | null;
      if (v) setViewMode(v);
      const s = localStorage.getItem(SAVED_KEY);
      if (s) setSavedViews(JSON.parse(s));
    } catch {
      /* yoksay */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modul]);
  useEffect(() => { localStorage.setItem(COL_KEY, JSON.stringify(visibleCols)); }, [visibleCols, COL_KEY]);
  useEffect(() => { localStorage.setItem(VIEW_KEY, viewMode); }, [viewMode, VIEW_KEY]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => { setPage(1); }, [debounced, filters, pageSize]);

  const effectiveFilters = useMemo<GGFilters>(
    () => ({ ...filters, arama: debounced || undefined }),
    [filters, debounced],
  );

  const fetchList = useCallback(async () => {
    if (!kurumId) return;
    setLoading(true);
    try {
      const res = await ggService.list(modul, {
        kurum_id: kurumId, sube_id: subeId, page, page_size: pageSize, sort, filters: effectiveFilters,
      });
      setItems(res.results);
      setTotal(res.total);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Liste yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [kurumId, subeId, modul, page, pageSize, sort, effectiveFilters, message]);

  const fetchAux = useCallback(async () => {
    if (!kurumId) return;
    if (!subeId) {
      setDropdown(null);
      setCekPortfoy(null);
      return;
    }
    try {
      const [dash, dd, cekDash] = await Promise.all([
        ggService.dashboard(modul, kurumId, subeId),
        ggService.dropdown(modul, kurumId, subeId),
        cekSenetV2Service.dashboard(kurumId, subeId).catch(() => null),
      ]);
      setDashboard(dash);
      setDropdown(dd);
      setCekPortfoy(cekDash?.kpi ?? null);
    } catch (e) {
      message.error(
        e instanceof FinansHttpError
          ? e.message
          : "Cari hesap ve kategori listesi yüklenemedi. Şube seçimini kontrol edin.",
      );
    }
  }, [kurumId, subeId, modul, message]);

  useEffect(() => { fetchList(); }, [fetchList]);
  useEffect(() => { fetchAux(); }, [fetchAux]);
  useEffect(() => {
    const close = () => setCtxMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const reload = () => { fetchList(); fetchAux(); };

  const onDelete = async (row: GGListItem) => {
    try {
      await ggService.remove(modul, row.id);
      message.success("Kayıt silindi.");
      reload();
    } catch (e) {
      message.error(e instanceof FinansHttpError ? e.message : "Silinemedi.");
    }
  };

  const onOnayla = async (row: GGListItem) => {
    try {
      await ggService.onayla(modul, row.id);
      message.success("Kayıt onaylandı.");
      reload();
    } catch (e) {
      message.error(e instanceof FinansHttpError ? e.message : "Onaylanamadı.");
    }
  };

  const onIptal = (row: GGListItem) => {
    modal.confirm({
      title: "Kaydı iptal et",
      content: `"${row.fatura_no || row.cari_hesap?.unvan}" kaydı iptal edilsin mi? Bağlı cari/kasa/banka hareketleri geri alınır.`,
      okText: "İptal Et",
      okType: "danger",
      cancelText: "Vazgeç",
      onOk: async () => {
        try {
          await ggService.iptal(modul, row.id);
          message.success("Kayıt iptal edildi.");
          reload();
        } catch (e) {
          message.error(e instanceof FinansHttpError ? e.message : "İşlem başarısız.");
        }
      },
    });
  };

  const bulkDelete = () => {
    modal.confirm({
      title: `${selectedKeys.length} kayıt silinsin mi?`,
      okText: "Sil",
      okType: "danger",
      cancelText: "Vazgeç",
      onOk: async () => {
        let ok = 0;
        for (const id of selectedKeys) {
          try { await ggService.remove(modul, Number(id)); ok++; } catch { /* devam */ }
        }
        message.success(`${ok} kayıt silindi.`);
        setSelectedKeys([]);
        reload();
      },
    });
  };

  const openCreate = () => { setEditing(null); setDrawerOpen(true); };
  const openEdit = (row: GGListItem) => { setEditing(row); setDrawerOpen(true); };
  const openOdeme = (row: GGListItem) => setOdemeRow(row);

  const [exporting, setExporting] = useState(false);
  const doExport = async (fmt: "pdf" | "xlsx" | "csv") => {
    if (!kurumId) return;
    setExporting(true);
    message.loading({ content: "Dışa aktarılıyor…", key: "exp" });
    try {
      const { blob, filename } = await ggService.listeExport(
        modul, fmt, kurumId, subeId, effectiveFilters, sort,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || `${modul}-liste-${dayjs().format("YYYYMMDD")}.${fmt}`;
      a.click();
      URL.revokeObjectURL(url);
      message.success({ content: "İndirildi.", key: "exp" });
    } catch (e) {
      message.error({ content: e instanceof Error ? e.message : "Dışa aktarılamadı.", key: "exp" });
    } finally {
      setExporting(false);
    }
  };

  const exportMenu: MenuProps["items"] = [
    { key: "pdf", label: "PDF (kurumsal)", onClick: () => doExport("pdf") },
    { key: "xlsx", label: "Excel (.xlsx)", onClick: () => doExport("xlsx") },
    { key: "csv", label: "CSV", onClick: () => doExport("csv") },
  ];

  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [saveViewName, setSaveViewName] = useState("");
  const openSaveView = () => { setSaveViewName(""); setSaveViewOpen(true); };
  const confirmSaveView = () => {
    const ad = saveViewName.trim();
    if (!ad) { message.warning("Görünüm adı girin."); return; }
    const next = [...savedViews.filter((v) => v.ad !== ad), { ad, filters, sort }];
    setSavedViews(next);
    localStorage.setItem(SAVED_KEY, JSON.stringify(next));
    message.success(`"${ad}" görünümü kaydedildi.`);
    setSaveViewOpen(false);
  };
  const deleteView = (ad: string) => {
    const next = savedViews.filter((v) => v.ad !== ad);
    setSavedViews(next);
    localStorage.setItem(SAVED_KEY, JSON.stringify(next));
    message.success("Görünüm silindi.");
  };

  const columns = useMemo<ColumnsType<GGListItem>>(() => {
    const all: ColumnsType<GGListItem> = [
      {
        title: "Belge / Cari",
        key: "belge",
        fixed: screens.md ? "left" : undefined,
        render: (_, r) => (
          <div>
            <div style={{ fontWeight: 600 }}>{r.cari_hesap?.unvan || "—"}</div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>{r.fatura_no || "Belgesiz"}</div>
          </div>
        ),
      },
      { title: cfg.kategoriLabel, key: "kategori", render: (_, r) => kategoriOf(cfg, r)?.ad || "—" },
      { title: cfg.ikinciTanimLabel, key: "ikinci", render: (_, r) => ikinciTanimOf(cfg, r)?.ad || "—" },
      { title: "Tarih", key: "tarih", sorter: true, render: (_, r) => DATE(r.fatura_tarihi) },
      { title: "Vade", key: "vade", render: (_, r) => DATE(r.vade_tarihi) },
      {
        title: "Net Tutar", key: "net_tutar", align: "right", sorter: true,
        render: (_, r) => <strong>{TL(r.net_tutar)}</strong>,
      },
      { title: "KDV", key: "kdv_tutar", align: "right", render: (_, r) => TL(r.kdv_tutar) },
      {
        title: cfg.odenenLabel, key: "odenen", align: "right",
        render: (_, r) => <span style={{ color: "#059669" }}>{TL(r[cfg.odenenField] as string)}</span>,
      },
      {
        title: "Kalan", key: "kalan_tutar", align: "right",
        render: (_, r) => <span style={{ color: Number(r.kalan_tutar) > 0 ? "#dc2626" : "#94a3b8" }}>{TL(r.kalan_tutar)}</span>,
      },
      {
        title: "Durum", key: "durum",
        render: (_, r) => <Tag color={durumRenk(r.durum)}>{r.durum_label}</Tag>,
      },
      {
        title: "Etiketler", key: "etiketler",
        render: (_, r) => (r.etiketler?.length ? r.etiketler.map((e) => <Tag key={e.id} color={e.renk}>{e.ad}</Tag>) : "—"),
      },
      { title: "Kullanıcı", key: "olusturan", render: (_, r) => r.olusturan || "—" },
      {
        title: "", key: "islemler", fixed: screens.md ? "right" : undefined, width: 120,
        render: (_, r) => (
          <Space size={2} onClick={(e) => e.stopPropagation()}>
            {modul === "gider" && r.odenebilir_mi && (
              <Tooltip title="Öde">
                <Button size="small" type="text" style={{ color: "#16a34a" }} icon={<DollarOutlined />} onClick={() => openOdeme(r)} />
              </Tooltip>
            )}
            {modul === "gelir" && r.tahsil_edilebilir_mi && (
              <Tooltip title="Tahsil et">
                <Button size="small" type="text" style={{ color: "#16a34a" }} icon={<DollarOutlined />} onClick={() => openOdeme(r)} />
              </Tooltip>
            )}
            <Tooltip title="Düzenle">
              <Button size="small" type="text" icon={<EditOutlined />} disabled={!r.duzenlenebilir_mi} onClick={() => openEdit(r)} />
            </Tooltip>
            {r.duzenlenebilir_mi && r.durum.includes("taslak") && (
              <Tooltip title="Onayla">
                <Button size="small" type="text" icon={<CheckCircleOutlined />} onClick={() => onOnayla(r)} />
              </Tooltip>
            )}
            {r.iptal_edilebilir_mi && (
              <Tooltip title="İptal">
                <Button size="small" type="text" danger icon={<StopOutlined />} onClick={() => onIptal(r)} />
              </Tooltip>
            )}
            <Popconfirm title="Kayıt silinsin mi?" okText="Sil" cancelText="Vazgeç" onConfirm={() => onDelete(r)}>
              <Button size="small" type="text" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ),
      },
    ];
    return all.filter((c) => c.key === "belge" || c.key === "islemler" || visibleCols.includes(c.key as string));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg, visibleCols, screens.md]);

  const colMenu: MenuProps["items"] = columnDefs(cfg)
    .filter((c) => c.key !== "islemler" && c.key !== "belge")
    .map((c) => ({
      key: c.key,
      label: (
        <Checkbox
          checked={visibleCols.includes(c.key)}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) =>
            setVisibleCols((prev) => (e.target.checked ? [...prev, c.key] : prev.filter((x) => x !== c.key)))
          }
        >
          {c.label}
        </Checkbox>
      ),
    }));

  const viewsMenu: MenuProps["items"] = savedViews.length
    ? savedViews.map((v, i) => ({
        key: String(i),
        label: (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, minWidth: 180 }}>
            <span onClick={() => { setFilters(v.filters); setSort(v.sort); message.info(`"${v.ad}" uygulandı.`); }}>{v.ad}</span>
            <DeleteOutlined
              style={{ color: "#dc2626" }}
              onClick={(e) => { e.stopPropagation(); deleteView(v.ad); }}
            />
          </div>
        ),
        onClick: () => { setFilters(v.filters); setSort(v.sort); },
      }))
    : [{ key: "none", label: "Kayıtlı görünüm yok", disabled: true }];

  if (!kurumId) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: "#64748b" }}>
        Lütfen üst menüden bir kurum ve şube seçin.
      </div>
    );
  }

  const toneColor: Record<string, string> = {
    success: "#059669", danger: "#dc2626", warning: "#d97706", neutral: "#1F3C88",
  };

  return (
    <div style={{ padding: "4px 4px 40px" }}>
      {/* Başlık */}
      <div
        style={{
          background: `linear-gradient(120deg, ${cfg.renk}0d, #ffffff)`,
          border: "1px solid #eef2f7", borderRadius: 16, padding: "18px 22px", marginBottom: 16,
          display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0f172a" }}>{cfg.baslik}</h1>
          <p style={{ margin: "2px 0 0", color: "#64748b", fontSize: 13 }}>{cfg.altBaslik}</p>
        </div>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={reload}>Yenile</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Yeni {modul === "gider" ? "Gider" : "Gelir"}
          </Button>
        </Space>
      </div>

      {!subeId && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="Şube seçilmedi"
          description="Cari hesap ve kategori listeleri için üst menüden şube seçin. Aksi halde gider/gelir formu boş görünür."
        />
      )}

      {/* Dashboard kartları */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {cfg.kartlar.map((k) => (
          <Col key={k.key} xs={12} sm={8} lg={4}>
            <Card size="small" styles={{ body: { padding: "14px 16px" } }}>
              <Statistic
                title={<span style={{ fontSize: 12, color: "#64748b" }}>{k.label}</span>}
                value={k.tl ? TL(dashboard?.kartlar?.[k.key]) : (dashboard?.kartlar?.[k.key] ?? 0)}
                valueStyle={{ fontSize: 18, fontWeight: 800, color: toneColor[k.tone ?? "neutral"] }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      {/* En büyük kalemler */}
      {dashboard?.en_buyuk_kalemler?.length ? (
        <Card size="small" title={cfg.enBuyukBaslik} style={{ marginBottom: 16 }} styles={{ body: { padding: "8px 16px" } }}>
          <Row gutter={[12, 8]}>
            {dashboard.en_buyuk_kalemler.map((k, i) => (
              <Col key={i} xs={24} sm={12} lg={8}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px dashed #eef2f7" }}>
                  <span style={{ color: "#334155" }}>{i + 1}. {k.ad} <span style={{ color: "#94a3b8", fontSize: 12 }}>({k.adet})</span></span>
                  <strong style={{ color: cfg.renk }}>{TL(k.tutar)}</strong>
                </div>
              </Col>
            ))}
          </Row>
        </Card>
      ) : null}

      {/* Araç çubuğu */}
      <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: 12 } }}>
        <Space wrap style={{ width: "100%", justifyContent: "space-between" }}>
          <Space wrap>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="Ara (belge no, cari, açıklama, kategori)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: 300 }}
            />
            <Segmented
              value={viewMode}
              onChange={(v) => setViewMode(v as ViewMode)}
              options={[
                { value: "table", icon: <TableOutlined />, title: "Tablo" },
                { value: "compact", icon: <BarsOutlined />, title: "Yoğun" },
                { value: "card", icon: <AppstoreOutlined />, title: "Kart" },
              ]}
            />
            {(() => {
              const adet = modul === "gelir"
                ? (cekPortfoy?.tahsil_bekleyen?.adet ?? 0)
                : (cekPortfoy?.odeme_bekleyen?.adet ?? 0);
              const tutar = modul === "gelir"
                ? (cekPortfoy?.tahsil_bekleyen?.tutar ?? 0)
                : (cekPortfoy?.odeme_bekleyen?.tutar ?? 0);
              if (adet <= 0) return null;
              return (
                <Link href={`${homeHref}/cek-senet-v2`}>
                  <Tag
                    color="blue"
                    style={{
                      margin: 0,
                      cursor: "pointer",
                      padding: "4px 10px",
                      fontSize: 12,
                      lineHeight: "20px",
                    }}
                  >
                    Çek/Senet · {adet} bekleyen · {fmtTL(tutar)}
                  </Tag>
                </Link>
              );
            })()}
          </Space>
          <Space wrap>
            <Button
              icon={<FilterOutlined />}
              type={showFilters || Object.keys(filters).length ? "primary" : "default"}
              ghost={showFilters || Object.keys(filters).length > 0}
              onClick={() => setShowFilters(true)}
            >
              Filtreler{Object.keys(filters).length ? ` (${Object.keys(filters).length})` : ""}
            </Button>
            <Dropdown menu={{ items: colMenu }} trigger={["click"]} placement="bottomRight">
              <Button icon={<SettingOutlined />}>Kolonlar</Button>
            </Dropdown>
            <Dropdown menu={{ items: viewsMenu }} trigger={["click"]} placement="bottomRight">
              <Button>Görünümler{savedViews.length ? ` (${savedViews.length})` : ""}</Button>
            </Dropdown>
            <Button onClick={openSaveView}>Görünüm Kaydet</Button>
            <Dropdown menu={{ items: exportMenu }} trigger={["click"]} placement="bottomRight">
              <Button icon={<DownloadOutlined />} loading={exporting}>Dışa Aktar</Button>
            </Dropdown>
          </Space>
        </Space>
      </Card>

      {/* Toplu işlem şeridi */}
      {selectedKeys.length > 0 && (
        <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "8px 14px", marginBottom: 12, display: "flex", gap: 12, alignItems: "center" }}>
          <strong>{selectedKeys.length} kayıt seçildi</strong>
          <Button size="small" danger onClick={bulkDelete}>Seçilenleri Sil</Button>
          <Button size="small" onClick={() => setSelectedKeys([])}>Seçimi Temizle</Button>
        </div>
      )}

      {/* İçerik */}
      {viewMode === "card" ? (
        <Row gutter={[12, 12]}>
          {items.length === 0 && !loading ? (
            <Col span={24}><Empty description="Kayıt bulunamadı" /></Col>
          ) : (
            items.map((r) => (
              <Col key={r.id} xs={24} sm={12} lg={8} xl={6}>
                <Card
                  size="small" hoverable
                  onClick={() => openEdit(r)}
                  title={<span style={{ fontSize: 14 }}>{r.cari_hesap?.unvan || "—"}</span>}
                  extra={<Tag color={durumRenk(r.durum)}>{r.durum_label}</Tag>}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span style={{ color: "#64748b" }}>{kategoriOf(cfg, r)?.ad || "—"}</span>
                    <strong style={{ color: cfg.renk }}>{TL(r.net_tutar)}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#94a3b8", marginTop: 6 }}>
                    <span>{DATE(r.fatura_tarihi)}</span>
                    <span>Kalan: {TL(r.kalan_tutar)}</span>
                  </div>
                </Card>
              </Col>
            ))
          )}
        </Row>
      ) : (
        <Table<GGListItem>
          rowKey="id"
          size={viewMode === "compact" ? "small" : "middle"}
          loading={loading}
          columns={columns}
          dataSource={items}
          scroll={{ x: "max-content" }}
          rowSelection={{ selectedRowKeys: selectedKeys, onChange: setSelectedKeys }}
          onRow={(record) => ({
            onContextMenu: (e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, row: record }); },
          })}
          onChange={(pg, _f, sorter) => {
            setPage(pg.current ?? 1);
            setPageSize(pg.pageSize ?? 25);
            const s = Array.isArray(sorter) ? sorter[0] : sorter;
            if (s && s.order) {
              const field = s.columnKey === "tarih" ? "fatura_tarihi" : (s.columnKey as string);
              setSort(`${s.order === "descend" ? "-" : ""}${field}`);
            } else {
              setSort("-fatura_tarihi");
            }
          }}
          pagination={{
            current: page, pageSize, total,
            showSizeChanger: true, pageSizeOptions: ["10", "25", "50", "100"],
            showTotal: (t) => `Toplam ${t} kayıt`,
          }}
        />
      )}

      {/* Sağ tık menüsü */}
      {ctxMenu && (
        <div
          style={{ position: "fixed", left: ctxMenu.x, top: ctxMenu.y, zIndex: 2000 }}
          onClick={(e) => e.stopPropagation()}
        >
          <Card size="small" styles={{ body: { padding: 4 } }} style={{ boxShadow: "0 6px 24px rgba(0,0,0,0.15)" }}>
            <Space direction="vertical" size={0} style={{ width: 160 }}>
              {modul === "gider" && ctxMenu.row.odenebilir_mi && (
                <Button type="text" block style={{ textAlign: "left", color: "#16a34a" }} icon={<DollarOutlined />} onClick={() => { openOdeme(ctxMenu.row); setCtxMenu(null); }}>Öde</Button>
              )}
              {modul === "gelir" && ctxMenu.row.tahsil_edilebilir_mi && (
                <Button type="text" block style={{ textAlign: "left", color: "#16a34a" }} icon={<DollarOutlined />} onClick={() => { openOdeme(ctxMenu.row); setCtxMenu(null); }}>Tahsil et</Button>
              )}
              <Button type="text" block style={{ textAlign: "left" }} icon={<EditOutlined />} onClick={() => { openEdit(ctxMenu.row); setCtxMenu(null); }}>Düzenle</Button>
              {ctxMenu.row.iptal_edilebilir_mi && (
                <Button type="text" block danger style={{ textAlign: "left" }} icon={<StopOutlined />} onClick={() => { onIptal(ctxMenu.row); setCtxMenu(null); }}>İptal Et</Button>
              )}
              <Button type="text" block danger style={{ textAlign: "left" }} icon={<DeleteOutlined />} onClick={() => { onDelete(ctxMenu.row); setCtxMenu(null); }}>Sil</Button>
            </Space>
          </Card>
        </div>
      )}

      {/* Gelişmiş filtreler */}
      <FilterDrawer
        cfg={cfg}
        open={showFilters}
        dropdown={dropdown}
        filters={filters}
        onClose={() => setShowFilters(false)}
        onApply={(f) => { setFilters(f); setShowFilters(false); }}
        onClear={() => { setFilters({}); setShowFilters(false); }}
      />

      {/* Form çekmecesi */}
      <GelirGiderFormDrawer
        cfg={cfg}
        open={drawerOpen}
        kurumId={kurumId}
        subeId={subeId}
        dropdown={dropdown}
        editing={editing}
        onClose={() => setDrawerOpen(false)}
        onSaved={() => { setDrawerOpen(false); reload(); }}
      />

      {/* Gider ödeme / gelir tahsilat çekmecesi */}
      {modul === "gider" && (
        <GiderOdemeDrawer
          open={!!odemeRow}
          row={odemeRow}
          dropdown={dropdown}
          onClose={() => setOdemeRow(null)}
          onSaved={reload}
        />
      )}
      {modul === "gelir" && (
        <GelirTahsilatDrawer
          open={!!odemeRow}
          row={odemeRow}
          dropdown={dropdown}
          onClose={() => setOdemeRow(null)}
          onSaved={reload}
        />
      )}

      {/* Görünüm kaydet */}
      <Modal
        title="Filtre Görünümünü Kaydet"
        open={saveViewOpen}
        onCancel={() => setSaveViewOpen(false)}
        onOk={confirmSaveView}
        okText="Kaydet"
        cancelText="Vazgeç"
        destroyOnClose
      >
        <p style={{ color: "#64748b", fontSize: 13, marginTop: 0 }}>
          Aktif filtreler ve sıralama bu isimle kaydedilir; &quot;Görünümler&quot; menüsünden tekrar uygulayabilirsin.
        </p>
        <Input
          placeholder="Örn. Bu ay bekleyen ödemeler"
          value={saveViewName}
          onChange={(e) => setSaveViewName(e.target.value)}
          onPressEnter={confirmSaveView}
          autoFocus
        />
      </Modal>
    </div>
  );
}

function FilterDrawer({
  cfg, open, dropdown, filters, onClose, onApply, onClear,
}: {
  cfg: ModulConfig;
  open: boolean;
  dropdown: GGDropdown | null;
  filters: GGFilters;
  onClose: () => void;
  onApply: (f: GGFilters) => void;
  onClear: () => void;
}) {
  const [local, setLocal] = useState<GGFilters>(filters);
  useEffect(() => { if (open) setLocal(filters); }, [open, filters]);
  const upd = (k: keyof GGFilters, v: unknown) =>
    setLocal((f) => ({ ...f, [k]: v === "" || v === undefined || v === null ? undefined : v }));

  const ikinciTanimlar =
    (cfg.modul === "gider" ? dropdown?.maliyet_merkezleri : dropdown?.gelir_kaynaklari) ?? [];

  // Gider: yalnızca alt kategori adları; gelir: gruplu liste
  const kategoriFilterOptions = useMemo((): DefaultOptionType[] => {
    const cats = dropdown?.kategoriler ?? [];
    if (cfg.modul === "gider") {
      const parentIdsWithChildren = new Set(
        cats.filter((c) => c.parent_id).map((c) => c.parent_id as number),
      );
      return cats
        .filter((c) => c.parent_id !== null || !parentIdsWithChildren.has(c.id))
        .map((c) => ({ value: c.id, label: c.ad }));
    }
    const parents = cats.filter((c) => !c.parent_id);
    const orphans = cats.filter((c) => c.parent_id && !parents.some((p) => p.id === c.parent_id));
    const groups: DefaultOptionType[] = parents.map((p) => {
      const kids = cats.filter((c) => c.parent_id === p.id);
      if (!kids.length) return { value: p.id, label: p.ad };
      return {
        label: p.ad,
        title: p.ad,
        options: [
          { value: p.id, label: `${p.ad} — tümü` },
          ...kids.map((c) => ({ value: c.id, label: c.ad })),
        ],
      };
    });
    if (orphans.length) groups.push(...orphans.map((c) => ({ value: c.id, label: c.ad })));
    return groups;
  }, [dropdown?.kategoriler, cfg.modul]);

  return (
    <Drawer
      title="Gelişmiş Filtreleme"
      open={open}
      onClose={onClose}
      width={420}
      extra={
        <Space>
          <Button onClick={onClear}>Temizle</Button>
          <Button type="primary" onClick={() => onApply(local)}>Uygula</Button>
        </Space>
      }
    >
      <Space direction="vertical" size={14} style={{ width: "100%" }}>
        <Row gutter={8}>
          <Col span={12}>
            <Field label="Başlangıç Tarihi">
              <DatePicker
                style={{ width: "100%" }} format="DD.MM.YYYY" placeholder="Başlangıç" allowClear
                value={local.baslangic ? dayjs(local.baslangic as string) : null}
                disabledDate={(d) => (local.bitis ? d.isAfter(dayjs(local.bitis as string), "day") : false)}
                onChange={(d) => upd("baslangic", d ? d.format("YYYY-MM-DD") : undefined)}
              />
            </Field>
          </Col>
          <Col span={12}>
            <Field label="Bitiş Tarihi">
              <DatePicker
                style={{ width: "100%" }} format="DD.MM.YYYY" placeholder="Bitiş" allowClear
                value={local.bitis ? dayjs(local.bitis as string) : null}
                disabledDate={(d) => (local.baslangic ? d.isBefore(dayjs(local.baslangic as string), "day") : false)}
                onChange={(d) => upd("bitis", d ? d.format("YYYY-MM-DD") : undefined)}
              />
            </Field>
          </Col>
        </Row>
        <Field label={cfg.cariLabel}>
          <Select
            allowClear showSearch optionFilterProp="label" style={{ width: "100%" }} placeholder="Cari"
            value={local.cari_hesap_id as number | undefined}
            onChange={(v) => upd("cari_hesap_id", v)}
            options={(dropdown?.cariler ?? []).map((c) => ({ value: c.id, label: c.unvan }))}
          />
        </Field>
        <Field label={`${cfg.kategoriLabel} (başlığa göre alt kategoriler dahil)`}>
          <Select
            allowClear showSearch optionFilterProp="label" style={{ width: "100%" }} placeholder="Kategori / başlık"
            value={local[cfg.kategoriFilterKey] as number | undefined}
            onChange={(v) => upd(cfg.kategoriFilterKey, v)}
            options={kategoriFilterOptions}
          />
        </Field>
        <Field label={cfg.ikinciTanimLabel}>
          <Select
            allowClear showSearch optionFilterProp="label" style={{ width: "100%" }} placeholder={cfg.ikinciTanimLabel}
            value={local[cfg.ikinciTanimFilterKey] as number | undefined}
            onChange={(v) => upd(cfg.ikinciTanimFilterKey, v)}
            options={ikinciTanimlar.map((t) => ({ value: t.id, label: t.ad }))}
          />
        </Field>
        <Field label="Proje">
          <Select
            allowClear showSearch optionFilterProp="label" style={{ width: "100%" }} placeholder="Proje"
            value={local.proje_id as number | undefined}
            onChange={(v) => upd("proje_id", v)}
            options={(dropdown?.projeler ?? []).map((p) => ({ value: p.id, label: p.ad }))}
          />
        </Field>
        <Field label="Durum">
          <Select
            allowClear style={{ width: "100%" }} placeholder="Durum"
            value={local.durum as string | undefined}
            onChange={(v) => upd("durum", v)}
            options={(dropdown?.durumlar ?? []).map((d) => ({ value: d.value, label: d.label }))}
          />
        </Field>
        <Field label={cfg.durumLabel}>
          <Select
            allowClear style={{ width: "100%" }} placeholder={cfg.durumLabel}
            value={local[cfg.durumFilterKey] as string | undefined}
            onChange={(v) => upd(cfg.durumFilterKey, v)}
            options={[
              { value: "bekleyen", label: "Bekleyen" },
              { value: "kismi", label: "Kısmi" },
              { value: "tamamlanan", label: "Tamamlanan" },
            ]}
          />
        </Field>
        <Field label="Ödeme Şekli">
          <Select
            allowClear style={{ width: "100%" }} placeholder="Ödeme şekli"
            value={local.odeme_yontemi_id as number | undefined}
            onChange={(v) => upd("odeme_yontemi_id", v)}
            options={(dropdown?.odeme_yontemleri ?? []).map((o) => ({ value: o.id, label: o.ad }))}
          />
        </Field>
        <Field label="Etiket">
          <Select
            allowClear style={{ width: "100%" }} placeholder="Etiket"
            value={local.etiket_id as number | undefined}
            onChange={(v) => upd("etiket_id", v)}
            options={(dropdown?.etiketler ?? []).map((e) => ({ value: e.id, label: e.ad }))}
          />
        </Field>
        <Field label="KDV Durumu">
          <Select
            allowClear style={{ width: "100%" }} placeholder="KDV"
            value={local.kdv_var as string | undefined}
            onChange={(v) => upd("kdv_var", v)}
            options={[{ value: "true", label: "KDV'li" }, { value: "false", label: "KDV'siz" }]}
          />
        </Field>
        <Row gutter={8}>
          <Col span={12}>
            <Field label="Tutar (min)">
              <InputNumber style={{ width: "100%" }} min={0} value={local.tutar_min as number | undefined} onChange={(v) => upd("tutar_min", v)} />
            </Field>
          </Col>
          <Col span={12}>
            <Field label="Tutar (max)">
              <InputNumber style={{ width: "100%" }} min={0} value={local.tutar_max as number | undefined} onChange={(v) => upd("tutar_max", v)} />
            </Field>
          </Col>
        </Row>
        <Field label="Belge No">
          <Input value={local.belge_no as string | undefined} onChange={(e) => upd("belge_no", e.target.value)} placeholder="Belge no" />
        </Field>
      </Space>
    </Drawer>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}
