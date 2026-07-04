"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createComposerState } from "@/components/communication";
import type { ComposerState } from "@/components/communication";
import {
  ConversationListItem,
  fetchConversationMessages,
  markConversationRead,
  MessageItem,
  sendConversationMessage,
  sendMessageReaction,
} from "@/lib/communication-api";
import { useCommunicationSSE } from "@/hooks/useCommunicationSSE";

const POLL_MS = 20_000;

interface UseConversationThreadOptions {
  enabled?: boolean;
  conversation?: ConversationListItem | null;
  onConversationRead?: (conversationId: string) => void;
}

export function useConversationThread(
  conversationId: string | null,
  options: UseConversationThreadOptions = {},
) {
  const { enabled = true, conversation = null, onConversationRead } = options;
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [composerState, setComposerState] = useState<ComposerState>(createComposerState());
  const [replyTo, setReplyTo] = useState<MessageItem | null>(null);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async (id: string) => {
    setMessagesLoading(true);
    try {
      setError(null);
      const data = await fetchConversationMessages(id);
      setMessages(data.messages || []);
      await markConversationRead(id).catch(() => {});
      onConversationRead?.(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mesajlar yüklenemedi");
    } finally {
      setMessagesLoading(false);
    }
  }, [onConversationRead]);

  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;

  useCommunicationSSE({
    enabled: enabled && !!conversationId,
    onUpdate: () => {
      const id = conversationIdRef.current;
      if (id) loadMessages(id);
    },
    onFallbackPoll: () => {
      const id = conversationIdRef.current;
      if (id) loadMessages(id);
    },
  });

  useEffect(() => {
    if (!enabled || !conversationId) {
      setMessages([]);
      setReplyTo(null);
      return;
    }
    loadMessages(conversationId);
    const interval = setInterval(() => loadMessages(conversationId), POLL_MS);
    return () => clearInterval(interval);
  }, [enabled, conversationId, loadMessages]);

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
      setError(err instanceof Error ? err.message : "Mesaj gönderilemedi");
    } finally {
      setSending(false);
    }
  }, [conversationId, sending, replyTo]);

  const handleReact = useCallback(async (msg: MessageItem, emoji: string) => {
    if (!conversationId) return;
    try {
      await sendMessageReaction(conversationId, msg.id, emoji);
      await loadMessages(conversationId);
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
    selected,
  };
}
