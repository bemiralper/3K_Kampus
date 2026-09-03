"use client";

import { useEffect, useMemo, useState } from "react";

import {
  ConversationSessionInfo,
  WhatsAppMetaTemplateItem,
  fetchConversationTemplates,
  sendConversationTemplate,
} from "@/lib/communication-api";

import { ChatDialog } from "./ChatDialog";
import { IconAlert, IconFile } from "./icons";

interface Props {
  open: boolean;
  conversationId: string | null;
  onClose: () => void;
  onSent: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  UTILITY: "Hizmet",
  MARKETING: "Pazarlama",
  AUTHENTICATION: "Doğrulama",
};

function variableNames(template: WhatsAppMetaTemplateItem): string[] {
  if (template.variables?.length) return template.variables;
  const found = new Set<string>();
  const regex = /\{\{\s*([\w.]+)\s*\}\}/g;
  let match = regex.exec(template.body_named || "");
  while (match) {
    found.add(match[1]);
    match = regex.exec(template.body_named || "");
  }
  return [...found];
}

function renderPreview(body: string, values: Record<string, string>): string {
  return (body || "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => values[key] ?? `{{${key}}}`);
}

/**
 * Meta onaylı şablon seçimi.
 *
 * Değişkenler sunucudan gelen sohbet bağlamıyla önceden doldurulur; kullanıcı
 * göndermeden önce gerçek metni ve varsa medya başlığını görür.
 */
export function ChatTemplateSheet({ open, conversationId, onClose, onSent }: Props) {
  const [templates, setTemplates] = useState<WhatsAppMetaTemplateItem[]>([]);
  const [context, setContext] = useState<Record<string, string>>({});
  const [session, setSession] = useState<ConversationSessionInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !conversationId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelectedId(null);
    setSendError(null);
    fetchConversationTemplates(conversationId)
      .then((data) => {
        if (cancelled) return;
        setTemplates(data.templates || []);
        setContext(data.context || {});
        setSession(data.session || null);
        const preferred =
          data.templates?.find((t) => t.name === data.preferred_template_name) ||
          data.templates?.[0];
        if (preferred) setSelectedId(preferred.id);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Şablonlar yüklenemedi.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, conversationId]);

  const selected = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId],
  );

  // Şablon değişince değişkenleri sohbet bağlamından yeniden doldur.
  useEffect(() => {
    if (!selected) {
      setValues({});
      return;
    }
    const next: Record<string, string> = {};
    variableNames(selected).forEach((name) => {
      next[name] = context[name] ?? "";
    });
    setValues(next);
  }, [selected, context]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("tr");
    if (!needle) return templates;
    return templates.filter(
      (t) =>
        t.name.toLocaleLowerCase("tr").includes(needle) ||
        (t.body_named || "").toLocaleLowerCase("tr").includes(needle),
    );
  }, [templates, search]);

  const preview = selected ? renderPreview(selected.body_named, values) : "";
  const missing = selected
    ? variableNames(selected).filter((name) => !values[name]?.trim())
    : [];

  const submit = async () => {
    if (!conversationId || !selected || missing.length) return;
    setSending(true);
    setSendError(null);
    try {
      await sendConversationTemplate(conversationId, selected.id, values);
      onSent();
      onClose();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Şablon gönderilemedi.");
    } finally {
      setSending(false);
    }
  };

  return (
    <ChatDialog
      open={open}
      title="Meta onaylı şablon gönder"
      description={
        session?.is_open === false
          ? "24 saatlik pencere kapalı olduğu için yalnızca onaylı şablonlar gönderilebilir."
          : "Şablonlar Meta tarafından onaylıdır ve pencere durumundan bağımsız gönderilebilir."
      }
      width={860}
      onClose={onClose}
      footer={
        <>
          <span className="chat-dialog-note">
            {missing.length
              ? `${missing.length} değişken doldurulmalı`
              : selected
                ? `${selected.name} · ${selected.language}`
                : ""}
          </span>
          <button type="button" className="chat-btn chat-btn--ghost" onClick={onClose}>
            Vazgeç
          </button>
          <button
            type="button"
            className="chat-btn chat-btn--primary"
            disabled={!selected || !!missing.length || sending}
            onClick={submit}
          >
            {sending ? "Gönderiliyor…" : "Gönder"}
          </button>
        </>
      }
    >
      {loading ? (
        <p className="chat-info-loading">Şablonlar yükleniyor…</p>
      ) : error ? (
        <p className="chat-composer-error">{error}</p>
      ) : templates.length === 0 ? (
        <div className="chat-empty-block">
          <p className="chat-state-title">Kullanılabilir şablon yok</p>
          <p className="chat-state-text">
            Bu hat için Meta tarafından onaylanmış kişisel sohbet şablonu bulunmuyor.
            İletişim ayarlarından şablon oluşturup Meta onayına gönderebilirsiniz.
          </p>
        </div>
      ) : (
        <div className="chat-template-grid">
          <div className="chat-template-list">
            <input
              type="search"
              className="chat-template-search"
              value={search}
              placeholder="Şablon ara"
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Şablon ara"
            />
            {filtered.map((template) => (
              <button
                key={template.id}
                type="button"
                className={`chat-template-item${template.id === selectedId ? " is-active" : ""}`}
                onClick={() => setSelectedId(template.id)}
              >
                <span className="chat-template-name">{template.name}</span>
                <span className="chat-template-meta">
                  {CATEGORY_LABELS[template.meta_category as string] || template.meta_category} ·{" "}
                  {template.language}
                  {template.header_json?.type && template.header_json.type !== "NONE"
                    ? ` · ${template.header_json.type}`
                    : ""}
                </span>
                <span className="chat-template-body">{template.body_named}</span>
              </button>
            ))}
            {filtered.length === 0 ? (
              <p className="chat-quick-empty">Aramaya uyan şablon yok.</p>
            ) : null}
          </div>

          <div className="chat-template-detail">
            {selected ? (
              <>
                {variableNames(selected).length ? (
                  <div className="chat-template-vars">
                    <p className="chat-filter-label">Değişkenler</p>
                    {variableNames(selected).map((name) => (
                      <label key={name} className="chat-template-var">
                        <span>{name}</span>
                        <input
                          type="text"
                          value={values[name] ?? ""}
                          onChange={(e) =>
                            setValues((prev) => ({ ...prev, [name]: e.target.value }))
                          }
                        />
                      </label>
                    ))}
                  </div>
                ) : null}

                <p className="chat-filter-label">Önizleme</p>
                <div className="chat-template-preview">
                  {selected.header_json?.type && selected.header_json.type !== "NONE" ? (
                    <div className="chat-template-header">
                      {selected.header_json.type === "TEXT" ? (
                        <strong>{selected.header_json.text}</strong>
                      ) : (
                        <span className="chat-template-media">
                          <IconFile size={16} />
                          {selected.header_json.type === "IMAGE"
                            ? "Görsel başlık"
                            : selected.header_json.type === "DOCUMENT"
                              ? "PDF / doküman başlık"
                              : "Medya başlık"}
                        </span>
                      )}
                    </div>
                  ) : null}
                  <p className="chat-template-preview-body">{preview}</p>
                  {selected.footer_text ? (
                    <p className="chat-template-footer">{selected.footer_text}</p>
                  ) : null}
                  {selected.buttons_json?.length ? (
                    <div className="chat-template-buttons">
                      {selected.buttons_json.map((btn, i) => (
                        <span key={i}>{btn.text || btn.url || btn.phone_number}</span>
                      ))}
                    </div>
                  ) : null}
                </div>

                {missing.length ? (
                  <p className="chat-composer-error">
                    <IconAlert size={14} /> Doldurulmayan değişken: {missing.join(", ")}
                  </p>
                ) : null}
                {sendError ? <p className="chat-composer-error">{sendError}</p> : null}
              </>
            ) : (
              <p className="chat-info-loading">Soldan bir şablon seçin.</p>
            )}
          </div>
        </div>
      )}
    </ChatDialog>
  );
}
