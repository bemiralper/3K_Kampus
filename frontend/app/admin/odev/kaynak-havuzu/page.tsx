"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useKaynakPath } from "@/components/kaynak/KaynakPathProvider";
import {
  fetchStudentResourceList,
  type StudentWithResources,
  type StudentResourceKPI,
} from "@/lib/resources-api";

type FilterType = "all" | "with_resources" | "without_resources" | "with_overdue" | "with_incomplete";

function getPhotoUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http")) return path;
  return path;
}

export default function StudentResourcePoolPage() {
  const { havuzHref } = useKaynakPath();
  // Data state
  const [students, setStudents] = useState<StudentWithResources[]>([]);
  const [kpi, setKpi] = useState<StudentResourceKPI | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "progress" | "resources" | "risk">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

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
      const query = searchQuery.toLowerCase();
      if (!`${s.ad} ${s.soyad} ${s.ogrenci_no}`.toLowerCase().includes(query)) {
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
    <div style={{ padding: "24px", background: "#f8fafc", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 700 }}>📚 Öğrenci Kaynak Havuzu</h1>
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
          {sortedStudents.length} öğrenci gösteriliyor
        </div>
      </div>

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
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                <th style={{ textAlign: "left", padding: "14px 16px", fontSize: "13px", color: "#64748b", fontWeight: 500 }}>Öğrenci</th>
                <th style={{ textAlign: "center", padding: "14px 16px", fontSize: "13px", color: "#64748b", fontWeight: 500 }}>Toplam Kaynak</th>
                <th style={{ textAlign: "center", padding: "14px 16px", fontSize: "13px", color: "#64748b", fontWeight: 500 }}>Tamamlanan</th>
                <th style={{ textAlign: "center", padding: "14px 16px", fontSize: "13px", color: "#64748b", fontWeight: 500 }}>Devam Eden</th>
                <th style={{ textAlign: "center", padding: "14px 16px", fontSize: "13px", color: "#64748b", fontWeight: 500 }}>Geciken</th>
                <th style={{ textAlign: "center", padding: "14px 16px", fontSize: "13px", color: "#64748b", fontWeight: 500 }}>İlerleme</th>
                <th style={{ textAlign: "center", padding: "14px 16px", fontSize: "13px", color: "#64748b", fontWeight: 500 }}>Risk</th>
                <th style={{ textAlign: "center", padding: "14px 16px", fontSize: "13px", color: "#64748b", fontWeight: 500 }}>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {sortedStudents.map((student, index) => {
                const riskStyle = getRiskColor(student.risk_score);
                return (
                  <tr
                    key={student.id}
                    style={{
                      borderBottom: "1px solid #f1f5f9",
                      background: index % 2 === 0 ? "white" : "#fafafa"
                    }}
                  >
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        {/* Profil Foto */}
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
        )}
      </div>
    </div>
  );
}
