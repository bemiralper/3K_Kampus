"use client";

import React, { useState } from "react";
import { useKaynakPath } from "@/components/kaynak/KaynakPathProvider";
import { useResources } from "./hooks/useResources";
import { BookList } from "./components/BookList";
import { BookStructure } from "./components/BookStructure";
import { ResourceDrawer } from "./components/ResourceDrawer";
import { BookTypeModal, BulkTestModal, BulkItemModal, ImportModal, DuplicateModal } from "./components/Modals";
import { ToastNotification } from "./components/ToastNotification";
import TopluKitapEkleModal from "./components/TopluKitapEkleModal";
import KaynakExportModal from "./components/KaynakExportModal";
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
  const { isCoachMode } = useKaynakPath();
  const r = useResources();
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const yayinYillari = Array.from(
    new Set(r.books.map((b) => b.yayin_yili).filter(Boolean) as number[])
  ).sort((a, b) => b - a);

  const totalUnits = r.books.reduce((s, b) => s + (b.unit_count || 0), 0);
  const totalTopics = r.books.reduce((s, b) => s + (b.topic_count || 0), 0);
  const totalContents = r.books.reduce((s, b) => s + (b.content_count || 0), 0);

  return (
    <div className="kk-page">
      <section className="kk-hero">
        <div className="kk-hero-deco" style={{ top: -40, right: -40, width: 200, height: 200 }} />
        <div className="kk-hero-deco" style={{ bottom: -20, right: 100, width: 120, height: 120 }} />

        <div className="kk-hero-inner">
          <div>
            <h1>Kaynak Kütüphanesi</h1>
            <p>{isCoachMode ? "Şube kaynak kataloğunu görüntüleyin" : "Şube bazlı kitap, ünite, konu ve içerik yönetimi"}</p>
          </div>
          <div className="kk-hero-actions">
            <button type="button" className="kk-btn kk-btn-ghost" onClick={() => setExportOpen(true)}>
              Dışa Aktar
            </button>
            {!isCoachMode && (
              <>
                <button type="button" className="kk-btn kk-btn-ghost" onClick={() => setBulkImportOpen(true)}>
                  Excel Yükle
                </button>
                <button type="button" className="kk-btn kk-btn-ghost" onClick={() => r.setBookTypeModalOpen(true)}>
                  Kitap Türleri
                </button>
                <button type="button" className="kk-btn kk-btn-primary" onClick={() => r.openBookDrawer("create")}>
                  + Yeni Kitap
                </button>
              </>
            )}
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
        {(r.filterDers || r.filterSinif || r.filterBookType || r.filterYayinYili) && (
          <button
            type="button"
            className="kk-btn"
            style={{ background: "#fee2e2", color: "#dc2626" }}
            onClick={() => {
              r.setFilterDers("");
              r.setFilterSinif("");
              r.setFilterBookType("");
              r.setFilterYayinYili("");
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
        <div className={`kk-grid${r.selectedBook ? " is-split" : ""}`}>
          <BookList
            filteredBooks={r.filteredBooks}
            selectedBook={r.selectedBook}
            loading={r.loading}
            onSelectBook={r.setSelectedBook}
            getBookTypeBadgeClass={getBookTypeBadgeClass}
          />

          {r.selectedBook && (
            <BookStructure
              selectedBook={r.selectedBook}
              bookStructure={r.bookStructure}
              loadingStructure={r.loadingStructure}
              expandedUnits={r.expandedUnits}
              expandedTopics={r.expandedTopics}
              toggleUnit={r.toggleUnit}
              toggleTopic={r.toggleTopic}
              expandAll={r.expandAll}
              collapseAll={r.collapseAll}
              onEditBook={(book) => r.openBookDrawer("edit", book)}
              onDeleteBook={r.handleDeleteBook}
              onDuplicateBook={r.openDuplicateModal}
              onClose={() => { r.setSelectedBook(null); r.setBookStructure(null); }}
              onAddUnit={() => r.openUnitDrawer("create")}
              onEditUnit={(unit) => r.openUnitDrawer("edit", unit)}
              onDeleteUnit={r.handleDeleteUnit}
              onBulkUnit={r.openBulkUnitModal}
              onImport={() => r.setImportModalOpen(true)}
              onAddTopic={(unitId) => r.openTopicDrawer("create", unitId)}
              onEditTopic={(unitId, topic) => r.openTopicDrawer("edit", unitId, topic)}
              onDeleteTopic={r.handleDeleteTopic}
              onBulkTopic={r.openBulkTopicModal}
              onAddContent={(topicId) => r.openContentDrawer("create", topicId)}
              onEditContent={(topicId, content) => r.openContentDrawer("edit", topicId, content)}
              onDeleteContent={r.handleDeleteContent}
              onBulkTest={r.openBulkTestModal}
              reorderUnits={r.reorderUnits}
              reorderTopics={r.reorderTopics}
              reorderContents={r.reorderContents}
              getBookTypeBadgeClass={getBookTypeBadgeClass}
              readOnly={isCoachMode}
            />
          )}
        </div>
      )}

      {!isCoachMode && (
      <ResourceDrawer
        open={r.drawerOpen}
        onClose={() => r.setDrawerOpen(false)}
        mode={r.drawerMode}
        editingId={r.editingId}
        loading={r.drawerLoading}
        error={r.drawerError}
        onSave={r.handleDrawerSave}
        bookForm={r.bookForm}
        setBookForm={r.setBookForm}
        unitForm={r.unitForm}
        setUnitForm={r.setUnitForm}
        topicForm={r.topicForm}
        setTopicForm={r.setTopicForm}
        contentForm={r.contentForm}
        setContentForm={r.setContentForm}
        dersler={r.dersler}
        sinifSeviyeleri={r.sinifSeviyeleri}
        bookTypes={r.bookTypes}
        onUploadKapak={r.handleUploadKapak}
        onDeleteKapak={r.handleDeleteKapak}
        onPendingKapakChange={r.setPendingKapakFile}
      />
      )}

      {!isCoachMode && (
      <BookTypeModal
        open={r.bookTypeModalOpen}
        onClose={() => r.setBookTypeModalOpen(false)}
        bookTypes={r.bookTypes}
        form={r.bookTypeForm}
        setForm={r.setBookTypeForm}
        loading={r.bookTypeLoading}
        onSave={r.saveBookType}
        onEdit={r.openBookTypeForEdit}
        onDelete={r.deleteBookType}
        onReset={r.resetBookTypeForm}
      />
      )}

      {!isCoachMode && (
      <>
      <BulkTestModal
        open={r.bulkTestOpen}
        onClose={() => r.setBulkTestOpen(false)}
        topicName={r.bulkTestTopicName}
        form={r.bulkTestForm}
        setForm={r.setBulkTestForm}
        rows={r.bulkTestRows}
        onUpdateRow={r.updateBulkTestRow}
        onApplyDefaults={r.applyDefaultQuestionToAll}
        previewLoading={r.bulkTestPreviewLoading}
        loading={r.bulkTestLoading}
        error={r.bulkTestError}
        onSubmit={r.submitBulkTests}
      />

      <BulkItemModal
        open={r.bulkUnitOpen}
        onClose={() => r.setBulkUnitOpen(false)}
        title="Toplu Ünite Ekle"
        subtitle={`${r.selectedBook?.ad || ""} kitabına üniteler ekleyin`}
        rows={r.bulkUnitRows}
        setRows={r.setBulkUnitRows}
        loading={r.bulkUnitLoading}
        error={r.bulkUnitError}
        onSubmit={r.submitBulkUnits}
        color="#10b981"
        placeholder="Ünite adı"
      />

      <BulkItemModal
        open={r.bulkTopicOpen}
        onClose={() => r.setBulkTopicOpen(false)}
        title="Toplu Konu Ekle"
        subtitle={`${r.bulkTopicUnitName} ünitesine konular ekleyin`}
        rows={r.bulkTopicRows}
        setRows={r.setBulkTopicRows}
        loading={r.bulkTopicLoading}
        error={r.bulkTopicError}
        onSubmit={r.submitBulkTopics}
        color="#6366f1"
        placeholder="Konu adı"
      />

      <ImportModal
        open={r.importModalOpen}
        onClose={() => r.setImportModalOpen(false)}
        text={r.importText}
        setText={r.setImportText}
        loading={r.importLoading}
        error={r.importError}
        result={r.importResult}
        onSubmit={r.handleImportStructure}
      />

      <DuplicateModal
        open={r.duplicateModalOpen}
        onClose={() => r.setDuplicateModalOpen(false)}
        selectedBook={r.selectedBook}
        form={r.duplicateForm}
        setForm={r.setDuplicateForm}
        loading={r.duplicateLoading}
        onSubmit={r.handleDuplicateBook}
      />
      </>
      )}

      {!isCoachMode && (
        <TopluKitapEkleModal
          open={bulkImportOpen}
          onClose={() => setBulkImportOpen(false)}
          onComplete={() => r.fetchBooks()}
        />
      )}

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

      <ToastNotification toast={r.toast} />

      <style jsx global>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
