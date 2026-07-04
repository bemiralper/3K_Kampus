"use client";

import {
  KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ComposerState,
  createComposerState,
  insertAtCursor,
  messageSegments,
  plainTextFromComposer,
  PreviewFontSize,
  TEMPLATE_VARIABLES,
  WHATSAPP_MAX_LENGTH,
  wrapSelection,
} from "./composer-utils";
import WhatsAppPreviewBubble from "./WhatsAppPreviewBubble";
import RichMessageToolbar from "./RichMessageToolbar";
import "./communication.css";

import EmojiPickerPortal from "./EmojiPickerPortal";

export type { ComposerState };
export { plainTextFromComposer, createComposerState };

const PREVIEW_COLORS = [
  { label: "Varsayılan", value: "" },
  { label: "Yeşil", value: "#dcf8c6" },
  { label: "Mavi", value: "#d9fdd3" },
  { label: "Sarı", value: "#fff9c4" },
  { label: "Pembe", value: "#fce4ec" },
];

interface MessageComposerProps {
  value: ComposerState | string;
  onChange: (state: ComposerState) => void;
  onSend?: () => void;
  placeholder?: string;
  maxLength?: number;
  showPreview?: boolean;
  compact?: boolean;
  inboxMode?: boolean;
  disabled?: boolean;
  loading?: boolean;
  id?: string;
  onOpenTemplates?: () => void;
  onAttachClick?: () => void;
  allowSendWithoutText?: boolean;
}

function normalizeValue(value: ComposerState | string): ComposerState {
  return typeof value === "string" ? createComposerState(value) : value;
}

