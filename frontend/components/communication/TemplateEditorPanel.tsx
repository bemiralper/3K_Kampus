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
import { trIncludes, trFold } from "@/lib/text-format";
import { useLivePreviewContext } from "./useLivePreviewContext";
import {
  accountLabel,
  fetchLocalMetaTemplates,
  fetchWhatsAppAccounts,
  MessageTemplateItem,
  NotificationEventCatalog,
  TEMPLATE_AUDIENCE_LABELS,
  TemplateCategoryItem,
  WhatsAppAccount,
  WhatsAppMetaTemplateItem,
} from "@/lib/communication-api";
import NotificationEventPicker from "./NotificationEventPicker";
import type { EventSlotSelection } from "./notification-event-utils";
import { catalogTemplateGroups, RECIPIENT_LABELS } from "./notification-event-utils";

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
  template_group?: string;
  bind_event_key?: string;
  bind_recipient?: string;
  bind_on_save?: boolean;
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
  audienceOptions?: [string, string][];
  eventCatalog?: NotificationEventCatalog | null;
  /** Tek kolonlu ekranlarda form / önizleme sekmesi */
  pane?: "edit" | "preview";
  onPaneChange?: (pane: "edit" | "preview") => void;
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
  audienceOptions,
  eventCatalog,
  pane = "edit",
  onPaneChange,
}: TemplateEditorPanelProps) {
  const audienceChoices = audienceOptions ?? Object.entries(TEMPLATE_AUDIENCE_LABELS);
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
    const q = form.name.trim();
    if (!q) return metaTemplates;
    const slug = suggestMetaTemplateName(form.name);
    return metaTemplates.filter((t) => {
      const n = t.name || "";
      const body = t.body_named || "";
      return (
        trIncludes(n, q)
        || trIncludes(n, slug)
        || trFold(slug).includes(trFold(n))
        || trIncludes(body, q)
      );
    });
  }, [metaTemplates, form.name]);

  const { setNode, insert } = useTextareaInsert();
  const livePreviewContext = useLivePreviewContext();
  const rawText = plainTextFromComposer(composerState) || form.body;
  const previewText = resolvePreviewVariables(rawText, livePreviewContext);
  const previewSegments = useMemo(() => parseWhatsAppText(previewText), [previewText]);
  const headerPreview = form.header_type === "TEXT"
    ? resolvePreviewVariables((form.header_text || "").trim(), livePreviewContext)
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

  const currentMetaId = form.meta_template_id ?? editing?.meta_template ?? "";
  // Bağlı Meta şablonu ada göre aramada dönmezse seçim boş görünmesin
  const showBoundMetaOption = !!currentMetaId
    && !filteredMetaTemplates.some((t) => t.id === currentMetaId);

  const showOdevRole = form.category === "haftalik_odev";
  const templateGroups = useMemo(() => catalogTemplateGroups(eventCatalog), [eventCatalog]);
  const selectedEvent = eventCatalog?.events.find((e) => e.key === form.bind_event_key) || null;

  const applyEvent = (selection: EventSlotSelection | null) => {
    if (!selection) {
      onChange({
        ...form,
        bind_event_key: "",
        bind_recipient: "",
        bind_on_save: false,
        template_group: "",
      });
      return;
    }
    const role = RECIPIENT_LABELS[selection.slot.recipient_type] || selection.slot.recipient_type;
    const nextBody = form.body || selection.slot.default_body || selection.slot.meta_example_body || "";
    onChange({
      ...form,
      bind_event_key: selection.event.key,
      bind_recipient: selection.slot.recipient_type,
      bind_on_save: true,
      template_group: selection.groupKey,
      name: form.name || `${selection.event.label} — ${role}`,
      body: nextBody,
      meta_template_name: selection.slot.suggested_meta_name || form.meta_template_name,
    });
    if (!form.body && nextBody) {
      onComposerChange(createComposerState(nextBody));
    }
  };
  const now = new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

  return (
    <form onSubmit={onSubmit} className="sbx-sheet-form">
      <header className="sbx-sheet-head">
        <div className="sbx-sheet-head-text">
          <span className="sbx-sheet-eyebrow">LMS şablonu</span>
          <h2 id="sablon-drawer-title">{editing ? editing.name : "Yeni Şablon"}</h2>
          <p>
            {editing
              ? "Değişiklikler kaydedildiği anda tüm gönderimlerde geçerli olur."
              : "Değişkenli hazır mesaj oluşturun; gönderimde otomatik doldurulur."}
          </p>
        </div>
        <div className="sbx-sheet-head-side">
          {editing?.is_system_active && (
            <span className="sbx-badge is-live">
              <span className="sbx-dot" aria-hidden="true" />
              Aktif
            </span>
          )}
          <button type="button" className="sbx-iconbtn" onClick={onCancel} aria-label="Kapat">
            ×
          </button>
        </div>
      </header>

      <div className="sbx-sheet-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={pane === "edit"}
          className={pane === "edit" ? "is-active" : ""}
          onClick={() => onPaneChange?.("edit")}
        >
          Düzenle
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={pane === "preview"}
          className={pane === "preview" ? "is-active" : ""}
          onClick={() => onPaneChange?.("preview")}
        >
          Önizleme
        </button>
      </div>

      <div className="sbx-sheet-body">
        <div className="sbx-sheet-main">
          {editing?.is_system_active && editing.system_usages?.length ? (
            <div className="sbx-note is-success">
              <span aria-hidden="true">⚡</span>
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

          <section className="sbx-block">
            <div className="sbx-block-head">
              <span aria-hidden="true">🏷</span> Tanım
            </div>
            <div className="sbx-block-body">
              <div className="sbx-field">
                <label className="sbx-label" htmlFor="tpl-name">Şablon adı</label>
                <input
                  id="tpl-name"
                  className="sbx-input"
                  required
                  placeholder="Örn. Taksit hatırlatma"
                  value={form.name}
                  onChange={(e) => onChange({ ...form, name: e.target.value })}
                />
              </div>

              {!editing && (
                <>
                  <NotificationEventPicker
                    catalog={eventCatalog}
                    eventKey={form.bind_event_key}
                    recipient={form.bind_recipient}
                    onSelect={applyEvent}
                  />
                  {form.bind_event_key && (
                    <label className="sbx-check">
                      <input
                        type="checkbox"
                        checked={!!form.bind_on_save}
                        onChange={(e) => onChange({ ...form, bind_on_save: e.target.checked })}
                      />
                      <span>
                        Kaydedince bildirim olayına bağla
                        <small>{form.bind_event_key}</small>
                      </span>
                    </label>
                  )}
                </>
              )}

              <div className="sbx-field">
                <label className="sbx-label" htmlFor="tpl-group">Şablon grubu</label>
                <select
                  id="tpl-group"
                  className="sbx-select"
                  value={form.template_group || ""}
                  onChange={(e) => onChange({ ...form, template_group: e.target.value })}
                >
                  <option value="">Genel</option>
                  {templateGroups.map((group) => (
                    <option key={group.key} value={group.key}>{group.label}</option>
                  ))}
                </select>
                <p className="sbx-hint">
                  Bildirim sayfasındaki grup. Olay seçilince otomatik dolar.
                </p>
              </div>

              <div className="sbx-row">
                <div className="sbx-field">
                  <label className="sbx-label" htmlFor="tpl-audience">Hedef kitle</label>
                  <select
                    id="tpl-audience"
                    className="sbx-select"
                    value={form.audience_scope}
                    onChange={(e) => onChange({ ...form, audience_scope: e.target.value })}
                  >
                    {audienceChoices.map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div className="sbx-field">
                  <label className="sbx-label" htmlFor="tpl-cat">Kategori</label>
                  <select
                    id="tpl-cat"
                    className="sbx-select"
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
                <div className="sbx-field">
                  <label className="sbx-label" htmlFor="tpl-odev-role">
                    Ödev WhatsApp gönderim rolü
                  </label>
                  <select
                    id="tpl-odev-role"
                    className="sbx-select"
                    value={form.odev_pdf_role || editing?.odev_pdf_role || ""}
                    onChange={(e) => onChange({ ...form, odev_pdf_role: e.target.value })}
                  >
                    {ODEV_PDF_ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value || "none"} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <p className="sbx-hint">
                    Seçerseniz kayıt sonrası bu şablon ilgili ödev PDF gönderiminde aktif olur.
                  </p>
                </div>
              )}
            </div>
          </section>

          <section className="sbx-block">
            <div className="sbx-block-head">
              <span aria-hidden="true">✍️</span> Mesaj içeriği
            </div>
            <div className="sbx-block-body">
              <MessageComposer
                id="tpl-body"
                value={composerState}
                onChange={onComposerChange}
                showPreview={false}
                placeholder="Merhaba {{veli_ad}}, …"
                onTextareaMount={setNode}
              />
              <TemplateVariablePanel
                category={form.category}
                allowedKeys={selectedEvent?.variables}
                onInsert={insertVariable}
              />
            </div>
          </section>

          <section className="sbx-block">
            <div className="sbx-block-head">
              <span aria-hidden="true">🧩</span> Başlık &amp; alt bilgi
            </div>
            <div className="sbx-block-body">
              <div className="sbx-row">
                <div className="sbx-field">
                  <label className="sbx-label" htmlFor="tpl-header-type">Başlık türü</label>
                  <select
                    id="tpl-header-type"
                    className="sbx-select"
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
                  <div className="sbx-field">
                    <label className="sbx-label" htmlFor="tpl-header-text">Başlık metni</label>
                    <input
                      id="tpl-header-text"
                      className="sbx-input"
                      maxLength={60}
                      value={form.header_text || ""}
                      placeholder="Örn. Ödeme hatırlatması"
                      onChange={(e) => onChange({ ...form, header_text: e.target.value })}
                    />
                    <p className="sbx-hint">
                      Yeni satır, emoji, yıldız (*) ve biçimlendirme (* _ ~ `) kullanılamaz.{" "}
                      {(form.header_text || "").length}/60
                    </p>
                  </div>
                )}
              </div>

              <div className="sbx-field">
                <label className="sbx-label" htmlFor="tpl-footer">Alt bilgi (isteğe bağlı)</label>
                <input
                  id="tpl-footer"
                  className="sbx-input"
                  maxLength={60}
                  value={form.footer_text || ""}
                  placeholder="Örn. 3K Kampüs — Bilgilendirme mesajı"
                  onChange={(e) => onChange({ ...form, footer_text: e.target.value })}
                />
                <p className="sbx-hint">{(form.footer_text || "").length}/60 karakter</p>
              </div>
            </div>
          </section>

          <section className="sbx-block">
            <div className="sbx-block-head">
              <span aria-hidden="true">🟢</span> Meta eşleşmesi
            </div>
            <div className="sbx-block-body">
              <div className="sbx-field">
                <label className="sbx-label" htmlFor="tpl-meta">Meta karşılığı (mevcut)</label>
                <select
                  id="tpl-meta"
                  className="sbx-select"
                  value={currentMetaId}
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
                  {showBoundMetaOption && (
                    <option value={currentMetaId}>
                      {editing?.meta_template_name || "Bağlı Meta şablonu"} (bağlı)
                    </option>
                  )}
                  {filteredMetaTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.language})
                    </option>
                  ))}
                </select>
                <p className="sbx-hint">
                  Liste şablon adına göre güncellenir. 24 saatlik pencere kapalıysa bu onaylı Meta
                  şablonu kullanılır; açıksa uygulama şablonunun metni serbest mesaj olarak gider.
                </p>
              </div>

              {!editing && (
                <>
                  <label className="sbx-check">
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
                    <span>
                      Aynı metinle Meta taslağı da oluştur
                      <small>
                        Pencere kapalıyken Meta, açıkken uygulama şablonu kullanılır. Meta onayına
                        ayrıca gönderim gerekir.
                      </small>
                    </span>
                  </label>

                  {form.also_create_meta_template && (
                    <div className="sbx-row">
                      <div className="sbx-field">
                        <label className="sbx-label" htmlFor="tpl-meta-account">
                          WhatsApp hesabı
                        </label>
                        <select
                          id="tpl-meta-account"
                          className="sbx-select"
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
                      <div className="sbx-field">
                        <label className="sbx-label" htmlFor="tpl-meta-name">Meta şablon adı</label>
                        <input
                          id="tpl-meta-name"
                          className="sbx-input"
                          placeholder="otomatik (küçük_harf)"
                          value={form.meta_template_name || ""}
                          onChange={(e) => {
                            setMetaNameTouched(true);
                            onChange({ ...form, meta_template_name: e.target.value });
                          }}
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>

          {editing && onDelete && (
            <section className="sbx-block">
              <div className="sbx-block-head">
                <span aria-hidden="true">🛠</span> Şablon işlemleri
              </div>
              <div className="sbx-block-body">
                <div className="sbx-btnbar">
                  <button type="button" className="sbx-btn is-sm is-danger" onClick={onDelete}>
                    Şablonu sil
                  </button>
                </div>
                <p className="sbx-hint">
                  Sistemde kullanılan bir şablonu silerseniz ilgili bildirime otomatik olarak başka
                  bir şablon atanır.
                </p>
              </div>
            </section>
          )}
        </div>

        <aside className="sbx-sheet-side">
          <div className="sbx-preview">
            <div className="sbx-preview-head">
              <span>Canlı önizleme</span>
              <span>{rawText.length} karakter</span>
            </div>
            <div className="sbx-preview-canvas">
              <div className="sbx-bubble">
                {headerPreview ? <p className="sbx-bubble-header">{headerPreview}</p> : null}
                <p className="sbx-bubble-text">
                  {previewText.trim()
                    ? previewSegments.map((seg, i) =>
                        seg.type === "bold" ? (
                          <strong key={i}>{seg.content}</strong>
                        ) : seg.type === "italic" ? (
                          <em key={i}>{seg.content}</em>
                        ) : seg.type === "strike" ? (
                          <s key={i}>{seg.content}</s>
                        ) : seg.type === "mono" || seg.type === "code" ? (
                          <code key={i}>{seg.content}</code>
                        ) : seg.type === "variable" ? (
                          <span key={i} className="wa-var">{seg.content}</span>
                        ) : (
                          <span key={i}>{seg.content}</span>
                        ),
                      )
                    : "Mesajınız burada görünecek…"}
                </p>
                {footerPreview ? <p className="sbx-bubble-footer">{footerPreview}</p> : null}
                <div className="sbx-bubble-meta">
                  <span>{now}</span>
                  <span aria-hidden="true">✓✓</span>
                </div>
              </div>
            </div>
            <p className="sbx-hint">
              Kurum / şube adı canlı alınır; diğer alanlar örnek veridir.
            </p>
          </div>

          <div className="sbx-preview">
            <div className="sbx-preview-head">
              <span>Kullanılan değişkenler</span>
              <span>{usedVariables.length}</span>
            </div>
            {usedVariables.length ? (
              <div className="sbx-varlist">
                {usedVariables.map((v) => (
                  <span key={v} className="sbx-varpill">{v}</span>
                ))}
              </div>
            ) : (
              <p className="sbx-hint">
                Henüz değişken eklenmedi. “Mesaj içeriği” altındaki listeden ekleyebilirsiniz.
              </p>
            )}
          </div>

          <div className="sbx-note is-info">
            <span aria-hidden="true">💡</span>
            <div>
              <strong>Biçimlendirme</strong>
              <p>*kalın* · _italik_ · ~üstü çizili~ — WhatsApp bu işaretleri otomatik uygular.</p>
            </div>
          </div>
        </aside>
      </div>

      <footer className="sbx-sheet-foot">
        <button type="button" className="sbx-btn" onClick={onCancel}>
          İptal
        </button>
        <span className="sbx-foot-spacer" />
        <button type="submit" className="sbx-btn is-primary" disabled={saving}>
          {saving ? "Kaydediliyor…" : editing ? "Değişiklikleri kaydet" : "Şablonu oluştur"}
        </button>
      </footer>
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
