"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useKaynakPath } from "@/components/kaynak/KaynakPathProvider";
import {
  fetchStudentResourceDetail,
  fetchDersler,
  patchStudentResourceAssignment,
  deleteStudentResourceAssignment,
  fetchAvailableResources,
  bulkAssignResources,
  updatePurchaseListItemStatus,
  type StudentResourceAssignment,
  type StudentResourceLesson,
  type StudentResourceDetail,
  type AvailableResource,
  type Ders,
  type ActivePurchaseList,
} from "@/lib/resources-api";
import PurchaseListModal, { formatDifficulty, difficultyStyle } from "../PurchaseListModal";
import { BookCover } from "@/components/resources/BookCover";

function getPhotoUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http")) return path;
  return path;
}

type Resource = StudentResourceAssignment;
type Lesson = StudentResourceLesson;
type StudentDetail = StudentResourceDetail;

export default function StudentResourceDetailPage() {
  const params = useParams();
  const studentId = params.studentId as string;
  const { havuzHref, isCoachMode } = useKaynakPath();

  // Data state
  const [data, setData] = useState<StudentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [allDersler, setAllDersler] = useState<Ders[]>([]);

  // Expanded lessons
  const [expandedLessons, setExpandedLessons] = useState<number[]>([]);

  // Edit modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<Resource | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const [editOwnershipType, setEditOwnershipType] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editProgress, setEditProgress] = useState(0);

  // Add resource modal
  const [addResourceModalOpen, setAddResourceModalOpen] = useState(false);
  const [addResourceLessonId, setAddResourceLessonId] = useState<number | null>(null);
  const [addResourceLessonName, setAddResourceLessonName] = useState("");
  const [addResourceList, setAddResourceList] = useState<AvailableResource[]>([]);
  const [addResourceSelected, setAddResourceSelected] = useState<number[]>([]);
  const [addResourceLoading, setAddResourceLoading] = useState(false);
  const [addResourceDueDate, setAddResourceDueDate] = useState("");
  const [addResourceOwnershipType, setAddResourceOwnershipType] = useState("TO_PURCHASE");

  // Select lesson modal
  const [selectLessonModalOpen, setSelectLessonModalOpen] = useState(false);

  // Purchase / institution list modals
  const [listModalType, setListModalType] = useState<"PURCHASE" | "INSTITUTION" | null>(null);
  const [statusUpdatingItemId, setStatusUpdatingItemId] = useState<number | null>(null);

  // Fetch student detail
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchStudentResourceDetail(studentId);
      if (result.success && result.data) {
        setData(result.data);
        setExpandedLessons(result.data.lessons.map((l: Lesson) => l.lesson_id));
      }
    } catch (error) {
      console.error("Error fetching student detail:", error);
    }
    setLoading(false);
  }, [studentId]);

  const fetchDerslerList = async () => {
    try {
      const result = await fetchDersler();
      if (result.success && result.data) {
        setAllDersler(result.data);
      }
    } catch (error) {
      console.error("Error fetching dersler:", error);
    }
  };

  useEffect(() => {
    fetchData();
    fetchDerslerList();
  }, [fetchData]);

  // Toggle lesson accordion
  const toggleLesson = (lessonId: number) => {
    setExpandedLessons(prev =>
      prev.includes(lessonId) ? prev.filter(id => id !== lessonId) : [...prev, lessonId]
    );
  };

  // Status badge styles
  const getStatusBadge = (status: string, isOverdue: boolean) => {
    if (isOverdue) return { bg: "#fee2e2", color: "#dc2626" };
    switch (status) {
      case "COMPLETED": return { bg: "#dcfce7", color: "#16a34a" };
      case "IN_PROGRESS": return { bg: "#dbeafe", color: "#2563eb" };
      case "CANCELLED": return { bg: "#f1f5f9", color: "#64748b" };
      default: return { bg: "#fef3c7", color: "#d97706" };
    }
  };

  // Ownership badge styles
  const getOwnershipBadge = (ownershipType: string) => {
    switch (ownershipType) {
      case "STUDENT_OWNED": return { bg: "#dcfce7", color: "#16a34a", icon: "✅", label: "Öğrencide Var" };
      case "TO_PURCHASE": return { bg: "#fef3c7", color: "#d97706", icon: "🛒", label: "Satın Alınacak" };
      case "INSTITUTION_PROVIDED": return { bg: "#dbeafe", color: "#2563eb", icon: "🏫", label: "Kurum Verecek" };
      default: return { bg: "#f1f5f9", color: "#64748b", icon: "❓", label: ownershipType };
    }
  };

  // Open edit modal
  const openEditModal = (resource: Resource) => {
    setEditingResource(resource);
    setEditStatus(resource.status);
    setEditOwnershipType(resource.ownership_type || "TO_PURCHASE");
    setEditDueDate(resource.due_date || "");
    setEditProgress(resource.progress_percent);
    setEditModalOpen(true);
  };

  // Save edit
  const handleSaveEdit = async () => {
    if (!editingResource) return;
    
    try {
      const result = await patchStudentResourceAssignment(editingResource.id, {
        status: editStatus,
        ownership_type: editOwnershipType,
        due_date: editDueDate || null,
        progress_percent: editProgress,
      });
      if (result.success) {
        setEditModalOpen(false);
        fetchData();
      } else {
        alert("Güncelleme hatası");
      }
    } catch {
      alert("Güncelleme hatası");
    }
  };

  // Delete resource
  const handleDelete = async (resourceId: number) => {
    if (!confirm("Bu kaynağı silmek istediğinize emin misiniz?")) return;
    
    try {
      const result = await deleteStudentResourceAssignment(resourceId);
      if (result.success) {
        fetchData();
      }
    } catch (error) {
      console.error("Delete error:", error);
    }
  };

  // Open add resource modal
  const openAddResourceModal = async (lessonId: number, lessonName: string) => {
    setAddResourceLessonId(lessonId);
    setAddResourceLessonName(lessonName);
    setAddResourceSelected([]);
    setAddResourceDueDate("");
    setAddResourceModalOpen(true);
    setAddResourceLoading(true);
    
    try {
      const result = await fetchAvailableResources({
        lesson_ids: lessonId,
        student_ids: parseInt(studentId),
        exclude_assigned: true,
      });
      if (result.success && result.data) {
        setAddResourceList(result.data);
      }
    } catch (error) {
      console.error("Error fetching resources:", error);
    }
    setAddResourceLoading(false);
  };

  // Save added resources
  const handleAddResources = async () => {
    if (addResourceSelected.length === 0) return;
    
    setAddResourceLoading(true);
    try {
      const result = await bulkAssignResources({
        student_ids: [parseInt(studentId)],
        resource_book_ids: addResourceSelected,
        ownership_type: addResourceOwnershipType,
        due_date: addResourceDueDate || null,
        notes: "",
      });
      if (result.success) {
        setAddResourceModalOpen(false);
        setAddResourceSelected([]);
        setAddResourceOwnershipType("TO_PURCHASE");
        fetchData();
      } else {
        const errorMsg = typeof result.error === 'string' 
          ? result.error 
          : JSON.stringify(result.error);
        alert("Kaynak ekleme hatası: " + errorMsg);
      }
    } catch (error) {
      console.error("Kaynak ekleme hatası:", error);
      alert("Kaynak ekleme hatası: Sunucu bağlantı hatası");
    }
    setAddResourceLoading(false);
  };

  const openListPdf = (listId: number) => {
    window.open(`/api/student-resources/purchase-lists/${listId}/pdf/`, "_blank");
  };

  const handleListCreated = (listId: number) => {
    fetchData();
    openListPdf(listId);
  };

  const handleItemStatusChange = async (
    itemId: number,
    itemStatus: "RECEIVED" | "NOT_RECEIVED" | "CANCELLED",
  ) => {
    setStatusUpdatingItemId(itemId);
    try {
      const result = await updatePurchaseListItemStatus(itemId, itemStatus);
      if (result.success) {
        fetchData();
      } else {
        alert(typeof result.error === "string" ? result.error : "Durum güncellenemedi");
      }
    } catch {
      alert("Durum güncellenemedi");
    }
    setStatusUpdatingItemId(null);
  };

  if (loading) {
    return (
      <div style={{ padding: "24px", background: "#f8fafc", minHeight: "100vh" }}>
        <div style={{ textAlign: "center", padding: "60px", color: "#64748b" }}>
          Yükleniyor...
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: "24px", background: "#f8fafc", minHeight: "100vh" }}>
        <div style={{ textAlign: "center", padding: "60px", color: "#64748b" }}>
          Öğrenci bulunamadı
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px", background: "#f8fafc", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <Link
          href={havuzHref()}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            color: "#64748b",
            textDecoration: "none",
            fontSize: "14px",
            marginBottom: "12px"
          }}
        >
          ← Öğrenci Listesine Dön
        </Link>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          {/* Profil Foto */}
          <div style={{
            width: "64px",
            height: "64px",
            borderRadius: "50%",
            background: data.student.profil_foto ? "transparent" : "#e2e8f0",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
          }}>
            {data.student.profil_foto ? (
              <img
                src={getPhotoUrl(data.student.profil_foto)}
                alt={data.student.full_name}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <span style={{ fontSize: "24px", color: "#94a3b8", fontWeight: 600 }}>
                {data.student.ad.charAt(0)}{data.student.soyad.charAt(0)}
              </span>
            )}
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 700 }}>
              {data.student.full_name}
            </h1>
            <p style={{ margin: "4px 0 0", color: "#64748b" }}>
              Öğrenci Kaynak Yönetimi
            </p>
          </div>
        </div>
        {!isCoachMode && (
        <Link
          href={`/admin/odev/ver?student=${studentId}`}
          style={{
            padding: "12px 24px",
            background: "linear-gradient(135deg, #667eea, #764ba2)",
            color: "white",
            border: "none",
            borderRadius: "10px",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "14px",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            textDecoration: "none",
            boxShadow: "0 4px 14px rgba(102,126,234,0.4)",
            transition: "transform 0.15s, box-shadow 0.15s",
            whiteSpace: "nowrap"
          }}
        >
          📝 Bu Öğrenciye Ödev Ver
        </Link>
        )}
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: "16px",
        marginBottom: "24px"
      }}>
        <div style={{ background: "white", padding: "20px", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>Toplam Ders</div>
          <div style={{ fontSize: "28px", fontWeight: 700, color: "#1e293b" }}>{data.summary.total_lessons}</div>
        </div>
        <div style={{ background: "white", padding: "20px", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>Toplam Kaynak</div>
          <div style={{ fontSize: "28px", fontWeight: 700, color: "#3b82f6" }}>{data.summary.total_resources}</div>
        </div>
        <div style={{ background: "white", padding: "20px", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>Tamamlanan</div>
          <div style={{ fontSize: "28px", fontWeight: 700, color: "#10b981" }}>{data.summary.completed}</div>
        </div>
        <div style={{ background: "white", padding: "20px", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>Devam Eden</div>
          <div style={{ fontSize: "28px", fontWeight: 700, color: "#f59e0b" }}>{data.summary.in_progress}</div>
        </div>
        <div style={{ background: "white", padding: "20px", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>Geciken</div>
          <div style={{ fontSize: "28px", fontWeight: 700, color: "#ef4444" }}>{data.summary.overdue}</div>
        </div>
        <div style={{ background: "white", padding: "20px", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>Ortalama İlerleme</div>
          <div style={{ fontSize: "28px", fontWeight: 700, color: "#8b5cf6" }}>{data.summary.avg_progress}%</div>
        </div>
      </div>

      {/* Progress Bar */}
      <div style={{ background: "white", padding: "20px", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", marginBottom: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
          <span style={{ fontSize: "14px", fontWeight: 500 }}>Genel İlerleme</span>
          <span style={{ fontSize: "14px", color: "#64748b" }}>
            {data.summary.completed} / {data.summary.total_resources} kaynak tamamlandı
          </span>
        </div>
        <div style={{ height: "12px", background: "#e2e8f0", borderRadius: "6px", overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: `${data.summary.total_resources > 0 ? (data.summary.completed / data.summary.total_resources) * 100 : 0}%`,
            background: "linear-gradient(90deg, #10b981, #059669)",
            borderRadius: "6px",
            transition: "width 0.5s ease"
          }} />
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: "12px" }}>
          <button
            onClick={() => setListModalType("PURCHASE")}
            style={{
              padding: "12px 24px",
              background: "#f59e0b",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}
          >
            🛒 Kırtasiye Listesi
          </button>
          <button
            onClick={() => setListModalType("INSTITUTION")}
            style={{
              padding: "12px 24px",
              background: "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}
          >
            🏫 Kurum Kaynak Listesi
          </button>
        </div>
        <button
          onClick={() => setSelectLessonModalOpen(true)}
          style={{
            padding: "12px 24px",
            background: "#10b981",
            color: "white",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "14px",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}
        >
          ➕ Yeni Kaynak Ekle
        </button>
      </div>

      {/* Active purchase lists with per-item status buttons */}
      {data.active_purchase_lists && data.active_purchase_lists.length > 0 && (
        <div style={{ marginBottom: "24px" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1e293b", marginBottom: 12 }}>
            Aktif Satın Alma Listeleri
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {data.active_purchase_lists.map((list: ActivePurchaseList) => (
              <div
                key={list.id}
                style={{
                  background: "white",
                  borderRadius: 12,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                  overflow: "hidden",
                }}
              >
                <div style={{
                  padding: "14px 18px",
                  background: list.list_type === "PURCHASE" ? "#fffbeb" : "#eff6ff",
                  borderBottom: "1px solid #e2e8f0",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>
                      {list.list_type === "PURCHASE" ? "🛒" : "🏫"} {list.title}
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                      {list.list_type_display} · {list.items.length} bekleyen kalem
                    </div>
                  </div>
                  <button
                    onClick={() => openListPdf(list.id)}
                    style={{
                      padding: "8px 14px",
                      background: "#f1f5f9",
                      border: "none",
                      borderRadius: 8,
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    PDF
                  </button>
                </div>
                <div style={{ padding: "12px 18px" }}>
                  {list.items.map(item => (
                    <div
                      key={item.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "10px 0",
                        borderBottom: "1px solid #f1f5f9",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <BookCover src={item.kapak_url} alt={item.resource_name} size="sm" />
                        <span style={{ fontWeight: 500, fontSize: 14 }}>{item.resource_name}</span>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        {(["RECEIVED", "NOT_RECEIVED", "CANCELLED"] as const).map(status => {
                          const labels = { RECEIVED: "Alındı", NOT_RECEIVED: "Alınmadı", CANCELLED: "İptal" };
                          const colors = {
                            RECEIVED: { bg: "#dcfce7", color: "#16a34a" },
                            NOT_RECEIVED: { bg: "#fee2e2", color: "#dc2626" },
                            CANCELLED: { bg: "#f1f5f9", color: "#64748b" },
                          };
                          const style = colors[status];
                          const busy = statusUpdatingItemId === item.id;
                          return (
                            <button
                              key={status}
                              disabled={busy}
                              onClick={() => handleItemStatusChange(item.id, status)}
                              style={{
                                padding: "6px 10px",
                                background: style.bg,
                                color: style.color,
                                border: "none",
                                borderRadius: 6,
                                cursor: busy ? "wait" : "pointer",
                                fontSize: 11,
                                fontWeight: 600,
                                opacity: busy ? 0.6 : 1,
                              }}
                            >
                              {labels[status]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Assigned resources */}
      <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1e293b", marginBottom: 12 }}>
        Atanan Kaynaklar
      </h2>
      {data.lessons.length === 0 ? (
        <div style={{
          background: "white",
          padding: "60px",
          borderRadius: "12px",
          textAlign: "center",
          color: "#64748b"
        }}>
          <p style={{ marginBottom: "16px", fontSize: "16px" }}>Bu öğrenciye henüz kaynak atanmamış.</p>
          <button
            onClick={() => setSelectLessonModalOpen(true)}
            style={{
              padding: "12px 24px",
              background: "#10b981",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: 600
            }}
          >
            ➕ İlk Kaynağı Ekle
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {data.lessons.map(lesson => (
            <div key={lesson.lesson_id} style={{ background: "white", borderRadius: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", overflow: "hidden" }}>
              {/* Lesson Header */}
              <div
                onClick={() => toggleLesson(lesson.lesson_id)}
                style={{
                  padding: "16px 20px",
                  background: "#f8fafc",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderBottom: expandedLessons.includes(lesson.lesson_id) ? "1px solid #e2e8f0" : "none"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{ fontSize: "18px" }}>{expandedLessons.includes(lesson.lesson_id) ? "📖" : "📕"}</span>
                  <span style={{ fontWeight: 600, fontSize: "16px" }}>{lesson.lesson_name}</span>
                  <span style={{ background: "#e2e8f0", padding: "4px 10px", borderRadius: "12px", fontSize: "12px", fontWeight: 500 }}>
                    {lesson.completed}/{lesson.total}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                  {/* Mini progress */}
                  <div style={{ width: "100px", height: "6px", background: "#e2e8f0", borderRadius: "3px", overflow: "hidden" }}>
                    <div style={{
                      height: "100%",
                      width: `${lesson.completion_percent}%`,
                      background: lesson.completion_percent === 100 ? "#10b981" : "#3b82f6",
                      borderRadius: "3px"
                    }} />
                  </div>
                  <span style={{ fontSize: "13px", color: "#64748b", minWidth: "40px" }}>{lesson.completion_percent}%</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); openAddResourceModal(lesson.lesson_id, lesson.lesson_name); }}
                    style={{
                      padding: "6px 12px",
                      background: "#10b981",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "12px",
                      fontWeight: 500
                    }}
                  >
                    ➕ Ekle
                  </button>
                  <span style={{ fontSize: "18px", color: "#94a3b8" }}>
                    {expandedLessons.includes(lesson.lesson_id) ? "▼" : "▶"}
                  </span>
                </div>
              </div>

              {/* Resources */}
              {expandedLessons.includes(lesson.lesson_id) && (
                <div style={{ padding: "16px 20px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                        <th style={{ textAlign: "left", padding: "10px 8px", fontSize: "12px", color: "#64748b", fontWeight: 500 }}>Kaynak</th>
                        <th style={{ textAlign: "left", padding: "10px 8px", fontSize: "12px", color: "#64748b", fontWeight: 500 }}>Tür</th>
                        <th style={{ textAlign: "center", padding: "10px 8px", fontSize: "12px", color: "#64748b", fontWeight: 500 }}>Zorluk</th>
                        <th style={{ textAlign: "center", padding: "10px 8px", fontSize: "12px", color: "#64748b", fontWeight: 500 }}>Sahiplik</th>
                        <th style={{ textAlign: "center", padding: "10px 8px", fontSize: "12px", color: "#64748b", fontWeight: 500 }}>Durum</th>
                        <th style={{ textAlign: "center", padding: "10px 8px", fontSize: "12px", color: "#64748b", fontWeight: 500 }}>İlerleme</th>
                        <th style={{ textAlign: "center", padding: "10px 8px", fontSize: "12px", color: "#64748b", fontWeight: 500 }}>Son Tarih</th>
                        <th style={{ textAlign: "center", padding: "10px 8px", fontSize: "12px", color: "#64748b", fontWeight: 500 }}>İşlemler</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lesson.resources.map(resource => {
                        const statusStyle = getStatusBadge(resource.status, resource.is_overdue);
                        return (
                          <tr key={resource.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "12px 8px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <BookCover src={resource.kapak_url} alt={resource.resource_name} size="sm" />
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontWeight: 500 }}>{resource.resource_name}</div>
                                  {resource.resource_yayin_yili && (
                                    <div style={{ fontSize: "11px", color: "#94a3b8" }}>
                                      {resource.resource_yayinevi} • {resource.resource_yayin_yili}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td style={{ padding: "12px 8px" }}>
                              <span style={{
                                background: resource.resource_type_renk || "#dbeafe",
                                color: "#1e40af",
                                padding: "4px 8px",
                                borderRadius: "4px",
                                fontSize: "11px",
                                fontWeight: 500
                              }}>
                                {resource.resource_type}
                              </span>
                            </td>
                            <td style={{ padding: "12px 8px", textAlign: "center", fontSize: "13px" }}>
                              {resource.difficulty_level_snapshot || "-"}
                            </td>
                            <td style={{ padding: "12px 8px", textAlign: "center" }}>
                              {(() => {
                                const ownershipStyle = getOwnershipBadge(resource.ownership_type);
                                return (
                                  <span style={{
                                    background: ownershipStyle.bg,
                                    color: ownershipStyle.color,
                                    padding: "4px 10px",
                                    borderRadius: "6px",
                                    fontSize: "11px",
                                    fontWeight: 500
                                  }}>
                                    {ownershipStyle.icon} {ownershipStyle.label}
                                  </span>
                                );
                              })()}
                            </td>
                            <td style={{ padding: "12px 8px", textAlign: "center" }}>
                              <span style={{
                                background: statusStyle.bg,
                                color: statusStyle.color,
                                padding: "4px 10px",
                                borderRadius: "6px",
                                fontSize: "12px",
                                fontWeight: 500
                              }}>
                                {resource.is_overdue ? "⚠️ Gecikti" : resource.status_display}
                              </span>
                            </td>
                            <td style={{ padding: "12px 8px", textAlign: "center" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "center" }}>
                                <div style={{ width: "60px", height: "6px", background: "#e2e8f0", borderRadius: "3px", overflow: "hidden" }}>
                                  <div style={{
                                    height: "100%",
                                    width: `${resource.progress_percent}%`,
                                    background: resource.progress_percent === 100 ? "#10b981" : "#3b82f6"
                                  }} />
                                </div>
                                <span style={{ fontSize: "12px", fontWeight: 500 }}>{resource.progress_percent}%</span>
                              </div>
                            </td>
                            <td style={{ padding: "12px 8px", textAlign: "center", fontSize: "12px", color: resource.is_overdue ? "#dc2626" : "#64748b" }}>
                              {resource.due_date ? new Date(resource.due_date).toLocaleDateString("tr-TR") : "-"}
                            </td>
                            <td style={{ padding: "12px 8px", textAlign: "center" }}>
                              <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
                                <button
                                  onClick={() => openEditModal(resource)}
                                  style={{ padding: "6px 8px", background: "#f1f5f9", border: "none", borderRadius: "4px", cursor: "pointer" }}
                                  title="Düzenle"
                                >
                                  ✏️
                                </button>
                                <button
                                  onClick={() => handleDelete(resource.id)}
                                  style={{ padding: "6px 8px", background: "#fee2e2", border: "none", borderRadius: "4px", cursor: "pointer" }}
                                  title="Sil"
                                >
                                  🗑️
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Edit Modal */}
      {editModalOpen && editingResource && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000
        }}>
          <div style={{ background: "white", borderRadius: "16px", width: "90%", maxWidth: "500px", padding: "24px" }}>
            <h3 style={{ margin: "0 0 20px", fontSize: "18px", fontWeight: 600 }}>
              ✏️ Kaynak Düzenle
            </h3>
            <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: "14px" }}>
              {editingResource.resource_name}
            </p>
            
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", marginBottom: "6px", fontWeight: 500 }}>Durum</label>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: "8px" }}
              >
                <option value="ASSIGNED">Atandı</option>
                <option value="IN_PROGRESS">Devam Ediyor</option>
                <option value="COMPLETED">Tamamlandı</option>
                <option value="CANCELLED">İptal</option>
              </select>
            </div>
            
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", marginBottom: "6px", fontWeight: 500 }}>Sahiplik Durumu</label>
              <select
                value={editOwnershipType}
                onChange={(e) => setEditOwnershipType(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: "8px" }}
              >
                <option value="STUDENT_OWNED">✅ Öğrencide Var</option>
                <option value="TO_PURCHASE">🛒 Satın Alınacak</option>
                <option value="INSTITUTION_PROVIDED">🏫 Kurum Verecek</option>
              </select>
            </div>
            
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", marginBottom: "6px", fontWeight: 500 }}>Son Tarih</label>
              <input
                type="date"
                value={editDueDate}
                onChange={(e) => setEditDueDate(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: "8px" }}
              />
            </div>
            
            <div style={{ marginBottom: "24px" }}>
              <label style={{ display: "block", marginBottom: "6px", fontWeight: 500 }}>İlerleme: {editProgress}%</label>
              <input
                type="range"
                min="0"
                max="100"
                value={editProgress}
                onChange={(e) => setEditProgress(parseInt(e.target.value))}
                style={{ width: "100%" }}
              />
            </div>
            
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setEditModalOpen(false)}
                style={{ padding: "10px 20px", background: "#f1f5f9", border: "none", borderRadius: "8px", cursor: "pointer" }}
              >
                İptal
              </button>
              <button
                onClick={handleSaveEdit}
                style={{ padding: "10px 20px", background: "#10b981", color: "white", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 600 }}
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Select Lesson Modal */}
      {selectLessonModalOpen && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000
        }}>
          <div style={{ background: "white", borderRadius: "12px", width: "400px", maxHeight: "70vh", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 600 }}>📖 Ders Seçin</h3>
              <button onClick={() => setSelectLessonModalOpen(false)} style={{ background: "none", border: "none", fontSize: "24px", cursor: "pointer", color: "#64748b" }}>×</button>
            </div>
            <div style={{ padding: "16px 24px", overflowY: "auto", flex: 1 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {allDersler.map(ders => (
                  <button
                    key={ders.id}
                    onClick={() => { setSelectLessonModalOpen(false); openAddResourceModal(ders.id, ders.ad); }}
                    style={{
                      padding: "12px 16px",
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                      cursor: "pointer",
                      textAlign: "left",
                      fontSize: "14px",
                      fontWeight: 500
                    }}
                  >
                    📖 {ders.ad}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Resource Modal */}
      {addResourceModalOpen && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1001
        }}>
          <div style={{ background: "white", borderRadius: "12px", width: "600px", maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 600 }}>📚 {addResourceLessonName} - Kaynak Ekle</h3>
                <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#64748b" }}>Öğrenciye atanabilecek kaynaklar</p>
              </div>
              <button onClick={() => setAddResourceModalOpen(false)} style={{ background: "none", border: "none", fontSize: "24px", cursor: "pointer", color: "#64748b" }}>×</button>
            </div>
            
            <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
              {addResourceLoading ? (
                <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>Kaynaklar yükleniyor...</div>
              ) : addResourceList.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>Bu ders için atanabilecek kaynak bulunamadı.</div>
              ) : (
                <>
                  <p style={{ margin: "0 0 16px", fontSize: "13px", color: "#64748b" }}>
                    {addResourceList.length} kaynak mevcut. Seçili: {addResourceSelected.length}
                  </p>
                  
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
                    {addResourceList.sort((a, b) => (a.book_type || '').localeCompare(b.book_type || '')).map(resource => {
                      const diff = formatDifficulty(resource);
                      const diffStyle = difficultyStyle(diff);
                      return (
                      <label
                        key={resource.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          padding: "12px",
                          border: addResourceSelected.includes(resource.id) ? "2px solid #10b981" : "1px solid #e2e8f0",
                          borderRadius: "8px",
                          cursor: "pointer",
                          background: addResourceSelected.includes(resource.id) ? "#f0fdf4" : "white"
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={addResourceSelected.includes(resource.id)}
                          onChange={() => {
                            setAddResourceSelected(prev =>
                              prev.includes(resource.id) ? prev.filter(id => id !== resource.id) : [...prev, resource.id]
                            );
                          }}
                          style={{ marginRight: "12px" }}
                        />
                        <BookCover src={resource.kapak_url} alt={resource.ad} size="sm" />
                        <div style={{ flex: 1, marginLeft: 10 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                              <span style={{ fontWeight: 500 }}>{resource.ad}</span>
                              {resource.book_type && (
                                <span style={{ background: resource.book_type_renk || "#dbeafe", color: "#1d4ed8", padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 500 }}>
                                  {resource.book_type}
                                </span>
                              )}
                            </div>
                            <span style={{
                              background: diffStyle.bg,
                              color: diffStyle.color,
                              padding: "4px 10px",
                              borderRadius: 999,
                              fontSize: 12,
                              fontWeight: 700,
                              whiteSpace: "nowrap",
                            }}>
                              {diff ? `Zorluk ${diff}` : "Zorluk —"}
                            </span>
                          </div>
                          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                            {resource.yayin_yili && <span>📆 {resource.yayin_yili}</span>}
                            {resource.yayinevi && <span>🏢 {resource.yayinevi}</span>}
                            {resource.toplam_sayfa ? <span>📄 {resource.toplam_sayfa} sf.</span> : null}
                          </div>
                        </div>
                      </label>
                    );})}
                  </div>
                  
                  <div style={{ marginBottom: "16px" }}>
                    <label style={{ display: "block", marginBottom: "6px", fontWeight: 500, fontSize: "14px" }}>Sahiplik Durumu</label>
                    <select
                      value={addResourceOwnershipType}
                      onChange={(e) => setAddResourceOwnershipType(e.target.value)}
                      style={{ width: "100%", padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: "8px" }}
                    >
                      <option value="STUDENT_OWNED">✅ Öğrencide Var</option>
                      <option value="TO_PURCHASE">🛒 Satın Alınacak</option>
                      <option value="INSTITUTION_PROVIDED">🏫 Kurum Verecek</option>
                    </select>
                  </div>
                  
                  <div style={{ marginBottom: "16px" }}>
                    <label style={{ display: "block", marginBottom: "6px", fontWeight: 500, fontSize: "14px" }}>Son Tarih (Opsiyonel)</label>
                    <input
                      type="date"
                      value={addResourceDueDate}
                      onChange={(e) => setAddResourceDueDate(e.target.value)}
                      style={{ width: "100%", padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: "8px" }}
                    />
                  </div>
                </>
              )}
            </div>
            
            <div style={{ padding: "16px 24px", borderTop: "1px solid #e2e8f0", display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button onClick={() => setAddResourceModalOpen(false)} style={{ padding: "10px 20px", background: "#f1f5f9", border: "none", borderRadius: "8px", cursor: "pointer" }}>
                İptal
              </button>
              <button
                onClick={handleAddResources}
                disabled={addResourceSelected.length === 0 || addResourceLoading}
                style={{
                  padding: "10px 20px",
                  background: addResourceSelected.length === 0 ? "#94a3b8" : "#10b981",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: addResourceSelected.length === 0 ? "not-allowed" : "pointer",
                  fontWeight: 600
                }}
              >
                {addResourceLoading ? "Ekleniyor..." : `${addResourceSelected.length} Kaynak Ekle`}
              </button>
            </div>
          </div>
        </div>
      )}

      <PurchaseListModal
        open={listModalType !== null}
        listType={listModalType || "PURCHASE"}
        studentId={studentId}
        onClose={() => setListModalType(null)}
        onCreated={handleListCreated}
      />
    </div>
  );
}
