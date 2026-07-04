"use client";

import { useState, useEffect, useCallback } from "react";
import { getContextHeaders } from "@/lib/api";

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

// ==================== INTERFACES ====================

interface Term {
  id: number;
  name: string;
  egitim_yili?: { id: number; display: string };
}

interface ScheduleTemplate {
  id: number;
  name: string;
  is_active: boolean;
}

interface WeeklyCycle {
  id: number;
  name: string;
  is_active: boolean;
  schedule_template: number;
}

interface Sinif {
  id: number;
  ad: string;
  kod?: string;
}

interface ScheduleRun {
  id: number;
  term_id: number;
  term_name: string;
  sinif_id: number | null;
  sinif_name: string;
  run_type: string;
  run_type_display: string;
  status: string;
  status_display: string;
  total_jobs: number;
  placed_jobs: number;
  failed_jobs: number;
  success_rate: number;
  created_at: string;
  duration_seconds: number | null;
}

interface PreviewResult {
  run_id: number;
  total_jobs: number;
  placed_jobs: number;
  failed_jobs: number;
  success_rate: number;
  placed: PlacedItem[];
  failed: FailedItem[];
  conflicts: ConflictItem[];
  warnings: WarningItem[];
}

interface PlacedItem {
  lesson: string;
  classroom: string;
  day_id: number;
  slot_id?: number;
  slots?: number[];
  teacher_id: number;
  double_block: boolean;
}

interface FailedItem {
  lesson: string;
  classroom: string;
  reason: string;
  double_block?: boolean;
  job_index?: number;
  weekly_hours?: number;
}

interface ConflictItem {
  type: string;
  teacher?: string;
  day: string;
  slot: number;
  classes?: string[];
}

interface WarningItem {
  message: string;
}

interface WeeklyDay {
  id: number;
  name: string;
  short_name: string;
  order: number;
}

interface TimeSlot {
  id: number;
  name: string;
  start_time: string;
  end_time: string;
  order: number;
  slot_type: string;
}

interface GridCell {
  id: number;
  weekly_day_id: number;
  timeslot_id: number;
  status: string;
  ders_id: number | null;
  ders_ad?: string;
  ogretmen_id: number | null;
  ogretmen_ad?: string;
  sinif_id: number | null;
  is_double_block_start: boolean;
}

// ==================== COMPONENT ====================

