"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  App as AntApp,
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Input,
  Row,
  Segmented,
  Space,
  Spin,
  Statistic,
  Table,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { WhatsAppOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useKurum } from "@/lib/contexts/KurumContext";
import { useFinansPath } from "@/components/finans/FinansPathProvider";
import ExportDropdown, { type ExportFormat } from "@/components/finans/ExportDropdown";
import GunSonuWhatsappModal from "@/components/finans/GunSonuWhatsappModal";
import GunSonuDetayView from "./GunSonuDetayView";
import GGProvider from "../gelir-gider-v2/GGProvider";
import { gunSonuService } from "../services/para-hareketi-api";
import type { GunSonuDetayRapor, GunSonuOzet, GunSonuOzetRapor } from "../types/para-hareketi-types";
import { fmtTL } from "@/components/finans/FinansFilterBar";
import { todayIsoLocal } from "@/lib/date-utils";

function todayIso() { return todayIsoLocal(); }

type ViewTab = "rapor" | "detay" | "canli";

function GunSonuInner({ embedded = false }: { embedded?: boolean }) {
  const { activeKurum, activeSube } = useKurum();

  const [gun, setGun] = useState(todayIso());
  const [notlar, setNotlar] = useState("");
  const notlarRef = useRef(notlar);
  notlarRef.current = notlar;
  const [viewTab, setViewTab] = useState<ViewTab>("rapor");
  const [ozet, setOzet] = useState<GunSonuOzet | null>(null);
  const [detay, setDetay] = useState<GunSonuDetayRapor | null>(null);
  const [loading, setLoading] = useState(true);
  const [detayLoading, setDetayLoading] = useState(false);
  const [detayError, setDetayError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [whatsappOpen, setWhatsappOpen] = useState(false);

  const load = useCallback(async () => {
    if (!activeKurum?.id) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const data = await gunSonuService.ozetRapor({
        kurum_id: activeKurum.id,
        gun,
        sube_id: activeSube?.id,
        notlar: notlarRef.current,
      });
      setOzet(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gün sonu özeti yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [activeKurum?.id, activeSube?.id, gun]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => { setDetay(null); setDetayError(null); }, [gun, activeSube?.id]);

  const loadDetay = useCallback(async () => {
    if (!activeKurum?.id) return;
    setDetayLoading(true);
    setDetayError(null);
    try {
      const data = await gunSonuService.detayRapor({
        kurum_id: activeKurum.id,
        gun,
        sube_id: activeSube?.id,
        notlar: notlarRef.current,
      });
      if (!data?.detay_rapor) throw new Error("Detay rapor verisi alınamadı");
      setDetay(data.detay_rapor);
    } catch (e) {
      setDetay(null);
      setDetayError(e instanceof Error ? e.message : "Detay rapor yüklenemedi");
    } finally {
      setDetayLoading(false);
    }
  }, [activeKurum?.id, activeSube?.id, gun]);

  useEffect(() => { if (viewTab === "detay") loadDetay(); }, [viewTab, loadDetay]);

  const rapor = ozet?.ozet_rapor;

  const buildExportPath = useCallback(
    (format: ExportFormat, orientation: "portrait" | "landscape") =>
      gunSonuService.exportPath({
        kurum_id: activeKurum!.id,
        gun,
        sube_id: activeSube?.id,
        notlar,
        format,
        orientation,
        rapor: viewTab === "detay" ? "detay" : "ozet",
      }),
    [activeKurum, activeSube?.id, gun, notlar, viewTab],
  );

  const filenamePrefix = useMemo(
    () => (viewTab === "detay" ? `gun-sonu-detay-${gun}` : `gun-sonu-ozet-${gun}`),
    [gun, viewTab],
  );

  if (!activeKurum) {
    return <Card style={{ textAlign: "center", padding: 32 }}><Empty description="Gün sonu özetini görmek için üst menüden bir kurum seçin." /></Card>;
  }

  return (
    <div style={{ padding: embedded ? 0 : "4px 4px 40px" }}>
      {!embedded && (
        <div style={{ background: "linear-gradient(120deg, #1F3C880d, #ffffff)", border: "1px solid #eef2f7", borderRadius: 16, padding: "18px 22px", marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0f172a" }}>Gün Sonu</h1>
          <p style={{ margin: "2px 0 0", color: "#64748b", fontSize: 13 }}>Günlük tahsilat, gider ve nakit özetini görüntüleyin, raporlayın.</p>
        </div>
      )}

      <Card size="small" style={{ marginBottom: 16 }} styles={{ body: { padding: 12 } }}>
        <Space wrap style={{ width: "100%", justifyContent: "space-between" }}>
          <Space wrap>
            <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Tarih</span>
            <DatePicker
              format="DD.MM.YYYY"
              allowClear={false}
              value={dayjs(gun)}
              disabledDate={(d) => d && d.isAfter(dayjs(), "day")}
              onChange={(d) => d && setGun(d.format("YYYY-MM-DD"))}
            />
            <Button onClick={() => setGun(todayIso())}>Bugün</Button>
          </Space>
          <Space wrap>
            <ExportDropdown
              buildPath={buildExportPath}
              filenamePrefix={filenamePrefix}
              disabled={loading || (viewTab === "detay" ? detayLoading || !detay : !ozet)}
              label={viewTab === "detay" ? "Detay Rapor İndir" : "Rapor İndir"}
            />
            <Button icon={<WhatsAppOutlined />} disabled={loading || !ozet} style={{ color: "#059669", borderColor: "#a7f3d0" }} onClick={() => setWhatsappOpen(true)}>
              WhatsApp Gönder
            </Button>
          </Space>
        </Space>
      </Card>

      <Segmented
        value={viewTab}
        onChange={(v) => setViewTab(v as ViewTab)}
        options={[
          { value: "rapor", label: "Özet Rapor" },
          { value: "detay", label: "Detay Rapor" },
          { value: "canli", label: "Canlı Özet" },
        ]}
        style={{ marginBottom: 16 }}
      />

      {loading ? (
        <div style={{ padding: 80, textAlign: "center" }}><Spin size="large" /></div>
      ) : error ? (
        <div style={{ padding: 48, textAlign: "center" }}>
          <p style={{ color: "#dc2626", fontWeight: 600, marginBottom: 12 }}>{error}</p>
          <Button danger onClick={load}>Tekrar Dene</Button>
        </div>
      ) : ozet && viewTab === "rapor" ? (
        rapor ? (
          <OzetRaporView rapor={rapor} notlar={notlar} onNotlarChange={setNotlar} onNotlarBlur={load} />
        ) : (
          <Card><Empty description="Rapor verisi alınamadı. Lütfen tekrar deneyin." /></Card>
        )
      ) : viewTab === "detay" ? (
        detayLoading ? (
          <div style={{ padding: 80, textAlign: "center" }}><Spin size="large" tip="Detay rapor yükleniyor…" /></div>
        ) : detay ? (
          <GunSonuDetayView detay={detay} />
        ) : (
          <div style={{ padding: 48, textAlign: "center" }}>
            <p style={{ color: "#dc2626", fontWeight: 600, marginBottom: 12 }}>{detayError || "Detay rapor yüklenemedi."}</p>
            <Button danger onClick={loadDetay}>Tekrar Dene</Button>
          </div>
        )
      ) : ozet ? (
        <CanliOzetView ozet={ozet} />
      ) : null}

      {whatsappOpen && activeKurum && (
        <GunSonuWhatsappModal
          kurumId={activeKurum.id}
          gun={gun}
          notlar={notlar}
          meta={rapor?.meta}
          onClose={() => setWhatsappOpen(false)}
        />
      )}
    </div>
  );
}

/* ─── Özet Rapor (markalı PDF önizleme) ─────────────────────────── */

function OzetRaporView({
  rapor, notlar, onNotlarChange, onNotlarBlur,
}: {
  rapor: GunSonuOzetRapor;
  notlar: string;
  onNotlarChange: (v: string) => void;
  onNotlarBlur: () => void;
}) {
  const { meta, gunluk_ozet, tahsilat_dagilimi, islem_sayilari, kullanici_ozeti } = rapor;

  return (
    <Card styles={{ body: { padding: 0 } }} style={{ overflow: "hidden" }}>
      <div style={{ padding: "20px 24px", borderBottom: "2px solid #1F3C88", background: "linear-gradient(90deg, #f8fafc, #eff6ff66)" }}>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/img/3k-logo.png" alt="3K Kampüs" style={{ width: 48, height: 48, objectFit: "contain" }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>{meta.marka}</div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: "#1F3C88", margin: "2px 0 0" }}>{meta.baslik}</h2>
            {meta.kurum_ad && <div style={{ fontSize: 13, color: "#475569", marginTop: 2 }}>{meta.kurum_ad}</div>}
          </div>
        </div>
        <Row gutter={[12, 12]} style={{ marginTop: 16, padding: 12, background: "#ffffffb3", borderRadius: 12, border: "1px solid #f1f5f9" }}>
          <MetaChip label="Tarih" value={meta.tarih} />
          <MetaChip label="Şube" value={meta.sube} />
          <MetaChip label="Hazırlayan" value={meta.hazirlayan} />
          <MetaChip label="Oluşturulma" value={meta.olusturulma} />
        </Row>
      </div>

      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 24 }}>
        <ReportSection title="A. Günlük Özet">
          <ReportTable
            headers={["Bilgi", "Tutar"]}
            rows={[
              ["Toplam Tahsilat", fmtTL(gunluk_ozet.toplam_tahsilat)],
              ["Toplam İade", fmtTL(gunluk_ozet.toplam_iade)],
              ["Toplam Gelir", fmtTL(gunluk_ozet.toplam_gelir)],
              ["Toplam Gider", fmtTL(gunluk_ozet.toplam_gider)],
              ["Net Nakit Girişi", fmtTL(gunluk_ozet.net_nakit_girisi)],
            ]}
            highlightLast
          />
        </ReportSection>

        <ReportSection title="B. Tahsilat Dağılımı">
          <ReportTable headers={["Ödeme Türü", "Tutar"]} rows={tahsilat_dagilimi.map((r) => [r.label, fmtTL(r.tutar)])} highlightLast />
        </ReportSection>

        <ReportSection title="C. İşlem Sayıları">
          <ReportTable
            headers={["İşlem", "Adet"]}
            rows={[
              ["Tahsilat", String(islem_sayilari.tahsilat)],
              ["Gelir Kaydı", String(islem_sayilari.gelir_kaydi)],
              ["Gider Kaydı", String(islem_sayilari.gider_kaydi)],
              ["İade", String(islem_sayilari.iade)],
              ["İptal", String(islem_sayilari.iptal)],
            ]}
          />
        </ReportSection>

        <ReportSection title="Kullanıcı Bazlı İşlem Özeti">
          {kullanici_ozeti.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Bugün personel bazlı işlem yok" />
          ) : (
            <ReportTable
              headers={["Personel", "Tahsilat", "Gelir", "Gider"]}
              rows={kullanici_ozeti.map((k) => [k.personel, fmtTL(k.tahsilat), fmtTL(k.gelir), fmtTL(k.gider)])}
            />
          )}
        </ReportSection>

        <ReportSection title="G. Notlar">
          <Input.TextArea
            value={notlar}
            onChange={(e) => onNotlarChange(e.target.value)}
            onBlur={onNotlarBlur}
            placeholder="Gün sonu notlarınızı buraya yazın…"
            rows={4}
          />
          <p style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>Notlar rapor export ve WhatsApp gönderimine dahil edilir.</p>
        </ReportSection>
      </div>
    </Card>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <Col xs={12} sm={6}>
      <div style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#334155", marginTop: 2 }}>{value}</div>
    </Col>
  );
}

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 style={{ fontSize: 14, fontWeight: 800, color: "#1F3C88", margin: "0 0 8px", paddingLeft: 12, borderLeft: "4px solid #3b82f6" }}>{title}</h3>
      {children}
    </section>
  );
}

