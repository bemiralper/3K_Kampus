"use client";

import { useState, useEffect, useCallback } from "react";
import { getContextHeaders } from "@/lib/api";

// ====================
// TYPES
// ====================

interface ScheduleTemplate {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
  kurum: number;
  kurum_name: string;
  sube: number | null;
  sube_name: string | null;
  timeslot_count: number;
  created_at: string;
  updated_at: string;
}

interface WeeklyCycle {
  id: number;
  schedule_template: number;
  template_name: string;
  name: string;
  description: string;
  is_active: boolean;
  active_day_count: number;
  days: WeeklyDay[];
  created_at: string;
  updated_at: string;
}

interface WeeklyDay {
  id: number;
  weekly_cycle: number;
  day_of_week: number;
  day_of_week_display: string;
  name: string;
  order: number;
  is_active: boolean;
  day_name_short: string;
  is_weekend: boolean;
  created_at: string;
  updated_at: string;
}

interface GridPreviewCell {
  weekly_day_id: number;
  weekly_day_name: string;
  day_of_week: number;
  timeslot_id: number;
  timeslot_name: string;
  start_time: string;
  end_time: string;
  order: number;
}

interface GridPreview {
  schedule_template_id: number;
  schedule_template_name: string;
  weekly_cycle_id: number;
  weekly_cycle_name: string;
  total_days: number;
  total_slots: number;
  total_cells: number;
  cells: GridPreviewCell[];
}

