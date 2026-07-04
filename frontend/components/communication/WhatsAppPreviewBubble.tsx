"use client";

import { parseWhatsAppText, PreviewFontSize } from "./composer-utils";

interface WhatsAppPreviewBubbleProps {
  text: string;
  previewColor?: string;
  fontSize?: PreviewFontSize;
  timestamp?: string;
  className?: string;
}

function renderSegment(
  seg: ReturnType<typeof parseWhatsAppText>[number],
  key: number,
) {
  switch (seg.type) {
    case "bold":
      return (
        <strong key={key} className="wa-bold">
          {seg.content}
        </strong>
      );
    case "italic":
      return (
        <em key={key} className="wa-italic">
          {seg.content}
        </em>
      );
    case "strike":
      return (
        <span key={key} className="wa-strike">
          {seg.content}
        </span>
      );
    case "mono":
      return (
        <code key={key} className="wa-mono">
          {seg.content}
        </code>
      );
    case "variable":
      return (
        <span key={key} className="wa-var">
          {seg.content}
        </span>
      );
    default:
      return <span key={key}>{seg.content}</span>;
  }
}

export default function WhatsAppPreviewBubble({
  text,
  previewColor,
  fontSize = "normal",
  timestamp,
  className = "",
}: WhatsAppPreviewBubbleProps) {
  const segments = parseWhatsAppText(text);
  const displayTime =
    timestamp ||
    new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className={`comm-wa-preview ${className}`}>
      <div className="comm-wa-preview-label">WhatsApp Önizleme</div>
      <div className="comm-wa-phone-mock">
        <div
          className="comm-wa-bubble"
          style={previewColor ? { backgroundColor: previewColor } : undefined}
        >
          <p className={`comm-wa-bubble-text size-${fontSize}`}>
            {text.trim() ? (
              segments.map((seg, i) => renderSegment(seg, i))
            ) : (
              <span style={{ color: "#94a3b8", fontStyle: "italic" }}>
                Mesajınız burada görünecek…
              </span>
            )}
          </p>
          <div className="comm-wa-bubble-meta">
            <span>{displayTime}</span>
            <span className="comm-wa-checks" aria-hidden="true">
              ✓✓
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
