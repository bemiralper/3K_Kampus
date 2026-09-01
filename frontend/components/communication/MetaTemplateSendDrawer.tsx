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
import { trIncludes } from "@/lib/text-format";

interface MetaTemplateSendDrawerProps {
  open: boolean;
  conversationId: string | null;
  contactType?: string | null;
  /** Admin meta-şablon yönetim linki; koç portalında kapalı. */
  showManageLink?: boolean;
  onClose: () => void;
  onSent: (message: MessageItem) => void;
}

function fillBody(body: string, values: Record<string, string>): string {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => values[key] || match);
}

export default function MetaTemplateSendDrawer({
  open,
  conversationId,
  contactType,
  showManageLink = false,
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
        // UI niyeti (öğrenci/veli ikonu) API’den önce gelsin — yanlış contact_type’a karşı.
        const fromProp =
          (contactType || "").toUpperCase() === "VELI"
            ? "veli"
            : (contactType || "").toUpperCase() === "OGRENCI"
              ? "ogrenci"
              : null;
        const audience = fromProp || res.preferred_audience || null;
        const preferredName =
          (fromProp
            ? (fromProp === "veli" ? "sohbet_kocluk_veli" : "sohbet_kocluk_ogrenci")
            : null)
          || res.preferred_template_name
          || (audience === "veli"
            ? "sohbet_kocluk_veli"
            : audience === "ogrenci"
              ? "sohbet_kocluk_ogrenci"
              : "");
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
    const q = search.trim();
    if (!q) return templates;
    return templates.filter(
      (t) => trIncludes(t.name, q) || trIncludes(t.body_named, q),
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

        <footer className="comm-drawer-footer comm-meta-send-footer">
          {showManageLink ? (
            <Link href="/admin/iletisim/meta-sablonlar" className="comm-btn-secondary" onClick={onClose}>
              Şablonları yönet
            </Link>
          ) : (
            <span />
          )}
          <button
            type="button"
            className="comm-btn-primary"
            onClick={handleSend}
            disabled={!selected || sending || missing.length > 0}
            title={missing.length > 0 ? `Eksik bilgi: ${missing.join(", ")}` : undefined}
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
