"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AttachmentDropZone from "./AttachmentDropZone";
import RecipientsSummaryPanel from "./RecipientsSummaryPanel";
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
  AudienceFilter,
  CampaignAttachmentItem,
  CampaignPreviewStats,
  confirmCampaign,
  createCampaign,
  MessageTemplateItem,
  previewCampaign,
  resolveRecipients,
  SendMode,
} from "@/lib/communication-api";

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

  const body = plainTextFromComposer(composerState);

  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    setError(null);
    try {
      const stats = await previewCampaign(audienceFilter, {
        attachmentCount: attachments.length,
        aiUsed,
      });
      const resolved = await resolveRecipients(audienceFilter);
      setPreview({ ...stats, recipients: resolved.recipients });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Önizleme alınamadı");
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [audienceFilter, attachments.length, aiUsed]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  const handleTemplateSelect = (template: MessageTemplateItem) => {
    onComposerChange({ ...composerState, text: template.body });
    if (template.name) onTitleChange(template.name);
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
        audience_filter: audienceFilter,
        attachment_ids: attachments.map((a) => a.id),
        scheduled_at: scheduledIso,
        save_as_template: saveAsTemplate,
        draft_only: saveAsDraft,
        send_options: saveAsDraft ? { draft: true } : undefined,
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

  return (
    <div className="comm-bulk-studio">
      {error && <div className="comm-alert comm-alert-danger">{error}</div>}

      <div className="comm-studio-grid">
        <RecipientsSummaryPanel
          preview={preview}
          audienceType={audienceType}
          loading={previewLoading}
          onRefresh={loadPreview}
        />

        <main className="comm-studio-center">
          <div className="comm-card">
            <div className="comm-form-grid">
              <div className="comm-form-field">
                <label htmlFor="studio-title">Kampanya başlığı</label>
                <input
                  id="studio-title"
                  type="text"
                  value={title}
                  onChange={(e) => onTitleChange(e.target.value)}
                  placeholder="Örn: Nisan duyurusu"
                />
              </div>
              <MetaTemplateSelect
                value={templateName}
                onChange={(name, language) => {
                  onTemplateNameChange(name);
                  if (language && onTemplateLanguageChange) {
                    onTemplateLanguageChange(language);
                  }
                }}
              />
            </div>
          </div>

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

          <div className="comm-studio-actions">
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

      <SendConfirmModal
        open={showConfirm}
        preview={preview}
        title={title}
        body={body}
        attachments={previewAttachments}
        aiUsed={aiUsed}
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
