"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card, Row, Col, Statistic, Select, DatePicker, Button, Space, Table,
  Segmented, App as AntApp, Spin, Empty, Tabs, Dropdown,
} from "antd";
import type { MenuProps } from "antd";
import { DownloadOutlined, FilePdfOutlined, FileExcelOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend, ResponsiveContainer,
} from "recharts";
import { useKurum } from "@/lib/contexts/KurumContext";
import { ggService } from "./gg-v2-api";
import { GG_RAPORLAR, GGReport, TL } from "./gg-v2-types";

const { RangePicker } = DatePicker;
const PALETTE = ["#1F3C88", "#2563eb", "#059669", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#db2777"];

function fmt(v: unknown, format?: string): string {
  if (format === "tl") return TL(v as number);
  if (format === "pct") return `%${Number(v || 0).toFixed(2)}`;
  if (format === "int") return String(v ?? 0);
  if (format === "date" && v) return new Date(String(v)).toLocaleDateString("tr-TR");
  return String(v ?? "");
}

function ReportHeader() {
  return (
    <div
      style={{
        background: "linear-gradient(120deg, #1F3C880d, #ffffff)",
        border: "1px solid #eef2f7", borderRadius: 16, padding: "18px 22px", marginBottom: 16,
      }}
    >
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0f172a" }}>Gelir & Gider Raporları</h1>
      <p style={{ margin: "2px 0 0", color: "#64748b", fontSize: 13 }}>
        Finans analizleri, vade borç takibi ve kurumsal dışa aktarım (PDF / Excel / CSV)
      </p>
    </div>
  );
}

function useReportExport(message: ReturnType<typeof AntApp.useApp>["message"]) {
  const [exporting, setExporting] = useState(false);

  const exportReport = async (
    slug: string,
    f: "pdf" | "xlsx" | "csv",
    kurumId: number,
    subeId: number | null,
    params: Record<string, string>,
  ) => {
    setExporting(true);
    message.loading({ content: "Dışa aktarılıyor…", key: "rexp" });
    try {
      const { blob, filename } = await ggService.reportExport(slug, f, kurumId, subeId, params);
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
      setExporting(false);
    }
  };

  return { exporting, exportReport };
}

function AnalizRaporTab() {
  const { message } = AntApp.useApp();
  const { activeKurum, activeSube } = useKurum();
  const kurumId = activeKurum?.id;
  const subeId = activeSube?.id ?? null;

  const [slug, setSlug] = useState("finans-ozeti");
  const [modul, setModul] = useState<"gelir" | "gider">("gelir");
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [report, setReport] = useState<GGReport | null>(null);
  const [loading, setLoading] = useState(false);
  const { exporting, exportReport } = useReportExport(message);

  const params = useMemo(() => {
    const p: Record<string, string> = {};
    if (range) {
      p.baslangic = range[0].format("YYYY-MM-DD");
      p.bitis = range[1].format("YYYY-MM-DD");
    }
    if (slug === "kategori-analizi") p.modul = modul;
    return p;
  }, [range, slug, modul]);

  const load = useCallback(async () => {
    if (!kurumId) return;
    setLoading(true);
    try {
      setReport(await ggService.report(slug, kurumId, subeId, params));
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Rapor yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [kurumId, subeId, slug, params, message]);

  useEffect(() => { load(); }, [load]);

  if (!kurumId) return null;

  const columns = (report?.columns ?? []).map((c) => ({
    title: c.label,
    dataIndex: c.key,
    key: c.key,
    align: (c.format === "tl" || c.format === "int" || c.format === "pct" ? "right" : "left") as "right" | "left",
    render: (v: unknown) => fmt(v, c.format),
  }));

  const dagitim = (report?.seriler?.dagitim as { label: string; deger: number }[] | undefined) ?? [];
  const aylik = (report?.seriler?.aylik as { label: string; deger: number }[] | undefined) ?? [];
  const karsilastirma =
    (report?.seriler?.karsilastirma as { donem: string; gelir: number; gider: number; net: number }[] | undefined) ??
    (report?.seriler?.nakit as { donem: string; giris: number; cikis: number; net: number }[] | undefined) ??
    (report?.seriler?.ozet as { donem: string; gelir: number; gider: number; net: number }[] | undefined);

  return (
    <div>
      <Card size="small" style={{ marginBottom: 16 }} styles={{ body: { padding: 12 } }}>
        <Space wrap style={{ width: "100%", justifyContent: "space-between" }}>
          <Space wrap>
            <Select
              style={{ width: 240 }}
              value={slug}
              onChange={setSlug}
              options={GG_RAPORLAR.map((r) => ({ value: r.slug, label: r.ad }))}
            />
            {slug === "kategori-analizi" && (
              <Segmented
                value={modul}
                onChange={(v) => setModul(v as "gelir" | "gider")}
                options={[{ value: "gelir", label: "Gelir" }, { value: "gider", label: "Gider" }]}
              />
            )}
            <RangePicker
              format="DD.MM.YYYY"
              value={range as never}
              onChange={(d) => setRange(d && d[0] && d[1] ? [d[0], d[1]] : null)}
            />
          </Space>
          <Space wrap>
            <Button icon={<FilePdfOutlined />} loading={exporting} onClick={() => exportReport(slug, "pdf", kurumId, subeId, params)}>PDF</Button>
            <Button icon={<FileExcelOutlined />} loading={exporting} onClick={() => exportReport(slug, "xlsx", kurumId, subeId, params)}>Excel</Button>
            <Button icon={<DownloadOutlined />} loading={exporting} onClick={() => exportReport(slug, "csv", kurumId, subeId, params)}>CSV</Button>
          </Space>
        </Space>
      </Card>

      {loading ? (
        <div style={{ padding: 80, textAlign: "center" }}><Spin size="large" /></div>
      ) : !report ? (
        <Empty description="Rapor verisi yok" />
      ) : (
        <>
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            {report.kpis.map((k, i) => (
              <Col key={i} xs={12} sm={12} lg={6}>
                <Card size="small">
                  <Statistic
                    title={<span style={{ fontSize: 12, color: "#64748b" }}>{k.label}</span>}
                    value={k.format === "tl" ? TL(k.value) : k.value}
                    valueStyle={{ fontSize: 20, fontWeight: 800, color: PALETTE[i % PALETTE.length] }}
                  />
                </Card>
              </Col>
            ))}
          </Row>

          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            {dagitim.length > 0 && (
              <Col xs={24} lg={karsilastirma || aylik.length ? 12 : 24}>
                <Card size="small" title="Dağılım">
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={dagitim} dataKey="deger" nameKey="label" cx="50%" cy="50%" outerRadius={100} label>
                        {dagitim.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                      </Pie>
                      <RTooltip formatter={(v) => TL(v as number)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </Card>
              </Col>
            )}
            {aylik.length > 0 && (
              <Col xs={24} lg={dagitim.length ? 12 : 24}>
                <Card size="small" title="Aylık Seyir">
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={aylik}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                      <XAxis dataKey="label" fontSize={11} />
                      <YAxis fontSize={11} />
                      <RTooltip formatter={(v) => TL(v as number)} />
                      <Line type="monotone" dataKey="deger" stroke="#1F3C88" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>
              </Col>
            )}
            {karsilastirma && karsilastirma.length > 0 && (
              <Col xs={24}>
                <Card size="small" title="Karşılaştırma">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={karsilastirma as Record<string, unknown>[]}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                      <XAxis dataKey={("donem" in (karsilastirma[0] || {})) ? "donem" : "label"} fontSize={11} />
                      <YAxis fontSize={11} />
                      <RTooltip formatter={(v) => TL(v as number)} />
                      <Legend />
                      {"gelir" in karsilastirma[0] && <Bar dataKey="gelir" name="Gelir" fill="#059669" />}
                      {"gider" in karsilastirma[0] && <Bar dataKey="gider" name="Gider" fill="#dc2626" />}
                      {"giris" in karsilastirma[0] && <Bar dataKey="giris" name="Giriş" fill="#059669" />}
                      {"cikis" in karsilastirma[0] && <Bar dataKey="cikis" name="Çıkış" fill="#dc2626" />}
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              </Col>
            )}
          </Row>

          <Card size="small" title={report.baslik}>
            <Table
              rowKey={(_, i) => String(i)}
              size="small"
              columns={columns}
              dataSource={report.rows}
              pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `Toplam ${t} satır` }}
              scroll={{ x: "max-content" }}
            />
          </Card>
        </>
      )}
    </div>
  );
}

function VadeBorcRaporTab() {
  const { message } = AntApp.useApp();
  const { activeKurum, activeSube } = useKurum();
  const kurumId = activeKurum?.id;
  const subeId = activeSube?.id ?? null;

  const [vadeDurumu, setVadeDurumu] = useState<"tumu" | "gecmis" | "gelen" | "gelecek">("tumu");
  const [gorunum, setGorunum] = useState<"detay" | "ozet">("detay");
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>([
    dayjs().startOf("month"),
    dayjs().add(3, "month").endOf("month"),
  ]);
  const [report, setReport] = useState<GGReport | null>(null);
  const [loading, setLoading] = useState(false);
  const { exporting, exportReport } = useReportExport(message);

  const params = useMemo(() => {
    const p: Record<string, string> = { gorunum, vade_durumu: vadeDurumu };
    if (range) {
      p.baslangic = range[0].format("YYYY-MM-DD");
      p.bitis = range[1].format("YYYY-MM-DD");
    }
    return p;
  }, [range, gorunum, vadeDurumu]);

  const load = useCallback(async () => {
    if (!kurumId) return;
    setLoading(true);
    try {
      setReport(await ggService.report("vade-borc", kurumId, subeId, params));
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Rapor yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [kurumId, subeId, params, message]);

  useEffect(() => { load(); }, [load]);

  if (!kurumId) return null;

  const exportWithGorunum = (f: "pdf" | "xlsx" | "csv", g: "ozet" | "detay") =>
    exportReport("vade-borc", f, kurumId, subeId, { ...params, gorunum: g });

  const exportMenu: MenuProps["items"] = [
    { key: "pdf-ozet", icon: <FilePdfOutlined />, label: "PDF — Özet (cari bazlı)", onClick: () => exportWithGorunum("pdf", "ozet") },
    { key: "pdf-detay", icon: <FilePdfOutlined />, label: "PDF — Detaylı (taksit bazlı)", onClick: () => exportWithGorunum("pdf", "detay") },
    { type: "divider" },
    { key: "xlsx-ozet", icon: <FileExcelOutlined />, label: "Excel — Özet", onClick: () => exportWithGorunum("xlsx", "ozet") },
    { key: "xlsx-detay", icon: <FileExcelOutlined />, label: "Excel — Detaylı", onClick: () => exportWithGorunum("xlsx", "detay") },
    { type: "divider" },
    { key: "csv-detay", icon: <DownloadOutlined />, label: "CSV — Detaylı", onClick: () => exportWithGorunum("csv", "detay") },
  ];

  const columns = (report?.columns ?? []).map((c) => ({
    title: c.label,
    dataIndex: c.key,
    key: c.key,
    align: (c.format === "tl" || c.format === "int" ? "right" : "left") as "right" | "left",
    render: (v: unknown) => fmt(v, c.format),
  }));

  const dagitim = (report?.seriler?.vade_dagilim as { label: string; deger: number }[] | undefined) ?? [];

  return (
    <div>
      <Card
        size="small"
        style={{ marginBottom: 16, borderColor: "#fecaca", background: "linear-gradient(135deg, #fff5f5, #fff)" }}
        styles={{ body: { padding: 14 } }}
      >
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 10 }}>
          Tedarikçi cari hesaplarına bağlı <strong>ödenmemiş gider taksitlerini</strong> vade tarihine göre filtreleyin.
          Vadesi geçmiş, yaklaşan ve gelecek borçlarınızı cari veya taksit düzeyinde görüntüleyin.
        </div>
        <Space wrap style={{ width: "100%", justifyContent: "space-between" }}>
          <Space wrap>
            <Segmented
              value={vadeDurumu}
              onChange={(v) => setVadeDurumu(v as typeof vadeDurumu)}
              options={[
                { value: "tumu", label: "Tümü" },
                { value: "gecmis", label: "Vadesi Geçmiş" },
                { value: "gelen", label: "Vadesi Gelen" },
                { value: "gelecek", label: "Gelecek Vadeli" },
              ]}
            />
            <Segmented
              value={gorunum}
              onChange={(v) => setGorunum(v as "ozet" | "detay")}
              options={[
                { value: "detay", label: "Detaylı Liste" },
                { value: "ozet", label: "Cari Özeti" },
              ]}
            />
            <RangePicker
              format="DD.MM.YYYY"
              value={range as never}
              onChange={(d) => setRange(d && d[0] && d[1] ? [d[0], d[1]] : null)}
            />
          </Space>
          <Dropdown menu={{ items: exportMenu }} trigger={["click"]}>
            <Button icon={<DownloadOutlined />} loading={exporting} type="primary">
              Rapor İndir
            </Button>
          </Dropdown>
        </Space>
      </Card>

      {loading ? (
        <div style={{ padding: 80, textAlign: "center" }}><Spin size="large" /></div>
      ) : !report ? (
        <Empty description="Vade borç verisi yok" />
      ) : (
        <>
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            {report.kpis.map((k, i) => (
              <Col key={i} xs={12} sm={12} lg={6}>
                <Card size="small" style={i === 1 ? { borderColor: "#fecaca" } : undefined}>
                  <Statistic
                    title={<span style={{ fontSize: 12, color: "#64748b" }}>{k.label}</span>}
                    value={k.format === "tl" ? TL(k.value) : k.value}
                    valueStyle={{
                      fontSize: 20, fontWeight: 800,
                      color: i === 1 ? "#dc2626" : PALETTE[i % PALETTE.length],
                    }}
                  />
                </Card>
              </Col>
            ))}
          </Row>

          {dagitim.length > 0 && (
            <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
              <Col xs={24} lg={10}>
                <Card size="small" title="Vade Dağılımı">
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={dagitim} dataKey="deger" nameKey="label" cx="50%" cy="50%" outerRadius={90} label>
                        {dagitim.map((_, i) => (
                          <Cell key={i} fill={["#dc2626", "#d97706", "#2563eb"][i % 3]} />
                        ))}
                      </Pie>
                      <RTooltip formatter={(v) => TL(v as number)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </Card>
              </Col>
              <Col xs={24} lg={14}>
                <Card size="small" title="Vade Kırılımı">
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={dagitim}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                      <XAxis dataKey="label" fontSize={11} />
                      <YAxis fontSize={11} />
                      <RTooltip formatter={(v) => TL(v as number)} />
                      <Bar dataKey="deger" name="Kalan Borç" fill="#1F3C88" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              </Col>
            </Row>
          )}

          <Card size="small" title={report.baslik}>
            <Table
              rowKey={(_, i) => String(i)}
              size="small"
              columns={columns}
              dataSource={report.rows}
              pagination={{ pageSize: 25, showSizeChanger: true, showTotal: (t) => `Toplam ${t} satır` }}
              scroll={{ x: "max-content" }}
            />
          </Card>
        </>
      )}
    </div>
  );
}

export default function RaporClient({ embedded = false }: { embedded?: boolean }) {
  const { activeKurum } = useKurum();

  if (!activeKurum?.id) {
    return <div style={{ padding: 48, textAlign: "center", color: "#64748b" }}>Lütfen kurum ve şube seçin.</div>;
  }

  return (
    <div style={{ padding: embedded ? 0 : "4px 4px 40px" }}>
      {!embedded && <ReportHeader />}
      <Tabs
        defaultActiveKey="analiz"
        items={[
          {
            key: "analiz",
            label: "Finans Analizleri",
            children: <AnalizRaporTab />,
          },
          {
            key: "vade-borc",
            label: "Vade Borç Takibi",
            children: <VadeBorcRaporTab />,
          },
        ]}
      />
    </div>
  );
}
