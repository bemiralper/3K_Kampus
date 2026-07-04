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

interface Sinif {
  id: number;
  ad: string;
  kod?: string;
}

interface Ogretmen {
  id: number;
  ad: string;
  soyad: string;
}

interface Ogrenci {
  id: number;
  ad: string;
  soyad: string;
  sinif?: { id: number; ad: string };
}

interface ScheduleVersion {
  id: number;
  name: string;
  term_id: number;
  term_name?: string;
  is_active: boolean;
  is_locked: boolean;
  cell_count: number;
  filled_cell_count: number;
  completion_rate: number;
  created_at: string;
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

interface ScheduleCell {
  day_id: number;
  day_name: string;
  slot_id: number;
  slot_name: string;
  start_time: string;
  end_time: string;
  status: string;
  ders_id: number | null;
  ders_ad: string | null;
  ogretmen_id: number | null;
  ogretmen_ad: string | null;
  sinif_id: number | null;
  sinif_ad: string | null;
  is_double_block_start: boolean;
}

interface ScheduleData {
  entity_type: string;
  entity_id: number;
  entity_name: string;
  version_id: number;
  version_name: string;
  days: WeeklyDay[];
  slots: TimeSlot[];
  cells: ScheduleCell[];
}

type ViewType = "class" | "teacher" | "student" | "room" | "daily";

// ==================== COMPONENT ====================

export default function ProgramGoruntulemePage() {
  // Data states
  const [terms, setTerms] = useState<Term[]>([]);
  const [classrooms, setClassrooms] = useState<Sinif[]>([]);
  const [teachers, setTeachers] = useState<Ogretmen[]>([]);
  const [students, setStudents] = useState<Ogrenci[]>([]);
  const [versions, setVersions] = useState<ScheduleVersion[]>([]);
  const [scheduleData, setScheduleData] = useState<ScheduleData | null>(null);
  
  // Form states
  const [selectedTerm, setSelectedTerm] = useState<string>("");
  const [selectedVersion, setSelectedVersion] = useState<string>("");
  const [viewType, setViewType] = useState<ViewType>("class");
  const [selectedEntity, setSelectedEntity] = useState<string>("");
  
  // UI states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // ==================== DATA FETCHING ====================
  
  const fetchTerms = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/terms/`, {
        credentials: 'include',
        headers: getContextHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setTerms(data.terms || data.results || data.data || []);
      }
    } catch (err) {
      console.error("Dönemler yüklenirken hata:", err);
    }
  }, []);
  
  const fetchVersions = useCallback(async () => {
    if (!selectedTerm) {
      setVersions([]);
      return;
    }
    try {
      const res = await apiFetch(`/api/academic/schedule/versions/?term_id=${selectedTerm}`, {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setVersions(data.versions || data.results || []);
        // Aktif versiyonu otomatik seç
        const activeVersion = (data.versions || []).find((v: ScheduleVersion) => v.is_active);
        if (activeVersion) {
          setSelectedVersion(String(activeVersion.id));
        }
      }
    } catch (err) {
      console.error("Versiyonlar yüklenirken hata:", err);
    }
  }, [selectedTerm]);
  
  const fetchClassrooms = useCallback(async () => {
    try {
      const res = await apiFetch(`/siniflar/api/`, {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setClassrooms(data.siniflar || data.results || data.data || []);
      }
    } catch (err) {
      console.error("Sınıflar yüklenirken hata:", err);
    }
  }, []);
  
  const fetchTeachers = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/personel/`, {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setTeachers(data.personeller || data.results || data.data || []);
      }
    } catch (err) {
      console.error("Öğretmenler yüklenirken hata:", err);
    }
  }, []);
  
  const fetchStudents = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/ogrenciler/`, {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setStudents(data.ogrenciler || data.results || data.data || []);
      }
    } catch (err) {
      console.error("Öğrenciler yüklenirken hata:", err);
    }
  }, []);
  
  const fetchSchedule = useCallback(async () => {
    if (!selectedVersion || !selectedEntity) {
      setScheduleData(null);
      return;
    }
    
    setLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      let url = "";
      const params = new URLSearchParams({ version_id: selectedVersion });
      
      switch (viewType) {
        case "class":
          url = `${BACKEND_URL}/api/academic/schedule/class/${selectedEntity}/?${params}`;
          break;
        case "teacher":
          url = `${BACKEND_URL}/api/academic/schedule/teacher/${selectedEntity}/?${params}`;
          break;
        case "student":
          url = `${BACKEND_URL}/api/academic/schedule/student/${selectedEntity}/?${params}`;
          break;
        case "room":
          url = `${BACKEND_URL}/api/academic/schedule/room/${selectedEntity}/?${params}`;
          break;
        case "daily":
          url = `${BACKEND_URL}/api/academic/schedule/daily-flow/?${params}`;
          break;
      }
      
      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        setScheduleData(data);
        setSuccess("Program başarıyla yüklendi");
      } else {
        const errData = await res.json();
        setError(errData.error || "Program yüklenirken hata oluştu");
      }
    } catch (err) {
      setError("Sunucu bağlantı hatası");
      console.error("Program yüklenirken hata:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedVersion, selectedEntity, viewType]);
  
  // ==================== EFFECTS ====================
  
  useEffect(() => {
    fetchTerms();
    fetchClassrooms();
    fetchTeachers();
    fetchStudents();
  }, [fetchTerms, fetchClassrooms, fetchTeachers, fetchStudents]);
  
  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);
  
  useEffect(() => {
    setSelectedEntity("");
    setScheduleData(null);
  }, [viewType]);
  
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);
  
  // ==================== HELPERS ====================
  
  const getEntityOptions = () => {
    switch (viewType) {
      case "class":
        return classrooms.map(c => ({ id: c.id, label: c.ad }));
      case "teacher":
        return teachers.map(t => ({ id: t.id, label: `${t.ad} ${t.soyad}` }));
      case "student":
        return students.map(s => ({ id: s.id, label: `${s.ad} ${s.soyad}` }));
      case "room":
        return classrooms.map(c => ({ id: c.id, label: c.ad }));
      case "daily":
        return scheduleData?.days?.map(d => ({ id: d.id, label: d.name })) || [];
      default:
        return [];
    }
  };
  
  const getEntityLabel = () => {
    switch (viewType) {
      case "class": return "Sınıf";
      case "teacher": return "Öğretmen";
      case "student": return "Öğrenci";
      case "room": return "Derslik";
      case "daily": return "Gün";
    }
  };
  
  const getViewTypeLabel = (type: ViewType) => {
    switch (type) {
      case "class": return "Sınıf Programı";
      case "teacher": return "Öğretmen Programı";
      case "student": return "Öğrenci Programı";
      case "room": return "Derslik Programı";
      case "daily": return "Günlük Akış";
    }
  };
  
  const getCell = (dayId: number, slotId: number): ScheduleCell | null => {
    return scheduleData?.cells?.find(c => c.day_id === dayId && c.slot_id === slotId) || null;
  };
  
  const getCellClass = (cell: ScheduleCell | null) => {
    const base = "border border-gray-200 p-3 h-24 text-center";
    if (!cell || cell.status === "EMPTY") {
      return `${base} bg-gray-50 text-gray-400`;
    }
    if (cell.status === "BLOCKED") {
      return `${base} bg-gray-100 text-gray-400`;
    }
    return `${base} bg-white hover:bg-blue-50 transition-colors`;
  };
  
  // ==================== RENDER ====================
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Modern Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                <span className="text-white text-xl">📅</span>
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Program Görüntüleme</h1>
                <p className="text-gray-600 mt-1">Ders programlarını görüntüleyin ve inceleyin</p>
              </div>
            </div>
            <div className="hidden md:flex items-center space-x-2 text-sm">
              <span className="text-gray-500">Akademik Planlama</span>
              <span className="text-gray-300">/</span>
              <span className="font-medium text-gray-700 bg-gray-100 px-3 py-1 rounded-full">
                Program Görüntüleme
              </span>
            </div>
          </div>
        </div>
      </div>
      
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Mesajlar */}
        {(error || success) && (
          <div className="mb-6">
            {error && (
              <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-lg shadow-sm">
                <div className="flex items-center">
                  <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center mr-3">
                    <span className="text-red-600">✕</span>
                  </div>
                  <div className="flex-1">
                    <h4 className="text-red-800 font-semibold">Hata Oluştu</h4>
                    <p className="text-red-700 mt-1">{error}</p>
                  </div>
                  <button
                    onClick={() => setError(null)}
                    className="text-red-400 hover:text-red-600 transition-colors p-1"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
            {success && (
              <div className="bg-green-50 border-l-4 border-green-400 p-4 rounded-lg shadow-sm">
                <div className="flex items-center">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center mr-3">
                    <span className="text-green-600">✓</span>
                  </div>
                  <div className="flex-1">
                    <h4 className="text-green-800 font-semibold">Başarılı</h4>
                    <p className="text-green-700 mt-1">{success}</p>
                  </div>
                  <button
                    onClick={() => setSuccess(null)}
                    className="text-green-400 hover:text-green-600 transition-colors p-1"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Filtre Kartı */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900 flex items-center">
              <span className="w-6 h-6 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                <span className="text-blue-600 text-sm">⚙️</span>
              </span>
              Program Seçimi
            </h2>
            <button
              onClick={() => {
                setError(null);
                setSuccess(null);
              }}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors px-3 py-1 rounded-lg hover:bg-gray-100"
            >
              Temizle
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-6">
            {/* Dönem */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                📚 Dönem <span className="text-red-500">*</span>
              </label>
              <select
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                value={selectedTerm}
                onChange={(e) => {
                  setSelectedTerm(e.target.value);
                  setSelectedVersion("");
                  setScheduleData(null);
                }}
              >
                <option value="">Dönem seçin</option>
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.egitim_yili ? `(${t.egitim_yili.display})` : ''}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Versiyon */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                📋 Versiyon <span className="text-red-500">*</span>
              </label>
              <select
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all disabled:bg-gray-100"
                value={selectedVersion}
                onChange={(e) => {
                  setSelectedVersion(e.target.value);
                  setScheduleData(null);
                }}
                disabled={!selectedTerm}
              >
                <option value="">Versiyon seçin</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} {v.is_active ? "✅" : ""} {v.is_locked ? "🔒" : ""}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Görünüm Tipi */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                👁️ Görünüm <span className="text-red-500">*</span>
              </label>
              <select
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                value={viewType}
                onChange={(e) => setViewType(e.target.value as ViewType)}
              >
                <option value="class">🏫 Sınıf Programı</option>
                <option value="teacher">👨‍🏫 Öğretmen Programı</option>
                <option value="student">🎓 Öğrenci Programı</option>
                <option value="room">🏢 Derslik Programı</option>
                <option value="daily">📋 Günlük Akış</option>
              </select>
            </div>
            
            {/* Entity Seçimi */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                {getEntityLabel()} <span className="text-red-500">*</span>
              </label>
              <select
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all disabled:bg-gray-100"
                value={selectedEntity}
                onChange={(e) => setSelectedEntity(e.target.value)}
                disabled={!selectedVersion}
              >
                <option value="">{getEntityLabel()} seçin</option>
                {getEntityOptions().map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            </div>
            
            {/* Göster Butonu */}
            <div className="flex items-end">
              <button
                onClick={fetchSchedule}
                disabled={loading || !selectedVersion || !selectedEntity}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3 rounded-lg font-semibold hover:from-blue-700 hover:to-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center shadow-lg"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Yükleniyor...
                  </>
                ) : (
                  <>
                    <span className="mr-2">🚀</span>
                    Programı Göster
                  </>
                )}
              </button>
            </div>
          </div>
          
          {/* View Type Quick Buttons */}
          <div className="flex flex-wrap gap-3 pt-4 border-t border-gray-200">
            <span className="text-sm text-gray-600 font-medium">Hızlı Erişim:</span>
            {(["class", "teacher", "student", "room", "daily"] as ViewType[]).map((type) => (
              <button
                key={type}
                onClick={() => setViewType(type)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  viewType === type
                    ? 'bg-blue-100 text-blue-700 border-2 border-blue-200 shadow-sm'
                    : 'bg-gray-100 text-gray-600 border-2 border-gray-200 hover:bg-gray-200 hover:border-gray-300'
                }`}
              >
                {getViewTypeLabel(type)}
              </button>
            ))}
          </div>
        </div>
        
        {/* Versiyon Bilgisi */}
        {selectedVersion && versions.length > 0 && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6 mb-8">
            {(() => {
              const ver = versions.find(v => v.id === Number(selectedVersion));
              if (!ver) return null;
              return (
                <div className="flex flex-wrap items-center gap-6">
                  <div className="flex items-center space-x-3">
                    <div className="w-4 h-4 bg-blue-500 rounded-full"></div>
                    <span className="font-semibold text-gray-800 text-lg">{ver.name}</span>
                  </div>
                  <div className="flex items-center space-x-2 text-gray-700 bg-white px-4 py-2 rounded-lg shadow-sm">
                    <span>📊</span>
                    <span>Doluluk: {ver.filled_cell_count}/{ver.cell_count}</span>
                    <span className="font-semibold text-blue-600">({ver.completion_rate}%)</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    {ver.is_active && (
                      <span className="bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm">
                        ✅ Aktif Versiyon
                      </span>
                    )}
                    {ver.is_locked && (
                      <span className="bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm">
                        🔒 Kilitli
                      </span>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
        
        {/* Program Tablosu */}
        {scheduleData && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            {/* Tablo Başlığı */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold">{getViewTypeLabel(viewType)}</h3>
                  <p className="text-blue-100 mt-2">
                    <span className="font-semibold">{scheduleData.entity_name}</span> • {scheduleData.version_name}
                  </p>
                </div>
                <div className="hidden md:flex items-center space-x-6 text-blue-100">
                  <div className="flex items-center space-x-2">
                    <span className="text-lg">📅</span>
                    <span className="font-semibold">{scheduleData.days?.length || 0} Gün</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-lg">⏰</span>
                    <span className="font-semibold">
                      {scheduleData.slots?.filter(s => s.slot_type === 'LESSON').length || 0} Ders Saati
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-lg">📋</span>
                    <span className="font-semibold">
                      {scheduleData.cells?.filter(c => c.status === 'FILLED').length || 0} Dolu Hücre
                    </span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Tablo */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="bg-gray-100 border-b border-gray-200">
                    <th className="sticky left-0 bg-gray-100 px-4 py-4 text-left font-bold text-gray-700 border-r border-gray-300 w-40">
                      <div className="flex items-center space-x-2">
                        <span>🕐</span>
                        <span>Zaman</span>
                      </div>
                    </th>
                    {scheduleData.days.map((day) => (
                      <th key={day.id} className="px-4 py-4 text-center font-bold text-gray-700 border-r border-gray-300 min-w-[160px]">
                        <div className="font-bold text-gray-800">{day.name}</div>
                        <div className="text-xs text-gray-500 mt-1 font-normal">{day.short_name}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scheduleData.slots
                    .filter(s => s.slot_type === 'LESSON')
                    .sort((a, b) => a.order - b.order)
                    .map((slot, index) => (
                      <tr key={slot.id} className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        <td className="sticky left-0 bg-gray-100 px-4 py-6 border-r border-gray-300">
                          <div className="text-sm font-bold text-gray-800 mb-1">{slot.name}</div>
                          <div className="text-xs text-gray-600 mb-2">
                            {slot.start_time?.slice(0, 5)} - {slot.end_time?.slice(0, 5)}
                          </div>
                          <div className="w-full bg-gray-300 rounded-full h-1">
                            <div className="bg-blue-500 h-1 rounded-full" style={{ width: '100%' }}></div>
                          </div>
                        </td>
                        {scheduleData.days.map((day) => {
                          const cell = getCell(day.id, slot.id);
                          return (
                            <td
                              key={`${day.id}-${slot.id}`}
                              className={getCellClass(cell)}
                            >
                              {cell && cell.status === "FILLED" && (
                                <div className="space-y-2">
                                  <div className="font-semibold text-sm text-gray-900 leading-tight">
                                    {cell.ders_ad || "-"}
                                  </div>
                                  {cell.ogretmen_ad && (
                                    <div className="text-xs text-blue-700 bg-blue-100 rounded-lg px-2 py-1 inline-block">
                                      👨‍🏫 {cell.ogretmen_ad}
                                    </div>
                                  )}
                                  {cell.sinif_ad && viewType !== "class" && (
                                    <div className="text-xs text-green-700 bg-green-100 rounded-lg px-2 py-1 inline-block mt-1">
                                      🏫 {cell.sinif_ad}
                                    </div>
                                  )}
                                  {cell.is_double_block_start && (
                                    <div className="text-xs text-orange-700 bg-orange-100 rounded-lg px-2 py-1 inline-block mt-1">
                                      ⏱️ İkili Blok
                                    </div>
                                  )}
                                </div>
                              )}
                              {cell && cell.status === "BLOCKED" && (
                                <div className="text-gray-400">
                                  <div className="text-lg mb-1">⚫</div>
                                  <div className="text-xs">Engelli</div>
                                </div>
                              )}
                              {(!cell || cell.status === "EMPTY") && (
                                <div className="text-gray-300">
                                  <div className="text-lg mb-1 opacity-50">◯</div>
                                  <div className="text-xs opacity-75">Boş</div>
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            
            {/* Tablo Footer */}
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center space-x-6 text-gray-700">
                  <span className="font-semibold">
                    📊 Toplam Slot: {scheduleData.slots?.filter(s => s.slot_type === 'LESSON').length * scheduleData.days.length}
                  </span>
                  <span className="text-green-600 font-semibold">
                    ✅ Dolu: {scheduleData.cells?.filter(c => c.status === 'FILLED').length}
                  </span>
                  <span className="text-gray-500">
                    ⚫ Boş: {scheduleData.cells?.filter(c => c.status === 'EMPTY').length}
                  </span>
                </div>
                <div className="text-gray-500 flex items-center space-x-1">
                  <span>🕐</span>
                  <span>Son güncelleme: {new Date().toLocaleDateString('tr-TR')}</span>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Boş Durum */}
        {!scheduleData && !loading && !error && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-16 text-center">
            <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="text-4xl text-gray-400">📅</span>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-3">Program Görüntüleme</h3>
            <p className="text-gray-600 mb-8 max-w-md mx-auto">
              Program görüntülemek için dönem, versiyon ve görünüm tipini seçerek başlayın
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-gray-500">
              <div className="flex items-center space-x-2 bg-gray-50 px-4 py-2 rounded-lg">
                <span>1️⃣</span>
                <span>Dönem seçin</span>
              </div>
              <span>→</span>
              <div className="flex items-center space-x-2 bg-gray-50 px-4 py-2 rounded-lg">
                <span>2️⃣</span>
                <span>Versiyon seçin</span>
              </div>
              <span>→</span>
              <div className="flex items-center space-x-2 bg-gray-50 px-4 py-2 rounded-lg">
                <span>3️⃣</span>
                <span>Entity seçin</span>
              </div>
              <span>→</span>
              <div className="flex items-center space-x-2 bg-blue-50 px-4 py-2 rounded-lg">
                <span>🚀</span>
                <span>Göster butonuna tıklayın</span>
              </div>
            </div>
          </div>
        )}
        
        {/* Yükleniyor */}
        {loading && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-16 text-center">
            <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600"></div>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-3">Program Yükleniyor</h3>
            <p className="text-gray-600 mb-8">
              Ders programı bilgileri getiriliyor, lütfen sabırla bekleyin...
            </p>
            <div className="w-80 mx-auto bg-gray-200 rounded-full h-3 overflow-hidden">
              <div className="bg-gradient-to-r from-blue-500 to-indigo-500 h-3 rounded-full animate-pulse transition-all duration-1000" style={{ width: '70%' }}></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
