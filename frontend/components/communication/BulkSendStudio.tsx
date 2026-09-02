"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AttachmentDropZone from "./AttachmentDropZone";
import RecipientsSummaryPanel, { recipientKey } from "./RecipientsSummaryPanel";
import SendConfirmModal from "./SendConfirmModal";
import SendOptionsBar from "./SendOptionsBar";
import MetaTemplateSelect, { headerTypeOf } from "./MetaTemplateSelect";
import WhatsAppPhonePreview from "./WhatsAppPhonePreview";
import { ComposerState, plainTextFromComposer, sanitizeTemplateParamText, TEMPLATE_VARIABLES } from "./composer-utils";
import {
  accountLabel,
  AUDIENCE_TYPE_LABELS,
  AudienceFilter,
  CampaignAttachmentItem,
  CampaignPreviewRecipient,
  CampaignPreviewStats,
  confirmCampaign,
  createCampaign,
  fetchAccessibleWhatsAppAccounts,
  previewCampaign,
  SendMode,
  WhatsAppAccount,
  WhatsAppMetaTemplateItem,
} from "@/lib/communication-api";

const RECIPIENTS_PAGE_SIZE = 20;

/** Ek tipine göre tercih edilen duyuru şablon adları (veli / öğrenci). */
const PREFERRED_TEMPLATE_BY_HEADER_VELI: Record<string, string> = {
  TEXT: "duyuru_metin",
  NONE: "duyuru_metin",
  IMAGE: "duyuru_gorsel",
  DOCUMENT: "duyuru_pdf",
};
const PREFERRED_TEMPLATE_BY_HEADER_OGRENCI: Record<string, string> = {
  TEXT: "duyuru_metin_ogrenci",
  NONE: "duyuru_metin_ogrenci",
  IMAGE: "duyuru_gorsel_ogrenci",
  DOCUMENT: "duyuru_pdf_ogrenci",
};
const PREFERRED_TEMPLATE_BY_HEADER_PERSONEL: Record<string, string> = {
  TEXT: "duyuru_metin_personel",
  NONE: "duyuru_metin_personel",
  IMAGE: "duyuru_gorsel_personel",
  DOCUMENT: "duyuru_pdf_personel",
};

function isOgrenciAudience(audienceType: string): boolean {
  return (
    audienceType === "all_ogrenciler"
    || audienceType === "coach_students"
    || audienceType.includes("ogrenci")
  );
}

function isPersonelAudience(audienceType: string): boolean {
  return audienceType === "all_personeller" || audienceType.includes("personel");
}

function preferredTemplateMap(audienceType: string): Record<string, string> {
  if (isPersonelAudience(audienceType)) return PREFERRED_TEMPLATE_BY_HEADER_PERSONEL;
  if (isOgrenciAudience(audienceType)) return PREFERRED_TEMPLATE_BY_HEADER_OGRENCI;
  return PREFERRED_TEMPLATE_BY_HEADER_VELI;
}

function requiredHeadersFromAttachments(atts: CampaignAttachmentItem[]): string[] {
  if (!atts.length) return ["TEXT", "NONE"];
  const mime = (atts[0].mime_type || "").toLowerCase();
  if (mime.startsWith("image/")) return ["IMAGE"];
  return ["DOCUMENT"];
}

function attachmentHeaderMismatch(
  atts: CampaignAttachmentItem[],
  tpl: WhatsAppMetaTemplateItem | null,
): string | null {
  if (!tpl) return null;
  const htype = headerTypeOf(tpl);
  const required = requiredHeadersFromAttachments(atts);
  if (required.includes(htype)) return null;
  if (!atts.length) {
    return `Seçilen şablon ${htype} header bekliyor ancak ek yok. Metin için duyuru_metin / duyuru_metin_ogrenci seçin.`;
  }
  const mime = (atts[0].mime_type || "").toLowerCase();
  if (mime.startsWith("image/")) {
    return "Görsel ek için IMAGE header’lı şablon gerekli (örn. duyuru_gorsel / duyuru_gorsel_ogrenci).";
  }
  return "PDF/belge ek için DOCUMENT header’lı şablon gerekli (örn. duyuru_pdf / duyuru_pdf_ogrenci).";
}

