"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Drawer, Form, InputNumber, Select, DatePicker, Input, Switch, Button, Space,
  Statistic, Row, Col, Divider, Table, Tag, Popconfirm, Alert, App as AntApp,
} from "antd";
import dayjs from "dayjs";
import { ggService } from "./gg-v2-api";
import { GGDropdown, GGListItem, GGOdeme, GGTaksit, TL } from "./gg-v2-types";
import { FinansHttpError } from "../services/finans-http";

interface Props {
  open: boolean;
  row: GGListItem | null;
  dropdown: GGDropdown | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function GiderOdemeDrawer({ open, row, dropdown, onClose, onSaved }: Props) {
  const { message } = AntApp.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [odemeler, setOdemeler] = useState<GGOdeme[]>([]);
  const [taksitler, setTaksitler] = useState<GGTaksit[]>([]);
  const [selectedTaksit, setSelectedTaksit] = useState<GGTaksit | null>(null);
  const [loading, setLoading] = useState(false);
  const [mahsup, setMahsup] = useState(false);

  const kalan = Number(row?.kalan_tutar ?? 0);
  const net = Number(row?.net_tutar ?? 0);
  const odenen = Number(row?.odenen_toplam ?? 0);
  const taksitli = (row?.taksit_sayisi ?? 1) > 1;

  const loadData = useCallback(async () => {
    if (!row) return;
    setLoading(true);
    try {
      const [od, tk] = await Promise.all([
        ggService.giderOdemeler(row.id),
        (row.taksit_sayisi ?? 1) > 1 ? ggService.giderTaksitler(row.id) : Promise.resolve([]),
      ]);
      setOdemeler(od);
      setTaksitler(tk);
    } catch {
      setOdemeler([]);
      setTaksitler([]);
    } finally { setLoading(false); }
  }, [row]);

  useEffect(() => {
    if (!open || !row) return;
    setMahsup(false);
    setSelectedTaksit(null);
    form.resetFields();
    form.setFieldsValue({ tutar: kalan, odeme_tarihi: dayjs(), bakiyeden_mahsup: false });
    loadData();
  }, [open, row, form, kalan, loadData]);

  const taksitOde = (t: GGTaksit) => {
    setSelectedTaksit(t);
    form.setFieldsValue({ tutar: Number(t.kalan_tutar), odeme_tarihi: dayjs() });
    message.info(`${t.taksit_no}. taksit için ödeme tutarı dolduruldu.`);
  };

  const submit = async () => {
    if (!row) return;
    let v;
    try { v = await form.validateFields(); } catch { return; }
    const body: Record<string, unknown> = {
      gider_kaydi_id: row.id,
      tutar: v.tutar,
      odeme_tarihi: v.odeme_tarihi?.format("YYYY-MM-DD"),
      aciklama: v.aciklama ?? "",
      bakiyeden_mahsup: !!v.bakiyeden_mahsup,
    };
    if (selectedTaksit) body.gider_taksit_id = selectedTaksit.id;
    if (!v.bakiyeden_mahsup) {
      body.mali_hesap_id = v.mali_hesap_id;
      body.odeme_yontemi_id = v.odeme_yontemi_id;
      // Banka masrafı (opsiyonel) — yalnızca banka yollu ödemelerde
      if (v.kesinti_tutar && Number(v.kesinti_tutar) > 0) {
        if (!v.masraf_turu_id) {
          message.error("Banka masrafı için masraf türü seçin.");
          setSaving(false);
          return;
        }
        body.masraf_turu_id = v.masraf_turu_id;
        body.kesinti_tutar = v.kesinti_tutar;
        body.kesinti_aciklama = v.kesinti_aciklama ?? "";
        const mt = (dropdown?.masraf_turleri ?? []).find((m) => m.id === v.masraf_turu_id);
        if (mt?.kesinti_turu) body.kesinti_turu = mt.kesinti_turu;
      }
    }
    setSaving(true);
    try {
      await ggService.giderOdemeYap(row.id, body);
      message.success("Ödeme kaydedildi.");
      onSaved();
      onClose();
    } catch (e) {
      if (e instanceof FinansHttpError) message.error(e.message);
      else message.error("Ödeme kaydedilemedi.");
    } finally { setSaving(false); }
  };

  const iptal = async (odeme: GGOdeme) => {
    try {
      await ggService.giderOdemeIptal(odeme.id);
      message.success("Ödeme iptal edildi.");
      loadData();
      onSaved();
    } catch (e) {
      message.error(e instanceof FinansHttpError ? e.message : "İptal edilemedi.");
    }
  };

  return (
    <Drawer
      title={`Gider Ödemesi — ${row?.cari_hesap?.unvan ?? ""}`}
      width={560}
      open={open}
      onClose={onClose}
      destroyOnClose
      extra={
        <Space>
          <Button onClick={onClose}>Kapat</Button>
          <Button type="primary" loading={saving} disabled={kalan <= 0} onClick={submit}>Ödemeyi Kaydet</Button>
        </Space>
      }
    >
      <Row gutter={12} style={{ marginBottom: 8 }}>
        <Col span={8}><Statistic title="Tutar" value={net} precision={2} suffix="₺" /></Col>
        <Col span={8}><Statistic title="Ödenen" value={odenen} precision={2} suffix="₺" valueStyle={{ color: "#16a34a" }} /></Col>
        <Col span={8}><Statistic title="Kalan" value={kalan} precision={2} suffix="₺" valueStyle={{ color: kalan > 0 ? "#dc2626" : "#64748b" }} /></Col>
      </Row>

      {taksitli && (
        <>
          <Divider orientation="left" style={{ fontSize: 13 }}>Taksit Planı ({row?.taksit_sayisi} taksit)</Divider>
          <Table<GGTaksit>
            rowKey="id"
            size="small"
            loading={loading}
            dataSource={taksitler}
            pagination={false}
            style={{ marginBottom: 12 }}
            rowClassName={(t) => (selectedTaksit?.id === t.id ? "ant-table-row-selected" : "")}
            locale={{ emptyText: "Taksit bulunamadı." }}
            columns={[
              { title: "#", dataIndex: "taksit_no", width: 44 },
              { title: "Vade", dataIndex: "vade_tarihi", render: (d) => (d ? dayjs(d).format("DD.MM.YYYY") : "—") },
              { title: "Tutar", dataIndex: "tutar", align: "right", render: (t) => TL(Number(t)) },
              { title: "Kalan", dataIndex: "kalan_tutar", align: "right", render: (t) => TL(Number(t)) },
              {
                title: "Durum", dataIndex: "durum_display",
                render: (_, t) => {
                  const bitti = Number(t.kalan_tutar) <= 0;
                  return <Tag color={bitti ? "green" : (t.durum === "geciken" ? "red" : "orange")}>{t.durum_display}</Tag>;
                },
              },
              {
                title: "", key: "ode", width: 64,
                render: (_, t) => Number(t.kalan_tutar) > 0 ? (
                  <Button size="small" type="link" onClick={() => taksitOde(t)}>Öde</Button>
                ) : null,
              },
            ]}
          />
        </>
      )}

      {kalan <= 0 ? (
        <Alert type="success" showIcon message="Bu gider tamamen ödenmiş." style={{ marginBottom: 12 }} />
      ) : (
        <Form form={form} layout="vertical">
          {selectedTaksit ? (
            <Alert
              type="info" showIcon style={{ marginBottom: 12 }}
              message={`${selectedTaksit.taksit_no}. taksit ödeniyor (kalan ${TL(Number(selectedTaksit.kalan_tutar))})`}
              action={<Button size="small" type="text" onClick={() => { setSelectedTaksit(null); form.setFieldsValue({ tutar: kalan }); }}>Serbest ödemeye dön</Button>}
            />
          ) : taksitli ? (
            <Alert type="warning" showIcon style={{ marginBottom: 12 }}
              message="Belirli bir taksiti ödemek için yukarıdaki tablodan “Öde”ye tıklayın; ya da serbest tutar girin (en eski taksitlerden düşülür)." />
          ) : null}
          <Form.Item name="bakiyeden_mahsup" label="Cari bakiyeden mahsup et" valuePropName="checked"
            tooltip="Cari hesapta biriken artı bakiyeden düşer; kasa/bankadan para çıkmaz.">
            <Switch onChange={setMahsup} />
          </Form.Item>

          <Form.Item name="tutar" label="Ödeme Tutarı" rules={[{ required: true, message: "Tutar girin." }]}>
            <InputNumber style={{ width: "100%" }} min={0.01} max={kalan} precision={2} addonAfter="₺" />
          </Form.Item>

          {!mahsup && (
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item name="mali_hesap_id" label="Mali Hesap (Kasa/Banka)" rules={[{ required: true, message: "Mali hesap seçin." }]}>
                  <Select
                    showSearch optionFilterProp="label" placeholder="Seçin"
                    options={(dropdown?.mali_hesaplar ?? []).map((m) => ({ value: m.id, label: m.ad }))}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="odeme_yontemi_id" label="Ödeme Yöntemi" rules={[{ required: true, message: "Ödeme yöntemi seçin." }]}>
                  <Select
                    showSearch optionFilterProp="label" placeholder="Seçin"
                    options={(dropdown?.odeme_yontemleri ?? []).map((o) => ({ value: o.id, label: o.ad }))}
                  />
                </Form.Item>
              </Col>
            </Row>
          )}

          {/* ─── Banka Masrafı (koşullu) ─── */}
          {!mahsup && (
            <Form.Item noStyle shouldUpdate={(p, c) =>
              p.mali_hesap_id !== c.mali_hesap_id || p.odeme_yontemi_id !== c.odeme_yontemi_id}>
              {() => {
                const MASRAF_ODEME_TIPS = ["pos", "havale_eft", "online"];
                const MASRAF_HESAP_TIPS = ["banka", "pos", "sanal_pos"];
                const oy = (dropdown?.odeme_yontemleri ?? []).find((o) => o.id === form.getFieldValue("odeme_yontemi_id"));
                const mh = (dropdown?.mali_hesaplar ?? []).find((m) => m.id === form.getFieldValue("mali_hesap_id"));
                const eligible =
                  (oy && MASRAF_ODEME_TIPS.includes(oy.tip)) ||
                  (mh && MASRAF_HESAP_TIPS.includes(mh.tip));
                if (!eligible) return null;
                const tips = (dropdown?.masraf_turleri ?? []).filter(
                  (m) => !m.odeme_tipi || (oy && m.odeme_tipi === oy.tip),
                );
                return (
                  <>
                    <Divider orientation="left" style={{ fontSize: 13 }}>Banka Masrafı (opsiyonel)</Divider>
                    <Row gutter={12}>
                      <Col span={12}>
                        <Form.Item name="masraf_turu_id" label="Masraf Türü">
                          <Select
                            allowClear showSearch optionFilterProp="label" placeholder="Örn. EFT Masrafı"
                            options={(tips.length ? tips : (dropdown?.masraf_turleri ?? [])).map((m) => ({ value: m.id, label: m.ad }))}
                            onChange={(id) => {
                              const sel = (dropdown?.masraf_turleri ?? []).find((m) => m.id === id);
                              if (sel && Number(sel.varsayilan_tutar) > 0 && !form.getFieldValue("kesinti_tutar")) {
                                form.setFieldsValue({ kesinti_tutar: Number(sel.varsayilan_tutar) });
                              }
                            }}
                          />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item name="kesinti_tutar" label="Masraf Tutarı">
                          <InputNumber style={{ width: "100%" }} min={0} step={0.01} precision={2} addonAfter="₺" placeholder="0,00" />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Form.Item name="kesinti_aciklama" label="Masraf Açıklaması">
                      <Input placeholder="Opsiyonel" />
                    </Form.Item>
                    <Form.Item noStyle shouldUpdate={(p, c) => p.tutar !== c.tutar || p.kesinti_tutar !== c.kesinti_tutar}>
                      {() => {
                        const odeme = Number(form.getFieldValue("tutar") || 0);
                        const masraf = Number(form.getFieldValue("kesinti_tutar") || 0);
                        if (masraf <= 0) return null;
                        return (
                          <Row gutter={12} style={{ marginBottom: 12 }}>
                            <Col span={8}><Statistic title="Ödeme" value={odeme} precision={2} suffix="₺" /></Col>
                            <Col span={8}><Statistic title="Banka Masrafı" value={masraf} precision={2} suffix="₺" valueStyle={{ color: "#d97706" }} /></Col>
                            <Col span={8}><Statistic title="Toplam Çıkış" value={odeme + masraf} precision={2} suffix="₺" valueStyle={{ color: "#dc2626" }} /></Col>
                          </Row>
                        );
                      }}
                    </Form.Item>
                  </>
                );
              }}
            </Form.Item>
          )}

          <Form.Item name="odeme_tarihi" label="Ödeme Tarihi" rules={[{ required: true, message: "Tarih seçin." }]}>
            <DatePicker style={{ width: "100%" }} format="DD.MM.YYYY" />
          </Form.Item>

          <Form.Item name="aciklama" label="Açıklama">
            <Input.TextArea rows={2} placeholder="Opsiyonel" />
          </Form.Item>
        </Form>
      )}

      <Divider orientation="left" style={{ fontSize: 13 }}>Ödeme Geçmişi</Divider>
      <Table<GGOdeme>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={odemeler}
        pagination={false}
        locale={{ emptyText: "Henüz ödeme yapılmamış." }}
        columns={[
          { title: "Tarih", dataIndex: "odeme_tarihi", render: (d) => (d ? dayjs(d).format("DD.MM.YYYY") : "—") },
          { title: "Tutar", dataIndex: "tutar", align: "right", render: (t) => TL(Number(t)) },
          { title: "Yöntem", key: "yontem", render: (_, r) => r.mali_hesap_adi || r.odeme_yontemi_adi || (r.bakiyeden_mahsup ? "Bakiyeden Mahsup" : "—") },
          {
            title: "Durum", dataIndex: "durum_display",
            render: (_, r) => <Tag color={r.durum === "iptal" ? "red" : "green"}>{r.durum_display}</Tag>,
          },
          {
            title: "", key: "islem", width: 70,
            render: (_, r) => r.durum !== "iptal" ? (
              <Popconfirm title="Ödeme iptal edilsin mi?" okText="İptal Et" cancelText="Vazgeç" onConfirm={() => iptal(r)}>
                <Button size="small" type="text" danger>İptal</Button>
              </Popconfirm>
            ) : null,
          },
        ]}
      />
    </Drawer>
  );
}
