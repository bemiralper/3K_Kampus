"use client";

import { parseWhatsAppText } from "./composer-utils";

export default function FormattedWhatsAppText({ text }: { text: string }) {
  const segments = parseWhatsAppText(text);
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === "bold") {
          return <strong key={i}>{seg.content}</strong>;
        }
        if (seg.type === "italic") {
          return <em key={i}>{seg.content}</em>;
        }
        if (seg.type === "strike") {
          return <s key={i}>{seg.content}</s>;
        }
        if (seg.type === "mono") {
          return (
            <code key={i} className="comm-bubble-mono">
              {seg.content}
            </code>
          );
        }
        if (seg.type === "variable") {
          return (
            <span key={i} className="comm-bubble-var">
              {seg.content}
            </span>
          );
        }
        return <span key={i}>{seg.content}</span>;
      })}
    </>
  );
}
