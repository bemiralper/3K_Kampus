"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  App as AntApp,
  Button,
  ConfigProvider,
  Drawer,
  Form,
  Input,
  Switch,
  Typography,
} from "antd";
import trTR from "antd/locale/tr_TR";
import { useKurum } from "@/lib/contexts/KurumContext";
import {
  createOkul,
  fetchOkulAutocomplete,
  type OkulAutocompleteItem,
  type OkulFormData,
} from "@/lib/okul-api";

type SchoolAutocompleteProps = {
  value: number | null;
  displayValue: string;
  label: string;
  placeholder?: string;
  onChange: (schoolId: number | null, schoolAd: string) => void;
  disabled?: boolean;
};

const EMPTY_FORM: OkulFormData = {
  ad: "",
  okul_turu: "",
  il: "",
  ilce: "",
  not_metni: "",
  aktif_mi: true,
};

export default function SchoolAutocomplete(props: SchoolAutocompleteProps) {
  return (
    <AntApp>
      <SchoolAutocompleteInner {...props} />
    </AntApp>
  );
}

function SchoolAutocompleteInner({
  value,
  displayValue,
  label,
  placeholder = "Okul adı yazarak arayın",
  onChange,
  disabled = false,
}: SchoolAutocompleteProps) {
  const { message } = AntApp.useApp();
  const { activeSube } = useKurum();
  const [form] = Form.useForm<OkulFormData>();
  const [query, setQuery] = useState(displayValue);
  const [results, setResults] = useState<OkulAutocompleteItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickSaving, setQuickSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQuery(displayValue);
  }, [displayValue]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const runSearch = useCallback(async (q: string) => {
    if (!activeSube?.id) {
      setResults([]);
      setLoadError("Okul listesi için üst menüden şube seçin.");
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const items = await fetchOkulAutocomplete(q);
      setResults(items);
      setOpen(true);
    } catch (err) {
      setResults([]);
      setLoadError(err instanceof Error ? err.message : "Okul listesi yüklenemedi.");
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }, [activeSube?.id]);

  useEffect(() => {
    runSearch("");
  }, [runSearch, activeSube?.id]);

  const handleInputChange = (text: string) => {
    setQuery(text);
    if (value) {
      onChange(null, text);
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(text), 250);
  };

  const handleSelect = (item: OkulAutocompleteItem) => {
    onChange(item.id, item.ad);
    setQuery(item.ad);
    setOpen(false);
  };

  const openQuickAdd = () => {
    form.setFieldsValue({ ...EMPTY_FORM, ad: query.trim() });
    setShowQuickAdd(true);
    setOpen(false);
  };

  const closeQuickAdd = () => {
    if (quickSaving) return;
    setShowQuickAdd(false);
    form.resetFields();
  };

  const handleQuickSave = async () => {
    let values: OkulFormData;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    setQuickSaving(true);
    try {
      const created = await createOkul(values);
      onChange(created.id, created.ad);
      setQuery(created.ad);
      setShowQuickAdd(false);
      form.resetFields();
      message.success("Okul başarıyla eklendi.");
      runSearch(created.ad);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Okul eklenemedi.";
      message.error(errMsg);
    } finally {
      setQuickSaving(false);
    }
  };

  return (
    <ConfigProvider locale={trTR}>
      <div className="wizard-field" ref={wrapperRef}>
        <label className="wizard-label">{label}</label>
        <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <input
              type="text"
              className="wizard-input"
              value={query}
              placeholder={placeholder}
              disabled={disabled}
              onChange={(e) => handleInputChange(e.target.value)}
              onFocus={() => {
                if (query.trim()) runSearch(query);
                else runSearch("");
              }}
              autoComplete="off"
            />
            {open && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  zIndex: 50,
                  background: "#fff",
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  marginTop: 4,
                  maxHeight: 220,
                  overflowY: "auto",
                  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.12)",
                }}
              >
                {loading && (
                  <div style={{ padding: "10px 12px", fontSize: 13, color: "#6b7280" }}>Aranıyor…</div>
                )}
                {!loading && results.length === 0 && (
                  <div style={{ padding: "10px 12px", fontSize: 13, color: "#6b7280" }}>
                    {loadError || "Sonuç bulunamadı"}
                  </div>
                )}
                {!loading &&
                  results.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelect(item)}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "10px 12px",
                        border: "none",
                        background: value === item.id ? "#eff6ff" : "transparent",
                        cursor: "pointer",
                        fontSize: 13,
                      }}
                    >
                      {item.ad}
                      {item.okul_turu ? (
                        <span style={{ color: "#6b7280", marginLeft: 8 }}>{item.okul_turu}</span>
                      ) : null}
                    </button>
                  ))}
              </div>
            )}
          </div>
          <Button
            type="default"
            onClick={openQuickAdd}
            disabled={disabled}
            title="Yeni Okul Ekle"
            style={{ minWidth: 42, height: 42, padding: "0 12px", fontSize: 20, lineHeight: 1 }}
          >
            +
          </Button>
        </div>
        {loadError && (
          <span className="wizard-error" style={{ marginTop: 6 }}>{loadError}</span>
        )}
      </div>

      <Drawer
        title={null}
        placement="right"
        width={440}
        open={showQuickAdd}
        onClose={closeQuickAdd}
        destroyOnClose
        zIndex={2100}
        styles={{
          body: { padding: "20px 24px 24px", background: "#f8fafc" },
          header: { display: "none" },
        }}
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button onClick={closeQuickAdd} disabled={quickSaving}>
              İptal
            </Button>
            <Button type="primary" loading={quickSaving} onClick={handleQuickSave}>
              Kaydet
            </Button>
          </div>
        }
      >
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "linear-gradient(135deg, #3b82f6, #2563eb)",
              color: "#fff",
              fontSize: 22,
              marginBottom: 12,
            }}
          >
            🏫
          </div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            Hızlı Okul Ekle
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ margin: "6px 0 0" }}>
            Kurum modülündeki okul listesine yeni kayıt ekleyin. Seçili şubeye bağlanır.
          </Typography.Paragraph>
          {activeSube && (
            <div
              style={{
                marginTop: 12,
                padding: "8px 12px",
                borderRadius: 8,
                background: "#eff6ff",
                border: "1px solid #bfdbfe",
                fontSize: 13,
                color: "#1e40af",
              }}
            >
              Şube: <strong>{activeSube.ad}</strong>
            </div>
          )}
        </div>

        <Form
          form={form}
          layout="vertical"
          initialValues={EMPTY_FORM}
          requiredMark="optional"
          style={{
            background: "#fff",
            borderRadius: 12,
            padding: 20,
            border: "1px solid #e2e8f0",
          }}
        >
          <Form.Item
            name="ad"
            label="Okul Adı"
            rules={[{ required: true, message: "Okul adı zorunludur." }]}
          >
            <Input placeholder="Örn. Atatürk Anadolu Lisesi" size="large" />
          </Form.Item>

          <Form.Item name="okul_turu" label="Okul Türü">
            <Input placeholder="Örn. Anadolu Lisesi, İlkokul" />
          </Form.Item>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Form.Item name="il" label="İl">
              <Input placeholder="İl" />
            </Form.Item>
            <Form.Item name="ilce" label="İlçe">
              <Input placeholder="İlçe" />
            </Form.Item>
          </div>

          <Form.Item name="not_metni" label="Not" style={{ marginTop: 16 }}>
            <Input.TextArea rows={2} placeholder="İsteğe bağlı not" />
          </Form.Item>

          <Form.Item name="aktif_mi" label="Durum" valuePropName="checked">
            <Switch checkedChildren="Aktif" unCheckedChildren="Pasif" defaultChecked />
          </Form.Item>
        </Form>
      </Drawer>
    </ConfigProvider>
  );
}