function ReportTable({ headers, rows, highlightLast }: { headers: string[]; rows: string[][]; highlightLast?: boolean }) {
  return (
    <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid #f1f5f9" }}>
      <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#1F3C88", color: "#fff" }}>
            {headers.map((h) => (
              <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const isLast = highlightLast && i === rows.length - 1;
            return (
              <tr key={i} style={{ background: isLast ? "#eff6ff" : i % 2 === 1 ? "#f8fafc80" : "transparent", fontWeight: isLast ? 700 : 400, color: isLast ? "#1F3C88" : undefined }}>
                {row.map((cell, j) => (
                  <td key={j} style={{ padding: "8px 12px", textAlign: j > 0 ? "right" : "left", fontVariantNumeric: j > 0 ? "tabular-nums" : undefined, color: j === 0 && !isLast ? "#334155" : undefined, borderTop: "1px solid #f1f5f9" }}>
                    {cell}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Canlı Özet ─────────────────────────────────────────────────── */

function CanliOzetView({ ozet }: { ozet: GunSonuOzet }) {
  const hesapColumns: ColumnsType<GunSonuOzet["hesap_bakiyeleri"][number]> = [
    { title: "Hesap", dataIndex: "ad", key: "ad", render: (v: string) => <span style={{ fontWeight: 600, color: "#0f172a" }}>{v}</span> },
    { title: "Tip", dataIndex: "tip_label", key: "tip", render: (v: string) => v || "—" },
    { title: "Şube", dataIndex: "sube_ad", key: "sube", render: (v: string) => v || "—" },
    { title: "Bakiye", dataIndex: "bakiye", key: "bakiye", align: "right", render: (v: number) => <span style={{ fontWeight: 700 }}>{fmtTL(v)}</span> },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Row gutter={[12, 12]}>
        <Col xs={12} lg={6}><Card size="small"><Statistic title="Toplam Tahsilat" value={fmtTL(ozet.tahsilatlar.toplam)} valueStyle={{ color: "#059669", fontWeight: 800, fontSize: 18 }} /><div style={{ fontSize: 11, color: "#94a3b8" }}>{ozet.tahsilatlar.adet} işlem</div></Card></Col>
        <Col xs={12} lg={6}><Card size="small"><Statistic title="Toplam Ödeme" value={fmtTL(ozet.odemeler.toplam)} valueStyle={{ color: "#dc2626", fontWeight: 800, fontSize: 18 }} /><div style={{ fontSize: 11, color: "#94a3b8" }}>{ozet.odemeler.adet} işlem</div></Card></Col>
        <Col xs={12} lg={6}><Card size="small"><Statistic title="İade" value={fmtTL(ozet.iade_toplam)} valueStyle={{ color: "#d97706", fontWeight: 800, fontSize: 18 }} /></Card></Col>
        <Col xs={12} lg={6}><Card size="small"><Statistic title="Net" value={fmtTL(ozet.net)} valueStyle={{ color: ozet.net >= 0 ? "#059669" : "#dc2626", fontWeight: 800, fontSize: 18 }} /></Card></Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={12}>
          <Card size="small" title="Tahsilatlar">
            {ozet.tahsilatlar.kirilim.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Bugün tahsilat yok" />
            ) : (
              <>
                {ozet.tahsilatlar.kirilim.map((k) => <RowLine key={k.tip} label={k.label} value={fmtTL(k.toplam)} sub={`${k.adet} işlem`} />)}
                <TotalLine label="TOPLAM" value={fmtTL(ozet.tahsilatlar.toplam)} color="#059669" />
              </>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card size="small" title="Ödemeler">
            {ozet.odemeler.kirilim.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Bugün ödeme yok" />
            ) : (
              <>
                {ozet.odemeler.kirilim.map((k) => <RowLine key={k.tip} label={k.label} value={fmtTL(k.toplam)} sub={`${k.adet} işlem`} />)}
                <TotalLine label="TOPLAM" value={fmtTL(ozet.odemeler.toplam)} color="#dc2626" />
              </>
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} sm={8}><Card size="small"><Statistic title="Kasada Beklenen" value={fmtTL(ozet.kasada_beklenen)} valueStyle={{ color: "#0891b2", fontWeight: 800, fontSize: 17 }} /></Card></Col>
        <Col xs={24} sm={8}><Card size="small"><Statistic title="Banka Bakiye" value={fmtTL(ozet.banka_bakiye)} valueStyle={{ color: "#2563eb", fontWeight: 800, fontSize: 17 }} /></Card></Col>
        <Col xs={24} sm={8}><Card size="small"><Statistic title="Kart Bekleyen (POS)" value={fmtTL(ozet.kart_bekleyen)} valueStyle={{ color: "#7c3aed", fontWeight: 800, fontSize: 17 }} /></Card></Col>
      </Row>

      <Card size="small" title="Hesap Bakiyeleri (Anlık)" styles={{ body: { padding: ozet.hesap_bakiyeleri.length === 0 ? 24 : 0 } }}>
        {ozet.hesap_bakiyeleri.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Tanımlı mali hesap yok" />
        ) : (
          <Table rowKey="id" size="small" columns={hesapColumns} dataSource={ozet.hesap_bakiyeleri} pagination={false} />
        )}
      </Card>
    </Space>
  );
}

function RowLine({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
      <span style={{ fontSize: 13, color: "#475569" }}>{label}</span>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{value}</div>
        {sub && <div style={{ fontSize: 10, color: "#94a3b8" }}>{sub}</div>}
      </div>
    </div>
  );
}

function TotalLine({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 12, marginTop: 4, borderTop: `2px solid ${color}` }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontSize: 16, fontWeight: 800, color }}>{value}</span>
    </div>
  );
}

export default function GunSonuClient({ embedded = false }: { embedded?: boolean }) {
  return (
    <GGProvider>
      <GunSonuInner embedded={embedded} />
    </GGProvider>
  );
}
