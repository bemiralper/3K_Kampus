"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import MessageComposer from "./MessageComposer";
import TemplateVariablePanel from "./TemplateVariablePanel";
import { useTextareaInsert } from "./useTextareaInsert";
import {
  createComposerState,
  plainTextFromComposer,
  ComposerState,
  parseWhatsAppText,
  resolvePreviewVariables,
} from "./composer-utils";
import {
  accountLabel,
  fetchLocalMetaTemplates,
  fetchWhatsAppAccounts,
  MessageTemplateItem,
  TEMPLATE_AUDIENCE_LABELS,
  TemplateCategoryItem,
  WhatsAppAccount,
  WhatsAppMetaTemplateItem,
} from "@/lib/communication-api";

export interface TemplateEditorForm {
  name: string;
  body: string;
  /** Uygulama şablonu: Yok | Metin (Meta ile aynı) */
  header_type?: "NONE" | "TEXT";
  header_text?: string;
  footer_text?: string;
  category: string;
  audience_scope: string;
  odev_pdf_role?: string;
  /** Meta karşılığı — 24 saatlik pencere kapalıyken bu şablon kullanılır */
  meta_template_id?: string;
  /** Yeni kayıtta aynı metinli Meta taslağı da oluştur */
  also_create_meta_template?: boolean;
  meta_channel_config_id?: string;
  meta_template_name?: string;
}

export const ODEV_PDF_ROLE_OPTIONS = [
  { value: "", label: "Otomasyon kullanmaz" },
  { value: "plan_veli", label: "Ödev planı PDF — Veli WhatsApp (aktif)" },
  { value: "plan_ogrenci", label: "Ödev planı PDF — Öğrenci WhatsApp (aktif)" },
  { value: "report_veli", label: "Ödev kontrol raporu PDF — Veli WhatsApp (aktif)" },
  { value: "report_ogrenci", label: "Ödev kontrol raporu PDF — Öğrenci WhatsApp (aktif)" },
] as const;

/** Meta şablon adı önerisi (küçük_harf_altçizgi). */
export function suggestMetaTemplateName(value: string): string {
  const tr: Record<string, string> = {
    ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u",
    Ç: "c", Ğ: "g", İ: "i", I: "i", Ö: "o", Ş: "s", Ü: "u",
  };
  let text = (value || "").replace(/[çğışöüÇĞİIÖŞÜ]/g, (ch) => tr[ch] || ch);
  text = text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  text = text.toLowerCase().replace(/[\s-]+/g, "_").replace(/[^a-z0-9_]+/g, "");
  text = text.replace(/_+/g, "_").replace(/^_|_$/g, "");
  return text.slice(0, 512);
}

