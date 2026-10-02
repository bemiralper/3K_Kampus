"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, Form, Input, Space, Switch, Tag, App as AntApp } from "antd";
import { useKurum } from "@/lib/contexts/KurumContext";
import { finansRequest, FinansHttpError } from "../services/finans-http";

const DEFAULT_WS_URL = "https://edonusumapi.uyum.com.tr/Services/Integration";
const DEFAULT_PORTAL = "https://edonusum.uyum.com.tr";

type Ayar = {
  kurum_id: number;
  kayitli: boolean;
  web_servis_url: string;
  portal_url: string;
  kullanici_adi: string;
  vkn: string;
  gonderici_birim: string;
  posta_kutusu: string;
  aktif: boolean;
  sifre_kayitli: boolean;
  son_test_at: string | null;
  son_test_basarili: boolean | null;
  son_test_mesaji: string;
  son_test_ozet: {
    unvan?: string;
    vkn?: string;
    e_fatura?: boolean | null;
    e_arsiv?: boolean | null;
    e_irsaliye?: boolean | null;
  };
};

type FormValues = {
  web_servis_url: string;
  portal_url: string;
  kullanici_adi: string;
  sifre?: string;
  vkn: string;
  gonderici_birim: string;
  posta_kutusu: string;
  aktif: boolean;
};

