"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Card, Tabs, Table, Button, Space, Modal, Form, Input, Switch, Tag,
  Popconfirm, App as AntApp, ColorPicker, Alert, Select, InputNumber,
} from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import { useKurum } from "@/lib/contexts/KurumContext";
import { tanimService, TanimTipi } from "./gg-v2-api";
import { GGTanim } from "./gg-v2-types";
import { cariV2Service } from "../services/cari-v2-api";
import { FinansHttpError } from "../services/finans-http";
import GelirYonetimiClient from "../gelir-yonetimi/GelirYonetimiClient";
import GiderYonetimiClient from "../gider-yonetimi/GiderYonetimiClient";
import MaliHesaplarClient from "../tanimlar/TanimlarClient";

// Analiz boyutu tanımları (kategoriden farklı: raporlarda kırılım için)
const TIPLER: { key: TanimTipi; ad: string; intro: string }[] = [
  { key: "gelir_kaynagi", ad: "Gelir Kaynakları", intro: "Gelirin hangi kanaldan geldiğini gösterir (ör. Kayıt Ücreti, Servis, Yemek, Kırtasiye). Kategoriden farklıdır: kategori “ne tür gelir” (muhasebe sınıfı), kaynak “nereden geldiği”dir. Raporlarda ek kırılım sağlar." },
  { key: "maliyet_merkezi", ad: "Maliyet / Gider Merkezleri", intro: "Giderin hangi birime/departmana ait olduğunu gösterir (ör. Mutfak, Servis, İdari, Pazarlama). Kategori “ne harcandı”, maliyet merkezi “hangi birim harcadı”dır." },
  { key: "proje", ad: "Projeler", intro: "Proje/kampanya bazlı gelir-gider takibi (ör. Yaz Okulu, Bina Yenileme). Bir gelir veya gidere proje etiketleyerek proje kârlılığını raporlayabilirsin." },
  { key: "aciklama_sablonu", ad: "Açıklama Şablonları", intro: "Sık kullanılan açıklama metinleri. Gelir/gider kaydı açarken tek tıkla açıklama alanını doldurur, veri girişini hızlandırır ve standartlaştırır." },
];