interface Toast {
  id: number;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

function apiFetch(path: string, init?: RequestInit) {
  return fetch(`${BACKEND_URL}${path}`, {
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

async function fetchTemplates(): Promise<ScheduleTemplate[]> {
  const res = await apiFetch(`/api/academic/schedule-templates/`, {
    credentials: 'include',
  });
  const data = await res.json();
  if (data.success) return data.data;
  throw new Error(data.error || "Şablonlar yüklenemedi");
}

async function fetchWeeklyCycles(templateId: number): Promise<WeeklyCycle[]> {
  const res = await apiFetch(`/api/academic/weekly-cycles/?schedule_template_id=${templateId}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error("Haftalık döngüler yüklenemedi");
  return res.json();
}

async function fetchWeeklyCycleDetail(cycleId: number): Promise<WeeklyCycle> {
  const res = await apiFetch(`/api/academic/weekly-cycles/${cycleId}/`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error("Haftalık döngü detayı yüklenemedi");
  return res.json();
}

async function createWeeklyCycle(data: {
  schedule_template: number;
  name: string;
  description?: string;
  create_default_days?: boolean;
}): Promise<WeeklyCycle> {
  const res = await apiFetch(`/api/academic/weekly-cycles/create/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.name?.[0] || error.detail || "Haftalık döngü oluşturulamadı");
  }
  return res.json();
}

async function updateWeeklyCycle(cycleId: number, data: Partial<WeeklyCycle>): Promise<WeeklyCycle> {
  const res = await apiFetch(`/api/academic/weekly-cycles/${cycleId}/update/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || "Haftalık döngü güncellenemedi");
  }
  return res.json();
}

async function deleteWeeklyCycle(cycleId: number): Promise<void> {
  const res = await apiFetch(`/api/academic/weekly-cycles/${cycleId}/delete/`, {
    method: "DELETE",
    credentials: 'include',
  });
  if (!res.ok) throw new Error("Haftalık döngü silinemedi");
}

async function updateWeeklyDay(dayId: number, data: Partial<WeeklyDay>): Promise<WeeklyDay> {
  const res = await apiFetch(`/api/academic/weekly-days/${dayId}/update/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Gün güncellenemedi");
  return res.json();
}

async function fetchGridPreview(templateId: number, cycleId: number): Promise<GridPreview> {
  const res = await apiFetch(`/api/academic/program-grid/generate-preview/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: 'include',
    body: JSON.stringify({ schedule_template_id: templateId, weekly_cycle_id: cycleId }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || "Grid önizlemesi alınamadı");
  }
  return res.json();
}

async function generateGrid(templateId: number, cycleId: number, overwrite: boolean = false): Promise<{ created_count: number; skipped_count: number; message: string }> {
  const res = await apiFetch(`/api/academic/program-grid/generate-create/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: 'include',
    body: JSON.stringify({ schedule_template_id: templateId, weekly_cycle_id: cycleId, overwrite_existing: overwrite }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || "Grid oluşturulamadı");
  }
  return res.json();
}

// ====================
// COMPONENT
// ====================

export default function HaftalikGunYapisiClient() {
  // State
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [weeklyCycles, setWeeklyCycles] = useState<WeeklyCycle[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<WeeklyCycle | null>(null);
  const [gridPreview, setGridPreview] = useState<GridPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  
  // Drawer states
  const [cycleDrawerOpen, setCycleDrawerOpen] = useState(false);
  const [editingCycle, setEditingCycle] = useState<WeeklyCycle | null>(null);
  const [cycleForm, setCycleForm] = useState({ name: '', description: '', create_default_days: true });
  
  // Toast helpers
  const addToast = useCallback((type: Toast['type'], title: string, message: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, title, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);
  
  // Load templates on mount
  useEffect(() => {
    fetchTemplates()
      .then(data => {
        setTemplates(data);
        if (data.length > 0) {
          setSelectedTemplateId(data[0].id);
        }
      })
      .catch(err => addToast('error', 'Hata', err.message));
  }, [addToast]);
  
  // Load weekly cycles when template changes
  useEffect(() => {
    if (selectedTemplateId) {
      setLoading(true);
      fetchWeeklyCycles(selectedTemplateId)
        .then(data => {
          setWeeklyCycles(data);
          setSelectedCycle(null);
          setGridPreview(null);
        })
        .catch(err => addToast('error', 'Hata', err.message))
        .finally(() => setLoading(false));
    }
  }, [selectedTemplateId, addToast]);
  
  // Load cycle detail when selected
  const loadCycleDetail = useCallback(async (cycleId: number) => {
    try {
      const detail = await fetchWeeklyCycleDetail(cycleId);
      setSelectedCycle(detail);
    } catch (err: unknown) {
      addToast('error', 'Hata', err instanceof Error ? err.message : 'Bilinmeyen hata');
    }
  }, [addToast]);
  
  // Load grid preview
  const loadGridPreview = useCallback(async () => {
    if (!selectedCycle || !selectedTemplateId) return;
    try {
      setLoading(true);
      const preview = await fetchGridPreview(selectedTemplateId, selectedCycle.id);
      setGridPreview(preview);
    } catch (err: unknown) {
      addToast('error', 'Hata', err instanceof Error ? err.message : 'Bilinmeyen hata');
    } finally {
      setLoading(false);
    }
  }, [selectedCycle, selectedTemplateId, addToast]);
  
  // Handle create/update cycle
  const handleSaveCycle = async () => {
    if (!selectedTemplateId || !cycleForm.name.trim()) {
      addToast('warning', 'Uyarı', 'Döngü adı zorunludur');
      return;
    }
    
    try {
      setLoading(true);
      if (editingCycle) {
        await updateWeeklyCycle(editingCycle.id, {
          name: cycleForm.name,
          description: cycleForm.description,
        });
        addToast('success', 'Başarılı', 'Haftalık döngü güncellendi');
      } else {
        await createWeeklyCycle({
          schedule_template: selectedTemplateId,
          name: cycleForm.name,
          description: cycleForm.description,
          create_default_days: cycleForm.create_default_days,
        });
        addToast('success', 'Başarılı', 'Haftalık döngü oluşturuldu');
      }
      
      // Refresh list
      const cycles = await fetchWeeklyCycles(selectedTemplateId);
      setWeeklyCycles(cycles);
      setCycleDrawerOpen(false);
      setEditingCycle(null);
      setCycleForm({ name: '', description: '', create_default_days: true });
    } catch (err: unknown) {
      addToast('error', 'Hata', err instanceof Error ? err.message : 'Bilinmeyen hata');
    } finally {
      setLoading(false);
    }
  };
  
  // Handle delete cycle
  const handleDeleteCycle = async (cycleId: number) => {
    if (!confirm('Bu haftalık döngüyü silmek istediğinizden emin misiniz?')) return;
    
    try {
      await deleteWeeklyCycle(cycleId);
      addToast('success', 'Başarılı', 'Haftalık döngü silindi');
      if (selectedTemplateId) {
        const cycles = await fetchWeeklyCycles(selectedTemplateId);
        setWeeklyCycles(cycles);
        if (selectedCycle?.id === cycleId) {
          setSelectedCycle(null);
          setGridPreview(null);
        }
      }
    } catch (err: unknown) {
      addToast('error', 'Hata', err instanceof Error ? err.message : 'Bilinmeyen hata');
    }
  };
  
  // Handle day toggle
  const handleToggleDay = async (day: WeeklyDay) => {
    try {
      await updateWeeklyDay(day.id, { is_active: !day.is_active });
      if (selectedCycle) {
        await loadCycleDetail(selectedCycle.id);
      }
      addToast('success', 'Başarılı', `${day.name} ${!day.is_active ? 'aktif edildi' : 'pasif edildi'}`);
    } catch (err: unknown) {
      addToast('error', 'Hata', err instanceof Error ? err.message : 'Bilinmeyen hata');
    }
  };
  
  // Handle generate grid
  const handleGenerateGrid = async (overwrite: boolean = false) => {
    if (!selectedCycle || !selectedTemplateId) return;
    
    try {
      setLoading(true);
      const result = await generateGrid(selectedTemplateId, selectedCycle.id, overwrite);
      addToast('success', 'Başarılı', result.message);
      setGridPreview(null);
    } catch (err: unknown) {
      addToast('error', 'Hata', err instanceof Error ? err.message : 'Bilinmeyen hata');
    } finally {
      setLoading(false);
    }
  };
  
  // Open edit drawer
  const openEditCycle = (cycle: WeeklyCycle) => {
    setEditingCycle(cycle);
    setCycleForm({
      name: cycle.name,
      description: cycle.description || '',
      create_default_days: false,
    });
    setCycleDrawerOpen(true);
  };
  
  // Open new drawer
  const openNewCycle = () => {
    setEditingCycle(null);
    setCycleForm({ name: '', description: '', create_default_days: true });
    setCycleDrawerOpen(true);
  };

  // Styles
  const styles = {
    container: { padding: 0 },
    header: {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24,
    },
    title: {
      fontSize: 24, fontWeight: 600, color: '#111827', margin: 0,
      display: 'flex', alignItems: 'center', gap: 12,
    },
    badge: {
      backgroundColor: '#dcfce7', color: '#16a34a',
      padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500,
    },
    topBar: {
      display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' as const,
    },
    select: {
      padding: '10px 16px', borderRadius: 8, border: '1px solid #d1d5db',
      fontSize: 14, minWidth: 200, backgroundColor: '#fff',
    },
    btn: {
      padding: '10px 20px', borderRadius: 8, border: 'none',
      fontSize: 14, fontWeight: 500, cursor: 'pointer',
      display: 'flex', alignItems: 'center', gap: 8,
    },
    btnPrimary: { backgroundColor: '#3b82f6', color: '#fff' },
    btnSecondary: { backgroundColor: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db' },
    btnSuccess: { backgroundColor: '#16a34a', color: '#fff' },
    btnDanger: { backgroundColor: '#dc2626', color: '#fff' },
    card: {
      backgroundColor: '#fff', borderRadius: 12, border: '1px solid #e5e7eb',
      overflow: 'hidden', marginBottom: 16,
    },
    cardHeader: {
      padding: '16px 20px', borderBottom: '1px solid #e5e7eb',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    },
    cardTitle: { fontSize: 16, fontWeight: 600, color: '#111827', margin: 0 },
    cardBody: { padding: 20 },
    cycleList: { display: 'flex', flexDirection: 'column' as const, gap: 8 },
    cycleItem: {
      padding: '12px 16px', borderRadius: 8, border: '1px solid #e5e7eb',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      cursor: 'pointer', transition: 'all 0.2s',
    },
    cycleItemActive: { borderColor: '#3b82f6', backgroundColor: '#eff6ff' },
    dayGrid: { display: 'flex', gap: 8, flexWrap: 'wrap' as const },
    dayChip: {
      padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e7eb',
      cursor: 'pointer', transition: 'all 0.2s', textAlign: 'center' as const,
    },
    dayChipActive: { backgroundColor: '#dcfce7', borderColor: '#16a34a', color: '#16a34a' },
    dayChipInactive: { backgroundColor: '#f3f4f6', color: '#9ca3af' },
    gridPreviewTable: {
      width: '100%', borderCollapse: 'collapse' as const,
    },
    gridTh: {
      padding: '12px 16px', backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb',
      textAlign: 'left' as const, fontSize: 13, fontWeight: 600, color: '#374151',
    },
    gridTd: {
      padding: '10px 16px', borderBottom: '1px solid #e5e7eb', fontSize: 13, color: '#6b7280',
    },
    drawer: {
      position: 'fixed' as const, top: 0, right: 0, height: '100vh', width: 400,
      backgroundColor: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.1)',
      transform: 'translateX(100%)', transition: 'transform 0.3s ease',
      zIndex: 1000, display: 'flex', flexDirection: 'column' as const,
    },
    drawerOpen: { transform: 'translateX(0)' },
    drawerHeader: {
      padding: '20px 24px', borderBottom: '1px solid #e5e7eb',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    },
    drawerTitle: { fontSize: 18, fontWeight: 600, color: '#111827', margin: 0 },
    drawerBody: { padding: 24, flex: 1, overflowY: 'auto' as const },
    drawerFooter: {
      padding: '16px 24px', borderTop: '1px solid #e5e7eb',
      display: 'flex', gap: 12, justifyContent: 'flex-end',
    },
    overlay: {
      position: 'fixed' as const, inset: 0, backgroundColor: 'rgba(0,0,0,0.3)',
      zIndex: 999, opacity: 0, visibility: 'hidden' as const, transition: 'all 0.3s',
    },
    overlayVisible: { opacity: 1, visibility: 'visible' as const },
    formGroup: { marginBottom: 16 },
    label: { display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 500, color: '#374151' },
    input: {
      width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #d1d5db',
      fontSize: 14, boxSizing: 'border-box' as const,
    },
    textarea: {
      width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #d1d5db',
      fontSize: 14, minHeight: 80, resize: 'vertical' as const, boxSizing: 'border-box' as const,
    },
    checkbox: {
      display: 'flex', alignItems: 'center', gap: 8,
    },
    toast: {
      position: 'fixed' as const, bottom: 24, right: 24, zIndex: 2000,
      display: 'flex', flexDirection: 'column' as const, gap: 8,
    },
    toastItem: {
      padding: '12px 20px', borderRadius: 8, color: '#fff',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)', animation: 'slideIn 0.3s ease',
    },
    emptyState: {
      textAlign: 'center' as const, padding: '48px 16px', color: '#6b7280',
    },
  };

  const toastColors = {
    success: '#16a34a',
    error: '#dc2626',
    warning: '#f59e0b',
    info: '#3b82f6',
  };

  return (
    <div style={styles.container}>
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
            <h1>Haftalık Gün Yapısı</h1>
            <div className="hero-breadcrumb">
              <a href="/dashboard">Ana Sayfa</a>
              <span>/</span>
              <span>Akademik Planlama</span>
              <span>/</span>
              <span>Haftalık Gün Yapısı</span>
            </div>
          </div>
        </div>
        <button 
          className="btn-hero" 
          onClick={openNewCycle}
          disabled={!selectedTemplateId}
          style={{ opacity: selectedTemplateId ? 1 : 0.5 }}
        >
          <span className="btn-hero-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </span>
          <span>Yeni Hafta</span>
        </button>
      </div>
      
      {/* Top Bar */}
      <div style={styles.topBar}>
        <select
          style={styles.select}
          value={selectedTemplateId || ''}
          onChange={e => setSelectedTemplateId(Number(e.target.value) || null)}
        >
          <option value="">Şablon Seçin</option>
          {templates.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        
        {selectedCycle && (
          <select
            style={styles.select}
            value={selectedCycle.id}
            onChange={e => loadCycleDetail(Number(e.target.value))}
          >
            {weeklyCycles.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
        
        {selectedCycle && (
          <button
            style={{ ...styles.btn, ...styles.btnSuccess }}
            onClick={loadGridPreview}
            disabled={loading}
          >
            📊 Grid Önizle
          </button>
        )}
      </div>
      
      {/* Main Content */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Left: Cycle List */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <h2 style={styles.cardTitle}>Haftalık Döngüler</h2>
          </div>
          <div style={styles.cardBody}>
            {weeklyCycles.length === 0 ? (
              <div style={styles.emptyState}>
                <p>Henüz haftalık döngü bulunmuyor.</p>
                <p style={{ fontSize: 13, color: '#9ca3af' }}>
                  {selectedTemplateId 
                    ? "Yeni Hafta butonuna tıklayarak başlayın."
                    : "Önce bir şablon seçin."}
                </p>
              </div>
            ) : (
              <div style={styles.cycleList}>
                {weeklyCycles.map(cycle => (
                  <div
                    key={cycle.id}
                    style={{
                      ...styles.cycleItem,
                      ...(selectedCycle?.id === cycle.id ? styles.cycleItemActive : {}),
                    }}
                    onClick={() => loadCycleDetail(cycle.id)}
                  >
                    <div>
                      <div style={{ fontWeight: 500, color: '#111827' }}>{cycle.name}</div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>
                        {cycle.active_day_count} aktif gün
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        style={{ ...styles.btn, ...styles.btnSecondary, padding: '6px 12px', fontSize: 12 }}
                        onClick={e => { e.stopPropagation(); openEditCycle(cycle); }}
                      >
                        ✏️
                      </button>
                      <button
                        style={{ ...styles.btn, ...styles.btnDanger, padding: '6px 12px', fontSize: 12 }}
                        onClick={e => { e.stopPropagation(); handleDeleteCycle(cycle.id); }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        
        {/* Right: Day Editor */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <h2 style={styles.cardTitle}>
              {selectedCycle ? `${selectedCycle.name} - Günler` : 'Gün Editörü'}
            </h2>
          </div>
          <div style={styles.cardBody}>
            {selectedCycle ? (
              <div style={styles.dayGrid}>
                {selectedCycle.days?.map(day => (
                  <div
                    key={day.id}
                    style={{
                      ...styles.dayChip,
                      ...(day.is_active ? styles.dayChipActive : styles.dayChipInactive),
                    }}
                    onClick={() => handleToggleDay(day)}
                  >
                    <div style={{ fontWeight: 500 }}>{day.name}</div>
                    <div style={{ fontSize: 11 }}>
                      {day.is_active ? '✓ Aktif' : '✗ Pasif'}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={styles.emptyState}>
                <p>Gün düzenlemek için bir haftalık döngü seçin.</p>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Grid Preview */}
      {gridPreview && (
        <div style={{ ...styles.card, marginTop: 24 }}>
          <div style={styles.cardHeader}>
            <h2 style={styles.cardTitle}>
              Grid Önizleme - {gridPreview.weekly_cycle_name}
            </h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ fontSize: 13, color: '#6b7280' }}>
                {gridPreview.total_days} gün × {gridPreview.total_slots} slot = {gridPreview.total_cells} hücre
              </span>
              <button
                style={{ ...styles.btn, ...styles.btnSuccess, padding: '6px 16px', fontSize: 13 }}
                onClick={() => handleGenerateGrid(false)}
                disabled={loading}
              >
                ✓ Grid Oluştur
              </button>
              <button
                style={{ ...styles.btn, ...styles.btnDanger, padding: '6px 16px', fontSize: 13 }}
                onClick={() => handleGenerateGrid(true)}
                disabled={loading}
              >
                ↻ Yeniden Oluştur
              </button>
            </div>
          </div>
          <div style={styles.cardBody}>
            {gridPreview.cells.length > 0 ? (
              <table style={styles.gridPreviewTable}>
                <thead>
                  <tr>
                    <th style={styles.gridTh}>Gün</th>
                    <th style={styles.gridTh}>Slot</th>
                    <th style={styles.gridTh}>Saat</th>
                  </tr>
                </thead>
                <tbody>
                  {gridPreview.cells.slice(0, 20).map((cell, idx) => (
                    <tr key={idx}>
                      <td style={styles.gridTd}>{cell.weekly_day_name}</td>
                      <td style={styles.gridTd}>{cell.timeslot_name}</td>
                      <td style={styles.gridTd}>{cell.start_time} - {cell.end_time}</td>
                    </tr>
                  ))}
                  {gridPreview.cells.length > 20 && (
                    <tr>
                      <td colSpan={3} style={{ ...styles.gridTd, textAlign: 'center', fontStyle: 'italic' }}>
                        ... ve {gridPreview.cells.length - 20} hücre daha
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <div style={styles.emptyState}>
                <p>Grid önizlemesi boş. Aktif gün ve ders slotu olduğundan emin olun.</p>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Drawer Overlay */}
      <div
        style={{
          ...styles.overlay,
          ...(cycleDrawerOpen ? styles.overlayVisible : {}),
        }}
        onClick={() => setCycleDrawerOpen(false)}
      />
      
      {/* Cycle Drawer */}
      <div style={{ ...styles.drawer, ...(cycleDrawerOpen ? styles.drawerOpen : {}) }}>
        <div style={styles.drawerHeader}>
          <h3 style={styles.drawerTitle}>
            {editingCycle ? 'Haftalık Döngü Düzenle' : 'Yeni Haftalık Döngü'}
          </h3>
          <button
            style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#6b7280' }}
            onClick={() => setCycleDrawerOpen(false)}
          >
            ×
          </button>
        </div>
        
        <div style={styles.drawerBody}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Döngü Adı *</label>
            <input
              type="text"
              style={styles.input}
              value={cycleForm.name}
              onChange={e => setCycleForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Örn: Standart Hafta, A Haftası"
            />
          </div>
          
          <div style={styles.formGroup}>
            <label style={styles.label}>Açıklama</label>
            <textarea
              style={styles.textarea}
              value={cycleForm.description}
              onChange={e => setCycleForm(f => ({ ...f, description: e.target.value }))}
              placeholder="İsteğe bağlı açıklama..."
            />
          </div>
          
          {!editingCycle && (
            <div style={styles.formGroup}>
              <label style={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={cycleForm.create_default_days}
                  onChange={e => setCycleForm(f => ({ ...f, create_default_days: e.target.checked }))}
                />
                <span>Varsayılan günleri otomatik oluştur (Pzt-Paz)</span>
              </label>
              <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                İşaretlenirse 7 gün oluşturulur, hafta içi günler aktif olarak işaretlenir.
              </p>
            </div>
          )}
        </div>
        
        <div style={styles.drawerFooter}>
          <button
            style={{ ...styles.btn, ...styles.btnSecondary }}
            onClick={() => setCycleDrawerOpen(false)}
          >
            İptal
          </button>
          <button
            style={{ ...styles.btn, ...styles.btnPrimary }}
            onClick={handleSaveCycle}
            disabled={loading}
          >
            {loading ? 'Kaydediliyor...' : (editingCycle ? 'Güncelle' : 'Oluştur')}
          </button>
        </div>
      </div>
      
      {/* Toasts */}
      <div style={styles.toast}>
        {toasts.map(toast => (
          <div
            key={toast.id}
            style={{ ...styles.toastItem, backgroundColor: toastColors[toast.type] }}
          >
            <div style={{ fontWeight: 600 }}>{toast.title}</div>
            <div style={{ fontSize: 13 }}>{toast.message}</div>
          </div>
        ))}
      </div>
      
      {/* Loading overlay */}
      {loading && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(255,255,255,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000,
        }}>
          <div style={{
            padding: '20px 40px', backgroundColor: '#fff', borderRadius: 12,
            boxShadow: '0 4px 24px rgba(0,0,0,0.1)', fontSize: 16, fontWeight: 500,
          }}>
            Yükleniyor...
          </div>
        </div>
      )}
    </div>
  );
}