export default function DersProgramiClient() {
  // Data states
  const [terms, setTerms] = useState<Term[]>([]);
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);
  const [cycles, setCycles] = useState<WeeklyCycle[]>([]);
  const [classrooms, setClassrooms] = useState<Sinif[]>([]);
  const [runs, setRuns] = useState<ScheduleRun[]>([]);
  const [weeklyDays, setWeeklyDays] = useState<WeeklyDay[]>([]);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [gridCells, setGridCells] = useState<GridCell[]>([]);
  
  // Form states
  const [selectedTerm, setSelectedTerm] = useState<string>("");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [selectedCycle, setSelectedCycle] = useState<string>("");
  const [selectedClassroom, setSelectedClassroom] = useState<string>("");
  
  // UI states
  const [loading, setLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"preview" | "grid" | "history">("preview");
  
  // ==================== DATA FETCHING ====================
  
  const fetchData = useCallback(async () => {
    try {
      // Fetch terms
      const termsRes = await apiFetch(`/api/terms/`, {
        credentials: 'include',
        headers: getContextHeaders()
      });
      if (termsRes.ok) {
        const data = await termsRes.json();
        setTerms(data.terms || data.results || data.data || []);
      }
      
      // Fetch templates
      const templatesRes = await apiFetch(`/api/academic/schedule-templates/`, {
        credentials: 'include'
      });
      if (templatesRes.ok) {
        const data = await templatesRes.json();
        const templateList = Array.isArray(data) ? data : (data.templates || data.results || data.data || []);
        setTemplates(templateList);
      }
      
      // Fetch classrooms
      const classroomsRes = await apiFetch(`/siniflar/api/`, {
        credentials: 'include'
      });
      if (classroomsRes.ok) {
        const data = await classroomsRes.json();
        setClassrooms(data.siniflar || data.results || data.data || []);
      }
      
    } catch (err) {
      console.error("Veri yüklenirken hata:", err);
    }
  }, []);
  
  const fetchRuns = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedTerm) params.append('term_id', selectedTerm);
      if (selectedClassroom) params.append('classroom_id', selectedClassroom);
      params.append('limit', '20');
      
      const res = await apiFetch(`/api/academic/scheduler/runs/?${params}`, {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setRuns(data.runs || []);
      }
    } catch (err) {
      console.error("Çalıştırma logları yüklenirken hata:", err);
    }
  }, [selectedTerm, selectedClassroom]);
  
  const fetchGridData = useCallback(async () => {
    if (!selectedTemplate || !selectedCycle) return;
    
    try {
      // Fetch weekly days
      const daysRes = await apiFetch(`/api/academic/weekly-days/?cycle_id=${selectedCycle}`, {
        credentials: 'include'
      });
      if (daysRes.ok) {
        const data = await daysRes.json();
        setWeeklyDays(data.days || data.results || []);
      }
      
      // Fetch time slots
      const slotsRes = await apiFetch(`/api/academic/schedule-templates/${selectedTemplate}/timeslots/`, {
        credentials: 'include'
      });
      if (slotsRes.ok) {
        const data = await slotsRes.json();
        setTimeSlots((data.timeslots || data.results || []).filter((s: TimeSlot) => s.slot_type === 'LESSON'));
      }
      
      // Fetch grid cells
      const params = new URLSearchParams({
        schedule_template_id: selectedTemplate,
        weekly_cycle_id: selectedCycle
      });
      if (selectedClassroom) params.append('sinif_id', selectedClassroom);
      
      const cellsRes = await apiFetch(`/api/academic/program-grid/cells/?${params}`, {
        credentials: 'include'
      });
      if (cellsRes.ok) {
        const data = await cellsRes.json();
        setGridCells(data.cells || data.results || []);
      }
    } catch (err) {
      console.error("Grid verisi yüklenirken hata:", err);
    }
  }, [selectedTemplate, selectedCycle, selectedClassroom]);
  
  useEffect(() => {
    fetchData();
  }, [fetchData]);
  
  // Template seçildiğinde cycle'ları yükle
  useEffect(() => {
    if (selectedTemplate) {
      const fetchCycles = async () => {
        try {
          const cyclesRes = await apiFetch(`/api/academic/weekly-cycles/?schedule_template_id=${selectedTemplate}`, {
            credentials: 'include'
          });
          if (cyclesRes.ok) {
            const data = await cyclesRes.json();
            const cycleList = Array.isArray(data) ? data : (data.cycles || data.results || data.data || []);
            setCycles(cycleList);
          }
        } catch (err) {
          console.error("Haftalık döngüler yüklenirken hata:", err);
        }
      };
      fetchCycles();
    } else {
      setCycles([]);
      setSelectedCycle("");
    }
  }, [selectedTemplate]);
  
  useEffect(() => {
    if (activeTab === "history") {
      fetchRuns();
    }
  }, [activeTab, fetchRuns]);
  
  useEffect(() => {
    if (activeTab === "grid") {
      fetchGridData();
    }
  }, [activeTab, fetchGridData]);
  
  // ==================== ACTIONS ====================
  
  const runPreview = async () => {
    if (!selectedTerm || !selectedTemplate || !selectedCycle) {
      setError("Lütfen dönem, şablon ve haftalık döngü seçin");
      return;
    }
    
    setLoading(true);
    setError(null);
    setPreviewResult(null);
    
    try {
      const res = await apiFetch(`/api/academic/scheduler/run-preview/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          term_id: parseInt(selectedTerm),
          schedule_template_id: parseInt(selectedTemplate),
          weekly_cycle_id: parseInt(selectedCycle),
          classroom_id: selectedClassroom ? parseInt(selectedClassroom) : null
        })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setPreviewResult(data);
        setSuccess(`Önizleme tamamlandı: ${data.placed_jobs}/${data.total_jobs} ders yerleşti`);
      } else {
        // Detaylı hata mesajı göster
        let errorMsg = data.error || data.detail || "Önizleme başarısız";
        if (data.message) errorMsg += `: ${data.message}`;
        if (data.errors) errorMsg += ` - ${JSON.stringify(data.errors)}`;
        console.error("Preview hatası:", data);
        setError(errorMsg);
      }
    } catch (err) {
      console.error("Sunucu hatası:", err);
      setError(`Sunucu bağlantı hatası: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };
  
  const runExecute = async () => {
    if (!selectedTerm || !selectedTemplate || !selectedCycle) {
      setError("Lütfen dönem, şablon ve haftalık döngü seçin");
      return;
    }
    
    if (!confirm("Program oluşturulacak. Grid'deki mevcut veriler değişecek. Devam etmek istiyor musunuz?")) {
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const res = await apiFetch(`/api/academic/scheduler/run-execute/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          term_id: parseInt(selectedTerm),
          schedule_template_id: parseInt(selectedTemplate),
          weekly_cycle_id: parseInt(selectedCycle),
          classroom_id: selectedClassroom ? parseInt(selectedClassroom) : null
        })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setPreviewResult(data);
        setSuccess(`Program oluşturuldu: ${data.placed_jobs}/${data.total_jobs} ders yerleşti`);
        fetchRuns();
        fetchGridData();
      } else {
        // Detaylı hata mesajı göster
        let errorMsg = data.error || data.detail || "Program oluşturma başarısız";
        if (data.message) errorMsg += `: ${data.message}`;
        if (data.errors) errorMsg += ` - ${JSON.stringify(data.errors)}`;
        console.error("Execute hatası:", data);
        setError(errorMsg);
      }
    } catch (err) {
      console.error("Sunucu hatası:", err);
      setError(`Sunucu bağlantı hatası: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };
  
  const resetGrid = async () => {
    if (!selectedTemplate || !selectedCycle) {
      setError("Lütfen şablon ve haftalık döngü seçin");
      return;
    }
    
    if (!confirm("Grid sıfırlanacak. Tüm dersler kaldırılacak (kilitli hücreler hariç). Devam etmek istiyor musunuz?")) {
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const res = await apiFetch(`/api/academic/scheduler/reset-grid/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schedule_template_id: parseInt(selectedTemplate),
          weekly_cycle_id: parseInt(selectedCycle),
          classroom_id: selectedClassroom ? parseInt(selectedClassroom) : null
        })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setSuccess(data.message || "Grid sıfırlandı");
        fetchGridData();
      } else {
        setError(data.error || "Grid sıfırlama başarısız");
      }
    } catch (err) {
      setError("Sunucu bağlantı hatası");
    } finally {
      setLoading(false);
    }
  };
  
  // ==================== HELPERS ====================
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SUCCESS': return { bg: '#dcfce7', text: '#166534' };
      case 'PARTIAL': return { bg: '#fef3c7', text: '#92400e' };
      case 'FAILED': return { bg: '#fee2e2', text: '#991b1b' };
      case 'RUNNING': return { bg: '#dbeafe', text: '#1e40af' };
      default: return { bg: '#f3f4f6', text: '#374151' };
    }
  };
  
  const getCellColor = (status: string) => {
    switch (status) {
      case 'FILLED': return '#dcfce7';
      case 'LOCKED': return '#fee2e2';
      case 'EMPTY': return '#ffffff';
      case 'HOLIDAY': return '#fef3c7';
      case 'EXAM': return '#dbeafe';
      default: return '#f3f4f6';
    }
  };
  
  const getGridCell = (dayId: number, slotId: number): GridCell | undefined => {
    return gridCells.find(c => c.weekly_day_id === dayId && c.timeslot_id === slotId);
  };
  
  // ==================== RENDER ====================
  
  return (
    <div className="gv-container">
      {/* Hero Header */}
      <div className="hero-header" style={{ marginBottom: '24px' }}>
        <div className="hero-content">
          <div className="hero-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <div className="hero-text">
            <h1>Ders Programı Motoru</h1>
            <div className="hero-breadcrumb">
              <a href="/dashboard">Ana Sayfa</a>
              <span>/</span>
              <span>Akademik Planlama</span>
              <span>/</span>
              <span>Ders Programı</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Messages */}
      {error && (
        <div className="alert alert-danger" style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: '8px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c' }}>
          {error}
          <button onClick={() => setError(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c' }}>×</button>
        </div>
      )}
      {success && (
        <div className="alert alert-success" style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: '8px', backgroundColor: '#dcfce7', border: '1px solid #86efac', color: '#166534' }}>
          {success}
          <button onClick={() => setSuccess(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#166534' }}>×</button>
        </div>
      )}
      
      {/* Filter Bar */}
      <div className="gv-card" style={{ marginBottom: '24px' }}>
        <div className="gv-card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '16px' }}>
            <div className="gv-form-group">
              <label className="gv-form-label">Dönem <span className="gv-required">*</span></label>
              <select 
                className="gv-form-select" 
                value={selectedTerm} 
                onChange={(e) => setSelectedTerm(e.target.value)}
              >
                <option value="">Dönem Seçin</option>
                {terms.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.egitim_yili ? `(${t.egitim_yili.display})` : ''}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="gv-form-group">
              <label className="gv-form-label">Zaman Şablonu <span className="gv-required">*</span></label>
              <select 
                className="gv-form-select" 
                value={selectedTemplate} 
                onChange={(e) => setSelectedTemplate(e.target.value)}
              >
                <option value="">Şablon Seçin</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            
            <div className="gv-form-group">
              <label className="gv-form-label">Haftalık Döngü <span className="gv-required">*</span></label>
              <select 
                className="gv-form-select" 
                value={selectedCycle} 
                onChange={(e) => setSelectedCycle(e.target.value)}
              >
                <option value="">Döngü Seçin</option>
                {cycles.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            
            <div className="gv-form-group">
              <label className="gv-form-label">Sınıf (Opsiyonel)</label>
              <select 
                className="gv-form-select" 
                value={selectedClassroom} 
                onChange={(e) => setSelectedClassroom(e.target.value)}
              >
                <option value="">Tüm Sınıflar</option>
                {classrooms.map(c => (
                  <option key={c.id} value={c.id}>{c.ad}</option>
                ))}
              </select>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button 
              className="gv-btn gv-btn-secondary" 
              onClick={runPreview}
              disabled={loading || !selectedTerm || !selectedTemplate || !selectedCycle}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              {loading ? "Çalışıyor..." : "Önizleme"}
            </button>
            
            <button 
              className="gv-btn gv-btn-primary" 
              onClick={runExecute}
              disabled={loading || !selectedTerm || !selectedTemplate || !selectedCycle}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              {loading ? "Çalışıyor..." : "Program Oluştur"}
            </button>
            
            <button 
              className="gv-btn" 
              style={{ backgroundColor: '#ef4444', color: '#fff' }}
              onClick={resetGrid}
              disabled={loading || !selectedTemplate || !selectedCycle}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
              Grid Sıfırla
            </button>
          </div>
        </div>
      </div>
      
      {/* Tabs */}
      <div className="gv-tabs" style={{ marginBottom: '16px' }}>
        <button 
          className={`gv-tab ${activeTab === 'preview' ? 'active' : ''}`}
          onClick={() => setActiveTab('preview')}
        >
          📊 Önizleme
        </button>
        <button 
          className={`gv-tab ${activeTab === 'grid' ? 'active' : ''}`}
          onClick={() => setActiveTab('grid')}
        >
          📅 Program Grid
        </button>
        <button 
          className={`gv-tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          📜 Geçmiş
        </button>
      </div>
      
      {/* Preview Tab */}
      {activeTab === 'preview' && (
        <div className="gv-card">
          <div className="gv-card-body">
            {!previewResult ? (
              <div style={{ textAlign: 'center', padding: '48px', color: '#6b7280' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔍</div>
                <h3>Önizleme Çalıştırın</h3>
                <p>Yukarıdaki parametreleri seçip &quot;Önizleme&quot; butonuna tıklayın.</p>
                <p style={{ fontSize: '14px', marginTop: '16px' }}>
                  Motor şunları yapar:
                </p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', marginTop: '16px', flexWrap: 'wrap' }}>
                  <div style={{ backgroundColor: '#f9fafb', padding: '16px', borderRadius: '8px', minWidth: '150px' }}>
                    <div style={{ fontSize: '24px' }}>📋</div>
                    <strong>Job List</strong>
                    <p style={{ fontSize: '12px', color: '#6b7280', margin: '4px 0 0 0' }}>Ders planlarından job üretir</p>
                  </div>
                  <div style={{ backgroundColor: '#f9fafb', padding: '16px', borderRadius: '8px', minWidth: '150px' }}>
                    <div style={{ fontSize: '24px' }}>🎯</div>
                    <strong>Constraint</strong>
                    <p style={{ fontSize: '12px', color: '#6b7280', margin: '4px 0 0 0' }}>Çakışma kontrolü yapar</p>
                  </div>
                  <div style={{ backgroundColor: '#f9fafb', padding: '16px', borderRadius: '8px', minWidth: '150px' }}>
                    <div style={{ fontSize: '24px' }}>👨‍🏫</div>
                    <strong>Öğretmen</strong>
                    <p style={{ fontSize: '12px', color: '#6b7280', margin: '4px 0 0 0' }}>Havuzdan seçim yapar</p>
                  </div>
                  <div style={{ backgroundColor: '#f9fafb', padding: '16px', borderRadius: '8px', minWidth: '150px' }}>
                    <div style={{ fontSize: '24px' }}>📐</div>
                    <strong>Double Block</strong>
                    <p style={{ fontSize: '12px', color: '#6b7280', margin: '4px 0 0 0' }}>Ardışık slot bulur</p>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                {/* Summary */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                  <div style={{ backgroundColor: '#f0fdf4', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#166534' }}>{previewResult.placed_jobs}</div>
                    <div style={{ fontSize: '14px', color: '#166534' }}>Yerleşen</div>
                  </div>
                  <div style={{ backgroundColor: '#fef2f2', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#991b1b' }}>{previewResult.failed_jobs}</div>
                    <div style={{ fontSize: '14px', color: '#991b1b' }}>Başarısız</div>
                  </div>
                  <div style={{ backgroundColor: '#f0f9ff', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#0369a1' }}>{previewResult.total_jobs}</div>
                    <div style={{ fontSize: '14px', color: '#0369a1' }}>Toplam</div>
                  </div>
                  <div style={{ backgroundColor: '#faf5ff', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#7c3aed' }}>%{previewResult.success_rate}</div>
                    <div style={{ fontSize: '14px', color: '#7c3aed' }}>Başarı</div>
                  </div>
                </div>
                
                {/* Failed List */}
                {previewResult.failed.length > 0 && (
                  <div style={{ marginBottom: '24px' }}>
                    <h4 style={{ marginBottom: '12px', color: '#991b1b' }}>❌ Başarısız Dersler</h4>
                    <div className="gv-table-wrapper">
                      <table className="gv-table">
                        <thead>
                          <tr>
                            <th>Ders</th>
                            <th>Sınıf</th>
                            <th>Neden</th>
                            <th>Çift Blok</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewResult.failed.map((item, idx) => (
                            <tr key={idx}>
                              <td>{item.lesson}</td>
                              <td>{item.classroom}</td>
                              <td style={{ color: '#991b1b' }}>{item.reason}</td>
                              <td>{item.double_block ? '✅' : ''}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                
                {/* Placed List */}
                {previewResult.placed.length > 0 && (
                  <div>
                    <h4 style={{ marginBottom: '12px', color: '#166534' }}>✅ Yerleşen Dersler ({previewResult.placed.length})</h4>
                    <div className="gv-table-wrapper" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                      <table className="gv-table">
                        <thead>
                          <tr>
                            <th>Ders</th>
                            <th>Sınıf</th>
                            <th>Gün</th>
                            <th>Slot</th>
                            <th>Çift Blok</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewResult.placed.slice(0, 50).map((item, idx) => (
                            <tr key={idx}>
                              <td>{item.lesson}</td>
                              <td>{item.classroom}</td>
                              <td>{item.day_id}</td>
                              <td>{item.slots ? item.slots.join('-') : item.slot_id}</td>
                              <td>{item.double_block ? '✅' : ''}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {previewResult.placed.length > 50 && (
                      <p style={{ textAlign: 'center', color: '#6b7280', marginTop: '8px' }}>
                        ... ve {previewResult.placed.length - 50} ders daha
                      </p>
                    )}
                  </div>
                )}
                
                {/* Warnings */}
                {previewResult.warnings.length > 0 && (
                  <div style={{ marginTop: '24px', padding: '16px', backgroundColor: '#fef3c7', borderRadius: '8px' }}>
                    <h4 style={{ marginBottom: '8px', color: '#92400e' }}>⚠️ Uyarılar</h4>
                    <ul style={{ margin: 0, paddingLeft: '20px', color: '#92400e' }}>
                      {previewResult.warnings.map((w, idx) => (
                        <li key={idx}>{w.message}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Grid Tab */}
      {activeTab === 'grid' && (
        <div className="gv-card">
          <div className="gv-card-body">
            {(!selectedTemplate || !selectedCycle) ? (
              <div style={{ textAlign: 'center', padding: '48px', color: '#6b7280' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📅</div>
                <h3>Şablon ve Döngü Seçin</h3>
                <p>Grid&apos;i görüntülemek için yukarıdan zaman şablonu ve haftalık döngü seçin.</p>
              </div>
            ) : weeklyDays.length === 0 || timeSlots.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px', color: '#6b7280' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
                <h3>Grid Verisi Bulunamadı</h3>
                <p>Seçili şablon ve döngü için günler veya slotlar tanımlanmamış.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="gv-table" style={{ minWidth: '800px' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '100px' }}>Saat</th>
                      {weeklyDays.map(day => (
                        <th key={day.id} style={{ textAlign: 'center' }}>{day.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {timeSlots.map(slot => (
                      <tr key={slot.id}>
                        <td style={{ fontWeight: 500, fontSize: '12px' }}>
                          {slot.start_time?.substring(0, 5)} - {slot.end_time?.substring(0, 5)}
                        </td>
                        {weeklyDays.map(day => {
                          const cell = getGridCell(day.id, slot.id);
                          return (
                            <td 
                              key={`${day.id}-${slot.id}`} 
                              style={{ 
                                backgroundColor: cell ? getCellColor(cell.status) : '#f9fafb',
                                textAlign: 'center',
                                padding: '8px',
                                border: '1px solid #e5e7eb',
                                minHeight: '60px',
                                verticalAlign: 'middle'
                              }}
                            >
                              {cell?.status === 'FILLED' && cell.ders_ad ? (
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: '12px' }}>{cell.ders_ad}</div>
                                  {cell.ogretmen_ad && (
                                    <div style={{ fontSize: '10px', color: '#6b7280' }}>{cell.ogretmen_ad}</div>
                                  )}
                                  {cell.is_double_block_start && (
                                    <span style={{ fontSize: '10px', backgroundColor: '#dbeafe', padding: '2px 6px', borderRadius: '4px' }}>2x</span>
                                  )}
                                </div>
                              ) : cell?.status === 'LOCKED' ? (
                                <span style={{ fontSize: '16px' }}>🔒</span>
                              ) : (
                                <span style={{ color: '#d1d5db' }}>-</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                
                {/* Legend */}
                <div style={{ marginTop: '16px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '20px', height: '20px', backgroundColor: '#dcfce7', border: '1px solid #86efac', borderRadius: '4px' }}></div>
                    <span style={{ fontSize: '12px' }}>Dolu</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '20px', height: '20px', backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '4px' }}></div>
                    <span style={{ fontSize: '12px' }}>Boş</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '20px', height: '20px', backgroundColor: '#fee2e2', border: '1px solid #fecaca', borderRadius: '4px' }}></div>
                    <span style={{ fontSize: '12px' }}>Kilitli</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '20px', height: '20px', backgroundColor: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '4px' }}></div>
                    <span style={{ fontSize: '12px' }}>Tatil</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="gv-card">
          <div className="gv-card-body">
            {runs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px', color: '#6b7280' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📜</div>
                <h3>Çalıştırma Geçmişi Yok</h3>
                <p>Henüz motor çalıştırılmamış.</p>
              </div>
            ) : (
              <div className="gv-table-wrapper">
                <table className="gv-table">
                  <thead>
                    <tr>
                      <th>Tarih</th>
                      <th>Dönem</th>
                      <th>Sınıf</th>
                      <th>Tip</th>
                      <th>Durum</th>
                      <th>Yerleşen</th>
                      <th>Başarısız</th>
                      <th>Başarı %</th>
                      <th>Süre</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map(run => {
                      const statusColor = getStatusColor(run.status);
                      return (
                        <tr key={run.id}>
                          <td style={{ fontSize: '12px' }}>
                            {new Date(run.created_at).toLocaleString('tr-TR')}
                          </td>
                          <td>{run.term_name}</td>
                          <td>{run.sinif_name}</td>
                          <td>
                            <span style={{ 
                              padding: '4px 8px', 
                              borderRadius: '4px', 
                              fontSize: '11px',
                              backgroundColor: run.run_type === 'EXECUTE' ? '#dbeafe' : '#f3f4f6',
                              color: run.run_type === 'EXECUTE' ? '#1e40af' : '#374151'
                            }}>
                              {run.run_type_display}
                            </span>
                          </td>
                          <td>
                            <span style={{ 
                              padding: '4px 8px', 
                              borderRadius: '4px', 
                              fontSize: '11px',
                              backgroundColor: statusColor.bg,
                              color: statusColor.text
                            }}>
                              {run.status_display}
                            </span>
                          </td>
                          <td style={{ color: '#166534', fontWeight: 500 }}>{run.placed_jobs}</td>
                          <td style={{ color: run.failed_jobs > 0 ? '#991b1b' : '#6b7280', fontWeight: 500 }}>{run.failed_jobs}</td>
                          <td style={{ fontWeight: 500 }}>%{run.success_rate}</td>
                          <td style={{ fontSize: '12px', color: '#6b7280' }}>
                            {run.duration_seconds ? `${run.duration_seconds.toFixed(2)}s` : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
