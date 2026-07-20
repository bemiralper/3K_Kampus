// ========== Book Structure Panel (Tree View) ==========
"use client";
import React, { useState } from "react";
import type { ResourceBook, ResourceUnit, ResourceTopic, ResourceContent } from "../types";
import { DragSortList, DragHandle } from "./DragSortList";
import { StructureSkeleton } from "./Skeletons";

interface BookStructureProps {
  selectedBook: ResourceBook;
  bookStructure: ResourceBook | null;
  loadingStructure: boolean;
  expandedUnits: number[];
  expandedTopics: number[];
  toggleUnit: (id: number) => void;
  toggleTopic: (id: number) => void;
  expandAll: () => void;
  collapseAll: () => void;
  onEditBook: (book: ResourceBook) => void;
  onDeleteBook: (id: number) => void;
  onDuplicateBook: (book: ResourceBook) => void;
  onClose: () => void;
  onAddUnit: () => void;
  onEditUnit: (unit: ResourceUnit) => void;
  onDuplicateUnit: (unit: ResourceUnit) => void;
  onDeleteUnit: (id: number) => void;
  onBulkUnit: () => void;
  onImport: () => void;
  onAddTopic: (unitId: number) => void;
  onEditTopic: (unitId: number, topic: ResourceTopic) => void;
  onDuplicateTopic: (topic: ResourceTopic) => void;
  onDeleteTopic: (id: number) => void;
  onBulkTopic: (unitId: number, unitName: string) => void;
  onAddContent: (topicId: number) => void;
  onEditContent: (topicId: number, content: ResourceContent) => void;
  onDeleteContent: (id: number) => void;
  onBulkTest: (topicId: number, topicName: string) => void;
  reorderUnits: (ids: number[]) => void;
  reorderTopics: (ids: number[]) => void;
  reorderContents: (ids: number[]) => void;
  getBookTypeBadgeClass: (renk?: string) => string;
  readOnly?: boolean;
}

const CONTENT_TYPE_ICON: Record<string, string> = {
  TEST_SET: "📝",
  SUBJECT_SECTION: "📖",
  PAGE_RANGE: "📄",
  EXERCISE: "✏️",
  VIDEO: "🎬",
  CUSTOM: "📌",
};

