// ========== Book List Panel ==========
"use client";
import React from "react";
import { BookCover } from "@/components/resources/BookCover";
import { BookContentCompleteBadge } from "@/components/resources/BookContentCompleteBadge";
import type { ResourceBook } from "../types";
import { BookListSkeleton } from "./Skeletons";

interface BookListProps {
  filteredBooks: ResourceBook[];
  selectedBook: ResourceBook | null;
  loading: boolean;
  onSelectBook: (book: ResourceBook) => void;
  getBookTypeBadgeClass: (renk?: string) => string;
}

export function BookList({ filteredBooks, selectedBook, loading, onSelectBook, getBookTypeBadgeClass }: BookListProps) {
  return (
    <div className="kk-panel">
      <div className="kk-panel-header">
        <h3>Kitaplar ({filteredBooks.length})</h3>
      </div>

      {loading ? (
        <BookListSkeleton />
      ) : filteredBooks.length === 0 ? (
        <div className="kk-empty">
          <span style={{ fontSize: 48, display: "block", marginBottom: 12 }}>📖</span>
          Henüz kitap bulunmuyor
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filteredBooks.map((book) => (
            <div
              key={book.id}
              className={`kk-book-item${selectedBook?.id === book.id ? " is-selected" : ""}`}
              onClick={() => onSelectBook(book)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 10 }}>
                <BookCover src={book.kapak_url} alt={book.ad} size="sm" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="kk-book-title">{book.ad}</div>
                  <div className="kk-book-meta">
                    {book.ders_ad} · {book.sinif_seviyeleri_ad || book.sinif_seviyesi_ad}
                  </div>
                </div>
                <span className={`badge ${getBookTypeBadgeClass(book.book_type_renk)}`} style={{ fontSize: 11, flexShrink: 0 }}>
                  {book.book_type_display}
                </span>
                {book.icerik_tamamlandi_mi && <BookContentCompleteBadge />}
              </div>
              <div className="kk-book-stats">
                {book.yayin_yili && <span>📅 {book.yayin_yili}</span>}
                {book.zorluk_display && (
                  <span style={{ background: "#fef3c7", color: "#92400e", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>
                    📊 {book.zorluk_display}
                  </span>
                )}
                <span>📑 {book.unit_count}</span>
                <span>📝 {book.topic_count}</span>
                <span>📄 {book.content_count}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
