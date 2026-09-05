"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type {
  ChatContactKind,
  ChatQuickFilter,
  ChatTimeFilter,
  ConversationListItem,
} from "@/lib/communication-api";

import {
  CONTACT_KIND_LABELS,
  avatarTone,
  conversationSubtitle,
  conversationTitle,
  initials,
  listTimestamp,
  splitHighlight,
} from "./chat-utils";
import { ChatMenu, ChatMenuItem, anchorFromEvent } from "./ChatMenu";
import {
  IconArchive,
  IconBell,
  IconBellOff,
  IconCheck,
  IconClose,
  IconFilter,
  IconMore,
  IconNewChat,
  IconPin,
  IconSearch,
  IconStar,
  IconTrash,
} from "./icons";
import type { ChatFilters } from "./useChatConversations";

const QUICK_FILTERS: Array<{ id: ChatQuickFilter; label: string }> = [
  { id: "all", label: "Tümü" },
  { id: "unread", label: "Okunmamış" },
  { id: "awaiting_reply", label: "Cevap bekleyen" },
  { id: "pinned", label: "Sabitlenenler" },
  { id: "read", label: "Okunmuş" },
  { id: "archived", label: "Arşiv" },
];

const KIND_ORDER: ChatContactKind[] = ["ogrenci", "veli", "koc", "ogretmen", "diger"];

const TIME_OPTIONS: Array<{ id: ChatTimeFilter; label: string }> = [
  { id: "all", label: "Tüm zamanlar" },
  { id: "24h", label: "Son 24 saat" },
  { id: "7d", label: "Son 7 gün" },
  { id: "30d", label: "Son 30 gün" },
];

export interface ConversationRowActions {
  onPin: (conv: ConversationListItem) => void;
  onMute: (conv: ConversationListItem) => void;
  onArchive: (conv: ConversationListItem) => void;
  onToggleRead: (conv: ConversationListItem) => void;
  onDelete: (conv: ConversationListItem) => void;
}

interface Props {
  items: ConversationListItem[];
  selectedId: string | null;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  total: number;
  unreadConversations: number;
  filters: ChatFilters;
  onFiltersChange: (next: ChatFilters) => void;
  onSelect: (conv: ConversationListItem) => void;
  onLoadMore: () => void;
  onNewChat: () => void;
  onMarkAllRead: () => void;
  onOpenStarred: () => void;
  actions: ConversationRowActions;
  searchInputRef?: React.RefObject<HTMLInputElement>;
}

