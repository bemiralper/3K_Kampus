"use client";

import { useState, useEffect } from "react";
import { getContextHeaders } from "@/lib/api";

// Types
interface StudentClassPlacement {
  id: number;
  academic_year: number;
  academic_year_str: string;
  term: number;
  term_ad: string;
  student: number;
  student_ad: string;
  student_no: string;
  classroom: number;
  classroom_ad: string;
  group: number | null;
  group_ad: string | null;
  placement_type: string;
  placement_type_display: string;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

interface ClassroomGroup {
  id: number;
  classroom: number;
  classroom_ad: string;
  name: string;
  capacity: number | null;
  student_count: number;
  is_active: boolean;
}

interface Student {
  id: number;
  ogrenci_no: string;
  okul_no: string;
  ad: string;
  soyad: string;
  sinif_seviyesi?: string;
  sinif_ad?: string;
}

interface Classroom {
  id: number;
  ad: string;
  kapasite: number | null;
}

interface Term {
  id: number;
  name: string;
  code?: string;
  is_active: boolean;
  egitim_yili?: {
    id: number;
    display: string;
  };
}

interface PlacementType {
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

export default function OgrenciSinifYerlesimiClient() {
  // Tab state
  const [activeTab, setActiveTab] = useState<"placements" | "groups">("placements");
  
  // Active year
  const [activeYear, setActiveYear] = useState<ActiveYear | null>(null);
  
  // Placement states
  const [placements, setPlacements] = useState<StudentClassPlacement[]>([]);
  const [placementLoading, setPlacementLoading] = useState(false);
  
  // Group states
  const [groups, setGroups] = useState<ClassroomGroup[]>([]);
  const [groupLoading, setGroupLoading] = useState(false);
  
  // Drawer states
  const [placementDrawerOpen, setPlacementDrawerOpen] = useState(false);
  const [groupDrawerOpen, setGroupDrawerOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  
  // Placement form
  const [placementForm, setPlacementForm] = useState({
    term_id: "",
    student_id: "",
    classroom_id: "",
    group_id: "",
    placement_type: "PRIMARY",
    start_date: "",
    end_date: "",
    notes: ""
  });
  
  // Group form
  const [groupForm, setGroupForm] = useState({
    classroom_id: "",
    name: "",
    capacity: ""
  });
  
  // Bulk assign state
  const [bulkForm, setBulkForm] = useState({
    term_id: "",
    classroom_id: "",
    group_id: "",
    student_ids: [] as number[],
    placement_type: "PRIMARY"
  });
  const [bulkPreview, setBulkPreview] = useState<{success: number; skipped: number; errors: string[]} | null>(null);
  
  // Reference data
  const [students, setStudents] = useState<Student[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [placementTypes, setPlacementTypes] = useState<PlacementType[]>([]);
  const [classroomGroups, setClassroomGroups] = useState<ClassroomGroup[]>([]);
  
  // Filter states
  const [filterTerm, setFilterTerm] = useState("");
  const [filterClassroom, setFilterClassroom] = useState("");
  const [filterGroupClassroom, setFilterGroupClassroom] = useState("");
  
  // Selection state for bulk
  const [selectedStudents, setSelectedStudents] = useState<number[]>([]);
  
  // Error/Success states
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Drawer-specific error states (shown inside drawers)
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [groupDrawerError, setGroupDrawerError] = useState<string | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

  // ==================== API Functions ====================
  
  const fetchActiveYear = async () => {
    try {
      const res = await apiFetch(`/api/academic/class-lesson-plan/active-year/`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setActiveYear(data);
      }
    } catch (err) {
      console.error("Active year fetch error:", err);
    }
  };
  
  const fetchTerms = async () => {
    try {
      const res = await apiFetch(`/api/terms/`, {
        credentials: 'include',
        headers: {
          ...getContextHeaders(),
        },
      });
      if (res.ok) {
        const data = await res.json();
        setTerms(data.terms || data.results || data.data || []);
      }
    } catch (err) {
      console.error("Terms fetch error:", err);
    }
  };
  
  const fetchClassrooms = async () => {
    try {
      const res = await apiFetch(`/siniflar/api/`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setClassrooms(data.siniflar || data.results || []);
      }
    } catch (err) {
      console.error("Classrooms fetch error:", err);
    }
  };
  
  const fetchStudents = async () => {
    try {
      const res = await apiFetch(`/ogrenciler/api/list/`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setStudents(data.ogrenciler || data.results || []);
      }
    } catch (err) {
      console.error("Students fetch error:", err);
    }
  };
  
  const fetchPlacementTypes = async () => {
    try {
      const res = await apiFetch(`/api/academic/student-class-placements/placement-types/`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setPlacementTypes(data.types || []);
      }
    } catch (err) {
      console.error("Placement types fetch error:", err);
    }
  };
  
  const fetchPlacements = async () => {
    setPlacementLoading(true);
    try {
      let url = `${BACKEND_URL}/api/academic/student-class-placements/`;
      const params = new URLSearchParams();
      if (filterTerm) params.append("term_id", filterTerm);
      if (filterClassroom) params.append("classroom_id", filterClassroom);
      if (params.toString()) url += `?${params.toString()}`;
      
      const res = await apiFetch(url, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setPlacements(data.results || []);
      }
    } catch (err) {
      console.error("Placements fetch error:", err);
      setError("Yerleşim verileri yüklenemedi.");
    } finally {
      setPlacementLoading(false);
    }
  };
  
  const fetchGroups = async () => {
    setGroupLoading(true);
    try {
      let url = `${BACKEND_URL}/api/academic/classroom-groups/`;
      if (filterGroupClassroom) {
        url += `?classroom_id=${filterGroupClassroom}`;
      }
      const res = await apiFetch(url, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setGroups(data.results || []);
      }
    } catch (err) {
      console.error("Groups fetch error:", err);
      setError("Grup verileri yüklenemedi.");
    } finally {
      setGroupLoading(false);
    }
  };
  
  const fetchClassroomGroups = async (classroomId: string) => {
    if (!classroomId) {
      setClassroomGroups([]);
      return;
    }
    try {
      const res = await apiFetch(`/api/academic/classroom-groups/?classroom_id=${classroomId}`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setClassroomGroups(data.results || []);
      }
    } catch (err) {
      console.error("Classroom groups fetch error:", err);
    }
  };
  
  // ==================== Placement CRUD ====================
  
  const handlePlacementSubmit = async () => {
    setDrawerError(null); // Clear previous error
    try {
      const url = editMode
        ? `${BACKEND_URL}/api/academic/student-class-placements/${editId}/update/`
        : `${BACKEND_URL}/api/academic/student-class-placements/create/`;
      
      const body: Record<string, unknown> = {
        term_id: parseInt(placementForm.term_id),
        student_id: parseInt(placementForm.student_id),
        classroom_id: parseInt(placementForm.classroom_id),
        placement_type: placementForm.placement_type,
        notes: placementForm.notes || null
      };
      
      if (placementForm.group_id) body.group_id = parseInt(placementForm.group_id);
      if (placementForm.start_date) body.start_date = placementForm.start_date;
      if (placementForm.end_date) body.end_date = placementForm.end_date;
      
      const res = await apiFetch(url, {
        method: editMode ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify(body)
      });
      
      if (res.ok) {
        setSuccess(editMode ? "Yerleşim güncellendi." : "Yeni yerleşim eklendi.");
        setPlacementDrawerOpen(false);
        setDrawerError(null);
        resetPlacementForm();
        fetchPlacements();
      } else {
        const data = await res.json();
        setDrawerError(data.error || "İşlem başarısız.");
      }
    } catch (err) {
      setDrawerError("Bir hata oluştu.");
    }
  };
  
  const handlePlacementDelete = async (id: number) => {
    if (!confirm("Bu yerleşimi silmek istediğinize emin misiniz?")) return;
    
    try {
      const res = await apiFetch(`/api/academic/student-class-placements/${id}/delete/`, {
        method: "DELETE",
        credentials: 'include',
      });
      
      if (res.ok) {
        setSuccess("Yerleşim silindi.");
        fetchPlacements();
      } else {
        setError("Silme işlemi başarısız.");
      }
    } catch (err) {
      setError("Bir hata oluştu.");
    }
  };
  
  const handlePlacementEdit = (item: StudentClassPlacement) => {
    setEditMode(true);
    setEditId(item.id);
    setPlacementForm({
      term_id: item.term.toString(),
      student_id: item.student.toString(),
      classroom_id: item.classroom.toString(),
      group_id: item.group?.toString() || "",
      placement_type: item.placement_type,
      start_date: item.start_date || "",
      end_date: item.end_date || "",
      notes: item.notes || ""
    });
    if (item.classroom) {
      fetchClassroomGroups(item.classroom.toString());
    }
    setPlacementDrawerOpen(true);
  };
  
  const resetPlacementForm = () => {
    setEditMode(false);
    setEditId(null);
    setPlacementForm({
      term_id: "",
      student_id: "",
      classroom_id: "",
      group_id: "",
      placement_type: "PRIMARY",
      start_date: "",
      end_date: "",
      notes: ""
    });
    setClassroomGroups([]);
  };
  
  // ==================== Group CRUD ====================
  
  const handleGroupSubmit = async () => {
    setDrawerError(null); // Clear previous error
    try {
      const url = editMode
        ? `${BACKEND_URL}/api/academic/classroom-groups/${editId}/update/`
        : `${BACKEND_URL}/api/academic/classroom-groups/create/`;
      
      const body: Record<string, unknown> = {
        classroom_id: parseInt(groupForm.classroom_id),
        name: groupForm.name
      };
      
      if (groupForm.capacity) body.capacity = parseInt(groupForm.capacity);
      
      const res = await apiFetch(url, {
        method: editMode ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify(body)
      });
      
      if (res.ok) {
        setSuccess(editMode ? "Grup güncellendi." : "Yeni grup eklendi.");
        setGroupDrawerOpen(false);
        setDrawerError(null);
        resetGroupForm();
        fetchGroups();
      } else {
        const data = await res.json();
        setDrawerError(data.error || "İşlem başarısız.");
      }
    } catch (err) {
      setDrawerError("Bir hata oluştu.");
    }
  };
  
  const handleGroupDelete = async (id: number) => {
    if (!confirm("Bu grubu silmek istediğinize emin misiniz?")) return;
    
    try {
      const res = await apiFetch(`/api/academic/classroom-groups/${id}/delete/`, {
        method: "DELETE",
        credentials: 'include',
      });
      
      if (res.ok) {
        setSuccess("Grup silindi.");
        fetchGroups();
      } else {
        setError("Silme işlemi başarısız.");
      }
    } catch (err) {
      setError("Bir hata oluştu.");
    }
  };
  
  const handleGroupEdit = (item: ClassroomGroup) => {
    setEditMode(true);
    setEditId(item.id);
    setGroupForm({
      classroom_id: item.classroom.toString(),
      name: item.name,
      capacity: item.capacity?.toString() || ""
    });
    setGroupDrawerOpen(true);
  };
  
  const resetGroupForm = () => {
    setEditMode(false);
    setEditId(null);
    setGroupForm({
      classroom_id: "",
      name: "",
      capacity: ""
    });
  };
  
  // ==================== Bulk Assign ====================
  
  const handleBulkPreview = async () => {
    if (selectedStudents.length === 0) {
      setError("Lütfen en az bir öğrenci seçin.");
      return;
    }
    
    try {
      const body = {
        term_id: parseInt(bulkForm.term_id),
        classroom_id: parseInt(bulkForm.classroom_id),
        group_id: bulkForm.group_id ? parseInt(bulkForm.group_id) : null,
        student_ids: selectedStudents,
        placement_type: bulkForm.placement_type,
        preview: true
      };
      
      const res = await apiFetch(`/api/academic/student-class-placements/bulk-assign/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify(body)
      });
      
      if (res.ok) {
        const data = await res.json();
        setBulkPreview(data);
        setBulkError(null);
      } else {
        const data = await res.json();
        setBulkError(data.error || "Önizleme başarısız.");
      }
    } catch (err) {
      setBulkError("Bir hata oluştu.");
    }
  };
  
  const handleBulkApply = async () => {
    setBulkError(null);
    try {
      const body = {
        term_id: parseInt(bulkForm.term_id),
        classroom_id: parseInt(bulkForm.classroom_id),
        group_id: bulkForm.group_id ? parseInt(bulkForm.group_id) : null,
        student_ids: selectedStudents,
        placement_type: bulkForm.placement_type,
        preview: false
      };
      
      const res = await apiFetch(`/api/academic/student-class-placements/bulk-assign/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify(body)
      });
      
      if (res.ok) {
        const data = await res.json();
        setSuccess(`${data.created} öğrenci yerleştirildi.`);
        setBulkModalOpen(false);
        setBulkError(null);
        resetBulkForm();
        fetchPlacements();
      } else {
        const data = await res.json();
        setBulkError(data.error || "Toplu atama başarısız.");
      }
    } catch (err) {
      setBulkError("Bir hata oluştu.");
    }
  };
  
  const resetBulkForm = () => {
    setBulkForm({
      term_id: "",
      classroom_id: "",
      group_id: "",
      student_ids: [],
      placement_type: "PRIMARY"
    });
    setBulkPreview(null);
    setSelectedStudents([]);
    setBulkError(null);
  };
  
  const toggleStudentSelection = (studentId: number) => {
    setSelectedStudents(prev => 
      prev.includes(studentId)
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
  };
  
  const toggleAllStudents = () => {
    const unplacedStudentIds = students
      .filter(s => !placements.some(p => p.student === s.id))
      .map(s => s.id);
    
    if (selectedStudents.length === unplacedStudentIds.length) {
      setSelectedStudents([]);
    } else {
      setSelectedStudents(unplacedStudentIds);
    }
  };
  
  // ==================== Effects ====================
  
  useEffect(() => {
    fetchActiveYear();
    fetchTerms();
    fetchClassrooms();
    fetchStudents();
    fetchPlacementTypes();
  }, []);
  
  useEffect(() => {
    if (activeTab === "placements") {
      fetchPlacements();
    } else {
      fetchGroups();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, filterTerm, filterClassroom, filterGroupClassroom]);
  
  useEffect(() => {
    if (placementForm.classroom_id) {
      fetchClassroomGroups(placementForm.classroom_id);
    }
  }, [placementForm.classroom_id]);
  
  useEffect(() => {
    if (bulkForm.classroom_id) {
      fetchClassroomGroups(bulkForm.classroom_id);
    }
  }, [bulkForm.classroom_id]);
  
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
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="8.5" cy="7" r="4" />
              <line x1="20" y1="8" x2="20" y2="14" />
              <line x1="23" y1="11" x2="17" y2="11" />
            </svg>
          </div>
          <div className="hero-text">
            <h1>Öğrenci Sınıf Yerleşimi</h1>
            <div className="hero-breadcrumb">
              <a href="/dashboard">Ana Sayfa</a>
              <span>/</span>
              <span>Akademik Planlama</span>
              <span>/</span>
              <span>Öğrenci Sınıf Yerleşimi</span>
              {activeYear && (
                <>
                  <span>/</span>
                  <span className="breadcrumb-badge">{activeYear.yil_str}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          {activeTab === "placements" && (
            <button 
              className="btn-hero-secondary"
              onClick={() => setBulkModalOpen(true)}
              style={{ 
                padding: "10px 20px",
                backgroundColor: "#f3f4f6",
                color: "#374151",
                border: "1px solid #d1d5db",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: 500,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              Toplu Yerleştir
            </button>
          )}
          <button 
            className="btn-hero"
            onClick={() => {
              if (activeTab === "placements") {
                resetPlacementForm();
                setPlacementDrawerOpen(true);
              } else {
                resetGroupForm();
                setGroupDrawerOpen(true);
              }
            }}
          >
            <span className="btn-hero-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </span>
            <span>{activeTab === "placements" ? "Yeni Yerleşim" : "Yeni Grup"}</span>
          </button>
        </div>
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
          className={`tab-modern ${activeTab === "placements" ? "active" : ""}`}
          onClick={() => setActiveTab("placements")}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          Öğrenci Yerleşimleri
          <span className="tab-count">{placements.length}</span>
        </button>
        <button
          className={`tab-modern ${activeTab === "groups" ? "active" : ""}`}
          onClick={() => setActiveTab("groups")}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
          </svg>
          Sınıf Grupları
          <span className="tab-count">{groups.length}</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="card-modern">
        {activeTab === "placements" ? (
          <>
            {/* Placement Filter */}
            <div className="card-modern-header">
              <h3>👥 Öğrenci Sınıf Yerleşimleri</h3>
              <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                <select
                  value={filterTerm}
                  onChange={(e) => setFilterTerm(e.target.value)}
                  className="form-select"
                  style={{ minWidth: "150px" }}
                >
                  <option value="">Tüm Dönemler</option>
                  {terms.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} {t.egitim_yili ? `(${t.egitim_yili.display})` : ''}</option>
                  ))}
                </select>
                <select
                  value={filterClassroom}
                  onChange={(e) => setFilterClassroom(e.target.value)}
                  className="form-select"
                  style={{ minWidth: "150px" }}
                >
                  <option value="">Tüm Sınıflar</option>
                  {classrooms.map((c) => (
                    <option key={c.id} value={c.id}>{c.ad}</option>
                  ))}
                </select>
              </div>
            </div>
            
            {/* Placements Table */}
            <div className="table-responsive">
              {placementLoading ? (
                <div style={{ padding: "48px", textAlign: "center" }}>Yükleniyor...</div>
              ) : placements.length === 0 ? (
                <div style={{ padding: "48px", textAlign: "center", color: "#6b7280" }}>
                  <div style={{ fontSize: "48px", marginBottom: "16px" }}>👥</div>
                  <h3>Henüz Yerleşim Yok</h3>
                  <p>Öğrencileri sınıflara yerleştirin.</p>
                </div>
              ) : (
                <table className="table-modern">
                  <thead>
                    <tr>
                      <th>Öğrenci</th>
                      <th>Sınıf</th>
                      <th>Grup</th>
                      <th>Dönem</th>
                      <th>Yerleşim Türü</th>
                      <th>Tarih Aralığı</th>
                      <th style={{ width: "100px" }}>İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {placements.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <div>
                            <span className="badge badge-secondary" style={{ marginRight: "8px" }}>{item.student_no}</span>
                            {item.student_ad}
                          </div>
                        </td>
                        <td>
                          <span className="badge badge-primary">{item.classroom_ad}</span>
                        </td>
                        <td>
                          {item.group_ad ? (
                            <span className="badge badge-info">{item.group_ad}</span>
                          ) : (
                            <span style={{ color: "#9ca3af" }}>-</span>
                          )}
                        </td>
                        <td>{item.term_ad}</td>
                        <td>
                          <span className={`badge ${
                            item.placement_type === "PRIMARY" ? "badge-success" : 
                            item.placement_type === "GUEST" ? "badge-warning" :
                            item.placement_type === "TRANSFER" ? "badge-info" :
                            "badge-secondary"
                          }`}>
                            {item.placement_type_display}
                          </span>
                        </td>
                        <td>
                          {item.start_date || item.end_date ? (
                            <span style={{ fontSize: "12px" }}>
                              {item.start_date || "..."} - {item.end_date || "..."}
                            </span>
                          ) : (
                            <span style={{ color: "#9ca3af" }}>-</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: "4px" }}>
                            <button 
                              className="btn btn-sm btn-outline-primary"
                              onClick={() => handlePlacementEdit(item)}
                              title="Düzenle"
                            >
                              ✏️
                            </button>
                            <button 
                              className="btn btn-sm btn-outline-danger"
                              onClick={() => handlePlacementDelete(item.id)}
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
            {/* Group Filter */}
            <div className="card-modern-header">
              <h3>📦 Sınıf Alt Grupları</h3>
              <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                <select
                  value={filterGroupClassroom}
                  onChange={(e) => setFilterGroupClassroom(e.target.value)}
                  className="form-select"
                  style={{ minWidth: "200px" }}
                >
                  <option value="">Tüm Sınıflar</option>
                  {classrooms.map((c) => (
                    <option key={c.id} value={c.id}>{c.ad}</option>
                  ))}
                </select>
              </div>
            </div>
            
            {/* Groups Table */}
            <div className="table-responsive">
              {groupLoading ? (
                <div style={{ padding: "48px", textAlign: "center" }}>Yükleniyor...</div>
              ) : groups.length === 0 ? (
                <div style={{ padding: "48px", textAlign: "center", color: "#6b7280" }}>
                  <div style={{ fontSize: "48px", marginBottom: "16px" }}>📦</div>
                  <h3>Henüz Grup Yok</h3>
                  <p>Sınıflar için alt gruplar oluşturun (örn: A Grubu, B Grubu)</p>
                </div>
              ) : (
                <table className="table-modern">
                  <thead>
                    <tr>
                      <th>Sınıf</th>
                      <th>Grup Adı</th>
                      <th>Kapasite</th>
                      <th>Öğrenci Sayısı</th>
                      <th>Durum</th>
                      <th style={{ width: "100px" }}>İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <span className="badge badge-primary">{item.classroom_ad}</span>
                        </td>
                        <td>{item.name}</td>
                        <td>{item.capacity || "-"}</td>
                        <td>
                          <span className={`badge ${item.capacity && item.student_count >= item.capacity ? "badge-danger" : "badge-success"}`}>
                            {item.student_count}
                            {item.capacity && ` / ${item.capacity}`}
                          </span>
                        </td>
                        <td>
                          {item.is_active ? (
                            <span className="badge badge-success">Aktif</span>
                          ) : (
                            <span className="badge badge-secondary">Pasif</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: "4px" }}>
                            <button 
                              className="btn btn-sm btn-outline-primary"
                              onClick={() => handleGroupEdit(item)}
                              title="Düzenle"
                            >
                              ✏️
                            </button>
                            <button 
                              className="btn btn-sm btn-outline-danger"
                              onClick={() => handleGroupDelete(item.id)}
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

      {/* Placement Drawer */}
      {placementDrawerOpen && (
        <>
          <div className="gv-drawer-overlay" onClick={() => { setPlacementDrawerOpen(false); setDrawerError(null); }} />
          <div className="gv-drawer">
            <div className="gv-drawer-header">
              <h3>{editMode ? "Yerleşimi Düzenle" : "Yeni Öğrenci Yerleşimi"}</h3>
              <button className="gv-drawer-close" onClick={() => { setPlacementDrawerOpen(false); setDrawerError(null); }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="gv-drawer-body">
              {/* Drawer Error */}
              {drawerError && (
                <div style={{ 
                  padding: "12px 16px", 
                  backgroundColor: "#fef2f2", 
                  border: "1px solid #fecaca", 
                  borderRadius: "8px", 
                  color: "#dc2626",
                  marginBottom: "16px",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "8px"
                }}>
                  <span style={{ fontSize: "18px" }}>⚠️</span>
                  <span>{drawerError}</span>
                </div>
              )}
              <div className="gv-form-group">
                <label className="gv-form-label">
                  Dönem <span className="gv-required">*</span>
                </label>
                <select
                  className="gv-form-select"
                  value={placementForm.term_id}
                  onChange={(e) => setPlacementForm({ ...placementForm, term_id: e.target.value })}
                >
                  <option value="">Dönem Seçin</option>
                  {terms.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} {t.egitim_yili ? `(${t.egitim_yili.display})` : ''}</option>
                  ))}
                </select>
              </div>
              
              <div className="gv-form-group">
                <label className="gv-form-label">
                  Öğrenci <span className="gv-required">*</span>
                </label>
                <select
                  className="gv-form-select"
                  value={placementForm.student_id}
                  onChange={(e) => setPlacementForm({ ...placementForm, student_id: e.target.value })}
                  disabled={editMode}
                >
                  <option value="">Öğrenci Seçin</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.okul_no || s.ogrenci_no} - {s.ad} {s.soyad} {s.sinif_seviyesi ? `(${s.sinif_seviyesi})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="gv-form-group">
                <label className="gv-form-label">
                  Sınıf <span className="gv-required">*</span>
                </label>
                <select
                  className="gv-form-select"
                  value={placementForm.classroom_id}
                  onChange={(e) => setPlacementForm({ ...placementForm, classroom_id: e.target.value, group_id: "" })}
                >
                  <option value="">Sınıf Seçin</option>
                  {classrooms.map((c) => (
                    <option key={c.id} value={c.id}>{c.ad} {c.kapasite ? `(${c.kapasite} kişilik)` : ""}</option>
                  ))}
                </select>
              </div>
              
              {classroomGroups.length > 0 && (
                <div className="gv-form-group">
                  <label className="gv-form-label">Alt Grup</label>
                  <select
                    className="gv-form-select"
                    value={placementForm.group_id}
                    onChange={(e) => setPlacementForm({ ...placementForm, group_id: e.target.value })}
                  >
                    <option value="">Grup Seçmeyin</option>
                    {classroomGroups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name} {g.capacity ? `(${g.student_count}/${g.capacity})` : ""}</option>
                    ))}
                  </select>
                </div>
              )}
              
              <div className="gv-form-group">
                <label className="gv-form-label">
                  Yerleşim Türü <span className="gv-required">*</span>
                </label>
                <select
                  className="gv-form-select"
                  value={placementForm.placement_type}
                  onChange={(e) => setPlacementForm({ ...placementForm, placement_type: e.target.value })}
                >
                  {placementTypes.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              
              <div className="gv-form-row">
                <div className="gv-form-group">
                  <label className="gv-form-label">Başlangıç Tarihi</label>
                  <input
                    type="date"
                    className="gv-form-input"
                    value={placementForm.start_date}
                    onChange={(e) => setPlacementForm({ ...placementForm, start_date: e.target.value })}
                  />
                </div>
                <div className="gv-form-group">
                  <label className="gv-form-label">Bitiş Tarihi</label>
                  <input
                    type="date"
                    className="gv-form-input"
                    value={placementForm.end_date}
                    onChange={(e) => setPlacementForm({ ...placementForm, end_date: e.target.value })}
                  />
                </div>
              </div>
              
              <div className="gv-form-group">
                <label className="gv-form-label">Notlar</label>
                <textarea
                  className="gv-form-textarea"
                  value={placementForm.notes}
                  onChange={(e) => setPlacementForm({ ...placementForm, notes: e.target.value })}
                  rows={3}
                  placeholder="Ek bilgiler..."
                />
              </div>
            </div>
            <div className="gv-drawer-footer">
              <button className="gv-btn gv-btn-secondary" onClick={() => { setPlacementDrawerOpen(false); setDrawerError(null); }}>İptal</button>
              <button 
                className="gv-btn gv-btn-primary" 
                onClick={handlePlacementSubmit}
                disabled={!placementForm.term_id || !placementForm.student_id || !placementForm.classroom_id}
              >
                {editMode ? "Güncelle" : "Yerleştir"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Group Drawer */}
      {groupDrawerOpen && (
        <>
          <div className="gv-drawer-overlay" onClick={() => { setGroupDrawerOpen(false); setGroupDrawerError(null); }} />
          <div className="gv-drawer">
            <div className="gv-drawer-header">
              <h3>{editMode ? "Grubu Düzenle" : "Yeni Sınıf Grubu"}</h3>
              <button className="gv-drawer-close" onClick={() => { setGroupDrawerOpen(false); setGroupDrawerError(null); }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="gv-drawer-body">
              {/* Group Drawer Error */}
              {groupDrawerError && (
                <div style={{ 
                  padding: "12px 16px", 
                  backgroundColor: "#fef2f2", 
                  border: "1px solid #fecaca", 
                  borderRadius: "8px", 
                  color: "#dc2626",
                  marginBottom: "16px",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "8px"
                }}>
                  <span style={{ fontSize: "18px" }}>⚠️</span>
                  <span>{groupDrawerError}</span>
                </div>
              )}
              <div className="gv-form-group">
                <label className="gv-form-label">
                  Sınıf <span className="gv-required">*</span>
                </label>
                <select
                  className="gv-form-select"
                  value={groupForm.classroom_id}
                  onChange={(e) => setGroupForm({ ...groupForm, classroom_id: e.target.value })}
                  disabled={editMode}
                >
                  <option value="">Sınıf Seçin</option>
                  {classrooms.map((c) => (
                    <option key={c.id} value={c.id}>{c.ad}</option>
                  ))}
                </select>
              </div>
              
              <div className="gv-form-group">
                <label className="gv-form-label">
                  Grup Adı <span className="gv-required">*</span>
                </label>
                <input
                  type="text"
                  className="gv-form-input"
                  value={groupForm.name}
                  onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                  placeholder="Örn: A Grubu, Lab-1"
                />
              </div>
              
              <div className="gv-form-group">
                <label className="gv-form-label">Kapasite</label>
                <input
                  type="number"
                  className="gv-form-input"
                  value={groupForm.capacity}
                  onChange={(e) => setGroupForm({ ...groupForm, capacity: e.target.value })}
                  placeholder="Opsiyonel"
                  min="1"
                />
                <small className="gv-form-help">Grubun maksimum öğrenci sayısı</small>
              </div>
            </div>
            <div className="gv-drawer-footer">
              <button className="gv-btn gv-btn-secondary" onClick={() => { setGroupDrawerOpen(false); setGroupDrawerError(null); }}>İptal</button>
              <button 
                className="gv-btn gv-btn-primary" 
                onClick={handleGroupSubmit}
                disabled={!groupForm.classroom_id || !groupForm.name}
              >
                {editMode ? "Güncelle" : "Oluştur"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Bulk Assign Modal */}
      {bulkModalOpen && (
        <>
          <div className="gv-drawer-overlay" onClick={() => { setBulkModalOpen(false); resetBulkForm(); setBulkError(null); }} />
          <div className="gv-drawer" style={{ width: "700px" }}>
            <div className="gv-drawer-header">
              <h3>Toplu Öğrenci Yerleştirme</h3>
              <button className="gv-drawer-close" onClick={() => { setBulkModalOpen(false); resetBulkForm(); setBulkError(null); }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="gv-drawer-body">
              {bulkError && (
                <div className="alert alert-danger" style={{ 
                  marginBottom: "16px", 
                  padding: "12px 16px", 
                  borderRadius: "8px", 
                  backgroundColor: "#fef2f2", 
                  border: "1px solid #fecaca", 
                  color: "#b91c1c",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}>
                  <span>{bulkError}</span>
                  <button 
                    onClick={() => setBulkError(null)} 
                    style={{ 
                      background: "none", 
                      border: "none", 
                      color: "#b91c1c", 
                      cursor: "pointer", 
                      fontSize: "18px",
                      padding: "0 4px"
                    }}
                  >
                    ×
                  </button>
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
                <div className="gv-form-group">
                  <label className="gv-form-label">
                    Dönem <span className="gv-required">*</span>
                  </label>
                  <select
                    className="gv-form-select"
                    value={bulkForm.term_id}
                    onChange={(e) => setBulkForm({ ...bulkForm, term_id: e.target.value })}
                  >
                    <option value="">Dönem Seçin</option>
                    {terms.map((t) => (
                      <option key={t.id} value={t.id}>{t.name} {t.egitim_yili ? `(${t.egitim_yili.display})` : ''}</option>
                    ))}
                  </select>
                </div>
                
                <div className="gv-form-group">
                  <label className="gv-form-label">
                    Sınıf <span className="gv-required">*</span>
                  </label>
                  <select
                    className="gv-form-select"
                    value={bulkForm.classroom_id}
                    onChange={(e) => setBulkForm({ ...bulkForm, classroom_id: e.target.value, group_id: "" })}
                  >
                    <option value="">Sınıf Seçin</option>
                    {classrooms.map((c) => (
                      <option key={c.id} value={c.id}>{c.ad}</option>
                    ))}
                  </select>
                </div>
                
                {classroomGroups.length > 0 && (
                  <div className="gv-form-group">
                    <label className="gv-form-label">Alt Grup</label>
                    <select
                      className="gv-form-select"
                      value={bulkForm.group_id}
                      onChange={(e) => setBulkForm({ ...bulkForm, group_id: e.target.value })}
                    >
                      <option value="">Grup Seçmeyin</option>
                      {classroomGroups.map((g) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                
                <div className="gv-form-group">
                  <label className="gv-form-label">Yerleşim Türü</label>
                  <select
                    className="gv-form-select"
                    value={bulkForm.placement_type}
                    onChange={(e) => setBulkForm({ ...bulkForm, placement_type: e.target.value })}
                  >
                    {placementTypes.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              {/* Student Selection */}
              <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", overflow: "hidden" }}>
                <div style={{ 
                  padding: "12px 16px", 
                  backgroundColor: "#f9fafb", 
                  borderBottom: "1px solid #e5e7eb",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}>
                  <span style={{ fontWeight: 500 }}>Öğrenci Seçimi ({selectedStudents.length} seçili)</span>
                  <button 
                    className="btn btn-sm btn-outline-primary"
                    onClick={toggleAllStudents}
                  >
                    {selectedStudents.length === students.filter(s => !placements.some(p => p.student === s.id)).length
                      ? "Tümünü Kaldır" 
                      : "Tümünü Seç"}
                  </button>
                </div>
                <div style={{ maxHeight: "300px", overflowY: "auto", padding: "8px" }}>
                  {students.filter(s => !placements.some(p => p.student === s.id)).length === 0 ? (
                    <div style={{ padding: "24px", textAlign: "center", color: "#6b7280" }}>
                      Yerleştirilmemiş öğrenci bulunmuyor.
                    </div>
                  ) : (
                    students
                      .filter(s => !placements.some(p => p.student === s.id))
                      .map((s) => (
                        <label 
                          key={s.id} 
                          style={{ 
                            display: "flex", 
                            alignItems: "center", 
                            padding: "8px 12px",
                            cursor: "pointer",
                            borderRadius: "4px",
                            backgroundColor: selectedStudents.includes(s.id) ? "#eff6ff" : "transparent"
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedStudents.includes(s.id)}
                            onChange={() => toggleStudentSelection(s.id)}
                            style={{ marginRight: "12px" }}
                          />
                          <span className="badge badge-secondary" style={{ marginRight: "8px" }}>{s.okul_no || s.ogrenci_no}</span>
                          <span>{s.ad} {s.soyad}</span>
                          {s.sinif_seviyesi && (
                            <span className="badge badge-info" style={{ marginLeft: "8px" }}>{s.sinif_seviyesi}</span>
                          )}
                        </label>
                      ))
                  )}
                </div>
              </div>
              
              {/* Preview */}
              {bulkPreview && (
                <div style={{ marginTop: "16px", padding: "16px", backgroundColor: "#f0fdf4", borderRadius: "8px", border: "1px solid #bbf7d0" }}>
                  <h4 style={{ margin: "0 0 12px", color: "#166534" }}>Önizleme Sonucu</h4>
                  <p style={{ margin: "4px 0" }}>✅ {bulkPreview.success} öğrenci yerleştirilecek</p>
                  <p style={{ margin: "4px 0" }}>⏭️ {bulkPreview.skipped} öğrenci atlandı (zaten yerleşik)</p>
                  {bulkPreview.errors.length > 0 && (
                    <div style={{ marginTop: "8px", color: "#dc2626" }}>
                      {bulkPreview.errors.map((err, i) => (
                        <p key={i} style={{ margin: "4px 0" }}>❌ {err}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="gv-drawer-footer">
              <button className="gv-btn gv-btn-secondary" onClick={() => { setBulkModalOpen(false); resetBulkForm(); setBulkError(null); }}>İptal</button>
              {!bulkPreview ? (
                <button 
                  className="gv-btn gv-btn-primary" 
                  onClick={handleBulkPreview}
                  disabled={!bulkForm.term_id || !bulkForm.classroom_id || selectedStudents.length === 0}
                >
                  Önizle
                </button>
              ) : (
                <button 
                  className="gv-btn gv-btn-primary" 
                  onClick={handleBulkApply}
                  disabled={bulkPreview.success === 0}
                >
                  {bulkPreview.success} Öğrenci Yerleştir
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
