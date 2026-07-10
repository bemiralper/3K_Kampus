"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  App as AntApp,
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Dropdown,
  Empty,
  Input,
  InputNumber,
  Row,
  Segmented,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Tooltip,
} from "antd";
import type { ColumnsType, TablePaginationConfig } from "antd/es/table";
import type { SorterResult } from "antd/es/table/interface";
import {
  DollarOutlined,
  MoreOutlined,
  PhoneOutlined,
  SettingOutlined,
  WhatsAppOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { useKurum } from "@/lib/contexts/KurumContext";
import { useFinansPath } from "@/components/finans/FinansPathProvider";
import { useOdemePath } from "@/components/odeme-takip/OdemePathProvider";
import ExportDropdown from "@/components/finans/ExportDropdown";
import TopluGecikmeMesajModal from "@/components/finans/TopluGecikmeMesajModal";
import { fmtDate, fmtTL } from "@/components/finans/FinansFilterBar";
import TahsilatAlModal from "../para-hareketleri/modals/TahsilatAlModal";
import GGProvider from "../gelir-gider-v2/GGProvider";
import { overdueService } from "../services/overdue-api";
import {
  GECIKEN_COLUMN_EXPORT_KEYS,
  type GecikenColumnKey,
  type GecikmeAraligi,
  type OverdueDurumFilter,
  type OverduePaymentDetail,
  type OverduePaymentItem,
  type OverduePaymentsSummary,
} from "../types/overdue-types";
import GecikenDetayDrawer from "./GecikenDetayDrawer";

const { RangePicker } = DatePicker;
const COLUMN_STORAGE_KEY = "geciken_taksitler_columns_v3";

type ColDef = {
  key: GecikenColumnKey;
  label: string;
  sortField?: string;
  render: (item: OverduePaymentItem) => React.ReactNode;
  align?: "left" | "right" | "center";
};

const ALL_COLUMNS: ColDef[] = [
  { key: "ogrenci", label: "Öğrenci", sortField: "ogrenci_adi", render: (i) => <span style={{ fontWeight: 600, color: "#0f172a" }}>{i.ogrenci_adi}</span> },
  { key: "veli", label: "Veli", render: (i) => i.veli_adi || "—" },
  { key: "telefon", label: "Telefon", render: (i) => i.veli_telefon || "—" },
  { key: "sube", label: "Şube", render: (i) => i.sube_ad || "—" },
  { key: "sinif", label: "Sınıf", render: (i) => i.sinif_ad || "—" },
  { key: "rehber", label: "Rehber Öğretmen", render: (i) => i.rehber_ogretmen || "—" },
  { key: "vade", label: "Son Ödeme", sortField: "vade_tarihi", render: (i) => fmtDate(i.vade_tarihi) },
  { key: "gecikme", label: "Gecikme", sortField: "gecikme_gun", align: "center", render: (i) => (i.gecikme_gun > 0 ? <Tag color="volcano">{i.gecikme_gun} gün</Tag> : "—") },
  { key: "taksit_tutari", label: "Taksit Tutarı", align: "right", render: (i) => fmtTL(i.taksit_tutari) },
  { key: "sozlesme_tutari", label: "Toplam Sözleşme", align: "right", render: (i) => fmtTL(i.sozlesme_tutari) },
  { key: "son_odeme", label: "Son Ödeme", align: "right", render: (i) => (i.son_tahsilat_tutari != null ? fmtTL(i.son_tahsilat_tutari) : "—") },
  { key: "toplam_kalan", label: "Toplam Kalan Borç", sortField: "toplam_kalan_borc", align: "right", render: (i) => <span style={{ fontWeight: 700, color: "#dc2626" }}>{fmtTL(i.toplam_kalan_borc)}</span> },
  { key: "kalan", label: "Taksit Kalan", sortField: "kalan_tutar", align: "right", render: (i) => fmtTL(i.kalan_tutar) },
  { key: "son_tahsilat", label: "Son Tahsilat", render: (i) => (i.son_tahsilat_tarihi ? fmtDate(i.son_tahsilat_tarihi) : "—") },
  { key: "durum", label: "Durum", render: (i) => <Tag color={durumRenkToAntd(i.durum_renk)}>{i.durum_label}</Tag> },
];

const DEFAULT_VISIBLE: GecikenColumnKey[] = [
  "ogrenci", "veli", "telefon",
  "vade", "gecikme", "sozlesme_tutari", "son_odeme", "toplam_kalan", "son_tahsilat", "durum",
];

const VALID_KEYS = new Set<GecikenColumnKey>(ALL_COLUMNS.map((c) => c.key));

function durumRenkToAntd(renk: string): string {
  if (renk === "red") return "red";
  if (renk === "orange") return "orange";
  if (renk === "blue") return "blue";
  return "gold";
}

function loadVisibleColumns(): GecikenColumnKey[] {
  if (typeof window === "undefined") return DEFAULT_VISIBLE;
  try {
    const raw = localStorage.getItem(COLUMN_STORAGE_KEY);
    if (raw) {
      const parsed = (JSON.parse(raw) as string[]).filter((k): k is GecikenColumnKey => VALID_KEYS.has(k as GecikenColumnKey));
      if (parsed.length) return parsed;
    }
  } catch { /* ignore */ }
  return DEFAULT_VISIBLE;
}

function exportKeysFromVisible(visible: GecikenColumnKey[]): string[] {
  const keys: string[] = [];
  for (const col of ALL_COLUMNS) {
    if (visible.includes(col.key)) keys.push(...GECIKEN_COLUMN_EXPORT_KEYS[col.key]);
  }
  return keys;
}

function GecikmisOdemelerInner({ embedded = false }: { embedded?: boolean }) {
  const { message } = AntApp.useApp();
  const { activeKurum, activeSube, activeEgitimYili } = useKurum();
  const { homeHref } = useFinansPath();
  const { href: odemeHref } = useOdemePath();

  const [items, setItems] = useState<OverduePaymentItem[]>([]);
  const [ozet, setOzet] = useState<OverduePaymentsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [ordering, setOrdering] = useState("-gecikme_gun");

  const [durum, setDurum] = useState<OverdueDurumFilter>("gecikmis");
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [gecikmeAraligi, setGecikmeAraligi] = useState<GecikmeAraligi | "">("");
  const [minTutar, setMinTutar] = useState<number | null>(null);
  const [maxTutar, setMaxTutar] = useState<number | null>(null);
  const [arama, setArama] = useState("");

  const [selectedKeys, setSelectedKeys] = useState<number[]>([]);
  const [visibleCols, setVisibleCols] = useState<GecikenColumnKey[]>(DEFAULT_VISIBLE);

  const [detailItem, setDetailItem] = useState<OverduePaymentItem | null>(null);
  const [detailData, setDetailData] = useState<OverduePaymentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [tahsilatHedef, setTahsilatHedef] = useState<{ sozlesmeId: number; taksitId: number } | null>(null);

  useEffect(() => { setVisibleCols(loadVisibleColumns()); }, []);

  const filterParams = useMemo(() => {
    if (!activeKurum) return null;
    return {
      kurum_id: activeKurum.id,
      sube_id: activeSube?.id,
      egitim_yili_id: activeEgitimYili?.id,
      durum,
      baslangic: range?.[0]?.format("YYYY-MM-DD") || undefined,
      bitis: range?.[1]?.format("YYYY-MM-DD") || undefined,
      gecikme_araligi: gecikmeAraligi || undefined,
      min_tutar: minTutar ?? undefined,
      max_tutar: maxTutar ?? undefined,
      arama: arama || undefined,
      page,
      page_size: pageSize,
      ordering,
    };
  }, [activeKurum, activeSube, activeEgitimYili, durum, range, gecikmeAraligi, minTutar, maxTutar, arama, page, pageSize, ordering]);

  const load = useCallback(async () => {
    if (!filterParams) return;
    setLoading(true);
    setError(null);
    try {
      const data = await overdueService.list(filterParams);
      setItems(data.results || []);
      setOzet(data.ozet);
      setCount(data.count);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Liste yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [filterParams]);

  useEffect(() => {
    const t = setTimeout(load, arama ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, arama]);

  const openDetail = useCallback(async (item: OverduePaymentItem) => {
    setDetailItem(item);
    setDetailData(null);
    if (!activeKurum) return;
    setDetailLoading(true);
    try {
      setDetailData(await overdueService.detail(item.taksit_id, activeKurum.id));
    } catch {
      setDetailData(null);
    } finally {
      setDetailLoading(false);
    }
  }, [activeKurum]);

  const toggleCol = (key: GecikenColumnKey) => {
    setVisibleCols((prev) => {
      let next: GecikenColumnKey[];
      if (prev.includes(key)) {
        if (prev.length <= 1) return prev;
        next = prev.filter((k) => k !== key);
      } else {
        next = ALL_COLUMNS.filter((c) => prev.includes(c.key) || c.key === key).map((c) => c.key);
      }
      try { localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const clearFilters = () => {
    setDurum("gecikmis");
    setRange(null);
    setGecikmeAraligi("");
    setMinTutar(null);
    setMaxTutar(null);
    setArama("");
    setPage(1);
  };

  const handleCall = (phone: string | null) => {
    if (!phone) { message.error("Telefon numarası yok"); return; }
    window.open(`tel:${phone.replace(/\s/g, "")}`, "_self");
  };

  const sortOrderFor = (field?: string): "ascend" | "descend" | null => {
    if (!field) return null;
    const bare = ordering.replace(/^-/, "");
    if (bare !== field) return null;
    return ordering.startsWith("-") ? "descend" : "ascend";
  };

  const columns: ColumnsType<OverduePaymentItem> = useMemo(() => {
    const base: ColumnsType<OverduePaymentItem> = ALL_COLUMNS
      .filter((c) => visibleCols.includes(c.key))
      .map((c) => ({
        title: c.label,
        key: c.key,
        align: c.align,
        sorter: c.sortField ? true : undefined,
        sortOrder: sortOrderFor(c.sortField),
        showSorterTooltip: false,
        render: (_: unknown, item: OverduePaymentItem) => c.render(item),
      }));
    base.push({
      title: "İşlemler",
      key: "islem",
      align: "center",
      fixed: "right",
      width: 150,
      render: (_: unknown, item: OverduePaymentItem) => (
        <Space size={2} onClick={(e) => e.stopPropagation()}>
          <Tooltip title="Tahsilat Al">
            <Button size="small" type="text" icon={<DollarOutlined />} onClick={() => setTahsilatHedef({ sozlesmeId: item.sozlesme_id, taksitId: item.taksit_id })} />
          </Tooltip>
          <Tooltip title="WhatsApp">
            <Button size="small" type="text" icon={<WhatsAppOutlined />} style={{ color: "#25D366" }} onClick={() => { setSelectedKeys([item.taksit_id]); setShowBulkModal(true); }} />
          </Tooltip>
          <Tooltip title="Ara">
            <Button size="small" type="text" icon={<PhoneOutlined />} onClick={() => handleCall(item.veli_telefon)} />
          </Tooltip>
          <Tooltip title="Detay">
            <Button size="small" type="text" icon={<MoreOutlined />} onClick={() => openDetail(item)} />
          </Tooltip>
        </Space>
      ),
    });
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleCols, ordering, openDetail]);

  const onTableChange = (
    pag: TablePaginationConfig,
    _filters: unknown,
    sorter: SorterResult<OverduePaymentItem> | SorterResult<OverduePaymentItem>[],
  ) => {
    const s = Array.isArray(sorter) ? sorter[0] : sorter;
    const colDef = ALL_COLUMNS.find((c) => c.key === s?.columnKey);
    if (colDef?.sortField && s?.order) {
      setOrdering((s.order === "ascend" ? "" : "-") + colDef.sortField);
    } else if (s && !s.order) {
      setOrdering("-gecikme_gun");
    }
    if (pag.current) setPage(pag.current);
    if (pag.pageSize) setPageSize(pag.pageSize);
  };

  const selectedItems = items.filter((i) => selectedKeys.includes(i.taksit_id));
  const exportColumnKeys = exportKeysFromVisible(visibleCols);

  if (!activeKurum) {
    return <Card style={{ textAlign: "center", padding: 32 }}><Empty description="Geciken taksitleri görmek için üst menüden bir kurum seçin." /></Card>;
  }

  return (
    <div style={{ padding: embedded ? 0 : "4px 4px 40px" }}>
      {!embedded && (
        <div style={{ background: "linear-gradient(120deg, #dc26260d, #ffffff)", border: "1px solid #eef2f7", borderRadius: 16, padding: "18px 22px", marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0f172a" }}>Gecikmiş Ödemeler</h1>
          <p style={{ margin: "2px 0 0", color: "#64748b", fontSize: 13 }}>Geciken taksitleri filtreleyin, tahsilat alın ve toplu hatırlatma gönderin.</p>
        </div>
      )}

      {ozet && (
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col xs={12} md={8} lg={4}><Card size="small"><Statistic title={<span style={{ fontSize: 11, color: "#64748b" }}>Toplam Geciken</span>} value={fmtTL(ozet.toplam_geciken_tutar)} valueStyle={{ fontSize: 17, fontWeight: 800, color: "#dc2626" }} /></Card></Col>
          <Col xs={12} md={8} lg={4}><Card size="small"><Statistic title={<span style={{ fontSize: 11, color: "#64748b" }}>Geciken Öğrenci</span>} value={ozet.geciken_ogrenci_sayisi} valueStyle={{ fontSize: 17, fontWeight: 800, color: "#ea580c" }} /></Card></Col>
          <Col xs={12} md={8} lg={4}><Card size="small"><Statistic title={<span style={{ fontSize: 11, color: "#64748b" }}>Bugün Vadesi</span>} value={fmtTL(ozet.bugun_vadesi_gelen)} valueStyle={{ fontSize: 17, fontWeight: 800, color: "#2563eb" }} /></Card></Col>
          <Col xs={12} md={8} lg={4}><Card size="small"><Statistic title={<span style={{ fontSize: 11, color: "#64748b" }}>30+ Gün</span>} value={fmtTL(ozet.otuz_artı_geciken)} valueStyle={{ fontSize: 17, fontWeight: 800, color: "#991b1b" }} /></Card></Col>
          <Col xs={12} md={8} lg={4}><Card size="small"><Statistic title={<span style={{ fontSize: 11, color: "#64748b" }}>Ort. Gecikme</span>} value={`${Math.round(ozet.ortalama_gecikme_gun)} gün`} valueStyle={{ fontSize: 17, fontWeight: 800, color: "#7c3aed" }} /></Card></Col>
          <Col xs={12} md={8} lg={4}><Card size="small"><Statistic title={<span style={{ fontSize: 11, color: "#64748b" }}>Tahsilat Başarısı</span>} value={`%${ozet.tahsilat_basarisi_orani}`} valueStyle={{ fontSize: 17, fontWeight: 800, color: "#059669" }} /></Card></Col>
        </Row>
      )}

      <Card size="small" style={{ marginBottom: 16 }} styles={{ body: { padding: 12 } }}>
        <Space wrap style={{ width: "100%", justifyContent: "space-between" }}>
          <Space wrap>
            <Segmented
              value={durum}
              onChange={(v) => { setDurum(v as OverdueDurumFilter); setPage(1); }}
              options={[
                { value: "gecikmis", label: "Gecikmiş" },
                { value: "bugun_vadeli", label: "Bugün Vadeli" },
                { value: "yaklasan", label: "Yaklaşan" },
              ]}
            />
            <RangePicker
              format="DD.MM.YYYY"
              value={range as never}
              onChange={(d) => { setRange(d && d[0] && d[1] ? [d[0], d[1]] : null); setPage(1); }}
            />
            <Input.Search allowClear placeholder="Öğrenci / veli / sözleşme…" value={arama} onChange={(e) => { setArama(e.target.value); setPage(1); }} style={{ width: 220 }} />
          </Space>
          <Space wrap>
            <Dropdown
              trigger={["click"]}
              menu={{
                items: ALL_COLUMNS.map((c) => ({
                  key: c.key,
                  label: (
                    <Checkbox checked={visibleCols.includes(c.key)} onClick={(e) => { e.preventDefault(); toggleCol(c.key); }}>
                      {c.label}
                    </Checkbox>
                  ),
                })),
              }}
            >
              <Button icon={<SettingOutlined />}>Kolonlar</Button>
            </Dropdown>
            {filterParams && (
              <ExportDropdown
                buildPath={(f, orientation) => overdueService.exportUrl(filterParams, f, exportColumnKeys, orientation)}
                filenamePrefix="geciken-taksitler"
                disabled={loading}
              />
            )}
            {selectedKeys.length > 0 && (
              <Button type="primary" icon={<WhatsAppOutlined />} style={{ background: "#25D366", borderColor: "#25D366" }} onClick={() => setShowBulkModal(true)}>
                Toplu WhatsApp ({selectedKeys.length})
              </Button>
            )}
          </Space>
        </Space>
      </Card>

      <Space style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: "#64748b" }}>Gecikme:</span>
        <Segmented
          size="small"
          value={gecikmeAraligi || "all"}
          onChange={(v) => { setGecikmeAraligi(v === "all" ? "" : (v as GecikmeAraligi)); setPage(1); }}
          options={[
            { value: "all", label: "Tümü" },
            { value: "1-7", label: "1-7 gün" },
            { value: "8-15", label: "8-15 gün" },
            { value: "16-30", label: "16-30 gün" },
            { value: "30+", label: "30+ gün" },
          ]}
        />
        <InputNumber placeholder="Min ₺" value={minTutar} onChange={(v) => { setMinTutar(v); setPage(1); }} style={{ width: 110 }} min={0} />
        <InputNumber placeholder="Max ₺" value={maxTutar} onChange={(v) => { setMaxTutar(v); setPage(1); }} style={{ width: 110 }} min={0} />
        <Button size="small" onClick={clearFilters}>Temizle</Button>
      </Space>

      <Card size="small" styles={{ body: { padding: 0 } }}>
        {loading ? (
          <div style={{ padding: 80, textAlign: "center" }}><Spin size="large" /></div>
        ) : error ? (
          <div style={{ padding: 48, textAlign: "center" }}>
            <p style={{ color: "#dc2626", fontWeight: 600, marginBottom: 12 }}>{error}</p>
            <Button danger onClick={load}>Tekrar Dene</Button>
          </div>
        ) : (
          <Table
            rowKey="taksit_id"
            size="small"
            columns={columns}
            dataSource={items}
            rowSelection={{ selectedRowKeys: selectedKeys, onChange: (keys) => setSelectedKeys(keys as number[]) }}
            onChange={onTableChange}
            onRow={(item) => ({ onClick: () => openDetail(item), style: { cursor: "pointer" } })}
            locale={{ emptyText: <Empty description="Bu filtrelerde kayıt yok" /> }}
            pagination={{
              current: page,
              pageSize,
              total: count,
              showSizeChanger: true,
              pageSizeOptions: [25, 50, 100, 200],
              showTotal: (t) => `Toplam ${t.toLocaleString("tr-TR")} kayıt`,
            }}
            scroll={{ x: "max-content" }}
          />
        )}
      </Card>

      {detailItem && (
        <GecikenDetayDrawer
          item={detailItem}
          detail={detailData}
          loading={detailLoading}
          odemeHref={odemeHref}
          homeHref={homeHref}
          onClose={() => { setDetailItem(null); setDetailData(null); }}
          onTahsilat={() => setTahsilatHedef({ sozlesmeId: detailItem.sozlesme_id, taksitId: detailItem.taksit_id })}
          onWhatsapp={() => { setSelectedKeys([detailItem.taksit_id]); setShowBulkModal(true); }}
          onCall={() => handleCall(detailItem.veli_telefon)}
          onNotEkle={() => { const n = window.prompt("Not girin:"); if (n?.trim()) message.success("Not kaydedildi (yerel)"); }}
        />
      )}

      {showBulkModal && (
        <TopluGecikmeMesajModal
          selectedItems={selectedItems.length ? selectedItems : items.filter((i) => selectedKeys.includes(i.taksit_id))}
          kurumAd={activeKurum.ad}
          onClose={() => setShowBulkModal(false)}
          onSent={(sent) => message.success(`${sent} kişiye mesaj gönderildi`)}
        />
      )}

      {tahsilatHedef && (
        <TahsilatAlModal
          prefillSozlesmeId={tahsilatHedef.sozlesmeId}
          prefillTaksitId={tahsilatHedef.taksitId}
          onClose={() => setTahsilatHedef(null)}
          onSuccess={(msg) => { message.success(msg || "Tahsilat alındı."); setTahsilatHedef(null); load(); }}
        />
      )}
    </div>
  );
}

export default function GecikmisOdemelerClient({ embedded = false }: { embedded?: boolean }) {
  return (
    <GGProvider>
      <GecikmisOdemelerInner embedded={embedded} />
    </GGProvider>
  );
}