export function ChatSidebar({
  items,
  selectedId,
  loading,
  loadingMore,
  hasMore,
  error,
  total,
  unreadConversations,
  filters,
  onFiltersChange,
  onSelect,
  onLoadMore,
  onNewChat,
  onMarkAllRead,
  onOpenStarred,
  actions,
  searchInputRef,
}: Props) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<{
    conv: ConversationListItem;
    anchor: { x: number; y: number };
  } | null>(null);
  const [headerMenu, setHeaderMenu] = useState<{ x: number; y: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);

  // Sonsuz kaydırma: liste dibine yaklaşınca bir sonraki sayfa istenir.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = listRef.current;
    if (!sentinel || !root || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { root, rootMargin: "240px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, onLoadMore, items.length]);

  useEffect(() => {
    if (!filterOpen) return;
    const onDown = (e: MouseEvent) => {
      if (filterPanelRef.current && !filterPanelRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [filterOpen]);

  const activeExtraFilters =
    filters.kinds.length + (filters.time !== "all" ? 1 : 0);

  const rowMenuItems = useMemo<ChatMenuItem[]>(() => {
    const conv = menuFor?.conv;
    if (!conv) return [];
    const unread = (conv.unread_count_coach || 0) > 0;
    return [
      {
        id: "pin",
        label: conv.is_pinned ? "Sabitlemeyi kaldır" : "Sabitle",
        icon: <IconPin size={16} />,
        onSelect: () => actions.onPin(conv),
      },
      {
        id: "read",
        label: unread ? "Okundu olarak işaretle" : "Okunmadı olarak işaretle",
        icon: <IconCheck size={16} />,
        onSelect: () => actions.onToggleRead(conv),
      },
      {
        id: "mute",
        label: conv.is_muted ? "Bildirimleri aç" : "Bildirimleri kapat",
        icon: conv.is_muted ? <IconBell size={16} /> : <IconBellOff size={16} />,
        onSelect: () => actions.onMute(conv),
      },
      {
        id: "archive",
        label: conv.status === "ARCHIVED" ? "Arşivden çıkar" : "Arşivle",
        icon: <IconArchive size={16} />,
        onSelect: () => actions.onArchive(conv),
      },
      {
        id: "delete",
        label: "Sohbeti sil",
        icon: <IconTrash size={16} />,
        danger: true,
        separated: true,
        onSelect: () => actions.onDelete(conv),
      },
    ];
  }, [menuFor, actions]);

  return (
    <aside className="chat-sidebar" aria-label="Sohbet listesi">
      <div className="chat-sidebar-top">
        <div className="chat-sidebar-title">
          <h1>Sohbetler</h1>
          {unreadConversations > 0 ? (
            <span className="chat-count-pill" title="Okunmamış sohbet sayısı">
              {unreadConversations}
            </span>
          ) : null}
        </div>
        <div className="chat-sidebar-tools">
          <button
            type="button"
            className="chat-icon-btn"
            onClick={onNewChat}
            title="Yeni sohbet (N)"
            aria-label="Yeni sohbet"
          >
            <IconNewChat size={19} />
          </button>
          <button
            type="button"
            className="chat-icon-btn"
            onClick={(e) => setHeaderMenu(anchorFromEvent(e))}
            title="Diğer işlemler"
            aria-label="Diğer işlemler"
          >
            <IconMore size={19} />
          </button>
        </div>
      </div>

      <div className="chat-search">
        <IconSearch size={17} className="chat-search-icon" />
        <input
          ref={searchInputRef}
          type="search"
          value={filters.search}
          placeholder="İsim, telefon veya mesaj ara"
          onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
          aria-label="Sohbetlerde ara"
        />
        {filters.search ? (
          <button
            type="button"
            className="chat-search-clear"
            onClick={() => onFiltersChange({ ...filters, search: "" })}
            aria-label="Aramayı temizle"
          >
            <IconClose size={15} />
          </button>
        ) : null}
      </div>

      <div className="chat-filter-row">
        <div className="chat-chips" role="tablist" aria-label="Hızlı filtreler">
          {QUICK_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filters.quick === f.id}
              className={`chat-chip${filters.quick === f.id ? " is-active" : ""}`}
              onClick={() => onFiltersChange({ ...filters, quick: f.id })}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="chat-filter-more" ref={filterPanelRef}>
          <button
            type="button"
            className={`chat-icon-btn${activeExtraFilters ? " is-active" : ""}`}
            onClick={() => setFilterOpen((v) => !v)}
            title="Kişi türü ve zaman filtresi"
            aria-label="Gelişmiş filtreler"
            aria-expanded={filterOpen}
          >
            <IconFilter size={18} />
            {activeExtraFilters ? (
              <span className="chat-icon-dot">{activeExtraFilters}</span>
            ) : null}
          </button>
          {filterOpen ? (
            <div className="chat-filter-panel">
              <p className="chat-filter-label">Kişi türü</p>
              <div className="chat-chips chat-chips--wrap">
                {KIND_ORDER.map((kind) => {
                  const active = filters.kinds.includes(kind);
                  return (
                    <button
                      key={kind}
                      type="button"
                      className={`chat-chip${active ? " is-active" : ""}`}
                      onClick={() =>
                        onFiltersChange({
                          ...filters,
                          kinds: active
                            ? filters.kinds.filter((k) => k !== kind)
                            : [...filters.kinds, kind],
                        })
                      }
                    >
                      {CONTACT_KIND_LABELS[kind]}
                    </button>
                  );
                })}
              </div>
              <p className="chat-filter-label">Zaman</p>
              <div className="chat-chips chat-chips--wrap">
                {TIME_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`chat-chip${filters.time === opt.id ? " is-active" : ""}`}
                    onClick={() => onFiltersChange({ ...filters, time: opt.id })}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {activeExtraFilters ? (
                <button
                  type="button"
                  className="chat-link-btn"
                  onClick={() => onFiltersChange({ ...filters, kinds: [], time: "all" })}
                >
                  Filtreleri temizle
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="chat-list" ref={listRef} role="listbox" aria-label="Sohbetler">
        {loading ? (
          <ChatListSkeleton />
        ) : error ? (
          <div className="chat-list-state">
            <p className="chat-state-title">Sohbetler yüklenemedi</p>
            <p className="chat-state-text">{error}</p>
          </div>
        ) : items.length === 0 ? (
          <EmptyList filters={filters} />
        ) : (
          <>
            {items.map((conv) => (
              <ConversationRow
                key={conv.id}
                conv={conv}
                active={conv.id === selectedId}
                query={filters.search}
                onSelect={() => onSelect(conv)}
                onMenu={(e) => {
                  e.stopPropagation();
                  setMenuFor({ conv, anchor: anchorFromEvent(e) });
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenuFor({ conv, anchor: { x: e.clientX, y: e.clientY } });
                }}
              />
            ))}
            <div ref={sentinelRef} />
            {loadingMore ? <p className="chat-list-more">Yükleniyor…</p> : null}
            {!hasMore && items.length >= 20 ? (
              <p className="chat-list-more">Toplam {total} sohbet</p>
            ) : null}
          </>
        )}
      </div>

      <ChatMenu
        items={rowMenuItems}
        anchor={menuFor?.anchor ?? null}
        onClose={() => setMenuFor(null)}
      />
      <ChatMenu
        anchor={headerMenu}
        onClose={() => setHeaderMenu(null)}
        items={[
          {
            id: "read-all",
            label: "Tümünü okundu yap",
            icon: <IconCheck size={16} />,
            onSelect: onMarkAllRead,
          },
          {
            id: "starred",
            label: "Yıldızlı mesajlar",
            icon: <IconStar size={16} />,
            onSelect: onOpenStarred,
          },
        ]}
      />
    </aside>
  );
}

function EmptyList({ filters }: { filters: ChatFilters }) {
  if (filters.search.trim()) {
    return (
      <div className="chat-list-state">
        <p className="chat-state-title">Sonuç bulunamadı</p>
        <p className="chat-state-text">
          “{filters.search.trim()}” için eşleşen sohbet veya mesaj yok. Farklı bir isim,
          telefon numarası ya da kelime deneyin.
        </p>
      </div>
    );
  }
  if (filters.quick === "archived") {
    return (
      <div className="chat-list-state">
        <p className="chat-state-title">Arşiv boş</p>
        <p className="chat-state-text">Arşivlediğiniz sohbetler burada listelenir.</p>
      </div>
    );
  }
  if (filters.quick !== "all") {
    return (
      <div className="chat-list-state">
        <p className="chat-state-title">Bu filtrede sohbet yok</p>
        <p className="chat-state-text">Filtreyi değiştirerek diğer sohbetleri görebilirsiniz.</p>
      </div>
    );
  }
  return (
    <div className="chat-list-state">
      <p className="chat-state-title">Henüz sohbet yok</p>
      <p className="chat-state-text">
        Bir veli veya öğrenci WhatsApp üzerinden yazdığında sohbet burada açılır. Siz de
        “Yeni sohbet” ile başlatabilirsiniz.
      </p>
    </div>
  );
}

function ChatListSkeleton() {
  return (
    <div className="chat-skeleton-list" aria-hidden="true">
      {Array.from({ length: 8 }).map((_, i) => (
        <div className="chat-skeleton-row" key={i}>
          <span className="chat-skeleton-avatar" />
          <span className="chat-skeleton-lines">
            <span className="chat-skeleton-line" />
            <span className="chat-skeleton-line is-short" />
          </span>
        </div>
      ))}
    </div>
  );
}

function ConversationRow({
  conv,
  active,
  query,
  onSelect,
  onMenu,
  onContextMenu,
}: {
  conv: ConversationListItem;
  active: boolean;
  query: string;
  onSelect: () => void;
  onMenu: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const title = conversationTitle(conv);
  const subtitle = conversationSubtitle(conv);
  const unread = conv.unread_count_coach || 0;
  const preview = conv.last_message_preview || "";

  return (
    <div
      className={`chat-row${active ? " is-active" : ""}${unread ? " is-unread" : ""}`}
      role="option"
      aria-selected={active}
      tabIndex={0}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <Avatar name={title} photo={conv.profil_foto} />
      <div className="chat-row-main">
        <div className="chat-row-line">
          <span className="chat-row-name">
            <Highlight text={title} query={query} />
          </span>
          <span className="chat-row-time">{listTimestamp(conv.last_message_at)}</span>
        </div>
        <div className="chat-row-line">
          <span className="chat-row-preview">
            {preview ? <Highlight text={preview} query={query} /> : <em>Mesaj yok</em>}
          </span>
          <span className="chat-row-marks">
            {conv.is_muted ? <IconBellOff size={14} className="chat-row-mark" /> : null}
            {conv.is_pinned ? <IconPin size={14} className="chat-row-mark" /> : null}
            {unread > 0 ? <span className="chat-unread-badge">{unread > 99 ? "99+" : unread}</span> : null}
          </span>
        </div>
        <div className="chat-row-meta">
          {subtitle ? <span className="chat-row-tag">{subtitle}</span> : null}
          {conv.assigned_coach_name ? (
            <span className="chat-row-tag">{conv.assigned_coach_name}</span>
          ) : null}
          {conv.awaiting_reply ? (
            <span className="chat-row-tag is-warning">Cevap bekliyor</span>
          ) : null}
          {conv.status === "NEEDS_SUPPORT" ? (
            <span className="chat-row-tag is-danger">Destek gerekiyor</span>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        className="chat-row-menu"
        onClick={onMenu}
        aria-label={`${title} sohbet işlemleri`}
      >
        <IconMore size={17} />
      </button>
    </div>
  );
}

export function Avatar({
  name,
  photo,
  size = 44,
}: {
  name: string;
  photo?: string | null;
  size?: number;
}) {
  if (photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="chat-avatar"
        src={photo}
        alt=""
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="chat-avatar chat-avatar--initials"
      style={{
        width: size,
        height: size,
        background: avatarTone(name),
        fontSize: Math.round(size * 0.36),
      }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  return (
    <>
      {splitHighlight(text, query.trim()).map((part, i) =>
        part.hit ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>,
      )}
    </>
  );
}
