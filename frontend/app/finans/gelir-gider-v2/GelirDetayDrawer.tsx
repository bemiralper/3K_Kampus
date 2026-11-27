"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Drawer, Button, Space, Row, Col, Statistic, Table, Tag, Upload, Empty,
  Popconfirm, Alert, App as AntApp, Divider, Typography,
} from "antd";
import type { UploadProps } from "antd";
import {
  FileTextOutlined, PrinterOutlined, DownloadOutlined,
  PaperClipOutlined, DollarOutlined,
} from "@ant-design/icons";
import { useFinansPath } from "@/components/finans/FinansPathProvider";
import { ggService } from "./gg-v2-api";
import {
  DATE, GGGelirDetay, GGListItem, GGTahsilat, TL, odemeDurumRenk,
} from "./gg-v2-types";
import { FinansHttpError } from "../services/finans-http";
import {
  openGelirIslemBelgesi, openTahsilatMakbuzu,
} from "./gider-belge";

interface Props {
  open: boolean;
  row: GGListItem | null;
  onClose: () => void;
  onTahsilEt: (row: GGListItem) => void;
  onReload: () => void;
}

export default function GelirDetayDrawer({ open, row, onClose, onTahsilEt, onReload }: Props) {
  const { message } = AntApp.useApp();
  const { href } = useFinansPath();
  const [detay, setDetay] = useState<GGGelirDetay | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!row) return;
    setLoading(true);
    try {
      setDetay(await ggService.gelirDetay(row.id));
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Gelir detayı yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [row, message]);

  useEffect(() => {
    if (open && row) load();
    if (!open) setDetay(null);
  }, [open, row, load]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Belge oluşturulamadı.");
    } finally {
      setBusy(null);
    }
  };

  const d = detay;
  const tahsilDurum = d?.tahsil_durumu || d?.durum;
  const tahsilLabel = d?.tahsil_durumu_label || d?.durum_label;
  const hasTahsilat = !!(d?.has_tahsilat || Number(d?.tahsil_edilen) > 0);

  const uploadProps: UploadProps = {
    accept: ".pdf,.jpg,.jpeg,.png",
    showUploadList: false,
    beforeUpload: async (file) => {
      if (!row) return false;
      try {
        await ggService.gelirEkYukle(row.id, file);
        message.success("Ekli fatura / belge yüklendi.");
        await load();
      } catch (e) {
        message.error(e instanceof FinansHttpError ? e.message : "Yükleme başarısız.");
      }
      return false;
    },
  };

  const silEk = async (ekId: number) => {
    if (!row) return;
    try {
      await ggService.gelirEkSil(row.id, ekId);
      message.success("Ek silindi.");
      await load();
    } catch (e) {
      message.error(e instanceof FinansHttpError ? e.message : "Silinemedi.");
    }
  };

  return (
    <Drawer
      title={
        <div>
          <div style={{ fontWeight: 800 }}>Gelir Detayı</div>
          <Typography.Text type="secondary" style={{ fontSize: 12, fontFamily: "ui-monospace, monospace" }}>
            {d?.islem_belge_no || d?.belge_no || row?.fatura_no || "—"}
          </Typography.Text>
        </div>
      }
      width={720}
      open={open}
      onClose={onClose}
      extra={
        <Space wrap>
          <Button
            icon={<FileTextOutlined />}
            loading={busy === "gelir"}
            onClick={() => row && run("gelir", () => openGelirIslemBelgesi(row.id))}
          >
            Gelir Belgesi
          </Button>
          <Button
            icon={<DownloadOutlined />}
            loading={busy === "pdf"}
            onClick={() => row && run("pdf", () => openGelirIslemBelgesi(row.id, "pdf"))}
          >
            PDF
          </Button>
          <Button
            icon={<PrinterOutlined />}
            loading={busy === "print"}
            onClick={() => row && run("print", () => openGelirIslemBelgesi(row.id, "print"))}
          >
            Yazdır
          </Button>
          {row?.tahsil_edilebilir_mi && (
            <Button type="primary" icon={<DollarOutlined />} onClick={() => { onClose(); onTahsilEt(row); }}>
              Tahsil Et
            </Button>
          )}
        </Space>
      }
    >
      {d && (
        <>
          <div style={{ marginBottom: 12, color: "#334155", fontWeight: 600 }}>
            {d.cari_hesap?.id ? (
              <Link href={href(`cari-hesaplar-v2/${d.cari_hesap.id}`)} style={{ color: "#1d4ed8", fontWeight: 700 }}>
                {d.cari_hesap.unvan || "—"} ↗
              </Link>
            ) : (
              d.cari_hesap?.unvan || "—"
            )}
            <span style={{ color: "#94a3b8", fontWeight: 400, marginLeft: 8 }}>
              {d.gelir_kategorisi?.ad || "—"}
            </span>
          </div>

          <Row gutter={[10, 10]} style={{ marginBottom: 12 }}>
            <Col xs={12} sm={6}>
              <div style={cardBox}>
                <Statistic title="Genel Toplam (KDV Dahil)" value={TL(d.net_tutar)} valueStyle={valStyle("#0f172a")} />
              </div>
            </Col>
            <Col xs={12} sm={6}>
              <div style={cardBox}>
                <Statistic title="Tahsil Edilen" value={TL(d.tahsil_edilen)} valueStyle={valStyle("#166534")} />
              </div>
            </Col>
            <Col xs={12} sm={6}>
              <div style={cardBox}>
                <Statistic title="Kalan Alacak" value={TL(d.kalan_tutar)} valueStyle={valStyle(Number(d.kalan_tutar) > 0 ? "#991b1b" : "#64748b")} />
              </div>
            </Col>
            <Col xs={12} sm={6}>
              <div style={cardBox}>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>Tahsilat Durumu</div>
                <Tag color={odemeDurumRenk(tahsilDurum)} style={{ fontSize: 13, padding: "4px 10px" }}>
                  {tahsilLabel}
                </Tag>
              </div>
            </Col>
          </Row>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 16,
              marginBottom: 14,
              padding: "8px 12px",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 10,
              fontSize: 12.5,
              color: "#475569",
            }}
          >
            <span>KDV Hariç (Matrah): <strong>{TL(d.brut_tutar)}</strong></span>
            <span>KDV (%{d.kdv_orani ?? 0}): <strong>{TL(d.kdv_tutar)}</strong></span>
            <span>Tarih: <strong>{DATE(d.fatura_tarihi)}</strong></span>
            <span>Vade: <strong>{DATE(d.vade_tarihi)}</strong></span>
            {d.fatura_no ? <span>Fatura / Belge No: <strong>{d.fatura_no}</strong></span> : null}
          </div>

          {d.aciklama?.trim() ? (
            <div style={aciklamaBox}>
              <div style={aciklamaLabel}>Gelir Açıklaması</div>
              <div style={aciklamaText}>{d.aciklama}</div>
            </div>
          ) : null}

          {tahsilDurum === "ileri_tarihli" && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 14 }}
              message="İleri vadeli alacak"
              description="Bu gelir kaydı cari hesaba alacak olarak işlenmiştir. Kasa/banka girişi tahsilat kaydedildiğinde oluşur."
            />
          )}

          <Divider orientation="left" style={{ fontSize: 13 }}>Gerçekleşen Tahsilatlar</Divider>
          <Table<GGTahsilat>
            rowKey="id"
            size="small"
            loading={loading}
            pagination={false}
            dataSource={d.tahsilatlar ?? []}
            locale={{ emptyText: "Henüz gerçekleşmiş tahsilat yok" }}
            columns={[
              { title: "Makbuz", dataIndex: "makbuz_no", render: (v) => v || "—", width: 130 },
              { title: "Tarih", dataIndex: "tahsilat_tarihi", render: (v) => DATE(v), width: 110 },
              { title: "Tutar", dataIndex: "tutar", align: "right", render: (v) => TL(v) },
              {
                title: "Yöntem / Hesap",
                render: (_, t) =>
                  t.bakiyeden_mahsup
                    ? "Cari Bakiyeden Mahsup"
                    : t.mali_hesap_adi || t.odeme_yontemi_adi || "—",
              },
              {
                title: "Durum",
                render: (_, t) => <Tag color={t.durum === "iptal" ? "red" : "green"}>{t.durum_display}</Tag>,
              },
              {
                title: "", key: "gor", width: 180,
                render: (_, t) => (
                  <Space size={0}>
                    {t.durum === "tamamlandi" ? (
                      <Button
                        size="small" type="link"
                        loading={busy === `th-${t.id}`}
                        onClick={() => run(`th-${t.id}`, () => openTahsilatMakbuzu(d.id, t.id))}
                      >
                        Makbuz
                      </Button>
                    ) : null}
                    {t.durum !== "iptal" ? (
                      <Popconfirm
                        title="Tahsilat iptal edilsin mi? Kasa/cari hareket geri alınır."
                        okText="İptal Et"
                        cancelText="Vazgeç"
                        onConfirm={async () => {
                          try {
                            await ggService.gelirTahsilatIptal(t.id);
                            message.success("Tahsilat iptal edildi.");
                            await load();
                            onReload();
                          } catch (e) {
                            message.error(e instanceof FinansHttpError ? e.message : "İptal edilemedi.");
                          }
                        }}
                      >
                        <Button size="small" type="text" danger>İptal</Button>
                      </Popconfirm>
                    ) : null}
                  </Space>
                ),
              },
            ]}
          />
          {!hasTahsilat && (
            <Alert
              type="warning"
              showIcon
              style={{ marginTop: 8 }}
              message="Tahsilat makbuzu henüz oluşturulamaz"
              description="Tahsilat makbuzu yalnızca gerçekleşmiş tahsilatlar için düzenlenir."
            />
          )}

          <Divider orientation="left" style={{ fontSize: 13 }}>Ekli Belgeler</Divider>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 10 }}
            message="Ekli Fatura / Dekont"
            description="Kesilen e-fatura/arşiv PDF'ini veya tahsilat dekontunu buraya yükleyebilirsiniz. Sistemin oluşturduğu Gelir İşlem Belgesi mali fatura yerine geçmez."
          />
          <Upload {...uploadProps}>
            <Button icon={<PaperClipOutlined />}>Fatura / Belge Yükle (PDF, JPG, PNG)</Button>
          </Upload>
          <div style={{ marginTop: 12 }}>
            {(d.ekli_belgeler ?? []).length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Ekli fatura / belge yok" />
            ) : (
              (d.ekli_belgeler ?? []).map((ek, i) => (
                <div key={ek.id ?? `legacy-${i}`} style={ekRow}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{ek.dosya_adi}</div>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>
                      {ek.dosya_turu_display} · {ek.dosya_boyutu_fmt || "—"}
                    </div>
                  </div>
                  <Space>
                    {ek.dosya_url && (
                      <Button size="small" href={ek.dosya_url} target="_blank">Görüntüle / İndir</Button>
                    )}
                    {ek.id != null && (
                      <Popconfirm title="Ek silinsin mi?" onConfirm={() => silEk(ek.id as number)}>
                        <Button size="small" danger>Sil</Button>
                      </Popconfirm>
                    )}
                  </Space>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </Drawer>
  );
}

const cardBox: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: "12px 14px",
  background: "#f8fafc",
  minHeight: 86,
};

const aciklamaBox: React.CSSProperties = {
  marginBottom: 16,
  padding: "12px 14px",
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
};

const aciklamaLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "#64748b",
  marginBottom: 6,
};

const aciklamaText: React.CSSProperties = {
  color: "#0f172a",
  fontSize: 13,
  lineHeight: 1.55,
  whiteSpace: "pre-wrap",
};

const valStyle = (color: string) => ({ fontSize: 16, fontWeight: 800, color });

const ekRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: "10px 0",
  borderBottom: "1px dashed #e2e8f0",
};
