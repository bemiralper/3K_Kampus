"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useCommunicationSSE } from "@/hooks/useCommunicationSSE";
import { useAuth } from "@/lib/contexts/AuthContext";
import {
  ChatContextData,
  ChatMessageSearchHit,
  ChatQuickFilter,
  ConversationListItem,
  DEPARTMENT_LABELS,
  InboxPortal,
  MessageItem,
  accountLabel,
  archiveConversation,
  claimConversation,
  conversationInboxPath,
  deleteConversation,
  deleteMessage,
  fetchChatConversation,
  fetchConversationContext,
  fetchTemplates,
  inboxPortalDepartment,
  markAllConversationsRead,
  markConversationRead,
  markConversationUnread,
  muteConversation,
  pinConversation,
  pinMessage,
  searchMessagesInConversation,
  sendMessageReaction,
  starMessage,
} from "@/lib/communication-api";

import { conversationTitle, messagePreview, sortConversations } from "./chat-utils";
import { ChatComposer, QuickReply } from "./ChatComposer";
import { ChatConfirmDialog, ConfirmState } from "./ChatDialog";
import {
  ForwardDialog,
  NewChatDialog,
  StarredDialog,
  TransferDialog,
} from "./ChatDialogs";
import { ChatHeader } from "./ChatHeader";
import { ChatInfoPanel } from "./ChatInfoPanel";
import { ChatSidebar } from "./ChatSidebar";
import { ChatTemplateSheet } from "./ChatTemplateSheet";
import { ChatTimeline } from "./ChatTimeline";
import { IconAlert, IconRefresh } from "./icons";
import { useChatConversations } from "./useChatConversations";
import { useChatThread } from "./useChatThread";
import { OpenConversationTarget, useOpenConversation } from "./useOpenConversation";

import "./chat.css";

/** Mobilde aynı anda tek ekran gösterilir. */
type MobilePane = "list" | "thread" | "info";

interface Props {
  portal: InboxPortal;
  initialConversationId?: string | null;
  /** `?filter=` ile gelen başlangıç hızlı filtresi (ör. iletişim panelinden). */
  initialFilter?: ChatQuickFilter | null;
  /** Öğrenci detay sayfası bağlantısı — portala göre değişir. */
  studentHref?: (studentId: number) => string;
  /**
   * `page`: tam sohbetler sayfası (liste + akış + bilgi paneli).
   * `drawer`: yalnızca tek sohbet akışı — öğrenci/veli/personel kartından açılan
   * yan panel. Liste, yeni sohbet ve liste kısayolları gösterilmez.
   */
  variant?: "page" | "drawer";
  /** Telefon numarasından açılacak sohbet (drawer kullanımı). */
  initialOpen?: OpenConversationTarget | null;
  /** Drawer kabuğunun kapatılması istendiğinde (mobil geri, sohbet silindi…). */
  onRequestClose?: () => void;
}

