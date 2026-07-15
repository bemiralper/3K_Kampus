"use client";

import { useState, useCallback, useEffect } from "react";
import { getContextHeaders, resolveApiUrl } from "@/lib/api";
import { useKurum } from "@/lib/contexts/KurumContext";
import OdalarSiniflarSection from "./OdalarSiniflarSection";
import { TermTabPage } from "./terms";

function ctxFetch(path: string, init?: RequestInit) {
  return fetch(resolveApiUrl(path), {
    credentials: "include",
    ...init,
    headers: {
      ...getContextHeaders(),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
}

type TabType = "sinif_seviyeleri" | "alanlar" | "dersler" | "branslar" | "odalar" | "siniflar" | "egitim_donemleri";

interface TanimItem {
  id: number;
  ad: string;
  kod: string;
  sira?: number;
  aktif_mi: boolean;
  kullanim_sayisi?: number;
}

interface TanimlarResponse {
  sinif_seviyeleri?: TanimItem[];
  alanlar?: TanimItem[];
  dersler?: TanimItem[];
  branslar?: TanimItem[];
}

interface EgitimTanimlariClientProps {
  initialData: TanimlarResponse;
}

export default function EgitimTanimlariClient({ initialData }: EgitimTanimlariClientProps) {
  const { activeSube } = useKurum();
  const [activeTab, setActiveTab] = useState<TabType>("sinif_seviyeleri");
  const [data, setData] = useState<TanimlarResponse>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Search state
  const [searchTerm, setSearchTerm] = useState("");
  
  // Drawer states
  const [showDrawer, setShowDrawer] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  
  // Delete modal states
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingItem, setDeletingItem] = useState<{
    id: number;
    ad: string;
    type: TabType;
    kullanim_sayisi: number;
  } | null>(null);

  // Form data
  const [formData, setFormData] = useState({
    ad: "",
    kod: "",
    sira: 0,
    aktif_mi: true,
  });

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await ctxFetch("/egitim-tanimlari/api/legacy/tanimlar/");
      const result = await response.json();
      if (result.success) {
        setData(result.data);
      } else {
        setError(result.error || "Veri yüklenemedi");
      }
    } catch (err) {
      setError("Veri yüklenirken hata oluştu");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeSube?.id) return;
    fetchData();
  }, [fetchData, activeSube?.id]);

  // Reset form
  const resetForm = () => {
    setFormData({
      ad: "",
      kod: "",
      sira: 0,
      aktif_mi: true,
    });
    setEditingId(null);
  };

  // Open drawer for create
  const handleOpenCreate = () => {
    resetForm();
    setDrawerMode("create");
    setShowDrawer(true);
  };

  // Get API endpoint by tab
  const getApiEndpoint = (tab: TabType, id?: number) => {
    const endpoints: Record<TabType, string> = {
      sinif_seviyeleri: "sinif-seviyesi",
      alanlar: "alan",
      dersler: "ders",
      branslar: "brans",
      odalar: "oda",
      siniflar: "sinif",
      egitim_donemleri: "term",
    };
    const base = `/egitim-tanimlari/api/${endpoints[tab]}/`;
    return id ? `${base}${id}/` : base;
  };

  // Open drawer for edit
  const handleOpenEdit = async (id: number) => {
    setDrawerMode("edit");
    setEditingId(id);
    
    try {
      const endpoint = getApiEndpoint(activeTab, id);
      const response = await ctxFetch(endpoint);
      const result = await response.json();
      
      if (result.success) {
        const item = result.data;
        setFormData({
          ad: item.ad || "",
          kod: item.kod || "",
          sira: item.sira ?? 0,
          aktif_mi: item.aktif_mi ?? true,
        });
        setShowDrawer(true);
      } else {
        setError(result.error || "Veri yüklenemedi");
      }
    } catch (err) {
      setError("Veri yüklenirken hata oluştu");
      console.error(err);
    }
  };

  // Save handler
  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const endpoint = drawerMode === "create" 
        ? getApiEndpoint(activeTab) 
        : getApiEndpoint(activeTab, editingId!);
      
      const response = await ctxFetch(endpoint, {
        method: drawerMode === "create" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (result.success) {
        setShowDrawer(false);
        resetForm();
        await fetchData();
      } else {
        setError(result.error || "Kayıt başarısız");
      }
    } catch (err) {
      setError("Kayıt sırasında hata oluştu");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  // Delete click handler - Backend'den kullanım bilgisi al
  const handleDeleteClick = async (id: number, ad: string, type: TabType) => {
    try {
      // Get delete info from backend
      const endpoint = getApiEndpoint(type, id);
      const response = await ctxFetch(`${endpoint}delete-info/`);
      const result = await response.json();
      
      let kullanim_sayisi = 0;
      if (result.success && result.data) {
        kullanim_sayisi = result.data.kullanim_sayisi || 0;
      }
      
      setDeletingItem({ id, ad, type, kullanim_sayisi });
      setShowDeleteConfirm(true);
    } catch (err) {
      console.error("Delete info alınamadı:", err);
      // Hata durumunda yine de silme dialogunu göster
      setDeletingItem({ id, ad, type, kullanim_sayisi: 0 });
      setShowDeleteConfirm(true);
    }
  };

  // Delete confirm handler
  const handleDelete = async () => {
    if (!deletingItem || deletingItem.kullanim_sayisi > 0) return;
    
    setSaving(true);
    setError(null);

    try {
      const endpoint = getApiEndpoint(deletingItem.type, deletingItem.id);
      const response = await ctxFetch(endpoint, { method: "DELETE" });
      const result = await response.json();

      if (result.success) {
        setShowDeleteConfirm(false);
        setDeletingItem(null);
        await fetchData();
      } else {
        setError(result.error || "Silme başarısız");
      }
    } catch (err) {
      setError("Silme sırasında hata oluştu");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  // Filter data by search term
  const filterData = (items: TanimItem[] | undefined) => {
    if (!items) return [];
    if (!searchTerm) return items;
    const term = searchTerm.toLowerCase();
    return items.filter(
      item => item.ad.toLowerCase().includes(term) || item.kod.toLowerCase().includes(term)
    );
  };

  // Stats
  const sinifCount = data.sinif_seviyeleri?.length ?? 0;
  const alanCount = data.alanlar?.length ?? 0;
  const dersCount = data.dersler?.length ?? 0;
  const bransCount = data.branslar?.length ?? 0;

  // Helper function for icon colors
  const getIconColors = (index: number) => {
    const colors = ["blue", "green", "purple", "orange", "pink", "teal"];
    return colors[index % colors.length];
  };

  // Get drawer title
  const getDrawerTitle = () => {
    const action = drawerMode === "create" ? "Yeni" : "Düzenle";
    const labels: Record<TabType, string> = {
      sinif_seviyeleri: "Sınıf Seviyesi",
      alanlar: "Alan",
      dersler: "Ders",
      branslar: "Branş",
      odalar: "Oda",
      siniflar: "Sınıf",
      egitim_donemleri: "Eğitim Dönemi",
    };
    return `${action} ${labels[activeTab]}`;
  };

  // Get add button text
  const getAddButtonText = () => {
    const labels: Record<TabType, string> = {
      sinif_seviyeleri: "Yeni Sınıf Seviyesi",
      alanlar: "Yeni Alan",
      dersler: "Yeni Ders",
      branslar: "Yeni Branş",
      odalar: "Yeni Oda",
      siniflar: "Yeni Sınıf",
      egitim_donemleri: "Yeni Dönem",
    };
    return labels[activeTab];
  };

  // Render table for active tab
  const renderTable = (items: TanimItem[] | undefined, type: TabType, icon: JSX.Element, subtitle: string, emptyIcon: string, emptyTitle: string) => {
    const filtered = filterData(items);
    
    if (filtered.length === 0) {
      return (
        <div className="empty-state">
          <div className="empty-state-icon">{emptyIcon}</div>
          <h4>{emptyTitle}</h4>
          <p>İlk kaydınızı ekleyerek başlayın</p>
          <button className="btn-modern btn-primary" onClick={handleOpenCreate}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Ekle
          </button>
        </div>
      );
    }

    return (
      <table className="table-modern">
        <thead>
          <tr>
            <th>Tanım</th>
            <th>Kod</th>
            <th>Durum</th>
            <th style={{ width: "100px" }}>İşlemler</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((item, index) => (
            <tr key={item.id}>
              <td>
                <div className="cell-with-icon">
                  <div className={`cell-icon ${getIconColors(index)}`}>
                    {icon}
                  </div>
                  <div className="cell-info">
                    <span className="cell-primary">{item.ad}</span>
                    <span className="cell-secondary">{subtitle}</span>
                  </div>
                </div>
              </td>
              <td>
                <span className="badge-modern primary">{item.kod}</span>
              </td>
              <td>
                <span className={`badge-modern ${item.aktif_mi ? "success" : "danger"}`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    {item.aktif_mi ? (
                      <polyline points="20 6 9 17 4 12" />
                    ) : (
                      <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>
                    )}
                  </svg>
                  {item.aktif_mi ? "Aktif" : "Pasif"}
                </span>
              </td>
              <td>
                <div className="row-actions">
                  <button 
                    className="row-action-btn" 
                    title="Düzenle"
                    onClick={() => handleOpenEdit(item.id)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  <button 
                    className="row-action-btn danger" 
                    title="Sil"
                    onClick={() => handleDeleteClick(item.id, item.ad, type)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  // Icons for each type
  const sinifIcon = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
  
  const alanIcon = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );
  
  const dersIcon = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
  
  const bransIcon = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );

  const odaIcon = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  );

  const siniflarIcon = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );

  // Oda/Sınıf tab'larında farklı buton göster
  const isOdaSinifTab = activeTab === "odalar" || activeTab === "siniflar";
  const isEgitimDonemiTab = activeTab === "egitim_donemleri";

  return (
    <div className="section">
      {/* Hero Header */}
      <div className="hero-header">
        <div className="hero-content">
          <div className="hero-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </div>
          <div className="hero-text">
            <h1>Eğitim Tanımları</h1>
            <div className="hero-breadcrumb">
              <a href="/dashboard">Ana Sayfa</a>
              <span>/</span>
              <span>Eğitim Tanımları</span>
            </div>
          </div>
        </div>
        {!isOdaSinifTab && (
        <button className="btn-hero" onClick={handleOpenCreate}>
          <span className="btn-hero-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </span>
          <span>{getAddButtonText()}</span>
        </button>
        )}
      </div>

      {activeSube && (
        <div style={{
          marginBottom: 16,
          padding: '10px 14px',
          borderRadius: 10,
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(99, 102, 241, 0.08))',
          border: '1px solid rgba(59, 130, 246, 0.2)',
          fontSize: 13,
          color: '#1e40af',
        }}>
          <strong>Şube:</strong> {activeSube.ad} — tanımlar yalnızca bu şubeye özel listelenir.
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="alert alert-danger" style={{ marginBottom: "20px" }}>
          {error}
          <button
            style={{ float: "right", background: "none", border: "none", cursor: "pointer", fontSize: "18px" }}
            onClick={() => setError(null)}
          >
            ×
          </button>
        </div>
      )}

      {/* Quick Stats */}
      <div className="quick-stats">
        <div className="quick-stat">
          <div className="quick-stat-icon blue">
            {sinifIcon}
          </div>
          <div className="quick-stat-info">
            <h4>{sinifCount}</h4>
            <span>Sınıf Seviyesi</span>
          </div>
        </div>
        <div className="quick-stat">
          <div className="quick-stat-icon green">
            {alanIcon}
          </div>
          <div className="quick-stat-info">
            <h4>{alanCount}</h4>
            <span>Alan</span>
          </div>
        </div>
        <div className="quick-stat">
          <div className="quick-stat-icon purple">
            {dersIcon}
          </div>
          <div className="quick-stat-info">
            <h4>{dersCount}</h4>
            <span>Ders</span>
          </div>
        </div>
        <div className="quick-stat">
          <div className="quick-stat-icon orange">
            {bransIcon}
          </div>
          <div className="quick-stat-info">
            <h4>{bransCount}</h4>
            <span>Branş</span>
          </div>
        </div>
      </div>

      {/* Modern Tabs */}
      <div className="tabs-modern">
        <a 
          className={`tab-modern ${activeTab === "odalar" ? "active" : ""}`} 
          href="#"
          onClick={(e) => { e.preventDefault(); setActiveTab("odalar"); setSearchTerm(""); }}
        >
          {odaIcon}
          Odalar
        </a>
        <a 
          className={`tab-modern ${activeTab === "siniflar" ? "active" : ""}`} 
          href="#"
          onClick={(e) => { e.preventDefault(); setActiveTab("siniflar"); setSearchTerm(""); }}
        >
          {siniflarIcon}
          Sınıflar
        </a>
        <a 
          className={`tab-modern ${activeTab === "sinif_seviyeleri" ? "active" : ""}`} 
          href="#"
          onClick={(e) => { e.preventDefault(); setActiveTab("sinif_seviyeleri"); setSearchTerm(""); }}
        >
          {sinifIcon}
          Sınıf Seviyeleri
          <span className="tab-count">{sinifCount}</span>
        </a>
        <a 
          className={`tab-modern ${activeTab === "alanlar" ? "active" : ""}`} 
          href="#"
          onClick={(e) => { e.preventDefault(); setActiveTab("alanlar"); setSearchTerm(""); }}
        >
          {alanIcon}
          Alanlar
          <span className="tab-count">{alanCount}</span>
        </a>
        <a 
          className={`tab-modern ${activeTab === "dersler" ? "active" : ""}`} 
          href="#"
          onClick={(e) => { e.preventDefault(); setActiveTab("dersler"); setSearchTerm(""); }}
        >
          {dersIcon}
          Dersler
          <span className="tab-count">{dersCount}</span>
        </a>
        <a 
          className={`tab-modern ${activeTab === "branslar" ? "active" : ""}`} 
          href="#"
          onClick={(e) => { e.preventDefault(); setActiveTab("branslar"); setSearchTerm(""); }}
        >
          {bransIcon}
          Branşlar
          <span className="tab-count">{bransCount}</span>
        </a>
        <a 
          className={`tab-modern ${activeTab === "egitim_donemleri" ? "active" : ""}`} 
          href="#"
          onClick={(e) => { e.preventDefault(); setActiveTab("egitim_donemleri"); setSearchTerm(""); }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          Eğitim Dönemleri
        </a>
      </div>

      {/* Odalar/Sınıflar Section */}
      {isOdaSinifTab && (
        <OdalarSiniflarSection activeTab={activeTab as "odalar" | "siniflar"} />
      )}

      {/* Eğitim Dönemleri Section */}
      {isEgitimDonemiTab && (
        <TermTabPage />
      )}

      {/* Content Card - Only for other tabs */}
      {!isOdaSinifTab && !isEgitimDonemiTab && (
      <div className="card-modern">
        <div className="card-modern-header">
          <h3>
            {activeTab === "sinif_seviyeleri" && <>{sinifIcon} Sınıf Seviyeleri Listesi</>}
            {activeTab === "alanlar" && <>{alanIcon} Alanlar Listesi</>}
            {activeTab === "dersler" && <>{dersIcon} Dersler Listesi</>}
            {activeTab === "branslar" && <>{bransIcon} Branşlar Listesi</>}
          </h3>
          <div className="card-modern-header-actions">
            <div className="search-modern">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input 
                type="text" 
                placeholder="Ara..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="card-modern-body">
          {activeTab === "sinif_seviyeleri" && renderTable(data.sinif_seviyeleri, "sinif_seviyeleri", sinifIcon, "Eğitim Seviyesi", "📚", "Henüz sınıf seviyesi eklenmemiş")}
          {activeTab === "alanlar" && renderTable(data.alanlar, "alanlar", alanIcon, "Eğitim Alanı", "📦", "Henüz alan eklenmemiş")}
          {activeTab === "dersler" && renderTable(data.dersler, "dersler", dersIcon, "Ders", "📖", "Henüz ders eklenmemiş")}
          {activeTab === "branslar" && renderTable(data.branslar, "branslar", bransIcon, "Öğretmen Branşı", "👨‍🏫", "Henüz branş eklenmemiş")}
        </div>
      </div>
      )}

      {/* Drawer */}
      {showDrawer && !isOdaSinifTab && !isEgitimDonemiTab && (
        <>
          <div className="drawer-overlay" onClick={() => setShowDrawer(false)} />
          <div className="drawer">
            <div className="drawer-header">
              <h3>{getDrawerTitle()}</h3>
              <button className="drawer-close" onClick={() => setShowDrawer(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="drawer-body">
              <div className="drawer-form">
                <div className="form-group">
                  <label>
                    {activeTab === "sinif_seviyeleri" && "Sınıf Seviyesi Adı *"}
                    {activeTab === "alanlar" && "Alan Adı *"}
                    {activeTab === "dersler" && "Ders Adı *"}
                    {activeTab === "branslar" && "Branş Adı *"}
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={formData.ad}
                    onChange={(e) => setFormData({ ...formData, ad: e.target.value })}
                    placeholder="Adını girin"
                  />
                </div>
                <div className="form-group">
                  <label>Kod *</label>
                  <input
                    type="text"
                    className="form-control"
                    value={formData.kod}
                    onChange={(e) => setFormData({ ...formData, kod: e.target.value })}
                    placeholder="Örn: S01, A01, D01, B01"
                  />
                </div>
                {activeTab === "sinif_seviyeleri" && (
                  <div className="form-group">
                    <label>Sıra</label>
                    <input
                      type="number"
                      className="form-control"
                      min={0}
                      value={formData.sira}
                      onChange={(e) => setFormData({ ...formData, sira: parseInt(e.target.value, 10) || 0 })}
                      placeholder="Listeleme sırası (0: Anaokulu, 1-12: sınıflar)"
                    />
                  </div>
                )}
                <div className="form-group">
                  <label className="checkbox-inline">
                    <input
                      type="checkbox"
                      checked={formData.aktif_mi}
                      onChange={(e) => setFormData({ ...formData, aktif_mi: e.target.checked })}
                    />
                    <span>Aktif</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="drawer-footer">
              <button className="btn-modern btn-secondary" onClick={() => setShowDrawer(false)}>
                İptal
              </button>
              <button
                className="btn-modern btn-primary"
                onClick={handleSave}
                disabled={saving || !formData.ad || !formData.kod}
              >
                {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && deletingItem && (
        <div className="modal-overlay" onClick={() => { setShowDeleteConfirm(false); setDeletingItem(null); }}>
          <div className="modal-content modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {deletingItem.kullanim_sayisi > 0 ? "Silme İşlemi Yapılamaz" : "Silme Onayı"}
              </h3>
              <button className="modal-close" onClick={() => { setShowDeleteConfirm(false); setDeletingItem(null); }}>
                ×
              </button>
            </div>
            <div className="modal-body">
              {deletingItem.kullanim_sayisi > 0 ? (
                <div className="warning-box">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <p><strong>&quot;{deletingItem.ad}&quot;</strong> silinemez.</p>
                  <p className="text-muted">
                    Bu tanım <strong>{deletingItem.kullanim_sayisi}</strong> kayıtta kullanılmaktadır.
                    Önce bağlı kayıtları güncellemeniz gerekmektedir.
                  </p>
                </div>
              ) : (
                <>
                  <p><strong>&quot;{deletingItem.ad}&quot;</strong> kaydını silmek istediğinizden emin misiniz?</p>
                  <p className="text-danger">Bu işlem geri alınamaz!</p>
                </>
              )}
            </div>
            <div className="modal-footer">
              {deletingItem.kullanim_sayisi > 0 ? (
                <button
                  className="btn-modern btn-primary"
                  onClick={() => { setShowDeleteConfirm(false); setDeletingItem(null); }}
                >
                  Tamam
                </button>
              ) : (
                <>
                  <button
                    className="btn-modern btn-secondary"
                    onClick={() => { setShowDeleteConfirm(false); setDeletingItem(null); }}
                  >
                    İptal
                  </button>
                  <button
                    className="btn-modern btn-danger"
                    onClick={handleDelete}
                    disabled={saving}
                  >
                    {saving ? "Siliniyor..." : "Sil"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .drawer-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 1000;
        }
        .drawer {
          position: fixed;
          top: 0;
          right: 0;
          width: 480px;
          max-width: 100%;
          height: 100vh;
          background: white;
          box-shadow: -4px 0 24px rgba(0, 0, 0, 0.15);
          z-index: 1001;
          display: flex;
          flex-direction: column;
          animation: slideIn 0.3s ease;
        }
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .drawer-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 24px;
          border-bottom: 1px solid #e5e7eb;
          background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%);
        }
        .drawer-header h3 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
          color: #111827;
        }
        .drawer-close {
          background: none;
          border: none;
          cursor: pointer;
          color: #6b7280;
          padding: 4px;
          border-radius: 6px;
          transition: all 0.2s;
        }
        .drawer-close:hover {
          background: #f3f4f6;
          color: #111827;
        }
        .drawer-body {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
        }
        .drawer-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .drawer-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          padding: 16px 24px;
          border-top: 1px solid #e5e7eb;
          background: #f9fafb;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .form-group label {
          font-size: 14px;
          font-weight: 500;
          color: #374151;
        }
        .form-control {
          padding: 10px 12px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 14px;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .form-control:focus {
          outline: none;
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
        }
        .checkbox-inline {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          font-size: 14px;
        }
        .checkbox-inline input[type="checkbox"] {
          width: 18px;
          height: 18px;
          cursor: pointer;
        }
        
        /* Modal styles */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1002;
        }
        .modal-content {
          background: white;
          border-radius: 12px;
          width: 90%;
          max-width: 420px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
        }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 24px;
          border-bottom: 1px solid #e5e7eb;
        }
        .modal-header h3 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
        }
        .modal-close {
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: #6b7280;
          line-height: 1;
        }
        .modal-body {
          padding: 24px;
        }
        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          padding: 16px 24px;
          border-top: 1px solid #e5e7eb;
        }
        .warning-box {
          text-align: center;
          padding: 20px;
        }
        .warning-box svg {
          margin-bottom: 16px;
        }
        .warning-box p {
          margin: 8px 0;
          color: #374151;
        }
        .text-muted {
          color: #6b7280 !important;
          font-size: 13px;
        }
        .text-danger {
          color: #dc2626;
          font-size: 13px;
        }
        .alert {
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 14px;
        }
        .alert-danger {
          background: #fef2f2;
          color: #dc2626;
          border: 1px solid #fecaca;
        }
        .btn-modern {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-primary {
          background: #2563eb;
          color: white;
        }
        .btn-primary:hover:not(:disabled) {
          background: #1d4ed8;
        }
        .btn-secondary {
          background: #f3f4f6;
          color: #374151;
        }
        .btn-secondary:hover {
          background: #e5e7eb;
        }
        .btn-danger {
          background: #dc2626;
          color: white;
        }
        .btn-danger:hover:not(:disabled) {
          background: #b91c1c;
        }
        .btn-modern:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        
        @media (max-width: 640px) {
          .drawer {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
