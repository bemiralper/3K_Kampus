"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  ConversationSessionInfo,
  MessageItem,
  SessionWindowClosedError,
  fetchConversationMessages,
  fetchMessageContext,
  sendConversationMessage,
} from "@/lib/communication-api";

const PAGE_SIZE = 40;

export interface PendingMessage {
  /** İyimser gösterim için geçici kimlik. */
  tempId: string;
  body: string;
  fileName?: string;
  replyToId?: string;
  failed?: boolean;
  error?: string;
}

interface Options {
  conversationId: string | null;
  onSent?: () => void;
  onSessionClosed?: (session?: ConversationSessionInfo) => void;
}

function mergeMessages(existing: MessageItem[], incoming: MessageItem[]): MessageItem[] {
  if (!incoming.length) return existing;
  const map = new Map(existing.map((m) => [m.id, m]));
  incoming.forEach((m) => map.set(m.id, m));
  return [...map.values()].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

/**
 * Tek sohbetin mesaj akışı.
 *
 * İlk açılışta son sayfa yüklenir; yukarı kaydırınca `before` imleciyle
 * eskiye doğru sayfalanır. Canlı güncellemede tüm geçmiş yeniden çekilmez,
 * yalnızca son mesajdan sonrası (`after`) istenir.
 */
export function useChatThread({ conversationId, onSent, onSessionClosed }: Options) {
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [pinnedMessage, setPinnedMessage] = useState<MessageItem | null>(null);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const conversationRef = useRef<string | null>(null);
  const messagesRef = useRef<MessageItem[]>([]);

  messagesRef.current = messages;

  const loadInitial = useCallback(async () => {
    if (!conversationId) {
      setMessages([]);
      setHasMore(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchConversationMessages(conversationId, { limit: PAGE_SIZE });
      if (conversationRef.current !== conversationId) return;
      setMessages(data.messages);
      setHasMore(data.has_more);
      setPinnedMessage(data.pinned_message ?? null);
    } catch (err) {
      if (conversationRef.current !== conversationId) return;
      setError(err instanceof Error ? err.message : "Mesajlar yüklenemedi.");
    } finally {
      if (conversationRef.current === conversationId) setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    conversationRef.current = conversationId;
    setMessages([]);
    setPinnedMessage(null);
    setPending([]);
    setHasMore(false);
    setError(null);
    void loadInitial();
  }, [conversationId, loadInitial]);

  const loadOlder = useCallback(async () => {
    if (!conversationId || loadingOlder || !hasMore) return;
    const oldest = messagesRef.current[0];
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const data = await fetchConversationMessages(conversationId, {
        limit: PAGE_SIZE,
        before: oldest.id,
      });
      if (conversationRef.current !== conversationId) return;
      setMessages((prev) => mergeMessages(prev, data.messages));
      setHasMore(data.has_more);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, hasMore, loadingOlder]);

  /** SSE tetiklediğinde: yalnızca yeni mesajları çek, akışı sıfırlama. */
  const refreshTail = useCallback(async () => {
    if (!conversationId) return;
    const last = messagesRef.current[messagesRef.current.length - 1];
    try {
      const data = last
        ? await fetchConversationMessages(conversationId, { after: last.id })
        : await fetchConversationMessages(conversationId, { limit: PAGE_SIZE });
      if (conversationRef.current !== conversationId) return;
      if (data.messages.length) {
        setMessages((prev) => mergeMessages(prev, data.messages));
      }
    } catch {
      /* sessiz — bir sonraki turda tekrar denenir */
    }
  }, [conversationId]);

  /** Giden mesajın durumu (iletildi/okundu) değişmiş olabilir; son sayfayı tazele. */
  const refreshStatuses = useCallback(async () => {
    if (!conversationId) return;
    try {
      const data = await fetchConversationMessages(conversationId, { limit: PAGE_SIZE });
      if (conversationRef.current !== conversationId) return;
      setMessages((prev) => mergeMessages(prev, data.messages));
    } catch {
      /* sessiz */
    }
  }, [conversationId]);

  /** Arama sonucuna atlarken o mesajın etrafındaki pencereyi yükle. */
  const loadAround = useCallback(
    async (messageId: string) => {
      if (!conversationId) return;
      if (messagesRef.current.some((m) => m.id === messageId)) return;
      setLoading(true);
      try {
        const data = await fetchMessageContext(conversationId, messageId);
        if (conversationRef.current !== conversationId) return;
        setMessages(data.messages);
        setHasMore(data.has_more);
      } catch {
        /* sessiz */
      } finally {
        setLoading(false);
      }
    },
    [conversationId],
  );

  const send = useCallback(
    async (
      body: string,
      options: { file?: File; replyToId?: string } = {},
    ): Promise<boolean> => {
      if (!conversationId) return false;
      const trimmed = body.trim();
      if (!trimmed && !options.file) return false;

      const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setPending((prev) => [
        ...prev,
        { tempId, body: trimmed, fileName: options.file?.name, replyToId: options.replyToId },
      ]);
      setSending(true);
      try {
        const message = await sendConversationMessage(conversationId, trimmed, {
          attachmentFile: options.file,
          replyToMessageId: options.replyToId,
        });
        if (conversationRef.current === conversationId) {
          setPending((prev) => prev.filter((p) => p.tempId !== tempId));
          if (message?.id) setMessages((prev) => mergeMessages(prev, [message]));
        }
        onSent?.();
        return true;
      } catch (err) {
        if (err instanceof SessionWindowClosedError) {
          setPending((prev) => prev.filter((p) => p.tempId !== tempId));
          onSessionClosed?.(err.session);
          return false;
        }
        setPending((prev) =>
          prev.map((p) =>
            p.tempId === tempId
              ? {
                  ...p,
                  failed: true,
                  error: err instanceof Error ? err.message : "Gönderilemedi.",
                }
              : p,
          ),
        );
        return false;
      } finally {
        setSending(false);
      }
    },
    [conversationId, onSent, onSessionClosed],
  );

  const retryPending = useCallback(
    async (tempId: string) => {
      const item = pending.find((p) => p.tempId === tempId);
      if (!item) return;
      setPending((prev) => prev.filter((p) => p.tempId !== tempId));
      await send(item.body, { replyToId: item.replyToId });
    },
    [pending, send],
  );

  const discardPending = useCallback((tempId: string) => {
    setPending((prev) => prev.filter((p) => p.tempId !== tempId));
  }, []);

  const patchMessage = useCallback((message: MessageItem) => {
    setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, ...message } : m)));
  }, []);

  /** Sabitleme sohbet geneline ait: aynı anda tek mesaj sabitli kalır. */
  const applyPin = useCallback((message: MessageItem) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id === message.id) return { ...m, ...message };
        return m.is_pinned ? { ...m, is_pinned: false, pinned_at: null } : m;
      }),
    );
    setPinnedMessage(message.is_pinned ? message : null);
  }, []);

  const dropMessage = useCallback((messageId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    setPinnedMessage((prev) => (prev?.id === messageId ? null : prev));
  }, []);

  return {
    messages,
    pinnedMessage,
    pending,
    loading,
    loadingOlder,
    hasMore,
    error,
    sending,
    reload: loadInitial,
    loadOlder,
    refreshTail,
    refreshStatuses,
    loadAround,
    send,
    retryPending,
    discardPending,
    patchMessage,
    applyPin,
    dropMessage,
  };
}
