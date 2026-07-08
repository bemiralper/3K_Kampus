"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Row,
  Segmented,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { ArrowDownOutlined, ArrowUpOutlined } from "@ant-design/icons";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import dayjs from "dayjs";
import { useKurum } from "@/lib/contexts/KurumContext";
import { useFinansPath } from "@/components/finans/FinansPathProvider";
import { useOdemePath } from "@/components/odeme-takip/OdemePathProvider";
import { periodService } from "../services/period-api";
import { paymentMethodService } from "../services/finans-api";
import type { PeriodDetailItem, PeriodMode, PeriodSummary, PeriodKaynak, PeriodQueryParams } from "../types/period-types";
import { fmtDate, fmtTL } from "@/components/finans/FinansFilterBar";
import ExportDropdown from "@/components/finans/ExportDropdown";
import GGProvider from "../gelir-gider-v2/GGProvider";

const { RangePicker } = DatePicker;

const DATE_PRESETS = [
  { key: "bugun", label: "Bugün" },
  { key: "bu_hafta", label: "Bu Hafta" },
  { key: "bu_ay", label: "Bu Ay" },
  { key: "gecen_ay", label: "Geçen Ay" },
  { key: "bu_yil", label: "Bu Yıl" },
] as const;

const KAYNAK_OPTIONS: { key: PeriodKaynak; label: string; color: string }[] = [
  { key: "hepsi", label: "Tümü", color: "#64748b" },
  { key: "sozlesme", label: "Sözleşme", color: "#2563eb" },
  { key: "gelir", label: "Gelir Kaydı", color: "#7c3aed" },
  { key: "cari", label: "Cari Hesap", color: "#ea580c" },
];

const YONTEM_TIP_LABELS: Record<string, string> = {
  nakit: "Nakit", pos: "POS Cihazı", havale_eft: "Havale / EFT",
  online: "Online Ödeme", cek: "Çek", senet: "Senet",
};

const CHART_COLORS = ["#2563eb", "#059669", "#7c3aed", "#ea580c", "#db2777", "#0891b2", "#ca8a04", "#dc2626"];

function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseLocalDate(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y || 1970, (m || 1) - 1, day || 1);
}

function fmtRange(baslangic: string, bitis: string): string {
  const f = (d: string) => {
    const dt = parseLocalDate(d);
    if (Number.isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
  };
  if (baslangic === bitis) return f(baslangic);
  return `${f(baslangic)} — ${f(bitis)}`;
}

function getPresetRange(key: string): { baslangic: string; bitis: string } {
  const today = new Date();
  const fmt = toLocalISODate;
  if (key === "bugun") return { baslangic: fmt(today), bitis: fmt(today) };
  if (key === "bu_hafta") {
    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay() + 1);
    return { baslangic: fmt(start), bitis: fmt(today) };
  }
  if (key === "gecen_ay") {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const end = new Date(today.getFullYear(), today.getMonth(), 0);
    return { baslangic: fmt(start), bitis: fmt(end) };
  }
  if (key === "bu_yil") {
    const start = new Date(today.getFullYear(), 0, 1);
    return { baslangic: fmt(start), bitis: fmt(today) };
  }
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  return { baslangic: fmt(start), bitis: fmt(today) };
}

function getPreviousRange(baslangic: string, bitis: string): { baslangic: string; bitis: string } {
  const start = parseLocalDate(baslangic);
  const end = parseLocalDate(bitis);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return { baslangic, bitis };
  const spanDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - spanDays + 1);
  return { baslangic: toLocalISODate(prevStart), bitis: toLocalISODate(prevEnd) };
}

function kaynakMeta(kaynak: string | PeriodKaynak) {
  return KAYNAK_OPTIONS.find((k) => k.key === kaynak) || KAYNAK_OPTIONS[0];
}

