"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import EmojiPickerPortal from "@/components/communication/EmojiPickerPortal";
import type { ConversationSessionInfo, MessageItem } from "@/lib/communication-api";

import { humanFileSize, isImageAttachment } from "./chat-utils";
import {
  IconClock,
  IconClose,
  IconEmoji,
  IconPaperclip,
  IconSend,
  IconTemplate,
} from "./icons";

const ACCEPTED =
  "image/jpeg,image/png,image/webp,application/pdf,application/msword," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_FILE_MB = 16;

export interface QuickReply {
  id: string;
  name: string;
  body: string;
}

interface Props {
  session?: ConversationSessionInfo;
  replyTo: MessageItem | null;
  sending: boolean;
  disabled?: boolean;
  disabledReason?: string;
  quickReplies: QuickReply[];
  onSend: (text: string, file?: File) => void;
  onCancelReply: () => void;
  onOpenTemplates: () => void;
  onUseQuickReply: (reply: QuickReply) => void;
  composerRef?: React.RefObject<HTMLTextAreaElement>;
}

type WindowState = "open" | "soon" | "closed";

/**
 * Kalan süreyi `expires_at`'ten hesaplar ve dakikada bir tazeler.
 *
 * Sunucudan gelen `seconds_left` yalnızca isteğin yapıldığı andaki fotoğraf;
 * sohbet uzun süre açık kalınca yanıltıcı olur.
 */
function useSecondsLeft(session?: ConversationSessionInfo): number | null {
  const expiresAt = session?.expires_at ?? null;
  const fallback = session?.seconds_left ?? null;

  const compute = () => {
    if (!expiresAt) return fallback;
    const diff = (new Date(expiresAt).getTime() - Date.now()) / 1000;
    return Number.isFinite(diff) ? Math.max(0, Math.round(diff)) : fallback;
  };

  const [value, setValue] = useState<number | null>(compute);

  useEffect(() => {
    setValue(compute());
    if (!expiresAt) return;
    const timer = window.setInterval(() => setValue(compute()), 60_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt, fallback]);

  return value;
}

function windowUrgency(
  session: ConversationSessionInfo | undefined,
  secondsLeft: number | null,
): WindowState | null {
  if (!session || session.state === "NA") return null;
  if (!session.is_open) return "closed";
  if (secondsLeft == null) return null;
  return secondsLeft <= 3 * 3600 ? "soon" : "open";
}

/** "23 sa", "45 dk" — dar alanda okunur kalsın diye tek birim. */
function shortRemaining(seconds: number): string {
  if (seconds <= 60) return "1 dk";
  if (seconds < 3600) return `${Math.round(seconds / 60)} dk`;
  return `${Math.floor(seconds / 3600)} sa`;
}

function longRemaining(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours <= 0) return `${Math.max(1, minutes)} dakika`;
  if (minutes <= 0) return `${hours} saat`;
  return `${hours} saat ${minutes} dakika`;
}

/**
 * Kapalı pencere açıklaması.
 *
 * Sunucunun `session.notice` metni bilinçli olarak kullanılmıyor: eski inbox
 * onu ekranda kalıcı uyarı olarak gösteriyor, burada ise ipucunda daha fazla
 * bağlam veriliyor (pencerenin nasıl yeniden açıldığı).
 */
const CLOSED_TIP =
  "24 saatlik yanıt penceresi kapandı. WhatsApp kuralları gereği kişi size son 24 saat " +
  "içinde yazmadıysa serbest mesaj gönderilemez. Meta onaylı bir şablon göndererek " +
  "iletişimi yeniden başlatabilirsiniz; kişi yanıt verdiğinde pencere yeniden 24 saat açılır.";

/**
 * 24 saat kuralının tek göstergesi.
 *
 * Pencere açıkken kalan süreyi, kapalıyken yalnızca ikonu gösterir; ayrıntılı
 * açıklama her iki durumda da ipucunda durur, ekranda metin yığmaz.
 */
