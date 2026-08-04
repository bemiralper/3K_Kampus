"use client";

import { RefObject, useEffect, useState } from "react";
import {
  ConversationListItem,
  conversationRelationLabel,
  formatMessageTime,
  MessageItem,
} from "@/lib/communication-api";
import MessageThreadBubble from "./MessageThreadBubble";

function contactInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return "?";
}

interface MessageThreadPanelProps {
  selected: ConversationListItem | null;
  messages: MessageItem[];
  messagesLoading: boolean;
  threadRef: RefObject<HTMLDivElement>;
  error?: string | null;
  onArchive: () => void;
  onClaim?: () => void;
  claimBusy?: boolean;
  onBack?: () => void;
  composeBar?: React.ReactNode;
  sidePanel?: React.ReactNode;
  className?: string;
  hideArchive?: boolean;
  onReply?: (msg: MessageItem) => void;
  onReact?: (msg: MessageItem, emoji: string) => void;
}

export default function MessageThreadPanel({
  selected,
  messages,
  messagesLoading,
  threadRef,
  error,
  onArchive,
  onClaim,
  claimBusy = false,
  onBack,
  composeBar,
  sidePanel,
  className = "",
  hideArchive = false,
  onReply,
  onReact,
}: MessageThreadPanelProps) {
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);

  useEffect(() => {
    setActiveMessageId(null);
  }, [selected?.id]);

  if (!selected) {
    return (
      <section className={`comm-thread-panel ${className}`}>
        <div className="comm-thread-empty">
          <div className="comm-thread-empty-visual" aria-hidden="true">
            <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
              <circle cx="60" cy="60" r="56" fill="#f0f2f5" />
              <path
                d="M38 52c0-8.837 7.163-16 16-16h12c8.837 0 16 7.163 16 16v4.5c0 3.59-2.91 6.5-6.5 6.5H62l-8.5 8.5V63H44.5C40.91 63 38 60.09 38 56.5V52z"
                fill="#fff"
                stroke="#25d366"
                strokeWidth="2"
              />
              <circle cx="52" cy="54" r="2.5" fill="#25d366" />
              <circle cx="60" cy="54" r="2.5" fill="#25d366" />
              <circle cx="68" cy="54" r="2.5" fill="#25d366" />
            </svg>
          </div>
          <h3>WhatsApp Mesajları</h3>
          <p>Sol panelden bir konuşma seçin veya yeni gelen mesajları bekleyin.</p>
        </div>
      </section>
    );
  }

  const isArchived = selected.status === "ARCHIVED";
  const displayName = selected.contact_name || selected.contact_phone;
  const relation = conversationRelationLabel(selected);

  return (
    <section className={`comm-thread-panel ${className}`}>
      <header className="comm-thread-header">
        <div className="comm-thread-header-leading">
          {onBack && (
            <button
              type="button"
              className="comm-btn-secondary comm-thread-back"
              onClick={onBack}
              aria-label="Konuşma listesine dön"
            >
              ←
            </button>
          )}
          <div className="comm-thread-avatar" aria-hidden="true">
            {contactInitials(displayName)}
          </div>
          <div className="comm-thread-header-info">
            <h3>{displayName}</h3>
            {relation && <span className="comm-thread-relation">{relation}</span>}
            <span className="comm-thread-phone">{selected.contact_phone}</span>
            {(selected.assigned_coach_name || selected.claimed_by_name || selected.status === "NEEDS_SUPPORT") && (
              <span className="comm-thread-meta">
                {selected.status === "NEEDS_SUPPORT" && <em className="comm-status-chip is-support">Destek Gerekiyor</em>}
                {selected.assigned_coach_name && <> · Koç: {selected.assigned_coach_name}</>}
                {selected.claimed_by_name && <> · Üstlenen: {selected.claimed_by_name}</>}
              </span>
            )}
          </div>
        </div>
        <div className="comm-thread-header-actions">
          {selected.can_claim && onClaim && (
            <button
              type="button"
              className="comm-btn-primary"
              onClick={onClaim}
              disabled={claimBusy}
            >
              {claimBusy ? "Üstleniliyor…" : "Sohbeti Üstlen"}
            </button>
          )}
          {!hideArchive && (
            <button
              type="button"
              className="comm-btn-secondary"
              onClick={onArchive}
              aria-label={isArchived ? "Arşivden çıkar" : "Arşivle"}
            >
              {isArchived ? "Arşivden çıkar" : "Arşivle"}
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="comm-alert comm-alert-danger" style={{ margin: "8px 12px 0" }}>
          {error}
        </div>
      )}

      <div className="comm-thread-body-row">
        <div className="comm-thread-main">
          <div
            className="comm-thread-messages"
            ref={threadRef}
            role="log"
            aria-live="polite"
            onClick={() => setActiveMessageId(null)}
          >
            {messagesLoading && messages.length === 0 ? (
              <p style={{ color: "#667781", textAlign: "center" }}>Mesajlar yükleniyor…</p>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} onClick={(e) => e.stopPropagation()}>
                  <MessageThreadBubble
                    msg={msg}
                    isActive={activeMessageId === msg.id}
                    formatTime={formatMessageTime}
                    onSelect={(m) => setActiveMessageId((prev) => (prev === m.id ? null : m.id))}
                    onReply={(m) => {
                      onReply?.(m);
                      setActiveMessageId(null);
                    }}
                    onReact={(m, emoji) => {
                      onReact?.(m, emoji);
                      setActiveMessageId(null);
                    }}
                  />
                </div>
              ))
            )}
          </div>
          {!isArchived && composeBar}
        </div>
        {sidePanel}
      </div>
    </section>
  );
}