interface TemplateEditorPanelProps {
  editing: MessageTemplateItem | null;
  form: TemplateEditorForm;
  categories: TemplateCategoryItem[];
  saving: boolean;
  onChange: (form: TemplateEditorForm) => void;
  onComposerChange: (state: ComposerState) => void;
  composerState: ComposerState;
  onSubmit: (e: FormEvent) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export default function TemplateEditorPanel({
  editing,
  form,
  categories,
  saving,
  onChange,
  onComposerChange,
  composerState,
  onSubmit,
  onCancel,
  onDelete,
}: TemplateEditorPanelProps) {
  const activeCategories = useMemo(
    () => categories.filter((c) => c.is_active),
    [categories],
  );

  const [metaTemplates, setMetaTemplates] = useState<WhatsAppMetaTemplateItem[]>([]);
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [metaNameTouched, setMetaNameTouched] = useState(false);
  const metaFetchSeq = useRef(0);

  useEffect(() => {
    fetchWhatsAppAccounts({ activeOnly: true })
      .then((res) => setAccounts(res.accounts || []))
      .catch(() => setAccounts([]));
  }, []);

  // Meta karşılığı listesi — şablon adına göre dinamik arama
  useEffect(() => {
    const q = form.name.trim();
    const seq = ++metaFetchSeq.current;
    const timer = window.setTimeout(() => {
      fetchLocalMetaTemplates({
        approved_only: true,
        search: q || undefined,
      })
        .then((res) => {
          if (seq !== metaFetchSeq.current) return;
          setMetaTemplates(res.templates || []);
        })
        .catch(() => {
          if (seq !== metaFetchSeq.current) return;
          setMetaTemplates([]);
        });
    }, 280);
    return () => window.clearTimeout(timer);
  }, [form.name]);

  // "Aynı metinle Meta taslağı" açıksa adı şablon adından öner
  useEffect(() => {
    if (editing || !form.also_create_meta_template || metaNameTouched) return;
    const suggested = suggestMetaTemplateName(form.name);
    if (suggested !== (form.meta_template_name || "")) {
      onChange({ ...form, meta_template_name: suggested });
    }
    // form/onChange bilinçli dışarıda — yalnızca name / checkbox
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.name, form.also_create_meta_template, metaNameTouched, editing]);

  const filteredMetaTemplates = useMemo(() => {
    const q = form.name.trim().toLowerCase();
    if (!q) return metaTemplates;
    const slug = suggestMetaTemplateName(form.name);
    return metaTemplates.filter((t) => {
      const n = (t.name || "").toLowerCase();
      const body = (t.body_named || "").toLowerCase();
      return (
        n.includes(q)
        || n.includes(slug)
        || slug.includes(n)
        || body.includes(q)
      );
    });
  }, [metaTemplates, form.name]);

  const { setNode, insert } = useTextareaInsert();
  const rawText = plainTextFromComposer(composerState) || form.body;
  const previewText = resolvePreviewVariables(rawText);
  const previewSegments = useMemo(() => parseWhatsAppText(previewText), [previewText]);
  const headerPreview = form.header_type === "TEXT"
    ? resolvePreviewVariables((form.header_text || "").trim())
    : "";
  const footerPreview = (form.footer_text || "").trim();
  const usedVariables = useMemo(() => {
    const blob = `${rawText} ${form.header_text || ""}`;
    const found = blob.match(/\{\{(\w+)\}\}/g) || [];
    return Array.from(new Set(found));
  }, [rawText, form.header_text]);

  const insertVariable = (token: string) => {
    const current = plainTextFromComposer(composerState);
    onComposerChange({ ...composerState, text: insert(current, token) });
  };

  const showOdevRole = form.category === "haftalik_odev";
  const now = new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

  return (
    <form onSubmit={onSubmit} className="tplx-drawer-form">
      <div className="tplx-drawer-head">
        <div>
          <h2 id="sablon-drawer-title">{editing ? "Şablon Düzenle" : "Yeni Şablon"}</h2>
          <p>
            {editing
              ? "Değişiklikler kaydedildiği anda tüm gönderimlerde geçerli olur."
              : "Değişkenli hazır mesaj oluşturun; gönderimde otomatik doldurulur."}
          </p>
        </div>
        <div className="tplx-drawer-head-actions">
          {editing && onDelete && (
            <button
              type="button"
              className="tplx-mini-btn is-danger"
              onClick={onDelete}
            >
              Sil
            </button>
          )}
          <button
            type="button"
            className="tplx-icon-btn"
            onClick={onCancel}
            aria-label="Kapat"
          >
            ×
          </button>
        </div>
      </div>

      <div className="tplx-drawer-body">
        <div className="tplx-drawer-main">
          {editing?.is_system_active && editing.system_usages?.length ? (
            <div className="tplx-note is-success">
              <span className="tplx-note-icon" aria-hidden="true">⚡</span>
              <div>
                <strong>Aktif sistem şablonu</strong>
                <ul>
                  {editing.system_usages.map((u) => (
                    <li key={`${u.module}-${u.role}`}>{u.label}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          <section className="tplx-section">
            <div className="tplx-section-head">
              <span aria-hidden="true">🏷</span> Tanım
            </div>
            <div className="tplx-section-body">
              <div className="tplx-field">
                <label htmlFor="tpl-name">Şablon adı</label>
                <input
                  id="tpl-name"
                  required
                  placeholder="Örn. Taksit hatırlatma"
                  value={form.name}
                  onChange={(e) => onChange({ ...form, name: e.target.value })}
                />
              </div>

              <div className="tplx-row">
                <div className="tplx-field">
                  <label htmlFor="tpl-audience">Hedef kitle</label>
                  <select
                    id="tpl-audience"
                    value={form.audience_scope}
                    onChange={(e) => onChange({ ...form, audience_scope: e.target.value })}
                  >
                    {Object.entries(TEMPLATE_AUDIENCE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div className="tplx-field">
                  <label htmlFor="tpl-cat">Kategori</label>
                  <select
                    id="tpl-cat"
                    value={form.category}
                    onChange={(e) => onChange({ ...form, category: e.target.value, odev_pdf_role: "" })}
                  >
                    {activeCategories.map((c) => (
                      <option key={c.slug} value={c.slug}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {showOdevRole && (
                <div className="tplx-field">
                  <label htmlFor="tpl-odev-role">Ödev WhatsApp gönderim rolü</label>
                  <select
                    id="tpl-odev-role"
                    value={form.odev_pdf_role || editing?.odev_pdf_role || ""}
                    onChange={(e) => onChange({ ...form, odev_pdf_role: e.target.value })}
                  >
                    {ODEV_PDF_ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value || "none"} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <p className="tplx-field-hint">
                    Seçerseniz kayıt sonrası bu şablon ilgili ödev PDF gönderiminde aktif olur.
                  </p>
                </div>
              )}

              <div className="tplx-field">
                <label htmlFor="tpl-meta">Meta karşılığı (mevcut)</label>
                <select
                  id="tpl-meta"
                  value={form.meta_template_id ?? editing?.meta_template ?? ""}
                  disabled={!editing && !!form.also_create_meta_template}
                  onChange={(e) => onChange({
                    ...form,
                    meta_template_id: e.target.value,
                    also_create_meta_template: e.target.value
                      ? false
                      : form.also_create_meta_template,
                  })}
                >
                  <option value="">— Yok —</option>
                  {filteredMetaTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.language})
                    </option>
                  ))}
                </select>
                <p className="tplx-field-hint">
                  Liste şablon adına göre güncellenir. 24 saatlik pencere kapalıysa bu onaylı
                  Meta şablonu kullanılır; açıksa uygulama şablonunun metni serbest mesaj olarak gider.
                </p>
              </div>

              {!editing && (
                <div className="tplx-field">
                  <label className="tplx-check-row">
                    <input
                      type="checkbox"
                      checked={!!form.also_create_meta_template}
                      disabled={!!form.meta_template_id}
                      onChange={(e) => {
                        setMetaNameTouched(false);
                        onChange({
                          ...form,
                          also_create_meta_template: e.target.checked,
                          meta_template_id: e.target.checked ? "" : form.meta_template_id,
                          meta_channel_config_id:
                            form.meta_channel_config_id
                            || accounts.find((a) => a.is_default)?.id
                            || accounts[0]?.id
                            || "",
                          meta_template_name: e.target.checked
                            ? suggestMetaTemplateName(form.name)
                            : form.meta_template_name,
                        });
                      }}
                    />
                    <span>Aynı metinle Meta taslağı da oluştur</span>
                  </label>
                  <p className="tplx-field-hint">
                    Pencere kapalıyken Meta, açıkken uygulama şablonu kullanılır. Meta onayına
                    ayrıca gönderim gerekir.
                  </p>
                  {form.also_create_meta_template && (
                    <div className="tplx-row" style={{ marginTop: "0.55rem" }}>
                      <div className="tplx-field">
                        <label htmlFor="tpl-meta-account">WhatsApp hesabı</label>
                        <select
                          id="tpl-meta-account"
                          required
                          value={form.meta_channel_config_id || ""}
                          onChange={(e) => onChange({
                            ...form,
                            meta_channel_config_id: e.target.value,
                          })}
                        >
                          <option value="">Seçin…</option>
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>{accountLabel(a)}</option>
                          ))}
                        </select>
                      </div>
                      <div className="tplx-field">
                        <label htmlFor="tpl-meta-name">Meta şablon adı</label>
                        <input
                          id="tpl-meta-name"
                          placeholder="otomatik (küçük_harf)"
                          value={form.meta_template_name || ""}
                          onChange={(e) => {
                            setMetaNameTouched(true);
                            onChange({
                              ...form,
                              meta_template_name: e.target.value,
                            });
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          <section className="tplx-section">
            <div className="tplx-section-head">
              <span aria-hidden="true">✍️</span> Mesaj içeriği
            </div>
            <div className="tplx-section-body">
              <MessageComposer
                id="tpl-body"
                value={composerState}
                onChange={onComposerChange}
                showPreview={false}
                placeholder="Merhaba {{veli_ad}}, …"
                onTextareaMount={setNode}
              />
              <TemplateVariablePanel category={form.category} onInsert={insertVariable} />
            </div>
          </section>

          <section className="tplx-section">
            <div className="tplx-section-head">
              <span aria-hidden="true">🧩</span> Başlık &amp; alt bilgi
            </div>
            <div className="tplx-section-body">
              <div className="tplx-row">
                <div className="tplx-field">
                  <label htmlFor="tpl-header-type">Başlık türü</label>
                  <select
                    id="tpl-header-type"
                    value={form.header_type || "NONE"}
                    onChange={(e) => onChange({
                      ...form,
                      header_type: e.target.value as "NONE" | "TEXT",
                    })}
                  >
                    <option value="NONE">Yok</option>
                    <option value="TEXT">Metin</option>
                  </select>
                </div>
                {form.header_type === "TEXT" && (
                  <div className="tplx-field">
                    <label htmlFor="tpl-header-text">Başlık metni</label>
                    <input
                      id="tpl-header-text"
                      maxLength={60}
                      value={form.header_text || ""}
                      placeholder="Örn. Ödeme hatırlatması"
                      onChange={(e) => onChange({ ...form, header_text: e.target.value })}
                    />
                    <p className="tplx-field-hint">
                      Yeni satır, emoji, yıldız (*) ve biçimlendirme (* _ ~ `) kullanılamaz.
                      {(form.header_text || "").length}/60
                    </p>
                  </div>
                )}
              </div>

              <div className="tplx-field">
                <label htmlFor="tpl-footer">Alt bilgi (isteğe bağlı)</label>
                <input
                  id="tpl-footer"
                  maxLength={60}
                  value={form.footer_text || ""}
                  placeholder="Örn. 3K Kampüs — Bilgilendirme mesajı"
                  onChange={(e) => onChange({ ...form, footer_text: e.target.value })}
                />
                <p className="tplx-field-hint">{(form.footer_text || "").length}/60 karakter</p>
              </div>
            </div>
          </section>
        </div>

        <aside className="tplx-drawer-side">
          <div className="tplx-preview-title">
            <span>Canlı önizleme</span>
            <span>{rawText.length} karakter</span>
          </div>

          <div className="tplx-preview-stack">
            <div className="tplx-bubble">
              {headerPreview ? (
                <p className="tplx-bubble-header">{headerPreview}</p>
              ) : null}
              <p className="tplx-bubble-text">
                {previewText.trim()
                  ? previewSegments.map((seg, i) =>
                      seg.type === "bold" ? (
                        <strong key={i}>{seg.content}</strong>
                      ) : seg.type === "italic" ? (
                        <em key={i}>{seg.content}</em>
                      ) : seg.type === "strike" ? (
                        <s key={i}>{seg.content}</s>
                      ) : seg.type === "mono" ? (
                        <code key={i}>{seg.content}</code>
                      ) : seg.type === "variable" ? (
                        <span key={i} className="wa-var">{seg.content}</span>
                      ) : (
                        <span key={i}>{seg.content}</span>
                      ),
                    )
                  : "Mesajınız burada görünecek…"}
              </p>
              {footerPreview ? (
                <p className="tplx-bubble-footer">{footerPreview}</p>
              ) : null}
              <div className="tplx-bubble-meta">
                <span>{now}</span>
                <span aria-hidden="true">✓✓</span>
              </div>
            </div>
          </div>

          <div>
            <div className="tplx-preview-title" style={{ marginBottom: "0.4rem" }}>
              <span>Kullanılan değişkenler</span>
              <span>{usedVariables.length}</span>
            </div>
            {usedVariables.length ? (
              <div className="tplx-map-list">
                {usedVariables.map((v) => (
                  <span key={v} className="tplx-map-pill">
                    <b>{v}</b>
                  </span>
                ))}
              </div>
            ) : (
              <p className="tplx-field-hint" style={{ margin: 0 }}>
                Henüz değişken eklenmedi. Soldaki listeden tıklayarak ekleyebilirsiniz.
              </p>
            )}
          </div>

          <div className="tplx-note is-info">
            <span className="tplx-note-icon" aria-hidden="true">💡</span>
            <div>
              <strong>Biçimlendirme</strong>
              <p>*kalın* · _italik_ · ~üstü çizili~ — WhatsApp bu işaretleri otomatik uygular.</p>
            </div>
          </div>
        </aside>
      </div>

      <div className="tplx-drawer-foot">
        <div className="tplx-foot-left">
          <span className="tplx-field-hint">
            Önizlemede örnek veriler kullanılır; gönderimde gerçek kayıtlar dolar.
          </span>
        </div>
        <button type="button" className="comm-btn-secondary" onClick={onCancel}>
          İptal
        </button>
        <button type="submit" className="comm-btn-primary" disabled={saving}>
          {saving ? "Kaydediliyor…" : editing ? "Değişiklikleri kaydet" : "Şablonu oluştur"}
        </button>
      </div>
    </form>
  );
}

export function templateFormToComposer(body: string): ComposerState {
  return createComposerState(body);
}

export function composerToTemplateForm(
  form: TemplateEditorForm,
  composerState: ComposerState,
): TemplateEditorForm {
  return { ...form, body: plainTextFromComposer(composerState) };
}
