"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Drawer,
  Form,
  Select,
  InputNumber,
  Input,
  DatePicker,
  Button,
  Space,
  Row,
  Col,
  Divider,
  Alert,
  Radio,
  Switch,
  Typography,
  App as AntApp,
} from "antd";
import { PlusOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import {
  buildGiderTaksitPlanRows,
  spreadGiderAmountFromIndex,
} from "@/app/odeme-takip/utils/taksitPlan";
import { ggService } from "./gg-v2-api";
import { GGDropdown, GGListItem, TL } from "./gg-v2-types";
import { ModulConfig } from "./gg-config";
import { cariV2Service } from "../services/cari-v2-api";
import CariV2FormDrawer from "../cari-hesaplar-v2/CariV2FormDrawer";
import "../cari-hesaplar-v2/cari-v2.css";
import { FinansHttpError } from "../services/finans-http";
import { isCekSenetTip } from "@/lib/finans/paymentMethodUtils";
import Link from "next/link";
import { useFinansPath } from "@/components/finans/FinansPathProvider";

type TaksitFormRow = {
  taksit_no: number;
  vade_tarihi: dayjs.Dayjs;
  tutar: number;
  aciklama?: string;
};

interface Props {
  cfg: ModulConfig;
  open: boolean;
  kurumId: number;
  subeId: number | null;
  dropdown: GGDropdown | null;
  editing: GGListItem | null;
  copyingFrom?: GGListItem | null;
  lockedCariId?: number;
  lockedCariUnvan?: string;
  onDropdownRefresh?: () => Promise<void> | void;
  onClose: () => void;
  onSaved: () => void;
}

export default function GelirGiderFormDrawer({
  cfg,
  open,
  kurumId,
  subeId,
  dropdown,
  editing,
  copyingFrom,
  lockedCariId,
  lockedCariUnvan,
  onDropdownRefresh,
  onClose,
  onSaved,
}: Props) {
  const { message } = AntApp.useApp();
  const { homeHref } = useFinansPath();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [taksitFirstAmountEdited, setTaksitFirstAmountEdited] = useState(false);
  const [quickCariOpen, setQuickCariOpen] = useState(false);
  const [extraCariler, setExtraCariler] = useState<{ id: number; unvan: string; hesap_turu: string }[]>([]);
  const [cariSerbestBakiye, setCariSerbestBakiye] = useState(0);
  const planSyncKeyRef = useRef("");
  const odemeYontemiId = Form.useWatch("odeme_yontemi_id", form) as number | undefined;
  const seciliOdemeYontemi = (dropdown?.odeme_yontemleri ?? []).find((o) => o.id === odemeYontemiId);
  const cekSenetSecili = cfg.modul === "gider" && isCekSenetTip(seciliOdemeYontemi?.tip);
  const taslakSecili = Boolean(Form.useWatch("taslak_olarak_kaydet", form));
  const hemenIslem = Boolean(Form.useWatch("hemen_islem", form));
  const mahsupSecili = Boolean(Form.useWatch("bakiyeden_mahsup", form));
  const maliHesapId = Form.useWatch("mali_hesap_id", form) as number | undefined;

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

  const hesaplaNet = (girilen: number, oran: number, mod: string): number => {
    const t = Number(girilen) || 0;
    if (mod === "muaf" || !oran) return t;
    if (mod === "dahil") return t;
    return t * (1 + Number(oran) / 100);
  };

  const formatIlkVade = (v: dayjs.Dayjs | string | undefined): string => {
    if (!v) return dayjs().format("YYYY-MM-DD");
    if (dayjs.isDayjs(v)) return v.format("YYYY-MM-DD");
    return dayjs(v).format("YYYY-MM-DD");
  };

  const planToFormRows = (
    plan: ReturnType<typeof buildGiderTaksitPlanRows>,
  ): TaksitFormRow[] =>
    plan.map((r) => ({
      taksit_no: r.taksit_no,
      vade_tarihi: dayjs(r.vade_tarihi),
      tutar: r.tutar,
      aciklama: "",
    }));

  const syncTaksitPlani = (force = false) => {
    if (cfg.modul !== "gider") return;
    if (form.getFieldValue("taksit_mod") !== "taksitli") return;

    const net = hesaplaNet(
      Number(form.getFieldValue("brut_tutar") || 0),
      Number(form.getFieldValue("kdv_orani") || 0),
      form.getFieldValue("kdv_mod") || "haric",
    );
    const adet = Math.max(2, Number(form.getFieldValue("taksit_sayisi") || 2));
    const periyot = form.getFieldValue("taksit_periyodu") || "aylik";
    const ilkVade = formatIlkVade(
      form.getFieldValue("vade_tarihi") ?? form.getFieldValue("fatura_tarihi"),
    );
    const syncKey = `${adet}|${net}|${ilkVade}|${periyot}`;
    if (!force && taksitFirstAmountEdited && planSyncKeyRef.current === syncKey) return;
    if (net <= 0 || !ilkVade) return;

    planSyncKeyRef.current = syncKey;
    const plan = buildGiderTaksitPlanRows(net, adet, ilkVade, periyot);
    form.setFieldsValue({ taksit_plani: planToFormRows(plan) });
  };

  useEffect(() => {
    if (!open) return;
    setTaksitFirstAmountEdited(false);
    planSyncKeyRef.current = "";

    if (editing) {
      const editKdvMod = editing.kdv_mod || "haric";
      const girilenTutar =
        editKdvMod === "dahil" ? Number(editing.net_tutar) : Number(editing.brut_tutar);
      const taksitli = (editing.taksit_sayisi ?? 1) > 1;
      form.setFieldsValue({
        cari_hesap_id: editing.cari_hesap?.id ?? undefined,
        [cfg.kategoriFormKey]:
          (cfg.modul === "gider" ? editing.gider_kategorisi : editing.gelir_kategorisi)?.id ?? undefined,
        [cfg.ikinciTanimFormKey]:
          (cfg.modul === "gider" ? editing.maliyet_merkezi : editing.gelir_kaynagi)?.id ?? undefined,
        proje_id: editing.proje?.id ?? undefined,
        odeme_yontemi_id: editing.odeme_yontemi?.id ?? undefined,
        brut_tutar: girilenTutar,
        kdv_orani: editing.kdv_orani,
        kdv_mod: editKdvMod,
        fatura_no: editing.fatura_no ?? undefined,
        fatura_tarihi: editing.fatura_tarihi ? dayjs(editing.fatura_tarihi) : undefined,
        vade_tarihi: editing.vade_tarihi ? dayjs(editing.vade_tarihi) : undefined,
        aciklama: editing.aciklama ?? undefined,
        etiket_ids: editing.etiketler?.map((e) => e.id) ?? [],
        taksit_mod: taksitli ? "taksitli" : "pesin",
        taksit_sayisi: editing.taksit_sayisi ?? 1,
        taksit_periyodu: "aylik",
        taksit_plani: [],
      });
    } else if (copyingFrom) {
      const copyKdvMod = copyingFrom.kdv_mod || "haric";
      const girilenTutar =
        copyKdvMod === "dahil" ? Number(copyingFrom.net_tutar) : Number(copyingFrom.brut_tutar);
      form.resetFields();
      form.setFieldsValue({
        cari_hesap_id: lockedCariId ?? copyingFrom.cari_hesap?.id ?? undefined,
        [cfg.kategoriFormKey]:
          (cfg.modul === "gider" ? copyingFrom.gider_kategorisi : copyingFrom.gelir_kategorisi)?.id ?? undefined,
        [cfg.ikinciTanimFormKey]:
          (cfg.modul === "gider" ? copyingFrom.maliyet_merkezi : copyingFrom.gelir_kaynagi)?.id ?? undefined,
        proje_id: copyingFrom.proje?.id ?? undefined,
        odeme_yontemi_id: copyingFrom.odeme_yontemi?.id ?? undefined,
        brut_tutar: girilenTutar,
        kdv_orani: copyingFrom.kdv_orani,
        kdv_mod: copyKdvMod,
        fatura_no: "",
        fatura_tarihi: dayjs(),
        vade_tarihi: dayjs(),
        aciklama: copyingFrom.aciklama ?? undefined,
        etiket_ids: copyingFrom.etiketler?.map((e) => e.id) ?? [],
        taksit_mod: "pesin",
        taksit_sayisi: 2,
        taksit_periyodu: "aylik",
        taksit_plani: [],
        taslak_olarak_kaydet: false,
        hemen_islem: false,
        bakiyeden_mahsup: false,
        islem_odeme_tarihi: dayjs(),
      });
    } else {
      form.resetFields();
      form.setFieldsValue({
        cari_hesap_id: lockedCariId ?? undefined,
        kdv_orani: 20,
        kdv_mod: "haric",
        fatura_tarihi: dayjs(),
        taksit_mod: "pesin",
        taksit_sayisi: 2,
        taksit_periyodu: "aylik",
        taksit_plani: [],
        taslak_olarak_kaydet: false,
        hemen_islem: false,
        bakiyeden_mahsup: false,
        islem_odeme_tarihi: dayjs(),
      });
    }
  }, [open, editing, copyingFrom, lockedCariId, cfg, form]);

  const taksitMod = Form.useWatch("taksit_mod", form);
  const taksitSayisi = Form.useWatch("taksit_sayisi", form);
  const brutTutar = Form.useWatch("brut_tutar", form);
  const kdvOrani = Form.useWatch("kdv_orani", form);
  const kdvMod = Form.useWatch("kdv_mod", form);
  const vadeTarihi = Form.useWatch("vade_tarihi", form);
  const faturaTarihi = Form.useWatch("fatura_tarihi", form);
  const taksitPeriyodu = Form.useWatch("taksit_periyodu", form);

  useEffect(() => {
    setTaksitFirstAmountEdited(false);
    planSyncKeyRef.current = "";
  }, [brutTutar, kdvOrani, kdvMod, taksitSayisi, vadeTarihi, faturaTarihi, taksitPeriyodu]);

  useEffect(() => {
    if (!open || cfg.modul !== "gider" || taksitMod !== "taksitli") return;
    if (taksitFirstAmountEdited) return;
    syncTaksitPlani();
  }, [
    open,
    cfg.modul,
    taksitMod,
    taksitSayisi,
    brutTutar,
    kdvOrani,
    kdvMod,
    vadeTarihi,
    faturaTarihi,
    taksitPeriyodu,
    taksitFirstAmountEdited,
  ]);

  const handleTaksitModChange = (mod: "pesin" | "taksitli") => {
    setTaksitFirstAmountEdited(false);
    planSyncKeyRef.current = "";
    if (mod === "taksitli") {
      form.setFieldsValue({ taksit_sayisi: Math.max(2, Number(form.getFieldValue("taksit_sayisi") || 2)) });
    } else {
      form.setFieldsValue({ taksit_sayisi: 1, taksit_plani: [] });
    }
  };

  const handleTaksitSayisiChange = (value: number | null) => {
    setTaksitFirstAmountEdited(false);
    planSyncKeyRef.current = "";
    form.setFieldsValue({ taksit_sayisi: Math.max(2, Number(value) || 2) });
  };

  const handleFirstTaksitAmountChange = (value: number | null) => {
    const net = hesaplaNet(
      Number(form.getFieldValue("brut_tutar") || 0),
      Number(form.getFieldValue("kdv_orani") || 0),
      form.getFieldValue("kdv_mod") || "haric",
    );
    const rows = (form.getFieldValue("taksit_plani") ?? []) as TaksitFormRow[];
    if (!rows.length || net <= 0) return;

    setTaksitFirstAmountEdited(true);
    const amounts = spreadGiderAmountFromIndex(
      rows.map((r) => Number(r.tutar) || 0),
      0,
      Number(value) || 0,
      net,
    );
    form.setFieldsValue({
      taksit_plani: rows.map((row, i) => ({ ...row, tutar: amounts[i] })),
    });
  };

  const submit = async () => {
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const payload: Record<string, unknown> = {
      cari_hesap_id: values.cari_hesap_id,
      [cfg.kategoriFormKey]: values[cfg.kategoriFormKey],
      [cfg.ikinciTanimFormKey]: values[cfg.ikinciTanimFormKey] ?? null,
      proje_id: values.proje_id ?? null,
      odeme_yontemi_id: values.odeme_yontemi_id ?? null,
      brut_tutar: values.brut_tutar,
      kdv_orani: values.kdv_mod === "muaf" ? 0 : values.kdv_orani,
      kdv_mod: values.kdv_mod ?? "haric",
      fatura_no: values.fatura_no ?? "",
      fatura_tarihi: values.fatura_tarihi?.format("YYYY-MM-DD"),
      vade_tarihi: (values.vade_tarihi ?? values.fatura_tarihi)?.format("YYYY-MM-DD"),
      aciklama: values.aciklama ?? "",
      etiket_ids: values.etiket_ids ?? [],
    };

    if (cfg.modul === "gider") {
      const mod = values.taksit_mod ?? "pesin";
      if (mod === "pesin") {
        payload.taksit_sayisi = 1;
        payload.taksit_plani = null;
      } else {
        const satirlar = (values.taksit_plani ?? []) as TaksitFormRow[];
        if (satirlar.length < 2) {
          message.error("Taksitli ödemede en az 2 taksit olmalı.");
          return;
        }
        const net = hesaplaNet(values.brut_tutar, values.kdv_orani, values.kdv_mod);
        const toplam = satirlar.reduce((s, r) => s + (Number(r.tutar) || 0), 0);
        if (Math.abs(toplam - net) > 0.05) {
          message.error(
            `Taksit toplamı (${toplam.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺) net tutara (${net.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺) eşit olmalı.`,
          );
          return;
        }
        payload.taksit_sayisi = satirlar.length;
        payload.taksit_plani = satirlar.map((r, i) => ({
          taksit_no: i + 1,
          vade_tarihi: r.vade_tarihi?.format("YYYY-MM-DD"),
          tutar: Number(r.tutar) || 0,
          aciklama: r.aciklama ?? "",
        }));
      }
    }

    if (!editing) {
      if (values.taslak_olarak_kaydet) {
        payload.taslak_olarak_kaydet = true;
      } else if (values.hemen_islem && values.taksit_mod !== "taksitli" && !cekSenetSecili) {
        if (cfg.modul === "gelir") payload.hemen_tahsil_et = true;
        else payload.hemen_ode = true;
        payload.bakiyeden_mahsup = !!values.bakiyeden_mahsup;
        payload.islem_odeme_tarihi = (values.islem_odeme_tarihi ?? values.fatura_tarihi)?.format("YYYY-MM-DD");
        if (!values.bakiyeden_mahsup) {
          payload.mali_hesap_id = values.mali_hesap_id ?? null;
          payload.odeme_yontemi_id = values.islem_odeme_yontemi_id ?? values.odeme_yontemi_id ?? null;
        }
      }
    }

    setSaving(true);
    try {
      if (editing) {
        await ggService.update(cfg.modul, editing.id, payload);
        message.success("Kayıt güncellendi.");
      } else {
        await ggService.create(cfg.modul, payload, kurumId, subeId);
        message.success("Kayıt oluşturuldu.");
      }
      onSaved();
    } catch (e) {
      const msg = e instanceof FinansHttpError ? e.message : "Kayıt kaydedilemedi.";
      message.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const kategoriler = dropdown?.kategoriler ?? [];
  const ikinciTanimlar =
    (cfg.modul === "gider" ? dropdown?.maliyet_merkezleri : dropdown?.gelir_kaynaklari) ?? [];

  const cariId = Form.useWatch("cari_hesap_id", form);
  const allCariler = useMemo(() => {
    const base = dropdown?.cariler ?? [];
    const seen = new Set(base.map((c) => c.id));
    const merged = [...base];
    for (const ec of extraCariler) {
      if (!seen.has(ec.id)) {
        merged.push(ec);
        seen.add(ec.id);
      }
    }
    if (lockedCariId && lockedCariUnvan && !seen.has(lockedCariId)) {
      merged.push({ id: lockedCariId, unvan: lockedCariUnvan, hesap_turu: cfg.modul === "gider" ? "tedarikci" : "musteri" });
    }
    return merged;
  }, [dropdown?.cariler, extraCariler, lockedCariId, lockedCariUnvan, cfg.modul]);
  const selectedCari = allCariler.find((c) => c.id === cariId);

  useEffect(() => {
    if (!open || editing || !cariId) {
      setCariSerbestBakiye(0);
      return;
    }
    cariV2Service
      .get(cariId)
      .then((det) => {
        const sb =
          cfg.modul === "gelir"
            ? Number(det.serbest_tahsilat_bakiye ?? 0)
            : Number(det.serbest_bakiye ?? 0);
        setCariSerbestBakiye(sb);
      })
      .catch(() => setCariSerbestBakiye(0));
  }, [open, editing, cariId, cfg.modul]);

  const cariKategoriIdSet = (() => {
    if (!selectedCari) return null;
    const ids =
      cfg.modul === "gider"
        ? selectedCari.gider_kategorileri
        : selectedCari.gelir_kategorileri;
    return ids && ids.length > 0 ? new Set(ids) : null;
  })();

  const kategoriLabel = (k: { id: number; ad: string; parent_id: number | null }) => {
    if (cfg.modul === "gider") return k.ad;
    if (!k.parent_id) return k.ad;
    const parent = kategoriler.find((p) => p.id === k.parent_id);
    return parent ? `${parent.ad} › ${k.ad}` : k.ad;
  };

  const kategoriSecenekleri = (() => {
    const pool = cariKategoriIdSet
      ? kategoriler.filter((k) => cariKategoriIdSet.has(k.id))
      : kategoriler;
    const filtered =
      cfg.modul === "gider"
        ? (() => {
            const parentIdsWithChildren = new Set(
              pool.filter((k) => k.parent_id).map((k) => k.parent_id as number),
            );
            return pool.filter(
              (k) => k.parent_id !== null || !parentIdsWithChildren.has(k.id),
            );
          })()
        : pool;
    return filtered.map((k) => ({ value: k.id, label: kategoriLabel(k) }));
  })();

  const handleCariChange = (id: number) => {
    const cari = allCariler.find((c) => c.id === id);
    if (!cari) return;
    const ids =
      cfg.modul === "gider"
        ? (cari as { gider_kategorileri?: number[] }).gider_kategorileri
        : (cari as { gelir_kategorileri?: number[] }).gelir_kategorileri;
    const allowed =
      ids && ids.length > 0
        ? kategoriler.filter((k) => ids.includes(k.id))
        : kategoriler;
    const current = form.getFieldValue(cfg.kategoriFormKey);
    if (current && !allowed.some((k) => k.id === current)) {
      form.setFieldsValue({ [cfg.kategoriFormKey]: undefined });
    }
    if (allowed.length === 1) {
      form.setFieldsValue({ [cfg.kategoriFormKey]: allowed[0].id });
    }
  };

  return (
    <>
    <Drawer
      title={
        editing
          ? `${cfg.modul === "gider" ? "Gider" : "Gelir"} Kaydını Düzenle`
          : copyingFrom
          ? `Kaydı Kopyala — Yeni ${cfg.modul === "gider" ? "Gider" : "Gelir"}`
          : `Yeni ${cfg.modul === "gider" ? "Gider" : "Gelir"} Kaydı`
      }
      width={560}
      open={open}
      onClose={onClose}
      destroyOnClose
      extra={
        <Space>
          <Button onClick={onClose}>İptal</Button>
          <Button type="primary" loading={saving} onClick={submit}>
            {editing ? "Güncelle" : "Kaydet"}
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical" requiredMark="optional">
        <Form.Item
          name="cari_hesap_id"
          label={
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", gap: 12 }}>
              <span>{cfg.cariLabel}</span>
              {!lockedCariId && (
                <Button
                  type="link"
                  size="small"
                  icon={<PlusOutlined />}
                  style={{ padding: 0, height: "auto" }}
                  onClick={() => setQuickCariOpen(true)}
                >
                  Yeni Cari Ekle
                </Button>
              )}
            </div>
          }
          rules={[{ required: true, message: "Cari hesap seçin." }]}
        >
          <Select
            showSearch
            disabled={!!lockedCariId}
            optionFilterProp="label"
            placeholder="Cari hesap seçin"
            options={allCariler.map((c) => ({ value: c.id, label: c.unvan }))}
            onChange={handleCariChange}
          />
        </Form.Item>

        {selectedCari && cariKategoriIdSet && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message={`${selectedCari.unvan} — cariye tanımlı ${cfg.kategoriLabel.toLowerCase()} gösteriliyor`}
            description={`${cariKategoriIdSet.size} kategori eşleşmesi var. Cari kartından kategori ekleyebilir veya güncelleyebilirsiniz.`}
          />
        )}
        {selectedCari && !cariKategoriIdSet && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            message="Bu caride henüz kategori tanımı yok"
            description={`Tüm ${cfg.kategoriLabel.toLowerCase()} listeleniyor. Cari hesap kartından bu cariye özel kategori atayabilirsiniz; sonraki kayıtlarda yalnızca onlar görünür.`}
          />
        )}

        <Row gutter={12}>
          <Col span={12}>
            <Form.Item
              name={cfg.kategoriFormKey}
              label={cfg.kategoriLabel}
              rules={[{ required: true, message: "Kategori seçin." }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                placeholder={cariId ? "Cariye uygun kategori" : "Önce cari seçin"}
                disabled={!cariId}
                options={kategoriSecenekleri}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name={cfg.ikinciTanimFormKey} label={cfg.ikinciTanimLabel}>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder={cfg.ikinciTanimLabel}
                options={ikinciTanimlar.map((t) => ({ value: t.id, label: t.ad }))}
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={12}>
          <Col span={12}>
            <Form.Item name="proje_id" label="Proje">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="Proje"
                options={(dropdown?.projeler ?? []).map((p) => ({ value: p.id, label: p.ad }))}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="odeme_yontemi_id"
              label={cfg.modul === "gider" ? "Planlanan Ödeme Yöntemi" : "Planlanan Tahsilat Yöntemi"}
            >
              <Select
                allowClear
                placeholder={cfg.modul === "gider" ? "Planlanan ödeme yöntemi" : "Planlanan tahsilat yöntemi"}
                options={(dropdown?.odeme_yontemleri ?? []).map((o) => ({
                  value: o.id,
                  label: isCekSenetTip(o.tip) ? `${o.ad} (çek/senet)` : o.ad,
                }))}
              />
            </Form.Item>
          </Col>
        </Row>

        {cekSenetSecili && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="Çek/senet portföye düşecek"
            description={
              <span>
                Kayıt sonrası bu gider <strong>Finans → Çek/Senet</strong> modülünde
                <strong> Verilen / Bekliyor</strong> olarak görünür. Ödeme drawer’dan çek/senet
                ile kasa düşümü yapılmaz; tahsil/ödeme için{" "}
                <Link href={`${homeHref}/cek-senet-v2`}>Çek/Senet</Link> ekranını kullanın.
              </span>
            }
          />
        )}

        <Divider style={{ margin: "4px 0 16px" }} />

        <Form.Item name="kdv_mod" label="KDV Durumu">
          <Radio.Group
            optionType="button"
            buttonStyle="solid"
            options={(dropdown?.kdv_modlari ?? [
              { value: "haric", label: "KDV Hariç" },
              { value: "dahil", label: "KDV Dahil" },
              { value: "muaf", label: "KDV Muaf" },
            ]).map((m) => ({ value: m.value, label: m.label }))}
          />
        </Form.Item>

        <Row gutter={12}>
          <Col span={12}>
            <Form.Item noStyle shouldUpdate={(p, c) => p.kdv_mod !== c.kdv_mod}>
              {() => {
                const mod = form.getFieldValue("kdv_mod") || "haric";
                const label =
                  mod === "dahil"
                    ? "Genel Toplam (KDV Dahil)"
                    : mod === "muaf"
                    ? "Tutar (KDV Muaf)"
                    : "KDV Hariç Tutar (Matrah)";
                return (
                  <Form.Item
                    name="brut_tutar"
                    label={label}
                    rules={[{ required: true, message: "Tutar girin." }]}
                  >
                    <InputNumber
                      style={{ width: "100%" }}
                      min={0}
                      step={0.01}
                      precision={2}
                      addonAfter="₺"
                      placeholder="0,00"
                    />
                  </Form.Item>
                );
              }}
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item noStyle shouldUpdate={(p, c) => p.kdv_mod !== c.kdv_mod}>
              {() => (
                <Form.Item name="kdv_orani" label="KDV Oranı">
                  <Select
                    disabled={form.getFieldValue("kdv_mod") === "muaf"}
                    options={(dropdown?.kdv_oranlari ?? []).map((k) => ({ value: k.value, label: k.label }))}
                  />
                </Form.Item>
              )}
            </Form.Item>
          </Col>
        </Row>

        <Form.Item noStyle shouldUpdate={(p, c) =>
          p.brut_tutar !== c.brut_tutar || p.kdv_orani !== c.kdv_orani || p.kdv_mod !== c.kdv_mod}>
          {() => {
            const mod = form.getFieldValue("kdv_mod") || "haric";
            const girilen = Number(form.getFieldValue("brut_tutar") || 0);
            const oran = Number(form.getFieldValue("kdv_orani") || 0);
            const net = hesaplaNet(girilen, oran, mod);
            const brut = mod === "dahil" && oran ? net / (1 + oran / 100) : mod === "muaf" ? girilen : girilen;
            const kdv = net - brut;
            const f = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            return (
              <div
                style={{
                  display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16, padding: "8px 12px",
                  background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8,
                }}
              >
                <Typography.Text type="secondary">KDV Hariç (Matrah): <b>{f(brut)} ₺</b></Typography.Text>
                <Typography.Text type="secondary">KDV: <b>{f(kdv)} ₺</b></Typography.Text>
                <Typography.Text>Genel Toplam (KDV Dahil): <b style={{ color: "#1F3C88" }}>{f(net)} ₺</b></Typography.Text>
              </div>
            );
          }}
        </Form.Item>

        <Row gutter={12}>
          <Col span={12}>
            <Form.Item
              name="fatura_tarihi"
              label="Tarih"
              rules={[{ required: true, message: "Tarih seçin." }]}
            >
              <DatePicker style={{ width: "100%" }} format="DD.MM.YYYY" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="vade_tarihi" label="Vade Tarihi">
              <DatePicker style={{ width: "100%" }} format="DD.MM.YYYY" />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          name="fatura_no"
          label={cfg.modul === "gider" ? "Tedarikçi Fatura / Fiş No" : "Belge / Fatura No"}
          extra={cfg.modul === "gider" ? "Opsiyonel. Sistem belge no (GDR-YYYY-000001) otomatik üretilir; fatura yerine geçmez." : undefined}
        >
          <Input placeholder={cfg.modul === "gider" ? "Tedarikçi belge no (opsiyonel)" : "Belge no"} />
        </Form.Item>

        {cfg.modul === "gider" && (
          <>
            <Divider style={{ margin: "4px 0 12px" }} orientation="left" plain>
              Vade Yapısı (Peşin / Taksitli)
            </Divider>
            <Form.Item name="taksit_mod">
              <Radio.Group
                optionType="button"
                buttonStyle="solid"
                onChange={(e) => handleTaksitModChange(e.target.value)}
              >
                <Radio.Button value="pesin">Peşin</Radio.Button>
                <Radio.Button value="taksitli">Taksitli</Radio.Button>
              </Radio.Group>
            </Form.Item>

            <Form.Item noStyle shouldUpdate={(p, c) => p.taksit_mod !== c.taksit_mod}>
              {() =>
                form.getFieldValue("taksit_mod") === "taksitli" ? (
                  <>
                    <Row gutter={12}>
                      <Col span={12}>
                        <Form.Item name="taksit_sayisi" label="Taksit Sayısı">
                          <InputNumber
                            style={{ width: "100%" }}
                            min={2}
                            max={60}
                            onChange={handleTaksitSayisiChange}
                          />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item
                          name="taksit_periyodu"
                          label="Taksit Periyodu"
                          tooltip="Vade tarihleri takvim ayına göre ilerler."
                        >
                          <Select
                            onChange={() => {
                              setTaksitFirstAmountEdited(false);
                              planSyncKeyRef.current = "";
                            }}
                            options={[
                              { value: "aylik", label: "Aylık" },
                              { value: "iki_aylik", label: "2 Aylık" },
                              { value: "uc_aylik", label: "3 Aylık" },
                            ]}
                          />
                        </Form.Item>
                      </Col>
                    </Row>

                    <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8, fontSize: 12 }}>
                      Tutar eşit bölünür. İlk taksit tutarını değiştirirseniz diğer taksitler aynı olur, son taksit kalanı alır.
                    </Typography.Text>

                    <Form.List name="taksit_plani">
                      {(fields) => (
                        <>
                          {fields.map(({ key, name, ...rest }, idx) => (
                            <Row gutter={8} key={key} align="middle" style={{ marginBottom: 8 }}>
                              <Col span={2}>
                                <Typography.Text type="secondary">#{idx + 1}</Typography.Text>
                              </Col>
                              <Col span={10}>
                                <Form.Item
                                  {...rest}
                                  name={[name, "vade_tarihi"]}
                                  rules={[{ required: true, message: "Vade" }]}
                                  style={{ marginBottom: 0 }}
                                >
                                  <DatePicker style={{ width: "100%" }} format="DD.MM.YYYY" placeholder="Vade" />
                                </Form.Item>
                              </Col>
                              <Col span={12}>
                                <Form.Item
                                  {...rest}
                                  name={[name, "tutar"]}
                                  rules={[{ required: true, message: "Tutar" }]}
                                  style={{ marginBottom: 0 }}
                                >
                                  <InputNumber
                                    style={{ width: "100%" }}
                                    min={0}
                                    step={0.01}
                                    precision={2}
                                    addonAfter="₺"
                                    placeholder="0,00"
                                    onChange={idx === 0 ? handleFirstTaksitAmountChange : undefined}
                                  />
                                </Form.Item>
                              </Col>
                            </Row>
                          ))}
                        </>
                      )}
                    </Form.List>

                    <Form.Item noStyle shouldUpdate={() => true}>
                      {() => {
                        const rows = (form.getFieldValue("taksit_plani") ?? []) as { tutar?: number }[];
                        const toplam = rows.reduce((s, r) => s + (Number(r?.tutar) || 0), 0);
                        const net = hesaplaNet(
                          Number(form.getFieldValue("brut_tutar") || 0),
                          Number(form.getFieldValue("kdv_orani") || 0),
                          form.getFieldValue("kdv_mod") || "haric",
                        );
                        const fark = toplam - net;
                        const uyumlu = Math.abs(fark) <= 0.05;
                        const f = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                        return (
                          <Alert
                            style={{ marginTop: 8 }}
                            type={uyumlu ? "success" : "warning"}
                            showIcon
                            message={`Taksit toplamı: ${f(toplam)} ₺ / Net: ${f(net)} ₺`}
                            description={uyumlu ? "Tutar uyumlu." : `Fark: ${f(fark)} ₺ — toplam net tutara eşit olmalı.`}
                          />
                        );
                      }}
                    </Form.Item>
                  </>
                ) : null
              }
            </Form.Item>
          </>
        )}

        {!editing && (
          <>
            <Divider style={{ margin: "4px 0 12px" }} orientation="left" plain>
              Kayıt & Tahsilat / Ödeme Seçenekleri
            </Divider>
            <div
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 10,
                padding: "10px 12px",
                marginBottom: 12,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Taslak olarak kaydet</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  Onaylanana kadar cari bakiyeyi ve finans raporlarını etkilemez.
                </div>
              </div>
              <Form.Item name="taslak_olarak_kaydet" valuePropName="checked" style={{ marginBottom: 0 }}>
                <Switch
                  onChange={(checked) => {
                    if (checked) form.setFieldsValue({ hemen_islem: false });
                  }}
                />
              </Form.Item>
            </div>

            {!taslakSecili && taksitMod !== "taksitli" && !cekSenetSecili && (
              <div
                style={{
                  background: hemenIslem ? "#f0fdf4" : "#f8fafc",
                  border: `1px solid ${hemenIslem ? "#bbf7d0" : "#e2e8f0"}`,
                  borderRadius: 10,
                  padding: "10px 12px",
                  marginBottom: 14,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {cfg.modul === "gider"
                        ? "Ödemesi yapıldı (Tek adımda peşin ödeme işle)"
                        : "Tahsilatı yapıldı (Tek adımda peşin tahsilat işle)"}
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>
                      Kayıt oluşturulurken kasa/banka veya cari serbest bakiyeden otomatik kapatılır.
                    </div>
                  </div>
                  <Form.Item name="hemen_islem" valuePropName="checked" style={{ marginBottom: 0 }}>
                    <Switch />
                  </Form.Item>
                </div>

                {hemenIslem && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed #cbd5e1" }}>
                    {cariSerbestBakiye > 0 && (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 10,
                          marginBottom: 10,
                          padding: "8px 10px",
                          background: "#eff6ff",
                          borderRadius: 8,
                          border: "1px solid #bfdbfe",
                        }}
                      >
                        <span style={{ fontSize: 12.5, color: "#1e3a8a" }}>
                          Cari serbest bakiyeden mahsup et (Kullanılabilir: <strong>{TL(cariSerbestBakiye)}</strong>)
                        </span>
                        <Form.Item name="bakiyeden_mahsup" valuePropName="checked" style={{ marginBottom: 0 }}>
                          <Switch size="small" />
                        </Form.Item>
                      </div>
                    )}

                    {!mahsupSecili && (
                      <Row gutter={12}>
                        <Col span={12}>
                          <Form.Item
                            name="mali_hesap_id"
                            label="Mali Hesap (Kasa/Banka)"
                            rules={[{ required: true, message: "Mali hesap seçin." }]}
                          >
                            <Select
                              showSearch
                              optionFilterProp="label"
                              placeholder="Kasa/Banka seçin"
                              options={(dropdown?.mali_hesaplar ?? []).map((m) => ({ value: m.id, label: m.ad }))}
                              onChange={() => form.setFieldsValue({ islem_odeme_yontemi_id: undefined })}
                            />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item
                            name="islem_odeme_yontemi_id"
                            label={cfg.modul === "gider" ? "Ödeme Yöntemi" : "Tahsilat Yöntemi"}
                            rules={[{ required: true, message: "Yöntem seçin." }]}
                          >
                            <Select
                              showSearch
                              optionFilterProp="label"
                              placeholder={maliHesapId ? "Seçin" : "Önce hesap seçin"}
                              disabled={!maliHesapId}
                              options={hesapOdemeYontemleri.map((o) => ({ value: o.id, label: o.ad }))}
                            />
                          </Form.Item>
                        </Col>
                      </Row>
                    )}

                    <Form.Item
                      name="islem_odeme_tarihi"
                      label={cfg.modul === "gider" ? "Ödeme Tarihi" : "Tahsilat Tarihi"}
                      style={{ marginBottom: 0 }}
                    >
                      <DatePicker style={{ width: "100%" }} format="DD.MM.YYYY" />
                    </Form.Item>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <Form.Item name="etiket_ids" label="Etiketler">
          <Select
            mode="multiple"
            allowClear
            placeholder="Etiket ekle"
            options={(dropdown?.etiketler ?? []).map((e) => ({ value: e.id, label: e.ad }))}
          />
        </Form.Item>

        {(dropdown?.aciklama_sablonlari?.length ?? 0) > 0 && (
          <Form.Item label="Açıklama Şablonu">
            <Select
              allowClear
              placeholder="Hazır şablondan doldur"
              options={(dropdown?.aciklama_sablonlari ?? []).map((s) => ({ value: s.id, label: s.ad }))}
              onChange={(id) => {
                const s = (dropdown?.aciklama_sablonlari ?? []).find((x) => x.id === id);
                if (s) form.setFieldsValue({ aciklama: s.icerik });
              }}
            />
          </Form.Item>
        )}

        <Form.Item name="aciklama" label="Açıklama">
          <Input.TextArea rows={3} placeholder="Açıklama" />
        </Form.Item>
      </Form>
    </Drawer>

    {quickCariOpen && (
      <CariV2FormDrawer
        kurumId={kurumId}
        subeId={subeId}
        cariId={null}
        etiketler={[]}
        initialTur={cfg.modul === "gider" ? "tedarikci" : "musteri"}
        onClose={() => setQuickCariOpen(false)}
        onSaved={() => {
          setQuickCariOpen(false);
          void onDropdownRefresh?.();
        }}
        onCreatedCari={(created) => {
          setExtraCariler((prev) => [...prev, { id: created.id, unvan: created.unvan, hesap_turu: created.hesap_turu }]);
          form.setFieldsValue({ cari_hesap_id: created.id });
        }}
        onToast={(msg, type) => {
          if (type === "error") message.error(msg);
          else message.success(msg);
        }}
      />
    )}
    </>
  );
}
