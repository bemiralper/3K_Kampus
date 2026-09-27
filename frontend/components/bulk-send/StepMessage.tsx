"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  CAMPAIGN_AUDIENCE_LABELS,
  CAMPAIGN_MEDIA_OPTIONS,
  CampaignAudience,
  CampaignMedia,
  ClassifiedCampaignTemplate,
  campaignVariableFields,
  filterCampaignTemplates,
  listCampaignTemplates,
  neededCampaignAudience,
} from "@/app/admin/iletisim/toplu-gonder/campaign-template-catalog";
import AttachmentDropZone from "@/components/communication/AttachmentDropZone";
import WhatsAppFormatBar, { applyFormatKeydown } from "@/components/communication/WhatsAppFormatBar";
import {
  accountLabel,
  CampaignAttachmentItem,
  WhatsAppMetaTemplateItem,
  fetchLocalMetaTemplates,
} from "@/lib/communication-api";

import {
  attachmentMismatch,
  bodySnippet,
  isApprovedTemplate,
  needsAttachment,
  templateStatusLabel,
  writeVariableValue,
} from "./message-helpers";
import type { BulkSendDraft } from "./useBulkSendDraft";

interface Props {
  draft: BulkSendDraft;
  attachments: CampaignAttachmentItem[];
  onAttachmentsChange: (items: CampaignAttachmentItem[]) => void;
}

