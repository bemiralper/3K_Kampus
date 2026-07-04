"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useKurum } from "@/lib/contexts/KurumContext";
import KurumBrandingForm, { type BrandingFormState } from "@/components/branding/KurumBrandingForm";
import SubeDrawerForm from "@/components/kurum/SubeDrawerForm";
import { DEFAULT_BRANDING } from "@/lib/kurum-branding";
import {
  DEFAULT_SUBE_FORM,
  subeFormFromApi,
  subeFormToPayload,
  type SubeFormState,
} from "@/lib/sube-form";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

type TabType = "kurumlar" | "subeler" | "egitim_yillari" | "kayit_tanimlari";

interface Kurum {
  id: number;
  ad: string;
  kod: string;
  aktif_mi: boolean;
  yetkili_ad_soyad?: string;
  telefon_sabit?: string;
  telefon_cep?: string;
  vergi_no?: string;
  vergi_dairesi?: string;
  adres?: string;
  sube_count?: number;
  gorunen_ad?: string;
  slogan?: string;
  login_logo_url?: string | null;
  app_logo_url?: string | null;
  favicon_url?: string | null;
  login_arkaplan_rengi?: string;
  login_arkaplan_rengi_2?: string;
  tema_rengi?: string;
}

interface Sube extends SubeFormState {
  id: number;
  kurum?: { id: number; ad: string };
  created_at?: string;
  updated_at?: string;
}

interface EgitimYili {
  id: number;
  baslangic_yil: number;
  bitis_yil: number;
  aktif_mi: boolean;
  sube?: { id: number; ad: string };
  ogrenci_count?: number;
}

interface KayitTuru {
  id: number;
  code: string;
  label: string;
  order: number;
  is_active: boolean;
}

export type KurumResponse = {
  kurumlar?: Kurum[];
  subeler?: Sube[];
  egitim_yillari?: EgitimYili[];
};

interface KurumYonetimiClientProps {
  initialData: KurumResponse;
}

