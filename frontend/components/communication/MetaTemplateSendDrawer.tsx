"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import WhatsAppPreviewBubble from "./WhatsAppPreviewBubble";
import {
  fetchConversationTemplates,
  sendConversationTemplate,
  type MessageItem,
  type WhatsAppMetaTemplateItem,
} from "@/lib/communication-api";

interface MetaTemplateSendDrawerProps {
  open: boolean;
  conversationId: string | null;
  contactType?: string | null;
  onClose: () => void;
  onSent: (message: MessageItem) => void;
}

const VARIABLE_LABELS: Record<string, string> = {
  ogrenci_ad: "Öğrenci adı",
  veli_ad: "Veli adı",
  personel_ad: "Personel adı",
  kurum_ad: "Kurum adı",
  sube: "Şube",
  sinif: "Sınıf",
  tarih: "Tarih",
  saat: "Saat",
  konu: "Konu",
  mesaj: "Mesaj",
  baslik: "Başlık",
  aciklama: "Açıklama",
  yoklama_tarihi: "Yoklama tarihi",
  oturum_ad: "Oturum",
  giris_saati: "Giriş saati",
  cikis_saati: "Çıkış saati",
  salon_ad: "Salon adı",
  ders_no: "Ders no",
  taksit_no: "Taksit no",
  taksit_tutar: "Taksit tutarı",
  kalan_tutar: "Kalan tutar",
  vade_tarihi: "Vade tarihi",
  sozlesme_no: "Sözleşme no",
  gecikme_gunu: "Gecikme günü",
  toplam_gecikmis_tutar: "Toplam gecikmiş tutar",
  taksit_detay_listesi: "Gecikmiş taksit listesi",
  taksit_sayisi: "Gecikmiş taksit sayısı",
  max_gecikme_gunu: "En uzun gecikme (gün)",
  belge_turu: "Belge türü",
  toplam_tahsilat: "Toplam tahsilat",
  toplam_gider: "Toplam gider",
  hafta: "Hafta",
  hafta_no: "Hafta no",
  odev_baslik: "Ödev başlığı",
  teslim_tarihi: "Teslim tarihi",
  pdf_baslik: "PDF başlığı",
  koc_ad: "Koç adı",
  sinav_ad: "Sınav adı",
};

function variableLabel(key: string): string {
  return VARIABLE_LABELS[key] || key.replace(/_/g, " ");
}

function fillBody(body: string, values: Record<string, string>): string {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => values[key] || match);
}

