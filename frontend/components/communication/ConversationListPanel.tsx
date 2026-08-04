"use client";

import { ReactNode } from "react";
import {
  ConversationFilter,
  ConversationListItem,
  ConversationPeriod,
  conversationRelationLabel,
  formatMessageTime,
} from "@/lib/communication-api";

const FILTER_TABS: { id: ConversationFilter; label: string }[] = [
  { id: "all", label: "Tümü" },
  { id: "mine", label: "Benim Sohbetlerim" },
  { id: "new", label: "Yeni Gelenler" },
  { id: "needs_support", label: "Destek Gerekiyor" },
  { id: "unassigned", label: "Koç Atanmayanlar" },
  { id: "unread", label: "Okunmamış" },
  { id: "archived", label: "Arşiv" },
];

const PERIOD_TABS: { id: ConversationPeriod; label: string }[] = [
  { id: "7d", label: "Son 7 Gün" },
  { id: "30d", label: "Son 30 Gün" },
  { id: "year", label: "Bu Yıl" },
  { id: "all", label: "Tümü" },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return "?";
}

function statusLabel(conv: ConversationListItem): { text: string; className: string } | null {
  if (conv.status === "NEEDS_SUPPORT") {
    return { text: "Destek Gerekiyor", className: "is-support" };
  }
  if (conv.sla?.breached || (conv.sla?.waiting_seconds != null && conv.sla.waiting_seconds >= 1800)) {
    return { text: "⚠ Yanıt Bekliyor", className: "is-warn" };
  }
  if (conv.status === "NEW") return { text: "Yeni", className: "is-new" };
  if (!conv.claimed_by_user_id && !conv.assigned_coach_id) {
    return { text: "Yeni Gelen", className: "is-new" };
  }
  return null;
}

function formatWait(seconds?: number | null): string {
  if (seconds == null) return "";
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}dk`;
  const h = Math.floor(m / 60);
  return `${h}s ${m % 60}dk`;
}

interface ConversationListPanelProps {
  conversations: ConversationListItem[];
  selectedId: string | null;
  filter: ConversationFilter;
  period?: ConversationPeriod;
  search: string;
  onFilterChange: (filter: ConversationFilter) => void;
  onPeriodChange?: (period: ConversationPeriod) => void;
  onSearchChange: (search: string) => void;
  onSelect: (conv: ConversationListItem) => void;
  error?: string | null;
  className?: string;
  accountFilterSlot?: ReactNode;
}

export default function ConversationListPanel({
  conversations,
  selectedId,
  filter,
  period = "7d",
  search,
  onFilterChange,
  onPeriodChange,
  onSearchChange,
  onSelect,
  error,
  className = "",
  accountFilterSlot,
}: ConversationListPanelProps) {
  return (
    <aside className={`comm-inbox-sidebar ${className}`}>
      <div className="comm-inbox-filters" role="tablist" aria-label="Konuşma filtreleri">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={filter === tab.id}
            className={`comm-inbox-filter-btn${filter === tab.id ? " active" : ""}`}
            onClick={() => onFilterChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {onPeriodChange && (
        <div className="comm-inbox-period" role="tablist" aria-label="Zaman aralığı">
          {PERIOD_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`comm-period-btn${period === tab.id ? " active" : ""}`}
              onClick={() => onPeriodChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {accountFilterSlot && (
        <div className="comm-inbox-account-filter">{accountFilterSlot}</div>
      )}

      <div className="comm-inbox-search-wrap">
        <input
          type="search"
          className="comm-inbox-search"
          placeholder="Telefon veya isim ara…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Konuşma ara"
        />
      </div>

      {error && !selectedId && (
        <div className="comm-alert comm-alert-danger" style={{ margin: "8px 12px" }}>
          {error}
        </div>
      )}

      <div className="comm-inbox-list-scroll">
        {conversations.length === 0 ? (
          <div className="comm-thread-empty" style={{ minHeight: 120 }}>
            <span className="comm-thread-empty-icon">💬</span>
            <p>Henüz konuşma yok.</p>
          </div>
        ) : (
          <ul className="comm-inbox-list" role="list">
            {conversations.map((conv) => {
              const displayName = conv.contact_name || conv.contact_phone;
              const relation = conversationRelationLabel(conv);
              const badge = statusLabel(conv);
              const wait = formatWait(conv.sla?.waiting_seconds);
              return (
                <li key={conv.id}>
                  <button
                    type="button"
                    className={`comm-inbox-item${selectedId === conv.id ? " selected" : ""}${
                      conv.unread_count_coach > 0 ? " unread" : ""
                    }`}
                    onClick={() => onSelect(conv)}
                    aria-current={selectedId === conv.id ? "true" : undefined}
                  >
                    <div className="comm-inbox-avatar" aria-hidden="true">
                      {conv.profil_foto ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={conv.profil_foto} alt="" />
                      ) : (
                        initials(displayName)
                      )}
                    </div>
                    <div className="comm-inbox-item-content">
                      <div className="comm-inbox-row">
                        <span className="comm-inbox-name">{displayName}</span>
                        <span className="comm-inbox-time">
                          {formatMessageTime(conv.last_message_at)}
                        </span>
                      </div>
                      {relation && (
                        <div className="comm-inbox-relation">{relation}</div>
                      )}
                      <div className="comm-inbox-row">
                        <span className="comm-inbox-preview">
                          {conv.last_message_preview || "—"}
                        </span>
                        {conv.unread_count_coach > 0 && (
                          <span className="comm-inbox-badge" aria-label={`${conv.unread_count_coach} okunmamış`}>
                            {conv.unread_count_coach}
                          </span>
                        )}
                      </div>
                      <div className="comm-inbox-meta-row">
                        {badge && <span className={`comm-status-chip ${badge.className}`}>{badge.text}</span>}
                        {wait && <span className="comm-sla-chip">SLA {wait}</span>}
                        {conv.assigned_coach_name && (
                          <span className="comm-coach-chip">{conv.assigned_coach_name}</span>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