export default function MessageComposer({
  value,
  onChange,
  onSend,
  placeholder = "Mesajınızı yazın…",
  maxLength = WHATSAPP_MAX_LENGTH,
  showPreview = true,
  compact = false,
  inboxMode = false,
  disabled = false,
  loading = false,
  id = "message-composer",
  onOpenTemplates,
  onAttachClick,
  allowSendWithoutText = false,
}: MessageComposerProps) {
  const state = normalizeValue(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showVars, setShowVars] = useState(false);
  const emojiTriggerRef = useRef<HTMLButtonElement>(null);
  const varsRef = useRef<HTMLDivElement>(null);

  const update = useCallback(
    (patch: Partial<ComposerState>) => {
      onChange({ ...state, ...patch });
    },
    [onChange, state],
  );

  const applyFormat = (marker: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart, selectionEnd } = el;
    const result = wrapSelection(state.text, selectionStart, selectionEnd, marker);
    update({ text: result.text });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(result.cursor, result.cursor);
    });
  };

  const insertToken = (token: string) => {
    const el = textareaRef.current;
    if (!el) {
      update({ text: state.text + token });
      return;
    }
    const result = insertAtCursor(state.text, el.selectionStart, el.selectionEnd, token);
    update({ text: result.text });
    setShowVars(false);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(result.cursor, result.cursor);
    });
  };

  const handleEmojiSelect = (emoji: string) => {
    insertToken(emoji);
    setShowEmoji(false);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (varsRef.current && !varsRef.current.contains(e.target as Node)) {
        setShowVars(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const charCount = state.text.length;
  const overLimit = charCount > maxLength;
  const segments = messageSegments(charCount);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (onSend && e.key === "Enter" && !e.shiftKey && compact) {
      e.preventDefault();
      if (!disabled && !loading && (state.text.trim() || allowSendWithoutText)) onSend();
    }
  };

  const composer = (
    <div
      className={`comm-compose-wrap${compact ? " compact" : ""}${inboxMode ? " inbox-mode" : ""}${disabled || loading ? " disabled" : ""}`}
    >
      {inboxMode ? (
        <RichMessageToolbar
          compact
          composerState={state}
          onChange={onChange}
          textareaRef={textareaRef}
          onOpenTemplates={onOpenTemplates}
          onAttachClick={onAttachClick}
          readOnlyTemplates
        />
      ) : (
      <div className="comm-compose-toolbar" role="toolbar" aria-label="Mesaj biçimlendirme">
        <div className="comm-compose-toolbar-group">
          <button
            type="button"
            className="comm-toolbar-btn"
            aria-label="Kalın"
            title="Kalın (*metin*)"
            disabled={disabled || loading}
            onClick={() => applyFormat("*")}
          >
            B
          </button>
          <button
            type="button"
            className="comm-toolbar-btn"
            aria-label="İtalik"
            title="İtalik (_metin_)"
            disabled={disabled || loading}
            onClick={() => applyFormat("_")}
            style={{ fontStyle: "italic" }}
          >
            I
          </button>
          <button
            type="button"
            className="comm-toolbar-btn"
            aria-label="Üstü çizili"
            title="Üstü çizili (~metin~)"
            disabled={disabled || loading}
            onClick={() => applyFormat("~")}
            style={{ textDecoration: "line-through" }}
          >
            S
          </button>
          <button
            type="button"
            className="comm-toolbar-btn mono"
            aria-label="Monospace"
            title="Monospace (```metin```)"
            disabled={disabled || loading}
            onClick={() => applyFormat("```")}
          >
            M
          </button>
        </div>

        <div className="comm-compose-toolbar-divider" aria-hidden="true" />

        <div className="comm-compose-toolbar-group">
          <button
            ref={emojiTriggerRef}
            type="button"
            className={`comm-toolbar-btn${showEmoji ? " active" : ""}`}
            aria-label="Emoji ekle"
            aria-expanded={showEmoji}
            disabled={disabled || loading}
            onClick={() => {
              setShowEmoji((v) => !v);
              setShowVars(false);
            }}
          >
            😊
          </button>

          <EmojiPickerPortal
            open={showEmoji}
            onClose={() => setShowEmoji(false)}
            onSelect={handleEmojiSelect}
            triggerRef={emojiTriggerRef}
          />

          <div className="comm-var-dropdown" ref={varsRef}>
            <button
              type="button"
              className="comm-toolbar-btn"
              aria-label="Şablon değişkenleri"
              aria-expanded={showVars}
              disabled={disabled || loading}
              onClick={() => {
                setShowVars((v) => !v);
                setShowEmoji(false);
              }}
            >
              {"{{}}"}
            </button>
            {showVars && (
              <ul className="comm-var-menu" role="menu">
                {TEMPLATE_VARIABLES.map((v) => (
                  <li key={v.key} role="none">
                    <button type="button" role="menuitem" onClick={() => insertToken(v.token)}>
                      <span>{v.label}</span>
                      <code>{v.token}</code>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            type="button"
            className="comm-toolbar-btn"
            aria-label="Dosya ekle (yakında)"
            title="Dosya ekleme yakında"
            disabled
          >
            📎
          </button>
        </div>

        {!compact && (
          <>
            <div className="comm-compose-toolbar-divider" aria-hidden="true" />
            <div className="comm-compose-toolbar-group">
              <select
                className="comm-toolbar-btn"
                aria-label="Önizleme yazı boyutu"
                value={state.previewFontSize || "normal"}
                disabled={disabled || loading}
                onChange={(e) =>
                  update({ previewFontSize: e.target.value as PreviewFontSize })
                }
                style={{ width: "auto", paddingRight: 8 }}
              >
                <option value="small">Küçük</option>
                <option value="normal">Normal</option>
                <option value="large">Büyük</option>
              </select>
              <select
                className="comm-toolbar-btn"
                aria-label="Önizleme rengi"
                value={state.previewColor || ""}
                disabled={disabled || loading}
                onChange={(e) => update({ previewColor: e.target.value || undefined })}
                style={{ width: "auto", paddingRight: 8 }}
                title="Renkler yalnızca önizlemede"
              >
                {PREVIEW_COLORS.map((c) => (
                  <option key={c.label} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>
      )}

      <div className="comm-compose-body">
        <textarea
          ref={textareaRef}
          id={id}
          className="comm-compose-textarea"
          value={state.text}
          onChange={(e) => update({ text: e.target.value })}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || loading}
          aria-label="Mesaj metni"
          rows={compact ? 2 : 6}
        />
      </div>

      {!inboxMode && (
      <div className="comm-compose-footer">
        <div>
          <span className={overLimit ? "comm-char-count over-limit" : "comm-char-count"}>
            {charCount.toLocaleString("tr-TR")} / {maxLength.toLocaleString("tr-TR")}
          </span>
          {segments > 0 && (
            <span style={{ marginLeft: 8 }}>
              · {segments} segment
            </span>
          )}
          {!compact && (
            <span className="comm-preview-note" style={{ marginLeft: 8 }}>
              Renkler yalnızca önizlemede
            </span>
          )}
        </div>
        {loading && <span>Gönderiliyor…</span>}
      </div>
      )}
    </div>
  );

  if (!showPreview || compact) {
    return composer;
  }

  return (
    <div className="comm-compose-layout">
      {composer}
      <WhatsAppPreviewBubble
        text={state.text}
        previewColor={state.previewColor}
        fontSize={state.previewFontSize}
      />
    </div>
  );
}
