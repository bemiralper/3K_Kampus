"use client";

import type { ReactElement, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  App as AntApp,
  Button,
  Card,
  Col,
  Empty,
  Row,
  Space,
  Spin,
  Statistic,
  Table,
  Tabs,
  Tag,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { DownloadOutlined, FileExcelOutlined, FilePdfOutlined } from "@ant-design/icons";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useKurum } from "@/lib/contexts/KurumContext";
import GGProvider from "../gelir-gider-v2/GGProvider";
import {
  raporService,
  type RaporExportEndpoint,
  type RaporExportFormat,
} from "../services/rapor-api";
import type {
  BorcYaslandirma,
  DonemRapor,
  GelirGiderRapor,
  TahsilatAnaliz,
  YaslandirmaDetay,
} from "../types/rapor-types";

const PALETTE = ["#1F3C88", "#2563eb", "#059669", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#db2777"];

const DURUM_LABELS: Record<string, string> = {
  beklemede: "Beklemede",
  odendi: "Ödendi",
  gecikti: "Gecikti",
  kismi_odendi: "Kısmi Ödendi",
  iptal: "İptal",
  taslak: "Taslak",
  aktif: "Aktif",
  dondurulmus: "Dondurulmuş",
  tamamlandi: "Tamamlandı",
  feshedilmis: "Feshedilmiş",
};

const DURUM_RENK: Record<string, string> = {
  odendi: "green",
  tamamlandi: "green",
  aktif: "blue",
  beklemede: "gold",
  kismi_odendi: "cyan",
  gecikti: "red",
  dondurulmus: "orange",
  feshedilmis: "red",
  iptal: "default",
  taslak: "default",
};

function fmtTL(v: number | null | undefined): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v || 0);
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `%${Number(v).toFixed(1)}`;
}

type CtxParams = { kurum_id: number; sube_id?: number; egitim_yili_id?: number };

function useCtx(): CtxParams | null {
  const { activeKurum, activeSube, activeEgitimYili } = useKurum();
  return useMemo(() => {
    if (!activeKurum?.id) return null;
    return { kurum_id: activeKurum.id, sube_id: activeSube?.id, egitim_yili_id: activeEgitimYili?.id };
  }, [activeKurum?.id, activeSube?.id, activeEgitimYili?.id]);
}

