// ========== Book Structure Panel (Tree View) ==========
"use client";
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ResourceBook, ResourceUnit, ResourceTopic, ResourceContent } from "../types";
import { BookContentCompleteBadge } from "@/components/resources/BookContentCompleteBadge";
import { fetchAnalyticsBookStudents } from "@/lib/resources-api";
import { DragSortList, DragHandle } from "./DragSortList";
import { StructureSkeleton } from "./Skeletons";
import { GroupContentsModal, MoveTopicModal, PrefixNamesModal } from "./Modals";

type BookStudentUser = {
  assignment_id: number;
  student_id: number;
  ad: string;
  soyad: string;
  assigned_at?: string | null;
};

type ContentClipboard = {
  mode: "copy" | "cut";
  contentIds: number[];
};

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
  onDuplicateContent: (topicId: number, content: ResourceContent) => void;
  onUpdateQuestionCount: (contentId: number, questionCount: number) => Promise<boolean>;
  onUpdateContentAd: (contentId: number, ad: string) => Promise<boolean>;
  onBulkTransferContents: (
    contentIds: number[],
    targetTopicId: number,
    mode: "copy" | "move",
  ) => Promise<boolean>;
  onBulkDeleteContents: (contentIds: number[]) => Promise<boolean>;
  onBulkPrefixNames: (
    contentIds: number[],
    prefix: string,
    withNumber: boolean,
    startNumber: number,
  ) => Promise<boolean>;
  onGroupContentsIntoTopic: (
    contentIds: number[],
    ad: string,
    kod?: string,
  ) => Promise<boolean>;
  onMoveTopic: (
    topicId: number,
    targetUnitId: number,
    mode?: "move" | "copy",
  ) => Promise<boolean>;
  onDeleteContent: (id: number) => void;
  onBulkTest: (topicId: number, topicName: string) => void;
  reorderUnits: (ids: number[]) => void;
  reorderTopics: (ids: number[]) => void;
  reorderContents: (ids: number[]) => void;
  getBookTypeBadgeClass: (renk?: string) => string;
  readOnly?: boolean;
  /** Ayrı sayfada tam genişlik / yükseklik */
  fullPage?: boolean;
}

function InlineQuestionCount({
  contentId,
  value,
  readOnly,
  onSave,
}: {
  contentId: number;
  value: number | null;
  readOnly?: boolean;
  onSave: (contentId: number, questionCount: number) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) return;
    setDraft(value != null ? String(value) : "");
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(t);
  }, [editing, value]);

  const commit = async () => {
    const n = parseInt(draft, 10);
    if (!Number.isFinite(n) || n < 1) {
      setEditing(false);
      return;
    }
    if (n === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const ok = await onSave(contentId, n);
    setSaving(false);
    if (ok) setEditing(false);
  };

  if (readOnly) {
    return value != null ? (
      <span style={{ fontSize: 11, color: "#64748b" }}>{value} soru</span>
    ) : null;
  }

  if (editing) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <input
          ref={inputRef}
          type="number"
          min={1}
          value={draft}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { void commit(); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void commit();
            }
            if (e.key === "Escape") setEditing(false);
          }}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          style={{
            width: 56,
            padding: "2px 6px",
            fontSize: 12,
            border: "1px solid #0061a6",
            borderRadius: 6,
            outline: "none",
          }}
        />
        <span style={{ fontSize: 11, color: "#64748b" }}>soru</span>
      </span>
    );
  }

  return (
    <span
      onDoubleClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        setEditing(true);
      }}
      title="Çift tıkla: soru sayısını düzenle"
      style={{
        fontSize: 11,
        color: value != null ? "#64748b" : "#94a3b8",
        cursor: "text",
        padding: "2px 6px",
        borderRadius: 4,
        userSelect: "none",
        borderBottom: "1px dashed #cbd5e1",
      }}
    >
      {value != null ? `${value} soru` : "soru sayısı"}
    </span>
  );
}

