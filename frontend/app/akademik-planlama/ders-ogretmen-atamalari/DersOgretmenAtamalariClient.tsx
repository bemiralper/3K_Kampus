"use client";

import { useState, useEffect } from "react";
import { getContextHeaders } from "@/lib/api";

// Types
interface LessonTeacherPool {
  id: number;
  egitim_yili: number;
  egitim_yili_str: string;
  ders: number;
  ders_ad: string;
  ders_kod: string;
  ogretmen: number;
  ogretmen_ad: string;
  is_primary: boolean;
  max_weekly_load: number | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface ClassLessonTeacherAssignment {
  id: number;
  egitim_yili: number;
  egitim_yili_str: string;
  class_lesson_plan: number;
  sinif_ad: string;
  ders_ad: string;
  ders_kod: string;
  term_ad: string;
  weekly_hours: number;
  ogretmen: number;
  ogretmen_ad: string;
  role: string;
  role_display: string;
  priority: number;
  max_hours_for_class: number | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface Lesson {
  id: number;
  kod: string;
  ad: string;
}

interface Teacher {
  id: number;
  ad: string;
  soyad: string;
  brans?: string;
}

interface ClassLessonPlan {
  id: number;
  sinif_ad: string;
  ders_ad: string;
  term_ad: string;
  weekly_hours: number;
}

interface RoleOption {
  value: string;
  label: string;
}

interface ActiveYear {
  id: number;
  yil_str: string;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

function apiFetch(path: string, init?: RequestInit) {
  const url = path.startsWith("http") ? path : `${BACKEND_URL}${path}`;
  return fetch(url, {
    credentials: "include",
    ...init,
    headers: {
      ...getContextHeaders(),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
}

export default function DersOgretmenAtamalariClient() {
  // Tab state
  const [activeTab, setActiveTab] = useState<"pool" | "assignment">("pool");
  
  // Active year
  const [activeYear, setActiveYear] = useState<ActiveYear | null>(null);
  
  // Pool states
  const [poolData, setPoolData] = useState<LessonTeacherPool[]>([]);
  const [poolLoading, setPoolLoading] = useState(false);
  
  // Assignment states
  const [assignmentData, setAssignmentData] = useState<ClassLessonTeacherAssignment[]>([]);
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  
  // Drawer states
  const [poolDrawerOpen, setPoolDrawerOpen] = useState(false);
  const [assignmentDrawerOpen, setAssignmentDrawerOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  
  // Pool form
  const [poolForm, setPoolForm] = useState({
    ders_id: "",
    ogretmen_id: "",
    is_primary: false,
    max_weekly_load: "",
    notes: ""
  });
  
  // Assignment form
  const [assignmentForm, setAssignmentForm] = useState({
    class_lesson_plan_id: "",
    ogretmen_id: "",
    role: "PRIMARY",
    priority: "1",
    max_hours_for_class: "",
    notes: ""
  });
  
  // Reference data
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classLessonPlans, setClassLessonPlans] = useState<ClassLessonPlan[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  
  // Filter states
  const [poolLessonFilter, setPoolLessonFilter] = useState("");
  const [assignmentClassFilter, setAssignmentClassFilter] = useState("");
  
  // Error/Success states
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // ==================== API Functions ====================
  
  const fetchActiveYear = async () => {
    try {
      const res = await apiFetch(`/api/academic/class-lesson-plan/active-year/`);
      if (res.ok) {
        const data = await res.json();
        setActiveYear(data);
      }
    } catch (err) {
      console.error("Active year fetch error:", err);
    }
  };
  
  const fetchLessons = async () => {
    try {
      const res = await apiFetch(`/egitim-tanimlari/api/ders/`);
      if (res.ok) {
        const data = await res.json();
        setLessons(data.data || []);
      }
    } catch (err) {
      console.error("Lessons fetch error:", err);
    }
  };
  
  const fetchTeachers = async () => {
    try {
      const res = await apiFetch(`/personel/api/list/`);
      if (res.ok) {
        const data = await res.json();
        setTeachers(data.personeller || []);
      }
    } catch (err) {
      console.error("Teachers fetch error:", err);
    }
  };
  
  const fetchRoles = async () => {
    try {
      const res = await apiFetch(`/api/academic/class-lesson-teachers/roles/`);
      if (res.ok) {
        const data = await res.json();
        setRoles(data.roles || []);
      }
    } catch (err) {
      console.error("Roles fetch error:", err);
    }
  };
  
  const fetchClassLessonPlans = async () => {
    try {
      // Tüm ders planlarını getir (aktif yıl için)
      const res = await apiFetch(`/api/academic/class-lesson-plan/?all=true`);
      if (res.ok) {
        const data = await res.json();
        setClassLessonPlans(data.results || []);
      }
    } catch (err) {
      console.error("ClassLessonPlans fetch error:", err);
    }
  };
  
  const fetchPoolData = async () => {
    setPoolLoading(true);
    try {
      let url = `${BACKEND_URL}/api/academic/lesson-teacher-pool/`;
      if (poolLessonFilter) {
        url += `?lesson_id=${poolLessonFilter}`;
      }
      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        setPoolData(data.results || []);
      }
    } catch (err) {
      console.error("Pool fetch error:", err);
      setError("Branş havuzu yüklenemedi.");
    } finally {
      setPoolLoading(false);
    }
  };
  
  const fetchAssignmentData = async () => {
    setAssignmentLoading(true);
    try {
      let url = `${BACKEND_URL}/api/academic/class-lesson-teachers/`;
      if (assignmentClassFilter) {
        url += `?classroom_id=${assignmentClassFilter}`;
      }
      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        setAssignmentData(data.results || []);
      }
    } catch (err) {
      console.error("Assignment fetch error:", err);
      setError("Öğretmen atamaları yüklenemedi.");
    } finally {
      setAssignmentLoading(false);
    }
  };
  
  // ==================== Pool CRUD ====================
  
  const handlePoolSubmit = async () => {
    try {
      const url = editMode
        ? `${BACKEND_URL}/api/academic/lesson-teacher-pool/${editId}/update/`
        : `${BACKEND_URL}/api/academic/lesson-teacher-pool/create/`;
      
      const body = {
        ders_id: parseInt(poolForm.ders_id),
        ogretmen_id: parseInt(poolForm.ogretmen_id),
        is_primary: poolForm.is_primary,
        max_weekly_load: poolForm.max_weekly_load ? parseInt(poolForm.max_weekly_load) : null,
        notes: poolForm.notes || null
      };
      
      const res = await apiFetch(url, {
        method: editMode ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      
      if (res.ok) {
        setSuccess(editMode ? "Kayıt güncellendi." : "Yeni kayıt eklendi.");
        setPoolDrawerOpen(false);
        resetPoolForm();
        fetchPoolData();
      } else {
        const data = await res.json();
        setError(data.error || "İşlem başarısız.");
      }
    } catch (err) {
      setError("Bir hata oluştu.");
    }
  };
  
  const handlePoolDelete = async (id: number) => {
    if (!confirm("Bu kaydı silmek istediğinize emin misiniz?")) return;
    
    try {
      const res = await apiFetch(`/api/academic/lesson-teacher-pool/${id}/delete/`, {
        method: "DELETE"
      });
      
      if (res.ok) {
        setSuccess("Kayıt silindi.");
        fetchPoolData();
      } else {
        setError("Silme işlemi başarısız.");
      }
    } catch (err) {
      setError("Bir hata oluştu.");
    }
  };
  
  const handlePoolEdit = (item: LessonTeacherPool) => {
    setEditMode(true);
    setEditId(item.id);
    setPoolForm({
      ders_id: item.ders.toString(),
      ogretmen_id: item.ogretmen.toString(),
      is_primary: item.is_primary,
      max_weekly_load: item.max_weekly_load?.toString() || "",
      notes: item.notes || ""
    });
    setPoolDrawerOpen(true);
  };
  
  const resetPoolForm = () => {
    setEditMode(false);
    setEditId(null);
    setPoolForm({
      ders_id: "",
      ogretmen_id: "",
      is_primary: false,
      max_weekly_load: "",
      notes: ""
    });
  };
  
  // ==================== Assignment CRUD ====================
  
  const handleAssignmentSubmit = async () => {
    try {
      const url = editMode
        ? `${BACKEND_URL}/api/academic/class-lesson-teachers/${editId}/update/`
        : `${BACKEND_URL}/api/academic/class-lesson-teachers/create/`;
      
      const body = {
        class_lesson_plan_id: parseInt(assignmentForm.class_lesson_plan_id),
        ogretmen_id: parseInt(assignmentForm.ogretmen_id),
        role: assignmentForm.role,
        priority: parseInt(assignmentForm.priority),
        max_hours_for_class: assignmentForm.max_hours_for_class ? parseInt(assignmentForm.max_hours_for_class) : null,
        notes: assignmentForm.notes || null
      };
      
      const res = await apiFetch(url, {
        method: editMode ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      
      if (res.ok) {
        setSuccess(editMode ? "Atama güncellendi." : "Yeni atama eklendi.");
        setAssignmentDrawerOpen(false);
        resetAssignmentForm();
        fetchAssignmentData();
      } else {
        const data = await res.json();
        setError(data.error || "İşlem başarısız.");
      }
    } catch (err) {
      setError("Bir hata oluştu.");
    }
  };
  
  const handleAssignmentDelete = async (id: number) => {
    if (!confirm("Bu atamayı silmek istediğinize emin misiniz?")) return;
    
    try {
      const res = await apiFetch(`/api/academic/class-lesson-teachers/${id}/delete/`, {
        method: "DELETE"
      });
      
      if (res.ok) {
        setSuccess("Atama silindi.");
        fetchAssignmentData();
      } else {
        setError("Silme işlemi başarısız.");
      }
    } catch (err) {
      setError("Bir hata oluştu.");
    }
  };
  
  const handleAssignmentEdit = (item: ClassLessonTeacherAssignment) => {
    setEditMode(true);
    setEditId(item.id);
    setAssignmentForm({
      class_lesson_plan_id: item.class_lesson_plan.toString(),
      ogretmen_id: item.ogretmen.toString(),
      role: item.role,
      priority: item.priority.toString(),
      max_hours_for_class: item.max_hours_for_class?.toString() || "",
      notes: item.notes || ""
    });
    setAssignmentDrawerOpen(true);
  };
  
  const resetAssignmentForm = () => {
    setEditMode(false);
    setEditId(null);
    setAssignmentForm({
      class_lesson_plan_id: "",
      ogretmen_id: "",
      role: "PRIMARY",
      priority: "1",
      max_hours_for_class: "",
      notes: ""
    });
  };
  
  // ==================== Effects ====================
  
  useEffect(() => {
    fetchActiveYear();
    fetchLessons();
    fetchTeachers();
    fetchRoles();
    fetchClassLessonPlans();
  }, []);
  
  useEffect(() => {
    if (activeTab === "pool") {
      fetchPoolData();
    } else {
      fetchAssignmentData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, poolLessonFilter, assignmentClassFilter]);
  
  // Clear notifications after 3s
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError(null);
        setSuccess(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  // ==================== Render ====================
  
  return (
    <div className="page-container">
      {/* Hero Header */}
      <div className="hero-header" style={{ marginBottom: "24px" }}>
        <div className="hero-content">
          <div className="hero-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div className="hero-text">
            <h1>Ders Öğretmen Atamaları</h1>
            <div className="hero-breadcrumb">
              <a href="/dashboard">Ana Sayfa</a>
              <span>/</span>
              <span>Akademik Planlama</span>
              <span>/</span>
              <span>Ders Öğretmen Atamaları</span>
              {activeYear && (
                <>
                  <span>/</span>
                  <span className="breadcrumb-badge">{activeYear.yil_str}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <button 
          className="btn-hero"
          onClick={() => {
            if (activeTab === "pool") {
              resetPoolForm();
              setPoolDrawerOpen(true);
            } else {
              resetAssignmentForm();
              setAssignmentDrawerOpen(true);
            }
          }}
        >
          <span className="btn-hero-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </span>
          <span>{activeTab === "pool" ? "Havuza Ekle" : "Yeni Atama"}</span>
        </button>
      </div>

      {/* Notifications */}
      {error && (
        <div className="alert alert-danger" style={{ marginBottom: "16px" }}>
          {error}
        </div>
      )}
      {success && (
        <div className="alert alert-success" style={{ marginBottom: "16px" }}>
          {success}
        </div>
      )}

      {/* Tabs */}
      <div className="tabs-modern">
        <button
          className={`tab-modern ${activeTab === "pool" ? "active" : ""}`}
          onClick={() => setActiveTab("pool")}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
          Branş Havuzu
          <span className="tab-count">{poolData.length}</span>
        </button>
        <button
          className={`tab-modern ${activeTab === "assignment" ? "active" : ""}`}
          onClick={() => setActiveTab("assignment")}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          Sınıf Ders Öğretmenleri
          <span className="tab-count">{assignmentData.length}</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="card-modern">
        {activeTab === "pool" ? (
          <>
            {/* Pool Filter */}
            <div className="card-modern-header">
              <h3>📚 Branş Öğretmen Havuzu</h3>
              <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                <select
                  value={poolLessonFilter}
                  onChange={(e) => setPoolLessonFilter(e.target.value)}
                  className="form-select"
                  style={{ minWidth: "200px" }}
                >
                  <option value="">Tüm Dersler</option>
                  {lessons.map((l) => (
                    <option key={l.id} value={l.id}>{l.ad}</option>
                  ))}
                </select>
              </div>
            </div>
            
            {/* Pool Table */}
            <div className="table-responsive">
              {poolLoading ? (
                <div style={{ padding: "48px", textAlign: "center" }}>Yükleniyor...</div>
              ) : poolData.length === 0 ? (
                <div style={{ padding: "48px", textAlign: "center", color: "#6b7280" }}>
                  <div style={{ fontSize: "48px", marginBottom: "16px" }}>📚</div>
                  <h3>Branş Havuzu Boş</h3>
                  <p>Henüz hiç öğretmen havuza eklenmemiş. Bir ders için öğretmen ekleyin.</p>
                </div>
              ) : (
                <table className="table-modern">
                  <thead>
                    <tr>
                      <th>Ders</th>
                      <th>Öğretmen</th>
                      <th>Asıl Branş</th>
                      <th>Max Haftalık Yük</th>
                      <th>Notlar</th>
                      <th style={{ width: "100px" }}>İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {poolData.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <span className="badge badge-info">{item.ders_kod}</span>
                          <span style={{ marginLeft: "8px" }}>{item.ders_ad}</span>
                        </td>
                        <td>{item.ogretmen_ad}</td>
                        <td>
                          {item.is_primary ? (
                            <span className="badge badge-success">✓ Evet</span>
                          ) : (
                            <span className="badge badge-secondary">Hayır</span>
                          )}
                        </td>
                        <td>{item.max_weekly_load || "-"}</td>
                        <td>{item.notes || "-"}</td>
                        <td>
                          <div style={{ display: "flex", gap: "4px" }}>
                            <button 
                              className="btn btn-sm btn-outline-primary"
                              onClick={() => handlePoolEdit(item)}
                              title="Düzenle"
                            >
                              ✏️
                            </button>
                            <button 
                              className="btn btn-sm btn-outline-danger"
                              onClick={() => handlePoolDelete(item.id)}
                              title="Sil"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Assignment Filter */}
            <div className="card-modern-header">
              <h3>👨‍🏫 Sınıf Ders Öğretmen Atamaları</h3>
              <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                {/* Filter by class can be added later */}
              </div>
            </div>
            
            {/* Assignment Table */}
            <div className="table-responsive">
              {assignmentLoading ? (
                <div style={{ padding: "48px", textAlign: "center" }}>Yükleniyor...</div>
              ) : assignmentData.length === 0 ? (
                <div style={{ padding: "48px", textAlign: "center", color: "#6b7280" }}>
                  <div style={{ fontSize: "48px", marginBottom: "16px" }}>👨‍🏫</div>
                  <h3>Henüz Atama Yok</h3>
                  <p>Sınıf ders planlarına öğretmen atayın.</p>
                </div>
              ) : (
                <table className="table-modern">
                  <thead>
                    <tr>
                      <th>Sınıf</th>
                      <th>Ders</th>
                      <th>Dönem</th>
                      <th>Öğretmen</th>
                      <th>Rol</th>
                      <th>Öncelik</th>
                      <th>Max Saat</th>
                      <th style={{ width: "100px" }}>İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignmentData.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <span className="badge badge-primary">{item.sinif_ad}</span>
                        </td>
                        <td>
                          <span className="badge badge-info">{item.ders_kod}</span>
                          <span style={{ marginLeft: "8px" }}>{item.ders_ad}</span>
                        </td>
                        <td>{item.term_ad}</td>
                        <td>{item.ogretmen_ad}</td>
                        <td>
                          <span className={`badge ${
                            item.role === "PRIMARY" ? "badge-success" : 
                            item.role === "CO_TEACHER" ? "badge-warning" :
                            "badge-secondary"
                          }`}>
                            {item.role_display}
                          </span>
                        </td>
                        <td>{item.priority}</td>
                        <td>{item.max_hours_for_class || item.weekly_hours}</td>
                        <td>
                          <div style={{ display: "flex", gap: "4px" }}>
                            <button 
                              className="btn btn-sm btn-outline-primary"
                              onClick={() => handleAssignmentEdit(item)}
                              title="Düzenle"
                            >
                              ✏️
                            </button>
                            <button 
                              className="btn btn-sm btn-outline-danger"
                              onClick={() => handleAssignmentDelete(item.id)}
                              title="Sil"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>

      {/* Pool Drawer */}
      {poolDrawerOpen && (
        <>
          <div className="gv-drawer-overlay" onClick={() => setPoolDrawerOpen(false)} />
          <div className="gv-drawer">
            <div className="gv-drawer-header">
              <h3>{editMode ? "Havuz Kaydını Düzenle" : "Havuza Öğretmen Ekle"}</h3>
              <button className="gv-drawer-close" onClick={() => setPoolDrawerOpen(false)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="gv-drawer-body">
              <div className="gv-form-group">
                <label className="gv-form-label">
                  Ders <span className="gv-required">*</span>
                </label>
                <select
                  className="gv-form-select"
                  value={poolForm.ders_id}
                  onChange={(e) => setPoolForm({ ...poolForm, ders_id: e.target.value })}
                  disabled={editMode}
                >
                  <option value="">Ders Seçin</option>
                  {lessons.map((l) => (
                    <option key={l.id} value={l.id}>{l.kod} - {l.ad}</option>
                  ))}
                </select>
              </div>
              
              <div className="gv-form-group">
                <label className="gv-form-label">
                  Öğretmen <span className="gv-required">*</span>
                </label>
                <select
                  className="gv-form-select"
                  value={poolForm.ogretmen_id}
                  onChange={(e) => setPoolForm({ ...poolForm, ogretmen_id: e.target.value })}
                  disabled={editMode}
                >
                  <option value="">Öğretmen Seçin</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>{t.ad} {t.soyad} {t.brans ? `(${t.brans})` : ""}</option>
                  ))}
                </select>
              </div>
              
              <div className="gv-form-group">
                <label className="gv-form-checkbox-label">
                  <input
                    type="checkbox"
                    checked={poolForm.is_primary}
                    onChange={(e) => setPoolForm({ ...poolForm, is_primary: e.target.checked })}
                  />
                  <span className="gv-checkbox-text">Asıl Branş Öğretmeni</span>
                </label>
                <small className="gv-form-help">Her ders için sadece bir asıl branş öğretmeni olabilir.</small>
              </div>
              
              <div className="gv-form-group">
                <label className="gv-form-label">Maksimum Haftalık Yük</label>
                <input
                  type="number"
                  className="gv-form-input"
                  value={poolForm.max_weekly_load}
                  onChange={(e) => setPoolForm({ ...poolForm, max_weekly_load: e.target.value })}
                  placeholder="Örn: 20"
                  min="1"
                  max="40"
                />
                <small className="gv-form-help">Bu ders için öğretmenin haftalık maksimum ders saati</small>
              </div>
              
              <div className="gv-form-group">
                <label className="gv-form-label">Notlar</label>
                <textarea
                  className="gv-form-textarea"
                  value={poolForm.notes}
                  onChange={(e) => setPoolForm({ ...poolForm, notes: e.target.value })}
                  rows={3}
                  placeholder="Ek bilgiler..."
                />
              </div>
            </div>
            <div className="gv-drawer-footer">
              <button className="gv-btn gv-btn-secondary" onClick={() => setPoolDrawerOpen(false)}>İptal</button>
              <button 
                className="gv-btn gv-btn-primary" 
                onClick={handlePoolSubmit}
                disabled={!poolForm.ders_id || !poolForm.ogretmen_id}
              >
                {editMode ? "Güncelle" : "Ekle"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Assignment Drawer */}
      {assignmentDrawerOpen && (
        <>
          <div className="gv-drawer-overlay" onClick={() => setAssignmentDrawerOpen(false)} />
          <div className="gv-drawer">
            <div className="gv-drawer-header">
              <h3>{editMode ? "Atamayı Düzenle" : "Yeni Öğretmen Atama"}</h3>
              <button className="gv-drawer-close" onClick={() => setAssignmentDrawerOpen(false)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="gv-drawer-body">
              <div className="gv-form-group">
                <label className="gv-form-label">
                  Sınıf Ders Planı <span className="gv-required">*</span>
                </label>
                <select
                  className="gv-form-select"
                  value={assignmentForm.class_lesson_plan_id}
                  onChange={(e) => setAssignmentForm({ ...assignmentForm, class_lesson_plan_id: e.target.value })}
                  disabled={editMode}
                >
                  <option value="">Plan Seçin</option>
                  {classLessonPlans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sinif_ad} - {p.ders_ad} / {p.term_ad} ({p.weekly_hours} saat)
                    </option>
                  ))}
                </select>
                {classLessonPlans.length === 0 && (
                  <small className="gv-form-help" style={{ color: '#ef4444' }}>
                    Henüz sınıf ders planı yok. Önce &quot;Sınıf Ders Planı&quot; sayfasından plan oluşturun.
                  </small>
                )}
              </div>
              
              <div className="gv-form-group">
                <label className="gv-form-label">
                  Öğretmen <span className="gv-required">*</span>
                </label>
                <select
                  className="gv-form-select"
                  value={assignmentForm.ogretmen_id}
                  onChange={(e) => setAssignmentForm({ ...assignmentForm, ogretmen_id: e.target.value })}
                  disabled={editMode}
                >
                  <option value="">Öğretmen Seçin</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>{t.ad} {t.soyad}</option>
                  ))}
                </select>
              </div>
              
              <div className="gv-form-group">
                <label className="gv-form-label">
                  Rol <span className="gv-required">*</span>
                </label>
                <select
                  className="gv-form-select"
                  value={assignmentForm.role}
                  onChange={(e) => setAssignmentForm({ ...assignmentForm, role: e.target.value })}
                >
                  {roles.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              
              <div className="gv-form-row">
                <div className="gv-form-group">
                  <label className="gv-form-label">Öncelik</label>
                  <input
                    type="number"
                    className="gv-form-input"
                    value={assignmentForm.priority}
                    onChange={(e) => setAssignmentForm({ ...assignmentForm, priority: e.target.value })}
                    min="1"
                    max="10"
                  />
                  <small className="gv-form-help">1 = en yüksek öncelik</small>
                </div>
                
                <div className="gv-form-group">
                  <label className="gv-form-label">Maksimum Saat</label>
                  <input
                    type="number"
                    className="gv-form-input"
                    value={assignmentForm.max_hours_for_class}
                    onChange={(e) => setAssignmentForm({ ...assignmentForm, max_hours_for_class: e.target.value })}
                    placeholder="Opsiyonel"
                    min="1"
                    max="40"
                  />
                </div>
              </div>
              
              <div className="gv-form-group">
                <label className="gv-form-label">Notlar</label>
                <textarea
                  className="gv-form-textarea"
                  value={assignmentForm.notes}
                  onChange={(e) => setAssignmentForm({ ...assignmentForm, notes: e.target.value })}
                  rows={3}
                  placeholder="Atama hakkında notlar..."
                />
              </div>
            </div>
            <div className="gv-drawer-footer">
              <button className="gv-btn gv-btn-secondary" onClick={() => setAssignmentDrawerOpen(false)}>İptal</button>
              <button 
                className="gv-btn gv-btn-primary" 
                onClick={handleAssignmentSubmit}
                disabled={!assignmentForm.class_lesson_plan_id || !assignmentForm.ogretmen_id}
              >
                {editMode ? "Güncelle" : "Ekle"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