export default function KurumYonetimiClient({ initialData }: KurumYonetimiClientProps) {
  const { refreshData: refreshContextData, activeKurum } = useKurum();
  
  const [activeTab, setActiveTab] = useState<TabType>("kurumlar");
  const [data, setData] = useState<KurumResponse>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Search state
  const [searchTerm, setSearchTerm] = useState("");
  
  // Drawer states
  const [showDrawer, setShowDrawer] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [kurumDrawerTab, setKurumDrawerTab] = useState<"bilgiler" | "marka">("bilgiler");
  
  const defaultBrandingForm = (): BrandingFormState => ({
    gorunen_ad: "",
    slogan: DEFAULT_BRANDING.slogan,
    login_arkaplan_rengi: DEFAULT_BRANDING.login_arkaplan_rengi,
    login_arkaplan_rengi_2: DEFAULT_BRANDING.login_arkaplan_rengi_2,
    tema_rengi: DEFAULT_BRANDING.tema_rengi,
  });

  const [brandingForm, setBrandingForm] = useState<BrandingFormState>(defaultBrandingForm);
  const [brandingPreviews, setBrandingPreviews] = useState({
    login_logo_url: null as string | null,
    app_logo_url: null as string | null,
    favicon_url: null as string | null,
  });
  
  // Delete modal states
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingItem, setDeletingItem] = useState<{
    id: number;
    ad: string;
    type: TabType;
    hasChildren: boolean;
    childCount: number;
    childType: string;
  } | null>(null);

  // Form data states
  const [kurumForm, setKurumForm] = useState({
    ad: "",
    kod: "",
    telefon_sabit: "",
    telefon_cep: "",
    yetkili_ad_soyad: "",
    vergi_no: "",
    vergi_dairesi: "",
    adres: "",
    aktif_mi: true,
  });

  const [subeForm, setSubeForm] = useState<SubeFormState>({ ...DEFAULT_SUBE_FORM });

  const [yilForm, setYilForm] = useState({
    baslangic_yil: new Date().getFullYear().toString(),
    bitis_yil: (new Date().getFullYear() + 1).toString(),
    aktif_mi: true,
  });

  const [kayitTurleri, setKayitTurleri] = useState<KayitTuru[]>([]);
  const [kayitTuruForm, setKayitTuruForm] = useState({
    label: "",
    code: "",
    order: "",
    is_active: true,
  });

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${BACKEND_URL}/kurum-yonetimi/api/legacy/kurumlar/`);
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

  const fetchKayitTurleri = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${BACKEND_URL}/kurum-yonetimi/api/kayit-turleri/?include_inactive=1`);
      const result = await response.json();
      if (result.success) {
        setKayitTurleri(result.data || []);
      } else {
        setError(result.error || "Kayıt türleri yüklenemedi");
      }
    } catch (err) {
      setError("Kayıt türleri yüklenirken hata oluştu");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "kayit_tanimlari") {
      fetchKayitTurleri();
    }
  }, [activeTab, fetchKayitTurleri]);

  // Reset forms
  const resetForms = () => {
    setKurumForm({
      ad: "",
      kod: "",
      telefon_sabit: "",
      telefon_cep: "",
      yetkili_ad_soyad: "",
      vergi_no: "",
      vergi_dairesi: "",
      adres: "",
      aktif_mi: true,
    });
    setSubeForm({ ...DEFAULT_SUBE_FORM });
    setYilForm({
      baslangic_yil: new Date().getFullYear().toString(),
      bitis_yil: (new Date().getFullYear() + 1).toString(),
      aktif_mi: true,
    });
    setKayitTuruForm({
      label: "",
      code: "",
      order: "",
      is_active: true,
    });
    setKurumDrawerTab("bilgiler");
    setBrandingForm(defaultBrandingForm());
    setBrandingPreviews({ login_logo_url: null, app_logo_url: null, favicon_url: null });
    setEditingId(null);
  };

  // Open drawer for create
  const handleOpenCreate = () => {
    resetForms();
    if (activeTab === "subeler" && activeKurum) {
      setSubeForm({ ...DEFAULT_SUBE_FORM, kurum_id: String(activeKurum.id) });
    }
    setDrawerMode("create");
    setShowDrawer(true);
  };

  // Open drawer for edit
  const handleOpenEdit = async (id: number) => {
    setDrawerMode("edit");
    setEditingId(id);
    
    try {
      let endpoint = "";
      if (activeTab === "kurumlar") {
        endpoint = `${BACKEND_URL}/kurum-yonetimi/api/kurum/${id}/`;
      } else if (activeTab === "subeler") {
        endpoint = `${BACKEND_URL}/kurum-yonetimi/api/sube/${id}/`;
      } else if (activeTab === "egitim_yillari") {
        endpoint = `${BACKEND_URL}/kurum-yonetimi/api/egitim-yili/${id}/`;
      } else {
        endpoint = `${BACKEND_URL}/kurum-yonetimi/api/kayit-turleri/${id}/`;
      }

      const response = await fetch(endpoint);
      const result = await response.json();
      
      if (result.success) {
        const item = result.data;
        
        if (activeTab === "kurumlar") {
          setKurumForm({
            ad: item.ad || "",
            kod: item.kod || "",
            telefon_sabit: item.telefon_sabit || "",
            telefon_cep: item.telefon_cep || "",
            yetkili_ad_soyad: item.yetkili_ad_soyad || "",
            vergi_no: item.vergi_no || "",
            vergi_dairesi: item.vergi_dairesi || "",
            adres: item.adres || "",
            aktif_mi: item.aktif_mi ?? true,
          });
          setBrandingForm({
            gorunen_ad: item.gorunen_ad || "",
            slogan: item.slogan || DEFAULT_BRANDING.slogan,
            login_arkaplan_rengi: item.login_arkaplan_rengi || DEFAULT_BRANDING.login_arkaplan_rengi,
            login_arkaplan_rengi_2: item.login_arkaplan_rengi_2 || DEFAULT_BRANDING.login_arkaplan_rengi_2,
            tema_rengi: item.tema_rengi || DEFAULT_BRANDING.tema_rengi,
          });
          setBrandingPreviews({
            login_logo_url: item.login_logo_url ?? null,
            app_logo_url: item.app_logo_url ?? null,
            favicon_url: item.favicon_url ?? null,
          });
          setKurumDrawerTab("bilgiler");
        } else if (activeTab === "subeler") {
          setSubeForm(subeFormFromApi(item));
        } else if (activeTab === "egitim_yillari") {
          setYilForm({
            baslangic_yil: item.baslangic_yil?.toString() || "",
            bitis_yil: item.bitis_yil?.toString() || "",
            aktif_mi: item.aktif_mi ?? true,
          });
        } else {
          setKayitTuruForm({
            label: item.label || "",
            code: item.code || "",
            order: item.order?.toString() || "",
            is_active: item.is_active ?? true,
          });
        }
        
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
      let endpoint = "";
      let payload: Record<string, unknown> = {};

      if (activeTab === "kurumlar") {
        endpoint = drawerMode === "create"
          ? `${BACKEND_URL}/kurum-yonetimi/api/kurum/`
          : `${BACKEND_URL}/kurum-yonetimi/api/kurum/${editingId}/`;
        payload = { ...kurumForm, ...brandingForm };
      } else if (activeTab === "subeler") {
        endpoint = drawerMode === "create"
          ? `${BACKEND_URL}/kurum-yonetimi/api/sube/`
          : `${BACKEND_URL}/kurum-yonetimi/api/sube/${editingId}/`;
        payload = subeFormToPayload(subeForm);
      } else if (activeTab === "egitim_yillari") {
        endpoint = drawerMode === "create"
          ? `${BACKEND_URL}/kurum-yonetimi/api/egitim-yili/`
          : `${BACKEND_URL}/kurum-yonetimi/api/egitim-yili/${editingId}/`;
        payload = {
          baslangic_yil: parseInt(yilForm.baslangic_yil),
          bitis_yil: parseInt(yilForm.bitis_yil),
          aktif_mi: yilForm.aktif_mi,
        };
      } else {
        endpoint = drawerMode === "create"
          ? `${BACKEND_URL}/kurum-yonetimi/api/kayit-turleri/`
          : `${BACKEND_URL}/kurum-yonetimi/api/kayit-turleri/${editingId}/`;
        payload = {
          label: kayitTuruForm.label.trim(),
          is_active: kayitTuruForm.is_active,
        };
        if (kayitTuruForm.code.trim()) payload.code = kayitTuruForm.code.trim();
        if (kayitTuruForm.order.trim()) payload.order = parseInt(kayitTuruForm.order, 10);
      }

      const response = await fetch(endpoint, {
        method: drawerMode === "create" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (result.success) {
        if (activeTab === "kurumlar" && drawerMode === "create" && result.data?.id) {
          setEditingId(result.data.id);
          setDrawerMode("edit");
          setKurumDrawerTab("marka");
          await fetchData();
          await refreshContextData();
          return;
        }

        setShowDrawer(false);
        resetForms();
        if (activeTab === "kayit_tanimlari") {
          await fetchKayitTurleri();
        } else {
          await fetchData();
          await refreshContextData();
        }
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

  // Delete click handler - check for children first
  const handleDeleteClick = (id: number, ad: string, type: TabType) => {
    let hasChildren = false;
    let childCount = 0;
    let childType = "";

    if (type === "kurumlar") {
      const kurum = data.kurumlar?.find(k => k.id === id);
      const subeCount = data.subeler?.filter(s => s.kurum?.id === id).length || 0;
      hasChildren = subeCount > 0;
      childCount = subeCount;
      childType = "şube";
    } else if (type === "subeler") {
      const yilCount = data.egitim_yillari?.filter(y => y.sube?.id === id).length || 0;
      hasChildren = yilCount > 0;
      childCount = yilCount;
      childType = "eğitim yılı";
    } else if (type === "egitim_yillari") {
      hasChildren = false;
      childCount = 0;
      childType = "öğrenci";
    } else {
      hasChildren = false;
      childCount = 0;
      childType = "";
    }

    setDeletingItem({ id, ad, type, hasChildren, childCount, childType });
    setShowDeleteConfirm(true);
  };

  // Delete confirm handler
  const handleDelete = async () => {
    if (!deletingItem || deletingItem.hasChildren) return;
    
    setSaving(true);
    setError(null);

    try {
      let endpoint = "";
      if (deletingItem.type === "kurumlar") {
        endpoint = `${BACKEND_URL}/kurum-yonetimi/api/kurum/${deletingItem.id}/`;
      } else if (deletingItem.type === "subeler") {
        endpoint = `${BACKEND_URL}/kurum-yonetimi/api/sube/${deletingItem.id}/`;
      } else if (deletingItem.type === "egitim_yillari") {
        endpoint = `${BACKEND_URL}/kurum-yonetimi/api/egitim-yili/${deletingItem.id}/`;
      } else {
        endpoint = `${BACKEND_URL}/kurum-yonetimi/api/kayit-turleri/${deletingItem.id}/`;
      }

      const response = await fetch(endpoint, { method: "DELETE" });
      const result = await response.json();

      if (result.success) {
        setShowDeleteConfirm(false);
        setDeletingItem(null);
        if (deletingItem.type === "kayit_tanimlari") {
          await fetchKayitTurleri();
        } else {
          await fetchData();
          await refreshContextData();
        }
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

  const handleSeedKayitTurleri = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`${BACKEND_URL}/kurum-yonetimi/api/kayit-turleri/seed/`, {
        method: "POST",
      });
      const result = await response.json();
      if (result.success) {
        setKayitTurleri(result.data || []);
      } else {
        setError(result.error || "Varsayılanlar yüklenemedi");
      }
    } catch (err) {
      setError("Varsayılanlar yüklenirken hata oluştu");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  // Filter data by search term
  const filterKurumlar = () => {
    if (!searchTerm) return data.kurumlar || [];
    const term = searchTerm.toLowerCase();
    return (data.kurumlar || []).filter(
      item => item.ad.toLowerCase().includes(term) || item.kod.toLowerCase().includes(term)
    );
  };

  const filterSubeler = () => {
    if (!searchTerm) return data.subeler || [];
    const term = searchTerm.toLowerCase();
    return (data.subeler || []).filter(
      item =>
        item.ad.toLowerCase().includes(term) ||
        (item.kod || "").toLowerCase().includes(term) ||
        (item.resmi_ad || "").toLowerCase().includes(term) ||
        (item.eposta || "").toLowerCase().includes(term) ||
        (item.kurum?.ad || "").toLowerCase().includes(term)
    );
  };

  const filterYillar = () => {
    if (!searchTerm) return data.egitim_yillari || [];
    const term = searchTerm.toLowerCase();
    return (data.egitim_yillari || []).filter(
      item => `${item.baslangic_yil}-${item.bitis_yil}`.includes(term)
    );
  };

  const filterKayitTurleri = () => {
    if (!searchTerm) return kayitTurleri;
    const term = searchTerm.toLowerCase();
    return kayitTurleri.filter(
      item => item.label.toLowerCase().includes(term) || item.code.toLowerCase().includes(term)
    );
  };

  // Stats
  const kurumlarCount = data.kurumlar?.length ?? 0;
  const subelerCount = data.subeler?.length ?? 0;

  const kurumOptions = useMemo(() => {
    const list = [...(data.kurumlar || [])];
    if (activeKurum && !list.some((k) => k.id === activeKurum.id)) {
      list.unshift({
        id: activeKurum.id,
        ad: activeKurum.ad,
        kod: activeKurum.kod,
        aktif_mi: activeKurum.aktif_mi,
      });
    }
    return list;
  }, [data.kurumlar, activeKurum]);
  const egitimYillariCount = data.egitim_yillari?.length ?? 0;
  const kayitTurleriCount = kayitTurleri.filter((item) => item.is_active).length;
  const aktifYil = data.egitim_yillari?.find(y => y.aktif_mi);

  // Get drawer title
  const getDrawerTitle = () => {
    const action = drawerMode === "create" ? "Yeni" : "Düzenle";
    if (activeTab === "kurumlar") return `${action} Kurum`;
    if (activeTab === "subeler") return `${action} Şube`;
    if (activeTab === "egitim_yillari") return `${action} Eğitim Yılı`;
    return `${action} Kayıt Türü`;
  };

  // Get add button text
  const getAddButtonText = () => {
    if (activeTab === "kurumlar") return "Yeni Kurum";
    if (activeTab === "subeler") return "Yeni Şube";
    if (activeTab === "egitim_yillari") return "Yeni Yıl";
    return "Yeni Kayıt Türü";
  };

  return (
    <div className="section">
      {/* Hero Header */}
      <div className="hero-header">
        <div className="hero-content">
          <div className="hero-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" />
            </svg>
          </div>
          <div className="hero-text">
            <h1>Kurum Yönetimi</h1>
            <div className="hero-breadcrumb">
              <a href="/dashboard">Ana Sayfa</a>
              <span>/</span>
              <span>Kurum Yönetimi</span>
            </div>
          </div>
        </div>
        <button className="btn-hero" onClick={handleOpenCreate}>
          <span className="btn-hero-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </span>
          <span>{getAddButtonText()}</span>
        </button>
      </div>

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
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" />
            </svg>
          </div>
          <div className="quick-stat-info">
            <h4>{kurumlarCount}</h4>
            <span>Toplam Kurum</span>
          </div>
        </div>
        <div className="quick-stat">
          <div className="quick-stat-icon green">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          <div className="quick-stat-info">
            <h4>{subelerCount}</h4>
            <span>Toplam Şube</span>
          </div>
        </div>
        <div className="quick-stat">
          <div className="quick-stat-icon purple">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <div className="quick-stat-info">
            <h4>{egitimYillariCount}</h4>
            <span>Eğitim Yılı</span>
          </div>
        </div>
        <div className="quick-stat">
          <div className="quick-stat-icon orange">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div className="quick-stat-info">
            <h4>{aktifYil ? `${aktifYil.baslangic_yil}-${aktifYil.bitis_yil}` : "-"}</h4>
            <span>Aktif Yıl</span>
          </div>
        </div>
      </div>

      {/* Modern Tabs */}
      <div className="tabs-modern">
        <a 
          className={`tab-modern ${activeTab === "kurumlar" ? "active" : ""}`} 
          href="#"
          onClick={(e) => { e.preventDefault(); setActiveTab("kurumlar"); setSearchTerm(""); }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" />
          </svg>
          Kurumlar
          <span className="tab-count">{kurumlarCount}</span>
        </a>
        <a 
          className={`tab-modern ${activeTab === "subeler" ? "active" : ""}`} 
          href="#"
          onClick={(e) => { e.preventDefault(); setActiveTab("subeler"); setSearchTerm(""); }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          Şubeler
          <span className="tab-count">{subelerCount}</span>
        </a>
        <a 
          className={`tab-modern ${activeTab === "egitim_yillari" ? "active" : ""}`} 
          href="#"
          onClick={(e) => { e.preventDefault(); setActiveTab("egitim_yillari"); setSearchTerm(""); }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          Eğitim Yılları
          <span className="tab-count">{egitimYillariCount}</span>
        </a>
        <a 
          className={`tab-modern ${activeTab === "kayit_tanimlari" ? "active" : ""}`} 
          href="#"
          onClick={(e) => { e.preventDefault(); setActiveTab("kayit_tanimlari"); setSearchTerm(""); }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="19" y1="8" x2="19" y2="14" />
            <line x1="22" y1="11" x2="16" y2="11" />
          </svg>
          Kayıt Tanımları
          <span className="tab-count">{kayitTurleriCount}</span>
        </a>
      </div>

      {/* Kurumlar Tab */}
      {activeTab === "kurumlar" && (
        <div className="card-modern">
          <div className="card-modern-header">
            <h3>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" />
              </svg>
              Kurum Listesi
            </h3>
            <div className="card-modern-header-actions">
              <div className="search-modern">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input 
                  type="text" 
                  placeholder="Kurum ara..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="card-modern-body">
            {filterKurumlar().length > 0 ? (
              <table className="table-modern">
                <thead>
                  <tr>
                    <th>Kurum Bilgisi</th>
                    <th>Yetkili</th>
                    <th>İletişim</th>
                    <th>Durum</th>
                    <th style={{ width: "100px" }}>İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  {filterKurumlar().map((kurum) => (
                    <tr key={kurum.id}>
                      <td>
                        <div className="cell-with-icon">
                          <div className="cell-icon blue">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" />
                            </svg>
                          </div>
                          <div className="cell-info">
                            <span className="cell-primary">{kurum.ad}</span>
                            <span className="cell-secondary">Kod: {kurum.kod}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="cell-info">
                          <span className="cell-primary">{kurum.yetkili_ad_soyad || "-"}</span>
                        </div>
                      </td>
                      <td>
                        <div className="cell-info">
                          <span className="cell-primary">{kurum.telefon_cep || kurum.telefon_sabit || "-"}</span>
                          <span className="cell-secondary">{kurum.adres ? kurum.adres.substring(0, 30) + "..." : "-"}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`badge-modern ${kurum.aktif_mi ? "success" : "danger"}`}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            {kurum.aktif_mi ? (
                              <polyline points="20 6 9 17 4 12" />
                            ) : (
                              <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>
                            )}
                          </svg>
                          {kurum.aktif_mi ? "Aktif" : "Pasif"}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button 
                            className="row-action-btn" 
                            title="Düzenle"
                            onClick={() => handleOpenEdit(kurum.id)}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button 
                            className="row-action-btn danger" 
                            title="Sil"
                            onClick={() => handleDeleteClick(kurum.id, kurum.ad, "kurumlar")}
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
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">🏢</div>
                <h4>Henüz kurum eklenmemiş</h4>
                <p>İlk kurumunuzu ekleyerek başlayın</p>
                <button className="btn-modern btn-primary" onClick={handleOpenCreate}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Kurum Ekle
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Şubeler Tab */}
      {activeTab === "subeler" && (
        <div className="card-modern">
          <div className="card-modern-header">
            <h3>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              Şube Listesi
            </h3>
            <div className="card-modern-header-actions">
              <div className="search-modern">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input 
                  type="text" 
                  placeholder="Şube ara..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="card-modern-body">
            {filterSubeler().length > 0 ? (
              <table className="table-modern">
                <thead>
                  <tr>
                    <th>Şube Bilgisi</th>
                    <th>Bağlı Kurum</th>
                    <th>İletişim</th>
                    <th>Durum</th>
                    <th style={{ width: "100px" }}>İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  {filterSubeler().map((sube) => (
                    <tr key={sube.id}>
                      <td>
                        <div className="cell-with-icon">
                          <div className="cell-icon green">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                              <polyline points="9 22 9 12 15 12 15 22" />
                            </svg>
                          </div>
                          <div className="cell-info">
                            <span className="cell-primary">{sube.ad}</span>
                            <span className="cell-secondary">
                              {sube.resmi_ad || `Kod: ${sube.kod || "-"}`}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="badge-modern primary">{sube.kurum?.ad ?? "-"}</span>
                      </td>
                      <td>
                        <div className="cell-info">
                          <span className="cell-primary">{sube.telefon || sube.eposta || "-"}</span>
                          <span className="cell-secondary">
                            {sube.adres ? sube.adres.substring(0, 40) + (sube.adres.length > 40 ? "…" : "") : sube.kurs_muduru || "-"}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={`badge-modern ${sube.aktif_mi ? "success" : "danger"}`}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            {sube.aktif_mi ? (
                              <polyline points="20 6 9 17 4 12" />
                            ) : (
                              <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>
                            )}
                          </svg>
                          {sube.aktif_mi ? "Aktif" : "Pasif"}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button 
                            className="row-action-btn" 
                            title="Düzenle"
                            onClick={() => handleOpenEdit(sube.id)}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button 
                            className="row-action-btn danger" 
                            title="Sil"
                            onClick={() => handleDeleteClick(sube.id, sube.ad, "subeler")}
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
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">🏠</div>
                <h4>Henüz şube eklenmemiş</h4>
                <p>İlk şubenizi ekleyerek başlayın</p>
                <button className="btn-modern btn-primary" onClick={handleOpenCreate}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Şube Ekle
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Eğitim Yılları Tab */}
      {activeTab === "egitim_yillari" && (
        <div className="card-modern">
          <div className="card-modern-header">
            <h3>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              Eğitim Yılları
            </h3>
            <div className="card-modern-header-actions">
              <div className="search-modern">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input 
                  type="text" 
                  placeholder="Yıl ara..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="card-modern-body">
            {filterYillar().length > 0 ? (
              <table className="table-modern">
                <thead>
                  <tr>
                    <th>Eğitim Yılı</th>
                    <th>Bağlı Şube</th>
                    <th>Dönem</th>
                    <th>Durum</th>
                    <th style={{ width: "100px" }}>İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  {filterYillar().map((yil) => (
                    <tr key={yil.id}>
                      <td>
                        <div className="cell-with-icon">
                          <div className={`cell-icon ${yil.aktif_mi ? "orange" : "purple"}`}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                              <line x1="16" y1="2" x2="16" y2="6" />
                              <line x1="8" y1="2" x2="8" y2="6" />
                              <line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                          </div>
                          <div className="cell-info">
                            <span className="cell-primary">{yil.baslangic_yil}-{yil.bitis_yil}</span>
                            <span className="cell-secondary">Eğitim Öğretim Yılı</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="badge-modern primary">{yil.sube?.ad ?? "-"}</span>
                      </td>
                      <td>
                        <span className="cell-secondary">
                          Eylül {yil.baslangic_yil} - Haziran {yil.bitis_yil}
                        </span>
                      </td>
                      <td>
                        <span className={`badge-modern ${yil.aktif_mi ? "success" : "danger"}`}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            {yil.aktif_mi ? (
                              <polyline points="20 6 9 17 4 12" />
                            ) : (
                              <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>
                            )}
                          </svg>
                          {yil.aktif_mi ? "Aktif Yıl" : "Pasif"}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button 
                            className="row-action-btn" 
                            title="Düzenle"
                            onClick={() => handleOpenEdit(yil.id)}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button 
                            className="row-action-btn danger" 
                            title="Sil"
                            onClick={() => handleDeleteClick(yil.id, `${yil.baslangic_yil}-${yil.bitis_yil}`, "egitim_yillari")}
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
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">📅</div>
                <h4>Henüz eğitim yılı eklenmemiş</h4>
                <p>İlk eğitim yılınızı ekleyerek başlayın</p>
                <button className="btn-modern btn-primary" onClick={handleOpenCreate}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Eğitim Yılı Ekle
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "kayit_tanimlari" && (
        <div className="card-modern">
          <div className="card-modern-header">
            <h3>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <line x1="19" y1="8" x2="19" y2="14" />
                <line x1="22" y1="11" x2="16" y2="11" />
              </svg>
              Kayıt Türleri
            </h3>
            <div className="card-modern-header-actions">
              <div className="search-modern">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Kayıt türü ara..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="card-modern-body">
            {filterKayitTurleri().length > 0 ? (
              <table className="table-modern">
                <thead>
                  <tr>
                    <th>Sıra</th>
                    <th>Kayıt Türü</th>
                    <th>Kod</th>
                    <th>Durum</th>
                    <th style={{ width: "100px" }}>İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  {filterKayitTurleri().map((item) => (
                    <tr key={item.id}>
                      <td>{item.order}</td>
                      <td>
                        <div className="cell-with-icon">
                          <div className={`cell-icon ${item.is_active ? "green" : "purple"}`}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                              <circle cx="9" cy="7" r="4" />
                            </svg>
                          </div>
                          <div className="cell-info">
                            <span className="cell-primary">{item.label}</span>
                            <span className="cell-secondary">Öğrenci kayıt türü</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="badge-modern primary">{item.code}</span>
                      </td>
                      <td>
                        <span className={`badge-modern ${item.is_active ? "success" : "danger"}`}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            {item.is_active ? (
                              <polyline points="20 6 9 17 4 12" />
                            ) : (
                              <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>
                            )}
                          </svg>
                          {item.is_active ? "Aktif" : "Pasif"}
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
                            onClick={() => handleDeleteClick(item.id, item.label, "kayit_tanimlari")}
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
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">📝</div>
                <h4>Henüz kayıt türü eklenmemiş</h4>
                <p>Öğrenci kayıt ekranındaki Kayıt Türü listesi buradan yönetilir</p>
                <button className="btn-modern btn-primary" onClick={handleOpenCreate}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Kayıt Türü Ekle
                </button>
                <button
                  className="btn-modern btn-secondary"
                  style={{ marginTop: "0.75rem" }}
                  onClick={handleSeedKayitTurleri}
                  disabled={saving}
                >
                  Varsayılanları Yükle
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Drawer */}
      {showDrawer && (
        <>
          <div className="drawer-overlay" onClick={() => setShowDrawer(false)} />
          <div className={`drawer${
            activeTab === "kurumlar" && kurumDrawerTab === "marka"
              ? " drawer--brand"
              : activeTab === "subeler"
                ? " drawer--sube"
                : ""
          }`}>
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
              {activeTab === "kurumlar" && (
                <div className="drawer-segment">
                  <button
                    type="button"
                    className={`drawer-segment-btn${kurumDrawerTab === "bilgiler" ? " active" : ""}`}
                    onClick={() => setKurumDrawerTab("bilgiler")}
                  >
                    Bilgiler
                  </button>
                  <button
                    type="button"
                    className={`drawer-segment-btn${kurumDrawerTab === "marka" ? " active" : ""}`}
                    onClick={() => setKurumDrawerTab("marka")}
                  >
                    Marka / Görünüm
                  </button>
                </div>
              )}
              <div className="drawer-form">
                {/* Kurum Form */}
                {activeTab === "kurumlar" && kurumDrawerTab === "bilgiler" && (
                  <>
                    <div className="form-group">
                      <label>Kurum Adı *</label>
                      <input
                        type="text"
                        className="form-control"
                        value={kurumForm.ad}
                        onChange={(e) => setKurumForm({ ...kurumForm, ad: e.target.value })}
                        placeholder="Kurum adını girin"
                      />
                    </div>
                    <div className="form-group">
                      <label>Kurum Kodu *</label>
                      <input
                        type="text"
                        className="form-control"
                        value={kurumForm.kod}
                        onChange={(e) => setKurumForm({ ...kurumForm, kod: e.target.value })}
                        placeholder="Örn: K001"
                      />
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Sabit Telefon</label>
                        <input
                          type="text"
                          className="form-control"
                          value={kurumForm.telefon_sabit}
                          onChange={(e) => setKurumForm({ ...kurumForm, telefon_sabit: e.target.value })}
                          placeholder="0212 xxx xx xx"
                        />
                      </div>
                      <div className="form-group">
                        <label>Cep Telefonu</label>
                        <input
                          type="text"
                          className="form-control"
                          value={kurumForm.telefon_cep}
                          onChange={(e) => setKurumForm({ ...kurumForm, telefon_cep: e.target.value })}
                          placeholder="05xx xxx xx xx"
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Yetkili Ad Soyad</label>
                      <input
                        type="text"
                        className="form-control"
                        value={kurumForm.yetkili_ad_soyad}
                        onChange={(e) => setKurumForm({ ...kurumForm, yetkili_ad_soyad: e.target.value })}
                        placeholder="Yetkili kişinin adı soyadı"
                      />
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Vergi No</label>
                        <input
                          type="text"
                          className="form-control"
                          value={kurumForm.vergi_no}
                          onChange={(e) => setKurumForm({ ...kurumForm, vergi_no: e.target.value })}
                          placeholder="Vergi numarası"
                        />
                      </div>
                      <div className="form-group">
                        <label>Vergi Dairesi</label>
                        <input
                          type="text"
                          className="form-control"
                          value={kurumForm.vergi_dairesi}
                          onChange={(e) => setKurumForm({ ...kurumForm, vergi_dairesi: e.target.value })}
                          placeholder="Vergi dairesi"
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Adres</label>
                      <textarea
                        className="form-control"
                        rows={3}
                        value={kurumForm.adres}
                        onChange={(e) => setKurumForm({ ...kurumForm, adres: e.target.value })}
                        placeholder="Kurum adresi"
                      />
                    </div>
                    <div className="form-group">
                      <label className="checkbox-inline">
                        <input
                          type="checkbox"
                          checked={kurumForm.aktif_mi}
                          onChange={(e) => setKurumForm({ ...kurumForm, aktif_mi: e.target.checked })}
                        />
                        <span>Aktif</span>
                      </label>
                    </div>
                  </>
                )}

                {activeTab === "kurumlar" && kurumDrawerTab === "marka" && (
                  <KurumBrandingForm
                    kurumId={editingId}
                    kurumKod={kurumForm.kod}
                    form={brandingForm}
                    onChange={setBrandingForm}
                    previews={brandingPreviews}
                    onPreviewsChange={setBrandingPreviews}
                    onAssetsChange={refreshContextData}
                  />
                )}

                {/* Şube Form */}
                {activeTab === "subeler" && (
                  <SubeDrawerForm
                    form={subeForm}
                    onChange={setSubeForm}
                    kurumOptions={kurumOptions}
                  />
                )}

                {/* Eğitim Yılı Form */}
                {activeTab === "egitim_yillari" && (
                  <>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Başlangıç Yılı *</label>
                        <input
                          type="number"
                          className="form-control"
                          value={yilForm.baslangic_yil}
                          onChange={(e) => setYilForm({ ...yilForm, baslangic_yil: e.target.value })}
                          min="2020"
                          max="2050"
                        />
                      </div>
                      <div className="form-group">
                        <label>Bitiş Yılı *</label>
                        <input
                          type="number"
                          className="form-control"
                          value={yilForm.bitis_yil}
                          onChange={(e) => setYilForm({ ...yilForm, bitis_yil: e.target.value })}
                          min="2020"
                          max="2050"
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="checkbox-inline">
                        <input
                          type="checkbox"
                          checked={yilForm.aktif_mi}
                          onChange={(e) => setYilForm({ ...yilForm, aktif_mi: e.target.checked })}
                        />
                        <span>Aktif Yıl</span>
                      </label>
                    </div>
                  </>
                )}

                {/* Kayıt Türü Form */}
                {activeTab === "kayit_tanimlari" && (
                  <>
                    <div className="form-group">
                      <label>Kayıt Türü Adı *</label>
                      <input
                        type="text"
                        className="form-control"
                        value={kayitTuruForm.label}
                        onChange={(e) => setKayitTuruForm({ ...kayitTuruForm, label: e.target.value })}
                        placeholder="Örn: Asil"
                      />
                    </div>
                    <div className="form-group">
                      <label>Kod</label>
                      <input
                        type="text"
                        className="form-control"
                        value={kayitTuruForm.code}
                        onChange={(e) => setKayitTuruForm({ ...kayitTuruForm, code: e.target.value })}
                        placeholder="Boş bırakılırsa otomatik üretilir"
                        disabled={drawerMode === "edit"}
                      />
                    </div>
                    <div className="form-group">
                      <label>Sıra</label>
                      <input
                        type="number"
                        className="form-control"
                        value={kayitTuruForm.order}
                        onChange={(e) => setKayitTuruForm({ ...kayitTuruForm, order: e.target.value })}
                        min="1"
                        placeholder="Listeleme sırası"
                      />
                    </div>
                    <div className="form-group">
                      <label className="checkbox-inline">
                        <input
                          type="checkbox"
                          checked={kayitTuruForm.is_active}
                          onChange={(e) => setKayitTuruForm({ ...kayitTuruForm, is_active: e.target.checked })}
                        />
                        <span>Aktif</span>
                      </label>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="drawer-footer">
              <button className="btn-modern btn-secondary" onClick={() => setShowDrawer(false)}>
                İptal
              </button>
              <button
                className="btn-modern btn-primary"
                onClick={handleSave}
                disabled={saving || 
                  (activeTab === "kurumlar" && (!kurumForm.ad || !kurumForm.kod)) ||
                  (activeTab === "subeler" && (!subeForm.ad || !subeForm.kurum_id)) ||
                  (activeTab === "egitim_yillari" && (!yilForm.baslangic_yil || !yilForm.bitis_yil)) ||
                  (activeTab === "kayit_tanimlari" && !kayitTuruForm.label.trim())
                }
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
                {deletingItem.hasChildren ? "Silme İşlemi Yapılamaz" : "Silme Onayı"}
              </h3>
              <button className="modal-close" onClick={() => { setShowDeleteConfirm(false); setDeletingItem(null); }}>
                ×
              </button>
            </div>
            <div className="modal-body">
              {deletingItem.hasChildren ? (
                <div className="warning-box">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <p><strong>&quot;{deletingItem.ad}&quot;</strong> silinemez.</p>
                  <p className="text-muted">
                    Bu kayıta bağlı <strong>{deletingItem.childCount} {deletingItem.childType}</strong> bulunmaktadır.
                    Önce bağlı kayıtları silmeniz gerekmektedir.
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
              {deletingItem.hasChildren ? (
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
          width: 520px;
          max-width: 100%;
          height: 100vh;
          background: white;
          box-shadow: -4px 0 24px rgba(0, 0, 0, 0.15);
          z-index: 1001;
          display: flex;
          flex-direction: column;
          animation: slideIn 0.3s ease;
        }
        .drawer.drawer--brand,
        .drawer.drawer--sube {
          width: 640px;
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
          padding: 20px 24px 24px;
          background: #fff;
        }
        .drawer.drawer--brand .drawer-body,
        .drawer.drawer--sube .drawer-body {
          background: #fafbfc;
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
        textarea.form-control {
          resize: vertical;
          min-height: 80px;
        }
        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
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

        .drawer-segment {
          display: flex;
          gap: 4px;
          margin: 0 0 20px;
          padding: 4px;
          background: #f1f5f9;
          border-radius: 12px;
        }
        .drawer-segment-btn {
          flex: 1;
          padding: 10px 14px;
          border: none;
          border-radius: 9px;
          background: transparent;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          color: #64748b;
          transition: background 0.15s, color 0.15s, box-shadow 0.15s;
        }
        .drawer-segment-btn:hover {
          color: #0f172a;
        }
        .drawer-segment-btn.active {
          background: #fff;
          color: #0262a7;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
        }
        
        @media (max-width: 640px) {
          .drawer {
            width: 100%;
          }
          .form-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
