"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useResources } from "./hooks/useResources";
import { BookList } from "./components/BookList";
import { KaynaklarOverlays } from "./components/KaynaklarOverlays";
import TopluKitapEkleModal from "./components/TopluKitapEkleModal";
import KaynakExportModal from "./components/KaynakExportModal";
import { useKaynakPath } from "@/components/kaynak/KaynakPathProvider";
import type { ResourceBook } from "./types";
import "./kaynaklar.css";

function getBookTypeBadgeClass(renk?: string): string {
  const map: Record<string, string> = {
    primary: "badge-primary",
    success: "badge-success",
    warning: "badge-warning",
    danger: "badge-danger",
    info: "badge-info",
    secondary: "badge-secondary",
  };
  return map[renk || ""] || "badge-secondary";
}

export default function KaynaklarPage() {
  const r = useResources();
  const router = useRouter();
  const { kaynakHref } = useKaynakPath();
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const yayinYillari = Array.from(
    new Set(r.books.map((b) => b.yayin_yili).filter(Boolean) as number[])
  ).sort((a, b) => b - a);

  const totalUnits = r.books.reduce((s, b) => s + (b.unit_count || 0), 0);
  const totalTopics = r.books.reduce((s, b) => s + (b.topic_count || 0), 0);
  const totalContents = r.books.reduce((s, b) => s + (b.content_count || 0), 0);

  const openBook = (book: ResourceBook) => {
    router.push(kaynakHref(String(book.id)));
  };

  return (
    <div className="kk-page">
      <section className="kk-hero">
        <div className="kk-hero-deco" style={{ top: -40, right: -40, width: 200, height: 200 }} />
        <div className="kk-hero-deco" style={{ bottom: -20, right: 100, width: 120, height: 120 }} />

        <div className="kk-hero-inner">
          <div>
            <h1>Kaynak Kütüphanesi</h1>
            <p>Şube bazlı kitap, ünite, konu ve içerik yönetimi</p>
          </div>
          <div className="kk-hero-actions">
            <button type="button" className="kk-btn kk-btn-ghost" onClick={() => setExportOpen(true)}>
              Dışa Aktar
            </button>
            <button type="button" className="kk-btn kk-btn-ghost" onClick={() => setBulkImportOpen(true)}>
              Excel Yükle
            </button>
            <button type="button" className="kk-btn kk-btn-ghost" onClick={() => r.setBookTypeModalOpen(true)}>
              Kitap Türleri
            </button>
            <button type="button" className="kk-btn kk-btn-primary" onClick={() => r.openBookDrawer("create")}>
              + Yeni Kitap
            </button>
          </div>
        </div>

        <div className="kk-stats">
          <div className="kk-stat"><strong>{r.books.length}</strong><span>Kitap</span></div>
          <div className="kk-stat"><strong>{totalUnits}</strong><span>Ünite</span></div>
          <div className="kk-stat"><strong>{totalTopics}</strong><span>Konu</span></div>
          <div className="kk-stat"><strong>{totalContents}</strong><span>İçerik</span></div>
        </div>
      </section>

      <section className="kk-filters">
        <input
          type="text"
          className="kk-input kk-search"
          placeholder="Kitap adı ara..."
          value={r.searchTerm}
          onChange={(e) => r.setSearchTerm(e.target.value)}
        />
        <select className="kk-select" value={r.filterDers} onChange={(e) => r.setFilterDers(e.target.value)}>
          <option value="">Tüm Dersler</option>
          {r.dersler.map((d) => <option key={d.id} value={d.id}>{d.ad}</option>)}
        </select>
        <select className="kk-select" value={r.filterSinif} onChange={(e) => r.setFilterSinif(e.target.value)}>
          <option value="">Tüm Sınıflar</option>
          {r.sinifSeviyeleri.map((s) => <option key={s.id} value={s.id}>{s.ad}</option>)}
        </select>
        <select className="kk-select" value={r.filterBookType} onChange={(e) => r.setFilterBookType(e.target.value)}>
          <option value="">Tüm Türler</option>
          {r.bookTypes.map((bt) => <option key={bt.id} value={bt.id}>{bt.ikon || "📖"} {bt.ad}</option>)}
        </select>
        <select className="kk-select" value={r.filterYayinYili} onChange={(e) => r.setFilterYayinYili(e.target.value)}>
          <option value="">Tüm Yıllar</option>
          {yayinYillari.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select className="kk-select" value={r.filterIcerikTamamlandi} onChange={(e) => r.setFilterIcerikTamamlandi(e.target.value)}>
          <option value="">Tüm Durumlar</option>
          <option value="true">İçerik Tamamlanan</option>
          <option value="false">İçerik Eksik</option>
        </select>
        {(r.filterDers || r.filterSinif || r.filterBookType || r.filterYayinYili || r.filterIcerikTamamlandi) && (
          <button
            type="button"
            className="kk-btn"
            style={{ background: "#fee2e2", color: "#dc2626" }}
            onClick={() => {
              r.setFilterDers("");
              r.setFilterSinif("");
              r.setFilterBookType("");
              r.setFilterYayinYili("");
              r.setFilterIcerikTamamlandi("");
            }}
          >
            Filtreleri Temizle
          </button>
        )}
      </section>

      {r.error ? (
        <div className="kk-error" style={{ padding: 20, textAlign: "center" }}>
          {r.error}
          <button type="button" className="kk-btn kk-btn-primary" style={{ marginLeft: 12 }} onClick={r.fetchBooks}>
            Tekrar Dene
          </button>
        </div>
      ) : (
        <div className="kk-grid">
          <BookList
            filteredBooks={r.filteredBooks}
            selectedBook={null}
            loading={r.loading}
            onSelectBook={openBook}
            getBookTypeBadgeClass={getBookTypeBadgeClass}
          />
        </div>
      )}

      <KaynaklarOverlays r={r} showBookTypeModal />

      <TopluKitapEkleModal
        open={bulkImportOpen}
        onClose={() => setBulkImportOpen(false)}
        onComplete={() => r.fetchBooks()}
      />

      <KaynakExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        filters={{
          ders: r.filterDers || undefined,
          sinif_seviyesi: r.filterSinif || undefined,
          book_type: r.filterBookType || undefined,
          yayin_yili: r.filterYayinYili || undefined,
          search: r.searchTerm || undefined,
        }}
      />
    </div>
  );
}
