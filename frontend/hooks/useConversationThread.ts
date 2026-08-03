"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createComposerState } from "@/components/communication";
import type { ComposerState } from "@/components/communication";
import {
  ConversationListItem,
  fetchConversationMessages,
  markConversationRead,
  MessageItem,
  SessionWindowClosedError,
  sendConversationMessage,
  sendMessageReaction,
} from "@/lib/communication-api";

const POLL_MS = 20_000;

interface UseConversationThreadOptions {
  enabled?: boolean;
  conversation?: ConversationListItem | null;
  onConversationRead?: (conversationId: string) => void;
  /** Dışarıdan (ör. inbox SSE) sessiz yenileme tetiklemek için */
  refreshToken?: number;
}

export function useConversationThread(
  conversationId: string | null,
  options: UseConversationThreadOptions = {},
) {
  const {
    enabled = true,
    conversation = null,
    onConversationRead,
    refreshToken = 0,
  } = options;
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [composerState, setComposerState] = useState<ComposerState>(createComposerState());
  const [replyTo, setReplyTo] = useState<MessageItem | null>(null);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [metaTemplatesOpen, setMetaTemplatesOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const loadSeqRef = useRef(0);
  const onConversationReadRef = useRef(onConversationRead);
  onConversationReadRef.current = onConversationRead;
  const unreadRef = useRef(0);
  unreadRef.current = conversation?.unread_count_coach ?? 0;

  const loadMessages = useCallback(async (id: string, opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    const seq = ++loadSeqRef.current;
    if (!silent) setMessagesLoading(true);
    try {
      if (!silent) setError(null);
      const data = await fetchConversationMessages(id);
      if (seq !== loadSeqRef.current) return;
      setMessages(data.messages || []);
      // Sessiz yenilemede okunmamış yoksa gereksiz yazma isteği atma
      if (silent && unreadRef.current === 0) return;
      // Okundu işaretleme yüklemeyi bloklamasın
      void markConversationRead(id)
        .then(() => {
          unreadRef.current = 0;
          onConversationReadRef.current?.(id);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('lms:notifications-refresh'));
          }
        })
        .catch(() => {});
    } catch (err) {
      if (seq !== loadSeqRef.current) return;
      setError(err instanceof Error ? err.message : "Mesajlar yüklenemedi");
    } finally {
      if (!silent && seq === loadSeqRef.current) {
        setMessagesLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled || !conversationId) {
      loadSeqRef.current += 1;
      setMessages([]);
      setReplyTo(null);
      setMessagesLoading(false);
      return;
    }
    loadMessages(conversationId, { silent: false });
    const interval = setInterval(
      () => loadMessages(conversationId, { silent: true }),
      POLL_MS,
    );
    return () => {
      clearInterval(interval);
      loadSeqRef.current += 1;
    };
  }, [enabled, conversationId, loadMessages]);

  // Inbox SSE vb. dış tetik — sessiz yenile
  useEffect(() => {
    if (!enabled || !conversationId || !refreshToken) return;
    loadMessages(conversationId, { silent: true });
  }, [refreshToken, enabled, conversationId, loadMessages]);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(async (plainText: string, attachmentFile?: File) => {
    if (!conversationId || sending) return;
    if (!plainText.trim() && !attachmentFile) return;
    setSending(true);
    try {
      const msg = await sendConversationMessage(conversationId, plainText, {
        attachmentFile,
        replyToMessageId: replyTo?.id,
      });
      setMessages((prev) => [...prev, msg]);
      setComposerState(createComposerState());
      setReplyTo(null);
    } catch (err) {
      // Pencere kapalıysa kullanıcıyı hata mesajıyla baş başa bırakmayıp
      // doğrudan onaylı şablon seçicisine yönlendiriyoruz.
      if (err instanceof SessionWindowClosedError) {
        setMetaTemplatesOpen(true);
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : "Mesaj gönderilemedi");
      }
    } finally {
      setSending(false);
    }
  }, [conversationId, sending, replyTo]);

  const handleTemplateSent = useCallback((msg: MessageItem) => {
    setMessages((prev) => [...prev, msg]);
    setComposerState(createComposerState());
    setReplyTo(null);
  }, []);

  const handleReact = useCallback(async (msg: MessageItem, emoji: string) => {
    if (!conversationId) return;
    try {
      await sendMessageReaction(conversationId, msg.id, emoji);
      await loadMessages(conversationId, { silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reaksiyon gönderilemedi");
    }
  }, [conversationId, loadMessages]);

  const selected: ConversationListItem | null = conversationId && conversation
    ? conversation
    : conversationId
      ? {
          id: conversationId,
          channel: "WHATSAPP",
          contact_phone: "",
          contact_type: "RAW_PHONE",
          contact_name: "",
          status: "OPEN",
          subject: "",
          last_message_at: null,
          last_message_preview: "",
          unread_count_coach: 0,
          ogrenci_id: null,
          veli_id: null,
          created_at: "",
        }
      : null;

  return {
    messages,
    composerState,
    setComposerState,
    replyTo,
    setReplyTo,
    messagesLoading,
    sending,
    error,
    setError,
    threadRef,
    loadMessages,
    handleSend,
    handleReact,
    metaTemplatesOpen,
    setMetaTemplatesOpen,
    handleTemplateSent,
    selected,
  };
}
