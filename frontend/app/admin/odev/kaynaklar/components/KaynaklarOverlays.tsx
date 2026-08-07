"use client";

import React from "react";
import { ResourceDrawer } from "./ResourceDrawer";
import {
  BookTypeModal,
  BulkTestModal,
  BulkItemModal,
  ImportModal,
  DuplicateModal,
  StructureDuplicateModal,
} from "./Modals";
import { ToastNotification } from "./ToastNotification";

/** useResources dönüşünün overlay'lerin ihtiyaç duyduğu kısmı */
type ResourcesApi = ReturnType<typeof import("../hooks/useResources").useResources>;

type Props = {
  r: ResourcesApi;
  /** Kitap türü / excel / export liste sayfasında */
  showBookTypeModal?: boolean;
};

export function KaynaklarOverlays({ r, showBookTypeModal = false }: Props) {
  return (
    <>
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

      {showBookTypeModal && (
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

      <StructureDuplicateModal
        open={r.structureDupOpen}
        onClose={() => r.setStructureDupOpen(false)}
        kind={r.structureDupKind}
        sourceName={r.structureDupSourceName}
        hint={r.structureDupHint}
        form={r.structureDupForm}
        setForm={r.setStructureDupForm}
        loading={r.structureDupLoading}
        onSubmit={r.handleStructureDuplicate}
      />

      <ToastNotification toast={r.toast} />

      <style jsx global>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </>
  );
}