function DonemTahsilatInner({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeKurum, activeSube, activeEgitimYili } = useKurum();
  const { homeHref } = useFinansPath();
  const { href: odemeHref } = useOdemePath();

  const mode = (searchParams.get("mode") as PeriodMode) || "alinan";
  const baslangic = searchParams.get("baslangic") || getPresetRange("bu_ay").baslangic;
  const bitis = searchParams.get("bitis") || getPresetRange("bu_ay").bitis;
  const kaynak = (searchParams.get("kaynak") as PeriodKaynak) || "hepsi";
  const page = Number(searchParams.get("page") || "1");
  const pageSize = Number(searchParams.get("page_size") || "20");

  const [ozet, setOzet] = useState<PeriodSummary | null>(null);
  const [prevOzet, setPrevOzet] = useState<PeriodSummary | null>(null);
  const [items, setItems] = useState<PeriodDetailItem[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [odemeYontemleri, setOdemeYontemleri] = useState<{ id: number; ad: string; tip: string }[]>([]);
  const [selectedYontemTipleri, setSelectedYontemTipleri] = useState<string[]>([]);

  useEffect(() => {
    if (!activeKurum) return;
    paymentMethodService.list({
      kurum_id: String(activeKurum.id),
      ...(activeSube?.id ? { sube_id: String(activeSube.id) } : {}),
    })
      .then((res) => setOdemeYontemleri((res.odeme_yontemleri || []).filter((o) => o.aktif_mi)))
      .catch(() => setOdemeYontemleri([]));
  }, [activeKurum, activeSube?.id]);

  const updateParams = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([k, v]) => {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    });
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  const queryParams: PeriodQueryParams | null = useMemo(() => {
    if (!activeKurum) return null;
    return {
      kurum_id: activeKurum.id,
      sube_id: activeSube?.id,
      egitim_yili_id: activeEgitimYili?.id,
      baslangic, bitis, mode, kaynak,
      odeme_yontemi_tipi: selectedYontemTipleri.length ? selectedYontemTipleri : undefined,
      page, page_size: pageSize,
    };
  }, [activeKurum, activeSube, activeEgitimYili, baslangic, bitis, mode, kaynak, selectedYontemTipleri, page, pageSize]);

  const prevRange = useMemo(() => getPreviousRange(baslangic, bitis), [baslangic, bitis]);
  const prevQueryParams: PeriodQueryParams | null = useMemo(() => {
    if (!queryParams) return null;
    return { ...queryParams, baslangic: prevRange.baslangic, bitis: prevRange.bitis };
  }, [queryParams, prevRange]);

  const load = useCallback(async () => {
    if (!queryParams) return;
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, detailsRes] = await Promise.all([
        periodService.summary(queryParams),
        periodService.details(queryParams),
      ]);
      setOzet(summaryRes.ozet);
      setItems(detailsRes.results || []);
      setCount(detailsRes.count);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Veri yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [queryParams]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!prevQueryParams) return;
    let cancelled = false;
    periodService.summary(prevQueryParams)
      .then((res) => { if (!cancelled) setPrevOzet(res.ozet); })
      .catch(() => { if (!cancelled) setPrevOzet(null); });
    return () => { cancelled = true; };
  }, [prevQueryParams]);

  const yontemTipleri = useMemo(() => {
    const seen = new Map<string, string>(Object.entries(YONTEM_TIP_LABELS));
    for (const o of odemeYontemleri) {
      if (o.tip && !seen.has(o.tip)) seen.set(o.tip, YONTEM_TIP_LABELS[o.tip] || o.ad);
    }
    return Array.from(seen.entries()).map(([tip, label]) => ({ tip, label }));
  }, [odemeYontemleri]);

  const activePreset = DATE_PRESETS.find((p) => {
    const r = getPresetRange(p.key);
    return r.baslangic === baslangic && r.bitis === bitis;
  });

  const modeIsAlinan = mode === "alinan";
  const ortalama = ozet && ozet.toplam_adet > 0 ? ozet.toplam_tutar / ozet.toplam_adet : 0;

  let delta: number | null = null;
  if (ozet && prevOzet && prevOzet.toplam_tutar > 0) {
    delta = ((ozet.toplam_tutar - prevOzet.toplam_tutar) / prevOzet.toplam_tutar) * 100;
  } else if (ozet && prevOzet && prevOzet.toplam_tutar === 0 && ozet.toplam_tutar > 0) {
    delta = 100;
  }

  const yontemPie = (ozet?.yontem_dagilimi || []).map((y, i) => ({
    name: y.yontem, value: y.toplam, oran: y.oran, color: CHART_COLORS[i % CHART_COLORS.length],
  }));
  const kaynakBar = (ozet?.kaynak_kirilimi || []).map((k) => ({
    name: k.kaynak_label, tutar: k.toplam, adet: k.adet, color: kaynakMeta(k.kaynak).color,
  }));

  const getRowLink = (item: PeriodDetailItem): string | null => {
    if (item.sozlesme_id) return `${odemeHref()}?sozlesme=${item.sozlesme_id}`;
    if (item.gelir_id) return `${homeHref}/gelir-v2`;
    if (item.cari_hesap_id) return `${homeHref}/cari-hesaplar-v2/${item.cari_hesap_id}`;
    return null;
  };

  const columns: ColumnsType<PeriodDetailItem> = useMemo(() => {
    const cols: ColumnsType<PeriodDetailItem> = [
      { title: "Kişi", dataIndex: "kisi_adi", key: "kisi", render: (v: string) => <span style={{ fontWeight: 600, color: "#0f172a" }}>{v}</span> },
    ];
    if (modeIsAlinan) {
      cols.push(
        { title: "Tutar", dataIndex: "tutar", key: "tutar", align: "right", render: (v: number) => <span style={{ fontWeight: 700, color: "#059669" }}>{fmtTL(v)}</span> },
        { title: "Yöntem", dataIndex: "odeme_yontemi", key: "yontem", render: (v: string) => v || "—" },
        { title: "Durum", key: "durum", render: (_: unknown, i) => <Tag color="green">{i.tahsil_durumu_label || "Alındı"}</Tag> },
        { title: "Tarih", dataIndex: "tarih", key: "tarih", render: (v: string) => fmtDate(v) },
      );
    } else {
      cols.push(
        { title: "Toplam", key: "toplam", align: "right", render: (_: unknown, i) => fmtTL(i.toplam_tutar ?? i.tutar) },
        { title: "Alınan", key: "alinan", align: "right", render: (_: unknown, i) => <span style={{ color: "#059669" }}>{fmtTL(i.odenen_tutar ?? 0)}</span> },
        { title: "Kalan", key: "kalan", align: "right", render: (_: unknown, i) => <span style={{ color: "#d97706", fontWeight: 700 }}>{fmtTL(i.kalan_tutar ?? i.tutar)}</span> },
        { title: "Yöntem", dataIndex: "odeme_yontemi", key: "yontem", render: (v: string) => v || "—" },
        {
          title: "Durum", key: "durum", render: (_: unknown, i) => (
            <Tag color={i.tahsil_durumu === "odendi" ? "green" : i.tahsil_durumu === "kismi" ? "gold" : "red"}>{i.tahsil_durumu_label || "—"}</Tag>
          ),
        },
        { title: "Vade", key: "vade", render: (_: unknown, i) => fmtDate(i.vade_tarihi || i.tarih) },
      );
    }
    cols.push(
      { title: "Kaynak", key: "kaynak", render: (_: unknown, i) => { const m = kaynakMeta(i.kaynak); return <Tag color={m.color}>{i.kaynak_label}</Tag>; } },
      {
        title: "", key: "detay", align: "center", width: 60,
        render: (_: unknown, i) => { const link = getRowLink(i); return link ? <Link href={link} style={{ color: "#2563eb", fontWeight: 600 }}>Git →</Link> : <span style={{ color: "#cbd5e1" }}>—</span>; },
      },
    );
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeIsAlinan, odemeHref, homeHref]);

  if (!activeKurum) {
    return <Card style={{ textAlign: "center", padding: 32 }}><Empty description="Dönem tahsilat verilerini görüntülemek için kurum seçin." /></Card>;
  }

  return (
    <div style={{ padding: embedded ? 0 : "4px 4px 40px" }}>
      {!embedded && (
        <div style={{ background: modeIsAlinan ? "linear-gradient(120deg, #05966915, #ffffff)" : "linear-gradient(120deg, #d9770615, #ffffff)", border: "1px solid #eef2f7", borderRadius: 16, padding: "18px 22px", marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0f172a" }}>Dönem Tahsilat</h1>
          <p style={{ margin: "2px 0 0", color: "#64748b", fontSize: 13 }}>Seçili dönemdeki tahsilat ve beklenen ödemeleri analiz edin.</p>
        </div>
      )}

      {/* Kontrol çubuğu */}
      <Card size="small" style={{ marginBottom: 16 }} styles={{ body: { padding: 12 } }}>
        <Space wrap style={{ width: "100%", justifyContent: "space-between" }}>
          <Space wrap>
            <Segmented
              value={mode}
              onChange={(v) => updateParams({ mode: String(v), page: "1" })}
              options={[{ value: "alinan", label: "Alınan" }, { value: "beklenen", label: "Beklenen" }]}
            />
            <Segmented
              value={activePreset?.key || "custom"}
              onChange={(v) => { if (v === "custom") return; const r = getPresetRange(String(v)); updateParams({ baslangic: r.baslangic, bitis: r.bitis, page: "1" }); }}
              options={[...DATE_PRESETS.map((p) => ({ value: p.key, label: p.label })), ...(activePreset ? [] : [{ value: "custom", label: fmtRange(baslangic, bitis) }])]}
            />
            <RangePicker
              format="DD.MM.YYYY"
              allowClear={false}
              value={[dayjs(baslangic), dayjs(bitis)]}
              onChange={(d) => { if (d && d[0] && d[1]) updateParams({ baslangic: d[0].format("YYYY-MM-DD"), bitis: d[1].format("YYYY-MM-DD"), page: "1" }); }}
            />
          </Space>
          {queryParams && (
            <ExportDropdown
              buildPath={(format, orientation) => periodService.reportExportUrl(queryParams, format, orientation)}
              filenamePrefix={`donem-tahsilat-${mode}`}
              disabled={loading}
            />
          )}
        </Space>
        <Space wrap style={{ marginTop: 12 }}>
          <span style={{ fontSize: 12, color: "#64748b" }}>Kaynak:</span>
          <Segmented
            value={kaynak}
            onChange={(v) => updateParams({ kaynak: v === "hepsi" ? null : String(v), page: "1" })}
            options={KAYNAK_OPTIONS.map((k) => ({ value: k.key, label: k.label }))}
          />
          {yontemTipleri.length > 0 && (
            <>
              <span style={{ fontSize: 12, color: "#64748b", marginLeft: 8 }}>Yöntem:</span>
              {yontemTipleri.map((o) => {
                const active = selectedYontemTipleri.includes(o.tip);
                return (
                  <Tag.CheckableTag
                    key={o.tip}
                    checked={active}
                    onChange={() => { setSelectedYontemTipleri((prev) => prev.includes(o.tip) ? prev.filter((x) => x !== o.tip) : [...prev, o.tip]); updateParams({ page: "1" }); }}
                  >
                    {o.label}
                  </Tag.CheckableTag>
                );
              })}
            </>
          )}
        </Space>
      </Card>

      {loading ? (
        <div style={{ padding: 80, textAlign: "center" }}><Spin size="large" /></div>
      ) : error ? (
        <div style={{ padding: 48, textAlign: "center" }}>
          <p style={{ color: "#dc2626", fontWeight: 600, marginBottom: 12 }}>{error}</p>
          <Button danger onClick={load}>Tekrar Dene</Button>
        </div>
      ) : (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          {/* KPI'lar */}
          {ozet && (
            <Row gutter={[12, 12]}>
              <Col xs={12} lg={6}>
                <Card size="small">
                  <Statistic
                    title={<span style={{ fontSize: 12, color: "#64748b" }}>{modeIsAlinan ? "Toplam Tahsilat" : "Toplam Beklenen"}</span>}
                    value={fmtTL(ozet.toplam_tutar)}
                    valueStyle={{ fontWeight: 800, fontSize: 18, color: modeIsAlinan ? "#059669" : "#d97706" }}
                  />
                  {delta !== null && (
                    <div style={{ fontSize: 12, color: delta >= 0 ? "#059669" : "#dc2626", marginTop: 2 }}>
                      {delta >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />} %{Math.abs(delta).toFixed(1)} · önceki dönem
                    </div>
                  )}
                </Card>
              </Col>
              <Col xs={12} lg={6}><Card size="small"><Statistic title={<span style={{ fontSize: 12, color: "#64748b" }}>Kayıt Adedi</span>} value={ozet.toplam_adet} valueStyle={{ fontWeight: 800, fontSize: 18, color: "#2563eb" }} /></Card></Col>
              <Col xs={12} lg={6}><Card size="small"><Statistic title={<span style={{ fontSize: 12, color: "#64748b" }}>{modeIsAlinan ? "Ortalama Tahsilat" : "Toplam Alınan"}</span>} value={fmtTL(modeIsAlinan ? ortalama : (ozet.toplam_alinan ?? 0))} valueStyle={{ fontWeight: 800, fontSize: 18, color: "#7c3aed" }} /></Card></Col>
              <Col xs={12} lg={6}>
                <Card size="small">
                  {ozet.tahsil_orani != null ? (
                    <Statistic title={<span style={{ fontSize: 12, color: "#64748b" }}>Tahsil Oranı</span>} value={`%${ozet.tahsil_orani.toFixed(1)}`} valueStyle={{ fontWeight: 800, fontSize: 18, color: "#059669" }} />
                  ) : !modeIsAlinan && ozet.toplam_kalan != null ? (
                    <Statistic title={<span style={{ fontSize: 12, color: "#64748b" }}>Toplam Kalan</span>} value={fmtTL(ozet.toplam_kalan)} valueStyle={{ fontWeight: 800, fontSize: 18, color: "#d97706" }} />
                  ) : (
                    <Statistic title={<span style={{ fontSize: 12, color: "#64748b" }}>Önceki Dönem</span>} value={prevOzet ? fmtTL(prevOzet.toplam_tutar) : "—"} valueStyle={{ fontWeight: 800, fontSize: 18, color: "#64748b" }} />
                  )}
                </Card>
              </Col>
            </Row>
          )}

          {/* Grafikler */}
          {ozet && (
            <Row gutter={[12, 12]}>
              <Col xs={24} lg={12}>
                <Card size="small" title="Yöntem Dağılımı">
                  {yontemPie.length === 0 ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Bu aralıkta veri yok" />
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <ResponsiveContainer width={180} height={180}>
                        <PieChart>
                          <Pie data={yontemPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={2}>
                            {yontemPie.map((s, i) => <Cell key={i} fill={s.color} />)}
                          </Pie>
                          <RTooltip formatter={(v?: number | string) => fmtTL(Number(v ?? 0))} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div style={{ flex: 1, minWidth: 180 }}>
                        {yontemPie.map((y, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                            <span style={{ width: 10, height: 10, borderRadius: 3, background: y.color }} />
                            <span style={{ flex: 1, fontSize: 13, color: "#475569" }}>{y.name}</span>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{fmtTL(y.value)}</span>
                            <span style={{ fontSize: 11, color: "#94a3b8", width: 44, textAlign: "right" }}>%{y.oran?.toFixed?.(1) ?? "0"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
              </Col>
              <Col xs={24} lg={12}>
                <Card size="small" title="Kaynak Kırılımı">
                  {kaynakBar.length === 0 ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Kaynak verisi yok" />
                  ) : (
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={kaynakBar} layout="vertical" margin={{ left: 8, right: 16 }}>
                        <XAxis type="number" tickFormatter={(v: number) => fmtTL(v)} tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
                        <RTooltip formatter={(v?: number | string) => fmtTL(Number(v ?? 0))} />
                        <Bar dataKey="tutar" radius={[0, 4, 4, 0]}>
                          {kaynakBar.map((k, i) => <Cell key={i} fill={k.color} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </Card>
              </Col>
            </Row>
          )}

          {/* Tablo */}
          <Card size="small" title="İşlem Detayları" extra={<span style={{ fontSize: 12, color: "#64748b" }}>{count} kayıt</span>} styles={{ body: { padding: 0 } }}>
            <Table
              rowKey={(r) => `${r.kaynak}-${r.id}`}
              size="small"
              columns={columns}
              dataSource={items}
              locale={{ emptyText: <Empty description={`Bu aralıkta ${modeIsAlinan ? "tahsilat" : "beklenen ödeme"} yok`} /> }}
              pagination={{
                current: page,
                pageSize,
                total: count,
                showSizeChanger: true,
                pageSizeOptions: [10, 20, 50],
                showTotal: (t) => `Toplam ${t} kayıt`,
                onChange: (p, ps) => updateParams({ page: String(p), page_size: String(ps) }),
              }}
              scroll={{ x: "max-content" }}
            />
          </Card>
        </Space>
      )}
    </div>
  );
}

export default function DonemTahsilatClient({ embedded = false }: { embedded?: boolean }) {
  return (
    <GGProvider>
      <DonemTahsilatInner embedded={embedded} />
    </GGProvider>
  );
}
