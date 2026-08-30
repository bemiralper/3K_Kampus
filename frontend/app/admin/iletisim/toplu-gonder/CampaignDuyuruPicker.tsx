"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AttachmentDropZone from "@/components/communication/AttachmentDropZone";
import WhatsAppFormatBar, { applyFormatKeydown } from "@/components/communication/WhatsAppFormatBar";
import WhatsAppPhonePreview from "@/components/communication/WhatsAppPhonePreview";
import { headerTypeOf } from "@/components/communication/MetaTemplateSelect";
import {
  accountLabel,
  AudiencePersonType,
  CampaignAttachmentItem,
  fetchLocalMetaTemplates,
  WhatsAppAccount,
  WhatsAppMetaTemplateItem,
} from "@/lib/communication-api";
import {
  CAMPAIGN_AUDIENCE_LABELS,
  CAMPAIGN_MEDIA_OPTIONS,
  CampaignAudience,
  CampaignMedia,
  ClassifiedCampaignTemplate,
  campaignVariableFields,
  fillTemplateVariables,
  filterCampaignTemplates,
  listCampaignTemplates,
  neededCampaignAudience,
} from "./campaign-template-catalog";

interface CampaignDuyuruPickerProps {
  title: string;
  onTitleChange: (value: string) => void;
  accounts: WhatsAppAccount[];
  accountId: string;
  onAccountChange: (value: string) => void;
  personTypes: AudiencePersonType[];
  templateName: string;
  selectedTemplate: WhatsAppMetaTemplateItem | null;
  onTemplateChange: (name: string, language: string, tpl: WhatsAppMetaTemplateItem | null) => void;
  variableValues: Record<string, string>;
  onVariableValuesChange: (values: Record<string, string>) => void;
  attachments: CampaignAttachmentItem[];
  onAttachmentsChange: (items: CampaignAttachmentItem[]) => void;
}

