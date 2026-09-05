"use client";

import { useEffect, useRef, useState } from "react";

import type { ChatContextData, ConversationListItem } from "@/lib/communication-api";

import { conversationSubtitle, conversationTitle, waitingLabel } from "./chat-utils";
import { ChatMenu, ChatMenuItem, anchorFromEvent } from "./ChatMenu";
import { Avatar } from "./ChatSidebar";
import {
  IconArchive,
  IconBack,
  IconBell,
  IconBellOff,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconClose,
  IconInfo,
  IconMore,
  IconPin,
  IconSearch,
  IconTransfer,
  IconTrash,
  IconUser,
} from "./icons";

export interface HeaderActions {
  onPin: () => void;
  onMute: () => void;
  onArchive: () => void;
  onMarkUnread: () => void;
  onDelete: () => void;
  onTransfer: () => void;
  onClaim: () => void;
}

interface Props {
  conversation: ConversationListItem;
  context: ChatContextData | null;
  infoOpen: boolean;
  searchOpen: boolean;
  searchQuery: string;
  searchResultCount: number;
  searchCursor: number;
  onToggleInfo: () => void;
  onToggleSearch: () => void;
  onSearchChange: (value: string) => void;
  onSearchStep: (direction: 1 | -1) => void;
  onBack: () => void;
  actions: HeaderActions;
  searchRef?: React.RefObject<HTMLInputElement>;
}

