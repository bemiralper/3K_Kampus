"use client";

import { useState, useEffect, useCallback } from "react";
import { getContextHeaders, resolveApiUrl } from "@/lib/api";

function paketFetch(path: string, init?: RequestInit) {
  const url = resolveApiUrl(path.startsWith("/") ? path : `/${path}`);
  return fetch(url, {
    credentials: "include",
    ...init,
    headers: {
      ...getContextHeaders(),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
}

// Types
interface SinifSeviyesi {
  id: number;
  ad: string;
}

interface Alan {
  id: number;
  ad: string;
}

interface Ders {
  id: number;
  ad: string;
}

interface GrupDersi {
  id: number;
  ad: string;
  kod: string;
  fiyat: number;
  net_fiyat?: number;
  kdv_orani: number;
  kdv_dahil_fiyat: number;
  aktif_mi: boolean;
  aciklama: string;
  sinif_seviyeleri: SinifSeviyesi[];
  alan: Alan | null;
  dersler: Ders[];
  dahil_ek_hizmetler: { id: number; ad: string; hizmet_turu: string; fiyat: number }[];
  dahil_denemeler?: { id: number; ad: string; deneme_sayisi: number; fiyat: number }[];
  dahil_yayin_paketleri?: { id: number; ad: string; fiyat: number }[];
  kullanim_sayisi?: number;
}

interface OzelDers {
  id: number;
  ad: string;
  kod: string;
  fiyat: number;
  net_fiyat?: number;
  kdv_orani: number;
  kdv_dahil_fiyat: number;
  aktif_mi: boolean;
  aciklama: string;
  alan: Alan | null;
  sinif_seviyeleri: SinifSeviyesi[];
  dersler: Ders[];
  kullanim_sayisi?: number;
}

interface Deneme {
  id: number;
  ad: string;
  kod: string;
  deneme_sayisi: number;
  fiyat: number;
  net_fiyat?: number;
  kdv_orani: number;
  kdv_dahil_fiyat: number;
  aktif_mi: boolean;
  aciklama: string;
  sinif_seviyeleri: SinifSeviyesi[];
  kullanim_sayisi?: number;
}

interface EkHizmet {
  id: number;
  ad: string;
  kod: string;
  hizmet_turu: string;
  hizmet_turu_display: string;
  fiyat: number;
  net_fiyat?: number;
  kdv_orani: number;
  kdv_dahil_fiyat: number;
  aktif_mi: boolean;
  aciklama: string;
  sinif_seviyeleri: SinifSeviyesi[];
  deneme_paketi: { id: number; ad: string; deneme_sayisi: number } | null;
}

interface PremiumPaket {
  id: number;
  ad: string;
  kod: string;
  fiyat: number;
  net_fiyat?: number;
  kdv_orani: number;
  kdv_dahil_fiyat: number;
  aktif_mi: boolean;
  aciklama: string;
  sinif_seviyeleri: SinifSeviyesi[];
  dahil_ek_hizmetler: { id: number; ad: string; hizmet_turu: string; fiyat: number }[];
  dahil_denemeler: { id: number; ad: string; deneme_sayisi: number; fiyat: number }[];
  dahil_yayin_paketleri?: { id: number; ad: string; fiyat: number }[];
  kullanim_sayisi?: number;
}

interface YayinPaketi {
  id: number;
  ad: string;
  kod: string;
  fiyat: number;
  net_fiyat?: number;
  kdv_orani: number;
  kdv_dahil_fiyat: number;
  aktif_mi: boolean;
  aciklama: string;
  sinif_seviyeleri: SinifSeviyesi[];
  kullanim_sayisi?: number;
}

interface ReferansVeriler {
  sinif_seviyeleri: SinifSeviyesi[];
  alanlar: Alan[];
  dersler: Ders[];
  ek_hizmetler: { id: number; ad: string; hizmet_turu: string; fiyat: number }[];
  denemeler: { id: number; ad: string; kod: string; deneme_sayisi: number; fiyat: number }[];
  yayin_paketleri: { id: number; ad: string; kod: string; fiyat: number }[];
}

type PaketTuru = "grup_dersleri" | "ozel_dersler" | "denemeler" | "ek_hizmetler" | "premium_paketler" | "yayin_paketleri";

// Format currency helper
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const netFiyat = (item: { net_fiyat?: number; fiyat: number; kdv_dahil_fiyat?: number }) =>
  item.net_fiyat ?? item.fiyat;

const kdvDahilFiyat = (item: { kdv_dahil_fiyat?: number; fiyat: number }) =>
  item.kdv_dahil_fiyat ?? item.fiyat;

// Icons helper
const getIconColors = (index: number) => {
  const colors = ["blue", "green", "purple", "orange", "pink", "teal"];
  return colors[index % colors.length];
};

export default function EgitimPaketleriClient() {
  const [activeTab, setActiveTab] = useState<PaketTuru>("grup_dersleri");
  const [grupDersleri, setGrupDersleri] = useState<GrupDersi[]>([]);
  const [ozelDersler, setOzelDersler] = useState<OzelDers[]>([]);
  const [denemeler, setDenemeler] = useState<Deneme[]>([]);
  const [ekHizmetler, setEkHizmetler] = useState<EkHizmet[]>([]);
  const [premiumPaketler, setPremiumPaketler] = useState<PremiumPaket[]>([]);
  const [yayinPaketleri, setYayinPaketleri] = useState<YayinPaketi[]>([]);
  const [referansVeriler, setReferansVeriler] = useState<ReferansVeriler>({
    sinif_seviyeleri: [],
    alanlar: [],
    dersler: [],
    ek_hizmetler: [],
    denemeler: [],
    yayin_paketleri: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drawer states (Modal yerine Drawer kullanıyoruz)
  const [showDrawer, setShowDrawer] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deletingItem, setDeletingItem] = useState<{ ad: string; kullanim_sayisi: number } | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    ad: "",
    kod: "",
    fiyat: "",
    kdv_orani: "10",
    aciklama: "",
    aktif_mi: true,
    alan_id: "",
    dersler_ids: [] as number[],
    sinif_seviyeleri_ids: [] as number[],
    deneme_sayisi: "1",
    hizmet_turu: "",
    dahil_ek_hizmetler_ids: [] as number[],
    dahil_denemeler_ids: [] as number[],
    dahil_yayin_paketleri_ids: [] as number[],
    deneme_paketi_id: "" as string,
  });

  // Search state
  const [searchTerm, setSearchTerm] = useState("");

  // Fetch data functions
  const fetchGrupDersleri = useCallback(async () => {
    try {
      const res = await paketFetch(`/egitim-paketleri/api/grup-dersleri/`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setGrupDersleri(data.data);
      }
    } catch (err) {
      console.error("Grup dersleri yüklenemedi:", err);
    }
  }, []);

  const fetchOzelDersler = useCallback(async () => {
    try {
      const res = await paketFetch(`/egitim-paketleri/api/ozel-dersler/`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setOzelDersler(data.data);
      }
    } catch (err) {
      console.error("Özel dersler yüklenemedi:", err);
    }
  }, []);

  const fetchDenemeler = useCallback(async () => {
    try {
      const res = await paketFetch(`/egitim-paketleri/api/denemeler/`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setDenemeler(data.data);
      }
    } catch (err) {
      console.error("Denemeler yüklenemedi:", err);
    }
  }, []);

  const fetchEkHizmetler = useCallback(async () => {
    try {
      const res = await paketFetch(`/egitim-paketleri/api/ek-hizmetler/`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setEkHizmetler(data.data);
      }
    } catch (err) {
      console.error("Ek hizmetler yüklenemedi:", err);
    }
  }, []);

  const fetchPremiumPaketler = useCallback(async () => {
    try {
      const res = await paketFetch(`/egitim-paketleri/api/premium-paketler/`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setPremiumPaketler(data.data);
      }
    } catch (err) {
      console.error("Premium paketler yüklenemedi:", err);
    }
  }, []);

  const fetchYayinPaketleri = useCallback(async () => {
    try {
      const res = await paketFetch(`/egitim-paketleri/api/yayin-paketleri/`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setYayinPaketleri(data.data);
      }
    } catch (err) {
      console.error("Yayın paketleri yüklenemedi:", err);
    }
  }, []);

  const fetchReferansVeriler = useCallback(async () => {
    try {
      const res = await paketFetch(`/egitim-paketleri/api/referans-veriler/`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setReferansVeriler(data.data);
      } else {
        setError(data.error || "Referans veriler (sınıf seviyesi, alan) yüklenemedi.");
      }
    } catch (err) {
      console.error("Referans veriler yüklenemedi:", err);
      setError("Referans veriler yüklenemedi. Üst menüden şube seçili olduğundan emin olun.");
    }
  }, []);

  const loadAllData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([
        fetchGrupDersleri(),
        fetchOzelDersler(),
        fetchDenemeler(),
        fetchEkHizmetler(),
        fetchPremiumPaketler(),
        fetchYayinPaketleri(),
        fetchReferansVeriler(),
      ]);
    } catch (err) {
      setError("Veriler yüklenirken hata oluştu");
    } finally {
      setLoading(false);
    }
  }, [fetchGrupDersleri, fetchOzelDersler, fetchDenemeler, fetchEkHizmetler, fetchPremiumPaketler, fetchYayinPaketleri, fetchReferansVeriler]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Reset form
  const resetForm = () => {
    setFormData({
      ad: "",
      kod: "",
      fiyat: "",
      kdv_orani: "10",
      aciklama: "",
      aktif_mi: true,
      alan_id: "",
      dersler_ids: [],
      sinif_seviyeleri_ids: [],
      deneme_sayisi: "1",
      hizmet_turu: "",
      dahil_ek_hizmetler_ids: [],
      dahil_denemeler_ids: [],
      dahil_yayin_paketleri_ids: [],
      deneme_paketi_id: "",
    });
    setEditingId(null);
  };

  // Open drawer for create
  const handleOpenCreate = () => {
    resetForm();
    setDrawerMode("create");
    setShowDrawer(true);
  };

  // Open drawer for edit
  const handleOpenEdit = async (id: number) => {
    setDrawerMode("edit");
    setEditingId(id);

    let endpoint = "";
    if (activeTab === "grup_dersleri") {
      endpoint = `/egitim-paketleri/api/grup-dersleri/${id}/`;
    } else if (activeTab === "ozel_dersler") {
      endpoint = `/egitim-paketleri/api/ozel-dersler/${id}/`;
    } else if (activeTab === "ek_hizmetler") {
      endpoint = `/egitim-paketleri/api/ek-hizmetler/${id}/`;
    } else if (activeTab === "premium_paketler") {
      endpoint = `/egitim-paketleri/api/premium-paketler/${id}/`;
    } else if (activeTab === "yayin_paketleri") {
      endpoint = `/egitim-paketleri/api/yayin-paketleri/${id}/`;
    } else {
      endpoint = `/egitim-paketleri/api/denemeler/${id}/`;
    }

    try {
      const res = await paketFetch(endpoint, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        const item = data.data;
        const kdvDahilFiyatEdit = kdvDahilFiyat(item);
        setFormData({
          ad: item.ad || "",
          kod: item.kod || "",
          fiyat: kdvDahilFiyatEdit ? Math.round(kdvDahilFiyatEdit).toString() : "",
          kdv_orani: item.kdv_orani?.toString() || "10",
          aciklama: item.aciklama || "",
          aktif_mi: item.aktif_mi ?? true,
          alan_id: item.alan_id?.toString() || "",
          dersler_ids: item.dersler_ids || [],
          sinif_seviyeleri_ids: item.sinif_seviyeleri_ids || [],
          deneme_sayisi: item.deneme_sayisi?.toString() || "1",
          hizmet_turu: item.hizmet_turu || "",
          dahil_ek_hizmetler_ids: item.dahil_ek_hizmetler_ids || [],
          dahil_denemeler_ids: item.dahil_denemeler_ids || [],
          dahil_yayin_paketleri_ids: item.dahil_yayin_paketleri_ids || [],
          deneme_paketi_id: item.deneme_paketi_id?.toString() || "",
        });
        setShowDrawer(true);
      }
    } catch (err) {
      setError("Veri yüklenemedi");
    }
  };

  // Save (create or update)
  const handleSave = async () => {
    setSaving(true);
    setError(null);

    if (activeTab === "ek_hizmetler" && !formData.hizmet_turu) {
      setError("Hizmet türü seçilmelidir.");
      setSaving(false);
      return;
    }

    try {
      let endpoint = "";
      const kdvDahilFiyatValue = Math.round(parseFloat(formData.fiyat) || 0);
      const kdvOrani = parseFloat(formData.kdv_orani) || 10;

      let payload: Record<string, unknown> = {
        ad: formData.ad,
        kod: formData.kod,
        brut_fiyat: kdvDahilFiyatValue,
        fiyat: kdvDahilFiyatValue,
        kdv_orani: kdvOrani,
        aciklama: formData.aciklama,
        aktif_mi: formData.aktif_mi,
      };

      if (activeTab === "grup_dersleri") {
        endpoint = drawerMode === "create"
          ? `/egitim-paketleri/api/grup-dersleri/`
          : `/egitim-paketleri/api/grup-dersleri/${editingId}/`;
        payload = {
          ...payload,
          sinif_seviyeleri_ids: formData.sinif_seviyeleri_ids,
          alan_id: parseInt(formData.alan_id) || null,
          dersler_ids: formData.dersler_ids,
          dahil_ek_hizmetler_ids: formData.dahil_ek_hizmetler_ids,
          dahil_denemeler_ids: formData.dahil_denemeler_ids,
          dahil_yayin_paketleri_ids: formData.dahil_yayin_paketleri_ids,
        };
      } else if (activeTab === "ozel_dersler") {
        endpoint = drawerMode === "create"
          ? `/egitim-paketleri/api/ozel-dersler/`
          : `/egitim-paketleri/api/ozel-dersler/${editingId}/`;
        payload = {
          ...payload,
          sinif_seviyeleri_ids: formData.sinif_seviyeleri_ids,
          alan_id: parseInt(formData.alan_id) || null,
          dersler_ids: formData.dersler_ids,
        };
      } else if (activeTab === "ek_hizmetler") {
        endpoint = drawerMode === "create"
          ? `/egitim-paketleri/api/ek-hizmetler/`
          : `/egitim-paketleri/api/ek-hizmetler/${editingId}/`;
        payload = {
          ...payload,
          hizmet_turu: formData.hizmet_turu,
          sinif_seviyeleri_ids: formData.sinif_seviyeleri_ids,
          deneme_paketi_id: formData.hizmet_turu === "deneme" && formData.deneme_paketi_id
            ? parseInt(formData.deneme_paketi_id)
            : null,
        };
      } else if (activeTab === "premium_paketler") {
        endpoint = drawerMode === "create"
          ? `/egitim-paketleri/api/premium-paketler/`
          : `/egitim-paketleri/api/premium-paketler/${editingId}/`;
        payload = {
          ...payload,
          sinif_seviyeleri_ids: formData.sinif_seviyeleri_ids,
          dahil_ek_hizmetler_ids: formData.dahil_ek_hizmetler_ids,
          dahil_denemeler_ids: formData.dahil_denemeler_ids,
          dahil_yayin_paketleri_ids: formData.dahil_yayin_paketleri_ids,
        };
      } else if (activeTab === "yayin_paketleri") {
        endpoint = drawerMode === "create"
          ? `/egitim-paketleri/api/yayin-paketleri/`
          : `/egitim-paketleri/api/yayin-paketleri/${editingId}/`;
        payload = {
          ...payload,
          sinif_seviyeleri_ids: formData.sinif_seviyeleri_ids,
        };
      } else {
        endpoint = drawerMode === "create"
          ? `/egitim-paketleri/api/denemeler/`
          : `/egitim-paketleri/api/denemeler/${editingId}/`;
        payload = {
          ...payload,
          deneme_sayisi: parseInt(formData.deneme_sayisi) || 1,
          sinif_seviyeleri_ids: formData.sinif_seviyeleri_ids,
        };
      }

      const res = await paketFetch(endpoint, {
        method: drawerMode === "create" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (data.success) {
        setShowDrawer(false);
        resetForm();
        // Refresh data
        if (activeTab === "grup_dersleri") { await fetchGrupDersleri(); await fetchReferansVeriler(); }
        else if (activeTab === "ozel_dersler") await fetchOzelDersler();
        else if (activeTab === "ek_hizmetler") { await fetchEkHizmetler(); await fetchReferansVeriler(); }
        else if (activeTab === "premium_paketler") { await fetchPremiumPaketler(); await fetchReferansVeriler(); }
        else if (activeTab === "yayin_paketleri") await fetchYayinPaketleri();
        else { await fetchDenemeler(); await fetchReferansVeriler(); }
      } else {
        // Error bir object olabilir (ör: {kurum: "...", sube: "..."}) — string'e çevir
        const errMsg = typeof data.error === 'object' && data.error !== null
          ? Object.values(data.error).join(', ')
          : (data.error || "Kayıt başarısız");
        setError(errMsg);
      }
    } catch (err) {
      setError("Kayıt sırasında hata oluştu");
    } finally {
      setSaving(false);
    }
  };

  // Delete confirmation handler - kullanım kontrolü yapar
  const handleDeleteClick = (id: number, ad: string, kullanim_sayisi: number = 0) => {
    setDeletingId(id);
    setDeletingItem({ ad, kullanim_sayisi });
    setShowDeleteConfirm(true);
  };

  // Delete
  const handleDelete = async () => {
    if (!deletingId) return;
    
    // Kullanımda olan paket silinemez
    if (deletingItem && deletingItem.kullanim_sayisi > 0) {
      setError(`"${deletingItem.ad}" paketi ${deletingItem.kullanim_sayisi} öğrenci tarafından kullanılıyor ve silinemez.`);
      setShowDeleteConfirm(false);
      setDeletingId(null);
      setDeletingItem(null);
      return;
    }
    
    setSaving(true);

    try {
      let endpoint = "";
      if (activeTab === "grup_dersleri") {
        endpoint = `/egitim-paketleri/api/grup-dersleri/${deletingId}/`;
      } else if (activeTab === "ozel_dersler") {
        endpoint = `/egitim-paketleri/api/ozel-dersler/${deletingId}/`;
      } else if (activeTab === "ek_hizmetler") {
        endpoint = `/egitim-paketleri/api/ek-hizmetler/${deletingId}/`;
      } else if (activeTab === "premium_paketler") {
        endpoint = `/egitim-paketleri/api/premium-paketler/${deletingId}/`;
      } else if (activeTab === "yayin_paketleri") {
        endpoint = `/egitim-paketleri/api/yayin-paketleri/${deletingId}/`;
      } else {
        endpoint = `/egitim-paketleri/api/denemeler/${deletingId}/`;
      }

      const res = await paketFetch(endpoint, { method: "DELETE", credentials: 'include' });
      const data = await res.json();

      if (data.success) {
        setShowDeleteConfirm(false);
        setDeletingId(null);
        setDeletingItem(null);
        // Refresh data
        if (activeTab === "grup_dersleri") { await fetchGrupDersleri(); await fetchReferansVeriler(); }
        else if (activeTab === "ozel_dersler") await fetchOzelDersler();
        else if (activeTab === "ek_hizmetler") { await fetchEkHizmetler(); await fetchReferansVeriler(); }
        else if (activeTab === "premium_paketler") { await fetchPremiumPaketler(); await fetchReferansVeriler(); }
        else if (activeTab === "yayin_paketleri") await fetchYayinPaketleri();
        else { await fetchDenemeler(); await fetchReferansVeriler(); }
      } else {
        const errMsg = typeof data.error === 'object' && data.error !== null
          ? Object.values(data.error).join(', ')
          : (data.error || "Silme başarısız");
        setError(errMsg);
      }
    } catch (err) {
      setError("Silme sırasında hata oluştu");
    } finally {
      setSaving(false);
    }
  };

  // Filter data by search term
  const filterData = <T extends { ad: string; kod: string }>(items: T[]) => {
    if (!searchTerm) return items;
    const term = searchTerm.toLowerCase();
    return items.filter(
      (item) =>
        item.ad.toLowerCase().includes(term) ||
        item.kod.toLowerCase().includes(term)
    );
  };

  // Stats
  const grupCount = grupDersleri.length;
  const ozelCount = ozelDersler.length;
  const denemeCount = denemeler.length;
  const ekHizmetCount = ekHizmetler.length;
  const premiumCount = premiumPaketler.length;
  const yayinCount = yayinPaketleri.length;

  // Get drawer title
  const getDrawerTitle = () => {
    const action = drawerMode === "create" ? "Yeni" : "Düzenle";
    if (activeTab === "grup_dersleri") return `${action} Grup Dersi`;
    if (activeTab === "ozel_dersler") return `${action} Özel Ders`;
    if (activeTab === "ek_hizmetler") return `${action} Ek Hizmet`;
    if (activeTab === "premium_paketler") return `${action} Premium Paket`;
    if (activeTab === "yayin_paketleri") return `${action} Yayın Paketi`;
    return `${action} Deneme`;
  };

  if (loading) {
    return (
      <div className="section">
        <div className="page-header">
          <div className="page-header-left">
            <h2>Eğitim Paketleri</h2>
          </div>
        </div>
        <div className="card-modern">
          <div className="card-modern-body" style={{ textAlign: "center", padding: "60px" }}>
            <div className="loading-spinner"></div>
            <p style={{ marginTop: "16px", color: "#666" }}>Yükleniyor...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="section">
      {/* Hero Header */}
      <div className="hero-header">
        <div className="hero-content">
          <div className="hero-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </div>
          <div className="hero-text">
            <h1>Eğitim Paketleri</h1>
            <div className="hero-breadcrumb">
              <a href="/dashboard">Ana Sayfa</a>
              <span>/</span>
              <span>Eğitim Paketleri</span>
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
          <span>Yeni Paket Ekle</span>
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

      {/* Quick Stats - Toplam Değer kaldırıldı */}
      <div className="quick-stats">
        <div className="quick-stat">
          <div className="quick-stat-icon blue">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div className="quick-stat-info">
            <h4>{grupCount}</h4>
            <span>Grup Dersi</span>
          </div>
        </div>
        <div className="quick-stat">
          <div className="quick-stat-icon green">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <div className="quick-stat-info">
            <h4>{ozelCount}</h4>
            <span>Özel Ders</span>
          </div>
        </div>
        <div className="quick-stat">
          <div className="quick-stat-icon purple">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          </div>
          <div className="quick-stat-info">
            <h4>{denemeCount}</h4>
            <span>Deneme Paketi</span>
          </div>
        </div>
        <div className="quick-stat">
          <div className="quick-stat-icon orange">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </div>
          <div className="quick-stat-info">
            <h4>{ekHizmetCount}</h4>
            <span>Ek Hizmet</span>
          </div>
        </div>
        <div className="quick-stat">
          <div className="quick-stat-icon pink">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4-6.3-4.6L5.7 21.4 8 14 2 9.4h7.6L12 2z" />
            </svg>
          </div>
          <div className="quick-stat-info">
            <h4>{premiumCount}</h4>
            <span>Premium Paket</span>
          </div>
        </div>
        <div className="quick-stat">
          <div className="quick-stat-icon teal">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </div>
          <div className="quick-stat-info">
            <h4>{yayinCount}</h4>
            <span>Yayın Paketi</span>
          </div>
        </div>
      </div>

      {/* Modern Tabs - Global CSS kullanılacak */}
      <div className="tabs-modern">
        <a
          className={`tab-modern ${activeTab === "grup_dersleri" ? "active" : ""}`}
          onClick={(e) => { e.preventDefault(); setActiveTab("grup_dersleri"); }}
          href="#"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          Grup Dersleri
          <span className="tab-count">{grupCount}</span>
        </a>
        <a
          className={`tab-modern ${activeTab === "ozel_dersler" ? "active" : ""}`}
          onClick={(e) => { e.preventDefault(); setActiveTab("ozel_dersler"); }}
          href="#"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          Özel Dersler
          <span className="tab-count">{ozelCount}</span>
        </a>
        <a
          className={`tab-modern ${activeTab === "denemeler" ? "active" : ""}`}
          onClick={(e) => { e.preventDefault(); setActiveTab("denemeler"); }}
          href="#"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          Denemeler
          <span className="tab-count">{denemeCount}</span>
        </a>
        <a
          className={`tab-modern ${activeTab === "ek_hizmetler" ? "active" : ""}`}
          onClick={(e) => { e.preventDefault(); setActiveTab("ek_hizmetler"); }}
          href="#"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
          Ek Hizmetler
          <span className="tab-count">{ekHizmetCount}</span>
        </a>
        <a
          className={`tab-modern ${activeTab === "premium_paketler" ? "active" : ""}`}
          onClick={(e) => { e.preventDefault(); setActiveTab("premium_paketler"); }}
          href="#"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4-6.3-4.6L5.7 21.4 8 14 2 9.4h7.6L12 2z" />
          </svg>
          Premium Paketler
          <span className="tab-count">{premiumCount}</span>
        </a>
        <a
          className={`tab-modern ${activeTab === "yayin_paketleri" ? "active" : ""}`}
          onClick={(e) => { e.preventDefault(); setActiveTab("yayin_paketleri"); }}
          href="#"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
          Yayın Paketleri
          <span className="tab-count">{yayinCount}</span>
        </a>
      </div>

      {/* Content based on active tab */}
      <div className="card-modern">
        <div className="card-modern-header">
          <h3>
            {activeTab === "grup_dersleri" && "Grup Dersleri Paketleri"}
            {activeTab === "ozel_dersler" && "Özel Ders Paketleri"}
            {activeTab === "denemeler" && "Deneme Paketleri"}
            {activeTab === "ek_hizmetler" && "Ek Hizmetler"}
            {activeTab === "premium_paketler" && "Premium Paketler"}
            {activeTab === "yayin_paketleri" && "Yayın Paketleri"}
          </h3>
          <div className="card-modern-header-actions">
            <div className="search-modern">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Paket ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="card-modern-body">
          {/* Grup Dersleri Tab */}
          {activeTab === "grup_dersleri" && (
            <>
              {filterData(grupDersleri).length > 0 ? (
                <table className="table-modern">
                  <thead>
                    <tr>
                      <th>Paket Bilgisi</th>
                      <th>Kod</th>
                      <th>Sınıf/Alan</th>
                      <th>Fiyat</th>
                      <th>Durum</th>
                      <th style={{ width: "100px" }}>İşlemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filterData(grupDersleri).map((paket, index) => (
                      <tr key={paket.id}>
                        <td>
                          <div className="cell-with-icon">
                            <div className={`cell-icon ${getIconColors(index)}`}>
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                <circle cx="9" cy="7" r="4" />
                              </svg>
                            </div>
                            <div className="cell-info">
                              <span className="cell-primary">{paket.ad}</span>
                              <span className="cell-secondary">
                                {paket.dersler.length} Ders
                                {paket.dahil_ek_hizmetler && paket.dahil_ek_hizmetler.length > 0 && (
                                  <> · {paket.dahil_ek_hizmetler.map(h => h.ad).join(", ")}</>
                                )}
                                {paket.dahil_denemeler && paket.dahil_denemeler.length > 0 && (
                                  <> · {paket.dahil_denemeler.map(d => d.ad).join(", ")}</>
                                )}
                                {paket.dahil_yayin_paketleri && paket.dahil_yayin_paketleri.length > 0 && (
                                  <> · {paket.dahil_yayin_paketleri.map(y => y.ad).join(", ")}</>
                                )}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="badge-modern primary">{paket.kod}</span>
                        </td>
                        <td>
                          <span className="cell-secondary">
                            {paket.sinif_seviyeleri?.map((s) => s.ad).join(", ") || "-"}
                            {paket.alan && ` / ${paket.alan.ad}`}
                          </span>
                        </td>
                        <td>
                          <div>
                            <span className="price-tag">{formatCurrency(kdvDahilFiyat(paket))}</span>
                            {paket.kdv_orani > 0 && (
                              <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>
                                KDV Hariç: {formatCurrency(netFiyat(paket))}
                              </div>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className={`badge-modern ${paket.aktif_mi ? "success" : "danger"}`}>
                            {paket.aktif_mi ? "Aktif" : "Pasif"}
                          </span>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              className="row-action-btn"
                              title="Düzenle"
                              onClick={() => handleOpenEdit(paket.id)}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                            <button
                              className="row-action-btn danger"
                              title="Sil"
                              onClick={() => handleDeleteClick(paket.id, paket.ad, paket.kullanim_sayisi || 0)}
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
                  <div className="empty-state-icon">👥</div>
                  <h4>Henüz grup dersi paketi eklenmemiş</h4>
                  <p>İlk grup dersi paketinizi ekleyerek başlayın</p>
                  <button className="btn-modern btn-primary" onClick={handleOpenCreate}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Paket Ekle
                  </button>
                </div>
              )}
            </>
          )}

          {/* Özel Dersler Tab */}
          {activeTab === "ozel_dersler" && (
            <>
              {filterData(ozelDersler).length > 0 ? (
                <table className="table-modern">
                  <thead>
                    <tr>
                      <th>Paket Bilgisi</th>
                      <th>Kod</th>
                      <th>Sınıf Seviyeleri</th>
                      <th>Fiyat</th>
                      <th>Durum</th>
                      <th style={{ width: "100px" }}>İşlemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filterData(ozelDersler).map((paket, index) => (
                      <tr key={paket.id}>
                        <td>
                          <div className="cell-with-icon">
                            <div className={`cell-icon ${getIconColors(index)}`}>
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                <circle cx="12" cy="7" r="4" />
                              </svg>
                            </div>
                            <div className="cell-info">
                              <span className="cell-primary">{paket.ad}</span>
                              <span className="cell-secondary">
                                {paket.dersler.length} Ders
                              </span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="badge-modern primary">{paket.kod}</span>
                        </td>
                        <td>
                          <span className="cell-secondary">
                            {paket.sinif_seviyeleri.map((s) => s.ad).join(", ") || "-"}
                          </span>
                        </td>
                        <td>
                          <div>
                            <span className="price-tag">{formatCurrency(kdvDahilFiyat(paket))}</span>
                            {paket.kdv_orani > 0 && (
                              <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>
                                KDV Hariç: {formatCurrency(netFiyat(paket))}
                              </div>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className={`badge-modern ${paket.aktif_mi ? "success" : "danger"}`}>
                            {paket.aktif_mi ? "Aktif" : "Pasif"}
                          </span>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              className="row-action-btn"
                              title="Düzenle"
                              onClick={() => handleOpenEdit(paket.id)}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                            <button
                              className="row-action-btn danger"
                              title="Sil"
                              onClick={() => handleDeleteClick(paket.id, paket.ad, paket.kullanim_sayisi || 0)}
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
                  <div className="empty-state-icon">👤</div>
                  <h4>Henüz özel ders paketi eklenmemiş</h4>
                  <p>İlk özel ders paketinizi ekleyerek başlayın</p>
                  <button className="btn-modern btn-primary" onClick={handleOpenCreate}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Paket Ekle
                  </button>
                </div>
              )}
            </>
          )}

          {/* Denemeler Tab */}
          {activeTab === "denemeler" && (
            <>
              {filterData(denemeler).length > 0 ? (
                <table className="table-modern">
                  <thead>
                    <tr>
                      <th>Paket Bilgisi</th>
                      <th>Kod</th>
                      <th>Deneme Sayısı</th>
                      <th>Fiyat</th>
                      <th>Durum</th>
                      <th style={{ width: "100px" }}>İşlemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filterData(denemeler).map((paket, index) => (
                      <tr key={paket.id}>
                        <td>
                          <div className="cell-with-icon">
                            <div className={`cell-icon ${getIconColors(index)}`}>
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M9 11l3 3L22 4" />
                                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                              </svg>
                            </div>
                            <div className="cell-info">
                              <span className="cell-primary">{paket.ad}</span>
                              <span className="cell-secondary">
                                {paket.sinif_seviyeleri.length} Seviye
                              </span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="badge-modern primary">{paket.kod}</span>
                        </td>
                        <td>
                          <span className="badge-modern purple">{paket.deneme_sayisi} Deneme</span>
                        </td>
                        <td>
                          <div>
                            <span className="price-tag">{formatCurrency(kdvDahilFiyat(paket))}</span>
                            {paket.kdv_orani > 0 && (
                              <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>
                                KDV Hariç: {formatCurrency(netFiyat(paket))}
                              </div>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className={`badge-modern ${paket.aktif_mi ? "success" : "danger"}`}>
                            {paket.aktif_mi ? "Aktif" : "Pasif"}
                          </span>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              className="row-action-btn"
                              title="Düzenle"
                              onClick={() => handleOpenEdit(paket.id)}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                            <button
                              className="row-action-btn danger"
                              title="Sil"
                              onClick={() => handleDeleteClick(paket.id, paket.ad, paket.kullanim_sayisi || 0)}
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
                  <div className="empty-state-icon">📋</div>
                  <h4>Henüz deneme paketi eklenmemiş</h4>
                  <p>İlk deneme paketinizi ekleyerek başlayın</p>
                  <button className="btn-modern btn-primary" onClick={handleOpenCreate}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Paket Ekle
                  </button>
                </div>
              )}
            </>
          )}

          {/* Ek Hizmetler Tab */}
          {activeTab === "ek_hizmetler" && (
            <>
              {filterData(ekHizmetler).length > 0 ? (
                <table className="table-modern">
                  <thead>
                    <tr>
                      <th>Hizmet Bilgisi</th>
                      <th>Kod</th>
                      <th>Tür</th>
                      <th>Sınıf Seviyeleri</th>
                      <th>Fiyat</th>
                      <th>Durum</th>
                      <th style={{ width: "100px" }}>İşlemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filterData(ekHizmetler).map((hizmet, index) => (
                      <tr key={hizmet.id}>
                        <td>
                          <div className="cell-with-icon">
                            <div className={`cell-icon ${getIconColors(index)}`}>
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                              </svg>
                            </div>
                            <div className="cell-info">
                              <span className="cell-primary">{hizmet.ad}</span>
                              <span className="cell-secondary">{hizmet.aciklama || '-'}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="badge-modern primary">{hizmet.kod}</span>
                        </td>
                        <td>
                          <span className={`badge-modern ${hizmet.hizmet_turu === 'kutuphane' ? 'info' : hizmet.hizmet_turu === 'kocluk' ? 'warning' : 'success'}`}>
                            {hizmet.hizmet_turu_display}
                          </span>
                        </td>
                        <td>
                          <span className="cell-secondary">
                            {hizmet.sinif_seviyeleri?.map((s) => s.ad).join(", ") || "-"}
                          </span>
                        </td>
                        <td>
                          <div>
                            <span className="price-tag">{formatCurrency(kdvDahilFiyat(hizmet))}</span>
                            {hizmet.kdv_orani > 0 && (
                              <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>
                                KDV Hariç: {formatCurrency(netFiyat(hizmet))}
                              </div>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className={`badge-modern ${hizmet.aktif_mi ? "success" : "danger"}`}>
                            {hizmet.aktif_mi ? "Aktif" : "Pasif"}
                          </span>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              className="row-action-btn"
                              title="Düzenle"
                              onClick={() => handleOpenEdit(hizmet.id)}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                            <button
                              className="row-action-btn danger"
                              title="Sil"
                              onClick={() => handleDeleteClick(hizmet.id, hizmet.ad, 0)}
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
                  <div className="empty-state-icon">⭐</div>
                  <h4>Henüz ek hizmet eklenmemiş</h4>
                  <p>Kütüphane, koçluk veya deneme ek hizmetlerini ekleyin</p>
                  <button className="btn-modern btn-primary" onClick={handleOpenCreate}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Ek Hizmet Ekle
                  </button>
                </div>
              )}
            </>
          )}

          {/* Premium Paketler Tab */}
          {activeTab === "premium_paketler" && (
            <>
              {filterData(premiumPaketler).length > 0 ? (
                <table className="table-modern">
                  <thead>
                    <tr>
                      <th>Paket Bilgisi</th>
                      <th>Kod</th>
                      <th>Sınıf Seviyeleri</th>
                      <th>Fiyat</th>
                      <th>Durum</th>
                      <th style={{ width: "100px" }}>İşlemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filterData(premiumPaketler).map((paket, index) => (
                      <tr key={paket.id}>
                        <td>
                          <div className="cell-with-icon">
                            <div className={`cell-icon ${getIconColors(index)}`}>
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4-6.3-4.6L5.7 21.4 8 14 2 9.4h7.6L12 2z" />
                              </svg>
                            </div>
                            <div className="cell-info">
                              <span className="cell-primary">{paket.ad}</span>
                              <span className="cell-secondary">
                                {paket.dahil_ek_hizmetler.length + paket.dahil_denemeler.length + (paket.dahil_yayin_paketleri?.length || 0)} dahil kalem
                                {paket.dahil_ek_hizmetler.length > 0 && (
                                  <> · {paket.dahil_ek_hizmetler.map(h => h.ad).join(", ")}</>
                                )}
                                {paket.dahil_denemeler.length > 0 && (
                                  <> · {paket.dahil_denemeler.map(d => d.ad).join(", ")}</>
                                )}
                                {paket.dahil_yayin_paketleri && paket.dahil_yayin_paketleri.length > 0 && (
                                  <> · {paket.dahil_yayin_paketleri.map(y => y.ad).join(", ")}</>
                                )}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="badge-modern primary">{paket.kod}</span>
                        </td>
                        <td>
                          <span className="cell-secondary">
                            {paket.sinif_seviyeleri?.map((s) => s.ad).join(", ") || "-"}
                          </span>
                        </td>
                        <td>
                          <div>
                            <span className="price-tag">{formatCurrency(kdvDahilFiyat(paket))}</span>
                            {paket.kdv_orani > 0 && (
                              <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>
                                KDV Hariç: {formatCurrency(netFiyat(paket))}
                              </div>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className={`badge-modern ${paket.aktif_mi ? "success" : "danger"}`}>
                            {paket.aktif_mi ? "Aktif" : "Pasif"}
                          </span>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button className="row-action-btn" title="Düzenle" onClick={() => handleOpenEdit(paket.id)}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                            <button className="row-action-btn danger" title="Sil" onClick={() => handleDeleteClick(paket.id, paket.ad, paket.kullanim_sayisi || 0)}>
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
                  <div className="empty-state-icon">⭐</div>
                  <h4>Henüz premium paket eklenmemiş</h4>
                  <p>Ücretli ek hizmet ve deneme paketlerini ücretsiz dahil ederek premium paket oluşturun</p>
                  <button className="btn-modern btn-primary" onClick={handleOpenCreate}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Premium Paket Ekle
                  </button>
                </div>
              )}
            </>
          )}

          {/* Yayın Paketleri Tab */}
          {activeTab === "yayin_paketleri" && (
            <>
              {filterData(yayinPaketleri).length > 0 ? (
                <table className="table-modern">
                  <thead>
                    <tr>
                      <th>Paket Bilgisi</th>
                      <th>Kod</th>
                      <th>Sınıf Seviyeleri</th>
                      <th>Fiyat</th>
                      <th>Durum</th>
                      <th style={{ width: "100px" }}>İşlemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filterData(yayinPaketleri).map((paket, index) => (
                      <tr key={paket.id}>
                        <td>
                          <div className="cell-with-icon">
                            <div className={`cell-icon ${getIconColors(index)}`}>
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                              </svg>
                            </div>
                            <div className="cell-info">
                              <span className="cell-primary">{paket.ad}</span>
                              <span className="cell-secondary">
                                {paket.aciklama || "Yayın paketi"}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="badge-modern primary">{paket.kod}</span>
                        </td>
                        <td>
                          <span className="cell-secondary">
                            {paket.sinif_seviyeleri?.map((s) => s.ad).join(", ") || "-"}
                          </span>
                        </td>
                        <td>
                          <div>
                            <span className="price-tag">{formatCurrency(kdvDahilFiyat(paket))}</span>
                            {paket.kdv_orani > 0 && (
                              <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>
                                KDV Hariç: {formatCurrency(netFiyat(paket))}
                              </div>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className={`badge-modern ${paket.aktif_mi ? "success" : "danger"}`}>
                            {paket.aktif_mi ? "Aktif" : "Pasif"}
                          </span>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button className="row-action-btn" title="Düzenle" onClick={() => handleOpenEdit(paket.id)}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                            <button className="row-action-btn danger" title="Sil" onClick={() => handleDeleteClick(paket.id, paket.ad, paket.kullanim_sayisi || 0)}>
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
                  <div className="empty-state-icon">📚</div>
                  <h4>Henüz yayın paketi eklenmemiş</h4>
                  <p>Grup derslerini ve premium paketleri ücretsiz dahil ederek yayın paketi oluşturun</p>
                  <button className="btn-modern btn-primary" onClick={handleOpenCreate}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Yayın Paketi Ekle
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Drawer for Create/Edit */}
      {showDrawer && (
        <>
          <div className="drawer-overlay" onClick={() => setShowDrawer(false)} />
          <div className="drawer">
            <div className="drawer-header">
              <h3>{getDrawerTitle()}</h3>
              <button className="drawer-close" onClick={() => setShowDrawer(false)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="drawer-body">
              <div className="drawer-form">
                <div className="form-group">
                  <label>Paket Adı *</label>
                  <input
                    type="text"
                    className="form-control"
                    value={formData.ad}
                    onChange={(e) => setFormData({ ...formData, ad: e.target.value })}
                    placeholder="Örn: 12. Sınıf Sayısal Grup"
                  />
                </div>
                <div className="form-group">
                  <label>Kod *</label>
                  <input
                    type="text"
                    className="form-control"
                    value={formData.kod}
                    onChange={(e) => setFormData({ ...formData, kod: e.target.value })}
                    placeholder="Örn: GD_12_SAY"
                  />
                </div>
                <div className="form-group">
                  <label>KDV Dahil Fiyat (TL) *</label>
                  <input
                    type="number"
                    className="form-control"
                    value={formData.fiyat}
                    onChange={(e) => setFormData({ ...formData, fiyat: e.target.value })}
                    placeholder="0"
                    min="0"
                  />
                  {formData.fiyat && parseFloat(formData.fiyat) > 0 && (
                    <small style={{ color: "#059669", fontSize: "12px", marginTop: "4px", display: "block" }}>
                      KDV Hariç: {formatCurrency(
                        parseFloat(formData.fiyat) / (1 + parseFloat(formData.kdv_orani) / 100)
                      )}
                    </small>
                  )}
                </div>

                <div className="form-group">
                  <label>KDV Oranı (%)</label>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <select
                      className="form-control"
                      value={formData.kdv_orani}
                      onChange={(e) => setFormData({ ...formData, kdv_orani: e.target.value })}
                      style={{ flex: 1 }}
                    >
                      <option value="0">%0 — KDV Yok</option>
                      <option value="1">%1</option>
                      <option value="8">%8</option>
                      <option value="10">%10 (Varsayılan)</option>
                      <option value="18">%18</option>
                      <option value="20">%20</option>
                    </select>
                    {formData.fiyat && parseFloat(formData.fiyat) > 0 && (
                      <span style={{ fontSize: "12px", color: "#059669", whiteSpace: "nowrap", fontWeight: 600 }}>
                        KDV Hariç: {formatCurrency(
                          parseFloat(formData.fiyat) / (1 + parseFloat(formData.kdv_orani) / 100)
                        )}
                      </span>
                    )}
                  </div>
                </div>

                {/* Sınıf Seviyeleri - Tüm paket tipleri için çoklu seçim */}
                {activeTab !== "ek_hizmetler" ? null : (
                  <div className="form-group">
                    <label>Hizmet Türü *</label>
                    <select
                      className="form-control"
                      value={formData.hizmet_turu}
                      onChange={(e) => setFormData({ ...formData, hizmet_turu: e.target.value })}
                    >
                      <option value="">Hizmet türü seçin</option>
                      <option value="kutuphane">Kütüphane</option>
                      <option value="kocluk">Koçluk</option>
                      <option value="deneme">Deneme</option>
                    </select>
                  </div>
                )}

                {/* Deneme Paketi - Ek hizmet türü deneme ise */}
                {activeTab === "ek_hizmetler" && formData.hizmet_turu === "deneme" && (
                  <div className="form-group">
                    <label>İlişkili Deneme Paketi</label>
                    <select
                      className="form-control"
                      value={formData.deneme_paketi_id}
                      onChange={(e) => setFormData({ ...formData, deneme_paketi_id: e.target.value })}
                    >
                      <option value="">Seçiniz (Opsiyonel)</option>
                      {referansVeriler.denemeler?.map((d: any) => (
                        <option key={d.id} value={d.id}>
                          {d.ad} ({d.deneme_sayisi} deneme)
                        </option>
                      ))}
                    </select>
                    <small style={{ color: "#6b7280", fontSize: "11px" }}>
                      Bu ek hizmeti bir deneme paketi ile ilişkilendirebilirsiniz
                    </small>
                  </div>
                )}

                <div className="form-group">
                  <label>Sınıf Seviyeleri {activeTab !== "denemeler" ? "" : "*"}</label>
                  <div className="checkbox-group">
                    {referansVeriler.sinif_seviyeleri.map((s) => (
                      <label key={s.id} className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={formData.sinif_seviyeleri_ids.includes(s.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormData({
                                ...formData,
                                sinif_seviyeleri_ids: [...formData.sinif_seviyeleri_ids, s.id],
                              });
                            } else {
                              setFormData({
                                ...formData,
                                sinif_seviyeleri_ids: formData.sinif_seviyeleri_ids.filter(
                                  (id) => id !== s.id
                                ),
                              });
                            }
                          }}
                        />
                        {s.ad}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Alan - Grup ve Özel için */}
                {(activeTab === "grup_dersleri" || activeTab === "ozel_dersler") && (
                  <div className="form-group">
                    <label>Alan</label>
                    <select
                      className="form-control"
                      value={formData.alan_id}
                      onChange={(e) => setFormData({ ...formData, alan_id: e.target.value })}
                    >
                      <option value="">Seçiniz (Opsiyonel)</option>
                      {referansVeriler.alanlar.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.ad}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Deneme Sayısı - Sadece Deneme için */}
                {activeTab === "denemeler" && (
                  <div className="form-group">
                    <label>Deneme Sayısı *</label>
                    <input
                      type="number"
                      className="form-control"
                      value={formData.deneme_sayisi}
                      onChange={(e) => setFormData({ ...formData, deneme_sayisi: e.target.value })}
                      min="1"
                    />
                  </div>
                )}

                {/* Dersler - Grup ve Özel için */}
                {(activeTab === "grup_dersleri" || activeTab === "ozel_dersler") && (
                  <div className="form-group">
                    <label>Dersler</label>
                    <div className="checkbox-group">
                      {referansVeriler.dersler.map((d) => (
                        <label key={d.id} className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={formData.dersler_ids.includes(d.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData({
                                  ...formData,
                                  dersler_ids: [...formData.dersler_ids, d.id],
                                });
                              } else {
                                setFormData({
                                  ...formData,
                                  dersler_ids: formData.dersler_ids.filter((id) => id !== d.id),
                                });
                              }
                            }}
                          />
                          {d.ad}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Dahil Ek Hizmetler - Grup Dersi ve Premium Paket için */}
                {(activeTab === "grup_dersleri" || activeTab === "premium_paketler") && referansVeriler.ek_hizmetler.filter(h => h.hizmet_turu !== "deneme").length > 0 && (
                  <div className="form-group">
                    <label>Dahil Ek Hizmetler</label>
                    <p className="form-help-text" style={{ fontSize: "12px", color: "#888", marginBottom: "8px" }}>
                      Bu pakete kayıt olan öğrencilere ücretsiz olarak dahil edilecek hizmetler
                    </p>
                    <div className="checkbox-group">
                      {referansVeriler.ek_hizmetler.filter(h => h.hizmet_turu !== "deneme").map((h) => (
                        <label key={h.id} className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={formData.dahil_ek_hizmetler_ids.includes(h.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData({
                                  ...formData,
                                  dahil_ek_hizmetler_ids: [...formData.dahil_ek_hizmetler_ids, h.id],
                                });
                              } else {
                                setFormData({
                                  ...formData,
                                  dahil_ek_hizmetler_ids: formData.dahil_ek_hizmetler_ids.filter((id) => id !== h.id),
                                });
                              }
                            }}
                          />
                          {h.ad} ({formatCurrency(kdvDahilFiyat(h))})
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {(activeTab === "grup_dersleri" || activeTab === "premium_paketler") && referansVeriler.denemeler.length > 0 && (
                  <div className="form-group">
                    <label>Dahil Deneme Paketleri</label>
                    <p className="form-help-text" style={{ fontSize: "12px", color: "#888", marginBottom: "8px" }}>
                      Bu pakete kayıt olan öğrencilere ücretsiz olarak dahil edilecek deneme paketleri
                    </p>
                    <div className="checkbox-group">
                      {referansVeriler.denemeler.map((d) => (
                        <label key={d.id} className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={formData.dahil_denemeler_ids.includes(d.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData({
                                  ...formData,
                                  dahil_denemeler_ids: [...formData.dahil_denemeler_ids, d.id],
                                });
                              } else {
                                setFormData({
                                  ...formData,
                                  dahil_denemeler_ids: formData.dahil_denemeler_ids.filter((id) => id !== d.id),
                                });
                              }
                            }}
                          />
                          {d.ad} ({d.deneme_sayisi} deneme · {formatCurrency(kdvDahilFiyat(d))})
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Dahil Yayın Paketleri - Grup Dersi ve Premium Paket için */}
                {(activeTab === "grup_dersleri" || activeTab === "premium_paketler") && referansVeriler.yayin_paketleri.length > 0 && (
                  <div className="form-group">
                    <label>Dahil Yayın Paketleri</label>
                    <p className="form-help-text" style={{ fontSize: "12px", color: "#888", marginBottom: "8px" }}>
                      Bu pakete kayıt olan öğrencilere ücretsiz olarak dahil edilecek yayın paketleri
                    </p>
                    <div className="checkbox-group">
                      {referansVeriler.yayin_paketleri.map((y) => (
                        <label key={y.id} className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={formData.dahil_yayin_paketleri_ids.includes(y.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData({
                                  ...formData,
                                  dahil_yayin_paketleri_ids: [...formData.dahil_yayin_paketleri_ids, y.id],
                                });
                              } else {
                                setFormData({
                                  ...formData,
                                  dahil_yayin_paketleri_ids: formData.dahil_yayin_paketleri_ids.filter((id) => id !== y.id),
                                });
                              }
                            }}
                          />
                          {y.ad} ({formatCurrency(y.fiyat)})
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label>Açıklama</label>
                  <textarea
                    className="form-control"
                    rows={3}
                    value={formData.aciklama}
                    onChange={(e) => setFormData({ ...formData, aciklama: e.target.value })}
                    placeholder="Paket hakkında açıklama..."
                  />
                </div>

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
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => { setShowDeleteConfirm(false); setDeletingItem(null); }}>
          <div className="modal-content modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {deletingItem && deletingItem.kullanim_sayisi > 0 ? "Silme İşlemi Yapılamaz" : "Silme Onayı"}
              </h3>
              <button className="modal-close" onClick={() => { setShowDeleteConfirm(false); setDeletingItem(null); }}>
                ×
              </button>
            </div>
            <div className="modal-body">
              {deletingItem && deletingItem.kullanim_sayisi > 0 ? (
                <div className="warning-box">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <p><strong>&quot;{deletingItem.ad}&quot;</strong> paketi <strong>{deletingItem.kullanim_sayisi} öğrenci</strong> tarafından kullanılmaktadır.</p>
                  <p className="text-muted">Kullanılan paketler silinemez. Önce paketin kullanımdan kaldırılması gerekir.</p>
                </div>
              ) : (
                <>
                  <p><strong>&quot;{deletingItem?.ad}&quot;</strong> paketini silmek istediğinizden emin misiniz?</p>
                  <p className="text-danger">Bu işlem geri alınamaz!</p>
                </>
              )}
            </div>
            <div className="modal-footer">
              {deletingItem && deletingItem.kullanim_sayisi > 0 ? (
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
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
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
        textarea.form-control {
          resize: vertical;
          min-height: 80px;
        }
        .checkbox-group {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          padding: 12px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          max-height: 180px;
          overflow-y: auto;
          background: #f9fafb;
        }
        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          font-size: 13px;
          padding: 6px 10px;
          border-radius: 6px;
          background: white;
          border: 1px solid #e5e7eb;
          transition: all 0.2s;
        }
        .checkbox-label:hover {
          border-color: #2563eb;
        }
        .checkbox-label input[type="checkbox"] {
          width: 16px;
          height: 16px;
          cursor: pointer;
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
        .modal-sm {
          max-width: 420px;
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
        .modal-close:hover {
          color: #111827;
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
        .loading-spinner {
          width: 40px;
          height: 40px;
          border: 3px solid #e5e7eb;
          border-top-color: #2563eb;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto;
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
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