export default function CampaignDuyuruPicker({
  title,
  onTitleChange,
  accounts,
  accountId,
  onAccountChange,
  personTypes,
  templateName,
  selectedTemplate,
  onTemplateChange,
  variableValues,
  onVariableValuesChange,
  attachments,
  onAttachmentsChange,
}: CampaignDuyuruPickerProps) {
  const [rows, setRows] = useState<WhatsAppMetaTemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [media, setMedia] = useState<CampaignMedia | "">("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchLocalMetaTemplates({
      account_id: accountId || undefined,
      usage: "CAMPAIGN",
      approved_only: false,
    })
      .then((res) => {
        if (!cancelled) setRows(res.templates || []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const catalog = useMemo(() => listCampaignTemplates(rows), [rows]);
  const neededAudience = neededCampaignAudience(personTypes);
  const mixedAudience = personTypes.length > 1;

  const mediaKeys = useMemo(() => {
    const present = new Set(catalog.map((item) => item.media));
    return CAMPAIGN_MEDIA_OPTIONS.filter((item) => present.has(item.key));
  }, [catalog]);

  useEffect(() => {
    if (media && !mediaKeys.some((item) => item.key === media)) setMedia("");
  }, [mediaKeys.map((item) => item.key).join("|")]);

  const visible = useMemo(
    () => filterCampaignTemplates(catalog, { audiences: personTypes, media }),
    [catalog, personTypes.join("|"), media],
  );

  useEffect(() => {
    const current = visible.find((item) => item.tpl.name === templateName);
    if (current) {
      if (current.tpl.id !== selectedTemplate?.id) {
        onTemplateChange(current.tpl.name, current.tpl.language || "tr", current.tpl);
      }
      return;
    }
    const firstApproved = visible.find((item) => isApprovedTemplate(item.tpl));
    const fallback = firstApproved || visible[0];
    if (fallback) {
      onTemplateChange(fallback.tpl.name, fallback.tpl.language || "tr", fallback.tpl);
    } else if (templateName) {
      onTemplateChange("", "tr", null);
    }
  }, [visible.map((item) => item.tpl.id).join("|")]);

  const activeClassified = visible.find((item) => item.tpl.name === templateName)
    || catalog.find((item) => item.tpl.name === templateName);
  const active = activeClassified?.tpl || selectedTemplate;
  const variableMap = active?.variable_map_json || null;
  const variableFields = useMemo(
    () => campaignVariableFields(active?.body_named || "", variableMap),
    [active?.body_named, JSON.stringify(variableMap)],
  );
  const manualFields = variableFields.filter((field) => !field.auto);
  const autoFields = variableFields.filter((field) => field.auto);
  const previewText = composePreview(active, variableValues);
  const headerMismatch = attachmentMismatch(attachments, active);

  return (
    <div className="tg-msg-grid">
      <section className="tg-card">
        <h2>Mesaj şablonu</h2>
        <p className="lead">
          {mixedAudience
            ? "Karma kitlede yalnızca Genel şablonlar listelenir. Veli / öğrenci / personel şablonları kendi kitlelerinde kalır."
            : "Bu kitleye özel şablonlar ve Genel şablonlar listelenir. Değişkenleri aşağıdan doldurun."}
        </p>

        {mixedAudience && (
          <p className="tg-info">
            Kitlede birden fazla kişi türü var.{" "}
            <strong>Genel</strong> şablonlar kullanılıyor.
          </p>
        )}

        <label className="tg-field">
          <span>Başlık</span>
          <input
            className="tg-search"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="İsteğe bağlı gönderim başlığı"
          />
        </label>
        <label className="tg-field">
          <span>WhatsApp hesabı</span>
          <select className="tg-select" value={accountId} onChange={(e) => onAccountChange(e.target.value)}>
            {accounts.length === 0 && <option value="">Hesap yok</option>}
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>{accountLabel(acc)}</option>
            ))}
          </select>
        </label>

        {neededAudience && neededAudience !== "genel" && (
          <p className="tg-audience-hint">
            Gösterilen: <strong>{CAMPAIGN_AUDIENCE_LABELS[neededAudience as CampaignAudience]}</strong>
            {" "}ve <strong>Genel</strong>
          </p>
        )}

        {mediaKeys.length > 1 && (
          <div className="tg-field">
            <span>İçerik</span>
            <div className="tg-seg" role="tablist" aria-label="İçerik">
              <button
                type="button"
                className={`tg-seg-btn${media === "" ? " is-on" : ""}`}
                onClick={() => setMedia("")}
              >
                Tümü
              </button>
              {mediaKeys.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`tg-seg-btn${media === item.key ? " is-on" : ""}`}
                  onClick={() => setMedia(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="tg-field">
          <span>Şablon</span>
          {loading ? (
            <p className="tg-empty">Şablonlar yükleniyor…</p>
          ) : visible.length === 0 ? (
            <p className="tg-empty">{emptyCatalogHint(neededAudience)}</p>
          ) : (
            <div className="tg-tpl-list">
              {visible.map((item) => (
                <TemplateCard
                  key={item.tpl.id}
                  item={item}
                  selected={templateName === item.tpl.name}
                  onSelect={() => onTemplateChange(item.tpl.name, item.tpl.language || "tr", item.tpl)}
                />
              ))}
            </div>
          )}
        </div>

        {active && (
          <div className="tg-field">
            <span>Değişkenler</span>
            {autoFields.length > 0 && (
              <div className="tg-auto-vars">
                {autoFields.map((field) => (
                  <span key={field.key} className="tg-auto-chip">
                    {field.label} — alıcıya göre dolar
                  </span>
                ))}
              </div>
            )}
            {manualFields.length === 0 && autoFields.length === 0 && (
              <p className="tg-empty">Bu şablonda doldurulacak değişken yok.</p>
            )}
            {manualFields.map((field) => {
              const value = variableValues[field.key] || variableValues[field.canonical] || "";
              return (
                <label key={field.key} className="tg-var-field">
                  <span>{field.label}</span>
                  {field.long ? (
                    <FormattedVarTextarea
                      value={value}
                      onChange={(next) => onVariableValuesChange(writeVariableValue(variableValues, field, next))}
                      placeholder={`${field.label} metnini yazın`}
                    />
                  ) : (
                    <input
                      className="tg-search"
                      value={value}
                      onChange={(e) => onVariableValuesChange(writeVariableValue(variableValues, field, e.target.value))}
                      placeholder={field.label}
                    />
                  )}
                  <small>{field.canonical !== field.key ? `{{${field.key}}} → {{${field.canonical}}}` : `{{${field.key}}}`}</small>
                </label>
              );
            })}
            {autoFields.map((field) => (
              <label key={`override-${field.key}`} className="tg-var-field is-optional">
                <span>{field.label} (isteğe bağlı)</span>
                <input
                  className="tg-search"
                  value={variableValues[field.key] || variableValues[field.canonical] || ""}
                  onChange={(e) => onVariableValuesChange(writeVariableValue(variableValues, field, e.target.value))}
                  placeholder="Boş bırakılırsa alıcıya göre dolar"
                />
                <small>{`{{${field.key}}}`}</small>
              </label>
            ))}
          </div>
        )}

        {needsAttachment(active) && (
          <>
            <AttachmentDropZone attachments={attachments} onChange={onAttachmentsChange} />
            {headerMismatch && <p className="tg-warn" style={{ marginTop: 8 }}>{headerMismatch}</p>}
          </>
        )}
      </section>
      <aside>
        <WhatsAppPhonePreview
          text={previewText || "Şablon ve değişkenler burada önizlenir."}
          attachments={attachments}
          previewContext={variableValues}
        />
      </aside>
    </div>
  );
}

function FormattedVarTextarea({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <div className="tg-wa-compose">
      <WhatsAppFormatBar value={value} onChange={onChange} textareaRef={ref} />
      <textarea
        ref={ref}
        className="tg-textarea"
        rows={5}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => applyFormatKeydown(e, value, onChange)}
        placeholder={placeholder}
      />
    </div>
  );
}

function TemplateCard({
  item,
  selected,
  onSelect,
}: {
  item: ClassifiedCampaignTemplate;
  selected: boolean;
  onSelect: () => void;
}) {
  const approved = isApprovedTemplate(item.tpl);
  return (
    <button
      type="button"
      className={`tg-tpl-card${selected ? " is-on" : ""}${approved ? "" : " is-draft"}`}
      onClick={onSelect}
    >
      <strong>{titleFor(item)}</strong>
      <span>
        {item.tpl.name} · {item.mediaLabel} · {statusLabel(item.tpl.status)}
      </span>
      {item.tpl.body_named ? (
        <em className="tg-tpl-snippet">{snippet(item.tpl.body_named)}</em>
      ) : null}
      {!approved ? <span className="tg-tpl-block">Onaylanmadan gönderilemez.</span> : null}
    </button>
  );
}

function titleFor(item: ClassifiedCampaignTemplate): string {
  return `${item.audienceLabel} — ${item.mediaLabel}`;
}

function emptyCatalogHint(needed: string): string {
  if (needed === "genel") {
    return "Karma kitle için Genel şablon yok. Meta Şablonlar’da kullanım alanı “Toplu duyuru”, kitle “Genel” olan bir şablon ekleyin.";
  }
  if (needed === "veli") return "Bu kitle için Veli veya Genel toplu duyuru şablonu yok.";
  if (needed === "ogrenci") return "Bu kitle için Öğrenci veya Genel toplu duyuru şablonu yok.";
  if (needed === "personel") return "Bu kitle için Personel veya Genel toplu duyuru şablonu yok.";
  return "Toplu duyuru şablonu bulunamadı. Meta Şablonlar’da kullanım alanını “Toplu duyuru” yapın.";
}

function needsAttachment(tpl: WhatsAppMetaTemplateItem | null): boolean {
  return ["IMAGE", "DOCUMENT", "VIDEO"].includes(headerTypeOf(tpl));
}

function attachmentMismatch(
  atts: CampaignAttachmentItem[],
  tpl: WhatsAppMetaTemplateItem | null,
): string | null {
  if (!tpl) return null;
  const htype = headerTypeOf(tpl);
  if (!["IMAGE", "DOCUMENT", "VIDEO"].includes(htype)) return null;
  if (!atts.length) {
    return htype === "IMAGE"
      ? "Bu şablon görsel bekliyor."
      : htype === "VIDEO"
        ? "Bu şablon video bekliyor."
        : "Bu şablon PDF / belge bekliyor.";
  }
  const mime = (atts[0].mime_type || "").toLowerCase();
  if (htype === "IMAGE" && !mime.startsWith("image/")) return "Görsel şablon için resim ekleyin.";
  if (htype === "VIDEO" && !mime.startsWith("video/")) return "Video şablon için video ekleyin.";
  if (htype === "DOCUMENT" && mime.startsWith("image/")) return "Belge şablonu için PDF ekleyin.";
  return null;
}

function writeVariableValue(
  values: Record<string, string>,
  field: { key: string; canonical: string },
  next: string,
): Record<string, string> {
  const updated = { ...values, [field.key]: next };
  if (field.canonical !== field.key) updated[field.canonical] = next;
  return updated;
}

export function composePreview(
  tpl: WhatsAppMetaTemplateItem | null,
  values: Record<string, string>,
): string {
  if (!tpl) return "";
  const header = tpl.header_json?.type === "TEXT" ? (tpl.header_json.text || "").trim() : "";
  const body = fillTemplateVariables(tpl.body_named || "", values, tpl.variable_map_json);
  const footer = (tpl.footer_text || "").trim();
  return [header, body, footer].filter(Boolean).join("\n\n");
}

export function isApprovedTemplate(tpl: WhatsAppMetaTemplateItem | null): boolean {
  return String(tpl?.status || "").toUpperCase() === "APPROVED";
}

export function campaignMessageReady(
  tpl: WhatsAppMetaTemplateItem | null,
  values: Record<string, string>,
  attachments: CampaignAttachmentItem[],
): boolean {
  if (!tpl || !isApprovedTemplate(tpl)) return false;
  const fields = campaignVariableFields(tpl.body_named || "", tpl.variable_map_json);
  const missing = fields.filter((field) => (
    !field.auto && !(values[field.key] || values[field.canonical] || "").trim()
  ));
  if (missing.length) return false;
  if (needsAttachment(tpl) && attachments.length === 0) return false;
  return attachmentMismatch(attachments, tpl) == null;
}

function statusLabel(status?: string): string {
  const raw = String(status || "").toUpperCase();
  if (raw === "APPROVED") return "Onaylı";
  if (raw === "PENDING") return "İnceleniyor";
  if (raw === "DRAFT") return "Taslak";
  return raw || "Yok";
}

function snippet(body: string): string {
  return body.replace(/\s+/g, " ").trim().slice(0, 96);
}
