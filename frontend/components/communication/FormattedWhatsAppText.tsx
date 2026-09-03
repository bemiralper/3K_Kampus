"use client";

import { ReactNode } from "react";

import { WhatsAppSegment, parseWhatsAppPreviewLines } from "./composer-utils";

function renderSegment(seg: WhatsAppSegment, key: number): ReactNode {
  if (seg.type === "bold") return <strong key={key}>{seg.content}</strong>;
  if (seg.type === "italic") return <em key={key}>{seg.content}</em>;
  if (seg.type === "strike") return <s key={key}>{seg.content}</s>;
  if (seg.type === "mono" || seg.type === "code") {
    return (
      <code key={key} className="comm-bubble-mono">
        {seg.content}
      </code>
    );
  }
  if (seg.type === "variable") {
    return (
      <span key={key} className="comm-bubble-var">
        {seg.content}
      </span>
    );
  }
  return <span key={key}>{seg.content}</span>;
}

/**
 * WhatsApp metnini biçimlendirerek gösterir.
 *
 * Satır içi işaretleyicilerin (`*kalın*`, `_italik_`, …) yanı sıra araç
 * çubuğunun ürettiği satır bloklarını (`> alıntı`, `- madde`, `1. numara`) da
 * render eder; aksi hâlde bu işaretler baloncukta ham metin olarak görünürdü.
 */
export default function FormattedWhatsAppText({ text }: { text: string }) {
  const lines = parseWhatsAppPreviewLines(text);
  const hasBlocks = lines.some((line) => line.block !== "none");

  // Tek satırlık düz metinde ekstra sarmalayıcı üretme — mevcut baloncuk
  // yerleşimleri (satır içi zaman damgası vb.) bozulmasın.
  if (!hasBlocks && lines.length === 1) {
    return <>{lines[0].segments.map(renderSegment)}</>;
  }

  return (
    <>
      {lines.map((line, i) => (
        <span key={i} className={`wa-line wa-line-${line.block}`}>
          {line.block === "bullet" || line.block === "number" ? (
            <span className="wa-line-mark">{line.marker}</span>
          ) : null}
          {line.segments.length ? line.segments.map(renderSegment) : "\u00a0"}
        </span>
      ))}
    </>
  );
}
