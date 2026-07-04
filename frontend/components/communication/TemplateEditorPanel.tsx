"use client";

import { FormEvent, useMemo } from "react";
import MessageComposer from "./MessageComposer";
import WhatsAppPreviewBubble from "./WhatsAppPreviewBubble";
import TemplateVariablePanel from "./TemplateVariablePanel";
import {
  createComposerState,
  plainTextFromComposer,
  ComposerState,
  resolvePreviewVariables,
} from "./composer-utils";
import {
  MessageTemplateItem,
  TEMPLATE_AUDIENCE_LABELS,
  TemplateCategoryItem,
} from "@/lib/communication-api";

export interface TemplateEditorForm {
  name: string;
  body: string;
  category: string;
  audience_scope: string;
  odev_pdf_role?: string;
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

  const previewText = resolvePreviewVariables(
    plainTextFromComposer(composerState) || form.body,
  );

  const insertVariable = (token: string) => {
    const current = plainTextFromComposer(composerState);
    onComposerChange(createComposerState(current + token));
  };

  const showOdevRole = form.category === "haftalik_odev";

  return (
    <div className="comm-card comm-sablon-editor">
      <div className="comm-sablon-editor-header">
        <h2>{editing ? "Şablon Düzenle" : "Yeni Şablon"}</h2>
        {editing && onDelete && (
          <button type="button" className="comm-link-btn comm-link-danger" onClick={onDelete}>
            Sil
          </button>
        )}
      </div>

      {editing?.is_system_active && editing.system_usages?.length ? (
        <div className="comm-sablon-active-banner">
          <strong>Aktif sistem şablonu</strong>
          <ul>
            {editing.system_usages.map((u) => (
              <li key={`${u.module}-${u.role}`}>{u.label}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="comm-sablon-editor-form">
        <div className="comm-form-field">
          <label htmlFor="tpl-name">Ad</label>
          <input
            id="tpl-name"
            required
            value={form.name}
            onChange={(e) => onChange({ ...form, name: e.target.value })}
          />
        </div>

        <div className="comm-sablon-editor-meta">
          <div className="comm-form-field">
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
          <div className="comm-form-field">
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
          <div className="comm-form-field">
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
            <p className="comm-sablon-field-hint">
              Seçerseniz kayıt sonrası bu şablon ilgili ödev PDF gönderiminde aktif olur.
            </p>
          </div>
        )}

        <TemplateVariablePanel category={form.category} onInsert={insertVariable} />

        <div className="comm-sablon-editor-compose">
          <label htmlFor="tpl-body">Mesaj metni</label>
          <MessageComposer
            id="tpl-body"
            value={composerState}
            onChange={onComposerChange}
            showPreview={false}
            placeholder="{{veli_ad}} için mesaj…"
          />
        </div>

        <div className="comm-sablon-editor-preview">
          <span className="comm-sablon-editor-preview-label">Önizleme (örnek verilerle)</span>
          <WhatsAppPreviewBubble text={previewText} />
        </div>

        <div className="comm-sablon-editor-actions">
          <button type="button" className="comm-btn-secondary" onClick={onCancel}>
            İptal
          </button>
          <button type="submit" className="comm-btn-primary" disabled={saving}>
            {saving ? "Kaydediliyor…" : editing ? "Güncelle" : "Oluştur"}
          </button>
        </div>
      </form>
    </div>
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
