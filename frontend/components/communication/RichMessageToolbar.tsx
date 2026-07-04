"use client";

import { RefObject, useCallback, useRef, useState } from "react";
import {
  ComposerState,
  insertAtCursor,
  TEMPLATE_VARIABLES,
  wrapSelection,
} from "./composer-utils";
import EmojiPickerPortal from "./EmojiPickerPortal";

interface RichMessageToolbarProps {
  composerState: ComposerState;
  onChange: (state: ComposerState) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onOpenTemplates?: () => void;
  onOpenAi?: () => void;
  onAttachClick?: () => void;
  aiEnabled?: boolean;
  readOnlyTemplates?: boolean;
  compact?: boolean;
}

type ToolDef = {
  id: string;
  icon: string;
  label: string;
  action: () => void;
  group: "format" | "media" | "extra";
};

export default function RichMessageToolbar({
  composerState,
  onChange,
  textareaRef,
  onOpenTemplates,
  onOpenAi,
  onAttachClick,
  aiEnabled = false,
  readOnlyTemplates = false,
  compact = false,
}: RichMessageToolbarProps) {
  const [showEmoji, setShowEmoji] = useState(false);
  const emojiTriggerRef = useRef<HTMLButtonElement>(null);

  const getSelection = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return { start: composerState.text.length, end: composerState.text.length };
    return { start: el.selectionStart, end: el.selectionEnd };
  }, [composerState.text.length, textareaRef]);

  const applyWrap = (marker: string) => {
    const { start, end } = getSelection();
    const result = wrapSelection(composerState.text, start, end, marker);
    onChange({ ...composerState, text: result.text });
    setTimeout(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(result.cursor, result.cursor);
      }
    }, 0);
  };

  const insertToken = (token: string) => {
    const { start, end } = getSelection();
    const result = insertAtCursor(composerState.text, start, end, token);
    onChange({ ...composerState, text: result.text });
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const formatTools: ToolDef[] = [
    {
      id: "emoji",
      icon: "😊",
      label: "Emoji",
      group: "format",
      action: () => setShowEmoji((v) => !v),
    },
    { id: "bold", icon: "B", label: "Kalın (*metin*)", group: "format", action: () => applyWrap("*") },
    { id: "italic", icon: "I", label: "İtalik (_metin_)", group: "format", action: () => applyWrap("_") },
    { id: "strike", icon: "S", label: "Üstü çizili (~metin~)", group: "format", action: () => applyWrap("~") },
    { id: "mono", icon: "M", label: "Monospace (```metin```)", group: "format", action: () => applyWrap("```") },
  ];

  const mediaTools: ToolDef[] = [
    { id: "attach", icon: "📎", label: "Dosya ekle", group: "media", action: () => onAttachClick?.() },
    { id: "image", icon: "🖼", label: "Resim (aşağıdaki alan)", group: "media", action: () => {} },
    { id: "pdf", icon: "📄", label: "PDF (aşağıdaki alan)", group: "media", action: () => {} },
    { id: "link", icon: "🔗", label: "Link ekle", group: "media", action: () => insertToken(" https://") },
  ];

  const extraTools: ToolDef[] = [
    {
      id: "template",
      icon: "📋",
      label: readOnlyTemplates ? "Hazır yanıt seç" : "Hazır yanıt",
      group: "extra",
      action: () => onOpenTemplates?.(),
    },
    { id: "ai", icon: "🤖", label: aiEnabled ? "AI öneri" : "AI (kapalı)", group: "extra", action: () => onOpenAi?.() },
  ];

  const groups = compact
    ? (["format", "extra"] as const)
    : (["format", "media", "extra"] as const);

  const tools = compact
    ? [
        ...formatTools,
        ...(onAttachClick
          ? [{ id: "attach", icon: "📎", label: "Dosya ekle", group: "format" as const, action: () => onAttachClick() }]
          : []),
        ...extraTools.filter((t) => t.id === "template"),
      ]
    : [...formatTools, ...mediaTools, ...extraTools];

  return (
    <div className={`comm-rich-toolbar${compact ? " comm-rich-toolbar--compact" : ""}`}>
      <div className="comm-rich-toolbar-groups">
        {groups.map((group) => (
          <div key={group} className="comm-rich-toolbar-group">
            {tools.filter((t) => t.group === group).map((tool) => (
              <button
                key={tool.id}
                ref={tool.id === "emoji" ? emojiTriggerRef : undefined}
                type="button"
                className={`comm-rich-tool${tool.id === "bold" ? " bold" : ""}${tool.id === "italic" ? " italic" : ""}${tool.id === "strike" ? " strike" : ""}${tool.id === "mono" ? " mono" : ""}${tool.id === "ai" && !aiEnabled ? " disabled" : ""}${tool.id === "emoji" && showEmoji ? " active" : ""}`}
                title={tool.label}
                aria-label={tool.label}
                aria-expanded={tool.id === "emoji" ? showEmoji : undefined}
                onClick={tool.action}
                disabled={
                  tool.id === "ai" && !aiEnabled
                    ? true
                    : !compact && (tool.id === "image" || tool.id === "pdf")
                }
              >
                {tool.icon}
              </button>
            ))}
          </div>
        ))}
      </div>

      <EmojiPickerPortal
        open={showEmoji}
        onClose={() => setShowEmoji(false)}
        onSelect={insertToken}
        triggerRef={emojiTriggerRef}
        width={compact ? 280 : 320}
        height={compact ? 320 : 360}
      />

      {!compact && (
      <div className="comm-var-chips">
        {TEMPLATE_VARIABLES.map((v) => (
          <button
            key={v.key}
            type="button"
            className="comm-var-chip"
            onClick={() => insertToken(v.token)}
            title={`${v.label} — ${v.token}`}
          >
            <span className="comm-var-chip-label">{v.label}</span>
            <code className="comm-var-chip-token">{v.token}</code>
          </button>
        ))}
      </div>
      )}
    </div>
  );
}