function InlineContentAd({
  contentId,
  value,
  readOnly,
  onSave,
}: {
  contentId: number;
  value: string;
  readOnly?: boolean;
  onSave: (contentId: number, ad: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) return;
    setDraft(value);
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(t);
  }, [editing, value]);

  const commit = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === value) {
      setEditing(false);
      setDraft(value);
      return;
    }
    setSaving(true);
    const ok = await onSave(contentId, trimmed);
    setSaving(false);
    if (ok) setEditing(false);
  };

  if (readOnly) {
    return <span style={{ fontSize: 13 }}>{value}</span>;
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { void commit(); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          }
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        style={{
          minWidth: 120,
          maxWidth: 260,
          padding: "2px 8px",
          fontSize: 13,
          border: "1px solid #0061a6",
          borderRadius: 6,
          outline: "none",
        }}
      />
    );
  }

  return (
    <span
      onDoubleClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        setEditing(true);
      }}
      title="Çift tıkla: adı düzenle"
      style={{
        fontSize: 13,
        cursor: "text",
        borderBottom: "1px dashed #cbd5e1",
        userSelect: "none",
      }}
    >
      {value}
    </span>
  );
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
    onAddContent, onEditContent, onDuplicateContent, onUpdateQuestionCount, onUpdateContentAd,
    onBulkTransferContents, onBulkDeleteContents, onBulkPrefixNames,
    onGroupContentsIntoTopic, onMoveTopic,
    onDeleteContent, onBulkTest,
    reorderUnits, reorderTopics, reorderContents,
    getBookTypeBadgeClass,
    readOnly = false,
    fullPage = false,
  } = props;

  // Kullanan öğrenciler drawer
  const [usersDrawerOpen, setUsersDrawerOpen] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersList, setUsersList] = useState<BookStudentUser[]>([]);

  const openUsersDrawer = async () => {
    setUsersDrawerOpen(true);
    setUsersLoading(true);
    try {
      const res = await fetchAnalyticsBookStudents(selectedBook.id);
      setUsersList(Array.isArray(res.data) ? res.data : []);
    } catch {
      setUsersList([]);
    }
    setUsersLoading(false);
  };

  // Structure search
  const [structureSearch, setStructureSearch] = useState("");
  const treeScrollRef = useRef<HTMLDivElement>(null);
  const treeScrollTopRef = useRef(0);
  const [selectedContentIds, setSelectedContentIds] = useState<number[]>([]);
  const [clipboard, setClipboard] = useState<ContentClipboard | null>(null);
  const [busyAction, setBusyAction] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupLoading, setGroupLoading] = useState(false);
  const [groupForm, setGroupForm] = useState({ ad: "", kod: "" });
  const [moveTopicOpen, setMoveTopicOpen] = useState(false);
  const [moveTopicLoading, setMoveTopicLoading] = useState(false);
  const [moveTopicTarget, setMoveTopicTarget] = useState<{
    topic: ResourceTopic;
    unitId: number;
  } | null>(null);
  const [moveTargetUnitId, setMoveTargetUnitId] = useState<number | "">("");
  const [moveTopicMode, setMoveTopicMode] = useState<"move" | "copy">("move");
  const [prefixOpen, setPrefixOpen] = useState(false);
  const [prefixLoading, setPrefixLoading] = useState(false);
  const [prefixText, setPrefixText] = useState("");
  const [prefixWithNumber, setPrefixWithNumber] = useState(false);
  const [prefixStart, setPrefixStart] = useState(1);

  const contentById = useMemo(() => {
    const byId = new Map<number, ResourceContent>();
    if (!bookStructure?.units) return byId;
    for (const u of bookStructure.units) {
      for (const t of u.topics || []) {
        for (const c of t.contents || []) byId.set(c.id, c);
      }
    }
    return byId;
  }, [bookStructure]);

  const selectedSet = useMemo(() => new Set(selectedContentIds), [selectedContentIds]);

  /** Yapıda hâlâ duran içerik ID'leri — bayat seçim/pano ID'lerini ele. */
  const liveContentIds = (ids: number[]) =>
    ids.filter((id) => contentById.has(id));

  const selectedContentsOrdered = useMemo(() => {
    if (!selectedContentIds.length) return [] as ResourceContent[];
    return selectedContentIds
      .map((id) => contentById.get(id))
      .filter(Boolean) as ResourceContent[];
  }, [contentById, selectedContentIds]);

  const prefixPreviewNames = useMemo(() => {
    const p = prefixText.trim();
    if (!p) return [];
    return selectedContentsOrdered.slice(0, 6).map((c, i) => {
      let base = (c.ad || "").trim();
      if (base.includes("/")) base = base.split("/").pop()?.trim() || base;
      if (prefixWithNumber) return `${p} ${prefixStart + i}/${base}`;
      return `${p}/${base}`;
    });
  }, [prefixText, prefixWithNumber, prefixStart, selectedContentsOrdered]);

  useEffect(() => {
    setSelectedContentIds([]);
    setClipboard(null);
    setGroupOpen(false);
  }, [selectedBook.id]);

  // Yapı yenilenince silinen içerikleri seçim/panodan temizle
  useEffect(() => {
    setSelectedContentIds((prev) => {
      const next = prev.filter((id) => contentById.has(id));
      return next.length === prev.length ? prev : next;
    });
    setClipboard((prev) => {
      if (!prev) return prev;
      const nextIds = prev.contentIds.filter((id) => contentById.has(id));
      if (nextIds.length === prev.contentIds.length) return prev;
      return nextIds.length ? { ...prev, contentIds: nextIds } : null;
    });
  }, [contentById]);

  const toggleContentSelected = (id: number) => {
    setSelectedContentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const clearSelection = () => setSelectedContentIds([]);

  const copySelected = () => {
    const ids = liveContentIds(selectedContentIds);
    if (!ids.length) return;
    setClipboard({ mode: "copy", contentIds: ids });
  };

  const cutSelected = () => {
    const ids = liveContentIds(selectedContentIds);
    if (!ids.length) return;
    setClipboard({ mode: "cut", contentIds: ids });
  };

  const actionBtn = (
    label: string,
    onClick: () => void,
    opts?: { variant?: "primary" | "danger" | "neutral" | "teal"; disabled?: boolean },
  ) => {
    const variant = opts?.variant || "neutral";
    const variantClass = variant === "primary" || variant === "teal"
      ? " kk-st-btn--primary"
      : variant === "danger"
        ? " kk-st-btn--danger"
        : "";
    return (
      <button
        type="button"
        disabled={opts?.disabled || busyAction}
        onClick={onClick}
        className={`kk-st-btn kk-st-btn--sm${variantClass}`}
      >
        {label}
      </button>
    );
  };

  const pasteIntoTopic = async (topicId: number) => {
    if (!clipboard?.contentIds.length || busyAction) return;
    const ids = liveContentIds(clipboard.contentIds);
    if (!ids.length) {
      setClipboard(null);
      return;
    }
    setBusyAction(true);
    const ok = await onBulkTransferContents(
      ids,
      topicId,
      clipboard.mode === "cut" ? "move" : "copy",
    );
    setBusyAction(false);
    if (ok) {
      if (clipboard.mode === "cut") setClipboard(null);
      clearSelection();
    }
  };

  const deleteSelected = async () => {
    const ids = liveContentIds(selectedContentIds);
    if (!ids.length || busyAction) {
      if (!ids.length) clearSelection();
      return;
    }
    if (!confirm(`${ids.length} içerik silinsin mi?`)) return;
    setBusyAction(true);
    const ok = await onBulkDeleteContents(ids);
    setBusyAction(false);
    if (ok) {
      clearSelection();
      const deleted = new Set(ids);
      setClipboard((prev) => {
        if (!prev) return null;
        const left = prev.contentIds.filter((id) => !deleted.has(id));
        return left.length ? { ...prev, contentIds: left } : null;
      });
    }
  };

  const openGroupModal = () => {
    if (!selectedContentIds.length) return;
    setGroupForm({ ad: "", kod: "" });
    setGroupOpen(true);
  };

  const openPrefixModal = () => {
    if (!selectedContentIds.length) return;
    setPrefixText("");
    setPrefixWithNumber(false);
    setPrefixStart(1);
    setPrefixOpen(true);
  };

  const submitPrefix = async () => {
    if (!prefixText.trim()) return;
    const ids = liveContentIds(selectedContentIds);
    if (!ids.length) {
      clearSelection();
      return;
    }
    setPrefixLoading(true);
    const ok = await onBulkPrefixNames(
      ids,
      prefixText,
      prefixWithNumber,
      prefixStart,
    );
    setPrefixLoading(false);
    if (ok) {
      setPrefixOpen(false);
      clearSelection();
    }
  };

  const submitGroup = async () => {
    if (!groupForm.ad.trim()) return;
    const ids = liveContentIds(selectedContentIds);
    if (!ids.length) {
      clearSelection();
      return;
    }
    setGroupLoading(true);
    const ok = await onGroupContentsIntoTopic(
      ids,
      groupForm.ad,
      groupForm.kod || undefined,
    );
    setGroupLoading(false);
    if (ok) {
      setGroupOpen(false);
      clearSelection();
      setClipboard(null);
    }
  };

  const openMoveTopic = (unitId: number, topic: ResourceTopic) => {
    setMoveTopicTarget({ topic, unitId });
    setMoveTargetUnitId("");
    setMoveTopicMode("move");
    setMoveTopicOpen(true);
  };

  const submitMoveTopic = async () => {
    if (!moveTopicTarget || !moveTargetUnitId) return;
    setMoveTopicLoading(true);
    const ok = await onMoveTopic(moveTopicTarget.topic.id, moveTargetUnitId, moveTopicMode);
    setMoveTopicLoading(false);
    if (ok) {
      setMoveTopicOpen(false);
      setMoveTopicTarget(null);
    }
  };

  const unitOptions = (bookStructure?.units || []).map((u) => ({ id: u.id, ad: u.ad }));

  // Yapı yenilenince panel scroll konumunu koru
  useLayoutEffect(() => {
    const el = treeScrollRef.current;
    if (!el || loadingStructure) return;
    el.scrollTop = treeScrollTopRef.current;
  }, [bookStructure, loadingStructure]);

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

  // Yapıdaki içeriklerden canlı toplam; yoksa API alanı
  const totalQuestionCount = (() => {
    let sum = 0;
    let fromStructure = false;
    for (const u of bookStructure?.units || []) {
      for (const t of u.topics || []) {
        for (const c of t.contents || []) {
          fromStructure = true;
          sum += c.question_count || 0;
        }
      }
    }
    if (fromStructure || bookStructure?.units) return sum;
    return selectedBook.total_question_count ?? 0;
  })();

  return (
    <div className={`kk-st${fullPage ? " kk-structure-fullpage" : ""}`}>
      <div className="kk-st-head">
        <div className="kk-st-head-row">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="kk-st-title">{selectedBook.ad}</h2>
            <div className="kk-st-meta">
              <span className={`badge ${getBookTypeBadgeClass(selectedBook.book_type_renk)}`}>{selectedBook.book_type_display}</span>
              <span className="badge badge-secondary">{selectedBook.ders_ad}</span>
              <span className="badge badge-secondary">
                {selectedBook.sinif_seviyeleri_ad || selectedBook.sinif_seviyesi_ad}
              </span>
              {selectedBook.zorluk_display && (
                <span className="kk-st-chip">Zorluk: {selectedBook.zorluk_display}</span>
              )}
              {selectedBook.yayinevi && <span className="badge badge-light">{selectedBook.yayinevi}</span>}
              {selectedBook.icerik_tamamlandi_mi && <BookContentCompleteBadge />}
              <span className="kk-st-chip" title="Kitaptaki tüm aktif içeriklerin soru sayısı toplamı">
                {totalQuestionCount.toLocaleString("tr-TR")} soru
              </span>
            </div>
          </div>
          <div className="kk-st-actions">
            <button type="button" className="kk-st-btn" onClick={openUsersDrawer} title="Bu kaynağı kullanan öğrencileri göster">
              Kullanan öğrenciler
            </button>
            {!readOnly && (
              <>
                <button type="button" className="kk-st-btn" onClick={() => onDuplicateBook(selectedBook)} title="Kitabı kopyala">
                  Kopyala
                </button>
                <button type="button" className="kk-st-btn kk-st-btn--primary" onClick={() => onEditBook(selectedBook)}>
                  Düzenle
                </button>
                <button type="button" className="kk-st-btn kk-st-btn--danger" onClick={() => onDeleteBook(selectedBook.id)}>
                  Sil
                </button>
              </>
            )}
            <button
              type="button"
              className="kk-st-btn"
              onClick={onClose}
              title={fullPage ? "Kitap listesine dön" : "Kapat"}
            >
              {fullPage ? "Listeye dön" : "Kapat"}
            </button>
          </div>
        </div>
      </div>

      <div className="kk-st-toolbar">
        <input
          type="text"
          className="kk-st-search"
          placeholder="Yapıda ara"
          aria-label="Yapıda ara"
          value={structureSearch}
          onChange={e => setStructureSearch(e.target.value)}
        />
        <div className="kk-st-tools">
          <button type="button" className="kk-st-btn kk-st-btn--sm" onClick={expandAll}>Hepsini aç</button>
          <button type="button" className="kk-st-btn kk-st-btn--sm" onClick={collapseAll}>Hepsini kapat</button>
          {!readOnly && (
            <>
              <span className="kk-st-split" aria-hidden />
              <button type="button" className="kk-st-btn kk-st-btn--sm kk-st-btn--primary" onClick={onAddUnit}>Ünite ekle</button>
              <button type="button" className="kk-st-btn kk-st-btn--sm" onClick={onBulkUnit}>Toplu ünite</button>
              <button type="button" className="kk-st-btn kk-st-btn--sm" onClick={onImport}>İçe aktar</button>
            </>
          )}
        </div>
      </div>

      {!readOnly && (selectedContentIds.length > 0 || clipboard) && (
        <div className="kk-st-select">
          {selectedContentIds.length > 0 && (
            <div className="kk-st-tools">
              <strong>
                {selectedContentIds.length} içerik seçili
              </strong>
              {actionBtn("Kopyala", copySelected, { variant: "primary" })}
              {actionBtn("Kes / Taşı", cutSelected, { variant: "teal" })}
              {actionBtn("Ön başlık ekle", openPrefixModal)}
              {actionBtn("Konu altında topla", openGroupModal)}
              {actionBtn("Sil", () => { void deleteSelected(); }, { variant: "danger" })}
              {actionBtn("Seçimi temizle", clearSelection)}
            </div>
          )}
          {clipboard && (
            <div className="kk-st-clip">
              Pano: {clipboard.contentIds.length} içerik{" "}
              {clipboard.mode === "cut" ? "kesildi" : "kopyalandı"}.
              {" "}Hedef konuyu açıp{" "}
              {clipboard.mode === "cut" ? "Taşı" : "Yapıştır"}
              {" "}düğmesine basın.
              <button type="button" className="kk-st-linkish" onClick={() => setClipboard(null)}>
                Panoyu temizle
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tree Content */}
      <div
        className="kk-st-tree"
        ref={treeScrollRef}
        onScroll={(e) => { treeScrollTopRef.current = e.currentTarget.scrollTop; }}
      >
        {loadingStructure ? (
          <StructureSkeleton />
        ) : !sortedUnits.length ? (
          <div className="kk-st-empty">Henüz ünite eklenmemiş</div>
        ) : (
          <div className="kk-st-units">
            <DragSortList
              items={sortedUnits}
              onReorder={readOnly ? () => {} : reorderUnits}
              renderItem={(unit, dragProps) => (
                <div
                  className={`kk-st-unit${expandedUnits.includes(unit.id) ? " is-open" : ""}`}
                  style={{
                    opacity: dragProps.style.opacity,
                    boxShadow: String(dragProps.style.borderTop || "").includes("solid") ? "inset 0 2px 0 #0061a6" : undefined,
                  }}
                  onDragOver={dragProps.onDragOver}
                  onDrop={dragProps.onDrop}
                >
                  <div className="kk-st-unit-h">
                    <div className="kk-st-grow" onClick={() => toggleUnit(unit.id)}>
                      {!readOnly && (
                        <span draggable onDragStart={dragProps.onDragStart} onDragEnd={dragProps.onDragEnd}>
                          <DragHandle />
                        </span>
                      )}
                      <span className={`kk-st-caret${expandedUnits.includes(unit.id) ? " is-open" : ""}`}>▶</span>
                      <span className="kk-st-name">{unit.ad}</span>
                    </div>
                    <div className="kk-st-inline-actions">
                      <span className="kk-st-count">{unit.topic_count || (unit.topics?.length || 0)} konu</span>
                      {!readOnly && (
                        <>
                          <button type="button" className="kk-st-icon" onClick={(e) => { e.stopPropagation(); onEditUnit(unit); }} title="Düzenle" aria-label="Üniteyi düzenle">✏️</button>
                          <button type="button" className="kk-st-icon" onClick={(e) => { e.stopPropagation(); onDuplicateUnit(unit); }} title="Üniteyi kopyala" aria-label="Üniteyi kopyala">📋</button>
                          <button type="button" className="kk-st-icon" onClick={(e) => { e.stopPropagation(); onDeleteUnit(unit.id); }} title="Sil" aria-label="Üniteyi sil">🗑️</button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Topics */}
                  {expandedUnits.includes(unit.id) && (
                    <div className="kk-st-topics">
                      <div className="kk-st-subbar">
                        <span>Konular</span>
                        {!readOnly && (
                          <div className="kk-st-tools">
                            <button type="button" className="kk-st-btn kk-st-btn--sm" onClick={() => onAddTopic(unit.id)}>Konu ekle</button>
                            <button type="button" className="kk-st-btn kk-st-btn--sm" onClick={() => onBulkTopic(unit.id, unit.ad)}>Toplu konu</button>
                          </div>
                        )}
                      </div>

                      {unit.topics?.length ? (
                        <DragSortList
                          items={[...(unit.topics || [])].sort((a, b) => a.sira - b.sira)}
                          onReorder={readOnly ? () => {} : reorderTopics}
                          renderItem={(topic, tDragProps) => (
                            <div
                              className={`kk-st-topic${expandedTopics.includes(topic.id) ? " is-open" : ""}`}
                              style={{
                                opacity: tDragProps.style.opacity,
                                boxShadow: String(tDragProps.style.borderTop || "").includes("solid") ? "inset 0 2px 0 #0061a6" : undefined,
                              }}
                              onDragOver={tDragProps.onDragOver}
                              onDrop={tDragProps.onDrop}
                            >
                              <div className="kk-st-topic-h">
                                <div className="kk-st-grow" onClick={() => toggleTopic(topic.id)}>
                                  {!readOnly && (
                                    <span draggable onDragStart={tDragProps.onDragStart} onDragEnd={tDragProps.onDragEnd}>
                                      <DragHandle />
                                    </span>
                                  )}
                                  <span className={`kk-st-caret${expandedTopics.includes(topic.id) ? " is-open" : ""}`}>▶</span>
                                  <span>{topic.ad}</span>
                                </div>
                                <div className="kk-st-inline-actions">
                                  <span className="kk-st-count">{topic.content_count || (topic.contents?.length || 0)} içerik</span>
                                  {!readOnly && (
                                    <>
                                      <button type="button" className="kk-st-icon" onClick={(e) => { e.stopPropagation(); onEditTopic(unit.id, topic); }} title="Düzenle" aria-label="Konuyu düzenle">✏️</button>
                                      <button type="button" className="kk-st-icon" onClick={(e) => { e.stopPropagation(); onDuplicateTopic(topic); }} title="Konuyu kopyala" aria-label="Konuyu kopyala">📋</button>
                                      <button type="button" className="kk-st-icon" onClick={(e) => { e.stopPropagation(); openMoveTopic(unit.id, topic); }} title="Başka üniteye taşı veya kopyala" aria-label="Konuyu taşı">↗</button>
                                      <button type="button" className="kk-st-icon" onClick={(e) => { e.stopPropagation(); onDeleteTopic(topic.id); }} title="Sil" aria-label="Konuyu sil">🗑️</button>
                                    </>
                                  )}
                                </div>
                              </div>

                              {/* Contents */}
                              {expandedTopics.includes(topic.id) && (
                                <div className="kk-st-contents">
                                  <div className="kk-st-subbar">
                                    <span>İçerikler</span>
                                    {!readOnly && (
                                      <div className="kk-st-tools">
                                        {clipboard && (
                                          <button
                                            type="button"
                                            className="kk-st-btn kk-st-btn--sm kk-st-btn--primary"
                                            onClick={() => { void pasteIntoTopic(topic.id); }}
                                            disabled={busyAction}
                                            title={clipboard.mode === "cut" ? "Kesilen içerikleri buraya taşı" : "Kopyalanan içerikleri buraya yapıştır"}
                                          >
                                            {clipboard.mode === "cut" ? `Taşı (${clipboard.contentIds.length})` : `Yapıştır (${clipboard.contentIds.length})`}
                                          </button>
                                        )}
                                        <button type="button" className="kk-st-btn kk-st-btn--sm" onClick={() => onBulkTest(topic.id, topic.ad)}>Toplu test</button>
                                        <button type="button" className="kk-st-btn kk-st-btn--sm kk-st-btn--primary" onClick={() => onAddContent(topic.id)}>İçerik ekle</button>
                                      </div>
                                    )}
                                  </div>

                                  {topic.contents?.length ? (
                                    <DragSortList
                                      items={[...(topic.contents || [])].sort((a, b) => a.sira - b.sira)}
                                      onReorder={readOnly ? () => {} : reorderContents}
                                      renderItem={(content, cDragProps) => {
                                        const isSelected = selectedSet.has(content.id);
                                        const isCutPending = clipboard?.mode === "cut" && clipboard.contentIds.includes(content.id);
                                        return (
                                        <div
                                          className={`kk-st-content${isSelected ? " is-selected" : ""}${isCutPending ? " is-cut" : ""}`}
                                          style={{
                                            opacity: cDragProps.style.opacity,
                                            boxShadow: String(cDragProps.style.borderTop || "").includes("solid") ? "inset 0 2px 0 #0061a6" : undefined,
                                          }}
                                          onDragOver={cDragProps.onDragOver}
                                          onDrop={cDragProps.onDrop}
                                        >
                                          <div className="kk-st-grow">
                                            {!readOnly && (
                                              <>
                                                <input
                                                  type="checkbox"
                                                  checked={isSelected}
                                                  onChange={() => toggleContentSelected(content.id)}
                                                  onClick={(e) => e.stopPropagation()}
                                                  title="Seç — Kopyala / Kes / Sil için"
                                                  aria-label={`${content.ad} seç`}
                                                />
                                                <span draggable onDragStart={cDragProps.onDragStart} onDragEnd={cDragProps.onDragEnd}>
                                                  <DragHandle />
                                                </span>
                                              </>
                                            )}
                                            <span aria-hidden>{CONTENT_TYPE_ICON[content.content_type] || "•"}</span>
                                            {content.content_type === "TEST_SET" ? (
                                              <InlineContentAd
                                                contentId={content.id}
                                                value={content.ad}
                                                readOnly={readOnly}
                                                onSave={onUpdateContentAd}
                                              />
                                            ) : (
                                              <span>{content.ad}</span>
                                            )}
                                            <span className="kk-st-type">{content.content_type_display}</span>
                                          </div>
                                          <div className="kk-st-inline-actions">
                                            {content.content_type === "TEST_SET" ? (
                                              <InlineQuestionCount
                                                contentId={content.id}
                                                value={content.question_count}
                                                readOnly={readOnly}
                                                onSave={onUpdateQuestionCount}
                                              />
                                            ) : (
                                              content.question_count != null && content.question_count > 0 && (
                                                <span style={{ fontSize: 11, color: "#64748b" }}>{content.question_count} soru</span>
                                              )
                                            )}
                                            {content.page_start && content.page_end && <span style={{ fontSize: 11, color: "#64748b" }}>s.{content.page_start}-{content.page_end}</span>}
                                            {!readOnly && (
                                              <>
                                                {content.content_type === "TEST_SET" && (
                                                  <button
                                                    type="button"
                                                    className="kk-st-icon"
                                                    onClick={() => onDuplicateContent(topic.id, content)}
                                                    title="Testi çoğalt (numara +1)"
                                                    aria-label="Testi çoğalt"
                                                  >
                                                    📋
                                                  </button>
                                                )}
                                                <button type="button" className="kk-st-icon" onClick={() => onEditContent(topic.id, content)} title="Düzenle" aria-label="İçeriği düzenle">✏️</button>
                                                <button type="button" className="kk-st-icon" onClick={() => onDeleteContent(content.id)} title="Sil" aria-label="İçeriği sil">🗑️</button>
                                              </>
                                            )}
                                          </div>
                                        </div>
                                        );
                                      }}
                                    />
                                  ) : (
                                    <div className="kk-st-none">İçerik bulunmuyor</div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        />
                      ) : (
                        <div className="kk-st-none">Konu bulunmuyor</div>
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
        <div className="kk-st-summary">
          <span>{bookStructure.units?.length || 0} ünite</span>
          <span>{bookStructure.units?.reduce((s, u) => s + (u.topics?.length || 0), 0) || 0} konu</span>
          <span>{bookStructure.units?.reduce((s, u) => s + (u.topics || []).reduce((s2, t) => s2 + (t.contents?.length || 0), 0), 0) || 0} içerik</span>
        </div>
      )}

      <GroupContentsModal
        open={groupOpen}
        onClose={() => setGroupOpen(false)}
        contentCount={selectedContentIds.length}
        form={groupForm}
        setForm={setGroupForm}
        loading={groupLoading}
        onSubmit={() => { void submitGroup(); }}
      />

      <PrefixNamesModal
        open={prefixOpen}
        onClose={() => setPrefixOpen(false)}
        contentCount={selectedContentIds.length}
        previewNames={prefixPreviewNames}
        prefix={prefixText}
        setPrefix={setPrefixText}
        withNumber={prefixWithNumber}
        setWithNumber={setPrefixWithNumber}
        startNumber={prefixStart}
        setStartNumber={setPrefixStart}
        loading={prefixLoading}
        onSubmit={() => { void submitPrefix(); }}
      />

      <MoveTopicModal
        open={moveTopicOpen}
        onClose={() => { setMoveTopicOpen(false); setMoveTopicTarget(null); }}
        topicName={moveTopicTarget?.topic.ad || ""}
        currentUnitId={moveTopicTarget?.unitId ?? null}
        units={unitOptions}
        targetUnitId={moveTargetUnitId}
        setTargetUnitId={setMoveTargetUnitId}
        mode={moveTopicMode}
        setMode={setMoveTopicMode}
        loading={moveTopicLoading}
        onSubmit={() => { void submitMoveTopic(); }}
      />

      {usersDrawerOpen && (
        <>
          <div className="kk-st-shade" onClick={() => setUsersDrawerOpen(false)} />
          <div className="kk-st-drawer" role="dialog" aria-modal="true" aria-label="Kullanan öğrenciler">
            <div className="kk-st-drawer-h">
              <div>
                <h3>Kullanan öğrenciler</h3>
                <p>{selectedBook.ad}</p>
              </div>
              <button type="button" className="kk-st-icon" onClick={() => setUsersDrawerOpen(false)} aria-label="Kapat">✕</button>
            </div>
            <div className="kk-st-drawer-b">
              {usersLoading ? (
                <div className="kk-st-none">Yükleniyor…</div>
              ) : usersList.length === 0 ? (
                <div className="kk-st-none">Bu kaynak henüz hiçbir öğrencinin havuzunda değil.</div>
              ) : (
                usersList.map((u) => (
                  <Link
                    key={u.assignment_id}
                    className="kk-st-person"
                    href={`/admin/odev/kaynak-havuzu/${u.student_id}`}
                  >
                    <span>{`${u.ad || ""} ${u.soyad || ""}`.trim() || "—"}</span>
                    <small>Detay</small>
                  </Link>
                ))
              )}
            </div>
            <div className="kk-st-drawer-f">
              <Link href="/admin/odev/analizler">
                Kaynak analizlerinde görüntüle
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
