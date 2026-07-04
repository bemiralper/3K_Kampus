"use client";

import { MessageItem, formatMessageStatus } from "@/lib/communication-api";
import MessageBubbleContent from "./MessageBubbleContent";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

interface MessageThreadBubbleProps {
  msg: MessageItem;
  isActive: boolean;
  formatTime: (iso: string) => string;
  onSelect: (msg: MessageItem) => void;
  onReply: (msg: MessageItem) => void;
  onReact: (msg: MessageItem, emoji: string) => void;
}

function replyPreviewText(msg: Pick<MessageItem, "body" | "attachments">): string {
  if (msg.body && msg.body.trim()) return msg.body.slice(0, 80);
  if (msg.attachments?.length) {
    const att = msg.attachments[0];
    if (att.mime_type?.startsWith("image/")) return "Görsel";
    return att.original_name || "Dosya";
  }
  return "Mesaj";
}

export default function MessageThreadBubble({
  msg,
  isActive,
  formatTime,
  onSelect,
  onReply,
  onReact,
}: MessageThreadBubbleProps) {
  const groupedReactions = (msg.reactions ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.emoji] = (acc[r.emoji] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div
      className={`comm-thread-bubble-wrap ${
        msg.direction === "OUTBOUND" ? "outbound" : "inbound"
      }${isActive ? " active" : ""}`}
    >
      <div
        className="comm-thread-bubble"
        role="button"
        tabIndex={0}
        onClick={() => onSelect(msg)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(msg);
          }
        }}
      >
        {msg.reply_to && (
          <div className="comm-thread-reply-quote">
            <span className="comm-thread-reply-quote-bar" aria-hidden="true" />
            <div>
              <strong>{msg.reply_to.direction === "OUTBOUND" ? "Siz" : "Karşı taraf"}</strong>
              <p>{replyPreviewText(msg.reply_to)}</p>
            </div>
          </div>
        )}
        <MessageBubbleContent msg={msg} compactMedia />
        <div className="comm-thread-bubble-meta">
          {formatTime(msg.created_at)}
          {msg.direction === "OUTBOUND" && msg.status && (
            <span> · {formatMessageStatus(msg.status)}</span>
          )}
        </div>
      </div>

      {Object.keys(groupedReactions).length > 0 && (
        <div className="comm-thread-reactions-display">
          {Object.entries(groupedReactions).map(([emoji, count]) => (
            <button
              key={emoji}
              type="button"
              className="comm-thread-reaction-chip"
              onClick={() => onReact(msg, emoji)}
              title="Reaksiyon"
            >
              {emoji}{count > 1 ? ` ${count}` : ""}
            </button>
          ))}
        </div>
      )}

      {isActive && (
        <div className="comm-thread-message-actions">
          <button type="button" onClick={() => onReply(msg)}>
            Yanıtla
          </button>
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="comm-thread-reaction-btn"
              onClick={() => onReact(msg, emoji)}
              aria-label={`${emoji} reaksiyonu`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export { QUICK_REACTIONS };
