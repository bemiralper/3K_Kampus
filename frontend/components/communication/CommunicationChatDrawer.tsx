"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ComposeBar,
  createComposerState,
  MessageThreadPanel,
} from "@/components/communication";
import { useConversationThread } from "@/hooks/useConversationThread";
import {
  conversationInboxPath,
  ConversationListItem,
  openConversationByPhone,
} from "@/lib/communication-api";
import type { ChatOpenParams } from "./CommunicationChatProvider";

interface CommunicationChatDrawerProps {
  open: boolean;
  onClose: () => void;
  target: ChatOpenParams | null;
  adminInbox?: boolean;
}

export default function CommunicationChatDrawer({
  open,
  onClose,
  target,
  adminInbox = false,
}: CommunicationChatDrawerProps) {
  const [conversation, setConversation] = useState<ConversationListItem | null>(null);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !target?.phone) {
      setConversation(null);
      setOpenError(null);
      return;
    }

    let cancelled = false;
    setOpening(true);
    setOpenError(null);

    openConversationByPhone(target.phone, {
      ogrenci_id: target.ogrenciId,
      veli_id: target.veliId,
    })
      .then((conv) => {
        if (!cancelled) setConversation(conv);
      })
      .catch((err) => {
        if (!cancelled) {
          setOpenError(err instanceof Error ? err.message : "Konuşma açılamadı");
          setConversation(null);
        }
      })
      .finally(() => {
        if (!cancelled) setOpening(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, target?.phone, target?.ogrenciId, target?.veliId]);

  const displayConversation: ConversationListItem | null = conversation
    ? {
        ...conversation,
        contact_name: target?.contactLabel || conversation.contact_name || conversation.contact_phone,
      }
    : null;

  const {
    messages,
    composerState,
    setComposerState,
    replyTo,
    setReplyTo,
    messagesLoading,
    sending,
    error,
    threadRef,
    handleSend,
    handleReact,
    selected,
  } = useConversationThread(conversation?.id ?? null, {
    enabled: open && !!conversation?.id,
    conversation: displayConversation,
  });

  const handleClose = useCallback(() => {
    setConversation(null);
    setOpenError(null);
    setComposerState(createComposerState());
    setReplyTo(null);
    onClose();
  }, [onClose, setComposerState, setReplyTo]);

  if (!open) return null;

  const combinedError = openError || error;
  const threadSelected = selected && displayConversation
    ? {
        ...selected,
        contact_name: displayConversation.contact_name,
        contact_phone: displayConversation.contact_phone || selected.contact_phone,
      }
    : selected;

  return (
    <div className="comm-drawer-overlay" onClick={handleClose} role="presentation">
      <aside
        className="comm-drawer comm-chat-drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="WhatsApp mesajlaşma"
      >
        <header className="comm-drawer-header comm-chat-drawer-header">
          <div>
            <h2>{target?.contactLabel || "WhatsApp"}</h2>
            {target?.phone && (
              <span className="comm-chat-drawer-phone">{target.phone}</span>
            )}
          </div>
          <div className="comm-chat-drawer-header-actions">
            {conversation?.id && (
              <Link
                href={conversationInboxPath(conversation.id, adminInbox)}
                className="comm-btn-secondary comm-chat-drawer-fullscreen"
                onClick={handleClose}
              >
                Tam ekran
              </Link>
            )}
            <button
              type="button"
              className="comm-drawer-close"
              onClick={handleClose}
              aria-label="Kapat"
            >
              ×
            </button>
          </div>
        </header>

        {opening && (
          <p className="comm-chat-drawer-status">Konuşma açılıyor…</p>
        )}

        {openError && !opening && (
          <div className="comm-alert comm-alert-danger" style={{ margin: "0 1rem" }}>
            {openError}
          </div>
        )}

        <div className="comm-chat-drawer-body">
          {conversation && (
            <MessageThreadPanel
              selected={threadSelected}
              messages={messages}
              messagesLoading={messagesLoading || opening}
              threadRef={threadRef}
              error={combinedError}
              onArchive={() => {}}
              hideArchive
              onReply={setReplyTo}
              onReact={handleReact}
              composeBar={
                <ComposeBar
                  value={composerState}
                  onChange={setComposerState}
                  onSend={handleSend}
                  sending={sending}
                  inboxMode
                  conversation={threadSelected}
                  replyTo={replyTo}
                  onClearReply={() => setReplyTo(null)}
                />
              }
            />
          )}
        </div>
      </aside>
    </div>
  );
}
