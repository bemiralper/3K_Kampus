"use client";

import { MessageItem } from "@/lib/communication-api";
import { resolveCoachPhotoUrl } from "@/lib/coach-media";
import FormattedWhatsAppText from "./FormattedWhatsAppText";

interface MessageBubbleContentProps {
  msg: MessageItem;
  compactMedia?: boolean;
}

function isImageAttachment(mime?: string, messageType?: string) {
  if (mime?.startsWith("image/")) return true;
  return messageType === "IMAGE";
}

function isFilenameOnlyBody(body: string, attachments: MessageItem["attachments"]) {
  if (!attachments?.length) return false;
  const names = attachments.map((a) => a.original_name).filter(Boolean);
  return names.some((name) => body.trim() === name.trim());
}

export default function MessageBubbleContent({ msg, compactMedia = false }: MessageBubbleContentProps) {
  const attachments = msg.attachments ?? [];
  const showBody =
    msg.body &&
    (!isFilenameOnlyBody(msg.body, attachments) ||
      msg.message_type === "TEXT" ||
      (msg.body.trim() && !attachments.length));

  return (
    <>
      {attachments.map((att) => {
        const url = resolveCoachPhotoUrl(att.file_url) || att.file_url;
        if (isImageAttachment(att.mime_type, msg.message_type)) {
          return (
            <div key={att.id} className="comm-thread-bubble-media">
              {url ? (
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <img
                    src={url}
                    alt={att.original_name || "Görsel"}
                    className={`comm-thread-bubble-image${compactMedia ? " comm-thread-bubble-image--compact" : ""}`}
                    loading="lazy"
                  />
                </a>
              ) : (
                <span className="comm-thread-bubble-doc">{att.original_name || "Görsel"}</span>
              )}
            </div>
          );
        }
        return (
          <a
            key={att.id}
            href={url || "#"}
            className="comm-thread-bubble-document"
            target="_blank"
            rel="noopener noreferrer"
            download={att.original_name}
          >
            <span className="comm-thread-bubble-doc-icon" aria-hidden="true">
              📄
            </span>
            <span className="comm-thread-bubble-doc-name">{att.original_name || "Dosya"}</span>
          </a>
        );
      })}
      {showBody && (
        <p>
          <FormattedWhatsAppText text={msg.body} />
        </p>
      )}
    </>
  );
}
