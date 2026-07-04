"use client";

import { useRef, useState } from "react";
import type { ComposerState } from "./composer-utils";
import {
  plainTextFromComposer,
  resolveTemplateBodyForConversation,
} from "./composer-utils";
import MessageComposer, { createComposerState } from "./MessageComposer";
import TemplatePickerDrawer from "./TemplatePickerDrawer";
import type { ConversationListItem, MessageItem, MessageTemplateItem } from "@/lib/communication-api";
import { recordTemplateUsage } from "@/lib/communication-api";

interface ComposeBarProps {
  value: ComposerState;
  onChange: (state: ComposerState) => void;
  onSend: (plainText: string, attachmentFile?: File) => void;
  sending?: boolean;
  disabled?: boolean;
  inboxMode?: boolean;
  conversation?: ConversationListItem | null;
  replyTo?: MessageItem | null;
  onClearReply?: () => void;
}

function replyLabel(msg: MessageItem): string {
  if (msg.body?.trim()) return msg.body.slice(0, 100);
  if (msg.attachments?.length) {
    const att = msg.attachments[0];
    return att.mime_type?.startsWith("image/") ? "Görsel" : att.original_name || "Dosya";
  }
  return "Mesaj";
}

export default function ComposeBar({
  value,
  onChange,
  onSend,
  sending = false,
  disabled = false,
  inboxMode = false,
  conversation = null,
  replyTo = null,
  onClearReply,
}: ComposeBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const handleSend = () => {
    const text = plainTextFromComposer(value);
    if ((!text && !attachmentFile) || sending || disabled) return;
    onSend(text, attachmentFile || undefined);
    setAttachmentFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleTemplateSelect = (template: MessageTemplateItem) => {
    const resolved = resolveTemplateBodyForConversation(template.body, conversation);
    onChange(createComposerState(resolved));
    recordTemplateUsage(template.id).catch(() => {});
  };

  const openFilePicker = () => fileInputRef.current?.click();

  return (
    <>
      <footer className={`comm-compose-bar${inboxMode ? " comm-compose-bar--inbox" : ""}`}>
        {replyTo && (
          <div className="comm-compose-reply-bar">
            <div className="comm-compose-reply-content">
              <strong>Yanıt: {replyTo.direction === "OUTBOUND" ? "Siz" : "Karşı taraf"}</strong>
              <span>{replyLabel(replyTo)}</span>
            </div>
            <button
              type="button"
              className="comm-compose-reply-close"
              onClick={onClearReply}
              aria-label="Yanıtı iptal et"
            >
              ×
            </button>
          </div>
        )}
        <div className="comm-compose-row">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,.pdf,.doc,.docx"
          style={{ display: "none" }}
          onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)}
        />
        <button
          type="button"
          className="comm-compose-icon-btn"
          onClick={openFilePicker}
          disabled={sending || disabled}
          aria-label="Dosya ekle"
          title="Dosya ekle"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        <div className="comm-compose-input-stack">
          {attachmentFile && (
            <div className="comm-compose-attachment-chip">
              <span className="comm-compose-attachment-name" title={attachmentFile.name}>
                {attachmentFile.name}
              </span>
              <button
                type="button"
                className="comm-compose-attachment-remove"
                onClick={() => {
                  setAttachmentFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                aria-label="Dosyayı kaldır"
              >
                ×
              </button>
            </div>
          )}
          <MessageComposer
            value={value}
            onChange={onChange}
            onSend={handleSend}
            compact
            inboxMode={inboxMode}
            showPreview={false}
            disabled={disabled}
            loading={sending}
            placeholder="Mesaj yazın…"
            onOpenTemplates={inboxMode ? () => setTemplatesOpen(true) : undefined}
            onAttachClick={openFilePicker}
            allowSendWithoutText={!!attachmentFile}
          />
        </div>
        <button
          type="button"
          className="comm-send-btn"
          onClick={handleSend}
          disabled={sending || disabled || (!plainTextFromComposer(value) && !attachmentFile)}
          aria-label="Mesaj gönder"
        >
          {sending ? (
            <span className="comm-send-spinner" aria-hidden="true" />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          )}
        </button>
        </div>
      </footer>

      {inboxMode && (
        <TemplatePickerDrawer
          open={templatesOpen}
          onClose={() => setTemplatesOpen(false)}
          onSelect={handleTemplateSelect}
          readOnly
          inboxMode
        />
      )}
    </>
  );
}