export default function TanimlarClient() {
  const { activeKurum, activeSube } = useKurum();
  const kurumId = activeKurum?.id;
  const subeId = activeSube?.id ?? null;

  const [active, setActive] = useState<string>("gelir_kategori");

  if (!kurumId) {
    return <div style={{ padding: 48, textAlign: "center", color: "#64748b" }}>Lütfen kurum ve şube seçin.</div>;
  }

  const tabIntro = (text: string) => (
    <Alert type="info" showIcon style={{ marginBottom: 12 }} message={text} />
  );

  const items = [
    {
      key: "gelir_kategori", label: "Gelir Kategorileri",
      children: <>{tabIntro("Gelirin muhasebe sınıfını belirler (ör. Eğitim Geliri, Kira Geliri). Ana başlık + alt kategori olarak hiyerarşik tanımlanır; filtre ve raporların temel kırılımıdır.")}<GelirYonetimiClient embedded /></>,
    },
    {
      key: "gider_kategori", label: "Gider Kategorileri",
      children: <>{tabIntro("Giderin muhasebe sınıfını belirler (ör. Personel, Kira, Fatura, Malzeme). Ana başlık + alt kategori olarak hiyerarşik tanımlanır; filtre ve raporların temel kırılımıdır.")}<GiderYonetimiClient embedded /></>,
    },
    ...TIPLER.map((t) => ({
      key: t.key,
      label: t.ad,
      children: <>{tabIntro(t.intro)}<TanimTablosu tip={t.key} baslik={t.ad} kurumId={kurumId} subeId={subeId} /></>,
    })),
    {
      key: "masraf_turu", label: "Masraf Türleri",
      children: <>{tabIntro("Banka/işlem masrafları (ör. EFT Masrafı, POS Komisyonu, Havale Masrafı). Gider öderken ödeme yöntemi banka yollu ise bu listeden masraf türü seçilir; masraf otomatik gider olarak işlenir ve raporlarda ayrı görülür.")}<MasrafTuruTab kurumId={kurumId} subeId={subeId} /></>,
    },
    {
      key: "etiketler", label: "Etiketler",
      children: <>{tabIntro("Serbest etiketler (ör. Acil, Onay Bekliyor, Tekrarlayan). Kayıtlara birden fazla etiket eklenebilir; kategoriden bağımsız hızlı gruplama/filtreleme sağlar.")}<EtiketTab kurumId={kurumId} subeId={subeId} /></>,
    },
    {
      key: "mali_hesap",
      label: "Mali Hesap / Ödeme Yöntemleri",
      children: (
        <>
          {tabIntro("Kasa / Banka / POS hesapları ve bunlara bağlı ödeme yöntemleri. Gelir tahsilatları ve gider ödemeleri buradaki hesaplar üzerinden yapılır; hareketler otomatik işlenir.")}
          <MaliHesaplarClient embedded />
        </>
      ),
    },
  ];

  return (
    <div style={{ padding: "4px 4px 40px" }}>
      <div
        style={{
          background: "linear-gradient(120deg, #1F3C880d, #ffffff)",
          border: "1px solid #eef2f7", borderRadius: 16, padding: "18px 22px", marginBottom: 16,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0f172a" }}>Finansman Tanımları</h1>
        <p style={{ margin: "2px 0 0", color: "#64748b", fontSize: 13 }}>
          Tüm finans modülleriyle ortak master data. <strong>Sınıflandırma</strong> (kategoriler) “ne” sorusunu,{" "}
          <strong>analiz boyutları</strong> (kaynak, maliyet merkezi, proje) “nereden / hangi birim / hangi iş” sorusunu yanıtlar.
          Etiketler ve şablonlar veri girişini hızlandırır; mali hesaplar ise tahsilat/ödemelerin yapıldığı kasa & bankalardır.
        </p>
      </div>

      <Card size="small">
        <Tabs activeKey={active} onChange={setActive} items={items} tabPosition="top" />
      </Card>
    </div>
  );
}

interface EtiketRow { id: number; ad: string; renk: string }

function EtiketTab({ kurumId, subeId }: { kurumId: number; subeId: number | null }) {
  const { message } = AntApp.useApp();
  const [rows, setRows] = useState<EtiketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await cariV2Service.etiketler(kurumId, subeId);
      setRows(res as unknown as EtiketRow[]);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [kurumId, subeId, message]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    let v;
    try { v = await form.validateFields(); } catch { return; }
    const renk = typeof v.renk === "string" ? v.renk : v.renk?.toHexString?.() || "#0262a7";
    try {
      await cariV2Service.etiketCreate(kurumId, v.ad, renk);
      message.success("Etiket eklendi.");
      setModalOpen(false);
      form.resetFields();
      load();
    } catch (e) {
      message.error(e instanceof FinansHttpError ? e.message : "Eklenemedi.");
    }
  };

  const remove = async (row: EtiketRow) => {
    try {
      await cariV2Service.etiketDelete(row.id, kurumId);
      message.success("Silindi.");
      load();
    } catch (e) {
      message.error(e instanceof FinansHttpError ? e.message : "Silinemedi.");
    }
  };

  return (
    <>
      <div style={{ marginBottom: 12, textAlign: "right" }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); form.setFieldsValue({ renk: "#0262a7" }); setModalOpen(true); }}>
          Yeni Etiket
        </Button>
      </div>
      <Table<EtiketRow>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={rows}
        pagination={{ pageSize: 15, showTotal: (t) => `Toplam ${t}` }}
        columns={[
          {
            title: "Etiket", key: "ad",
            render: (_, r) => <Tag color={r.renk}>{r.ad}</Tag>,
          },
          { title: "Renk", dataIndex: "renk", key: "renk" },
          {
            title: "", key: "islem", width: 60,
            render: (_, r) => (
              <Popconfirm title="Silinsin mi?" okText="Sil" cancelText="Vazgeç" onConfirm={() => remove(r)}>
                <Button size="small" type="text" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            ),
          },
        ]}
      />
      <Modal title="Yeni Etiket" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={save} okText="Kaydet" cancelText="Vazgeç" destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="ad" label="Etiket Adı" rules={[{ required: true, message: "Ad girin." }]}>
            <Input placeholder="Etiket adı" />
          </Form.Item>
          <Form.Item name="renk" label="Renk">
            <ColorPicker />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

const KESINTI_TURLERI = [
  { value: "eft_masrafi", label: "EFT Masrafı" },
  { value: "havale_masrafi", label: "Havale Masrafı" },
  { value: "fast_ucreti", label: "FAST Ücreti" },
  { value: "pos_komisyonu", label: "POS Komisyonu" },
  { value: "sanal_pos_komisyonu", label: "Sanal POS Komisyonu" },
  { value: "online_odeme_komisyonu", label: "Online Ödeme Komisyonu" },
  { value: "hesap_isletim_ucreti", label: "Hesap İşletim Ücreti" },
  { value: "doviz_cevrim_masrafi", label: "Döviz Çevrim Masrafı" },
  { value: "diger_banka_masraflari", label: "Diğer Banka Masrafları" },
];

function MasrafTuruTab({ kurumId, subeId }: { kurumId: number; subeId: number | null }) {
  const { message } = AntApp.useApp();
  const [rows, setRows] = useState<GGTanim[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<GGTanim | null>(null);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await tanimService.list("masraf_turu", kurumId, subeId));
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [kurumId, subeId, message]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ aktif_mi: true, kesinti_turu: "diger_banka_masraflari", varsayilan_tutar: 0 });
    setModalOpen(true);
  };
  const openEdit = (row: GGTanim) => {
    setEditing(row);
    form.setFieldsValue({
      ad: row.ad,
      kesinti_turu: (row.kesinti_turu as string) || "diger_banka_masraflari",
      varsayilan_tutar: Number(row.varsayilan_tutar ?? 0),
      aciklama: row.aciklama,
      aktif_mi: row.aktif_mi,
    });
    setModalOpen(true);
  };

  const save = async () => {
    let v;
    try { v = await form.validateFields(); } catch { return; }
    try {
      if (editing) {
        await tanimService.update("masraf_turu", editing.id, { ...v, kurum_id: kurumId });
        message.success("Güncellendi.");
      } else {
        await tanimService.create("masraf_turu", kurumId, v, subeId);
        message.success("Eklendi.");
      }
      setModalOpen(false);
      load();
    } catch (e) {
      message.error(e instanceof FinansHttpError ? e.message : "Kaydedilemedi.");
    }
  };

  const remove = async (row: GGTanim) => {
    const kullanim = Number(row.kullanim_sayisi ?? 0);
    if (kullanim > 0) {
      message.warning(`Bu masraf türü ${kullanim} işlemde kullanılıyor; silinemez. Pasife alabilirsiniz.`);
      return;
    }
    try {
      await tanimService.remove("masraf_turu", row.id, kurumId);
      message.success("Silindi.");
      load();
    } catch (e) {
      message.error(e instanceof FinansHttpError ? e.message : "Silinemedi.");
    }
  };

  const toggle = async (row: GGTanim) => {
    try { await tanimService.toggle("masraf_turu", row.id, kurumId); load(); }
    catch (e) { message.error(e instanceof FinansHttpError ? e.message : "İşlem başarısız."); }
  };

  return (
    <>
      <div style={{ marginBottom: 12, textAlign: "right" }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Yeni Masraf Türü</Button>
      </div>
      <Table<GGTanim>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={rows}
        pagination={{ pageSize: 15, showTotal: (t) => `Toplam ${t}` }}
        columns={[
          { title: "Ad", dataIndex: "ad", key: "ad" },
          {
            title: "Muhasebe Türü", dataIndex: "kesinti_turu", key: "kesinti_turu",
            render: (v) => KESINTI_TURLERI.find((k) => k.value === v)?.label || v || "—",
          },
          {
            title: "Varsayılan Tutar", dataIndex: "varsayilan_tutar", key: "varsayilan_tutar",
            align: "right",
            render: (v) => (Number(v) > 0 ? `${Number(v).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺` : "—"),
          },
          {
            title: "Kullanım", dataIndex: "kullanim_sayisi", key: "kullanim_sayisi", width: 80, align: "center",
            render: (v) => Number(v ?? 0) || "—",
          },
          {
            title: "Durum", dataIndex: "aktif_mi", key: "aktif_mi", width: 100,
            render: (v: boolean, r) => (
              <Tag color={v ? "green" : "default"} style={{ cursor: "pointer" }} onClick={() => toggle(r)}>
                {v ? "Aktif" : "Pasif"}
              </Tag>
            ),
          },
          {
            title: "", key: "islem", width: 90,
            render: (_, r) => (
              <Space size={2}>
                <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(r)} />
                <Popconfirm
                  title={Number(r.kullanim_sayisi ?? 0) > 0 ? "Kullanımda — silinemez" : "Silinsin mi?"}
                  okText="Sil"
                  cancelText="Vazgeç"
                  disabled={Number(r.kullanim_sayisi ?? 0) > 0}
                  onConfirm={() => remove(r)}
                >
                  <Button
                    size="small"
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    disabled={Number(r.kullanim_sayisi ?? 0) > 0}
                  />
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={editing ? "Masraf Türü — Düzenle" : "Masraf Türü — Yeni"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={save}
        okText="Kaydet"
        cancelText="Vazgeç"
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="ad" label="Ad" rules={[{ required: true, message: "Ad girin." }]}>
            <Input placeholder="Örn. EFT Masrafı" />
          </Form.Item>
          <Form.Item
            name="kesinti_turu"
            label="Muhasebe Kesinti Türü"
            tooltip="Bu masrafın hangi banka gider kategorisine yazılacağını belirler."
            rules={[{ required: true, message: "Seçin." }]}
          >
            <Select options={KESINTI_TURLERI} />
          </Form.Item>
          <Form.Item name="varsayilan_tutar" label="Varsayılan Tutar" tooltip="Ödeme ekranında otomatik dolar (0 = yok).">
            <InputNumber style={{ width: "100%" }} min={0} step={0.01} precision={2} addonAfter="₺" />
          </Form.Item>
          <Form.Item name="aciklama" label="Açıklama">
            <Input.TextArea rows={2} placeholder="Açıklama" />
          </Form.Item>
          <Form.Item name="aktif_mi" label="Aktif" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function TanimTablosu({
  tip, baslik, kurumId, subeId,
}: {
  tip: TanimTipi; baslik: string; kurumId: number; subeId: number | null;
}) {
  const { message } = AntApp.useApp();
  const [rows, setRows] = useState<GGTanim[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<GGTanim | null>(null);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await tanimService.list(tip, kurumId, subeId));
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [tip, kurumId, subeId, message]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); form.resetFields(); form.setFieldsValue({ aktif_mi: true }); setModalOpen(true); };
  const openEdit = (row: GGTanim) => {
    setEditing(row);
    form.setFieldsValue({ ad: row.ad, kod: row.kod, aciklama: row.aciklama, aktif_mi: row.aktif_mi });
    setModalOpen(true);
  };

  const save = async () => {
    let values;
    try { values = await form.validateFields(); } catch { return; }
    try {
      if (editing) {
        await tanimService.update(tip, editing.id, { ...values, kurum_id: kurumId });
        message.success("Güncellendi.");
      } else {
        await tanimService.create(tip, kurumId, values, subeId);
        message.success("Eklendi.");
      }
      setModalOpen(false);
      load();
    } catch (e) {
      message.error(e instanceof FinansHttpError ? e.message : "Kaydedilemedi.");
    }
  };

  const remove = async (row: GGTanim) => {
    try {
      await tanimService.remove(tip, row.id, kurumId);
      message.success("Silindi.");
      load();
    } catch (e) {
      message.error(e instanceof FinansHttpError ? e.message : "Silinemedi.");
    }
  };

  const toggle = async (row: GGTanim) => {
    try {
      await tanimService.toggle(tip, row.id, kurumId);
      load();
    } catch (e) {
      message.error(e instanceof FinansHttpError ? e.message : "İşlem başarısız.");
    }
  };

  return (
    <>
      <div style={{ marginBottom: 12, textAlign: "right" }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Yeni {baslik.replace(/lar[ıi]?$/i, "")}</Button>
      </div>
      <Table<GGTanim>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={rows}
        pagination={{ pageSize: 15, showTotal: (t) => `Toplam ${t}` }}
        columns={[
          { title: "Ad", dataIndex: "ad", key: "ad" },
          { title: "Kod", dataIndex: "kod", key: "kod", render: (v) => v || "—" },
          { title: "Açıklama", dataIndex: "aciklama", key: "aciklama", render: (v) => v || "—" },
          {
            title: "Durum", dataIndex: "aktif_mi", key: "aktif_mi", width: 110,
            render: (v: boolean, r) => (
              <Tag
                color={v ? "green" : "default"}
                style={{ cursor: "pointer" }}
                onClick={() => toggle(r)}
              >
                {v ? "Aktif" : "Pasif"}
              </Tag>
            ),
          },
          {
            title: "", key: "islem", width: 100,
            render: (_, r) => (
              <Space size={2}>
                <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(r)} />
                <Popconfirm title="Silinsin mi?" okText="Sil" cancelText="Vazgeç" onConfirm={() => remove(r)}>
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={editing ? `${baslik} — Düzenle` : `${baslik} — Yeni`}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={save}
        okText="Kaydet"
        cancelText="Vazgeç"
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="ad" label="Ad" rules={[{ required: true, message: "Ad girin." }]}>
            <Input placeholder="Ad" />
          </Form.Item>
          <Form.Item name="kod" label="Kod">
            <Input placeholder="Kısa kod (opsiyonel)" />
          </Form.Item>
          <Form.Item name="aciklama" label="Açıklama">
            <Input.TextArea rows={2} placeholder="Açıklama" />
          </Form.Item>
          <Form.Item name="aktif_mi" label="Aktif" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
