"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import FormattedWhatsAppText from "@/components/communication/FormattedWhatsAppText";
import type { MessageAttachmentItem, MessageItem } from "@/lib/communication-api";

import {
  DELIVERY_LABELS,
  dayDivider,
  deliveryState,
  firstLinkHost,
  humanFileSize,
  isImageAttachment,
  isPdfAttachment,
  messageTime,
  sameDay,
  splitHighlight,
  splitLinks,
} from "./chat-utils";
import { ChatMenu, ChatMenuItem, anchorFromEvent } from "./ChatMenu";
import {
  IconAlert,
  IconCheck,
  IconChevronDown,
  IconClock,
  IconCopy,
  IconDoubleCheck,
  IconDownload,
  IconFile,
  IconForward,
  IconClose,
  IconLink,
  IconMore,
  IconPin,
  IconReply,
  IconStar,
  IconTrash,
} from "./icons";
import type { PendingMessage } from "./useChatThread";

export interface MessageActions {
  onReply: (message: MessageItem) => void;
  onForward: (message: MessageItem) => void;
  onCopy: (message: MessageItem) => void;
  onStar: (message: MessageItem) => void;
  onPin: (message: MessageItem) => void;
  onDelete: (message: MessageItem) => void;
  onReact: (message: MessageItem, emoji: string) => void;
}

const QUICK_REACTIONS = ["👍", "❤️", "😊", "🙏", "✅", "❗"];

interface Props {
  messages: MessageItem[];
  /** Sohbete sabitlenmiş mesaj — akışın üstünde şerit olarak durur. */
  pinnedMessage: MessageItem | null;
  pending: PendingMessage[];
  loading: boolean;
  loadingOlder: boolean;
  hasMore: boolean;
  error: string | null;
  /** Sohbet içi aramada vurgulanacak metin. */
  searchQuery: string;
  /** Arama sonucunda odaklanılan mesaj. */
  focusedMessageId: string | null;
  actions: MessageActions;
  onLoadOlder: () => void;
  onRetryPending: (tempId: string) => void;
  onDiscardPending: (tempId: string) => void;
  /** Sabitlenmiş mesaj şeridine tıklanınca o mesaja git. */
  onJumpToMessage: (messageId: string) => void;
}