/** Alıcı başına sunucuda çözülen değişkenler — kullanıcıdan istenmez. */
const AUTO_RESOLVED_VARIABLES = new Set([
  "veli_ad",
  "ogrenci_ad",
  "sinif",
  "sube",
  "kurum_ad",
  "personel_ad",
]);

const VARIABLE_LABELS: Record<string, string> = Object.fromEntries(
  TEMPLATE_VARIABLES.map((v) => [v.key, v.label]),
);

function templateVariables(body: string): string[] {
  const found = new Set<string>();
  for (const match of body.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) found.add(match[1]);
  return Array.from(found);
}

/** variable_map: "1"→"kurum_ad" veya "kurum_ad"→"1" */
function canonicalVarName(key: string, map?: Record<string, string> | null): string {
  if (!map) return key;
  const direct = map[key];
  if (direct && !/^\d+$/.test(direct)) return direct;
  const reverse = Object.entries(map).find(([, v]) => v === key)?.[0];
  if (reverse && !/^\d+$/.test(reverse)) return reverse;
  if (direct) return direct;
  return key;
}

function variableFieldLabel(key: string, map?: Record<string, string> | null): string {
  const canonical = canonicalVarName(key, map);
  if (VARIABLE_LABELS[canonical]) return VARIABLE_LABELS[canonical];
  if (VARIABLE_LABELS[key]) return VARIABLE_LABELS[key];
  if (/^\d+$/.test(key)) return `Alan ${key}`;
  return canonical.replace(/_/g, " ");
}

/** Şablon gövdesinden değişken etrafındaki kısa bağlam. */
function variableContextHint(body: string, key: string): string | null {
  const re = new RegExp(`([^\\n]{0,28})\\{\\{\\s*${key}\\s*\\}\\}([^\\n]{0,28})`);
  const m = body.match(re);
  if (!m) return null;
  const left = (m[1] || "").trim();
  const right = (m[2] || "").trim();
  const snippet = `${left ? `…${left}` : ""}{{${key}}}${right ? `${right}…` : ""}`.trim();
  return snippet.length > 4 ? snippet : null;
}

function fillManualVariables(body: string, values: Record<string, string>): string {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
    if (AUTO_RESOLVED_VARIABLES.has(key)) return match;
    const value = sanitizeTemplateParamText(values[key] || "");
    return value || match;
  });
}

export interface BulkSendStudioProps {
  audienceFilter: AudienceFilter;
  audienceType: string;
  title: string;
  onTitleChange: (value: string) => void;
  composerState: ComposerState;
  onComposerChange: (state: ComposerState) => void;
  templateName: string;
  onTemplateNameChange: (value: string) => void;
  templateLanguage?: string;
  onTemplateLanguageChange?: (value: string) => void;
  campaignDetailPath: (id: string) => string;
  kurumName?: string;
}

