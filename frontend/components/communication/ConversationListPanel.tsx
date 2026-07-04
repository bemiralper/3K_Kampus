"use client";

import { ConversationFilter, ConversationListItem, formatMessageTime } from "@/lib/communication-api";

const FILTER_TABS: { id: ConversationFilter; label: string }[] = [
  { id: "all", label: "Tümü" },
  { id: "unread", label: "Okunmamış" },
  { id: "archived", label: "Arşiv" },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return "?";
}

interface ConversationListPanelProps {
  conversations: ConversationListItem[];
  selectedId: string | null;
  filter: ConversationFilter;
  search: string;
  onFilterChange: (filter: ConversationFilter) => void;
  onSearchChange: (search: string) => void;
  onSelect: (conv: ConversationListItem) => void;
  error?: string | null;
  className?: string;
}

export default function ConversationListPanel({
  conversations,
  selectedId,
  filter,
  search,
  onFilterChange,
  onSearchChange,
  onSelect,
  error,
  className = "",
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

      <ul className="comm-inbox-list" role="list">
        {conversations.length === 0 ? (
          <li className="comm-thread-empty" style={{ minHeight: 120 }}>
            <span className="comm-thread-empty-icon">💬</span>
            <p>Henüz konuşma yok.</p>
          </li>
        ) : (
          conversations.map((conv) => {
            const displayName = conv.contact_name || conv.contact_phone;
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
                    {initials(displayName)}
                  </div>
                  <div className="comm-inbox-item-content">
                    <div className="comm-inbox-row">
                      <span className="comm-inbox-name">{displayName}</span>
                      <span className="comm-inbox-time">
                        {formatMessageTime(conv.last_message_at)}
                      </span>
                    </div>
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
                  </div>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </aside>
  );
}
