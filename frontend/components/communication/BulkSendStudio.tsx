"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AttachmentDropZone from "./AttachmentDropZone";
import RecipientsSummaryPanel, { recipientKey } from "./RecipientsSummaryPanel";
import RichMessageToolbar from "./RichMessageToolbar";
import SendConfirmModal from "./SendConfirmModal";
import SendOptionsBar from "./SendOptionsBar";
import MetaTemplateSelect from "./MetaTemplateSelect";
import TemplatePickerDrawer from "./TemplatePickerDrawer";
import WhatsAppPhonePreview from "./WhatsAppPhonePreview";
import {
  ComposerState,
  plainTextFromComposer,
  WHATSAPP_MAX_LENGTH,
} from "./composer-utils";
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
  MessageTemplateItem,
  previewCampaign,
  SendMode,
  WhatsAppAccount,
} from "@/lib/communication-api";

const RECIPIENTS_PAGE_SIZE = 20;

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
  readOnlyTemplates?: boolean;
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
  readOnlyTemplates = false,
  kurumName = "3K Kampüs",
}: BulkSendStudioProps) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState<CampaignPreviewStats | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [attachments, setAttachments] = useState<CampaignAttachmentItem[]>([]);
  const [sendMode, setSendMode] = useState<SendMode>("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [saveAsDraft, setSaveAsDraft] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showAiInfo, setShowAiInfo] = useState(false);
  const [aiUsed, setAiUsed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMobilePreview, setShowMobilePreview] = useState(false);

  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [accountId, setAccountId] = useState<string>("");
  const [page, setPage] = useState(1);
  const [excludedOgrenci, setExcludedOgrenci] = useState<Map<number, string>>(new Map());
  const [excludedVeli, setExcludedVeli] = useState<Map<number, string>>(new Map());

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

  const handleTemplateSelect = (template: MessageTemplateItem) => {
    onComposerChange({ ...composerState, text: template.body });
    if (template.name) onTitleChange(template.name);
  };

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
    if (!body && !templateName.trim()) {
      setError("Mesaj metni veya şablon adı girin.");
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
            label="Meta şablonu (isteğe bağlı)"
            onChange={(name, language) => {
              onTemplateNameChange(name);
              if (language && onTemplateLanguageChange) {
                onTemplateLanguageChange(language);
              }
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
            <RichMessageToolbar
              composerState={composerState}
              onChange={onComposerChange}
              textareaRef={textareaRef}
              onOpenTemplates={() => setShowTemplates(true)}
              onOpenAi={() => setShowAiInfo(true)}
              readOnlyTemplates={readOnlyTemplates}
            />
            <textarea
              ref={textareaRef}
              className="comm-studio-textarea"
              value={composerState.text}
              onChange={(e) => onComposerChange({ ...composerState, text: e.target.value })}
              placeholder="Gönderilecek mesajı yazın… *kalın*, _italik_, ~çizili~ desteklenir."
              maxLength={WHATSAPP_MAX_LENGTH}
              rows={8}
            />
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
        <button type="button" className="comm-btn-primary" onClick={handleSendClick}>
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

      <TemplatePickerDrawer
        open={showTemplates}
        onClose={() => setShowTemplates(false)}
        onSelect={handleTemplateSelect}
        readOnly={readOnlyTemplates}
      />

      {showAiInfo && (
        <div className="comm-modal-overlay" onClick={() => setShowAiInfo(false)} role="presentation">
          <div className="comm-modal" onClick={(e) => e.stopPropagation()} role="dialog">
            <h2>AI Asistan</h2>
            <p className="comm-studio-muted">
              AI asistan şu an kurumunuzda etkin değil. Etkinleştirildiğinde mesaj önerisi alabilirsiniz;
              öneriler otomatik gönderilmez.
            </p>
            <button type="button" className="comm-btn-primary" onClick={() => setShowAiInfo(false)}>
              Tamam
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export { recipientKey };