export default function UyumsoftAyarClient() {
  const { activeKurum } = useKurum();
  const kurumId = activeKurum?.id;
  const { message } = AntApp.useApp();
  const [form] = Form.useForm<FormValues>();
  const [ayar, setAyar] = useState<Ayar | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testNote, setTestNote] = useState<{ type: "success" | "warning" | "error"; text: string } | null>(null);

  const load = useCallback(async (preserveNote = false) => {
    if (!kurumId) return;
    setLoading(true);
    if (!preserveNote) setTestNote(null);
    try {
      const data = await finansRequest<Ayar>(`/uyumsoft-ayar/?kurum_id=${kurumId}`);
      setAyar(data);
      form.setFieldsValue({
        web_servis_url: data.web_servis_url || DEFAULT_WS_URL,
        portal_url: data.portal_url || DEFAULT_PORTAL,
        kullanici_adi: data.kullanici_adi,
        sifre: "",
        vkn: data.vkn,
        gonderici_birim: data.gonderici_birim,
        posta_kutusu: data.posta_kutusu,
        aktif: data.aktif,
      });
    } catch (e) {
      message.error(e instanceof FinansHttpError ? e.message : "Ayarlar yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [form, kurumId, message]);

  useEffect(() => {
    load();
  }, [load]);

  const bodyFromForm = async () => {
    const values = await form.validateFields();
    return {
      kurum_id: kurumId,
      ...values,
      sifre: values.sifre || "",
    };
  };

  const save = async () => {
    if (!kurumId) return;
    let body;
    try {
      body = await bodyFromForm();
    } catch {
      return;
    }
    if (!ayar?.sifre_kayitli && !body.sifre) {
      message.error("İlk kayıtta web servis şifresi zorunludur.");
      return;
    }
    setSaving(true);
    try {
      const data = await finansRequest<Ayar>("/uyumsoft-ayar/", {
        method: "PUT",
        body: JSON.stringify(body),
      });
      setAyar(data);
      form.setFieldValue("sifre", "");
      message.success("Uyumsoft ayarları bu kurum için kaydedildi.");
    } catch (e) {
      message.error(e instanceof FinansHttpError ? e.message : "Kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    if (!kurumId) return;
    let body;
    try {
      body = await bodyFromForm();
    } catch {
      return;
    }
    setTesting(true);
    setTestNote(null);
    try {
      const res = await finansRequest<{ basarili: boolean; uyari?: string; ozet?: Ayar["son_test_ozet"] }>(
        "/uyumsoft-ayar/test/",
        { method: "POST", body: JSON.stringify(body) },
      );
      const ozet = res.ozet;
      const urunler = [
        ozet?.e_fatura ? "e-Fatura" : null,
        ozet?.e_arsiv ? "e-Arşiv" : null,
        ozet?.e_irsaliye ? "e-İrsaliye" : null,
      ].filter(Boolean).join(", ");
      const text = [
        ozet?.unvan ? `${ozet.unvan} hesabına bağlanıldı.` : "Bağlantı kuruldu.",
        urunler ? `Açık ürünler: ${urunler}.` : "",
        res.uyari || "",
      ].filter(Boolean).join(" ");
      setTestNote({ type: res.uyari ? "warning" : "success", text });
      await load(true);
    } catch (e) {
      const text = e instanceof FinansHttpError ? e.message : "Bağlantı kurulamadı.";
      setTestNote({ type: "error", text });
    } finally {
      setTesting(false);
    }
  };

  if (!kurumId) {
    return <div style={{ padding: 48, textAlign: "center", color: "#64748b" }}>Lütfen kurum seçin.</div>;
  }

  return (
    <div style={{ padding: "4px 4px 40px", maxWidth: 820 }}>
      <div
        style={{
          background: "linear-gradient(120deg, #1F3C880d, #ffffff)",
          border: "1px solid #eef2f7",
          borderRadius: 16,
          padding: "18px 22px",
          marginBottom: 16,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0f172a" }}>E-Belge Ayarları</h1>
        <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13, lineHeight: 1.5 }}>
          {activeKurum?.ad} için Uyumsoft bağlantısı. Kayıt seçili kuruma aittir; üstten başka kurum
          seçildiğinde o kurumun kendi kullanıcısı açılır. Portal şifresi burada tutulmaz. Fatura onayı{" "}
          <a href={DEFAULT_PORTAL} target="_blank" rel="noreferrer">edonusum.uyum.com.tr</a> üzerinde kalır.
        </p>
      </div>

      <Card loading={loading}>
        <Form form={form} layout="vertical" requiredMark="optional">
          <Form.Item
            label="Web servis adresi"
            name="web_servis_url"
            rules={[{ required: true, message: "Web servis adresi zorunludur." }]}
            extra="Uyumsoft’un e-Fatura Integration adresi. Başka bir sunucuya yazılmaz."
          >
            <Input />
          </Form.Item>
          <Form.Item
            label="Portal adresi"
            name="portal_url"
            rules={[{ required: true, message: "Portal adresi zorunludur." }]}
            extra="Faturayı görüp onaylayacağınız ekran. Uygulama bu adrese istek atmaz."
          >
            <Input />
          </Form.Item>
          <Form.Item
            label="Web servis kullanıcısı"
            name="kullanici_adi"
            rules={[{ required: true, message: "Kullanıcı adı zorunludur." }]}
            extra="Portal girişindeki kullanıcı değil. Uyumsoft’un web servis kullanıcısı."
          >
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item
            label="Web servis şifresi"
            name="sifre"
            extra={ayar?.sifre_kayitli ? "Kayıtlı şifre duruyor. Değiştirmek için yenisini yazın; boş bırakırsanız aynı şifre kalır." : "İlk kayıtta zorunlu. Ekranda tekrar gösterilmez."}
          >
            <Input.Password autoComplete="new-password" placeholder={ayar?.sifre_kayitli ? "••••••••" : ""} />
          </Form.Item>
          <Form.Item
            label="VKN / TCKN"
            name="vkn"
            rules={[{ required: true, message: "Vergi numarası zorunludur." }]}
          >
            <Input inputMode="numeric" maxLength={11} />
          </Form.Item>
          <Form.Item
            label="Gönderici birim"
            name="gonderici_birim"
            rules={[{ required: true, message: "Gönderici birim zorunludur." }]}
            extra="Kesilen faturanın çıkan etiketi. Örnek: urn:mail:defaultgb@firma.com"
          >
            <Input />
          </Form.Item>
          <Form.Item
            label="Posta kutusu"
            name="posta_kutusu"
            rules={[{ required: true, message: "Posta kutusu zorunludur." }]}
            extra="Size gelen e-faturaların etiketi. Örnek: urn:mail:defaultpk@firma.com"
          >
            <Input />
          </Form.Item>
          <Form.Item label="Bu kurumda e-belge açık" name="aktif" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>

        {testNote && (
          <Alert type={testNote.type} showIcon style={{ marginBottom: 12 }} message={testNote.text} />
        )}
        {ayar?.son_test_at && !testNote && (
          <Alert
            type={ayar.son_test_basarili ? "success" : "error"}
            showIcon
            style={{ marginBottom: 12 }}
            message={ayar.son_test_mesaji || (ayar.son_test_basarili ? "Son deneme başarılı." : "Son deneme başarısız.")}
            description={
              <Space size={6} wrap>
                {ayar.son_test_ozet?.e_fatura && <Tag color="blue">e-Fatura</Tag>}
                {ayar.son_test_ozet?.e_arsiv && <Tag color="green">e-Arşiv</Tag>}
                {ayar.son_test_ozet?.e_irsaliye && <Tag>e-İrsaliye</Tag>}
              </Space>
            }
          />
        )}

        <Space>
          <Button type="primary" loading={saving} onClick={save}>Kaydet</Button>
          <Button loading={testing} onClick={testConnection}>Bağlantıyı dene</Button>
        </Space>
      </Card>
    </div>
  );
}
