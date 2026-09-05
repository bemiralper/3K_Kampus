"use client";

import { KeyboardEvent, RefObject, useRef, useState } from "react";
import {
  applyWhatsAppFormat,
  FORMAT_SHORTCUT_HINTS,
  formatShortcutAction,
  insertAtCursor,
  type WhatsAppFormatAction,
} from "./composer-utils";
import EmojiPickerPortal from "./EmojiPickerPortal";
import FormatShortcutHelp from "./FormatShortcutHelp";

interface WhatsAppFormatBarProps {
  value: string;
  onChange: (value: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  disabled?: boolean;
}

const TOOLS: Array<{
  id: string;
  icon: string;
  label: string;
  action: WhatsAppFormatAction | "emoji";
  className?: string;
}> = [
  { id: "emoji", icon: "😊", label: "Emoji", action: "emoji" },
  { id: "bold", icon: "B", label: `Kalın (*metin*) · ${FORMAT_SHORTCUT_HINTS.bold}`, action: { kind: "wrap", marker: "*" }, className: "bold" },
  { id: "italic", icon: "I", label: `İtalik (_metin_) · ${FORMAT_SHORTCUT_HINTS.italic}`, action: { kind: "wrap", marker: "_" }, className: "italic" },
  { id: "strike", icon: "S", label: `Üstü çizili (~metin~) · ${FORMAT_SHORTCUT_HINTS.strike}`, action: { kind: "wrap", marker: "~" }, className: "strike" },
  { id: "mono", icon: "M", label: `Monospace (\`\`\`metin\`\`\`) · ${FORMAT_SHORTCUT_HINTS.mono}`, action: { kind: "wrap", marker: "```" }, className: "mono" },
  { id: "code", icon: "</>", label: `Satır içi kod (\`metin\`) · ${FORMAT_SHORTCUT_HINTS.code}`, action: { kind: "wrap", marker: "`" }, className: "mono" },
  { id: "quote", icon: "❝", label: `Alıntı (> metin) · ${FORMAT_SHORTCUT_HINTS.quote}`, action: { kind: "prefix", style: "quote" } },
  { id: "bullet", icon: "•", label: `Madde listesi · ${FORMAT_SHORTCUT_HINTS.bullet}`, action: { kind: "prefix", style: "bullet" } },
  { id: "number", icon: "1.", label: `Numaralı liste · ${FORMAT_SHORTCUT_HINTS.number}`, action: { kind: "prefix", style: "number" } },
];

export function applyFormatKeydown(
  e: KeyboardEvent<HTMLTextAreaElement>,
  value: string,
  onChange: (value: string) => void,
) {
  const action = formatShortcutAction(e);
  if (!action) return false;
  e.preventDefault();
  const el = e.currentTarget;
  const result = applyWhatsAppFormat(value, el.selectionStart, el.selectionEnd, action);
  onChange(result.text);
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(result.cursor, result.cursor);
  });
  return true;
}

export default function WhatsAppFormatBar({
  value,
  onChange,
  textareaRef,
  disabled = false,
}: WhatsAppFormatBarProps) {
  const [showEmoji, setShowEmoji] = useState(false);
  const emojiTriggerRef = useRef<HTMLButtonElement>(null);

  const apply = (action: WhatsAppFormatAction) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const result = applyWhatsAppFormat(value, start, end, action);
    onChange(result.text);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(result.cursor, result.cursor);
    });
  };

  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const result = insertAtCursor(value, start, end, emoji);
    onChange(result.text);
    setShowEmoji(false);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(result.cursor, result.cursor);
    });
  };

  return (
    <div className="comm-compose-toolbar-group tg-wa-format" role="toolbar" aria-label="WhatsApp biçimlendirme">
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          ref={tool.id === "emoji" ? emojiTriggerRef : undefined}
          type="button"
          className={`comm-toolbar-btn${tool.className ? ` ${tool.className}` : ""}${tool.id === "emoji" && showEmoji ? " active" : ""}`}
          title={tool.label}
          aria-label={tool.label}
          disabled={disabled}
          onClick={() => {
            if (tool.action === "emoji") {
              setShowEmoji((open) => !open);
              return;
            }
            apply(tool.action);
          }}
        >
          {tool.icon}
        </button>
      ))}
      <FormatShortcutHelp />
      <EmojiPickerPortal
        open={showEmoji}
        onClose={() => setShowEmoji(false)}
        onSelect={insertEmoji}
        triggerRef={emojiTriggerRef}
        width={280}
        height={320}
      />
    </div>
  );
}