export default function BulkSendStudio({
  audienceFilter,
  audienceType,
  title,
  onTitleChange,
  composerState,
  onComposerChange,
  templateName,
  onTemplateNameChange,
  templateLanguage = "tr",
  onTemplateLanguageChange,
  campaignDetailPath,
  kurumName = "3K Kampüs",
}: BulkSendStudioProps) {
  const router = useRouter();
  const [preview, setPreview] = useState<CampaignPreviewStats | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [attachments, setAttachments] = useState<CampaignAttachmentItem[]>([]);
  const [sendMode, setSendMode] = useState<SendMode>("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [saveAsDraft, setSaveAsDraft] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [aiUsed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMobilePreview, setShowMobilePreview] = useState(false);

  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [accountId, setAccountId] = useState<string>("");
  const [page, setPage] = useState(1);
  const [excludedOgrenci, setExcludedOgrenci] = useState<Map<number, string>>(new Map());
  const [excludedVeli, setExcludedVeli] = useState<Map<number, string>>(new Map());
  const [excludedPersonel, setExcludedPersonel] = useState<Map<number, string>>(new Map());
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppMetaTemplateItem | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [compatibleTemplates, setCompatibleTemplates] = useState<WhatsAppMetaTemplateItem[]>([]);

  const requiredHeaderTypes = useMemo(
    () => requiredHeadersFromAttachments(attachments),
    [attachments],
  );

  const templateBody = selectedTemplate?.body_named || "";
  const variableMap = selectedTemplate?.variable_map_json || null;
  const manualVariables = useMemo(
    () => templateVariables(templateBody).filter((key) => {
      const canonical = canonicalVarName(key, variableMap);
      return !AUTO_RESOLVED_VARIABLES.has(key) && !AUTO_RESOLVED_VARIABLES.has(canonical);
    }),
    [templateBody, variableMap],
  );
  const headerMismatch = useMemo(
    () => attachmentHeaderMismatch(attachments, selectedTemplate),
    [attachments, selectedTemplate],
  );

  // Ek tipi / kitle değişince uyumlu şablonu otomatik öner (veli ↔ öğrenci)
  useEffect(() => {
    if (!compatibleTemplates.length) {
      if (selectedTemplate || templateName) {
        onTemplateNameChange("");
        setSelectedTemplate(null);
        setVariableValues({});
      }
      return;
    }
    const preferredMap = preferredTemplateMap(audienceType);
    const preferredNames = requiredHeaderTypes
      .map((h) => preferredMap[h])
      .filter(Boolean);
    const preferred =
      compatibleTemplates.find((t) => preferredNames.includes(t.name))
      || (() => {
        const altMaps = [
          PREFERRED_TEMPLATE_BY_HEADER_VELI,
          PREFERRED_TEMPLATE_BY_HEADER_OGRENCI,
          PREFERRED_TEMPLATE_BY_HEADER_PERSONEL,
        ].filter((m) => m !== preferredMap);
        for (const altMap of altMaps) {
          const altNames = requiredHeaderTypes.map((h) => altMap[h]).filter(Boolean);
          const hit = compatibleTemplates.find((t) => altNames.includes(t.name));
          if (hit) return hit;
        }
        return undefined;
      })()
      || compatibleTemplates[0];

    // Kitleye özel tercih varsa ona geç; yoksa mevcut uyumlu seçimi koru
    if (preferredNames.includes(templateName)) return;
    if (
      !preferredNames.some((n) => compatibleTemplates.some((t) => t.name === n))
      && compatibleTemplates.some((t) => t.name === templateName)
    ) {
      return;
    }

    onTemplateNameChange(preferred.name);
    if (preferred.language && onTemplateLanguageChange) {
      onTemplateLanguageChange(preferred.language);
    }
    setSelectedTemplate(preferred);
    setVariableValues({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compatibleTemplates, requiredHeaderTypes.join("|"), audienceType]);
  const resolvedBody = useMemo(
    () => fillManualVariables(templateBody, variableValues),
    [templateBody, variableValues],
  );
  const missingVariables = useMemo(
    () => manualVariables.filter((key) => !(variableValues[key] || "").trim()),
    [manualVariables, variableValues],
  );

  // Kampanya gövdesi seçilen şablondan türetilir; serbest metin girişi yok.
  useEffect(() => {
    onComposerChange({ ...composerState, text: resolvedBody });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedBody]);

  const body = plainTextFromComposer(composerState);

  useEffect(() => {
    fetchAccessibleWhatsAppAccounts()
      .then((res) => {
        setAccounts(res.accounts || []);
        setAccountId(res.default_account_id || res.accounts?.[0]?.id || "");
      })
      .catch(() => setAccounts([]));
  }, []);

  const audienceFilterKey = JSON.stringify(audienceFilter);

  // Kitle tanımı değiştiğinde manuel hariç tutmaları ve sayfayı sıfırla.
  useEffect(() => {
    setExcludedOgrenci(new Map());
    setExcludedVeli(new Map());
    setExcludedPersonel(new Map());
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audienceFilterKey]);

  const effectiveFilter = useMemo<AudienceFilter>(() => {
    const excludedOgrenciIds = Array.from(excludedOgrenci.keys());
    const excludedVeliIds = Array.from(excludedVeli.keys());
    const excludedPersonelIds = Array.from(excludedPersonel.keys());
    return {
      ...audienceFilter,
      ...(excludedOgrenciIds.length ? { excluded_ogrenci_ids: excludedOgrenciIds } : {}),
      ...(excludedVeliIds.length ? { excluded_veli_ids: excludedVeliIds } : {}),
      ...(excludedPersonelIds.length ? { excluded_personel_ids: excludedPersonelIds } : {}),
    };
  }, [audienceFilter, excludedOgrenci, excludedVeli, excludedPersonel]);

  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    setError(null);
    try {
      const stats = await previewCampaign(effectiveFilter, {
        attachmentCount: attachments.length,
        aiUsed,
        channelConfigId: accountId || undefined,
        includeRecipients: true,
        page,
        pageSize: RECIPIENTS_PAGE_SIZE,
      });
      setPreview(stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Önizleme alınamadı");
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveFilter, attachments.length, aiUsed, accountId, page]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  const handleExcludeRecipient = (recipient: CampaignPreviewRecipient) => {
    if (recipient.personel_id) {
      setExcludedPersonel((prev) => {
        const next = new Map(prev);
        next.set(recipient.personel_id as number, recipient.display_name || recipient.e164);
        return next;
      });
    } else if (recipient.ogrenci_id) {
      setExcludedOgrenci((prev) => {
        const next = new Map(prev);
        next.set(recipient.ogrenci_id as number, recipient.display_name || recipient.e164);
        return next;
      });
    } else if (recipient.veli_id) {
      setExcludedVeli((prev) => {
        const next = new Map(prev);
        next.set(recipient.veli_id as number, recipient.display_name || recipient.e164);
        return next;
      });
    }
  };

  const excludedEntries = [
    ...Array.from(excludedOgrenci.entries()).map(([id, label]) => ({ key: `ogrenci:${id}`, label })),
    ...Array.from(excludedVeli.entries()).map(([id, label]) => ({ key: `veli:${id}`, label })),
    ...Array.from(excludedPersonel.entries()).map(([id, label]) => ({ key: `personel:${id}`, label })),
  ];

  const handleUndoExclude = (key: string) => {
    const [kind, idRaw] = key.split(":");
    const id = Number(idRaw);
    if (kind === "ogrenci") {
      setExcludedOgrenci((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    } else if (kind === "veli") {
      setExcludedVeli((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    } else if (kind === "personel") {
      setExcludedPersonel((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleSendClick = () => {
    if (!templateName.trim()) {
      setError("Toplu gönderim için Meta onaylı bir şablon seçin.");
      return;
    }
    if (headerMismatch) {
      setError(headerMismatch);
      return;
    }
    if (missingVariables.length > 0) {
      setError(
        `Doldurulmamış alan: ${missingVariables
          .map((key) => variableFieldLabel(key, variableMap))
          .join(", ")}`,
      );
      return;
    }
    if (!preview || preview.total_recipients === 0) {
      setError("Gönderilecek alıcı yok.");
      return;
    }
    setError(null);
    setShowConfirm(true);
  };

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const scheduledIso =
        sendMode === "scheduled" && scheduledAt
          ? new Date(scheduledAt).toISOString()
          : undefined;

      if (sendMode === "scheduled" && !scheduledAt) {
        throw new Error("Planlı gönderim için tarih seçin.");
      }

      const campaign = await createCampaign({
        title: title.trim() || undefined,
        body: body || undefined,
        template_name: templateName.trim() || undefined,
        template_language: templateLanguage || undefined,
        audience_filter: effectiveFilter,
        attachment_ids: attachments.map((a) => a.id),
        scheduled_at: scheduledIso,
        save_as_template: saveAsTemplate,
        draft_only: saveAsDraft,
        send_options: {
          ...(saveAsDraft ? { draft: true } : {}),
          template_context: variableValues,
        },
        channel_config_id: accountId || undefined,
      });

      if (!saveAsDraft && campaign.status === "DRAFT") {
        await confirmCampaign(campaign.id);
      }

      setShowConfirm(false);
      router.push(campaignDetailPath(campaign.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gönderim başlatılamadı");
    } finally {
      setSubmitting(false);
    }
  };

  const previewAttachments = attachments.map((a) => ({
    id: a.id,
    original_name: a.original_name,
    mime_type: a.mime_type,
  }));

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const recipientTotal = preview?.total_recipients ?? 0;
  const canSend =
    !!templateName.trim()
    && !headerMismatch
    && missingVariables.length === 0
    && recipientTotal > 0;

  const sendLabel = saveAsDraft
    ? "Taslağı kaydet"
    : sendMode === "scheduled"
      ? "Planla"
      : `${recipientTotal.toLocaleString("tr-TR")} kişiye gönder`;

  return (
    <div className="comm-studio-shell">
      {error && <div className="comm-alert comm-alert-danger">{error}</div>}

      <header className="comm-studio-top">
        <div className="comm-studio-top-main">
          <div className="comm-studio-kicker">
            <span className="comm-studio-audience-pill">
              {AUDIENCE_TYPE_LABELS[audienceType] || audienceType}
            </span>
            <span className="comm-studio-top-count">
              {previewLoading ? "…" : recipientTotal.toLocaleString("tr-TR")}
              <small>alıcı</small>
            </span>
          </div>
          <input
            id="studio-title"
            className="comm-studio-title-input"
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Kampanya başlığı (opsiyonel)"
            aria-label="Kampanya başlığı"
          />
        </div>
        <div className="comm-studio-top-controls">
          <label className="comm-studio-field">
            <span>Hesap</span>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              disabled={accounts.length === 0}
            >
              {accounts.length === 0 && <option value="">Hesap yok</option>}
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {accountLabel(acc)}
                </option>
              ))}
            </select>
          </label>
          <div className="comm-studio-field comm-studio-field-template">
            <MetaTemplateSelect
              value={templateName}
              accountId={accountId || undefined}
              usage="CAMPAIGN"
              hidePreview
              variant="compact"
              requiredHeaderTypes={requiredHeaderTypes}
              onTemplatesLoaded={setCompatibleTemplates}
              label="Şablon"
              onChange={(name, language, tpl) => {
                onTemplateNameChange(name);
                if (language && onTemplateLanguageChange) {
                  onTemplateLanguageChange(language);
                }
                setSelectedTemplate(tpl || null);
                setVariableValues({});
                if (tpl?.name && !title.trim()) onTitleChange(tpl.name);
              }}
            />
          </div>
        </div>
      </header>

      <div className="comm-studio-body">
        <main className="comm-studio-compose">
          <section className="comm-studio-section">
            <div className="comm-studio-section-label">Mesaj</div>
            {!selectedTemplate ? (
              <div className="comm-studio-empty-template">
                <strong>Onaylı bir şablon seçin</strong>
                <p>
                  Toplu WhatsApp gönderimi yalnızca Meta onaylı şablonla yapılır.
                  Üstten duyuru / hatırlatma şablonunu seçin.
                </p>
              </div>
            ) : (
              <div className="comm-studio-message-card">
                <div className="comm-studio-message-meta">
                  <strong>{selectedTemplate.name}</strong>
                  <span>{selectedTemplate.language || templateLanguage || "tr"}</span>
                </div>
                <pre className="comm-studio-message-body">{templateBody}</pre>
                {manualVariables.length > 0 ? (
                  <div className="comm-studio-vars">
                    <div className="comm-studio-vars-head">
                      <span className="comm-studio-section-label">Doldurulacak alanlar</span>
                      <span className="comm-studio-vars-count">{manualVariables.length}</span>
                    </div>
                    <div className="comm-studio-var-grid">
                      {manualVariables.map((key) => {
                        const label = variableFieldLabel(key, variableMap);
                        const hint = variableContextHint(templateBody, key);
                        return (
                          <label key={key} className="comm-studio-var-field">
                            <span>{label}</span>
                            <input
                              type="text"
                              value={variableValues[key] || ""}
                              onChange={(e) =>
                                setVariableValues((prev) => ({ ...prev, [key]: e.target.value }))
                              }
                              placeholder={label}
                            />
                            {hint && <small>{hint}</small>}
                            {(key === "mesaj" || key === "aciklama" || /^\d+$/.test(key)) && (
                              <small>Değişken değerlerinde satır atlaması desteklenmez; çok satırlı içerikler gönderim sırasında tek satıra dönüştürülür.</small>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="comm-studio-auto-vars">
                    Tüm alanlar alıcıya göre otomatik doldurulur.
                  </p>
                )}
              </div>
            )}
          </section>

          <section className="comm-studio-section">
            <div className="comm-studio-section-label">Ek</div>
            <AttachmentDropZone attachments={attachments} onChange={setAttachments} />
            {headerMismatch && (
              <div className="comm-alert comm-alert-warning">{headerMismatch}</div>
            )}
            <p className="comm-studio-hint">
              Ek yok → metin şablon · Görsel → IMAGE · PDF → DOCUMENT
            </p>
          </section>

          <section className="comm-studio-section">
            <div className="comm-studio-section-label">Zamanlama</div>
            <SendOptionsBar
              sendMode={sendMode}
              onSendModeChange={setSendMode}
              scheduledAt={scheduledAt}
              onScheduledAtChange={setScheduledAt}
              saveAsTemplate={saveAsTemplate}
              onSaveAsTemplateChange={setSaveAsTemplate}
              saveAsDraft={saveAsDraft}
              onSaveAsDraftChange={setSaveAsDraft}
            />
          </section>
        </main>

        <aside className={`comm-studio-rail${showMobilePreview ? " is-open" : ""}`}>
          <div className="comm-studio-preview-block">
            <div className="comm-studio-section-label">Önizleme</div>
            <WhatsAppPhonePreview
              text={body}
              kurumName={kurumName}
              previewColor={composerState.previewColor}
              fontSize={composerState.previewFontSize}
              attachments={previewAttachments}
            />
          </div>
          <RecipientsSummaryPanel
            preview={preview}
            audienceType={audienceType}
            loading={previewLoading}
            onRefresh={loadPreview}
            page={page}
            pageSize={RECIPIENTS_PAGE_SIZE}
            onPageChange={setPage}
            onExclude={handleExcludeRecipient}
            excludedEntries={excludedEntries}
            onUndoExclude={handleUndoExclude}
          />
        </aside>
      </div>

      <footer className="comm-studio-dock">
        <p className="comm-studio-dock-hint">
          {previewLoading
            ? "Alıcılar hesaplanıyor…"
            : excludedEntries.length > 0
              ? `${recipientTotal.toLocaleString("tr-TR")} alıcı · ${excludedEntries.length} hariç`
              : `${recipientTotal.toLocaleString("tr-TR")} alıcıya gidecek`}
        </p>
        <div className="comm-studio-dock-actions">
          <button
            type="button"
            className="comm-btn-secondary comm-preview-toggle"
            onClick={() => setShowMobilePreview((v) => !v)}
          >
            {showMobilePreview ? "Önizlemeyi kapat" : "Önizleme"}
          </button>
          <button
            type="button"
            className="comm-btn-primary"
            onClick={handleSendClick}
            disabled={!canSend}
            title={
              headerMismatch
              || (!templateName.trim() ? "Önce onaylı bir şablon seçin" : undefined)
            }
          >
            {sendLabel}
          </button>
        </div>
      </footer>

      <SendConfirmModal
        open={showConfirm}
        preview={preview}
        title={title}
        body={body}
        attachments={previewAttachments}
        aiUsed={aiUsed}
        accountLabel={selectedAccount ? accountLabel(selectedAccount) : undefined}
        submitting={submitting}
        error={error}
        onConfirm={handleConfirm}
        onCancel={() => {
          setShowConfirm(false);
          setError(null);
        }}
      />
    </div>
  );
}

export { recipientKey };
