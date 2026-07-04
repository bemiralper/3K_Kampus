"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ComposeBar,
  ConversationListPanel,
  createComposerState,
  MessageThreadPanel,
} from "@/components/communication";
import "@/components/communication/communication.css";
import {
  archiveConversation,
  ConversationFilter,
  ConversationListItem,
  fetchConversations,
} from "@/lib/communication-api";
import { useCommunicationSSE } from "@/hooks/useCommunicationSSE";
import { useConversationThread } from "@/hooks/useConversationThread";

const POLL_MS = 20_000;

interface MesajlarClientProps {
  initialConversationId?: string | null;
}

export default function MesajlarClient({ initialConversationId }: MesajlarClientProps) {
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialConversationId ?? null);
  const [filter, setFilter] = useState<ConversationFilter>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  const handleConversationRead = useCallback((conversationId: string) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId ? { ...c, unread_count_coach: 0 } : c,
      ),
    );
  }, []);

  const {
    messages,
    composerState,
    setComposerState,
    replyTo,
    setReplyTo,
    messagesLoading,
    sending,
    error: threadError,
    threadRef,
    handleSend: sendMessage,
    handleReact,
  } = useConversationThread(selectedId, {
    enabled: !!selectedId,
    conversation: selected,
    onConversationRead: handleConversationRead,
  });

  const loadConversations = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchConversations({
        filter,
        search: search.trim() || undefined,
      });
      setConversations(data.conversations || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Konuşmalar yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  useCommunicationSSE({
    onUpdate: () => {
      loadConversations();
    },
    onFallbackPoll: () => {
      loadConversations();
    },
  });

  useEffect(() => {
    loadConversations();
    const interval = setInterval(loadConversations, POLL_MS);
    return () => clearInterval(interval);
  }, [loadConversations]);

  const handleSelect = (conv: ConversationListItem) => {
    setSelectedId(conv.id);
    setError(null);
    setComposerState(createComposerState());
    setReplyTo(null);
  };

  const handleSend = useCallback(async (plainText: string, attachmentFile?: File) => {
    await sendMessage(plainText, attachmentFile);
    loadConversations();
  }, [sendMessage, loadConversations]);

  const handleArchive = async () => {
    if (!selectedId) return;
    const isArchived = selected?.status === "ARCHIVED";
    try {
      await archiveConversation(selectedId, !isArchived);
      if (!isArchived) setSelectedId(null);
      loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Arşiv işlemi başarısız");
    }
  };

  const displayError = error || threadError;

  if (loading) {
    return (
      <div className="comm-inbox comm-inbox--loading" aria-busy="true" aria-label="Konuşmalar yükleniyor">
        <aside className="comm-inbox-sidebar">
          <div className="comm-inbox-skeleton comm-inbox-skeleton--filters" />
          <div className="comm-inbox-skeleton comm-inbox-skeleton--search" />
          <div className="comm-inbox-skeleton-list">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="comm-inbox-skeleton comm-inbox-skeleton--item" />
            ))}
          </div>
        </aside>
        <section className="comm-thread-panel">
          <div className="comm-thread-empty">
            <div className="comm-inbox-skeleton comm-inbox-skeleton--pulse" style={{ width: 80, height: 80, borderRadius: "50%" }} />
            <div className="comm-inbox-skeleton comm-inbox-skeleton--pulse" style={{ width: 180, height: 16, marginTop: 16 }} />
            <div className="comm-inbox-skeleton comm-inbox-skeleton--pulse" style={{ width: 240, height: 12, marginTop: 8 }} />
          </div>
        </section>
      </div>
    );
  }

  const showListMobile = !selectedId;
  const showThreadMobile = !!selectedId;

  return (
    <div className="comm-inbox">
      <ConversationListPanel
        conversations={conversations}
        selectedId={selectedId}
        filter={filter}
        search={search}
        onFilterChange={(f) => {
          setFilter(f);
          setSelectedId(null);
        }}
        onSearchChange={setSearch}
        onSelect={handleSelect}
        error={displayError}
        className={showListMobile ? "" : "hidden-mobile"}
      />

      <MessageThreadPanel
        selected={selected}
        messages={messages}
        messagesLoading={messagesLoading}
        threadRef={threadRef}
        error={displayError}
        onArchive={handleArchive}
        onBack={() => setSelectedId(null)}
        className={showThreadMobile ? "" : "hidden-mobile"}
        onReply={setReplyTo}
        onReact={handleReact}
        composeBar={
          <ComposeBar
            value={composerState}
            onChange={setComposerState}
            onSend={handleSend}
            sending={sending}
            inboxMode
            conversation={selected}
            replyTo={replyTo}
            onClearReply={() => setReplyTo(null)}
          />
        }
      />
    </div>
  );
}
