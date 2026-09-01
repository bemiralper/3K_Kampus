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
import { trIncludes } from "@/lib/text-format";

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
            border: "1px solid #8b5cf6",
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
          border: "1px solid #8b5cf6",
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
    const styles: Record<string, React.CSSProperties> = {
      primary: { background: "#0061a6", color: "#fff", border: "1px solid #0061a6" },
      teal: { background: "#0f766e", color: "#fff", border: "1px solid #0f766e" },
      danger: { background: "#dc2626", color: "#fff", border: "1px solid #dc2626" },
      neutral: { background: "#fff", color: "#0f172a", border: "1px solid #cbd5e1" },
    };
    return (
      <button
        type="button"
        disabled={opts?.disabled || busyAction}
        onClick={onClick}
        style={{
          ...styles[variant],
          borderRadius: 8,
          padding: "8px 14px",
          cursor: opts?.disabled || busyAction ? "not-allowed" : "pointer",
          fontSize: 13,
          fontWeight: 700,
          opacity: opts?.disabled || busyAction ? 0.6 : 1,
        }}
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
    !structureSearch || trIncludes(text, structureSearch);

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
    <div
      className={fullPage ? "kk-structure-fullpage" : undefined}
      style={{
      background: "white",
      borderRadius: fullPage ? 16 : 12,
      border: "1px solid #e2e8f0",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      height: fullPage ? "calc(100vh - 88px)" : "calc(100vh - 260px)",
      minHeight: fullPage ? 520 : undefined,
    }}>
      {/* Book Header */}
      <div style={{ padding: 20, borderBottom: "1px solid #e2e8f0", background: "#f8fafc", flexShrink: 0 }}>
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
              {selectedBook.icerik_tamamlandi_mi && <BookContentCompleteBadge />}
              <span
                style={{
                  display: "inline-block",
                  padding: "4px 10px",
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 700,
                  background: "#ecfdf5",
                  color: "#047857",
                  border: "1px solid #a7f3d0",
                }}
                title="Kitaptaki tüm aktif içeriklerin soru sayısı toplamı"
              >
                📝 {totalQuestionCount.toLocaleString("tr-TR")} soru
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button
              onClick={openUsersDrawer}
              style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 14, color: "#047857" }}
              title="Bu kaynağı kullanan öğrencileri göster"
            >
              👥 Kullanan Öğrenciler
            </button>
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
            <button
              onClick={onClose}
              style={{
                background: fullPage ? "#e0f2fe" : "#f1f5f9",
                border: fullPage ? "1px solid #bae6fd" : "none",
                borderRadius: 8,
                padding: "8px 16px",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: fullPage ? 600 : 400,
                color: fullPage ? "#0369a1" : undefined,
              }}
              title={fullPage ? "Kitap listesine dön" : "Kapat"}
            >
              {fullPage ? "← Listeye dön" : "✕"}
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

      {!readOnly && (selectedContentIds.length > 0 || clipboard) && (
        <div
          style={{
            flexShrink: 0,
            padding: "12px 16px",
            borderBottom: "1px solid #93c5fd",
            background: "linear-gradient(180deg, #dbeafe 0%, #eff6ff 100%)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            boxShadow: "0 2px 8px rgba(37, 99, 235, 0.12)",
            zIndex: 5,
          }}
        >
          {selectedContentIds.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <strong style={{ color: "#1e3a8a", fontSize: 14 }}>
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
            <div
              style={{
                fontSize: 13,
                color: "#0f172a",
                background: "#fff",
                border: "1px solid #bfdbfe",
                borderRadius: 8,
                padding: "8px 12px",
                fontWeight: 600,
              }}
            >
              Pano: {clipboard.contentIds.length} içerik{" "}
              {clipboard.mode === "cut" ? "kesildi" : "kopyalandı"}.
              {" "}Hedef konuyu açıp sağdaki{" "}
              <span style={{ color: clipboard.mode === "cut" ? "#0f766e" : "#0369a1" }}>
                {clipboard.mode === "cut" ? "Taşı" : "Yapıştır"}
              </span>{" "}
              butonuna tıklayın.
              <button
                type="button"
                onClick={() => setClipboard(null)}
                style={{
                  marginLeft: 12,
                  border: 0,
                  background: "none",
                  color: "#64748b",
                  cursor: "pointer",
                  textDecoration: "underline",
                  fontSize: 12,
                }}
              >
                Panoyu temizle
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tree Content */}
      <div
        ref={treeScrollRef}
        onScroll={(e) => { treeScrollTopRef.current = e.currentTarget.scrollTop; }}
        style={{ flex: 1, overflowY: "auto", padding: 20 }}
      >
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
                                      <button
                                        onClick={(e) => { e.stopPropagation(); openMoveTopic(unit.id, topic); }}
                                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#0f766e" }}
                                        title="Başka üniteye taşı / kopyala"
                                      >
                                        ↗
                                      </button>
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
                                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                        {clipboard && (
                                          <button
                                            type="button"
                                            onClick={() => { void pasteIntoTopic(topic.id); }}
                                            disabled={busyAction}
                                            style={{
                                              background: clipboard.mode === "cut" ? "#0f766e" : "#0369a1",
                                              color: "white",
                                              border: "2px solid #fff",
                                              boxShadow: "0 0 0 2px " + (clipboard.mode === "cut" ? "#0f766e" : "#0369a1"),
                                              borderRadius: 8,
                                              padding: "6px 12px",
                                              cursor: busyAction ? "wait" : "pointer",
                                              fontSize: 12,
                                              fontWeight: 800,
                                              animation: "kkPulse 1.4s ease-in-out infinite",
                                            }}
                                            title={clipboard.mode === "cut" ? "Kesilen içerikleri buraya taşı" : "Kopyalanan içerikleri buraya yapıştır"}
                                          >
                                            {clipboard.mode === "cut" ? `⬇ Taşı (${clipboard.contentIds.length})` : `⬇ Yapıştır (${clipboard.contentIds.length})`}
                                          </button>
                                        )}
                                        <button onClick={() => onBulkTest(topic.id, topic.ad)} style={{ background: "#f59e0b", color: "white", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11 }}>⚡ Toplu Test</button>
                                        <button onClick={() => onAddContent(topic.id)} style={{ background: "#8b5cf6", color: "white", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11 }}>+ İçerik</button>
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
                                          style={{
                                            ...cDragProps.style,
                                            padding: "8px 16px 8px 48px",
                                            borderTop: "1px solid #e2e8f0",
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "center",
                                            background: isSelected ? "#eff6ff" : "white",
                                            opacity: isCutPending ? 0.55 : 1,
                                          }}
                                          onDragOver={cDragProps.onDragOver}
                                          onDrop={cDragProps.onDrop}
                                        >
                                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            {!readOnly && (
                                              <>
                                                <input
                                                  type="checkbox"
                                                  checked={isSelected}
                                                  onChange={() => toggleContentSelected(content.id)}
                                                  onClick={(e) => e.stopPropagation()}
                                                  title="Seç — Kopyala / Kes / Sil için"
                                                  style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#0061a6" }}
                                                />
                                                <span draggable onDragStart={cDragProps.onDragStart} onDragEnd={cDragProps.onDragEnd}>
                                                  <DragHandle />
                                                </span>
                                              </>
                                            )}
                                            <span>{CONTENT_TYPE_ICON[content.content_type] || "📌"}</span>
                                            {content.content_type === "TEST_SET" ? (
                                              <InlineContentAd
                                                contentId={content.id}
                                                value={content.ad}
                                                readOnly={readOnly}
                                                onSave={onUpdateContentAd}
                                              />
                                            ) : (
                                              <span style={{ fontSize: 13 }}>{content.ad}</span>
                                            )}
                                            <span style={{ fontSize: 11, color: "#64748b" }}>({content.content_type_display})</span>
                                          </div>
                                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
                                                    onClick={() => onDuplicateContent(topic.id, content)}
                                                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12 }}
                                                    title="Testi çoğalt (numara +1)"
                                                  >
                                                    📋
                                                  </button>
                                                )}
                                                <button onClick={() => onEditContent(topic.id, content)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12 }}>✏️</button>
                                                <button onClick={() => onDeleteContent(content.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, opacity: 0.6 }}>🗑️</button>
                                              </>
                                            )}
                                          </div>
                                        </div>
                                        );
                                      }}
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
          flexShrink: 0,
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
          <div
            onClick={() => setUsersDrawerOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.35)", zIndex: 1200 }}
          />
          <div
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              height: "100vh",
              width: "min(420px, 100vw)",
              background: "white",
              zIndex: 1201,
              display: "flex",
              flexDirection: "column",
              boxShadow: "-8px 0 30px rgba(0,0,0,0.15)",
            }}
          >
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>👥 Kullanan Öğrenciler</h3>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>{selectedBook.ad}</p>
              </div>
              <button onClick={() => setUsersDrawerOpen(false)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#64748b" }}>×</button>
            </div>
            <div style={{ padding: "16px 24px", overflowY: "auto", flex: 1 }}>
              {usersLoading ? (
                <div style={{ color: "#64748b", fontSize: 13 }}>Yükleniyor…</div>
              ) : usersList.length === 0 ? (
                <div style={{ color: "#64748b", fontSize: 13 }}>Bu kaynak henüz hiçbir öğrencinin havuzunda değil.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {usersList.map((u) => (
                    <Link
                      key={u.assignment_id}
                      href={`/admin/odev/kaynak-havuzu/${u.student_id}`}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "10px 12px",
                        border: "1px solid #e2e8f0",
                        borderRadius: 8,
                        textDecoration: "none",
                        color: "#0f172a",
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{`${u.ad || ""} ${u.soyad || ""}`.trim() || "—"}</span>
                      <span style={{ fontSize: 12, color: "#94a3b8" }}>→ Detay</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <div style={{ padding: "14px 24px", borderTop: "1px solid #e2e8f0" }}>
              <Link href="/admin/odev/analizler" style={{ fontSize: 13, color: "#0061a6", fontWeight: 600 }}>
                Kaynak Analizlerinde detaylı görüntüle →
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