function ExportButtons({ endpoint, ctx, disabled }: { endpoint: RaporExportEndpoint; ctx: CtxParams | null; disabled?: boolean }) {
  const { message } = AntApp.useApp();
  const [busy, setBusy] = useState(false);

  const run = async (fmt: RaporExportFormat) => {
    if (!ctx) return;
    setBusy(true);
    message.loading({ content: "Dışa aktarılıyor…", key: "rexp" });
    try {
      const { blob, filename } = await raporService.export(endpoint, fmt, ctx);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      message.success({ content: "İndirildi.", key: "rexp" });
    } catch (e) {
      message.error({ content: e instanceof Error ? e.message : "Dışa aktarılamadı.", key: "rexp" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Space wrap>
      <Button icon={<FilePdfOutlined />} loading={busy} disabled={disabled} onClick={() => run("pdf")}>PDF</Button>
      <Button icon={<FileExcelOutlined />} loading={busy} disabled={disabled} onClick={() => run("xlsx")}>Excel</Button>
      <Button icon={<DownloadOutlined />} loading={busy} disabled={disabled} onClick={() => run("csv")}>CSV</Button>
    </Space>
  );
}

function KpiCard({ label, value, color, i = 0 }: { label: string; value: ReactNode; color?: string; i?: number }) {
  return (
    <Card size="small">
      <Statistic
        title={<span style={{ fontSize: 12, color: "#64748b" }}>{label}</span>}
        value={value as string}
        valueStyle={{ fontSize: 20, fontWeight: 800, color: color || PALETTE[i % PALETTE.length] }}
      />
    </Card>
  );
}

function ChartCard({ title, children, span = 12 }: { title: string; children: ReactNode; span?: number }) {
  return (
    <Col xs={24} lg={span}>
      <Card size="small" title={title}>
        <ResponsiveContainer width="100%" height={280}>
          {children as ReactElement}
        </ResponsiveContainer>
      </Card>
    </Col>
  );
}

function Loading() {
  return (
    <div style={{ padding: 80, textAlign: "center" }}>
      <Spin size="large" />
    </div>
  );
}

/* ─── Gelir-Gider ─────────────────────────────────────────── */
function GelirGiderTab({ ctx }: { ctx: CtxParams | null }) {
  const { message } = AntApp.useApp();
  const [data, setData] = useState<GelirGiderRapor | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!ctx) return;
    setLoading(true);
    try {
      setData(await raporService.gelirGider(ctx));
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Rapor yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [ctx, message]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loading />;
  if (!data) return <Empty description="Veri yok" />;

  const columns: ColumnsType<GelirGiderRapor["aylik"][number]> = [
    { title: "Dönem", dataIndex: "ay_label", key: "ay_label" },
    { title: "Gelir", dataIndex: "gelir", key: "gelir", align: "right", render: (v: number) => fmtTL(v) },
    { title: "İade", dataIndex: "iade", key: "iade", align: "right", render: (v: number) => fmtTL(v) },
    { title: "Gider", dataIndex: "gider", key: "gider", align: "right", render: (v: number) => fmtTL(v) },
    {
      title: "Net",
      dataIndex: "net",
      key: "net",
      align: "right",
      render: (v: number) => <span style={{ fontWeight: 700, color: v >= 0 ? "#059669" : "#dc2626" }}>{fmtTL(v)}</span>,
    },
  ];

  return (
    <>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} lg={6}><KpiCard label="Toplam Gelir" value={fmtTL(data.toplam_gelir)} color="#059669" /></Col>
        <Col xs={12} lg={6}><KpiCard label="Toplam İade" value={fmtTL(data.toplam_iade)} color="#d97706" /></Col>
        <Col xs={12} lg={6}><KpiCard label="Toplam Gider" value={fmtTL(data.toplam_gider)} color="#dc2626" /></Col>
        <Col xs={12} lg={6}><KpiCard label="Net Gelir" value={fmtTL(data.net_gelir)} color="#1F3C88" /></Col>
      </Row>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <ChartCard title="Aylık Gelir / Gider" span={16}>
          <BarChart data={data.aylik}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
            <XAxis dataKey="ay_label" fontSize={11} />
            <YAxis fontSize={11} />
            <RTooltip formatter={(v) => fmtTL(Number(v))} />
            <Legend />
            <Bar dataKey="gelir" name="Gelir" fill="#059669" radius={[4, 4, 0, 0]} />
            <Bar dataKey="gider" name="Gider" fill="#dc2626" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartCard>
        <ChartCard title="Ödeme Yöntemi Dağılımı" span={8}>
          <PieChart>
            <Pie data={data.yontem_dagilimi} dataKey="toplam" nameKey="yontem" cx="50%" cy="50%" outerRadius={90} label>
              {data.yontem_dagilimi.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Pie>
            <RTooltip formatter={(v) => fmtTL(Number(v))} />
          </PieChart>
        </ChartCard>
      </Row>

      <Card size="small" title="Aylık Detay">
        <Table rowKey="ay" size="small" columns={columns} dataSource={data.aylik} pagination={false} scroll={{ x: "max-content" }} />
      </Card>
    </>
  );
}

/* ─── Tahsilat Analizi ────────────────────────────────────── */
function TahsilatTab({ ctx }: { ctx: CtxParams | null }) {
  const { message } = AntApp.useApp();
  const [data, setData] = useState<TahsilatAnaliz | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!ctx) return;
    setLoading(true);
    try {
      setData(await raporService.tahsilatAnaliz(ctx));
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Rapor yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [ctx, message]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loading />;
  if (!data) return <Empty description="Veri yok" />;

  const durumCols: ColumnsType<TahsilatAnaliz["taksit_durum_dagilimi"][number]> = [
    { title: "Durum", dataIndex: "durum", key: "durum", render: (v: string) => <Tag color={DURUM_RENK[v] || "default"}>{DURUM_LABELS[v] || v}</Tag> },
    { title: "Adet", dataIndex: "adet", key: "adet", align: "right" },
    { title: "Tutar", dataIndex: "toplam", key: "toplam", align: "right", render: (v: number) => fmtTL(v) },
  ];

  return (
    <>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} lg={6}><KpiCard label="Toplam Alacak" value={fmtTL(data.toplam_alacak)} color="#1F3C88" /></Col>
        <Col xs={12} lg={6}><KpiCard label="Toplam Tahsil" value={fmtTL(data.toplam_tahsil)} color="#059669" /></Col>
        <Col xs={12} lg={6}><KpiCard label="Kalan Borç" value={fmtTL(data.kalan_borc)} color="#dc2626" /></Col>
        <Col xs={12} lg={6}><KpiCard label="Genel Tahsilat Oranı" value={fmtPct(data.genel_oran)} color="#2563eb" /></Col>
      </Row>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <ChartCard title="Aylık Tahsilat Performansı" span={16}>
          <BarChart data={data.aylik_performans}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
            <XAxis dataKey="ay_label" fontSize={11} />
            <YAxis fontSize={11} />
            <RTooltip formatter={(v) => fmtTL(Number(v))} />
            <Legend />
            <Bar dataKey="beklenen" name="Beklenen" fill="#94a3b8" radius={[4, 4, 0, 0]} />
            <Bar dataKey="tahsil_edilen" name="Tahsil Edilen" fill="#059669" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartCard>
        <Col xs={24} lg={8}>
          <Card size="small" title="Taksit Durumları">
            <Table rowKey="durum" size="small" columns={durumCols} dataSource={data.taksit_durum_dagilimi} pagination={false} />
          </Card>
        </Col>
      </Row>

      <Card size="small" title="Sözleşme Durum Dağılımı">
        <Table
          rowKey="durum"
          size="small"
          columns={durumCols}
          dataSource={data.sozlesme_dagilimi}
          pagination={false}
          scroll={{ x: "max-content" }}
        />
      </Card>
    </>
  );
}

/* ─── Alacak Vade (Borç Yaşlandırma) ──────────────────────── */
function YaslandirmaTab({ ctx }: { ctx: CtxParams | null }) {
  const { message } = AntApp.useApp();
  const [data, setData] = useState<BorcYaslandirma | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!ctx) return;
    setLoading(true);
    try {
      setData(await raporService.borcYaslandirma(ctx));
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Rapor yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [ctx, message]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loading />;
  if (!data) return <Empty description="Veri yok" />;

  const gruplar = [data.gruplar["0_30"], data.gruplar["31_60"], data.gruplar["61_90"], data.gruplar["90_plus"]];
  const grafik = gruplar.map((g) => ({ label: g.label, deger: g.toplam }));
  const detaylar: (YaslandirmaDetay & { grup: string })[] = [];
  gruplar.forEach((g) => g.detay.forEach((d) => detaylar.push({ ...d, grup: g.label })));

  const cols: ColumnsType<YaslandirmaDetay & { grup: string }> = [
    { title: "Aralık", dataIndex: "grup", key: "grup", render: (v: string) => <Tag color="volcano">{v}</Tag> },
    { title: "Sözleşme", dataIndex: "sozlesme_no", key: "sozlesme_no" },
    { title: "Öğrenci", dataIndex: "ogrenci_adi", key: "ogrenci_adi" },
    { title: "Taksit", dataIndex: "taksit_no", key: "taksit_no", align: "center", render: (v: number) => `#${v}` },
    { title: "Vade", dataIndex: "vade_tarihi", key: "vade_tarihi", render: (v: string) => new Date(v).toLocaleDateString("tr-TR") },
    { title: "Gecikme", dataIndex: "gecikme_gun", key: "gecikme_gun", align: "center", render: (v: number) => `${v} gün` },
    { title: "Kalan", dataIndex: "kalan", key: "kalan", align: "right", render: (v: number) => <span style={{ fontWeight: 700, color: "#dc2626" }}>{fmtTL(v)}</span> },
  ];

  return (
    <>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {gruplar.map((g, i) => (
          <Col key={g.label} xs={12} lg={6}>
            <Card size="small">
              <Statistic
                title={<span style={{ fontSize: 12, color: "#64748b" }}>{g.label}</span>}
                value={fmtTL(g.toplam)}
                valueStyle={{ fontSize: 18, fontWeight: 800, color: ["#d97706", "#ea580c", "#dc2626", "#991b1b"][i] }}
              />
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{g.adet} taksit</div>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <ChartCard title="Yaşlandırma Dağılımı" span={24}>
          <BarChart data={grafik}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
            <XAxis dataKey="label" fontSize={11} />
            <YAxis fontSize={11} />
            <RTooltip formatter={(v) => fmtTL(Number(v))} />
            <Bar dataKey="deger" name="Kalan Borç" fill="#dc2626" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ChartCard>
      </Row>

      <Card size="small" title={`Geciken Taksit Detayı — Toplam ${fmtTL(data.toplam_geciken_tutar)} (${data.toplam_geciken_adet} taksit)`}>
        <Table
          rowKey={(r) => `${r.sozlesme_id}-${r.taksit_no}`}
          size="small"
          columns={cols}
          dataSource={detaylar}
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `${t} satır` }}
          locale={{ emptyText: <Empty description="Geciken taksit yok" /> }}
          scroll={{ x: "max-content" }}
        />
      </Card>
    </>
  );
}

/* ─── Dönem Raporu ────────────────────────────────────────── */
function DonemTab({ ctx }: { ctx: CtxParams | null }) {
  const { message } = AntApp.useApp();
  const [data, setData] = useState<DonemRapor | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!ctx) return;
    setLoading(true);
    try {
      setData(await raporService.donemRapor(ctx));
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Rapor yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [ctx, message]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loading />;
  if (!data) return <Empty description="Veri yok" />;

  const ozet = data.donem_ozet;
  const yillar = data.yillar_arasi || [];

  const yilCols: ColumnsType<DonemRapor["yillar_arasi"][number]> = [
    { title: "Eğitim Yılı", dataIndex: "yil", key: "yil" },
    { title: "Dönem Başı", dataIndex: "donem_basi", key: "donem_basi", align: "right", render: (v: number) => fmtTL(v) },
    { title: "Gelir", dataIndex: "toplam_gelir", key: "toplam_gelir", align: "right", render: (v: number) => fmtTL(v) },
    { title: "Gider", dataIndex: "toplam_gider", key: "toplam_gider", align: "right", render: (v: number) => fmtTL(v) },
    {
      title: "Net Kâr",
      dataIndex: "net_kar",
      key: "net_kar",
      align: "right",
      render: (v: number) => <span style={{ fontWeight: 700, color: v >= 0 ? "#059669" : "#dc2626" }}>{fmtTL(v)}</span>,
    },
    { title: "Dönem Sonu", dataIndex: "donem_sonu_bakiye", key: "donem_sonu_bakiye", align: "right", render: (v: number) => fmtTL(v) },
    {
      title: "Değişim",
      dataIndex: "degisim_yuzde",
      key: "degisim_yuzde",
      align: "right",
      render: (v: number | null) =>
        v == null ? "—" : <Tag color={v >= 0 ? "green" : "red"}>{v >= 0 ? "▲" : "▼"} {fmtPct(Math.abs(v))}</Tag>,
    },
  ];

  return (
    <>
      {ozet && (
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col xs={12} lg={6}><KpiCard label="Toplam Gelir" value={fmtTL(ozet.toplam_gelir)} color="#059669" /></Col>
          <Col xs={12} lg={6}><KpiCard label="Toplam Gider" value={fmtTL(ozet.toplam_gider)} color="#dc2626" /></Col>
          <Col xs={12} lg={6}><KpiCard label="Net Kâr" value={fmtTL(ozet.net_kar)} color="#1F3C88" /></Col>
          <Col xs={12} lg={6}><KpiCard label="Toplam Bakiye" value={fmtTL(ozet.toplam_bakiye)} color="#2563eb" /></Col>
        </Row>
      )}

      {yillar.length > 0 && (
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <ChartCard title="Yıllar Arası Karşılaştırma" span={24}>
            <LineChart data={yillar}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis dataKey="yil" fontSize={11} />
              <YAxis fontSize={11} />
              <RTooltip formatter={(v) => fmtTL(Number(v))} />
              <Legend />
              <Line type="monotone" dataKey="toplam_gelir" name="Gelir" stroke="#059669" strokeWidth={2} />
              <Line type="monotone" dataKey="toplam_gider" name="Gider" stroke="#dc2626" strokeWidth={2} />
              <Line type="monotone" dataKey="net_kar" name="Net Kâr" stroke="#1F3C88" strokeWidth={2} />
            </LineChart>
          </ChartCard>
        </Row>
      )}

      <Card size="small" title="Yıllar Arası Özet">
        <Table
          rowKey="egitim_yili_id"
          size="small"
          columns={yilCols}
          dataSource={yillar}
          pagination={false}
          locale={{ emptyText: <Empty description="Karşılaştırma verisi yok" /> }}
          scroll={{ x: "max-content" }}
        />
      </Card>

      {!ozet && (
        <div style={{ marginTop: 12, fontSize: 12, color: "#94a3b8" }}>
          Dönem özeti için üst menüden bir eğitim yılı seçin.
        </div>
      )}
    </>
  );
}

function RaporlamaInner({ embedded = false }: { embedded?: boolean }) {
  const ctx = useCtx();
  const [tab, setTab] = useState<RaporExportEndpoint>("gelir-gider");

  if (!ctx) {
    return <div style={{ padding: 48, textAlign: "center", color: "#64748b" }}>Lütfen kurum ve şube seçin.</div>;
  }

  const items = [
    { key: "gelir-gider" as const, label: "Gelir-Gider", children: <GelirGiderTab ctx={ctx} /> },
    { key: "tahsilat-analiz" as const, label: "Tahsilat Analizi", children: <TahsilatTab ctx={ctx} /> },
    { key: "borc-yaslandirma" as const, label: "Alacak Vade Analizi", children: <YaslandirmaTab ctx={ctx} /> },
    { key: "donem" as const, label: "Dönem Raporu", children: <DonemTab ctx={ctx} /> },
  ];

  return (
    <div style={{ padding: embedded ? 0 : "4px 4px 40px" }}>
      {!embedded && (
        <div
          style={{
            background: "linear-gradient(120deg, #1F3C880d, #ffffff)",
            border: "1px solid #eef2f7",
            borderRadius: 16,
            padding: "18px 22px",
            marginBottom: 16,
          }}
        >
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0f172a" }}>Mali Analiz</h1>
          <p style={{ margin: "2px 0 0", color: "#64748b", fontSize: 13 }}>
            Gelir-gider, tahsilat performansı, alacak yaşlandırma ve dönem bazlı analizler.
          </p>
        </div>
      )}

      <Tabs
        activeKey={tab}
        onChange={(k) => setTab(k as RaporExportEndpoint)}
        tabBarExtraContent={{ right: <ExportButtons endpoint={tab} ctx={ctx} /> }}
        items={items}
      />
    </div>
  );
}

export default function RaporlamaClient({ embedded = false }: { embedded?: boolean }) {
  return (
    <GGProvider>
      <RaporlamaInner embedded={embedded} />
    </GGProvider>
  );
}
