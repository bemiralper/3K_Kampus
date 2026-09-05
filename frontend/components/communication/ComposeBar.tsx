"use client";

import { useCallback, useRef, useState } from "react";
import type { ComposerState } from "./composer-utils";
import {
  plainTextFromComposer,
  resolveTemplateBodyForConversation,
} from "./composer-utils";
import MessageComposer, { createComposerState } from "./MessageComposer";
import TemplatePickerDrawer from "./TemplatePickerDrawer";
import type { ConversationListItem, MessageItem, MessageTemplateItem } from "@/lib/communication-api";
import { recordTemplateUsage } from "@/lib/communication-api";

const ACCEPT_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const ACCEPT_EXT = new Set([".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png", ".webp"]);
const FILE_ACCEPT = "image/jpeg,image/png,image/webp,.pdf,.doc,.docx";

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
  /** 24 saatlik pencere kapalı — onaylı şablon seçicisini aç */
  onOpenMetaTemplates?: () => void;
}

function remainingLabel(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  if (hours >= 1) return `${hours} saat kaldı`;
  const minutes = Math.max(1, Math.floor(seconds / 60));
  return `${minutes} dk kaldı`;
}

function replyLabel(msg: MessageItem): string {
  if (msg.body?.trim()) return msg.body.slice(0, 100);
  if (msg.attachments?.length) {
    const att = msg.attachments[0];
    return att.mime_type?.startsWith("image/") ? "Görsel" : att.original_name || "Dosya";
  }
  return "Mesaj";
}

function isAcceptedFile(file: File): boolean {
  if (ACCEPT_MIME.has(file.type)) return true;
  const lower = file.name.toLowerCase();
  return [...ACCEPT_EXT].some((ext) => lower.endsWith(ext));
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
  onOpenMetaTemplates,
}: ComposeBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const session = conversation?.session ?? null;

  const applyFile = useCallback((file: File | null | undefined) => {
    if (!file || !isAcceptedFile(file)) return;
    setAttachmentFile(file);
  }, []);

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

  const onDragEnter = (e: React.DragEvent) => {
    if (disabled || sending) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    if (e.dataTransfer.types.includes("Files")) setDragOver(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragOver(false);
  };

  const onDragOver = (e: React.DragEvent) => {
    if (disabled || sending) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setDragOver(false);
    if (disabled || sending) return;
    const file = e.dataTransfer.files?.[0];
    applyFile(file);
  };

  return (
    <>
      <footer
        className={`comm-compose-bar${inboxMode ? " comm-compose-bar--inbox" : ""}${dragOver ? " comm-compose-bar--dragover" : ""}`}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {dragOver && (
          <div className="comm-compose-drop-hint" aria-hidden="true">
            Dosyayı buraya bırakın
          </div>
        )}
        {session && session.state !== "NA" && (
          <div
            className={`comm-session-bar${session.is_open ? " is-open" : " is-closed"}`}
            role="status"
          >
            <span
              className="comm-session-dot"
              aria-hidden="true"
              title={
                session.is_open
                  ? `Serbest mesaj penceresi ${
                      session.seconds_left > 0 ? remainingLabel(session.seconds_left) : "kısa süre"
                    } sonra kapanır. Kişi yazınca süre yeniden 24 saate döner.`
                  : "24 saatlik yanıt penceresi kapandı. Kişi son 24 saatte yazmadıysa yalnızca Meta onaylı şablon gönderilebilir; yanıt gelince pencere yeniden açılır."
              }
            />
            <span className="comm-session-label">
              {session.is_open
                ? session.seconds_left > 0
                  ? remainingLabel(session.seconds_left)
                  : "Pencere açık"
                : "24 saatlik yanıt penceresi kapandı"}
            </span>
            {!session.is_open && onOpenMetaTemplates && (
              <button
                type="button"
                className="comm-session-action"
                onClick={onOpenMetaTemplates}
              >
                Şablon seç
              </button>
            )}
          </div>
        )}
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
          accept={FILE_ACCEPT}
          style={{ display: "none" }}
          onChange={(e) => applyFile(e.target.files?.[0])}
        />
        <button
          type="button"
          className="comm-compose-icon-btn"
          onClick={openFilePicker}
          disabled={sending || disabled}
          aria-label="Dosya ekle"
          title="Dosya ekle veya sürükleyip bırakın"
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
            placeholder="Mesaj yazın… (dosya sürükleyebilirsiniz)"
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
