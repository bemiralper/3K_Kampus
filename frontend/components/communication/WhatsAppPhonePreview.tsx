"use client";

import {
  parseWhatsAppPreviewLines,
  parseWhatsAppText,
  PreviewFontSize,
  PreviewSampleContext,
  resolvePreviewVariables,
} from "./composer-utils";
import { useLivePreviewContext } from "./useLivePreviewContext";

export interface PreviewAttachment {
  id: string;
  original_name: string;
  mime_type: string;
}

interface WhatsAppPhonePreviewProps {
  text: string;
  kurumName?: string;
  previewColor?: string;
  fontSize?: PreviewFontSize;
  attachments?: PreviewAttachment[];
  resolveVariables?: boolean;
  /** Ek önizleme değişkenleri (mesaj vb.) — kurum/şube canlı bağlamdan gelir. */
  previewContext?: PreviewSampleContext;
  className?: string;
}

function renderSegment(
  seg: ReturnType<typeof parseWhatsAppText>[number],
  key: number,
) {
  switch (seg.type) {
    case "bold":
      return <strong key={key} className="wa-bold">{seg.content}</strong>;
    case "italic":
      return <em key={key} className="wa-italic">{seg.content}</em>;
    case "strike":
      return <span key={key} className="wa-strike">{seg.content}</span>;
    case "mono":
      return <code key={key} className="wa-mono">{seg.content}</code>;
    case "code":
      return <code key={key} className="wa-code">{seg.content}</code>;
    case "variable":
      return <span key={key} className="wa-var">{seg.content}</span>;
    default:
      return <span key={key}>{seg.content}</span>;
  }
}

function attachmentIcon(mime: string): string {
  if (mime.startsWith("image/")) return "🖼";
  if (mime.includes("pdf")) return "📄";
  return "📎";
}

export default function WhatsAppPhonePreview({
  text,
  kurumName,
  previewColor,
  fontSize = "normal",
  attachments = [],
  resolveVariables = true,
  previewContext,
  className = "",
}: WhatsAppPhonePreviewProps) {
  const liveContext = useLivePreviewContext(previewContext);
  const headerName = kurumName?.trim() || liveContext.kurum_ad || "Kurum";
  const displayText = resolveVariables
    ? resolvePreviewVariables(text, liveContext)
    : text;
  const lines = parseWhatsAppPreviewLines(displayText);
  const time = new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className={`comm-wa-phone-frame ${className}`}>
      <div className="comm-wa-phone-header">
        <span className="comm-wa-phone-back" aria-hidden="true">‹</span>
        <div className="comm-wa-phone-header-info">
          <span className="comm-wa-phone-avatar" aria-hidden="true">🏫</span>
          <div>
            <strong>{headerName}</strong>
            <span className="comm-wa-phone-status">çevrimiçi</span>
          </div>
        </div>
      </div>
      <div className="comm-wa-phone-body">
        <div
          className="comm-wa-bubble"
          style={previewColor ? { backgroundColor: previewColor } : undefined}
        >
          <p className={`comm-wa-bubble-text size-${fontSize}`}>
            {displayText.trim() ? (
              lines.map((line, i) => (
                <span key={i} className={`wa-line wa-line-${line.block}`}>
                  {line.block === "bullet" || line.block === "number" ? (
                    <span className="wa-line-mark">{line.marker}</span>
                  ) : null}
                  {line.segments.map((seg, j) => renderSegment(seg, j))}
                </span>
              ))
            ) : (
              <span className="comm-wa-placeholder">Mesajınız burada görünecek…</span>
            )}
          </p>
          {attachments.map((att) => (
            <div key={att.id} className="comm-wa-attachment-card">
              <span className="comm-wa-attachment-icon" aria-hidden="true">
                {attachmentIcon(att.mime_type)}
              </span>
              <span className="comm-wa-attachment-name">{att.original_name}</span>
            </div>
          ))}
          <div className="comm-wa-bubble-meta">
            <span>{time}</span>
            <span className="comm-wa-checks" aria-hidden="true">✓✓</span>
          </div>
        </div>
      </div>
    </div>
  );
}
