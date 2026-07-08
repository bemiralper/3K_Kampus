"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  App as AntApp,
  Button,
  Card,
  Col,
  Empty,
  Input,
  Row,
  Segmented,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Tooltip,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  FileTextOutlined,
  PlusCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useKurum } from "@/lib/contexts/KurumContext";
import { useOdemePath } from "@/components/odeme-takip/OdemePathProvider";
import GGProvider from "../gelir-gider-v2/GGProvider";
import { odemeTakipBridge } from "../services/odeme-takip-bridge";
import type { VadesiGelenlerDonem, VadesiGelenTaksit } from "../types/para-hareketi-types";
import { fmtDate, fmtTL } from "@/components/finans/FinansFilterBar";
import TahsilatAlModal from "../para-hareketleri/modals/TahsilatAlModal";

const DONEM_OPTIONS: { value: VadesiGelenlerDonem; label: string }[] = [
  { value: "bugun", label: "Bugün" },
  { value: "yarin", label: "Yarın" },
  { value: "hafta", label: "Bu Hafta" },
  { value: "ay", label: "Bu Ay" },
];

const ACCENT = "#d97706";

function kalanGunTag(gun: number) {
  if (gun <= 0) return <Tag color="red">Bugün</Tag>;
  if (gun <= 3) return <Tag color="volcano">{gun} gün</Tag>;
  if (gun <= 7) return <Tag color="gold">{gun} gün</Tag>;
  return <Tag color="blue">{gun} gün</Tag>;
}

function buildVadeDagilim(rows: VadesiGelenTaksit[]) {
  const buckets = [
    { key: "bugun", label: "Bugün", deger: 0 },
    { key: "1-3", label: "1-3 gün", deger: 0 },
    { key: "4-7", label: "4-7 gün", deger: 0 },
    { key: "8+", label: "8+ gün", deger: 0 },
  ];
  for (const r of rows) {
    const g = r.kalan_gun ?? 0;
    const tutar = r.kalan_tutar || 0;
    if (g <= 0) buckets[0].deger += tutar;
    else if (g <= 3) buckets[1].deger += tutar;
    else if (g <= 7) buckets[2].deger += tutar;
    else buckets[3].deger += tutar;
  }
  return buckets;
}