function WindowBadge({
  state,
  secondsLeft,
}: {
  state: WindowState;
  secondsLeft: number | null;
}) {
  const closed = state === "closed";
  const tip = closed
    ? CLOSED_TIP
    : `Serbest mesaj penceresi ${
        secondsLeft != null ? longRemaining(secondsLeft) : "kısa süre"
      } sonra kapanıyor. Kişi yeni mesaj yazdığında süre yeniden 24 saate döner. ` +
      "Pencere kapandıktan sonra yalnızca Meta onaylı şablon gönderilebilir.";

  // Masaüstünde hover yeterli; dokunmatikte hover olmadığı için dokunuşla da açılır.
  const [tipOpen, setTipOpen] = useState(false);

  useEffect(() => {
    if (!tipOpen) return;
    const close = () => setTipOpen(false);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [tipOpen]);

  return (
    <button
      type="button"
      className={`chat-window-badge is-${state}${tipOpen ? " is-tip-open" : ""}`}
      data-tip={tip}
      aria-label={tip}
      onClick={(e) => {
        e.stopPropagation();
        setTipOpen((v) => !v);
      }}
    >
      <IconClock size={16} />
      {!closed && secondsLeft != null ? (
        <span className="chat-window-badge-text">{shortRemaining(secondsLeft)}</span>
      ) : null}
    </button>
  );
}

export function ChatComposer({
  session,
  replyTo,
  sending,
  disabled,
  disabledReason,
  quickReplies,
  onSend,
  onCancelReply,
  onOpenTemplates,
  onUseQuickReply,
  composerRef,
}: Props) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const localRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = composerRef ?? localRef;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiTriggerRef = useRef<HTMLButtonElement>(null);
  const quickPanelRef = useRef<HTMLDivElement>(null);

  const sessionClosed = session?.is_open === false && session?.state !== "NA";
  const secondsLeft = useSecondsLeft(session);
  const windowState = windowUrgency(session, secondsLeft);

  // Uzun mesajlarda alan kontrollü büyüsün (yaklaşık 8 satıra kadar).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 176)}px`;
  }, [text, textareaRef]);

  useEffect(() => {
    if (replyTo) textareaRef.current?.focus();
  }, [replyTo, textareaRef]);

  useEffect(() => {
    if (!quickOpen) return;
    const onDown = (e: MouseEvent) => {
      if (quickPanelRef.current && !quickPanelRef.current.contains(e.target as Node)) {
        setQuickOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [quickOpen]);

  const canSend = (!!text.trim() || !!file) && !sending && !disabled && !sessionClosed;

  const acceptFile = (candidate: File | null | undefined) => {
    if (!candidate) return;
    if (candidate.size > MAX_FILE_MB * 1024 * 1024) {
      setFileError(`Dosya ${MAX_FILE_MB} MB sınırını aşıyor.`);
      return;
    }
    setFileError(null);
    setFile(candidate);
  };

  const submit = () => {
    if (!canSend) return;
    onSend(text.trim(), file ?? undefined);
    setText("");
    setFile(null);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const previewUrl = useMemo(
    () => (file && isImageAttachment(file.type) ? URL.createObjectURL(file) : null),
    [file],
  );
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  if (disabled) {
    return (
      <div className="chat-composer chat-composer--blocked">
        <p>{disabledReason ?? "Bu sohbete mesaj gönderme yetkiniz yok."}</p>
      </div>
    );
  }

  if (sessionClosed) {
    return (
      <div className="chat-composer chat-composer--window">
        <WindowBadge state="closed" secondsLeft={secondsLeft} />
        <button type="button" className="chat-btn chat-btn--primary" onClick={onOpenTemplates}>
          <IconTemplate size={16} />
          Onaylı şablon seç
        </button>
      </div>
    );
  }

  return (
    <div
      className={`chat-composer${dragging ? " is-dragging" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        acceptFile(e.dataTransfer.files?.[0]);
      }}
    >
      {replyTo ? (
        <div className="chat-reply-bar">
          <div>
            <span className="chat-reply-who">
              {replyTo.direction === "OUTBOUND" ? "Kendi mesajınıza yanıt" : "Yanıtlanıyor"}
            </span>
            <span className="chat-reply-text">
              {replyTo.body?.trim() || replyTo.attachments?.[0]?.original_name || "Ek"}
            </span>
          </div>
          <button
            type="button"
            className="chat-icon-btn"
            onClick={onCancelReply}
            aria-label="Yanıtı iptal et"
          >
            <IconClose size={16} />
          </button>
        </div>
      ) : null}

      {file ? (
        <div className="chat-file-chip">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="" className="chat-file-thumb" />
          ) : null}
          <span className="chat-file-meta">
            <span className="chat-file-name">{file.name}</span>
            <span className="chat-file-size">{humanFileSize(file.size)}</span>
          </span>
          <button
            type="button"
            className="chat-icon-btn"
            onClick={() => {
              setFile(null);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
            aria-label="Eki kaldır"
          >
            <IconClose size={16} />
          </button>
        </div>
      ) : null}

      {fileError ? <p className="chat-composer-error">{fileError}</p> : null}

      <div className="chat-composer-row">
        <button
          type="button"
          className="chat-icon-btn"
          onClick={() => fileInputRef.current?.click()}
          title="Dosya ekle"
          aria-label="Dosya ekle"
        >
          <IconPaperclip size={19} />
        </button>
        <button
          ref={emojiTriggerRef}
          type="button"
          className="chat-icon-btn"
          onClick={() => setEmojiOpen((v) => !v)}
          title="Emoji"
          aria-label="Emoji ekle"
        >
          <IconEmoji size={19} />
        </button>
        <div className="chat-quick-wrap" ref={quickPanelRef}>
          <button
            type="button"
            className="chat-icon-btn"
            onClick={() => setQuickOpen((v) => !v)}
            title="Hazır cevaplar ve şablonlar"
            aria-label="Hazır cevaplar ve şablonlar"
          >
            <IconTemplate size={19} />
          </button>
          {quickOpen ? (
            <div className="chat-quick-panel">
              <button
                type="button"
                className="chat-quick-item is-primary"
                onClick={() => {
                  setQuickOpen(false);
                  onOpenTemplates();
                }}
              >
                Meta onaylı şablonlar…
              </button>
              {quickReplies.length ? (
                quickReplies.slice(0, 8).map((reply) => (
                  <button
                    key={reply.id}
                    type="button"
                    className="chat-quick-item"
                    onClick={() => {
                      setQuickOpen(false);
                      onUseQuickReply(reply);
                      setText((prev) => (prev ? `${prev}\n${reply.body}` : reply.body));
                    }}
                  >
                    <span className="chat-quick-name">{reply.name}</span>
                    <span className="chat-quick-body">{reply.body}</span>
                  </button>
                ))
              ) : (
                <p className="chat-quick-empty">Kayıtlı hazır cevap yok.</p>
              )}
            </div>
          ) : null}
        </div>

        <textarea
          ref={textareaRef}
          className="chat-input"
          rows={1}
          value={text}
          placeholder="Mesaj yazın"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          onPaste={(e) => {
            const pasted = e.clipboardData.files?.[0];
            if (pasted) {
              e.preventDefault();
              acceptFile(pasted);
            }
          }}
          aria-label="Mesaj metni"
        />

        {windowState ? (
          <WindowBadge state={windowState} secondsLeft={secondsLeft} />
        ) : null}

        <button
          type="button"
          className="chat-send-btn"
          onClick={submit}
          disabled={!canSend}
          title="Gönder (Enter)"
          aria-label="Gönder"
        >
          <IconSend size={19} />
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED}
        hidden
        onChange={(e) => acceptFile(e.target.files?.[0])}
      />
      <EmojiPickerPortal
        open={emojiOpen}
        onClose={() => setEmojiOpen(false)}
        onSelect={(emoji) => setText((prev) => prev + emoji)}
        triggerRef={emojiTriggerRef}
      />
    </div>
  );
}
