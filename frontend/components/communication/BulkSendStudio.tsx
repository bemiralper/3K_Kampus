"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AttachmentDropZone from "./AttachmentDropZone";
import RecipientsSummaryPanel, { recipientKey } from "./RecipientsSummaryPanel";
import SendConfirmModal from "./SendConfirmModal";
import SendOptionsBar from "./SendOptionsBar";
import MetaTemplateSelect from "./MetaTemplateSelect";
import WhatsAppPhonePreview from "./WhatsAppPhonePreview";
import { ComposerState, plainTextFromComposer, TEMPLATE_VARIABLES } from "./composer-utils";
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

/** Alıcı başına sunucuda çözülen değişkenler — kullanıcıdan istenmez. */
const AUTO_RESOLVED_VARIABLES = new Set([
  "veli_ad",
  "ogrenci_ad",
  "sinif",
  "sube",
  "kurum_ad",
]);

const VARIABLE_LABELS: Record<string, string> = Object.fromEntries(
  TEMPLATE_VARIABLES.map((v) => [v.key, v.label]),
);

function templateVariables(body: string): string[] {
  const found = new Set<string>();
  for (const match of body.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) found.add(match[1]);
  return Array.from(found);
}

function fillManualVariables(body: string, values: Record<string, string>): string {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
    if (AUTO_RESOLVED_VARIABLES.has(key)) return match;
    return values[key]?.trim() ? values[key] : match;
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
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppMetaTemplateItem | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});

  const templateBody = selectedTemplate?.body_named || "";
  const manualVariables = useMemo(
    () => templateVariables(templateBody).filter((key) => !AUTO_RESOLVED_VARIABLES.has(key)),
    [templateBody],
  );
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
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audienceFilterKey]);

  const effectiveFilter = useMemo<AudienceFilter>(() => {
    const excludedOgrenciIds = Array.from(excludedOgrenci.keys());
    const excludedVeliIds = Array.from(excludedVeli.keys());
    return {
      ...audienceFilter,
      ...(excludedOgrenciIds.length ? { excluded_ogrenci_ids: excludedOgrenciIds } : {}),
      ...(excludedVeliIds.length ? { excluded_veli_ids: excludedVeliIds } : {}),
    };
  }, [audienceFilter, excludedOgrenci, excludedVeli]);

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
    if (recipient.ogrenci_id) {
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
    }
  };

  const handleSendClick = () => {
    if (!templateName.trim()) {
      setError("Toplu gönderim için Meta onaylı bir şablon seçin.");
      return;
    }
    if (missingVariables.length > 0) {
      setError(
        `Doldurulmamış değişken: ${missingVariables
          .map((key) => VARIABLE_LABELS[key] || key)
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
        send_options: saveAsDraft ? { draft: true } : undefined,
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

  return (
    <div className="comm-bulk-studio">
      {error && <div className="comm-alert comm-alert-danger">{error}</div>}

      <div className="comm-card comm-studio-headerbar">
        <div className="comm-studio-headerbar-field comm-studio-headerbar-title">
          <label htmlFor="studio-title">Kampanya başlığı</label>
          <input
            id="studio-title"
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Örn: Nisan duyurusu (opsiyonel)"
          />
        </div>
        <div className="comm-studio-headerbar-field">
          <label htmlFor="studio-account">Gönderim hesabı</label>
          <select
            id="studio-account"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            disabled={accounts.length === 0}
          >
            {accounts.length === 0 && <option value="">Erişilebilir hesap bulunamadı</option>}
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {accountLabel(acc)}
              </option>
            ))}
          </select>
        </div>
        <div className="comm-studio-headerbar-field">
          <MetaTemplateSelect
            value={templateName}
            accountId={accountId || undefined}
            usage="CAMPAIGN"
            hidePreview
            label="Duyuru şablonu (Meta onaylı)"
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
        <div className="comm-studio-headerbar-summary">
          <span className="comm-scope-chip">{AUDIENCE_TYPE_LABELS[audienceType] || audienceType}</span>
          <span className="comm-studio-headerbar-count">
            {previewLoading ? "…" : (preview?.total_recipients ?? 0).toLocaleString("tr-TR")}
            <small>alıcı</small>
          </span>
        </div>
      </div>

      <div className="comm-studio-grid">
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

        <main className="comm-studio-center">
          <div className="comm-card comm-studio-editor">
            {!selectedTemplate ? (
              <div className="comm-alert comm-alert-warning comm-studio-template-hint">
                Toplu duyurular WhatsApp tarafından yalnızca onaylı şablonla iletilir.
                Yukarıdan bir duyuru şablonu seçin; metin şablondan gelir.
              </div>
            ) : (
              <>
                <div className="comm-studio-template-body">
                  <h3>{selectedTemplate.name}</h3>
                  <pre>{templateBody}</pre>
                </div>
                {manualVariables.length > 0 ? (
                  <div className="comm-studio-template-vars">
                    <h3>Değişkenleri doldurun</h3>
                    {manualVariables.map((key) => (
                      <label key={key} className="comm-meta-send-var">
                        <span>{VARIABLE_LABELS[key] || key.replace(/_/g, " ")}</span>
                        <input
                          type="text"
                          value={variableValues[key] || ""}
                          onChange={(e) =>
                            setVariableValues((prev) => ({ ...prev, [key]: e.target.value }))
                          }
                          placeholder={`{{${key}}}`}
                        />
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="comm-studio-muted comm-studio-template-note">
                    Bu şablondaki değişkenler her alıcı için otomatik doldurulur.
                  </p>
                )}
              </>
            )}
            <AttachmentDropZone attachments={attachments} onChange={setAttachments} />
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
          </div>
        </main>

        <aside className={`comm-studio-right${showMobilePreview ? " mobile-visible" : ""}`}>
          <WhatsAppPhonePreview
            text={body}
            kurumName={kurumName}
            previewColor={composerState.previewColor}
            fontSize={composerState.previewFontSize}
            attachments={previewAttachments}
          />
        </aside>
      </div>

      <div className="comm-studio-footer-actions">
        <span className="comm-studio-footer-hint">
          {previewLoading
            ? "Alıcılar hesaplanıyor…"
            : `${(preview?.total_recipients ?? 0).toLocaleString("tr-TR")} alıcıya gönderilecek`}
        </span>
        <button
          type="button"
          className="comm-btn-secondary comm-preview-toggle"
          onClick={() => setShowMobilePreview((v) => !v)}
        >
          👁 Önizleme
        </button>
        <button
          type="button"
          className="comm-btn-primary"
          onClick={handleSendClick}
          disabled={!templateName.trim()}
          title={!templateName.trim() ? "Önce onaylı bir duyuru şablonu seçin" : undefined}
        >
          Gönder
        </button>
      </div>

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