function VadesiGelenlerInner({ embedded = false }: { embedded?: boolean }) {
  const { message } = AntApp.useApp();
  const router = useRouter();
  const { activeKurum, activeSube, activeEgitimYili } = useKurum();
  const { href: odemeHref } = useOdemePath();

  const [donem, setDonem] = useState<VadesiGelenlerDonem>("hafta");
  const [arama, setArama] = useState("");
  const [rows, setRows] = useState<VadesiGelenTaksit[]>([]);
  const [toplamTutar, setToplamTutar] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tahsilatHedef, setTahsilatHedef] = useState<{ sozlesmeId: number; taksitId: number } | null>(null);

  const load = useCallback(async () => {
    if (!activeKurum?.id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await odemeTakipBridge.vadesiGelecekler({
        kurum_id: activeKurum.id,
        sube_id: activeSube?.id,
        egitim_yili_id: activeEgitimYili?.id,
        donem,
        arama: arama || undefined,
      });
      setRows(data.sonuclar || []);
      setToplamTutar(data.toplam_tutar || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Liste yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [activeKurum?.id, activeSube?.id, activeEgitimYili?.id, donem, arama]);

  useEffect(() => {
    const t = setTimeout(load, arama ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, arama]);

  const dagitim = useMemo(() => buildVadeDagilim(rows), [rows]);
  const enYakin = useMemo(() => {
    if (!rows.length) return null;
    return rows.reduce((min, r) => ((r.kalan_gun ?? 0) < (min.kalan_gun ?? 0) ? r : min), rows[0]);
  }, [rows]);

  const columns: ColumnsType<VadesiGelenTaksit> = [
    {
      title: "Öğrenci",
      dataIndex: "ogrenci_adi",
      key: "ogrenci_adi",
      render: (v: string) => <span style={{ fontWeight: 600, color: "#0f172a" }}>{v}</span>,
      sorter: (a, b) => (a.ogrenci_adi || "").localeCompare(b.ogrenci_adi || "", "tr"),
    },
    { title: "Veli", dataIndex: "veli_adi", key: "veli_adi", render: (v: string) => v || "—" },
    {
      title: "Sözleşme",
      dataIndex: "sozlesme_no",
      key: "sozlesme_no",
      render: (v: string) => <code style={{ fontSize: 12, background: "#f1f5f9", padding: "1px 6px", borderRadius: 6 }}>{v}</code>,
    },
    { title: "Taksit", dataIndex: "taksit_no", key: "taksit_no", align: "center", width: 80, render: (v: number) => `#${v}` },
    {
      title: "Vade",
      dataIndex: "vade_tarihi",
      key: "vade_tarihi",
      render: (v: string) => fmtDate(v),
      sorter: (a, b) => (a.vade_tarihi || "").localeCompare(b.vade_tarihi || ""),
    },
    {
      title: "Kalan Gün",
      dataIndex: "kalan_gun",
      key: "kalan_gun",
      align: "center",
      render: (g: number) => kalanGunTag(g ?? 0),
      sorter: (a, b) => (a.kalan_gun ?? 0) - (b.kalan_gun ?? 0),
      defaultSortOrder: "ascend",
    },
    {
      title: "Kalan Tutar",
      dataIndex: "kalan_tutar",
      key: "kalan_tutar",
      align: "right",
      render: (v: number) => <span style={{ fontWeight: 700, color: ACCENT }}>{fmtTL(v)}</span>,
      sorter: (a, b) => (a.kalan_tutar || 0) - (b.kalan_tutar || 0),
    },
    {
      title: "İşlem",
      key: "islem",
      align: "center",
      width: 120,
      render: (_: unknown, t: VadesiGelenTaksit) => (
        <Space size={4}>
          <Tooltip title="Sözleşmeye git">
            <Button
              size="small"
              type="text"
              icon={<FileTextOutlined />}
              onClick={() => router.push(`${odemeHref()}?sozlesme=${t.sozlesme_id}`)}
            />
          </Tooltip>
          <Tooltip title="Tahsilat Al">
            <Button
              size="small"
              type="primary"
              ghost
              icon={<PlusCircleOutlined />}
              onClick={() => setTahsilatHedef({ sozlesmeId: t.sozlesme_id, taksitId: t.id })}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  if (!activeKurum) {
    return (
      <Card style={{ textAlign: "center", padding: 32 }}>
        <Empty description="Vadesi gelen taksitleri görmek için üst menüden bir kurum seçin." />
      </Card>
    );
  }

  return (
    <div style={{ padding: embedded ? 0 : "4px 4px 40px" }}>
      {!embedded && (
        <div
          style={{
            background: "linear-gradient(120deg, #d977060d, #ffffff)",
            border: "1px solid #eef2f7",
            borderRadius: 16,
            padding: "18px 22px",
            marginBottom: 16,
          }}
        >
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0f172a" }}>Vadesi Gelenler</h1>
          <p style={{ margin: "2px 0 0", color: "#64748b", fontSize: 13 }}>
            Yaklaşan taksit vadelerini dönem bazında takip edin ve tek tıkla tahsilat alın.
          </p>
        </div>
      )}

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic
              title={<span style={{ fontSize: 12, color: "#64748b" }}>Toplam Vadesi Gelecek</span>}
              value={fmtTL(toplamTutar)}
              valueStyle={{ fontSize: 20, fontWeight: 800, color: ACCENT }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card size="small">
            <Statistic
              title={<span style={{ fontSize: 12, color: "#64748b" }}>Taksit Adedi</span>}
              value={rows.length}
              valueStyle={{ fontSize: 20, fontWeight: 800, color: "#1F3C88" }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card size="small">
            <Statistic
              title={<span style={{ fontSize: 12, color: "#64748b" }}>En Yakın Vade</span>}
              value={enYakin ? ((enYakin.kalan_gun ?? 0) <= 0 ? "Bugün" : `${enYakin.kalan_gun} gün`) : "—"}
              valueStyle={{ fontSize: 20, fontWeight: 800, color: "#dc2626" }}
            />
          </Card>
        </Col>
      </Row>

      <Card
        size="small"
        style={{ marginBottom: 16 }}
        styles={{ body: { padding: 12 } }}
      >
        <Space wrap style={{ width: "100%", justifyContent: "space-between" }}>
          <Segmented
            value={donem}
            onChange={(v) => setDonem(v as VadesiGelenlerDonem)}
            options={DONEM_OPTIONS}
          />
          <Space wrap>
            <Input
              allowClear
              prefix={<SearchOutlined style={{ color: "#94a3b8" }} />}
              placeholder="Öğrenci / sözleşme ara…"
              value={arama}
              onChange={(e) => setArama(e.target.value)}
              style={{ width: 240 }}
            />
            <Button icon={<ReloadOutlined />} onClick={load}>
              Yenile
            </Button>
          </Space>
        </Space>
      </Card>

      {dagitim.some((d) => d.deger > 0) && (
        <Card size="small" title="Vade Dağılımı" style={{ marginBottom: 16 }}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dagitim}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
              <XAxis dataKey="label" fontSize={11} />
              <YAxis fontSize={11} />
              <RTooltip formatter={(v) => fmtTL(Number(v))} />
              <Bar dataKey="deger" name="Kalan Tutar" fill={ACCENT} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      <Card size="small" styles={{ body: { padding: 0 } }}>
        {loading ? (
          <div style={{ padding: 80, textAlign: "center" }}>
            <Spin size="large" />
          </div>
        ) : error ? (
          <div style={{ padding: 48, textAlign: "center" }}>
            <p style={{ color: "#dc2626", fontWeight: 600, marginBottom: 12 }}>{error}</p>
            <Button onClick={load} danger>
              Tekrar Dene
            </Button>
          </div>
        ) : (
          <Table
            rowKey="id"
            size="small"
            columns={columns}
            dataSource={rows}
            locale={{ emptyText: <Empty description="Bu dönemde vadesi gelen taksit yok" /> }}
            pagination={{ pageSize: 25, showSizeChanger: true, showTotal: (t) => `Toplam ${t} taksit` }}
            scroll={{ x: "max-content" }}
          />
        )}
      </Card>

      {tahsilatHedef && (
        <TahsilatAlModal
          prefillSozlesmeId={tahsilatHedef.sozlesmeId}
          prefillTaksitId={tahsilatHedef.taksitId}
          onClose={() => setTahsilatHedef(null)}
          onSuccess={(msg) => {
            message.success(msg || "Tahsilat alındı.");
            setTahsilatHedef(null);
            load();
          }}
        />
      )}
    </div>
  );
}

export default function VadesiGelenlerClient({ embedded = false }: { embedded?: boolean }) {
  return (
    <GGProvider>
      <VadesiGelenlerInner embedded={embedded} />
    </GGProvider>
  );
}
