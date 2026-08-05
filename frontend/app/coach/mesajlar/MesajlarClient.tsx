"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ComposeBar,
  ConversationListPanel,
  ConversationOpsPanel,
  createComposerState,
  MessageThreadPanel,
} from "@/components/communication";
import MetaTemplateSendDrawer from "@/components/communication/MetaTemplateSendDrawer";
import "@/components/communication/communication.css";
import {
  accountLabel,
  archiveConversation,
  claimConversation,
  ConversationFilter,
  ConversationListItem,
  ConversationPeriod,
  fetchAccessibleWhatsAppAccounts,
  fetchConversations,
  WhatsAppAccount,
} from "@/lib/communication-api";
import { useCommunicationSSE } from "@/hooks/useCommunicationSSE";
import { useConversationThread } from "@/hooks/useConversationThread";

const POLL_MS = 20_000;

interface MesajlarClientProps {
  initialConversationId?: string | null;
  showAccountFilter?: boolean;
}

export default function MesajlarClient({ initialConversationId, showAccountFilter = false }: MesajlarClientProps) {
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialConversationId ?? null);
  // Admin: tümü. Koç: tümü (Yeni Gelenler + kendi sohbetleri); "Benim" filtresi ayrı seçilir.
  const [filter, setFilter] = useState<ConversationFilter>("all");
  const [period, setPeriod] = useState<ConversationPeriod>("7d");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [accountId, setAccountId] = useState<string>("");
  const [threadRefreshToken, setThreadRefreshToken] = useState(0);
  const [claimBusy, setClaimBusy] = useState(false);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const visibleIdsRef = useRef<Set<string>>(new Set());

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
    metaTemplatesOpen,
    setMetaTemplatesOpen,
    handleTemplateSent,
  } = useConversationThread(selectedId, {
    enabled: !!selectedId,
    conversation: selected,
    onConversationRead: handleConversationRead,
    refreshToken: threadRefreshToken,
  });

  useEffect(() => {
    fetchAccessibleWhatsAppAccounts()
      .then((res) => {
        const list = res.accounts || [];
        setAccounts(list);
        // Yönetici: tek hesap / varsayılanı önceden seç. Koç: boş bırak → erişilebilir tüm hesaplar.
        if (showAccountFilter && !accountId) {
          if (list.length === 1) {
            setAccountId(list[0].id);
          } else if (res.default_account_id) {
            setAccountId(res.default_account_id);
          }
        }
      })
      .catch(() => setAccounts([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnızca mount'ta varsayılan hesap
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchConversations({
        filter,
        period,
        search: search.trim() || undefined,
        channel_config_id: accountId || undefined,
      });
      const list = data.conversations || [];
      list.sort((a, b) => {
        const ta = a.last_message_at ? Date.parse(a.last_message_at) : 0;
        const tb = b.last_message_at ? Date.parse(b.last_message_at) : 0;
        if (tb !== ta) return tb - ta;
        return (b.created_at || "").localeCompare(a.created_at || "");
      });
      setConversations(list);
      const nextIds = new Set(list.map((c) => c.id));
      const sid = selectedIdRef.current;
      // Yalnızca daha önce listede görünen sohbet kaybolduysa (üstlenme) temizle
      if (sid && !nextIds.has(sid) && visibleIdsRef.current.has(sid)) {
        setToast("Sohbet listeden kalktı (başka biri üstlendi).");
        window.setTimeout(() => setToast(null), 4000);
        setSelectedId(null);
      }
      visibleIdsRef.current = nextIds;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Konuşmalar yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [filter, period, search, accountId]);

  useCommunicationSSE({
    onUpdate: () => {
      loadConversations();
      setThreadRefreshToken((n) => n + 1);
    },
    onFallbackPoll: () => {
      loadConversations();
      setThreadRefreshToken((n) => n + 1);
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

  const handleClaim = async () => {
    if (!selectedId || !selected) return;
    setClaimBusy(true);
    try {
      const updated = await claimConversation(selectedId, selected.claim_version);
      setConversations((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
      setToast("Sohbet üstlenildi.");
      window.setTimeout(() => setToast(null), 3000);
      loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Üstlenme başarısız");
      loadConversations();
    } finally {
      setClaimBusy(false);
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
          </div>
        </section>
      </div>
    );
  }

  const showListMobile = !selectedId;
  const showThreadMobile = !!selectedId;

  return (
    <div className="comm-inbox">
      {toast && <div className="comm-toast">{toast}</div>}
      <ConversationListPanel
        conversations={conversations}
        selectedId={selectedId}
        filter={filter}
        period={period}
        search={search}
        onFilterChange={(f) => {
          setFilter(f);
          setSelectedId(null);
        }}
        onPeriodChange={setPeriod}
        onSearchChange={setSearch}
        onSelect={handleSelect}
        error={displayError}
        className={showListMobile ? "" : "hidden-mobile"}
        accountFilterSlot={
          accounts.length === 0 ? (
            <div className="comm-inbox-account-hint" style={{ fontSize: 12, color: "#b45309", lineHeight: 1.4 }}>
              Bu rol/şube için WhatsApp hesabı yok. Yönetici: İletişim → WhatsApp hesapları → Koç rolünü ekleyin.
            </div>
          ) : accounts.length > 1 || showAccountFilter ? (
            <select
              className="comm-inbox-account-select"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              aria-label="WhatsApp hesabı"
            >
              <option value="">
                {showAccountFilter ? "Erişebildiğim tüm hesaplar" : "Tüm hesaplarım"}
              </option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {accountLabel(acc)}
                </option>
              ))}
            </select>
          ) : undefined
        }
      />

      <MessageThreadPanel
        selected={selected}
        messages={messages}
        messagesLoading={messagesLoading}
        threadRef={threadRef}
        error={displayError}
        onArchive={handleArchive}
        onClaim={handleClaim}
        claimBusy={claimBusy}
        onBack={() => setSelectedId(null)}
        className={showThreadMobile ? "" : "hidden-mobile"}
        onReply={setReplyTo}
        onReact={handleReact}
        sidePanel={
          selected ? (
            <ConversationOpsPanel
              conversation={selected}
              onUpdated={(conv) => {
                setConversations((prev) => prev.map((c) => (c.id === conv.id ? { ...c, ...conv } : c)));
              }}
            />
          ) : null
        }
        composeBar={
          <ComposeBar
            value={composerState}
            onChange={setComposerState}
            onSend={handleSend}
            sending={sending}
            conversation={selected}
            replyTo={replyTo}
            onClearReply={() => setReplyTo(null)}
            onOpenMetaTemplates={() => setMetaTemplatesOpen(true)}
          />
        }
      />
      <MetaTemplateSendDrawer
        open={metaTemplatesOpen}
        conversationId={selectedId}
        onClose={() => setMetaTemplatesOpen(false)}
        onSent={(msg) => {
          handleTemplateSent(msg);
          loadConversations();
        }}
      />
    </div>
  );
}