/** 2. adım — mesajı kur: hat, şablon, değişkenler, ek. */
export default function StepMessage({ draft, attachments, onAttachmentsChange }: Props) {
  const {
    accounts, accountId, setAccountId,
    title, setTitle,
    personTypes, templateName, selectedTemplate, onTemplateChange,
    variableValues, setVariableValues,
  } = draft;

  const [rows, setRows] = useState<WhatsAppMetaTemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [media, setMedia] = useState<CampaignMedia | "">("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchLocalMetaTemplates({ account_id: accountId || undefined, usage: "CAMPAIGN", approved_only: false })
      .then((res) => { if (!cancelled) setRows(res.templates || []); })
      .catch(() => { if (!cancelled) setRows([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [accountId]);

  const catalog = useMemo(() => listCampaignTemplates(rows), [rows]);
  const neededAudience = neededCampaignAudience(personTypes);
  const mixedAudience = personTypes.length > 1;

  const mediaKeys = useMemo(() => {
    const present = new Set(catalog.map((item) => item.media));
    return CAMPAIGN_MEDIA_OPTIONS.filter((item) => present.has(item.key));
  }, [catalog]);

  const mediaKeysSignature = mediaKeys.map((item) => item.key).join("|");
  useEffect(() => {
    if (media && !mediaKeys.some((item) => item.key === media)) setMedia("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaKeysSignature]);

  const visible = useMemo(
    () => filterCampaignTemplates(catalog, { audiences: personTypes, media }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalog, personTypes.join("|"), media],
  );

  // Seçili şablon listeden düşerse ilk onaylıya geç.
  const visibleSignature = visible.map((item) => item.tpl.id).join("|");
  useEffect(() => {
    const current = visible.find((item) => item.tpl.name === templateName);
    if (current) {
      if (current.tpl.id !== selectedTemplate?.id) {
        onTemplateChange(current.tpl.name, current.tpl.language || "tr", current.tpl);
      }
      return;
    }
    const fallback = visible.find((item) => isApprovedTemplate(item.tpl)) || visible[0];
    if (fallback) onTemplateChange(fallback.tpl.name, fallback.tpl.language || "tr", fallback.tpl);
    else if (templateName) onTemplateChange("", "tr", null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleSignature]);

  const activeClassified = visible.find((item) => item.tpl.name === templateName)
    || catalog.find((item) => item.tpl.name === templateName);
  const active = activeClassified?.tpl || selectedTemplate;
  const variableMap = active?.variable_map_json || null;
  const variableFields = useMemo(
    () => campaignVariableFields(active?.body_named || "", variableMap),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active?.body_named, JSON.stringify(variableMap)],
  );
  const manualFields = variableFields.filter((field) => !field.auto);
  const autoFields = variableFields.filter((field) => field.auto);
  const mismatch = attachmentMismatch(attachments, active);
  const account = accounts.find((item) => item.id === accountId);

  return (
    <div className="bss-step">
      <section className="bss-panel">
        <header className="bss-panel-head">
          <div>
            <h3>Gönderim bilgisi</h3>
            <p>Hangi WhatsApp hattından çıkacak?</p>
          </div>
        </header>
        <div className="bss-grid2">
          <label className="bss-field">
            <span>WhatsApp hattı</span>
            <select
              className="bss-select"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
            >
              {accounts.length === 0 && <option value="">Hesap yok</option>}
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {accountLabel(acc)}{acc.send_error ? " — hata var" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="bss-field">
            <span>Başlık <em>isteğe bağlı</em></span>
            <input
              className="bss-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Raporlarda görünecek ad"
            />
          </label>
        </div>
        {account?.send_error && (
          <p className="bss-alert tone-warn">Bu hat son gönderimde hata verdi: {account.send_error.error}</p>
        )}
      </section>

      <section className="bss-panel">
        <header className="bss-panel-head">
          <div>
            <h3>Şablon</h3>
            <p>
              {mixedAudience
                ? "Karma kitlede yalnızca Genel şablonlar listelenir."
                : neededAudience && neededAudience !== "genel"
                  ? `${CAMPAIGN_AUDIENCE_LABELS[neededAudience as CampaignAudience]} ve Genel şablonlar listelenir.`
                  : "Meta onaylı toplu duyuru şablonları."}
            </p>
          </div>
          {mediaKeys.length > 1 && (
            <div className="bss-seg is-compact" role="group" aria-label="İçerik türü">
              <button
                type="button"
                className={`bss-seg-btn${media === "" ? " is-on" : ""}`}
                onClick={() => setMedia("")}
              >
                Tümü
              </button>
              {mediaKeys.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`bss-seg-btn${media === item.key ? " is-on" : ""}`}
                  onClick={() => setMedia(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </header>

        {loading ? (
          <div className="bss-tpl-list">
            <div className="bss-skeleton" />
            <div className="bss-skeleton" />
          </div>
        ) : visible.length === 0 ? (
          <p className="bss-hint">{emptyHint(neededAudience)}</p>
        ) : (
          <div className="bss-tpl-list" role="radiogroup" aria-label="Şablon">
            {visible.map((item) => (
              <TemplateRow
                key={item.tpl.id}
                item={item}
                selected={templateName === item.tpl.name}
                onSelect={() => onTemplateChange(item.tpl.name, item.tpl.language || "tr", item.tpl)}
              />
            ))}
          </div>
        )}
      </section>

      {active && (manualFields.length > 0 || autoFields.length > 0) && (
        <section className="bss-panel">
          <header className="bss-panel-head">
            <div>
              <h3>Değişkenler</h3>
              <p>Sağdaki önizleme yazdıkça güncellenir.</p>
            </div>
          </header>
          {autoFields.length > 0 && (
            <div className="bss-auto">
              {autoFields.map((field) => (
                <span key={field.key} className="bss-auto-chip">{field.label} — alıcıya göre dolar</span>
              ))}
            </div>
          )}
          {manualFields.map((field) => {
            const value = variableValues[field.key] || variableValues[field.canonical] || "";
            return (
              <label key={field.key} className="bss-field">
                <span>
                  {field.label}
                  {!value.trim() && <em className="is-need">gerekli</em>}
                </span>
                {field.long ? (
                  <RichVarInput
                    value={value}
                    onChange={(next) => setVariableValues(writeVariableValue(variableValues, field, next))}
                    placeholder={`${field.label} metnini yazın`}
                  />
                ) : (
                  <input
                    className="bss-input"
                    value={value}
                    onChange={(event) => setVariableValues(writeVariableValue(variableValues, field, event.target.value))}
                    placeholder={field.label}
                  />
                )}
              </label>
            );
          })}
          {autoFields.map((field) => (
            <label key={`ovr-${field.key}`} className="bss-field is-soft">
              <span>{field.label} <em>elle doldurmak isterseniz</em></span>
              <input
                className="bss-input"
                value={variableValues[field.key] || variableValues[field.canonical] || ""}
                onChange={(event) => setVariableValues(writeVariableValue(variableValues, field, event.target.value))}
                placeholder="Boş bırakılırsa alıcıya göre dolar"
              />
            </label>
          ))}
        </section>
      )}

      {needsAttachment(active) && (
        <section className="bss-panel">
          <header className="bss-panel-head">
            <div>
              <h3>Ek</h3>
              <p>Bu şablon medya bekliyor.</p>
            </div>
          </header>
          <AttachmentDropZone attachments={attachments} onChange={onAttachmentsChange} />
          {mismatch && <p className="bss-alert tone-warn">{mismatch}</p>}
        </section>
      )}
    </div>
  );
}

function TemplateRow({
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
      role="radio"
      aria-checked={selected}
      className={`bss-tpl${selected ? " is-on" : ""}${approved ? "" : " is-blocked"}`}
      onClick={onSelect}
    >
      <span className="bss-tpl-mark" aria-hidden="true" />
      <span className="bss-tpl-text">
        <strong>{item.audienceLabel} — {item.mediaLabel}</strong>
        {item.tpl.body_named && <em>{bodySnippet(item.tpl.body_named)}</em>}
        <small>{item.tpl.name}</small>
      </span>
      <span className={`bss-tpl-state${approved ? " is-ok" : ""}`}>
        {templateStatusLabel(item.tpl.status)}
      </span>
    </button>
  );
}

function RichVarInput({
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
    <div className="bss-compose">
      <WhatsAppFormatBar value={value} onChange={onChange} textareaRef={ref} />
      <textarea
        ref={ref}
        className="bss-textarea"
        rows={6}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => applyFormatKeydown(event, value, onChange)}
        placeholder={placeholder}
      />
    </div>
  );
}

function emptyHint(needed: string): string {
  if (needed === "genel") {
    return "Karma kitle için Genel şablon yok. Meta Şablonlar'da kullanım alanı \"Toplu duyuru\", kitle \"Genel\" olan bir şablon ekleyin.";
  }
  if (needed === "veli") return "Bu kitle için Veli veya Genel toplu duyuru şablonu yok.";
  if (needed === "ogrenci") return "Bu kitle için Öğrenci veya Genel toplu duyuru şablonu yok.";
  if (needed === "personel") return "Bu kitle için Personel veya Genel toplu duyuru şablonu yok.";
  return "Toplu duyuru şablonu bulunamadı. Meta Şablonlar'da kullanım alanını \"Toplu duyuru\" yapın.";
}