export function ChatHeader({
  conversation,
  context,
  infoOpen,
  searchOpen,
  searchQuery,
  searchResultCount,
  searchCursor,
  onToggleInfo,
  onToggleSearch,
  onSearchChange,
  onSearchStep,
  onBack,
  actions,
  searchRef,
}: Props) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const localSearchRef = useRef<HTMLInputElement>(null);
  const inputRef = searchRef ?? localSearchRef;

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen, inputRef]);

  const title = conversationTitle(conversation);
  const student = context?.ogrenci;
  const waiting = waitingLabel(conversation.sla?.waiting_seconds);

  const facts: string[] = [];
  if (student?.ad_soyad && student.ad_soyad !== title) facts.push(student.ad_soyad);
  if (student?.sinif || student?.sinif_seviyesi) {
    facts.push(student.sinif || student.sinif_seviyesi);
  }
  if (student?.sube) facts.push(student.sube);
  if (student?.koc) facts.push(`Koç: ${student.koc}`);
  if (!student) {
    const subtitle = conversationSubtitle(conversation);
    if (subtitle) facts.push(subtitle);
  }
  if (conversation.contact_phone) facts.push(conversation.contact_phone);

  const menuItems: ChatMenuItem[] = [
    {
      id: "unread",
      label: "Okunmadı olarak işaretle",
      icon: <IconCheck size={16} />,
      onSelect: actions.onMarkUnread,
    },
    {
      id: "transfer",
      label: "Sohbeti başka personele ata",
      icon: <IconTransfer size={16} />,
      onSelect: actions.onTransfer,
    },
    ...(conversation.can_claim
      ? [
          {
            id: "claim",
            label: "Sohbeti üstlen",
            icon: <IconUser size={16} />,
            onSelect: actions.onClaim,
          },
        ]
      : []),
    {
      id: "delete",
      label: "Sohbeti sil",
      icon: <IconTrash size={16} />,
      danger: true,
      separated: true,
      onSelect: actions.onDelete,
    },
  ];

  if (searchOpen) {
    return (
      <header className="chat-header chat-header--search">
        <IconSearch size={17} className="chat-search-icon" />
        <input
          ref={inputRef}
          type="search"
          className="chat-header-search-input"
          value={searchQuery}
          placeholder="Bu sohbette ara"
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSearchStep(e.shiftKey ? -1 : 1);
            }
            if (e.key === "Escape") onToggleSearch();
          }}
          aria-label="Sohbet içinde ara"
        />
        <span className="chat-search-counter">
          {searchQuery.trim().length < 2
            ? "En az 2 karakter"
            : searchResultCount === 0
              ? "Sonuç yok"
              : `${searchCursor + 1} / ${searchResultCount}`}
        </span>
        <button
          type="button"
          className="chat-icon-btn"
          onClick={() => onSearchStep(-1)}
          disabled={searchResultCount === 0}
          aria-label="Önceki sonuç"
        >
          <IconChevronUp size={18} />
        </button>
        <button
          type="button"
          className="chat-icon-btn"
          onClick={() => onSearchStep(1)}
          disabled={searchResultCount === 0}
          aria-label="Sonraki sonuç"
        >
          <IconChevronDown size={18} />
        </button>
        <button
          type="button"
          className="chat-icon-btn"
          onClick={onToggleSearch}
          aria-label="Aramayı kapat"
        >
          <IconClose size={18} />
        </button>
      </header>
    );
  }

  return (
    <header className="chat-header">
      <button
        type="button"
        className="chat-icon-btn chat-back-btn"
        onClick={onBack}
        aria-label="Sohbet listesine dön"
      >
        <IconBack size={20} />
      </button>

      <button type="button" className="chat-header-identity" onClick={onToggleInfo}>
        <Avatar name={title} photo={conversation.profil_foto} size={40} />
        <span className="chat-header-text">
          <span className="chat-header-name">{title}</span>
          <span className="chat-header-facts">{facts.join(" · ")}</span>
        </span>
      </button>

      <div className="chat-header-status">
        {conversation.awaiting_reply ? (
          <span className="chat-status-pill is-warning">
            Cevap bekliyor{waiting ? ` · ${waiting}` : ""}
          </span>
        ) : null}
        {conversation.status === "NEEDS_SUPPORT" ? (
          <span className="chat-status-pill is-danger">Destek gerekiyor</span>
        ) : null}
        {conversation.claimed_by_name ? (
          <span className="chat-status-pill">Sorumlu: {conversation.claimed_by_name}</span>
        ) : conversation.can_claim ? (
          <button type="button" className="chat-btn chat-btn--soft" onClick={actions.onClaim}>
            Sohbeti üstlen
          </button>
        ) : null}
      </div>

      <div className="chat-header-actions">
        <button
          type="button"
          className="chat-icon-btn"
          onClick={onToggleSearch}
          title="Sohbette ara (Ctrl+F)"
          aria-label="Sohbette ara"
        >
          <IconSearch size={19} />
        </button>
        <button
          type="button"
          className={`chat-icon-btn${conversation.is_pinned ? " is-active" : ""}`}
          onClick={actions.onPin}
          title={conversation.is_pinned ? "Sabitlemeyi kaldır" : "Sabitle"}
          aria-label={conversation.is_pinned ? "Sabitlemeyi kaldır" : "Sabitle"}
        >
          <IconPin size={19} />
        </button>
        <button
          type="button"
          className={`chat-icon-btn${conversation.is_muted ? " is-active" : ""}`}
          onClick={actions.onMute}
          title={conversation.is_muted ? "Bildirimleri aç" : "Bildirimleri kapat"}
          aria-label={conversation.is_muted ? "Bildirimleri aç" : "Bildirimleri kapat"}
        >
          {conversation.is_muted ? <IconBellOff size={19} /> : <IconBell size={19} />}
        </button>
        <button
          type="button"
          className="chat-icon-btn"
          onClick={actions.onArchive}
          title={conversation.status === "ARCHIVED" ? "Arşivden çıkar" : "Arşivle"}
          aria-label={conversation.status === "ARCHIVED" ? "Arşivden çıkar" : "Arşivle"}
        >
          <IconArchive size={19} />
        </button>
        <button
          type="button"
          className={`chat-icon-btn${infoOpen ? " is-active" : ""}`}
          onClick={onToggleInfo}
          title="Sohbet bilgileri"
          aria-label="Sohbet bilgileri"
        >
          <IconInfo size={19} />
        </button>
        <button
          type="button"
          className="chat-icon-btn"
          onClick={(e) => setMenu(anchorFromEvent(e))}
          title="Daha fazla"
          aria-label="Daha fazla"
        >
          <IconMore size={19} />
        </button>
      </div>

      <ChatMenu items={menuItems} anchor={menu} onClose={() => setMenu(null)} />
    </header>
  );
}