export function ChatTimeline({
  messages,
  pinnedMessage,
  pending,
  loading,
  loadingOlder,
  hasMore,
  error,
  searchQuery,
  focusedMessageId,
  actions,
  onLoadOlder,
  onRetryPending,
  onDiscardPending,
  onJumpToMessage,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [menu, setMenu] = useState<{
    message: MessageItem;
    anchor: { x: number; y: number };
  } | null>(null);
  const lastIdRef = useRef<string | null>(null);
  const preserveRef = useRef<{ height: number; top: number } | null>(null);

  const lastMessage = messages[messages.length - 1];

  // Yeni mesaj geldiğinde yalnızca kullanıcı zaten dipteyse aşağı kay.
  useEffect(() => {
    const lastId = lastMessage?.id ?? null;
    if (lastId === lastIdRef.current) return;
    const firstRender = lastIdRef.current === null;
    lastIdRef.current = lastId;
    if (firstRender || atBottom) {
      bottomRef.current?.scrollIntoView({ block: "end", behavior: firstRender ? "auto" : "smooth" });
    }
  }, [lastMessage?.id, atBottom]);

  // Eski mesajlar eklenince kaydırma konumu kaymasın.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const saved = preserveRef.current;
    if (!el || !saved) return;
    el.scrollTop = el.scrollHeight - saved.height + saved.top;
    preserveRef.current = null;
  }, [messages.length]);

  const handleLoadOlder = useCallback(() => {
    const el = scrollRef.current;
    if (el) preserveRef.current = { height: el.scrollHeight, top: el.scrollTop };
    onLoadOlder();
  }, [onLoadOlder]);

  useEffect(() => {
    const sentinel = topSentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root || !hasMore || loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingOlder) handleLoadOlder();
      },
      { root, rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingOlder, handleLoadOlder, messages.length]);

  useEffect(() => {
    if (!focusedMessageId) return;
    const node = document.getElementById(`chat-msg-${focusedMessageId}`);
    node?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusedMessageId, messages.length]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 120);
  };

  const menuItems: ChatMenuItem[] = menu
    ? [
        {
          id: "reply",
          label: "Yanıtla",
          icon: <IconReply size={16} />,
          onSelect: () => actions.onReply(menu.message),
        },
        {
          id: "forward",
          label: "İlet",
          icon: <IconForward size={16} />,
          onSelect: () => actions.onForward(menu.message),
        },
        {
          id: "copy",
          label: "Kopyala",
          icon: <IconCopy size={16} />,
          disabled: !menu.message.body?.trim(),
          onSelect: () => actions.onCopy(menu.message),
        },
        {
          id: "star",
          label: menu.message.is_starred ? "Yıldızı kaldır" : "Yıldızla",
          icon: <IconStar size={16} filled={menu.message.is_starred} />,
          onSelect: () => actions.onStar(menu.message),
        },
        {
          id: "pin",
          label: menu.message.is_pinned ? "Sabitlemeyi kaldır" : "Sohbete sabitle",
          icon: <IconPin size={16} />,
          onSelect: () => actions.onPin(menu.message),
        },
        {
          id: "delete",
          label: "Bu ekrandan sil",
          icon: <IconTrash size={16} />,
          danger: true,
          separated: true,
          onSelect: () => actions.onDelete(menu.message),
        },
      ]
    : [];

  return (
    <div className="chat-timeline-wrap">
      {pinnedMessage ? (
        <div className="chat-pinned-bar">
          <IconPin size={14} />
          <button
            type="button"
            className="chat-pinned-text"
            onClick={() => onJumpToMessage(pinnedMessage.id)}
            title="Sabitlenmiş mesaja git"
          >
            {pinnedMessage.body?.trim() ||
              pinnedMessage.attachments?.[0]?.original_name ||
              "Ek"}
          </button>
          <button
            type="button"
            className="chat-pinned-remove"
            onClick={() => actions.onPin(pinnedMessage)}
            aria-label="Sabitlemeyi kaldır"
            title="Sabitlemeyi kaldır"
          >
            <IconClose size={14} />
          </button>
        </div>
      ) : null}

      <div className="chat-timeline" ref={scrollRef} onScroll={onScroll}>
        {loading && messages.length === 0 ? (
          <div className="chat-timeline-state">Mesajlar yükleniyor…</div>
        ) : error ? (
          <div className="chat-timeline-state is-error">
            <IconAlert size={18} />
            <span>{error}</span>
          </div>
        ) : messages.length === 0 && pending.length === 0 ? (
          <div className="chat-timeline-state">
            Bu sohbette henüz mesaj yok. İlk mesajı siz yazın.
          </div>
        ) : null}

        <div ref={topSentinelRef} />
        {loadingOlder ? <div className="chat-timeline-more">Eski mesajlar yükleniyor…</div> : null}
        {!hasMore && messages.length > 0 ? (
          <div className="chat-timeline-more">Sohbetin başı</div>
        ) : null}

        {messages.map((message, index) => {
          const prev = messages[index - 1];
          const showDivider = !prev || !sameDay(prev.created_at, message.created_at);
          const grouped =
            !!prev &&
            prev.direction === message.direction &&
            sameDay(prev.created_at, message.created_at) &&
            new Date(message.created_at).getTime() -
              new Date(prev.created_at).getTime() <
              4 * 60_000;
          return (
            <div key={message.id}>
              {showDivider ? (
                <div className="chat-day-divider">
                  <span>{dayDivider(message.created_at)}</span>
                </div>
              ) : null}
              <MessageRow
                message={message}
                grouped={grouped}
                highlighted={message.id === focusedMessageId}
                searchQuery={searchQuery}
                actions={actions}
                onMenu={(e) => setMenu({ message, anchor: anchorFromEvent(e) })}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ message, anchor: { x: e.clientX, y: e.clientY } });
                }}
              />
            </div>
          );
        })}

        {pending.map((item) => (
          <PendingRow
            key={item.tempId}
            item={item}
            onRetry={() => onRetryPending(item.tempId)}
            onDiscard={() => onDiscardPending(item.tempId)}
          />
        ))}

        <div ref={bottomRef} />
      </div>

      {!atBottom ? (
        <button
          type="button"
          className="chat-scroll-bottom"
          onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })}
          aria-label="En alta git"
        >
          <IconChevronDown size={20} />
        </button>
      ) : null}

      <ChatMenu items={menuItems} anchor={menu?.anchor ?? null} onClose={() => setMenu(null)} />
    </div>
  );
}