export function ChatWorkspace({
  portal,
  initialConversationId,
  initialFilter,
  studentHref,
  variant = "page",
  initialOpen,
  onRequestClose,
}: Props) {
  const isDrawer = variant === "drawer";
  const department = inboxPortalDepartment(portal);
  const list = useChatConversations({ department, initialQuick: initialFilter ?? undefined });
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;

  const [selectedId, setSelectedId] = useState<string | null>(initialConversationId ?? null);
  const [mobilePane, setMobilePane] = useState<MobilePane>(
    initialConversationId || isDrawer ? "thread" : "list",
  );
  const [infoOpen, setInfoOpen] = useState(false);
  const [context, setContext] = useState<ChatContextData | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  /** Bağlamı yüklenmiş sohbetin kimliği — panel kapanıp açılınca tekrar istenmesin. */
  const contextForRef = useRef<string | null>(null);

  const [replyTo, setReplyTo] = useState<MessageItem | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [starredOpen, setStarredOpen] = useState(false);
  const [forwardMessageId, setForwardMessageId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [online, setOnline] = useState(true);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHits, setSearchHits] = useState<ChatMessageSearchHit[]>([]);
  const [searchCursor, setSearchCursor] = useState(0);
  const [jump, setJump] = useState<{ conversationId: string; messageId: string } | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);

  const listSearchRef = useRef<HTMLInputElement>(null);
  const threadSearchRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  // Açık sohbet listeden bağımsız yaşar: okundu işaretlenince "Okunmamış"
  // filtresinden düşebilir, derin bağlantıyla gelen sohbet ise ilk sayfada ya
  // da portalın departmanında hiç olmayabilir. Her iki durumda da ekranda kalır.
  const [detached, setDetached] = useState<ConversationListItem | null>(null);
  const [detachedError, setDetachedError] = useState<string | null>(null);

  useEffect(() => {
    if (!initialConversationId) return;
    setSelectedId(initialConversationId);
    setMobilePane("thread");
    setDetachedError(null);
  }, [initialConversationId]);

  // ── Telefondan sohbet açma (drawer) ──
  // Açılan sohbet listede olmayabilir; `detached` üzerinden ekranda tutulur.
  const opener = useOpenConversation({ target: isDrawer ? initialOpen : null, portal });
  useEffect(() => {
    if (!opener.conversation) return;
    setDetached(opener.conversation);
    setDetachedError(null);
    setSelectedId(opener.conversation.id);
    setMobilePane("thread");
  }, [opener.conversation]);

  const listSelected = useMemo(
    () => list.items.find((c) => c.id === selectedId) ?? null,
    [list.items, selectedId],
  );
  const selected = useMemo(
    () => listSelected ?? (detached?.id === selectedId ? detached : null),
    [listSelected, detached, selectedId],
  );

  useEffect(() => {
    if (listSelected) {
      setDetached(listSelected);
      setDetachedError(null);
    }
  }, [listSelected]);

  useEffect(() => {
    if (!selectedId || listSelected || detached?.id === selectedId) return;
    let cancelled = false;
    fetchChatConversation(selectedId)
      .then((conv) => {
        if (cancelled) return;
        setDetached(conv);
        setDetachedError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setDetachedError(err instanceof Error ? err.message : "Sohbet açılamadı.");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, listSelected, detached?.id]);

  // Açık sohbet, filtre dışında kalsa bile listede görünür ve seçili kalır.
  const sidebarItems = useMemo(
    () =>
      selected && !listSelected
        ? sortConversations([selected, ...list.items])
        : list.items,
    [selected, listSelected, list.items],
  );

  /** Satırı hem listede hem de listeden düşmüş açık sohbette günceller. */
  const applyConversation = useCallback(
    (conv: ConversationListItem) => {
      list.patchConversation(conv);
      setDetached((prev) => (prev && prev.id === conv.id ? { ...prev, ...conv } : prev));
    },
    [list.patchConversation],
  );

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => (current === message ? null : current)), 3200);
  }, []);

  const thread = useChatThread({
    conversationId: selectedId,
    onSent: () => {
      setReplyTo(null);
      void list.reload({ silent: true });
    },
    onSessionClosed: () => {
      setTemplateOpen(true);
      showToast("24 saatlik pencere kapalı — onaylı şablon gerekiyor.");
    },
  });

  // ── Bağlantı durumu ──
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // ── Adres çubuğunu seçili sohbetle eşitle (yenilemeden) ──
  // Drawer başka bir sayfanın (öğrenci detayı vb.) üstünde açılır; adresi bozmaz.
  useEffect(() => {
    if (typeof window === "undefined" || isDrawer) return;
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get("conversation");
    // İlk karede seçim henüz yokken adresteki sohbeti silme; bildirim
    // bağlantısı aksi halde listeye düşüp kayboluyordu.
    if (!selectedId && fromUrl) {
      setSelectedId(fromUrl);
      setMobilePane("thread");
      setDetachedError(null);
      return;
    }
    if (selectedId) url.searchParams.set("conversation", selectedId);
    else url.searchParams.delete("conversation");
    const next = `${url.pathname}${url.search}`;
    const current = `${window.location.pathname}${window.location.search}`;
    if (next !== current) window.history.replaceState(null, "", url.toString());
  }, [selectedId, isDrawer]);

  // ── Canlı güncelleme ──
  const onRealtime = useCallback(
    (payload?: { conversation_ids?: string[] }) => {
      const touched = payload?.conversation_ids;
      if (!touched || touched.length === 0) {
        // Hangi sohbetlerin değiştiği bilinmiyor (yoklama düşüşü vb.): tüm liste tazelenir.
        void list.reload({ silent: true });
      } else {
        // Yalnızca dokunulan satırlar çekilir; liste baştan yüklenmez.
        void Promise.allSettled(touched.map((id) => fetchChatConversation(id))).then((results) => {
          const rows = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
          if (!rows.length) return;
          const listIds = new Set(list.items.map((c) => c.id));
          list.patchMany(rows.filter((c) => listIds.has(c.id)));
          // Listede olmayan ama açık olan sohbetin satırı (24 saat penceresi, başlık) tazelensin.
          const selectedRow = rows.find((c) => c.id === selectedId && !listIds.has(c.id));
          if (selectedRow) setDetached(selectedRow);
          // Listede hiç olmayan yeni bir sohbet geldiyse görünmesi için liste tazelenir.
          if (rows.some((c) => !listIds.has(c.id) && c.id !== selectedId)) {
            void list.reload({ silent: true });
          }
        });
      }
      if (!selectedId) return;
      if (!touched || touched.length === 0 || touched.includes(selectedId)) {
        // `after=` yanıtı durum değişikliklerini de içerir; ayrı durum tazelemesi gerekmez.
        void thread.refreshTail();
      }
    },
    [list, selectedId, thread],
  );

  useCommunicationSSE({
    onUpdate: onRealtime,
    onFallbackPoll: () => onRealtime(),
  });

  // ── Seçili sohbet değişti: yazma/arama durumunu sıfırla ──
  useEffect(() => {
    setContext(null);
    contextForRef.current = null;
    if (!selectedId) return;
    setReplyTo(null);
    setSearchOpen(false);
    setSearchQuery("");
    setSearchHits([]);
  }, [selectedId]);

  // ── Bağlam (öğrenci/veli bilgisi) yalnızca bilgi paneli açıkken yüklenir ──
  useEffect(() => {
    if (!selectedId || !infoOpen) return;
    // Aynı sohbet için zaten yüklendiyse panel her açılışta yeniden istenmez.
    if (contextForRef.current === selectedId) return;
    let cancelled = false;
    setContextLoading(true);
    fetchConversationContext(selectedId)
      .then((data) => {
        if (cancelled) return;
        setContext(data);
        contextForRef.current = selectedId;
      })
      .catch(() => {
        if (!cancelled) setContext(null);
      })
      .finally(() => {
        if (!cancelled) setContextLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, infoOpen]);

  useEffect(() => {
    if (!selected || (selected.unread_count_coach || 0) === 0) return;
    void markConversationRead(selected.id)
      .then(applyConversation)
      .catch(() => undefined);
  }, [selected, applyConversation]);

  // ── Hazır cevaplar ──
  useEffect(() => {
    fetchTemplates()
      .then((data) =>
        setQuickReplies(
          (data.templates || [])
            .filter((t) => t.is_active)
            .map((t) => ({
              id: t.id,
              name: t.name,
              body: t.body,
              category: t.category,
              categoryLabel: t.category_label || t.category,
            })),
        ),
      )
      .catch(() => setQuickReplies([]));
  }, []);

  // ── Sohbet içi arama ──
  useEffect(() => {
    if (!searchOpen || !selectedId || searchQuery.trim().length < 2) {
      setSearchHits([]);
      setSearchCursor(0);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      searchMessagesInConversation(selectedId, searchQuery.trim())
        .then((data) => {
          if (cancelled) return;
          setSearchHits(data.results);
          setSearchCursor(Math.max(0, data.results.length - 1));
        })
        .catch(() => {
          if (!cancelled) setSearchHits([]);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [searchOpen, searchQuery, selectedId]);

  // Yıldızlı mesajdan sohbete atlama: önce sohbet seçilir, ilk sayfa yüklendikten
  // sonra hedef mesajın etrafındaki pencere getirilir (iki istek yarışmasın diye).
  useEffect(() => {
    if (!jump) return;
    if (selectedId !== jump.conversationId) {
      setSelectedId(jump.conversationId);
      setMobilePane("thread");
      return;
    }
    if (thread.loading) return;
    const messageId = jump.messageId;
    setHighlightId(messageId);
    setJump(null);
    window.setTimeout(
      () => setHighlightId((current) => (current === messageId ? null : current)),
      4000,
    );
  }, [jump, selectedId, thread.loading]);

  const focusedMessageId = searchHits[searchCursor]?.id ?? highlightId;

  useEffect(() => {
    if (focusedMessageId) void thread.loadAround(focusedMessageId);
    // thread referansı her renderda değişiyor; yalnızca odak değişimini izliyoruz
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedMessageId]);

  const stepSearch = useCallback(
    (direction: 1 | -1) => {
      if (!searchHits.length) return;
      setSearchCursor((prev) => {
        const next = prev + direction;
        if (next < 0) return searchHits.length - 1;
        if (next >= searchHits.length) return 0;
        return next;
      });
    },
    [searchHits.length],
  );

  // ── Sohbet aksiyonları ──
  const selectConversation = useCallback((conv: ConversationListItem) => {
    setSelectedId(conv.id);
    setDetached(conv);
    setDetachedError(null);
    setMobilePane("thread");
  }, []);

  const togglePin = useCallback(
    async (conv: ConversationListItem) => {
      try {
        const updated = await pinConversation(conv.id, !conv.is_pinned);
        applyConversation(updated);
        showToast(updated.is_pinned ? "Sohbet sabitlendi." : "Sabitleme kaldırıldı.");
      } catch {
        showToast("İşlem tamamlanamadı.");
      }
    },
    [applyConversation, showToast],
  );

  const toggleMute = useCallback(
    async (conv: ConversationListItem) => {
      try {
        const updated = await muteConversation(conv.id, !conv.is_muted);
        applyConversation(updated);
        showToast(updated.is_muted ? "Bildirimler kapatıldı." : "Bildirimler açıldı.");
      } catch {
        showToast("İşlem tamamlanamadı.");
      }
    },
    [applyConversation, showToast],
  );

  const toggleArchive = useCallback(
    (conv: ConversationListItem) => {
      const archiving = conv.status !== "ARCHIVED";
      const run = async () => {
        try {
          const updated = await archiveConversation(conv.id, archiving);
          if (archiving && list.filters.quick !== "archived") {
            list.removeConversation(conv.id);
            // Drawer'da tek sohbet var; arşivlense de ekranda kalır.
            if (selectedId === conv.id && !isDrawer) {
              setSelectedId(null);
              setDetached(null);
            } else if (isDrawer) {
              setDetached((prev) => (prev && prev.id === conv.id ? { ...prev, ...updated } : prev));
            }
          } else {
            applyConversation(updated);
          }
          showToast(archiving ? "Sohbet arşivlendi." : "Sohbet arşivden çıkarıldı.");
        } catch {
          showToast("İşlem tamamlanamadı.");
        }
      };
      if (archiving) {
        setConfirm({
          title: "Sohbeti arşivle",
          description: `${conversationTitle(conv)} sohbeti arşive taşınacak. Yeni mesaj geldiğinde tekrar görünür.`,
          confirmLabel: "Arşivle",
          onConfirm: () => void run(),
        });
      } else {
        void run();
      }
    },
    [applyConversation, list, selectedId, showToast, isDrawer],
  );

  const toggleRead = useCallback(
    async (conv: ConversationListItem) => {
      try {
        const unread = (conv.unread_count_coach || 0) > 0;
        const updated = unread
          ? await markConversationRead(conv.id)
          : await markConversationUnread(conv.id);
        applyConversation(updated);
        if (!unread && selectedId === conv.id && !isDrawer) {
          setSelectedId(null);
          setDetached(null);
        }
      } catch {
        showToast("İşlem tamamlanamadı.");
      }
    },
    [applyConversation, selectedId, showToast, isDrawer],
  );

  const removeConversation = useCallback(
    (conv: ConversationListItem) => {
      setConfirm({
        title: "Sohbeti sil",
        description: `${conversationTitle(conv)} sohbeti listenizden kaldırılacak. Mesaj geçmişi kayıt amacıyla saklanır ancak sohbet ekranında görünmez.`,
        confirmLabel: "Sil",
        danger: true,
        onConfirm: () => {
          void deleteConversation(conv.id)
            .then(() => {
              list.removeConversation(conv.id);
              if (selectedId === conv.id) {
                setSelectedId(null);
                setDetached(null);
                if (isDrawer) onRequestClose?.();
                else setMobilePane("list");
              }
              showToast("Sohbet silindi.");
            })
            .catch(() => showToast("Sohbet silinemedi."));
        },
      });
    },
    [list, selectedId, showToast, isDrawer, onRequestClose],
  );

  const claim = useCallback(async () => {
    if (!selected) return;
    try {
      const updated = await claimConversation(selected.id, selected.claim_version);
      applyConversation(updated);
      showToast("Sohbeti üstlendiniz.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Sohbet üstlenilemedi.");
    }
  }, [selected, applyConversation, showToast]);

  const markAllRead = useCallback(() => {
    setConfirm({
      title: "Tümünü okundu yap",
      description: "Görünen tüm sohbetler okundu olarak işaretlenecek.",
      confirmLabel: "Okundu yap",
      onConfirm: () => {
        void markAllConversationsRead()
          .then((res) => {
            showToast(`${res.updated} sohbet okundu olarak işaretlendi.`);
            void list.reload({ silent: true });
          })
          .catch(() => showToast("İşlem tamamlanamadı."));
      },
    });
  }, [list, showToast]);

  // ── Mesaj aksiyonları ──
  const messageActions = useMemo(
    () => ({
      onReply: (message: MessageItem) => setReplyTo(message),
      onForward: (message: MessageItem) => setForwardMessageId(message.id),
      onCopy: (message: MessageItem) => {
        void navigator.clipboard
          ?.writeText(messagePreview(message))
          .then(() => showToast("Mesaj kopyalandı."))
          .catch(() => showToast("Kopyalanamadı."));
      },
      onPin: (message: MessageItem) => {
        if (!selectedId) return;
        void pinMessage(selectedId, message.id, !message.is_pinned)
          .then((updated) => {
            thread.applyPin(updated);
            showToast(updated.is_pinned ? "Mesaj sabitlendi." : "Sabitleme kaldırıldı.");
          })
          .catch(() => showToast("İşlem tamamlanamadı."));
      },
      onStar: (message: MessageItem) => {
        if (!selectedId) return;
        void starMessage(selectedId, message.id, !message.is_starred)
          .then((updated) => {
            thread.patchMessage(updated);
            showToast(updated.is_starred ? "Mesaj yıldızlandı." : "Yıldız kaldırıldı.");
          })
          .catch(() => showToast("İşlem tamamlanamadı."));
      },
      onDelete: (message: MessageItem) => {
        if (!selectedId) return;
        setConfirm({
          title: "Mesajı sil",
          description:
            "Mesaj bu ekrandan kaldırılacak. WhatsApp tarafında karşı taraftan silinmez.",
          confirmLabel: "Sil",
          danger: true,
          onConfirm: () => {
            void deleteMessage(selectedId, message.id)
              .then(() => {
                thread.dropMessage(message.id);
                showToast("Mesaj silindi.");
              })
              .catch(() => showToast("Mesaj silinemedi."));
          },
        });
      },
      onReact: (message: MessageItem, emoji: string) => {
        if (!selectedId) return;
        void sendMessageReaction(selectedId, message.id, emoji)
          .then(() => thread.refreshStatuses())
          .catch(() => showToast("Tepki gönderilemedi."));
      },
    }),
    [selectedId, thread, showToast],
  );

  // ── Klavye kısayolları ──
  // Bir pencere/sayfa (şablon, yeni sohbet, atama, yıldızlılar, iletme, onay) açıkken
  // tek tuş kısayolları çalışmaz; aksi halde arkadaki ekranda istenmeyen işlem tetiklenir.
  const dialogOpen =
    templateOpen ||
    newChatOpen ||
    transferOpen ||
    starredOpen ||
    !!forwardMessageId ||
    !!confirm;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialogOpen) return;
      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f" && selectedId) {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (isDrawer) {
        // Drawer'da liste yok: yalnızca sohbet içi arama ve Escape çalışır.
        // Escape önce arama/bilgi panelini kapatır; kabuk (provider) ancak bunlar
        // kapalıyken `defaultPrevented` olmayan Escape ile kendini kapatır.
        if (e.key === "Escape" && (searchOpen || infoOpen)) {
          e.preventDefault();
          if (searchOpen) setSearchOpen(false);
          else setInfoOpen(false);
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        listSearchRef.current?.focus();
        return;
      }
      if (typing) return;
      if (e.key === "/") {
        e.preventDefault();
        listSearchRef.current?.focus();
        return;
      }
      if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        setNewChatOpen(true);
        return;
      }
      if (e.key.toLowerCase() === "u" && selected) {
        e.preventDefault();
        void toggleRead(selected);
        return;
      }
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && sidebarItems.length) {
        e.preventDefault();
        const index = sidebarItems.findIndex((c) => c.id === selectedId);
        const next = e.key === "ArrowDown" ? index + 1 : index - 1;
        const target2 = sidebarItems[Math.min(Math.max(0, next), sidebarItems.length - 1)];
        if (target2) selectConversation(target2);
        return;
      }
      if (e.key === "Escape") {
        if (searchOpen) setSearchOpen(false);
        else if (infoOpen) setInfoOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    dialogOpen,
    isDrawer,
    selectedId,
    selected,
    sidebarItems,
    searchOpen,
    infoOpen,
    toggleRead,
    selectConversation,
  ]);

  const composerDisabled = !selected;

  // Drawer: hesap seçimi + tam ekran bağlantısı (eski sohbet penceresiyle aynı).
  const drawerBar = isDrawer ? (
    <div className="chat-drawer-bar">
      {opener.accounts.length > 1 ? (
        <label className="chat-drawer-account">
          <span>WhatsApp hesabı (birim)</span>
          <select
            value={opener.accountId}
            disabled={opener.opening}
            onChange={(e) => opener.setAccountId(e.target.value)}
            aria-label="WhatsApp hesabı"
          >
            {opener.accounts.map((acc) => {
              const dept = acc.department
                ? DEPARTMENT_LABELS[String(acc.department)] || String(acc.department)
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
      ) : (
        <span />
      )}
      {selected ? (
        <Link
          href={conversationInboxPath(selected.id, portal)}
          className="chat-btn chat-btn--soft chat-drawer-fullscreen"
          onClick={() => onRequestClose?.()}
        >
          Tam ekran
        </Link>
      ) : null}
      {selected && opener.opening ? (
        <p className="chat-drawer-status" role="status">
          Konuşma açılıyor…
        </p>
      ) : selected && opener.error ? (
        <p className="chat-drawer-status is-error" role="alert">
          {opener.error}
        </p>
      ) : null}
    </div>
  ) : null;

  const drawerOpening = isDrawer && opener.opening;
  const drawerError = isDrawer && !opener.opening ? opener.error : null;

  return (
    <div
      className={`chat-workspace chat-workspace--${variant} pane-${mobilePane}${
        infoOpen ? " info-open" : ""
      }`}
      data-portal={portal}
    >
      {!online ? (
        <div className="chat-offline-bar">
          <IconAlert size={16} />
          İnternet bağlantısı yok. Mesajlar bağlantı geri geldiğinde gönderilebilir.
        </div>
      ) : null}

      {drawerBar}

      <div className="chat-panes">
        {!isDrawer ? (
          <ChatSidebar
            items={sidebarItems}
            selectedId={selectedId}
            loading={list.loading}
            loadingMore={list.loadingMore}
            hasMore={list.hasMore}
            error={list.error}
            total={list.total}
            unreadConversations={list.unreadConversations}
            filters={list.filters}
            onFiltersChange={list.setFilters}
            onSelect={selectConversation}
            onLoadMore={list.loadMore}
            onNewChat={() => setNewChatOpen(true)}
            onMarkAllRead={markAllRead}
            onOpenStarred={() => setStarredOpen(true)}
            actions={{
              onPin: togglePin,
              onMute: toggleMute,
              onArchive: toggleArchive,
              onToggleRead: toggleRead,
              onDelete: removeConversation,
            }}
            searchInputRef={listSearchRef}
          />
        ) : null}

        <section className="chat-main" aria-label="Mesajlaşma">
          {!selected ? (
            <div className="chat-placeholder">
              <div className="chat-placeholder-mark" aria-hidden="true" />
              {drawerError ? (
                <>
                  <p className="chat-placeholder-title">Konuşma açılamadı</p>
                  <p className="chat-placeholder-text">{drawerError}</p>
                </>
              ) : drawerOpening || (isDrawer && initialOpen?.phone) ? (
                <p className="chat-placeholder-text">Konuşma açılıyor…</p>
              ) : selectedId && detachedError ? (
                <>
                  <p className="chat-placeholder-title">Sohbet açılamadı</p>
                  <p className="chat-placeholder-text">{detachedError}</p>
                </>
              ) : selectedId ? (
                <p className="chat-placeholder-text">Sohbet açılıyor…</p>
              ) : (
                <>
                  <p className="chat-placeholder-title">Sohbet seçilmedi</p>
                  <p className="chat-placeholder-text">
                    Soldaki listeden bir sohbet seçin ya da yeni bir sohbet başlatın. Arama için{" "}
                    <kbd>/</kbd>, yeni sohbet için <kbd>N</kbd> tuşunu kullanabilirsiniz.
                  </p>
                </>
              )}
            </div>
          ) : (
            <>
              <ChatHeader
                conversation={selected}
                context={context}
                infoOpen={infoOpen}
                searchOpen={searchOpen}
                searchQuery={searchQuery}
                searchResultCount={searchHits.length}
                searchCursor={searchCursor}
                onToggleInfo={() => {
                  setInfoOpen((v) => !v);
                  setMobilePane((pane) => (pane === "info" ? "thread" : "info"));
                }}
                onToggleSearch={() => {
                  setSearchOpen((v) => !v);
                  setSearchQuery("");
                }}
                onSearchChange={setSearchQuery}
                onSearchStep={stepSearch}
                onBack={() => {
                  if (isDrawer) {
                    onRequestClose?.();
                    return;
                  }
                  setMobilePane("list");
                  setSelectedId(null);
                }}
                actions={{
                  onPin: () => togglePin(selected),
                  onMute: () => toggleMute(selected),
                  onArchive: () => toggleArchive(selected),
                  onMarkUnread: () => toggleRead(selected),
                  onDelete: () => removeConversation(selected),
                  onTransfer: () => setTransferOpen(true),
                  onClaim: claim,
                }}
                searchRef={threadSearchRef}
              />

              <ChatTimeline
                messages={thread.messages}
                pinnedMessage={thread.pinnedMessage}
                pending={thread.pending}
                loading={thread.loading}
                loadingOlder={thread.loadingOlder}
                hasMore={thread.hasMore}
                error={thread.error}
                searchQuery={searchOpen ? searchQuery : ""}
                focusedMessageId={focusedMessageId}
                actions={messageActions}
                canModerate={selected.can_moderate !== false}
                currentUserId={currentUserId}
                onLoadOlder={thread.loadOlder}
                onRetryPending={thread.retryPending}
                onDiscardPending={thread.discardPending}
                onResendFailed={(message) => {
                  const body = message.body?.trim();
                  if (!body) {
                    showToast("Bu mesajın metni yok; yeniden göndermek için yazın.");
                    return;
                  }
                  void thread.send(body, { replyToId: message.reply_to?.id });
                }}
                onJumpToMessage={(messageId) =>
                  selectedId && setJump({ conversationId: selectedId, messageId })
                }
              />

              {thread.error ? (
                <button
                  type="button"
                  className="chat-retry-bar"
                  onClick={() => void thread.reload()}
                >
                  <IconRefresh size={16} /> Yeniden dene
                </button>
              ) : null}

              <ChatComposer
                session={selected.session}
                replyTo={replyTo}
                sending={thread.sending}
                disabled={composerDisabled}
                quickReplies={quickReplies}
                onSend={(text, file) =>
                  void thread.send(text, { file, replyToId: replyTo?.id })
                }
                onCancelReply={() => setReplyTo(null)}
                onOpenTemplates={() => setTemplateOpen(true)}
                onUseQuickReply={() => composerRef.current?.focus()}
                composerRef={composerRef}
              />
            </>
          )}
        </section>

        {selected && infoOpen ? (
          <ChatInfoPanel
            conversation={selected}
            context={context}
            loading={contextLoading}
            studentHref={studentHref}
            onClose={() => {
              setInfoOpen(false);
              setMobilePane("thread");
            }}
            onTransfer={() => setTransferOpen(true)}
            onConversationPatched={applyConversation}
          />
        ) : null}
      </div>

      {toast ? <div className="chat-toast">{toast}</div> : null}

      <ChatTemplateSheet
        open={templateOpen}
        conversationId={selectedId}
        // Drawer'da alıcı türü açan karttan bilinir (veli sekmesi → VELI); eski pencereyle aynı.
        contactType={
          isDrawer
            ? initialOpen?.veliId
              ? "VELI"
              : initialOpen?.ogrenciId
                ? "OGRENCI"
                : selected?.contact_type
            : undefined
        }
        onClose={() => setTemplateOpen(false)}
        onSent={() => {
          showToast("Şablon gönderildi.");
          void thread.refreshTail();
          void list.reload({ silent: true });
        }}
      />

      <NewChatDialog
        open={newChatOpen && !isDrawer}
        department={department}
        onClose={() => setNewChatOpen(false)}
        onOpened={(conv) => {
          void list.reload({ silent: true });
          setSelectedId(conv.id);
          setMobilePane("thread");
        }}
      />

      <ForwardDialog
        open={!!forwardMessageId}
        sourceConversationId={selectedId}
        messageId={forwardMessageId}
        conversations={list.items}
        onClose={() => setForwardMessageId(null)}
        onDone={(message) => {
          showToast(message);
          void list.reload({ silent: true });
        }}
      />

      <TransferDialog
        open={transferOpen}
        conversation={selected}
        onClose={() => setTransferOpen(false)}
        onTransferred={(conv, message) => {
          applyConversation(conv);
          showToast(message);
        }}
      />

      <StarredDialog
        open={starredOpen}
        onClose={() => setStarredOpen(false)}
        onJump={(conversationId, messageId) => setJump({ conversationId, messageId })}
      />

      <ChatConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}
