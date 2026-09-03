"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ChatContactKind,
  ChatQuickFilter,
  ChatTimeFilter,
  ConversationListItem,
  fetchChatConversations,
} from "@/lib/communication-api";

import { sortConversations } from "./chat-utils";

const PAGE_SIZE = 30;
const SEARCH_DEBOUNCE_MS = 280;

export interface ChatFilters {
  quick: ChatQuickFilter;
  kinds: ChatContactKind[];
  time: ChatTimeFilter;
  search: string;
}

export const DEFAULT_FILTERS: ChatFilters = {
  quick: "all",
  kinds: [],
  time: "all",
  search: "",
};

export function filtersAreDefault(filters: ChatFilters): boolean {
  return (
    filters.quick === "all" &&
    filters.kinds.length === 0 &&
    filters.time === "all" &&
    !filters.search.trim()
  );
}

interface Options {
  accountId?: string;
  department?: string;
  /** Derin bağlantıyla gelen başlangıç filtresi (ör. panelden "cevap bekleyen"). */
  initialQuick?: ChatQuickFilter;
}

/**
 * Sohbet listesi veri katmanı.
 *
 * Sayfalama sunucu tarafında (`limit`/`offset`); liste yalnızca kullanıcı
 * dibe yaklaştığında büyür. Filtre veya arama değişince baştan yüklenir.
 */
export function useChatConversations({ accountId, department, initialQuick }: Options = {}) {
  const [filters, setFilters] = useState<ChatFilters>(
    initialQuick ? { ...DEFAULT_FILTERS, quick: initialQuick } : DEFAULT_FILTERS,
  );
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [items, setItems] = useState<ConversationListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    const handle = setTimeout(
      () => setDebouncedSearch(filters.search.trim()),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(handle);
  }, [filters.search]);

  const query = useMemo(
    () => ({
      quick: filters.quick,
      kinds: filters.kinds,
      time: filters.time,
      search: debouncedSearch,
      accountId,
      department,
    }),
    [filters.quick, filters.kinds, filters.time, debouncedSearch, accountId, department],
  );

  const load = useCallback(
    async (options: { silent?: boolean } = {}) => {
      const token = ++requestRef.current;
      if (!options.silent) setLoading(true);
      try {
        const data = await fetchChatConversations({ ...query, limit: PAGE_SIZE, offset: 0 });
        if (token !== requestRef.current) return;
        setItems(sortConversations(data.conversations));
        setTotal(data.total);
        setHasMore(!!data.has_more);
        setError(null);
      } catch (err) {
        if (token !== requestRef.current) return;
        setError(err instanceof Error ? err.message : "Sohbetler yüklenemedi.");
      } finally {
        if (token === requestRef.current) setLoading(false);
      }
    },
    [query],
  );

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const data = await fetchChatConversations({
        ...query,
        limit: PAGE_SIZE,
        offset: items.length,
      });
      setItems((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        return sortConversations([
          ...prev,
          ...data.conversations.filter((c) => !seen.has(c.id)),
        ]);
      });
      setTotal(data.total);
      setHasMore(!!data.has_more);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, items.length, loadingMore, query]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Tek satırı yerinde güncelle — tüm listeyi yeniden çekmeden. */
  const patchConversation = useCallback((conv: ConversationListItem) => {
    setItems((prev) => {
      const index = prev.findIndex((c) => c.id === conv.id);
      if (index === -1) return prev;
      const next = [...prev];
      next[index] = { ...next[index], ...conv };
      return sortConversations(next);
    });
  }, []);

  const removeConversation = useCallback((id: string) => {
    setItems((prev) => prev.filter((c) => c.id !== id));
    setTotal((prev) => Math.max(0, prev - 1));
  }, []);

  const unreadTotal = useMemo(
    () => items.reduce((sum, c) => sum + (c.unread_count_coach || 0), 0),
    [items],
  );
  const unreadConversations = useMemo(
    () => items.filter((c) => (c.unread_count_coach || 0) > 0).length,
    [items],
  );

  return {
    filters,
    setFilters,
    items,
    total,
    hasMore,
    loading,
    loadingMore,
    error,
    reload: load,
    loadMore,
    patchConversation,
    removeConversation,
    unreadTotal,
    unreadConversations,
  };
}