function MessageRow({
  message,
  grouped,
  highlighted,
  searchQuery,
  actions,
  onMenu,
  onContextMenu,
}: {
  message: MessageItem;
  grouped: boolean;
  highlighted: boolean;
  searchQuery: string;
  actions: MessageActions;
  onMenu: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const outbound = message.direction === "OUTBOUND";
  const isSystem = message.message_type === "SYSTEM";
  const [reactionsOpen, setReactionsOpen] = useState(false);

  if (isSystem) {
    return (
      <div className="chat-system-message" id={`chat-msg-${message.id}`}>
        <span>{message.body}</span>
      </div>
    );
  }

  const state = deliveryState(message);
  const link = message.body ? firstLinkHost(message.body) : null;

  return (
    <div
      id={`chat-msg-${message.id}`}
      className={[
        "chat-msg",
        outbound ? "is-out" : "is-in",
        grouped ? "is-grouped" : "",
        highlighted ? "is-highlighted" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onContextMenu={onContextMenu}
    >
      <div className="chat-bubble">
        {message.is_forwarded ? <p className="chat-bubble-forward">İletildi</p> : null}
        {message.reply_to ? (
          <div className="chat-bubble-quote">
            <span className="chat-bubble-quote-who">
              {message.reply_to.direction === "OUTBOUND" ? "Siz" : "Karşı taraf"}
            </span>
            <span className="chat-bubble-quote-text">
              {message.reply_to.body?.trim() ||
                message.reply_to.attachments?.[0]?.original_name ||
                "Ek"}
            </span>
          </div>
        ) : null}

        {message.attachments?.map((att) => (
          <Attachment key={att.id} attachment={att} />
        ))}

        {message.body ? (
          <p className="chat-bubble-text">
            {searchQuery.trim() ? (
              <HighlightText text={message.body} query={searchQuery} />
            ) : (
              <LinkedText text={message.body} />
            )}
          </p>
        ) : null}

        {link ? (
          <a
            className="chat-bubble-link"
            href={link.href}
            target="_blank"
            rel="noreferrer noopener"
          >
            <IconLink size={14} />
            <span>{link.host}</span>
          </a>
        ) : null}

        <span className="chat-bubble-foot">
          {message.is_pinned ? <IconPin size={12} className="chat-bubble-star" /> : null}
          {message.is_starred ? <IconStar size={12} filled className="chat-bubble-star" /> : null}
          <span className="chat-bubble-time">{messageTime(message.created_at)}</span>
          {state ? <DeliveryTick state={state} /> : null}
        </span>

        {message.status === "FAILED" ? (
          <p className="chat-bubble-error">
            <IconAlert size={13} />
            {message.failed_reason || "Mesaj gönderilemedi."}
          </p>
        ) : null}

        {message.reactions?.length ? (
          <div className="chat-bubble-reactions">
            {message.reactions.map((r) => (
              <span key={r.id} title={r.reacted_by_name}>
                {r.emoji}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="chat-msg-actions">
        <button
          type="button"
          className="chat-msg-action"
          title="Yanıtla"
          aria-label="Yanıtla"
          onClick={() => actions.onReply(message)}
        >
          <IconReply size={15} />
        </button>
        <button
          type="button"
          className="chat-msg-action"
          title="Tepki ver"
          aria-label="Tepki ver"
          onClick={() => setReactionsOpen((v) => !v)}
        >
          🙂
        </button>
        <button
          type="button"
          className="chat-msg-action"
          title="Daha fazla"
          aria-label="Daha fazla"
          onClick={onMenu}
        >
          <IconMore size={15} />
        </button>
        {reactionsOpen ? (
          <div className="chat-reaction-bar">
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  setReactionsOpen(false);
                  actions.onReact(message, emoji);
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DeliveryTick({ state }: { state: NonNullable<ReturnType<typeof deliveryState>> }) {
  const label = DELIVERY_LABELS[state];
  if (state === "sending") {
    return (
      <span className="chat-tick" title={label} aria-label={label}>
        <IconClock size={13} />
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span className="chat-tick is-failed" title={label} aria-label={label}>
        <IconAlert size={13} />
      </span>
    );
  }
  if (state === "sent") {
    return (
      <span className="chat-tick" title={label} aria-label={label}>
        <IconCheck size={13} />
      </span>
    );
  }
  return (
    <span
      className={`chat-tick${state === "read" ? " is-read" : ""}`}
      title={label}
      aria-label={label}
    >
      <IconDoubleCheck size={15} />
    </span>
  );
}

function Attachment({ attachment }: { attachment: MessageAttachmentItem }) {
  if (isImageAttachment(attachment.mime_type) && attachment.file_url) {
    return (
      <a
        className="chat-attach-image"
        href={attachment.file_url}
        target="_blank"
        rel="noreferrer"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={attachment.file_url} alt={attachment.original_name || "Görsel"} />
      </a>
    );
  }
  return <FileCard attachment={attachment} />;
}

/**
 * PDF'i blob olarak indirip `blob:` adresinden gösterir.
 *
 * Backend medyayı `X-Frame-Options: DENY` ile sunuyor; dosya adresini doğrudan
 * iframe'e verirsek tarayıcı boş bir çerçeve çizer. Blob adresi ağ yanıtı
 * olmadığı için bu başlıktan etkilenmez.
 */
function usePdfPreview(url: string | null | undefined) {
  const [state, setState] = useState<{ url: string | null; error: boolean }>({
    url: null,
    error: false,
  });

  useEffect(() => {
    if (!url) {
      setState({ url: null, error: false });
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    setState({ url: null, error: false });

    fetch(url, { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error("indirilemedi");
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ url: objectUrl, error: false });
      })
      .catch(() => {
        if (!cancelled) setState({ url: null, error: true });
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return state;
}

function FileCard({ attachment }: { attachment: MessageAttachmentItem }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const canPreview = isPdfAttachment(attachment.mime_type) && !!attachment.file_url;
  const preview = usePdfPreview(canPreview && previewOpen ? attachment.file_url : null);

  return (
    <div className="chat-attach-block">
      <a
        className="chat-attach-file"
        href={attachment.file_url}
        target="_blank"
        rel="noreferrer"
        download={attachment.original_name || undefined}
      >
        <span className="chat-attach-icon">
          <IconFile size={20} />
        </span>
        <span className="chat-attach-meta">
          <span className="chat-attach-name">{attachment.original_name || "Dosya"}</span>
          <span className="chat-attach-sub">
            {isPdfAttachment(attachment.mime_type) ? "PDF" : attachment.mime_type || "Dosya"}
            {attachment.file_size ? ` · ${humanFileSize(attachment.file_size)}` : ""}
          </span>
        </span>
        <span className="chat-attach-download">
          <IconDownload size={17} />
        </span>
      </a>
      {canPreview ? (
        <>
          <button
            type="button"
            className="chat-link-btn chat-attach-preview-btn"
            onClick={() => setPreviewOpen((v) => !v)}
          >
            {previewOpen ? "Önizlemeyi kapat" : "Önizle"}
          </button>
          {previewOpen ? (
            <div className="chat-attach-pdf">
              {preview.error ? (
                <p className="chat-attach-pdf-state">
                  Önizleme açılamadı. Dosyayı yeni sekmede açabilirsiniz.
                </p>
              ) : preview.url ? (
                <iframe
                  src={`${preview.url}#toolbar=0&view=FitH`}
                  title={attachment.original_name || "PDF önizleme"}
                />
              ) : (
                <p className="chat-attach-pdf-state">Önizleme hazırlanıyor…</p>
              )}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function PendingRow({
  item,
  onRetry,
  onDiscard,
}: {
  item: PendingMessage;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className={`chat-msg is-out is-pending${item.failed ? " is-failed" : ""}`}>
      <div className="chat-bubble">
        {item.fileName ? (
          <p className="chat-bubble-text chat-bubble-file-pending">{item.fileName}</p>
        ) : null}
        {item.body ? <p className="chat-bubble-text">{item.body}</p> : null}
        <span className="chat-bubble-foot">
          <span className="chat-bubble-time">
            {item.failed ? "Gönderilemedi" : "Gönderiliyor…"}
          </span>
        </span>
        {item.failed ? (
          <div className="chat-pending-actions">
            <span className="chat-bubble-error">
              <IconAlert size={13} />
              {item.error}
            </span>
            <button type="button" className="chat-link-btn" onClick={onRetry}>
              Tekrar gönder
            </button>
            <button type="button" className="chat-link-btn" onClick={onDiscard}>
              Vazgeç
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** WhatsApp biçimlendirmesini korur, URL'leri tıklanabilir yapar. */
function LinkedText({ text }: { text: string }) {
  const parts = splitLinks(text);
  if (parts.length === 1 && !parts[0].href) return <FormattedWhatsAppText text={text} />;
  return (
    <>
      {parts.map((part, i) =>
        part.href ? (
          <a key={i} href={part.href} target="_blank" rel="noreferrer noopener">
            {part.text}
          </a>
        ) : (
          <FormattedWhatsAppText key={i} text={part.text} />
        ),
      )}
    </>
  );
}

function HighlightText({ text, query }: { text: string; query: string }) {
  return (
    <>
      {splitHighlight(text, query.trim()).map((part, i) =>
        part.hit ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>,
      )}
    </>
  );
}
