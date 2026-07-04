"use client";

import { useState, useEffect, useCallback } from "react";
import { getContextHeaders } from "@/lib/api";

// ====================
// TYPES
// ====================

interface ActiveAcademicYear {
  id: number;
  yil_str: string;
  baslangic_yil: number;
  bitis_yil: number;
}

interface Term {
  id: number;
  name: string;
  code: string;
  term_type: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

interface Sinif {
  id: number;
  ad: string;
  kod: string;
  kapasite: number;
  aktif_mi: boolean;
}

interface Ders {
  id: number;
  ad: string;
  kod: string;
  aktif_mi: boolean;
}

interface Personel {
  id: number;
  ad: string;
  soyad: string;
  tam_ad?: string;
}

interface ClassLessonPlan {
  id: number;
  egitim_yili: number;
  egitim_yili_str: string;
  term: number;
  term_ad: string;
  sinif: number;
  sinif_ad: string;
  ders: number;
  ders_ad: string;
  ders_kod: string;
  ogretmen: number | null;
  ogretmen_ad: string | null;
  weekly_hours: number;
  credit: number;
  is_mandatory: boolean;
  lesson_type_display: string;
  is_double_block: boolean;
  block_type_display: string;
  priority: number;
  preferred_room_type: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface PlanSummary {
  classroom_id: number;
  classroom_name: string;
  term_id: number;
  term_name: string;
  total_lessons: number;
  total_weekly_hours: number;
  lessons_with_teacher: number;
  lessons_without_teacher: number;
}

interface Toast {
  id: number;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
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

// ====================
// API FUNCTIONS
// ====================

async function fetchActiveAcademicYear(): Promise<ActiveAcademicYear> {
  const res = await apiFetch("/api/academic/class-lesson-plan/active-year/");
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Aktif eğitim yılı alınamadı");
  }
  return res.json();
}

async function fetchTerms(): Promise<Term[]> {
  const res = await apiFetch(`/api/terms/`, {
    credentials: 'include',
    headers: getContextHeaders(),
  });
  // Eğer auth hatası varsa boş dizi döndür
  if (!res.ok) {
    console.warn('Dönemler yüklenemedi, boş liste kullanılıyor');
    return [];
  }
  const data = await res.json();
  return data.terms || data.data || data.results || data || [];
}

async function fetchSiniflar(): Promise<Sinif[]> {
  const res = await apiFetch(`/siniflar/api/`, {
    credentials: 'include',
    headers: getContextHeaders(),
  });
  if (!res.ok) {
    console.warn('Sınıflar yüklenemedi, boş liste kullanılıyor');
    return [];
  }
  const data = await res.json();
  return data.siniflar || data.results || data || [];
}

async function fetchDersler(): Promise<Ders[]> {
  const res = await apiFetch(`/egitim-tanimlari/api/ders/`, {
    credentials: 'include',
  });
  if (!res.ok) {
    console.warn('Dersler yüklenemedi, boş liste kullanılıyor');
    return [];
  }
  const data = await res.json();
  return data.data || data.results || data || [];
}

async function fetchOgretmenler(): Promise<Personel[]> {
  const res = await apiFetch(`/personel/api/list/`, {
    credentials: 'include',
  });
  if (!res.ok) {
    console.warn('Öğretmenler yüklenemedi, boş liste kullanılıyor');
    return [];
  }
  const data = await res.json();
  return data.personeller || data.data || data.results || data || [];
}

async function fetchLessonPlans(classroomId: number, termId: number): Promise<ClassLessonPlan[]> {
  const res = await apiFetch(
    `/api/academic/class-lesson-plan/?classroom_id=${classroomId}&term_id=${termId}`,
  );
  if (!res.ok) throw new Error("Ders planları yüklenemedi");
  const data = await res.json();
  return data.results || [];
}

async function fetchPlanSummary(classroomId: number, termId: number): Promise<PlanSummary | null> {
  try {
    const res = await apiFetch(
      `/api/academic/class-lesson-plan/summary/${classroomId}/${termId}/`,
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function createLessonPlan(data: {
  term: number;
  sinif: number;
  ders: number;
  ogretmen?: number | null;
  weekly_hours: number;
  credit: number;
  is_mandatory: boolean;
  is_double_block: boolean;
  priority: number;
  preferred_room_type?: string | null;
  notes?: string | null;
}): Promise<ClassLessonPlan> {
  const res = await apiFetch(`/api/academic/class-lesson-plan/create/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Ders planı oluşturulamadı");
  }
  return res.json();
}

async function updateLessonPlan(planId: number, data: Partial<ClassLessonPlan>): Promise<ClassLessonPlan> {
  const res = await apiFetch(`/api/academic/class-lesson-plan/${planId}/update/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Ders planı güncellenemedi");
  }
  return res.json();
}

async function deleteLessonPlan(planId: number): Promise<void> {
  const res = await apiFetch(`/api/academic/class-lesson-plan/${planId}/delete/`, {
    method: "DELETE",
    credentials: 'include',
  });
  if (!res.ok) throw new Error("Ders planı silinemedi");
}

// ====================
// COMPONENT
// ====================

export default function SinifDersPlaniClient() {
  // State
  const [activeYear, setActiveYear] = useState<ActiveAcademicYear | null>(null);
  const [terms, setTerms] = useState<Term[]>([]);
  const [siniflar, setSiniflar] = useState<Sinif[]>([]);
  const [dersler, setDersler] = useState<Ders[]>([]);
  const [ogretmenler, setOgretmenler] = useState<Personel[]>([]);
  
  const [selectedTermId, setSelectedTermId] = useState<number | null>(null);
  const [selectedSinifId, setSelectedSinifId] = useState<number | null>(null);
  
  const [lessonPlans, setLessonPlans] = useState<ClassLessonPlan[]>([]);
  const [summary, setSummary] = useState<PlanSummary | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<ClassLessonPlan | null>(null);
  const [formData, setFormData] = useState({
    ders: 0,
    ogretmen: null as number | null,
    weekly_hours: 1,
    credit: 0,
    is_mandatory: true,
    is_double_block: false,
    priority: 1,
    preferred_room_type: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  
  // Inline edit state
  const [editingCell, setEditingCell] = useState<{ planId: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState<string | number | boolean>("");
  
  // Toast state
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Toast helpers
  const showToast = (type: Toast['type'], title: string, message: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // Initial data load
  useEffect(() => {
    async function loadInitialData() {
      try {
        setLoading(true);
        const [year, termsData, sinifData, dersData, ogretmenData] = await Promise.all([
          fetchActiveAcademicYear(),
          fetchTerms(),
          fetchSiniflar(),
          fetchDersler(),
          fetchOgretmenler(),
        ]);
        
        setActiveYear(year);
        setTerms(termsData.filter((t: Term) => t.is_active));
        setSiniflar(sinifData.filter((s: Sinif) => s.aktif_mi));
        setDersler(dersData.filter((d: Ders) => d.aktif_mi));
        setOgretmenler(ogretmenData);
        
        setError(null);
      } catch (err: any) {
        setError(err.message);
        showToast('error', 'Hata', err.message);
      } finally {
        setLoading(false);
      }
    }
    loadInitialData();
  }, []);

  // Load plans when term/sinif changes
  const loadPlans = useCallback(async () => {
    if (!selectedTermId || !selectedSinifId) {
      setLessonPlans([]);
      setSummary(null);
      return;
    }
    
    try {
      setLoadingPlans(true);
      const [plans, summaryData] = await Promise.all([
        fetchLessonPlans(selectedSinifId, selectedTermId),
        fetchPlanSummary(selectedSinifId, selectedTermId),
      ]);
      setLessonPlans(plans);
      setSummary(summaryData);
    } catch (err: any) {
      showToast('error', 'Hata', err.message);
    } finally {
      setLoadingPlans(false);
    }
  }, [selectedTermId, selectedSinifId]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  // Form handlers
  const openAddDrawer = () => {
    setEditingPlan(null);
    setFormData({
      ders: 0,
      ogretmen: null,
      weekly_hours: 1,
      credit: 0,
      is_mandatory: true,
      is_double_block: false,
      priority: 1,
      preferred_room_type: "",
      notes: "",
    });
    setDrawerOpen(true);
  };

  const openEditDrawer = (plan: ClassLessonPlan) => {
    setEditingPlan(plan);
    setFormData({
      ders: plan.ders,
      ogretmen: plan.ogretmen,
      weekly_hours: plan.weekly_hours,
      credit: plan.credit,
      is_mandatory: plan.is_mandatory,
      is_double_block: plan.is_double_block,
      priority: plan.priority,
      preferred_room_type: plan.preferred_room_type || "",
      notes: plan.notes || "",
    });
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    if (!selectedTermId || !selectedSinifId) {
      showToast('warning', 'Uyarı', 'Dönem ve sınıf seçmelisiniz');
      return;
    }
    
    if (!formData.ders) {
      showToast('warning', 'Uyarı', 'Ders seçmelisiniz');
      return;
    }
    
    try {
      setSaving(true);
      
      if (editingPlan) {
        // Update
        await updateLessonPlan(editingPlan.id, {
          ogretmen: formData.ogretmen,
          weekly_hours: formData.weekly_hours,
          credit: formData.credit,
          is_mandatory: formData.is_mandatory,
          is_double_block: formData.is_double_block,
          priority: formData.priority,
          preferred_room_type: formData.preferred_room_type || null,
          notes: formData.notes || null,
        });
        showToast('success', 'Başarılı', 'Ders planı güncellendi');
      } else {
        // Create
        await createLessonPlan({
          term: selectedTermId,
          sinif: selectedSinifId,
          ders: formData.ders,
          ogretmen: formData.ogretmen,
          weekly_hours: formData.weekly_hours,
          credit: formData.credit,
          is_mandatory: formData.is_mandatory,
          is_double_block: formData.is_double_block,
          priority: formData.priority,
          preferred_room_type: formData.preferred_room_type || null,
          notes: formData.notes || null,
        });
        showToast('success', 'Başarılı', 'Ders planı oluşturuldu');
      }
      
      setDrawerOpen(false);
      loadPlans();
    } catch (err: any) {
      showToast('error', 'Hata', err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (plan: ClassLessonPlan) => {
    if (!confirm(`"${plan.ders_ad}" dersini silmek istediğinize emin misiniz?`)) {
      return;
    }
    
    try {
      await deleteLessonPlan(plan.id);
      showToast('success', 'Başarılı', 'Ders planı silindi');
      loadPlans();
    } catch (err: any) {
      showToast('error', 'Hata', err.message);
    }
  };

  // Inline edit handlers
  const startInlineEdit = (plan: ClassLessonPlan, field: string, value: any) => {
    setEditingCell({ planId: plan.id, field });
    setEditValue(value);
  };

  const cancelInlineEdit = () => {
    setEditingCell(null);
    setEditValue("");
  };

  const saveInlineEdit = async () => {
    if (!editingCell) return;
    
    try {
      await updateLessonPlan(editingCell.planId, {
        [editingCell.field]: editValue,
      });
      showToast('success', 'Güncellendi', 'Değer kaydedildi');
      loadPlans();
    } catch (err: any) {
      showToast('error', 'Hata', err.message);
    } finally {
      cancelInlineEdit();
    }
  };

  // Styles
  const styles = {
    container: { padding: 0 },
    header: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "24px",
      flexWrap: "wrap" as const,
      gap: "16px",
    },
    titleSection: {
      display: "flex",
      alignItems: "center",
      gap: "12px",
    },
    title: {
      fontSize: "24px",
      fontWeight: 600,
      color: "#111827",
      margin: 0,
    },
    yearBadge: {
      backgroundColor: "#10b981",
      color: "#fff",
      padding: "6px 14px",
      borderRadius: "20px",
      fontSize: "13px",
      fontWeight: 500,
    },
    filterBar: {
      display: "flex",
      alignItems: "center",
      gap: "12px",
      flexWrap: "wrap" as const,
    },
    select: {
      padding: "10px 14px",
      borderRadius: "8px",
      border: "1px solid #e5e7eb",
      fontSize: "14px",
      minWidth: "180px",
      backgroundColor: "#fff",
    },
    addBtn: {
      padding: "10px 20px",
      backgroundColor: "#3b82f6",
      color: "#fff",
      border: "none",
      borderRadius: "8px",
      fontSize: "14px",
      fontWeight: 500,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      gap: "8px",
    },
    addBtnDisabled: {
      opacity: 0.5,
      cursor: "not-allowed",
    },
    summaryCard: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
      gap: "16px",
      marginBottom: "24px",
    },
    summaryItem: {
      backgroundColor: "#fff",
      padding: "16px",
      borderRadius: "12px",
      border: "1px solid #e5e7eb",
      textAlign: "center" as const,
    },
    summaryValue: {
      fontSize: "28px",
      fontWeight: 700,
      color: "#3b82f6",
    },
    summaryLabel: {
      fontSize: "13px",
      color: "#6b7280",
      marginTop: "4px",
    },
    card: {
      backgroundColor: "#fff",
      borderRadius: "12px",
      border: "1px solid #e5e7eb",
      overflow: "hidden",
    },
    table: {
      width: "100%",
      borderCollapse: "collapse" as const,
    },
    th: {
      padding: "14px 16px",
      textAlign: "left" as const,
      fontSize: "12px",
      fontWeight: 600,
      color: "#6b7280",
      textTransform: "uppercase" as const,
      borderBottom: "1px solid #e5e7eb",
      backgroundColor: "#f9fafb",
    },
    td: {
      padding: "14px 16px",
      fontSize: "14px",
      color: "#374151",
      borderBottom: "1px solid #f3f4f6",
    },
    badge: {
      display: "inline-block",
      padding: "4px 10px",
      borderRadius: "12px",
      fontSize: "12px",
      fontWeight: 500,
    },
    badgeGreen: {
      backgroundColor: "#d1fae5",
      color: "#065f46",
    },
    badgeYellow: {
      backgroundColor: "#fef3c7",
      color: "#92400e",
    },
    badgeBlue: {
      backgroundColor: "#dbeafe",
      color: "#1e40af",
    },
    badgeGray: {
      backgroundColor: "#f3f4f6",
      color: "#6b7280",
    },
    actionBtn: {
      padding: "6px 10px",
      borderRadius: "6px",
      border: "none",
      cursor: "pointer",
      fontSize: "12px",
      marginRight: "6px",
    },
    editBtn: {
      backgroundColor: "#dbeafe",
      color: "#1e40af",
    },
    deleteBtn: {
      backgroundColor: "#fee2e2",
      color: "#dc2626",
    },
    emptyState: {
      textAlign: "center" as const,
      padding: "48px 16px",
      color: "#6b7280",
    },
    drawer: {
      position: "fixed" as const,
      top: 0,
      right: 0,
      width: "480px",
      maxWidth: "100vw",
      height: "100vh",
      backgroundColor: "#fff",
      boxShadow: "-4px 0 24px rgba(0,0,0,0.15)",
      zIndex: 1000,
      display: "flex",
      flexDirection: "column" as const,
    },
    drawerHeader: {
      padding: "20px 24px",
      borderBottom: "1px solid #e5e7eb",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
    },
    drawerTitle: {
      fontSize: "18px",
      fontWeight: 600,
      color: "#111827",
    },
    drawerClose: {
      background: "none",
      border: "none",
      fontSize: "24px",
      cursor: "pointer",
      color: "#6b7280",
    },
    drawerBody: {
      flex: 1,
      padding: "24px",
      overflowY: "auto" as const,
    },
    formGroup: {
      marginBottom: "20px",
    },
    label: {
      display: "block",
      fontSize: "14px",
      fontWeight: 500,
      color: "#374151",
      marginBottom: "6px",
    },
    input: {
      width: "100%",
      padding: "10px 14px",
      borderRadius: "8px",
      border: "1px solid #e5e7eb",
      fontSize: "14px",
    },
    checkbox: {
      marginRight: "8px",
    },
    drawerFooter: {
      padding: "16px 24px",
      borderTop: "1px solid #e5e7eb",
      display: "flex",
      justifyContent: "flex-end",
      gap: "12px",
    },
    cancelBtn: {
      padding: "10px 20px",
      borderRadius: "8px",
      border: "1px solid #e5e7eb",
      backgroundColor: "#fff",
      cursor: "pointer",
      fontSize: "14px",
    },
    saveBtn: {
      padding: "10px 24px",
      borderRadius: "8px",
      border: "none",
      backgroundColor: "#3b82f6",
      color: "#fff",
      cursor: "pointer",
      fontSize: "14px",
      fontWeight: 500,
    },
    overlay: {
      position: "fixed" as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0,0,0,0.4)",
      zIndex: 999,
    },
    toastContainer: {
      position: "fixed" as const,
      top: "20px",
      right: "20px",
      zIndex: 2000,
      display: "flex",
      flexDirection: "column" as const,
      gap: "10px",
    },
    toast: {
      padding: "14px 20px",
      borderRadius: "8px",
      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      minWidth: "280px",
      animation: "slideIn 0.3s ease",
    },
    toastSuccess: { backgroundColor: "#10b981", color: "#fff" },
    toastError: { backgroundColor: "#ef4444", color: "#fff" },
    toastWarning: { backgroundColor: "#f59e0b", color: "#fff" },
    toastInfo: { backgroundColor: "#3b82f6", color: "#fff" },
    inlineInput: {
      padding: "4px 8px",
      border: "1px solid #3b82f6",
      borderRadius: "4px",
      fontSize: "14px",
      width: "80px",
    },
  };

  if (loading) {
    return (
      <div style={{ padding: "48px", textAlign: "center", color: "#6b7280" }}>
        Yükleniyor...
      </div>
    );
  }

  if (error && !activeYear) {
    return (
      <div style={{ padding: "48px", textAlign: "center", color: "#ef4444" }}>
        <h3>Hata</h3>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Toast Container */}
      <div style={styles.toastContainer}>
        {toasts.map(toast => (
          <div
            key={toast.id}
            style={{
              ...styles.toast,
              ...(toast.type === 'success' ? styles.toastSuccess :
                  toast.type === 'error' ? styles.toastError :
                  toast.type === 'warning' ? styles.toastWarning :
                  styles.toastInfo),
            }}
          >
            <strong>{toast.title}</strong>
            <div style={{ fontSize: "13px", marginTop: "2px" }}>{toast.message}</div>
          </div>
        ))}
      </div>

      {/* Hero Header */}
      <div className="hero-header" style={{ marginBottom: '24px' }}>
        <div className="hero-content">
          <div className="hero-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </div>
          <div className="hero-text">
            <h1>Sınıf Ders Planı</h1>
            <div className="hero-breadcrumb">
              <a href="/dashboard">Ana Sayfa</a>
              <span>/</span>
              <span>Akademik Planlama</span>
              <span>/</span>
              <span>Sınıf Ders Planı</span>
              {activeYear && (
                <>
                  <span>/</span>
                  <span style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 500 }}>📅 {activeYear.yil_str}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <button 
          className="btn-hero" 
          onClick={openAddDrawer}
          disabled={!selectedTermId || !selectedSinifId}
          style={{ opacity: (selectedTermId && selectedSinifId) ? 1 : 0.5 }}
        >
          <span className="btn-hero-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </span>
          <span>Ders Ekle</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <select
          style={styles.select}
          value={selectedTermId || ""}
          onChange={(e) => setSelectedTermId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Dönem Seç</option>
          {terms.map(term => (
            <option key={term.id} value={term.id}>{term.name}</option>
          ))}
        </select>
        
        <select
          style={styles.select}
          value={selectedSinifId || ""}
          onChange={(e) => setSelectedSinifId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Sınıf Seç</option>
          {siniflar.map(sinif => (
            <option key={sinif.id} value={sinif.id}>{sinif.ad}</option>
          ))}
        </select>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div style={styles.summaryCard}>
          <div style={styles.summaryItem}>
            <div style={styles.summaryValue}>{summary.total_lessons}</div>
            <div style={styles.summaryLabel}>Toplam Ders</div>
          </div>
          <div style={styles.summaryItem}>
            <div style={{ ...styles.summaryValue, color: "#10b981" }}>{summary.total_weekly_hours}</div>
            <div style={styles.summaryLabel}>Haftalık Saat</div>
          </div>
          <div style={styles.summaryItem}>
            <div style={{ ...styles.summaryValue, color: "#059669" }}>{summary.lessons_with_teacher}</div>
            <div style={styles.summaryLabel}>Öğretmeni Atanmış</div>
          </div>
          <div style={styles.summaryItem}>
            <div style={{ ...styles.summaryValue, color: "#f59e0b" }}>{summary.lessons_without_teacher}</div>
            <div style={styles.summaryLabel}>Öğretmen Bekliyor</div>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={styles.card}>
        {!selectedTermId || !selectedSinifId ? (
          <div style={styles.emptyState}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>📚</div>
            <h3>Dönem ve Sınıf Seçin</h3>
            <p>Ders planlarını görüntülemek için yukarıdan dönem ve sınıf seçin</p>
          </div>
        ) : loadingPlans ? (
          <div style={styles.emptyState}>Yükleniyor...</div>
        ) : lessonPlans.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>📋</div>
            <h3>Henüz ders eklenmemiş</h3>
            <p>Bu sınıf için ders planı oluşturmak için &quot;Ders Ekle&quot; butonuna tıklayın</p>
          </div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Ders</th>
                <th style={styles.th}>Öğretmen</th>
                <th style={styles.th}>Haftalık Saat</th>
                <th style={styles.th}>Kredi</th>
                <th style={styles.th}>Tür</th>
                <th style={styles.th}>Blok</th>
                <th style={styles.th}>Öncelik</th>
                <th style={styles.th}>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {lessonPlans.map(plan => (
                <tr key={plan.id}>
                  <td style={styles.td}>
                    <strong>{plan.ders_ad}</strong>
                    <div style={{ fontSize: "12px", color: "#9ca3af" }}>{plan.ders_kod}</div>
                  </td>
                  <td style={styles.td}>
                    {plan.ogretmen_ad || (
                      <span style={{ color: "#f59e0b", fontStyle: "italic" }}>Atanmamış</span>
                    )}
                  </td>
                  <td style={styles.td}>
                    {editingCell?.planId === plan.id && editingCell.field === 'weekly_hours' ? (
                      <input
                        type="number"
                        style={styles.inlineInput}
                        value={editValue as number}
                        onChange={(e) => setEditValue(Number(e.target.value))}
                        onBlur={saveInlineEdit}
                        onKeyDown={(e) => e.key === 'Enter' && saveInlineEdit()}
                        autoFocus
                        min={1}
                      />
                    ) : (
                      <span
                        style={{ cursor: "pointer" }}
                        onClick={() => startInlineEdit(plan, 'weekly_hours', plan.weekly_hours)}
                      >
                        {plan.weekly_hours} saat
                      </span>
                    )}
                  </td>
                  <td style={styles.td}>
                    {editingCell?.planId === plan.id && editingCell.field === 'credit' ? (
                      <input
                        type="number"
                        style={styles.inlineInput}
                        value={editValue as number}
                        onChange={(e) => setEditValue(Number(e.target.value))}
                        onBlur={saveInlineEdit}
                        onKeyDown={(e) => e.key === 'Enter' && saveInlineEdit()}
                        autoFocus
                        min={0}
                      />
                    ) : (
                      <span
                        style={{ cursor: "pointer" }}
                        onClick={() => startInlineEdit(plan, 'credit', plan.credit)}
                      >
                        {plan.credit}
                      </span>
                    )}
                  </td>
                  <td style={styles.td}>
                    <span style={{
                      ...styles.badge,
                      ...(plan.is_mandatory ? styles.badgeGreen : styles.badgeYellow),
                    }}>
                      {plan.lesson_type_display}
                    </span>
                  </td>
                  <td style={styles.td}>
                    <span style={{
                      ...styles.badge,
                      ...(plan.is_double_block ? styles.badgeBlue : styles.badgeGray),
                    }}>
                      {plan.block_type_display}
                    </span>
                  </td>
                  <td style={styles.td}>
                    {editingCell?.planId === plan.id && editingCell.field === 'priority' ? (
                      <input
                        type="number"
                        style={styles.inlineInput}
                        value={editValue as number}
                        onChange={(e) => setEditValue(Number(e.target.value))}
                        onBlur={saveInlineEdit}
                        onKeyDown={(e) => e.key === 'Enter' && saveInlineEdit()}
                        autoFocus
                        min={1}
                        max={100}
                      />
                    ) : (
                      <span
                        style={{ cursor: "pointer" }}
                        onClick={() => startInlineEdit(plan, 'priority', plan.priority)}
                      >
                        {plan.priority}
                      </span>
                    )}
                  </td>
                  <td style={styles.td}>
                    <button
                      style={{ ...styles.actionBtn, ...styles.editBtn }}
                      onClick={() => openEditDrawer(plan)}
                    >
                      ✏️ Düzenle
                    </button>
                    <button
                      style={{ ...styles.actionBtn, ...styles.deleteBtn }}
                      onClick={() => handleDelete(plan)}
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Drawer */}
      {drawerOpen && (
        <>
          <div style={styles.overlay} onClick={() => setDrawerOpen(false)} />
          <div style={styles.drawer}>
            <div style={styles.drawerHeader}>
              <h2 style={styles.drawerTitle}>
                {editingPlan ? 'Ders Planını Düzenle' : 'Yeni Ders Ekle'}
              </h2>
              <button style={styles.drawerClose} onClick={() => setDrawerOpen(false)}>×</button>
            </div>
            
            <div style={styles.drawerBody}>
              {/* Ders */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Ders *</label>
                <select
                  style={styles.input}
                  value={formData.ders}
                  onChange={(e) => setFormData({ ...formData, ders: Number(e.target.value) })}
                  disabled={!!editingPlan}
                >
                  <option value={0}>Ders seçin...</option>
                  {dersler.map(ders => (
                    <option key={ders.id} value={ders.id}>{ders.ad} ({ders.kod})</option>
                  ))}
                </select>
              </div>
              
              {/* Öğretmen */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Öğretmen</label>
                <select
                  style={styles.input}
                  value={formData.ogretmen || ""}
                  onChange={(e) => setFormData({ ...formData, ogretmen: e.target.value ? Number(e.target.value) : null })}
                >
                  <option value="">Öğretmen seçin (opsiyonel)</option>
                  {ogretmenler.map(ogretmen => (
                    <option key={ogretmen.id} value={ogretmen.id}>
                      {ogretmen.ad} {ogretmen.soyad}
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Haftalık Saat & Kredi */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Haftalık Saat *</label>
                  <input
                    type="number"
                    style={styles.input}
                    value={formData.weekly_hours}
                    onChange={(e) => setFormData({ ...formData, weekly_hours: Number(e.target.value) })}
                    min={1}
                    max={40}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Kredi</label>
                  <input
                    type="number"
                    style={styles.input}
                    value={formData.credit}
                    onChange={(e) => setFormData({ ...formData, credit: Number(e.target.value) })}
                    min={0}
                    max={10}
                  />
                </div>
              </div>
              
              {/* Öncelik */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Öncelik (1-100)</label>
                <input
                  type="number"
                  style={styles.input}
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: Number(e.target.value) })}
                  min={1}
                  max={100}
                />
                <small style={{ color: "#6b7280", fontSize: "12px" }}>
                  Yüksek değer = yüksek öncelik (program motorunda önce yerleştirilir)
                </small>
              </div>
              
              {/* Checkboxes */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div style={styles.formGroup}>
                  <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      style={styles.checkbox}
                      checked={formData.is_mandatory}
                      onChange={(e) => setFormData({ ...formData, is_mandatory: e.target.checked })}
                    />
                    Zorunlu Ders
                  </label>
                </div>
                <div style={styles.formGroup}>
                  <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      style={styles.checkbox}
                      checked={formData.is_double_block}
                      onChange={(e) => setFormData({ ...formData, is_double_block: e.target.checked })}
                    />
                    Çift Blok (2 saat arka arkaya)
                  </label>
                </div>
              </div>
              
              {/* Oda Tipi Tercihi */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Tercih Edilen Oda Tipi</label>
                <input
                  type="text"
                  style={styles.input}
                  value={formData.preferred_room_type}
                  onChange={(e) => setFormData({ ...formData, preferred_room_type: e.target.value })}
                  placeholder="Örn: lab, spor_salonu, muzik_odasi"
                />
              </div>
              
              {/* Notlar */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Notlar</label>
                <textarea
                  style={{ ...styles.input, minHeight: "80px", resize: "vertical" }}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Ders planı hakkında notlar..."
                />
              </div>
            </div>
            
            <div style={styles.drawerFooter}>
              <button style={styles.cancelBtn} onClick={() => setDrawerOpen(false)}>
                İptal
              </button>
              <button style={styles.saveBtn} onClick={handleSave} disabled={saving}>
                {saving ? 'Kaydediliyor...' : (editingPlan ? 'Güncelle' : 'Kaydet')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
