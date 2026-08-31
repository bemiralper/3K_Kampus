"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Drawer, Button, Space, Row, Col, Statistic, Table, Tag, Upload, Empty,
  Popconfirm, Alert, App as AntApp, Divider, Typography,
} from "antd";
import type { UploadProps } from "antd";
import {
  FileTextOutlined, PrinterOutlined, DownloadOutlined, EyeOutlined,
  PaperClipOutlined, DollarOutlined,
} from "@ant-design/icons";
import { ggService } from "./gg-v2-api";
import {
  DATE, GGGiderDetay, GGListItem, GGOdeme, GGTaksit, TL, odemeDurumRenk,
} from "./gg-v2-types";
import { FinansHttpError } from "../services/finans-http";
import {
  openGiderIslemBelgesi, openOdemeBelgesi, openOdemePlaniBelgesi,
} from "./gider-belge";

interface Props {
  open: boolean;
  row: GGListItem | null;
  highlightTaksitId?: number | null;
  onClose: () => void;
  onOde: (row: GGListItem) => void;
  onReload: () => void;
}

export default function GiderDetayDrawer({ open, row, highlightTaksitId, onClose, onOde, onReload }: Props) {
  const { message } = AntApp.useApp();
  const [detay, setDetay] = useState<GGGiderDetay | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!row) return;
    setLoading(true);
    try {
      setDetay(await ggService.giderDetay(row.id));
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Detay yüklenemedi.");
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
  const odemeDurum = d?.odeme_durumu || d?.durum;
  const odemeLabel = d?.odeme_durumu_label || d?.durum_label;
  const hasOdeme = !!(d?.has_odeme || Number(d?.odenen_toplam) > 0);
  const odemeler = (d?.odemeler ?? []).filter((o) => o.durum !== "iptal");

  const uploadProps: UploadProps = {
    accept: ".pdf,.jpg,.jpeg,.png",
    showUploadList: false,
    beforeUpload: async (file) => {
      if (!row) return false;
      try {
        await ggService.giderEkYukle(row.id, file);
        message.success("Ekli fatura / fiş yüklendi.");
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
      await ggService.giderEkSil(row.id, ekId);
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
          <div style={{ fontWeight: 800 }}>Gider Detayı</div>
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
            loading={busy === "gider"}
            onClick={() => row && run("gider", () => openGiderIslemBelgesi(row.id))}
          >
            Gider Belgesi
          </Button>
          <Button
            icon={<PrinterOutlined />}
            loading={busy === "print"}
            onClick={() => row && run("print", () => openGiderIslemBelgesi(row.id, "print"))}
          >
            Yazdır
          </Button>
          {row?.odenebilir_mi && (
            <Button type="primary" icon={<DollarOutlined />} onClick={() => { onClose(); onOde(row); }}>
              Öde
            </Button>
          )}
        </Space>
      }
    >
      {d && (
        <>
          <div style={{ marginBottom: 12, color: "#334155", fontWeight: 600 }}>
            {d.cari_hesap?.unvan || "—"}
            <span style={{ color: "#94a3b8", fontWeight: 400, marginLeft: 8 }}>
              {d.gider_kategorisi?.ad || "—"}
            </span>
          </div>

          <Row gutter={[10, 10]} style={{ marginBottom: 16 }}>
            <Col xs={12} sm={6}>
              <div style={cardBox}>
                <Statistic title="Toplam Gider" value={TL(d.net_tutar)} valueStyle={valStyle("#0f172a")} />
              </div>
            </Col>
            <Col xs={12} sm={6}>
              <div style={cardBox}>
                <Statistic title="Ödenen" value={TL(d.odenen_toplam)} valueStyle={valStyle("#166534")} />
              </div>
            </Col>
            <Col xs={12} sm={6}>
              <div style={cardBox}>
                <Statistic title="Kalan" value={TL(d.kalan_tutar)} valueStyle={valStyle(Number(d.kalan_tutar) > 0 ? "#991b1b" : "#64748b")} />
              </div>
            </Col>
            <Col xs={12} sm={6}>
              <div style={cardBox}>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>Ödeme Durumu</div>
                <Tag color={odemeDurumRenk(odemeDurum)} style={{ fontSize: 13, padding: "4px 10px" }}>
                  {odemeLabel}
                </Tag>
              </div>
            </Col>
          </Row>

          {d.aciklama?.trim() ? (
            <div style={aciklamaBox}>
              <div style={aciklamaLabel}>Gider Açıklaması</div>
              <div style={aciklamaText}>{d.aciklama}</div>
            </div>
          ) : null}

          {odemeDurum === "ileri_tarihli" && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 14 }}
              message="İleri tarihli ödeme"
              description="Bu gider kaydı oluşturulmuştur ancak ödeme henüz gerçekleşmemiştir. Kasa/banka çıkışı yalnızca ödeme kaydedildiğinde oluşur."
            />
          )}

          <Divider orientation="left" style={{ fontSize: 13, marginTop: 8 }}>Ödeme Planı</Divider>
          <Table<GGTaksit>
            rowKey="id"
            size="small"
            loading={loading}
            pagination={false}
            dataSource={d.taksitler ?? []}
            locale={{ emptyText: "Ödeme planı yok" }}
            scroll={{ x: 560 }}
            rowClassName={(t) => (highlightTaksitId && t.id === highlightTaksitId ? "ant-table-row-selected" : "")}
            columns={[
              {
                title: "Taksit", dataIndex: "taksit_no", width: 80, align: "center",
                render: (n, t) => {
                  const toplam = d.taksit_sayisi || d.taksitler?.length || 1;
                  return toplam > 1 ? (
                    <span style={{ fontWeight: highlightTaksitId === t.id ? 800 : 600 }}>{n} / {toplam}</span>
                  ) : n;
                },
              },
              { title: "Vade", dataIndex: "vade_tarihi", render: (v) => DATE(v), width: 110 },
              { title: "Tutar", dataIndex: "tutar", align: "right", render: (v) => TL(v) },
              { title: "Ödenen", dataIndex: "odenen_tutar", align: "right", render: (v) => TL(v) },
              { title: "Kalan", dataIndex: "kalan_tutar", align: "right", render: (v) => TL(v) },
              {
                title: "Durum", dataIndex: "durum",
                render: (_, t) => <Tag color={odemeDurumRenk(t.durum)}>{t.durum_display}</Tag>,
              },
              {
                title: "", key: "belge", width: 150,
                render: (_, t) => {
                  const odeme = odemeler.find((o) => o.gider_taksit_id === t.id);
                  if (!odeme || Number(t.odenen_tutar) <= 0) return null;
                  return (
                    <Button
                      size="small" type="link" icon={<EyeOutlined />}
                      loading={busy === `odeme-${odeme.id}`}
                      onClick={() => run(`odeme-${odeme.id}`, () => openOdemeBelgesi(d.id, odeme.id))}
                    >
                      Ödeme Belgesi
                    </Button>
                  );
                },
              },
            ]}
          />
          <Space wrap style={{ marginTop: 8 }}>
            <Button
              size="small"
              icon={<FileTextOutlined />}
              loading={busy === "plan"}
              onClick={() => run("plan", () => openOdemePlaniBelgesi(d.id))}
            >
              Ödeme Planı Belgesi
            </Button>
            <Button
              size="small"
              icon={<DownloadOutlined />}
              loading={busy === "plan-pdf"}
              onClick={() => run("plan-pdf", () => openOdemePlaniBelgesi(d.id, "pdf"))}
            >
              Plan PDF
            </Button>
          </Space>

          <Divider orientation="left" style={{ fontSize: 13 }}>Gerçekleşen Ödemeler</Divider>
          <Table<GGOdeme>
            rowKey="id"
            size="small"
            loading={loading}
            pagination={false}
            dataSource={d.odemeler ?? []}
            locale={{ emptyText: "Henüz gerçekleşmiş ödeme yok" }}
            columns={[
              { title: "Belge", dataIndex: "odeme_belge_no", render: (v) => v || "—", width: 140 },
              { title: "Tarih", dataIndex: "odeme_tarihi", render: (v) => DATE(v), width: 110 },
              { title: "Tutar", dataIndex: "tutar", align: "right", render: (v) => TL(v) },
              { title: "Yöntem", render: (_, o) => o.odeme_yontemi_adi || (o.bakiyeden_mahsup ? "Mahsup" : "—") },
              {
                title: "", key: "gor", width: 180,
                render: (_, o) => (
                  <Space size={0}>
                    {o.durum === "tamamlandi" ? (
                      <Button
                        size="small" type="link"
                        loading={busy === `od-${o.id}`}
                        onClick={() => run(`od-${o.id}`, () => openOdemeBelgesi(d.id, o.id))}
                      >
                        Belge
                      </Button>
                    ) : null}
                    {o.durum !== "iptal" ? (
                      <Popconfirm
                        title="Ödeme iptal edilsin mi? Kasa/cari hareket geri alınır."
                        okText="İptal Et"
                        cancelText="Vazgeç"
                        onConfirm={async () => {
                          try {
                            await ggService.giderOdemeIptal(o.id);
                            message.success("Ödeme iptal edildi.");
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
          {!hasOdeme && (
            <Alert
              type="warning"
              showIcon
              style={{ marginTop: 8 }}
              message="Ödeme belgesi henüz oluşturulamaz"
              description="Ödeme belgesi yalnızca gerçekleşmiş ödemeler için düzenlenir."
            />
          )}

          <Divider orientation="left" style={{ fontSize: 13 }}>Ekli Belgeler</Divider>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 10 }}
            message="Ekli Fatura / Fiş"
            description="Tedarikçiden alınan gerçek fatura veya fişi buraya yükleyin. Sistemin oluşturduğu Gider İşlem Belgesi fatura yerine geçmez."
          />
          <Upload {...uploadProps}>
            <Button icon={<PaperClipOutlined />}>Fatura / Fiş Yükle (PDF, JPG, PNG)</Button>
          </Upload>
          <div style={{ marginTop: 12 }}>
            {(d.ekli_belgeler ?? []).length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Ekli fatura / fiş yok" />
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