export function BookStructure(props: BookStructureProps) {
  const {
    selectedBook, bookStructure, loadingStructure,
    expandedUnits, expandedTopics, toggleUnit, toggleTopic, expandAll, collapseAll,
    onEditBook, onDeleteBook, onDuplicateBook, onClose,
    onAddUnit, onEditUnit, onDuplicateUnit, onDeleteUnit, onBulkUnit, onImport,
    onAddTopic, onEditTopic, onDuplicateTopic, onDeleteTopic, onBulkTopic,
    onAddContent, onEditContent, onDeleteContent, onBulkTest,
    reorderUnits, reorderTopics, reorderContents,
    getBookTypeBadgeClass,
    readOnly = false,
  } = props;

  // Structure search
  const [structureSearch, setStructureSearch] = useState("");

  const matchesSearch = (text: string) =>
    !structureSearch || text.toLowerCase().includes(structureSearch.toLowerCase());

  // Filter structure based on search
  const filteredUnits = bookStructure?.units
    ?.map(unit => {
      const filteredTopics = (unit.topics || [])
        .map(topic => {
          const filteredContents = (topic.contents || []).filter(c => matchesSearch(c.ad));
          if (matchesSearch(topic.ad) || filteredContents.length > 0) {
            return { ...topic, contents: matchesSearch(topic.ad) ? topic.contents : filteredContents };
          }
          return null;
        })
        .filter(Boolean) as ResourceTopic[];

      if (matchesSearch(unit.ad) || filteredTopics.length > 0) {
        return { ...unit, topics: matchesSearch(unit.ad) ? unit.topics : filteredTopics };
      }
      return null;
    })
    .filter(Boolean) as ResourceUnit[] | undefined;

  const sortedUnits = filteredUnits ? [...filteredUnits].sort((a, b) => a.sira - b.sira) : [];

  return (
    <div style={{
      background: "white",
      borderRadius: 12,
      border: "1px solid #e2e8f0",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      height: "calc(100vh - 260px)",
    }}>
      {/* Book Header */}
      <div style={{ padding: 20, borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: "0 0 8px", fontSize: 20 }}>{selectedBook.ad}</h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span className={`badge ${getBookTypeBadgeClass(selectedBook.book_type_renk)}`}>{selectedBook.book_type_display}</span>
              <span className="badge badge-secondary">{selectedBook.ders_ad}</span>
              <span className="badge badge-secondary">
                {selectedBook.sinif_seviyeleri_ad || selectedBook.sinif_seviyesi_ad}
              </span>
              {selectedBook.zorluk_display && (
                <span style={{ display: "inline-block", padding: "4px 8px", borderRadius: 4, fontSize: 12, fontWeight: 600, background: "#fef3c7", color: "#92400e" }}>
                  📊 Zorluk: {selectedBook.zorluk_display}
                </span>
              )}
              {selectedBook.yayinevi && <span className="badge badge-light">{selectedBook.yayinevi}</span>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {!readOnly && (
              <>
                <button onClick={() => onDuplicateBook(selectedBook)} style={{ background: "#dbeafe", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 14, color: "#2563eb" }} title="Kitabı kopyala">
                  📋 Kopyala
                </button>
                <button onClick={() => onEditBook(selectedBook)} style={{ background: "#f1f5f9", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 14 }}>
                  ✏️ Düzenle
                </button>
                <button onClick={() => onDeleteBook(selectedBook.id)} style={{ background: "#fee2e2", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 14, color: "#dc2626" }}>
                  🗑️ Sil
                </button>
              </>
            )}
            <button onClick={onClose} style={{ background: "#f1f5f9", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 14 }}>
              ✕
            </button>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ padding: "12px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="🔍 Yapıda ara..."
          value={structureSearch}
          onChange={e => setStructureSearch(e.target.value)}
          style={{ flex: "1 1 200px", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13 }}
        />
        <button onClick={expandAll} style={{ background: "#f1f5f9", border: "none", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontSize: 12, fontWeight: 500 }}>
          ↕ Hepsini Aç
        </button>
        <button onClick={collapseAll} style={{ background: "#f1f5f9", border: "none", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontSize: 12, fontWeight: 500 }}>
          ↔ Hepsini Kapat
        </button>
        <div style={{ borderLeft: "1px solid #e2e8f0", height: 24 }} />
        {!readOnly && (
          <>
            <button onClick={onAddUnit} style={{ background: "#667eea", color: "white", border: "none", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontSize: 12, fontWeight: 500 }}>
              + Ünite
            </button>
            <button onClick={onBulkUnit} style={{ background: "#10b981", color: "white", border: "none", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontSize: 12, fontWeight: 500 }}>
              📋 Toplu Ünite
            </button>
            <button onClick={onImport} style={{ background: "#f59e0b", color: "white", border: "none", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontSize: 12, fontWeight: 500 }}>
              📥 Import
            </button>
          </>
        )}
      </div>

      {/* Tree Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        {loadingStructure ? (
          <StructureSkeleton />
        ) : !sortedUnits.length ? (
          <div style={{ textAlign: "center", padding: 40, color: "#64748b", background: "#f8fafc", borderRadius: 8 }}>
            <span style={{ fontSize: 48, display: "block", marginBottom: 12 }}>📑</span>
            Henüz ünite eklenmemiş
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <DragSortList
              items={sortedUnits}
              onReorder={readOnly ? () => {} : reorderUnits}
              renderItem={(unit, dragProps) => (
                <div style={{ ...dragProps.style, border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}
                  onDragOver={dragProps.onDragOver} onDrop={dragProps.onDrop}>
                  {/* Unit Header */}
                  <div
                    style={{
                      padding: "12px 16px",
                      background: expandedUnits.includes(unit.id) ? "#f0f9ff" : "#f8fafc",
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}
                      onClick={() => toggleUnit(unit.id)}>
                      {!readOnly && (
                        <span draggable onDragStart={dragProps.onDragStart} onDragEnd={dragProps.onDragEnd}>
                          <DragHandle />
                        </span>
                      )}
                      <span style={{ transform: expandedUnits.includes(unit.id) ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.2s" }}>▶</span>
                      <span style={{ fontWeight: 500 }}>{unit.ad}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 12, color: "#64748b" }}>{unit.topic_count || (unit.topics?.length || 0)} konu</span>
                      {!readOnly && (
                        <>
                          <button onClick={(e) => { e.stopPropagation(); onEditUnit(unit); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14 }} title="Düzenle">✏️</button>
                          <button onClick={(e) => { e.stopPropagation(); onDuplicateUnit(unit); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14 }} title="Üniteyi kopyala">📋</button>
                          <button onClick={(e) => { e.stopPropagation(); onDeleteUnit(unit.id); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, opacity: 0.6 }} title="Sil">🗑️</button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Topics */}
                  {expandedUnits.includes(unit.id) && (
                    <div style={{ borderTop: "1px solid #e2e8f0" }}>
                      <div style={{ padding: "8px 16px", background: "#fafafa", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: "#64748b" }}>Konular</span>
                        {!readOnly && (
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => onAddTopic(unit.id)} style={{ background: "#10b981", color: "white", border: "none", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontSize: 12 }}>+ Konu</button>
                            <button onClick={() => onBulkTopic(unit.id, unit.ad)} style={{ background: "#6366f1", color: "white", border: "none", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontSize: 12 }}>📋 Toplu</button>
                          </div>
                        )}
                      </div>

                      {unit.topics?.length ? (
                        <DragSortList
                          items={[...(unit.topics || [])].sort((a, b) => a.sira - b.sira)}
                          onReorder={readOnly ? () => {} : reorderTopics}
                          renderItem={(topic, tDragProps) => (
                            <div style={{ ...tDragProps.style, borderTop: "1px solid #e2e8f0" }}
                              onDragOver={tDragProps.onDragOver} onDrop={tDragProps.onDrop}>
                              {/* Topic Header */}
                              <div
                                style={{
                                  padding: "10px 16px 10px 32px",
                                  cursor: "pointer",
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  background: expandedTopics.includes(topic.id) ? "#f0fdf4" : "white",
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}
                                  onClick={() => toggleTopic(topic.id)}>
                                  {!readOnly && (
                                    <span draggable onDragStart={tDragProps.onDragStart} onDragEnd={tDragProps.onDragEnd}>
                                      <DragHandle />
                                    </span>
                                  )}
                                  <span style={{ transform: expandedTopics.includes(topic.id) ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.2s", fontSize: 12 }}>▶</span>
                                  <span style={{ fontSize: 14 }}>{topic.ad}</span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <span style={{ fontSize: 11, color: "#64748b" }}>{topic.content_count || (topic.contents?.length || 0)} içerik</span>
                                  {!readOnly && (
                                    <>
                                      <button onClick={(e) => { e.stopPropagation(); onEditTopic(unit.id, topic); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12 }} title="Düzenle">✏️</button>
                                      <button onClick={(e) => { e.stopPropagation(); onDuplicateTopic(topic); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12 }} title="Konuyu kopyala">📋</button>
                                      <button onClick={(e) => { e.stopPropagation(); onDeleteTopic(topic.id); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, opacity: 0.6 }} title="Sil">🗑️</button>
                                    </>
                                  )}
                                </div>
                              </div>

                              {/* Contents */}
                              {expandedTopics.includes(topic.id) && (
                                <div style={{ background: "#fafafa", borderTop: "1px solid #e2e8f0" }}>
                                  <div style={{ padding: "6px 16px 6px 48px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <span style={{ fontSize: 12, fontWeight: 500, color: "#64748b" }}>İçerikler</span>
                                    {!readOnly && (
                                      <div style={{ display: "flex", gap: 6 }}>
                                        <button onClick={() => onBulkTest(topic.id, topic.ad)} style={{ background: "#f59e0b", color: "white", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11 }}>⚡ Toplu Test</button>
                                        <button onClick={() => onAddContent(topic.id)} style={{ background: "#8b5cf6", color: "white", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11 }}>+ İçerik</button>
                                      </div>
                                    )}
                                  </div>

                                  {topic.contents?.length ? (
                                    <DragSortList
                                      items={[...(topic.contents || [])].sort((a, b) => a.sira - b.sira)}
                                      onReorder={readOnly ? () => {} : reorderContents}
                                      renderItem={(content, cDragProps) => (
                                        <div
                                          style={{
                                            ...cDragProps.style,
                                            padding: "8px 16px 8px 48px",
                                            borderTop: "1px solid #e2e8f0",
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "center",
                                            background: "white",
                                          }}
                                          onDragOver={cDragProps.onDragOver}
                                          onDrop={cDragProps.onDrop}
                                        >
                                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            {!readOnly && (
                                              <span draggable onDragStart={cDragProps.onDragStart} onDragEnd={cDragProps.onDragEnd}>
                                                <DragHandle />
                                              </span>
                                            )}
                                            <span>{CONTENT_TYPE_ICON[content.content_type] || "📌"}</span>
                                            <span style={{ fontSize: 13 }}>{content.ad}</span>
                                            <span style={{ fontSize: 11, color: "#64748b" }}>({content.content_type_display})</span>
                                          </div>
                                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            {content.question_count && <span style={{ fontSize: 11, color: "#64748b" }}>{content.question_count} soru</span>}
                                            {content.page_start && content.page_end && <span style={{ fontSize: 11, color: "#64748b" }}>s.{content.page_start}-{content.page_end}</span>}
                                            {!readOnly && (
                                              <>
                                                <button onClick={() => onEditContent(topic.id, content)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12 }}>✏️</button>
                                                <button onClick={() => onDeleteContent(content.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, opacity: 0.6 }}>🗑️</button>
                                              </>
                                            )}
                                          </div>
                                        </div>
                                      )}
                                    />
                                  ) : (
                                    <div style={{ padding: "12px 16px 12px 48px", fontSize: 12, color: "#94a3b8", fontStyle: "italic" }}>İçerik bulunmuyor</div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        />
                      ) : (
                        <div style={{ padding: "16px 32px", fontSize: 13, color: "#94a3b8", fontStyle: "italic" }}>Konu bulunmuyor</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            />
          </div>
        )}
      </div>

      {/* Summary Bar */}
      {bookStructure && (
        <div style={{
          padding: "10px 20px",
          borderTop: "1px solid #e2e8f0",
          background: "#f8fafc",
          display: "flex",
          gap: 20,
          fontSize: 12,
          color: "#64748b",
          fontWeight: 500,
        }}>
          <span>📑 {bookStructure.units?.length || 0} Ünite</span>
          <span>📝 {bookStructure.units?.reduce((s, u) => s + (u.topics?.length || 0), 0) || 0} Konu</span>
          <span>📄 {bookStructure.units?.reduce((s, u) => s + (u.topics || []).reduce((s2, t) => s2 + (t.contents?.length || 0), 0), 0) || 0} İçerik</span>
        </div>
      )}
    </div>
  );
}
