"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ComposeBar,
  createComposerState,
  MessageThreadPanel,
} from "@/components/communication";
import MetaTemplateSendDrawer from "./MetaTemplateSendDrawer";
import { useConversationThread } from "@/hooks/useConversationThread";
import {
  accountLabel,
  conversationInboxPath,
  type InboxPortal,
  ConversationListItem,
  fetchAccessibleWhatsAppAccounts,
  openConversationByPhone,
  WhatsAppAccount,
} from "@/lib/communication-api";
import type { ChatOpenParams } from "./CommunicationChatProvider";

interface CommunicationChatDrawerProps {
  open: boolean;
  onClose: () => void;
  target: ChatOpenParams | null;
  adminInbox?: boolean;
  inboxPortal?: InboxPortal;
}

const DEPT_LABELS: Record<string, string> = {
  COACHING: "Koçluk",
  ACCOUNTING: "Muhasebe",
  SECRETARIAT: "Sekreterya",
  GUIDANCE: "Rehberlik",
  ADMISSIONS: "Kayıt",
  MANAGEMENT: "Yönetim",
};

export default function CommunicationChatDrawer({
  open,
  onClose,
  target,
  adminInbox = false,
  inboxPortal,
}: CommunicationChatDrawerProps) {
  const portal: InboxPortal = inboxPortal ?? (adminInbox ? "admin" : "coach");
  const [conversation, setConversation] = useState<ConversationListItem | null>(null);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [accountId, setAccountId] = useState("");

  useEffect(() => {
    if (!open) {
      setConversation(null);
      setOpenError(null);
      setAccounts([]);
      setAccountId("");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const accessible = await fetchAccessibleWhatsAppAccounts();
        if (cancelled) return;
        const list = accessible.accounts || [];
        setAccounts(list);
        const initial = accessible.default_account_id || list[0]?.id || "";
        setAccountId((prev) => prev || initial);
      } catch {
        if (!cancelled) {
          setAccounts([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !target?.phone || !accountId) {
      if (!open || !target?.phone) {
        setConversation(null);
        setOpenError(null);
      }
      return;
    }

    let cancelled = false;
    setOpening(true);
    setOpenError(null);

    (async () => {
      try {
        const conv = await openConversationByPhone(target.phone, {
          ogrenci_id: target.ogrenciId,
          veli_id: target.veliId,
          personel_id: target.personelId,
          channel_config_id: accountId,
        });
        if (!cancelled) setConversation(conv);
      } catch (err) {
        if (!cancelled) {
          setOpenError(err instanceof Error ? err.message : "Konuşma açılamadı");
          setConversation(null);
        }
      } finally {
        if (!cancelled) setOpening(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, target?.phone, target?.ogrenciId, target?.veliId, target?.personelId, accountId]);

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
    metaTemplatesOpen,
    setMetaTemplatesOpen,
    handleTemplateSent,
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
                href={conversationInboxPath(conversation.id, portal)}
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

        {accounts.length > 0 && (
          <div className="comm-chat-drawer-account" style={{ padding: "0.5rem 1rem" }}>
            <label className="comm-form-field" style={{ margin: 0 }}>
              <span style={{ fontSize: "0.8rem" }}>WhatsApp hesabı (birim)</span>
              <select
                className="tplx-select"
                value={accountId}
                disabled={opening}
                onChange={(e) => setAccountId(e.target.value)}
                aria-label="WhatsApp hesabı"
              >
                {accounts.map((acc) => {
                  const dept = acc.department
                    ? DEPT_LABELS[String(acc.department)] || String(acc.department)
                    : "";
                  return (
                    <option key={acc.id} value={acc.id}>
                      {accountLabel(acc)}
                      {dept ? ` — ${dept}` : ""}
                    </option>
                  );
                })}
              </select>
            </label>
          </div>
        )}

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
                  onOpenMetaTemplates={() => setMetaTemplatesOpen(true)}
                />
              }
            />
          )}
        </div>
      </aside>
      <MetaTemplateSendDrawer
        open={metaTemplatesOpen}
        conversationId={conversation?.id ?? null}
        contactType={
          target?.veliId
            ? "VELI"
            : target?.ogrenciId && !target?.veliId
              ? "OGRENCI"
              : conversation?.contact_type
        }
        showManageLink={portal === "admin"}
        onClose={() => setMetaTemplatesOpen(false)}
        onSent={handleTemplateSent}
      />
    </div>
  );
}