export default function MetaTemplateSendDrawer({
  open,
  conversationId,
  contactType,
  onClose,
  onSent,
}: MetaTemplateSendDrawerProps) {
  const [templates, setTemplates] = useState<WhatsAppMetaTemplateItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !conversationId) return;
    setLoading(true);
    setError(null);
    setSelectedId("");
    fetchConversationTemplates(conversationId)
      .then((res) => {
        const list = res.templates || [];
        setTemplates(list);
        setValues(res.context || {});
        const audience =
          res.preferred_audience
          || ((contactType || "").toUpperCase() === "VELI"
            ? "veli"
            : (contactType || "").toUpperCase() === "OGRENCI"
              ? "ogrenci"
              : null);
        const preferredName = res.preferred_template_name || (
          audience === "veli"
            ? "sohbet_kocluk_veli"
            : audience === "ogrenci"
              ? "sohbet_kocluk_ogrenci"
              : ""
        );
        const suffix = audience === "veli" ? "_veli" : audience === "ogrenci" ? "_ogrenci" : "";
        const preferred =
          (preferredName ? list.find((t) => t.name === preferredName) : null)
          || (audience ? list.find((t) => t.name === `sohbet_genel_${audience}`) : null)
          || (suffix ? list.find((t) => (t.name || "").endsWith(suffix)) : null)
          || null;
        setSelectedId(preferred?.id || list[0]?.id || "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Şablonlar yüklenemedi"))
      .finally(() => setLoading(false));
  }, [open, conversationId, contactType]);

  const selected = useMemo(
    () => templates.find((t) => t.id === selectedId) || null,
    [templates, selectedId],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) => t.name.toLowerCase().includes(q) || (t.body_named || "").toLowerCase().includes(q),
    );
  }, [templates, search]);

  const audienceHint = useMemo(() => {
    const name = selected?.name || "";
    if (name.endsWith("_veli")) return "Veli sohbet şablonu";
    if (name.endsWith("_ogrenci")) return "Öğrenci sohbet şablonu";
    return null;
  }, [selected]);

  const missing = useMemo(() => {
    if (!selected) return [];
    return (selected.variables || []).filter((key) => !(values[key] || "").trim());
  }, [selected, values]);

  const handleSend = useCallback(async () => {
    if (!conversationId || !selected || sending) return;
    setSending(true);
    setError(null);
    try {
      const message = await sendConversationTemplate(conversationId, selected.id, values);
      onSent(message);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Şablon gönderilemedi");
    } finally {
      setSending(false);
    }
  }, [conversationId, selected, values, sending, onSent, onClose]);

  if (!open) return null;

  // Chat drawer içinde açılınca aynı stacking context'te kalıp arkada kaybolmasın diye body'ye portal.
  const node = (
    <div
      className="comm-drawer-overlay comm-drawer-overlay--stacked"
      onClick={onClose}
      role="presentation"
    >
      <aside
        className="comm-drawer comm-drawer-templates-v2 comm-drawer--meta-send"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Onaylı şablon gönder"
      >
        <header className="comm-drawer-header">
          <div>
            <h2>Kişisel Mesaj Şablonları</h2>
            <p className="comm-drawer-subtitle">
              24 saatlik süre dolduğu için yalnızca onaylı şablon gönderilebilir.
              {audienceHint ? ` · ${audienceHint}` : ""}
            </p>
          </div>
          <button type="button" className="comm-drawer-close" onClick={onClose} aria-label="Kapat">
            ×
          </button>
        </header>

        <div className="comm-drawer-filters comm-drawer-filters-v2">
          <input
            type="search"
            className="comm-inbox-search comm-drawer-search"
            placeholder="Şablon ara…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Şablon ara"
          />
        </div>

        {loading && <p className="comm-studio-muted comm-drawer-status">Yükleniyor…</p>}
        {error && <p className="comm-attachment-error comm-drawer-status">{error}</p>}

        <div className="comm-template-card-list">
          {!loading &&
            filtered.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`comm-template-card${t.id === selectedId ? " is-selected" : ""}`}
                onClick={() => setSelectedId(t.id)}
                aria-pressed={t.id === selectedId}
              >
                <div className="comm-template-card-head">
                  <strong>{t.name}</strong>
                  <span className="comm-template-card-badges">
                    <span className="comm-template-item-category">{t.language}</span>
                    {t.meta_category_label && (
                      <span className="comm-template-audience-badge">{t.meta_category_label}</span>
                    )}
                  </span>
                </div>
                <div className="comm-template-card-preview">
                  <WhatsAppPreviewBubble
                    text={fillBody(t.body_named || "", values).slice(0, 280)}
                    className="comm-template-preview-bubble"
                  />
                </div>
              </button>
            ))}
          {!loading && filtered.length === 0 && (
            <p className="comm-studio-muted comm-drawer-empty">
              Bu hesapta sohbet için onaylı şablon yok. Meta Şablonları ekranından
              &quot;Sohbet — kişisel mesaj&quot; kapsamında bir şablon oluşturup onaylatın.
            </p>
          )}
        </div>

        {selected && (selected.variables?.length ?? 0) > 0 && (
          <div className="comm-meta-send-vars">
            <h3>Değişkenler</h3>
            {(selected.variables || []).map((key) => (
              <label key={key} className="comm-meta-send-var">
                <span>{variableLabel(key)}</span>
                <input
                  type="text"
                  value={values[key] || ""}
                  onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                  placeholder={`{{${key}}}`}
                />
              </label>
            ))}
          </div>
        )}

        <footer className="comm-drawer-footer comm-meta-send-footer">
          <Link href="/admin/iletisim/meta-sablonlar" className="comm-btn-secondary" onClick={onClose}>
            Şablonları yönet
          </Link>
          <button
            type="button"
            className="comm-btn-primary"
            onClick={handleSend}
            disabled={!selected || sending || missing.length > 0}
            title={missing.length > 0 ? `Doldurulmamış: ${missing.join(", ")}` : undefined}
          >
            {sending ? "Gönderiliyor…" : "Gönder"}
          </button>
        </footer>
      </aside>
    </div>
  );

  if (typeof document === "undefined") return node;
  return createPortal(node, document.body);
}
