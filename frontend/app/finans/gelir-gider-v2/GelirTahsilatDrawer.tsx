"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Drawer, Form, InputNumber, Select, DatePicker, Input, Button, Space,
  Statistic, Row, Col, Divider, Table, Tag, Popconfirm, Alert, App as AntApp,
} from "antd";
import dayjs from "dayjs";
import { ggService } from "./gg-v2-api";
import { GGDropdown, GGListItem, GGTahsilat, TL } from "./gg-v2-types";
import { FinansHttpError } from "../services/finans-http";
import { isCekSenetTip } from "@/lib/finans/paymentMethodUtils";
import Link from "next/link";
import { useFinansPath } from "@/components/finans/FinansPathProvider";

interface Props {
  open: boolean;
  row: GGListItem | null;
  dropdown: GGDropdown | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function GelirTahsilatDrawer({ open, row, dropdown, onClose, onSaved }: Props) {
  const { message } = AntApp.useApp();
  const { homeHref } = useFinansPath();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [tahsilatlar, setTahsilatlar] = useState<GGTahsilat[]>([]);
  const [loading, setLoading] = useState(false);

  const kalan = Number(row?.kalan_tutar ?? 0);
  const net = Number(row?.net_tutar ?? 0);
  const tahsilEdilen = Number(row?.tahsil_edilen ?? 0);
  const maliHesapId = Form.useWatch("mali_hesap_id", form) as number | undefined;
  const planYontem = (dropdown?.odeme_yontemleri ?? []).find(
    (o) => o.id === row?.odeme_yontemi?.id,
  );
  const cekSenetPlanli = isCekSenetTip(planYontem?.tip);

  const hesapOdemeYontemleri = useMemo(() => {
    const ops = dropdown?.odeme_yontemleri_operasyon;
    const source = ops?.length
      ? ops
      : (dropdown?.odeme_yontemleri ?? []).map((o) => ({
          ...o,
          mali_hesap_id: (o as { mali_hesap_id?: number | null }).mali_hesap_id ?? null,
        }));
    if (!maliHesapId) return [];
    return source.filter(
      (o) =>
        !isCekSenetTip(o.tip) &&
        (o.mali_hesap_id === maliHesapId || o.mali_hesap_id == null),
    );
  }, [dropdown, maliHesapId]);

  const loadData = useCallback(async () => {
    if (!row) return;
    setLoading(true);
    try {
      setTahsilatlar(await ggService.gelirTahsilatlar(row.id));
    } catch {
      setTahsilatlar([]);
    } finally {
      setLoading(false);
    }
  }, [row]);

  useEffect(() => {
    if (!open || !row) return;
    form.resetFields();
    form.setFieldsValue({ tutar: kalan, tahsilat_tarihi: dayjs() });
    loadData();
  }, [open, row, form, kalan, loadData]);

  const submit = async () => {
    if (!row) return;
    let v;
    try {
      v = await form.validateFields();
    } catch {
      return;
    }
    const body: Record<string, unknown> = {
      gelir_kaydi_id: row.id,
      tutar: v.tutar,
      mali_hesap_id: v.mali_hesap_id,
      odeme_yontemi_id: v.odeme_yontemi_id,
      tahsilat_tarihi: v.tahsilat_tarihi?.format("YYYY-MM-DD"),
      aciklama: v.aciklama ?? "",
    };
    if (v.kesinti_tutar && Number(v.kesinti_tutar) > 0) {
      if (!v.masraf_turu_id) {
        message.error("Banka masrafı için masraf türü seçin.");
        return;
      }
      body.masraf_turu_id = v.masraf_turu_id;
      body.kesinti_tutar = v.kesinti_tutar;
      body.kesinti_aciklama = v.kesinti_aciklama ?? "";
      const mt = (dropdown?.masraf_turleri ?? []).find((m) => m.id === v.masraf_turu_id);
      if (mt?.kesinti_turu) body.kesinti_turu = mt.kesinti_turu;
    }
    setSaving(true);
    try {
      await ggService.gelirTahsilatYap(row.id, body);
      message.success("Tahsilat kaydedildi.");
      onSaved();
      onClose();
    } catch (e) {
      if (e instanceof FinansHttpError) message.error(e.message);
      else message.error("Tahsilat kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  const iptal = async (tahsilat: GGTahsilat) => {
    try {
      await ggService.gelirTahsilatIptal(tahsilat.id);
      message.success("Tahsilat iptal edildi.");
      loadData();
      onSaved();
    } catch (e) {
      message.error(e instanceof FinansHttpError ? e.message : "İptal edilemedi.");
    }
  };

  return (
    <Drawer
      title={`Gelir Tahsilatı — ${row?.cari_hesap?.unvan ?? ""}`}
      width={560}
      open={open}
      onClose={onClose}
      destroyOnClose
      extra={
        <Space>
          <Button onClick={onClose}>Kapat</Button>
          <Button type="primary" loading={saving} disabled={kalan <= 0} onClick={submit}>
            Tahsilatı Kaydet
          </Button>
        </Space>
      }
    >
      <Row gutter={12} style={{ marginBottom: 8 }}>
        <Col span={8}><Statistic title="Tutar" value={net} precision={2} suffix="₺" /></Col>
        <Col span={8}>
          <Statistic title="Tahsil Edilen" value={tahsilEdilen} precision={2} suffix="₺" valueStyle={{ color: "#16a34a" }} />
        </Col>
        <Col span={8}>
          <Statistic title="Kalan" value={kalan} precision={2} suffix="₺" valueStyle={{ color: kalan > 0 ? "#dc2626" : "#64748b" }} />
        </Col>
      </Row>

      {cekSenetPlanli && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="Bu gelir çek/senet planlı"
          description={
            <span>
              Çek/senet tahsilatı bu drawer’dan yapılmaz.{" "}
              <Link href={`${homeHref}/cek-senet-v2`}>Çek/Senet</Link> ekranından ilerletin.
              Burada yalnızca nakit/havale/POS vb. kasa tahsilatı girebilirsiniz.
            </span>
          }
        />
      )}

      {kalan <= 0 ? (
        <Alert type="success" showIcon message="Bu gelir tamamen tahsil edilmiş." style={{ marginBottom: 12 }} />
      ) : (
        <Form form={form} layout="vertical">
          <Form.Item name="tutar" label="Tahsilat Tutarı" rules={[{ required: true, message: "Tutar girin." }]}>
            <InputNumber style={{ width: "100%" }} min={0.01} max={kalan} precision={2} addonAfter="₺" />
          </Form.Item>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="mali_hesap_id" label="Mali Hesap (Kasa/Banka)" rules={[{ required: true, message: "Mali hesap seçin." }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="Seçin"
                  options={(dropdown?.mali_hesaplar ?? []).map((m) => ({ value: m.id, label: m.ad }))}
                  onChange={() => form.setFieldsValue({ odeme_yontemi_id: undefined })}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="odeme_yontemi_id" label="Ödeme Yöntemi" rules={[{ required: true, message: "Ödeme yöntemi seçin." }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder={maliHesapId ? "Seçin" : "Önce mali hesap seçin"}
                  disabled={!maliHesapId}
                  options={hesapOdemeYontemleri.map((o) => ({ value: o.id, label: o.ad }))}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            noStyle
            shouldUpdate={(p, c) =>
              p.mali_hesap_id !== c.mali_hesap_id || p.odeme_yontemi_id !== c.odeme_yontemi_id}
          >
            {() => {
              const MASRAF_ODEME_TIPS = ["pos", "havale_eft", "online"];
              const MASRAF_HESAP_TIPS = ["banka", "pos", "sanal_pos"];
              const oyId = form.getFieldValue("odeme_yontemi_id");
              const oy =
                hesapOdemeYontemleri.find((o) => o.id === oyId)
                || (dropdown?.odeme_yontemleri ?? []).find((o) => o.id === oyId);
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
                          allowClear
                          showSearch
                          optionFilterProp="label"
                          placeholder="Örn. EFT Masrafı"
                          options={(tips.length ? tips : (dropdown?.masraf_turleri ?? [])).map((m) => ({
                            value: m.id,
                            label: m.ad,
                          }))}
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
                </>
              );
            }}
          </Form.Item>

          <Form.Item name="tahsilat_tarihi" label="Tahsilat Tarihi" rules={[{ required: true, message: "Tarih seçin." }]}>
            <DatePicker style={{ width: "100%" }} format="DD.MM.YYYY" />
          </Form.Item>

          <Form.Item name="aciklama" label="Açıklama">
            <Input.TextArea rows={2} placeholder="Opsiyonel" />
          </Form.Item>
        </Form>
      )}

      <Divider orientation="left" style={{ fontSize: 13 }}>Tahsilat Geçmişi</Divider>
      <Table<GGTahsilat>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={tahsilatlar}
        pagination={false}
        locale={{ emptyText: "Henüz tahsilat yapılmamış." }}
        columns={[
          {
            title: "Tarih",
            dataIndex: "tahsilat_tarihi",
            render: (d) => (d ? dayjs(d).format("DD.MM.YYYY") : "—"),
          },
          {
            title: "Tutar",
            dataIndex: "tutar",
            align: "right",
            render: (t) => TL(Number(t)),
          },
          {
            title: "Yöntem",
            key: "yontem",
            render: (_, r) => r.mali_hesap_adi || r.odeme_yontemi_adi || "—",
          },
          {
            title: "Durum",
            dataIndex: "durum_display",
            render: (_, r) => <Tag color={r.durum === "iptal" ? "red" : "green"}>{r.durum_display}</Tag>,
          },
          {
            title: "",
            key: "islem",
            width: 70,
            render: (_, r) =>
              r.durum !== "iptal" ? (
                <Popconfirm title="Tahsilat iptal edilsin mi?" okText="İptal Et" cancelText="Vazgeç" onConfirm={() => iptal(r)}>
                  <Button size="small" type="text" danger>İptal</Button>
                </Popconfirm>
              ) : null,
          },
        ]}
      />
    </Drawer>
  );
}
