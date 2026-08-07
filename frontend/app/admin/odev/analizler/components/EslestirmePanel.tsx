"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  confirmPublisherMatch,
  fetchBooks,
  fetchPublisherMatchSuggestions,
  fetchPublishers,
  manualBulkPublisherMatch,
  type PublisherMatchItem,
  type ResourceBook,
  type ResourcePublisher,
} from "@/lib/resources-api";
import { notifyResourcesChanged } from "@/lib/resources-events";
import SortableTable from "./SortableTable";

function unwrapList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object" && Array.isArray((data as any).results)) {
    return (data as any).results;
  }
  return [];
}

export default function EslestirmePanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [tab, setTab] = useState<"oneri" | "manuel">("oneri");
  const [items, setItems] = useState<PublisherMatchItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [publishers, setPublishers] = useState<ResourcePublisher[]>([]);
  const [emptyBooks, setEmptyBooks] = useState<ResourceBook[]>([]);
  const [manualPub, setManualPub] = useState<number | "">("");
  const [manualSelected, setManualSelected] = useState<Set<number>>(new Set());

  const loadSuggestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetchPublisherMatchSuggestions();
    if (!res.success) {
      setError(res.error || "Öneriler yüklenemedi");
      setItems([]);
      setLoading(false);
      return;
    }
    const payload = res.data as { items?: PublisherMatchItem[] } | undefined;
    setItems(payload?.items || []);
    setSelected(new Set());
    setLoading(false);
  }, []);

  const loadManual = useCallback(async () => {
    const [pubs, books] = await Promise.all([
      fetchPublishers({ aktif: "true" }),
      fetchBooks({ publisher: "empty" }),
    ]);
    if (!pubs.success) {
      setError(pubs.error || "Yayınevleri yüklenemedi");
    }
    if (!books.success) {
      setError(books.error || "Kitaplar yüklenemedi");
    }
    setPublishers(unwrapList(pubs.data));
    setEmptyBooks(unwrapList(books.data));
  }, []);

  useEffect(() => {
    loadSuggestions();
    loadManual();
  }, [loadSuggestions, loadManual, refreshKey]);

  const withSuggestion = useMemo(
    () => items.filter((i) => i.publisher_id),
    [items],
  );

  const toggle = (bookId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(bookId)) next.delete(bookId);
      else next.add(bookId);
      return next;
    });
  };

  const selectAllSuggested = () => {
    setSelected(new Set(withSuggestion.map((i) => i.book_id)));
  };

  const confirmSelected = async () => {
    const payload = items
      .filter((i) => selected.has(i.book_id) && i.publisher_id)
      .map((i) => ({ book_id: i.book_id, publisher_id: i.publisher_id as number }));
    if (!payload.length) {
      setError("Önce önerisi olan kitaplardan seçin");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await confirmPublisherMatch({ items: payload });
    setBusy(false);
    if (!res.success) {
      setError(res.error || "Eşleştirme başarısız");
      return;
    }
    setMessage(res.message || `${res.data?.updated || 0} kitap eşleştirildi`);
    notifyResourcesChanged({ type: "publisher-match" });
    await loadSuggestions();
    await loadManual();
  };

  const confirmOne = async (item: PublisherMatchItem) => {
    if (!item.publisher_id) return;
    setBusy(true);
    setError(null);
    const res = await confirmPublisherMatch({
      items: [{ book_id: item.book_id, publisher_id: item.publisher_id }],
    });
    setBusy(false);
    if (!res.success) {
      setError(res.error || "Eşleştirme başarısız");
      return;
    }
    setMessage(res.message || "Kitap eşleştirildi");
    notifyResourcesChanged({ type: "publisher-match" });
    await loadSuggestions();
    await loadManual();
  };

  const runManual = async () => {
    if (!manualPub || !manualSelected.size) {
      setError("Yayınevi ve en az bir kitap seçin");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await manualBulkPublisherMatch({
      book_ids: Array.from(manualSelected),
      publisher_id: Number(manualPub),
    });
    setBusy(false);
    if (!res.success) {
      setError(res.error || "Manuel eşleştirme başarısız");
      return;
    }
    setMessage(res.message || `${res.data?.updated || 0} kitap eşleştirildi`);
    setManualSelected(new Set());
    notifyResourcesChanged({ type: "publisher-match" });
    await loadSuggestions();
    await loadManual();
  };

  return (
    <div>
      <div className="kk-tab-row">
        <button
          type="button"
          className={`kk-tab${tab === "oneri" ? " is-active" : ""}`}
          onClick={() => setTab("oneri")}
        >
          Öneriler ({withSuggestion.length})
        </button>
        <button
          type="button"
          className={`kk-tab${tab === "manuel" ? " is-active" : ""}`}
          onClick={() => setTab("manuel")}
        >
          Manuel Toplu ({emptyBooks.length})
        </button>
      </div>

      {message && (
        <div style={{ marginBottom: 12, padding: 12, background: "#ecfdf5", borderRadius: 10, color: "#065f46" }}>
          {message}
        </div>
      )}
      {error && (
        <div style={{ marginBottom: 12, padding: 12, background: "#fef2f2", borderRadius: 10, color: "#991b1b" }}>
          {error}
        </div>
      )}

      {tab === "oneri" && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <button type="button" className="kk-btn kk-btn-on-light" onClick={selectAllSuggested} disabled={busy}>
              Önerilenleri seç
            </button>
            <button
              type="button"
              className="kk-btn kk-btn-active-on-light"
              disabled={!selected.size || busy}
              onClick={confirmSelected}
            >
              Seçilenleri eşleştir ({selected.size})
            </button>
            <button type="button" className="kk-btn kk-btn-on-light" onClick={loadSuggestions} disabled={busy}>
              Yenile
            </button>
          </div>
          {loading ? (
            <div style={{ color: "#64748b" }}>Yükleniyor…</div>
          ) : (
            <SortableTable
              rows={items}
              rowKey={(r) => r.book_id}
              columns={[
                {
                  key: "book_id",
                  label: "",
                  type: "number",
                  render: (item) => (
                    <input
                      type="checkbox"
                      disabled={!item.publisher_id || busy}
                      checked={selected.has(item.book_id)}
                      onChange={() => toggle(item.book_id)}
                    />
                  ),
                },
                { key: "book_ad", label: "Kitap", type: "text" },
                {
                  key: "publisher_ad",
                  label: "Algılanan Yayınevi",
                  type: "text",
                  render: (item) => item.publisher_ad || "—",
                },
                {
                  key: "confidence_percent",
                  label: "Güven",
                  type: "number",
                  render: (item) => (item.publisher_id ? `%${item.confidence_percent}` : "—"),
                },
                {
                  key: "matched_key",
                  label: "İşlem",
                  type: "text",
                  render: (item) =>
                    item.publisher_id ? (
                      <button
                        type="button"
                        className="kk-btn kk-btn-on-light"
                        disabled={busy}
                        onClick={() => confirmOne(item)}
                      >
                        ✓ Onayla
                      </button>
                    ) : (
                      <span style={{ color: "#94a3b8" }}>Öneri yok</span>
                    ),
                },
              ]}
              emptyLabel="Yayınevi boş kitap bulunamadı."
            />
          )}
        </div>
      )}

      {tab === "manuel" && (
        <div>
          <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
            <select
              className="kk-select"
              value={manualPub}
              onChange={(e) => setManualPub(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">Yayınevi seç…</option>
              {publishers.map((p) => (
                <option key={p.id} value={p.id}>{p.ad}</option>
              ))}
            </select>
            <button
              type="button"
              className="kk-btn kk-btn-active-on-light"
              disabled={!manualPub || !manualSelected.size || busy}
              onClick={runManual}
            >
              Seçilen {manualSelected.size} kitabı eşleştir
            </button>
          </div>
          {!publishers.length && (
            <div style={{ marginBottom: 12, color: "#b45309" }}>
              Aktif yayınevi yok. Önce Yayınevleri sekmesinden ekleyin.
            </div>
          )}
          <SortableTable
            rows={emptyBooks}
            rowKey={(b) => b.id}
            columns={[
              {
                key: "id",
                label: "",
                type: "number",
                render: (b) => (
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked={manualSelected.has(b.id)}
                    onChange={() => {
                      setManualSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(b.id)) next.delete(b.id);
                        else next.add(b.id);
                        return next;
                      });
                    }}
                  />
                ),
              },
              { key: "ad", label: "Kitap", type: "text" },
              { key: "ders_ad", label: "Ders", type: "text" },
            ]}
            emptyLabel="Yayınevi boş kitap yok."
          />
        </div>
      )}
    </div>
  );
}
