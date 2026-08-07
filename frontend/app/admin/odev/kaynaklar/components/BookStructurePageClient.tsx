"use client";

import React, { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useResources } from "../hooks/useResources";
import { BookStructure } from "./BookStructure";
import { KaynaklarOverlays } from "./KaynaklarOverlays";
import { useKaynakPath } from "@/components/kaynak/KaynakPathProvider";
import { StructureSkeleton } from "./Skeletons";
import "../kaynaklar.css";

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

export default function BookStructurePageClient() {
  const params = useParams();
  const router = useRouter();
  const { kaynakHref } = useKaynakPath();
  const rawId = params?.id;
  const bookId = Number(Array.isArray(rawId) ? rawId[0] : rawId);

  const r = useResources({
    bookId: Number.isFinite(bookId) && bookId > 0 ? bookId : null,
    skipBookList: true,
  });

  const goList = () => router.push(kaynakHref());

  useEffect(() => {
    if (!Number.isFinite(bookId) || bookId <= 0) {
      goList();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  const handleDeleteBook = async (id: number) => {
    const ok = await r.handleDeleteBook(id);
    if (ok) goList();
  };

  if (!Number.isFinite(bookId) || bookId <= 0) return null;

  if (r.loadingBookDetail) {
    return (
      <div className="kk-page kk-page-structure">
        <div className="kk-panel" style={{ padding: 24 }}>
          <StructureSkeleton />
        </div>
      </div>
    );
  }

  if (r.bookDetailError || !r.selectedBook) {
    return (
      <div className="kk-page kk-page-structure">
        <div className="kk-error" style={{ padding: 24, textAlign: "center" }}>
          {r.bookDetailError || "Kitap bulunamadı"}
          <div style={{ marginTop: 16 }}>
            <button type="button" className="kk-btn kk-btn-active-on-light" onClick={goList}>
              ← Kaynaklara dön
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="kk-page kk-page-structure">
      <BookStructure
        fullPage
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
        onDeleteBook={handleDeleteBook}
        onDuplicateBook={r.openDuplicateModal}
        onClose={goList}
        onAddUnit={() => r.openUnitDrawer("create")}
        onEditUnit={(unit) => r.openUnitDrawer("edit", unit)}
        onDuplicateUnit={r.openDuplicateUnitModal}
        onDeleteUnit={r.handleDeleteUnit}
        onBulkUnit={r.openBulkUnitModal}
        onImport={() => r.setImportModalOpen(true)}
        onAddTopic={(unitId) => r.openTopicDrawer("create", unitId)}
        onEditTopic={(unitId, topic) => r.openTopicDrawer("edit", unitId, topic)}
        onDuplicateTopic={r.openDuplicateTopicModal}
        onDeleteTopic={r.handleDeleteTopic}
        onBulkTopic={r.openBulkTopicModal}
        onAddContent={(topicId) => r.openContentDrawer("create", topicId)}
        onEditContent={(topicId, content) => r.openContentDrawer("edit", topicId, content)}
        onDuplicateContent={r.handleDuplicateContent}
        onUpdateQuestionCount={r.handleUpdateQuestionCount}
        onUpdateContentAd={r.handleUpdateContentAd}
        onBulkTransferContents={r.handleBulkTransferContents}
        onBulkDeleteContents={r.handleBulkDeleteContents}
        onBulkPrefixNames={r.handleBulkPrefixNames}
        onGroupContentsIntoTopic={r.handleGroupContentsIntoTopic}
        onMoveTopic={r.handleMoveTopic}
        onDeleteContent={r.handleDeleteContent}
        onBulkTest={r.openBulkTestModal}
        reorderUnits={r.reorderUnits}
        reorderTopics={r.reorderTopics}
        reorderContents={r.reorderContents}
        getBookTypeBadgeClass={getBookTypeBadgeClass}
      />

      <KaynaklarOverlays r={r} />
    </div>
  );
}
