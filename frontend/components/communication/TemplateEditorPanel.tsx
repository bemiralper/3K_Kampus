"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
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
  fetchLocalMetaTemplates,
  MessageTemplateItem,
  TEMPLATE_AUDIENCE_LABELS,
  TemplateCategoryItem,
  WhatsAppMetaTemplateItem,
} from "@/lib/communication-api";

export interface TemplateEditorForm {
  name: string;
  body: string;
  category: string;
  audience_scope: string;
  odev_pdf_role?: string;
  /** Meta karşılığı — 24 saatlik pencere kapalıyken bu şablon kullanılır */
  meta_template_id?: string;
}

export const ODEV_PDF_ROLE_OPTIONS = [
  { value: "", label: "Otomasyon kullanmaz" },
  { value: "plan_veli", label: "Ödev planı PDF — Veli WhatsApp (aktif)" },
  { value: "plan_ogrenci", label: "Ödev planı PDF — Öğrenci WhatsApp (aktif)" },
  { value: "report_veli", label: "Ödev kontrol raporu PDF — Veli WhatsApp (aktif)" },
  { value: "report_ogrenci", label: "Ödev kontrol raporu PDF — Öğrenci WhatsApp (aktif)" },
] as const;

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

  useEffect(() => {
    fetchLocalMetaTemplates({ approved_only: true })
      .then((res) => setMetaTemplates(res.templates || []))
      .catch(() => setMetaTemplates([]));
  }, []);

  const { setNode, insert } = useTextareaInsert();
  const rawText = plainTextFromComposer(composerState) || form.body;
  const previewText = resolvePreviewVariables(rawText);
  const previewSegments = useMemo(() => parseWhatsAppText(previewText), [previewText]);
  const usedVariables = useMemo(() => {
    const found = rawText.match(/\{\{(\w+)\}\}/g) || [];
    return Array.from(new Set(found));
  }, [rawText]);

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
                <label htmlFor="tpl-meta">Meta karşılığı</label>
                <select
                  id="tpl-meta"
                  value={form.meta_template_id ?? editing?.meta_template ?? ""}
                  onChange={(e) => onChange({ ...form, meta_template_id: e.target.value })}
                >
                  <option value="">— Yok —</option>
                  {metaTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.language})
                    </option>
                  ))}
                </select>
                <p className="tplx-field-hint">
                  Alıcının 24 saatlik penceresi kapalıysa veya toplu gönderim yapılırsa bu onaylı
                  şablon kullanılır. Değişkenler Meta biçimine otomatik dönüştürülür.
                </p>
              </div>
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
        </div>

        <aside className="tplx-drawer-side">
          <div className="tplx-preview-title">
            <span>Canlı önizleme</span>
            <span>{rawText.length} karakter</span>
          </div>

          <div className="tplx-preview-stack">
            <div className="tplx-bubble">
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
