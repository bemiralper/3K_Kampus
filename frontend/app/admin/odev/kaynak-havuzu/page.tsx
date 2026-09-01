"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useKaynakPath } from "@/components/kaynak/KaynakPathProvider";
import {
  fetchStudentResourceList,
  fetchDersler,
  fetchAvailableResources,
  bulkAssignResources,
  type StudentWithResources,
  type StudentResourceKPI,
  type Ders,
  type AvailableResource,
} from "@/lib/resources-api";
import { BookCover } from "@/components/resources/BookCover";
import { useToast, ToastBanner } from "./Toast";
import { trIncludes } from "@/lib/text-format";
import "./kaynak-havuzu.css";

type FilterType = "all" | "with_resources" | "without_resources" | "with_overdue" | "with_incomplete";

function getPhotoUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http")) return path;
  return path;
}

export default function StudentResourcePoolPage() {
  const { havuzHref } = useKaynakPath();
  const { toast, showToast } = useToast();
  // Data state
  const [students, setStudents] = useState<StudentWithResources[]>([]);
  const [kpi, setKpi] = useState<StudentResourceKPI | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "progress" | "resources" | "risk">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Sayfalama
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(1);

  // Toplu kaynak atama
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkDersler, setBulkDersler] = useState<Ders[]>([]);
  const [bulkLessonId, setBulkLessonId] = useState<string>("");
  const [bulkAvailable, setBulkAvailable] = useState<AvailableResource[]>([]);
  const [bulkSelectedBooks, setBulkSelectedBooks] = useState<number[]>([]);
  const [bulkOwnership, setBulkOwnership] = useState("TO_PURCHASE");
  const [bulkDueDate, setBulkDueDate] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchStudentResourceList();
      if (result.success && result.data) {
        setStudents(result.data);
        if (result.kpi) setKpi(result.kpi);
      }
    } catch (error) {
      console.error("Error fetching student list:", error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filter students
  const filteredStudents = students.filter(s => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.trim();
      if (!trIncludes(`${s.ad} ${s.soyad} ${s.ogrenci_no}`, query)) {
        return false;
      }
    }

    // Status filter
    switch (activeFilter) {
      case "with_resources":
        return s.has_resources;
      case "without_resources":
        return !s.has_resources;
      case "with_overdue":
        return s.overdue > 0;
      case "with_incomplete":
        return s.has_resources && s.completed < s.total_resources;
      default:
        return true;
    }
  });

  // Sort students
  const sortedStudents = [...filteredStudents].sort((a, b) => {
    let comparison = 0;
    switch (sortBy) {
      case "name":
        comparison = `${a.ad} ${a.soyad}`.localeCompare(`${b.ad} ${b.soyad}`);
        break;
      case "progress":
        comparison = a.avg_progress - b.avg_progress;
        break;
      case "resources":
        comparison = a.total_resources - b.total_resources;
        break;
      case "risk":
        comparison = a.risk_score - b.risk_score;
        break;
    }
    return sortOrder === "desc" ? -comparison : comparison;
  });

  const totalPages = Math.max(1, Math.ceil(sortedStudents.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedStudents = sortedStudents.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, activeFilter, sortBy, sortOrder]);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allVisibleSelected = pagedStudents.length > 0 && pagedStudents.every((s) => selectedIds.has(s.id));
  const toggleSelectAllVisible = () => {
    setSelectedIds((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        pagedStudents.forEach((s) => next.delete(s.id));
        return next;
      }
      const next = new Set(prev);
      pagedStudents.forEach((s) => next.add(s.id));
      return next;
    });
  };

  const openBulkModal = async () => {
    setBulkModalOpen(true);
    setBulkLessonId("");
    setBulkAvailable([]);
    setBulkSelectedBooks([]);
    setBulkOwnership("TO_PURCHASE");
    setBulkDueDate("");
    if (bulkDersler.length === 0) {
      const res = await fetchDersler();
      if (res.success && res.data) setBulkDersler(res.data);
    }
  };

  const handleBulkLessonChange = async (lessonId: string) => {
    setBulkLessonId(lessonId);
    setBulkSelectedBooks([]);
    if (!lessonId) {
      setBulkAvailable([]);
      return;
    }
    const res = await fetchAvailableResources({
      lesson_ids: parseInt(lessonId, 10),
      student_ids: Array.from(selectedIds),
    });
    setBulkAvailable(res.success && res.data ? res.data : []);
  };

  const handleBulkAssign = async () => {
    if (bulkSelectedBooks.length === 0 || selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      const result = await bulkAssignResources({
        student_ids: Array.from(selectedIds),
        resource_book_ids: bulkSelectedBooks,
        ownership_type: bulkOwnership,
        due_date: bulkDueDate || null,
      });
      if (result.success) {
        const created = result.data?.created ?? 0;
        const skipped = result.data?.skipped ?? 0;
        const errorCount = result.data?.errors?.length ?? 0;
        let msg = `✅ ${created} atama oluşturuldu`;
        if (skipped) msg += ` · ${skipped} zaten mevcuttu, atlandı`;
        if (errorCount) msg += ` · ${errorCount} hata`;
        showToast(msg, errorCount ? "error" : "success");
        setBulkModalOpen(false);
        setSelectedIds(new Set());
        fetchData();
      } else {
        const errMsg = typeof result.error === "string" ? result.error : JSON.stringify(result.error);
        showToast(`❌ ${errMsg}`, "error");
      }
    } catch {
      showToast("❌ Toplu atama sırasında hata oluştu", "error");
    }
    setBulkLoading(false);
  };

  // Risk badge color
  const getRiskColor = (risk: number) => {
    if (risk >= 60) return { bg: "#fee2e2", color: "#dc2626" };
    if (risk >= 30) return { bg: "#fef3c7", color: "#d97706" };
    if (risk > 0) return { bg: "#fef9c3", color: "#ca8a04" };
    return { bg: "#d1fae5", color: "#059669" };
  };

  // KPI Card Component
  const KPICard = ({ title, value, icon, color, onClick, active }: { title: string; value: number; icon: string; color: string; onClick?: () => void; active?: boolean }) => (
    <div
      onClick={onClick}
      style={{
        background: active ? color : "white",
        padding: "20px",
        borderRadius: "12px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        cursor: onClick ? "pointer" : "default",
        border: active ? "2px solid" : "1px solid transparent",
        borderColor: active ? color : "transparent",
        transition: "all 0.2s"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <span style={{ fontSize: "28px" }}>{icon}</span>
        <div>
          <div style={{ fontSize: "12px", color: active ? "rgba(255,255,255,0.8)" : "#64748b", marginBottom: "2px" }}>{title}</div>
          <div style={{ fontSize: "28px", fontWeight: 700, color: active ? "white" : "#1e293b" }}>{value}</div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="kh-page">
      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 700 }}>📚 Kitap Atamaları</h1>
        <p style={{ margin: "8px 0 0", color: "#64748b" }}>Öğrencilerin kaynak atamalarını yönetin</p>
      </div>

      {/* KPI Cards */}
      {kpi && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "16px",
          marginBottom: "24px"
        }}>
          <KPICard
            title="Toplam Öğrenci"
            value={kpi.total_students}
            icon="👥"
            color="#3b82f6"
            onClick={() => setActiveFilter("all")}
            active={activeFilter === "all"}
          />
          <KPICard
            title="Kaynak Atanmış"
            value={kpi.with_resources}
            icon="📗"
            color="#10b981"
            onClick={() => setActiveFilter("with_resources")}
            active={activeFilter === "with_resources"}
          />
          <KPICard
            title="Kaynak Atanmamış"
            value={kpi.without_resources}
            icon="📕"
            color="#f59e0b"
            onClick={() => setActiveFilter("without_resources")}
            active={activeFilter === "without_resources"}
          />
          <KPICard
            title="Tamamlanmamış"
            value={kpi.with_incomplete}
            icon="⏳"
            color="#8b5cf6"
            onClick={() => setActiveFilter("with_incomplete")}
            active={activeFilter === "with_incomplete"}
          />
          <KPICard
            title="Geciken"
            value={kpi.with_overdue}
            icon="⚠️"
            color="#ef4444"
            onClick={() => setActiveFilter("with_overdue")}
            active={activeFilter === "with_overdue"}
          />
          <div style={{
            background: "white",
            padding: "20px",
            borderRadius: "12px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "28px" }}>📊</span>
              <div>
                <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "2px" }}>Ort. Tamamlama</div>
                <div style={{ fontSize: "28px", fontWeight: 700, color: "#1e293b" }}>{kpi.avg_completion}%</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters & Search */}
      <div style={{
        background: "white",
        padding: "16px 20px",
        borderRadius: "12px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        marginBottom: "16px",
        display: "flex",
        gap: "16px",
        flexWrap: "wrap",
        alignItems: "center"
      }}>
        <div style={{ flex: 1, minWidth: "200px" }}>
          <input
            type="text"
            placeholder="🔍 Öğrenci ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 14px",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              fontSize: "14px"
            }}
          />
        </div>
        
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span style={{ fontSize: "13px", color: "#64748b" }}>Sırala:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            style={{ padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: "6px", fontSize: "13px" }}
          >
            <option value="name">İsim</option>
            <option value="progress">İlerleme</option>
            <option value="resources">Kaynak Sayısı</option>
            <option value="risk">Risk Skoru</option>
          </select>
          <button
            onClick={() => setSortOrder(prev => prev === "asc" ? "desc" : "asc")}
            style={{
              padding: "8px 12px",
              background: "#f1f5f9",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "13px"
            }}
          >
            {sortOrder === "asc" ? "↑" : "↓"}
          </button>
        </div>

        <div style={{ fontSize: "13px", color: "#64748b" }}>
          {sortedStudents.length === 0
            ? "0 öğrenci gösteriliyor"
            : `${(currentPage - 1) * PAGE_SIZE + 1}-${Math.min(currentPage * PAGE_SIZE, sortedStudents.length)} / ${sortedStudents.length} öğrenci gösteriliyor`}
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div style={{
          background: "#eff6ff",
          border: "1px solid #bfdbfe",
          padding: "12px 20px",
          borderRadius: "12px",
          marginBottom: "16px",
          display: "flex",
          gap: "12px",
          flexWrap: "wrap",
          alignItems: "center",
        }}>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "#1e40af" }}>
            {selectedIds.size} öğrenci seçili
          </span>
          <button
            type="button"
            onClick={openBulkModal}
            style={{
              padding: "8px 16px",
              background: "#2563eb",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 600,
            }}
          >
            📚 Toplu Kaynak Ata
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            style={{
              padding: "8px 16px",
              background: "transparent",
              color: "#64748b",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            Seçimi Temizle
          </button>
        </div>
      )}

      {/* Student List */}
      <div style={{
        background: "white",
        borderRadius: "12px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        overflow: "hidden"
      }}>
        {loading ? (
          <div style={{ padding: "60px", textAlign: "center", color: "#64748b" }}>
            Yükleniyor...
          </div>
        ) : sortedStudents.length === 0 ? (
          <div style={{ padding: "60px", textAlign: "center", color: "#64748b" }}>
            Öğrenci bulunamadı
          </div>
        ) : (
          <>
            <div className="kh-list-desktop kh-table-wrap">
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    <th style={{ padding: "14px 8px", width: 36 }}>
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleSelectAllVisible}
                        title="Bu sayfadaki tüm öğrencileri seç"
                      />
                    </th>
                    <th style={{ textAlign: "left", padding: "14px 16px", fontSize: "13px", color: "#64748b", fontWeight: 500 }}>Öğrenci</th>
                    <th style={{ textAlign: "center", padding: "14px 16px", fontSize: "13px", color: "#64748b", fontWeight: 500 }}>Toplam Kaynak</th>
                    <th style={{ textAlign: "center", padding: "14px 16px", fontSize: "13px", color: "#64748b", fontWeight: 500 }} title="Öğrencinin bitirdiği kaynak sayısı (kitap içeriğinin tamamlanma durumuyla ilgisi yoktur)">Tamamlanan Kaynak</th>
                    <th style={{ textAlign: "center", padding: "14px 16px", fontSize: "13px", color: "#64748b", fontWeight: 500 }}>Devam Eden</th>
                    <th style={{ textAlign: "center", padding: "14px 16px", fontSize: "13px", color: "#64748b", fontWeight: 500 }}>Geciken</th>
                    <th style={{ textAlign: "center", padding: "14px 16px", fontSize: "13px", color: "#64748b", fontWeight: 500 }}>İlerleme</th>
                    <th style={{ textAlign: "center", padding: "14px 16px", fontSize: "13px", color: "#64748b", fontWeight: 500 }}>Risk</th>
                    <th style={{ textAlign: "center", padding: "14px 16px", fontSize: "13px", color: "#64748b", fontWeight: 500 }}>İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedStudents.map((student, index) => {
                    const riskStyle = getRiskColor(student.risk_score);
                    return (
                      <tr
                        key={student.id}
                        style={{
                          borderBottom: "1px solid #f1f5f9",
                          background: selectedIds.has(student.id) ? "#eff6ff" : index % 2 === 0 ? "white" : "#fafafa"
                        }}
                      >
                        <td style={{ padding: "14px 8px", textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(student.id)}
                            onChange={() => toggleSelect(student.id)}
                          />
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            <div style={{
                              width: "40px",
                              height: "40px",
                              borderRadius: "50%",
                              background: student.profil_foto ? "transparent" : "#e2e8f0",
                              overflow: "hidden",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0
                            }}>
                              {student.profil_foto ? (
                                <img
                                  src={getPhotoUrl(student.profil_foto)}
                                  alt={`${student.ad} ${student.soyad}`}
                                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                />
                              ) : (
                                <span style={{ fontSize: "16px", color: "#94a3b8" }}>
                                  {student.ad.charAt(0)}{student.soyad.charAt(0)}
                                </span>
                              )}
                            </div>
                            <div>
                              <div style={{ fontWeight: 500 }}>{student.ad} {student.soyad}</div>
                              <div style={{ fontSize: "12px", color: "#94a3b8" }}>{student.ogrenci_no}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: "14px 16px", textAlign: "center" }}>
                          <span style={{
                            background: student.total_resources > 0 ? "#dbeafe" : "#f1f5f9",
                            color: student.total_resources > 0 ? "#2563eb" : "#64748b",
                            padding: "4px 12px",
                            borderRadius: "12px",
                            fontSize: "13px",
                            fontWeight: 500
                          }}>
                            {student.total_resources}
                          </span>
                        </td>
                        <td style={{ padding: "14px 16px", textAlign: "center" }}>
                          <span style={{
                            background: "#d1fae5",
                            color: "#059669",
                            padding: "4px 12px",
                            borderRadius: "12px",
                            fontSize: "13px",
                            fontWeight: 500
                          }}>
                            {student.completed}
                          </span>
                        </td>
                        <td style={{ padding: "14px 16px", textAlign: "center" }}>
                          <span style={{
                            background: "#fef3c7",
                            color: "#d97706",
                            padding: "4px 12px",
                            borderRadius: "12px",
                            fontSize: "13px",
                            fontWeight: 500
                          }}>
                            {student.in_progress}
                          </span>
                        </td>
                        <td style={{ padding: "14px 16px", textAlign: "center" }}>
                          {student.overdue > 0 ? (
                            <span style={{
                              background: "#fee2e2",
                              color: "#dc2626",
                              padding: "4px 12px",
                              borderRadius: "12px",
                              fontSize: "13px",
                              fontWeight: 500
                            }}>
                              ⚠️ {student.overdue}
                            </span>
                          ) : (
                            <span style={{ color: "#94a3b8" }}>-</span>
                          )}
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "center" }}>
                            <div style={{
                              width: "80px",
                              height: "8px",
                              background: "#e2e8f0",
                              borderRadius: "4px",
                              overflow: "hidden"
                            }}>
                              <div style={{
                                height: "100%",
                                width: `${student.avg_progress}%`,
                                background: student.avg_progress === 100 ? "#10b981" : student.avg_progress >= 50 ? "#3b82f6" : "#f59e0b",
                                borderRadius: "4px"
                              }} />
                            </div>
                            <span style={{ fontSize: "12px", fontWeight: 500, minWidth: "35px" }}>{student.avg_progress}%</span>
                          </div>
                        </td>
                        <td style={{ padding: "14px 16px", textAlign: "center" }}>
                          {student.has_resources ? (
                            <span style={{
                              background: riskStyle.bg,
                              color: riskStyle.color,
                              padding: "4px 10px",
                              borderRadius: "6px",
                              fontSize: "12px",
                              fontWeight: 500
                            }}>
                              {student.risk_score === 0 ? "İyi" : student.risk_score}
                            </span>
                          ) : (
                            <span style={{ color: "#94a3b8", fontSize: "12px" }}>-</span>
                          )}
                        </td>
                        <td style={{ padding: "14px 16px", textAlign: "center" }}>
                          <Link
                            href={havuzHref(String(student.id))}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              padding: "8px 16px",
                              background: "#3b82f6",
                              color: "white",
                              textDecoration: "none",
                              borderRadius: "6px",
                              fontSize: "13px",
                              fontWeight: 500
                            }}
                          >
                            Detay →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="kh-list-mobile">
              {pagedStudents.map((student) => {
                const riskStyle = getRiskColor(student.risk_score);
                return (
                  <Link
                    key={student.id}
                    href={havuzHref(String(student.id))}
                    className="kh-mobile-card"
                  >
                    <div className="kh-mobile-card-top">
                      <div style={{
                        width: 44,
                        height: 44,
                        borderRadius: "50%",
                        background: student.profil_foto ? "transparent" : "#e2e8f0",
                        overflow: "hidden",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}>
                        {student.profil_foto ? (
                          <img
                            src={getPhotoUrl(student.profil_foto)}
                            alt={`${student.ad} ${student.soyad}`}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : (
                          <span style={{ fontSize: 14, color: "#94a3b8", fontWeight: 600 }}>
                            {student.ad.charAt(0)}{student.soyad.charAt(0)}
                          </span>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 15, color: "#1e293b" }}>
                          {student.ad} {student.soyad}
                        </div>
                        <div style={{ fontSize: 12, color: "#94a3b8" }}>{student.ogrenci_no}</div>
                      </div>
                      <span style={{ fontSize: 18, color: "#94a3b8" }}>›</span>
                    </div>
                    <div className="kh-mobile-card-meta">
                      <span className="kh-mobile-chip" style={{
                        background: student.total_resources > 0 ? "#dbeafe" : "#f1f5f9",
                        color: student.total_resources > 0 ? "#2563eb" : "#64748b",
                      }}>
                        {student.total_resources} kaynak
                      </span>
                      <span className="kh-mobile-chip" style={{ background: "#d1fae5", color: "#059669" }}>
                        {student.completed} tamam
                      </span>
                      {student.overdue > 0 && (
                        <span className="kh-mobile-chip" style={{ background: "#fee2e2", color: "#dc2626" }}>
                          ⚠️ {student.overdue} geciken
                        </span>
                      )}
                      <span className="kh-mobile-chip">%{student.avg_progress}</span>
                      {student.has_resources && (
                        <span className="kh-mobile-chip" style={{ background: riskStyle.bg, color: riskStyle.color }}>
                          {student.risk_score === 0 ? "İyi" : `Risk ${student.risk_score}`}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}

        {totalPages > 1 && (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "14px 16px",
            borderTop: "1px solid #f1f5f9",
          }}>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              style={{
                padding: "6px 12px",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                background: currentPage <= 1 ? "#f8fafc" : "white",
                color: currentPage <= 1 ? "#cbd5e1" : "#334155",
                cursor: currentPage <= 1 ? "not-allowed" : "pointer",
                fontSize: 13,
              }}
            >
              ‹ Önceki
            </button>
            <span style={{ fontSize: 13, color: "#64748b", minWidth: 90, textAlign: "center" }}>
              Sayfa {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              style={{
                padding: "6px 12px",
                border: "1px solid #e2e8f0",
                borderRadius: 8,
                background: currentPage >= totalPages ? "#f8fafc" : "white",
                color: currentPage >= totalPages ? "#cbd5e1" : "#334155",
                cursor: currentPage >= totalPages ? "not-allowed" : "pointer",
                fontSize: 13,
              }}
            >
              Sonraki ›
            </button>
          </div>
        )}
      </div>

      {bulkModalOpen && (
        <div className="kh-modal-shell" style={{ zIndex: 1001 }}>
          <div className="kh-modal is-md">
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 600 }}>📚 Toplu Kaynak Ata</h3>
                <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#64748b" }}>
                  {selectedIds.size} öğrenciye aynı anda kaynak atayın
                </p>
              </div>
              <button onClick={() => setBulkModalOpen(false)} style={{ background: "none", border: "none", fontSize: "24px", cursor: "pointer", color: "#64748b" }}>×</button>
            </div>

            <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", marginBottom: "6px", fontWeight: 500, fontSize: "14px" }}>Ders</label>
                <select
                  value={bulkLessonId}
                  onChange={(e) => handleBulkLessonChange(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: "8px" }}
                >
                  <option value="">Ders seçin…</option>
                  {bulkDersler.map((d) => (
                    <option key={d.id} value={d.id}>{d.ad}</option>
                  ))}
                </select>
              </div>

              {!bulkLessonId ? (
                <div style={{ textAlign: "center", padding: "24px", color: "#64748b", fontSize: 13 }}>
                  Kaynakları görmek için önce bir ders seçin.
                </div>
              ) : bulkAvailable.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px", color: "#64748b", fontSize: 13 }}>
                  Bu ders için uygun kaynak bulunamadı.
                </div>
              ) : (
                <>
                  <p style={{ margin: "0 0 12px", fontSize: "13px", color: "#64748b" }}>
                    {bulkAvailable.length} kaynak mevcut. Seçili: {bulkSelectedBooks.length}
                    {" · "}Zaten atanmış öğrenci-kaynak eşleşmeleri otomatik atlanır.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px", maxHeight: 320, overflowY: "auto" }}>
                    {bulkAvailable.map((resource) => (
                      <label
                        key={resource.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          padding: "10px 12px",
                          border: bulkSelectedBooks.includes(resource.id) ? "2px solid #10b981" : "1px solid #e2e8f0",
                          borderRadius: "8px",
                          cursor: "pointer",
                          background: bulkSelectedBooks.includes(resource.id) ? "#f0fdf4" : "white",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={bulkSelectedBooks.includes(resource.id)}
                          onChange={() => {
                            setBulkSelectedBooks((prev) =>
                              prev.includes(resource.id) ? prev.filter((id) => id !== resource.id) : [...prev, resource.id]
                            );
                          }}
                          style={{ marginRight: "12px" }}
                        />
                        <BookCover src={resource.kapak_url} alt={resource.ad} size="sm" />
                        <div style={{ flex: 1, marginLeft: 10 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                            <span style={{ fontWeight: 500 }}>{resource.ad}</span>
                            {resource.book_type && (
                              <span style={{ background: resource.book_type_renk || "#dbeafe", color: "#1d4ed8", padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 500 }}>
                                {resource.book_type}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                            {resource.yayinevi || "Yayınevi yok"}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>

                  <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <label style={{ display: "block", marginBottom: "6px", fontWeight: 500, fontSize: "14px" }}>Sahiplik Durumu</label>
                      <select
                        value={bulkOwnership}
                        onChange={(e) => setBulkOwnership(e.target.value)}
                        style={{ width: "100%", padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: "8px" }}
                      >
                        <option value="STUDENT_OWNED">✅ Öğrencide Var</option>
                        <option value="TO_PURCHASE">🛒 Satın Alınacak</option>
                        <option value="INSTITUTION_PROVIDED">🏫 Kurum Verecek</option>
                      </select>
                    </div>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <label style={{ display: "block", marginBottom: "6px", fontWeight: 500, fontSize: "14px" }}>Son Tarih (Opsiyonel)</label>
                      <input
                        type="date"
                        value={bulkDueDate}
                        onChange={(e) => setBulkDueDate(e.target.value)}
                        style={{ width: "100%", padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: "8px" }}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            <div style={{ padding: "16px 24px", borderTop: "1px solid #e2e8f0", display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button onClick={() => setBulkModalOpen(false)} style={{ padding: "10px 20px", background: "#f1f5f9", border: "none", borderRadius: "8px", cursor: "pointer" }}>
                İptal
              </button>
              <button
                onClick={handleBulkAssign}
                disabled={bulkSelectedBooks.length === 0 || bulkLoading}
                style={{
                  padding: "10px 20px",
                  background: bulkSelectedBooks.length === 0 ? "#94a3b8" : "#10b981",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: bulkSelectedBooks.length === 0 ? "not-allowed" : "pointer",
                  fontWeight: 600,
                }}
              >
                {bulkLoading
                  ? "Atanıyor…"
                  : `${bulkSelectedBooks.length} kaynağı ${selectedIds.size} öğrenciye ata`}
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastBanner toast={toast} />
    </div>
  );
}
