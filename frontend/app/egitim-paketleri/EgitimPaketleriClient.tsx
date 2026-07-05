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

interface ReferansVeriler {
  sinif_seviyeleri: SinifSeviyesi[];
  alanlar: Alan[];
  dersler: Ders[];
  ek_hizmetler: { id: number; ad: string; hizmet_turu: string; fiyat: number }[];
  denemeler: { id: number; ad: string; kod: string; deneme_sayisi: number; fiyat: number }[];
}

// Ek Hizmet Satış types
interface SatisOgrenci {
  id: number;
  tam_ad: string;
  tc_kimlik_no: string;
  sinif_seviyesi: string;
}

interface UygunHizmet {
  id: number;
  ad: string;
  kod: string;
  hizmet_turu: string;
  hizmet_turu_display: string;
  fiyat: number;
  kdv_orani: number;
  kdv_dahil_fiyat: number;
  aciklama: string;
  deneme_paketi: { id: number; ad: string; deneme_sayisi: number } | null;
}

interface OgrenciMevcutHizmet {
  id: number;
  ek_hizmet_id: number;
  ek_hizmet_ad: string;
  hizmet_turu: string;
  hizmet_turu_display: string;
  fiyat: number;
  dahil_mi: boolean;
  kaynak_paket_turu: string;
  aktif_mi: boolean;
  egitim_yili: string;
  created_at: string;
}

interface UygunDenemePaketi {
  id: number;
  ad: string;
  kod: string;
  deneme_sayisi: number;
  fiyat: number;
  kdv_orani: number;
  kdv_dahil_fiyat: number;
  aciklama: string;
  sinif_seviyeleri: SinifSeviyesi[];
}

type PaketTuru = "grup_dersleri" | "ozel_dersler" | "denemeler" | "ek_hizmetler" | "ek_hizmet_satis";

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
  const [referansVeriler, setReferansVeriler] = useState<ReferansVeriler>({
    sinif_seviyeleri: [],
    alanlar: [],
    dersler: [],
    ek_hizmetler: [],
    denemeler: [],
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
    deneme_paketi_id: "" as string,
  });

  // Ek Hizmet Satış states
  const [satisArama, setSatisArama] = useState("");
  const [satisOgrenciler, setSatisOgrenciler] = useState<SatisOgrenci[]>([]);
  const [seciliOgrenci, setSeciliOgrenci] = useState<SatisOgrenci | null>(null);
  const [uygunHizmetler, setUygunHizmetler] = useState<UygunHizmet[]>([]);
  const [mevcutHizmetler, setMevcutHizmetler] = useState<OgrenciMevcutHizmet[]>([]);
  const [satisLoading, setSatisLoading] = useState(false);
  const [aramaTimeout, setAramaTimeout] = useState<NodeJS.Timeout | null>(null);
  const [uygunDenemePaketleri, setUygunDenemePaketleri] = useState<UygunDenemePaketi[]>([]);

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
        fetchReferansVeriler(),
      ]);
    } catch (err) {
      setError("Veriler yüklenirken hata oluştu");
    } finally {
      setLoading(false);
    }
  }, [fetchGrupDersleri, fetchOzelDersler, fetchDenemeler, fetchEkHizmetler, fetchReferansVeriler]);

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
        if (activeTab === "grup_dersleri") await fetchGrupDersleri();
        else if (activeTab === "ozel_dersler") await fetchOzelDersler();
        else if (activeTab === "ek_hizmetler") { await fetchEkHizmetler(); await fetchReferansVeriler(); }
        else await fetchDenemeler();
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
        if (activeTab === "grup_dersleri") await fetchGrupDersleri();
        else if (activeTab === "ozel_dersler") await fetchOzelDersler();
        else if (activeTab === "ek_hizmetler") await fetchEkHizmetler();
        else await fetchDenemeler();
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

  // Get drawer title
  const getDrawerTitle = () => {
    const action = drawerMode === "create" ? "Yeni" : "Düzenle";
    if (activeTab === "grup_dersleri") return `${action} Grup Dersi`;
    if (activeTab === "ozel_dersler") return `${action} Özel Ders`;
    if (activeTab === "ek_hizmetler") return `${action} Ek Hizmet`;
    return `${action} Deneme`;
  };

  // === EK HİZMET SATIŞ FONKSİYONLARI ===
  
  // Öğrenci arama
  const handleOgrenciAra = (q: string) => {
    setSatisArama(q);
    if (aramaTimeout) clearTimeout(aramaTimeout);
    
    if (q.length < 2) {
      setSatisOgrenciler([]);
      return;
    }
    
    const timeout = setTimeout(async () => {
      try {
        const res = await paketFetch(
          `/egitim-paketleri/api/ek-hizmet-satis/ogrenci-ara/?q=${encodeURIComponent(q)}`,
          { credentials: 'include' }
        );
        const data = await res.json();
        if (data.success) {
          setSatisOgrenciler(data.data);
        }
      } catch (err) {
        console.error("Öğrenci arama hatası:", err);
      }
    }, 300);
    setAramaTimeout(timeout);
  };

  // Öğrenci seç → uygun hizmetleri, mevcut hizmetleri ve deneme paketlerini yükle
  const handleOgrenciSec = async (ogrenci: SatisOgrenci) => {
    setSeciliOgrenci(ogrenci);
    setSatisOgrenciler([]);
    setSatisArama(ogrenci.tam_ad);
    setSatisLoading(true);

    try {
      const [uygunRes, mevcutRes, denemePaketRes] = await Promise.all([
        paketFetch(`/egitim-paketleri/api/ek-hizmet-satis/ogrenci/${ogrenci.id}/uygun/`),
        paketFetch(`/egitim-paketleri/api/ek-hizmet-satis/ogrenci/${ogrenci.id}/`),
        paketFetch(`/egitim-paketleri/api/ek-hizmet-satis/ogrenci/${ogrenci.id}/uygun-deneme-paketleri/`),
      ]);
      const uygunData = await uygunRes.json();
      const mevcutData = await mevcutRes.json();
      const denemeData = await denemePaketRes.json();

      if (uygunData.success) setUygunHizmetler(uygunData.data.uygun_hizmetler);
      if (mevcutData.success) setMevcutHizmetler(mevcutData.data.hizmetler);
      if (denemeData.success) setUygunDenemePaketleri(denemeData.data.uygun_deneme_paketleri);
    } catch (err) {
      console.error("Veri yüklenemedi:", err);
    } finally {
      setSatisLoading(false);
    }
  };

  // Ek hizmet satışı yap
  const handleHizmetSat = async (hizmet: UygunHizmet) => {
    if (!seciliOgrenci) return;
    setSatisLoading(true);

    try {
      const res = await paketFetch(`/egitim-paketleri/api/ek-hizmet-satis/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({
          ogrenci_id: seciliOgrenci.id,
          ek_hizmet_id: hizmet.id,
          fiyat: hizmet.fiyat,
        }),
      });
      const data = await res.json();

      if (data.success) {
        // Listleri yenile
        await handleOgrenciSec(seciliOgrenci);
      } else {
        setError(data.error || "Satış başarısız");
      }
    } catch (err) {
      setError("Satış sırasında hata oluştu");
    } finally {
      setSatisLoading(false);
    }
  };

  // Deneme paketi satışı yap
  const handleDenemePaketiSat = async (paket: UygunDenemePaketi) => {
    if (!seciliOgrenci) return;
    setSatisLoading(true);

    try {
      const res = await paketFetch(`/egitim-paketleri/api/ek-hizmet-satis/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({
          ogrenci_id: seciliOgrenci.id,
          deneme_paketi_id: paket.id,
          fiyat: paket.fiyat,
        }),
      });
      const data = await res.json();

      if (data.success) {
        await handleOgrenciSec(seciliOgrenci);
      } else {
        setError(data.error || "Deneme paketi satışı başarısız");
      }
    } catch (err) {
      setError("Deneme paketi satışı sırasında hata oluştu");
    } finally {
      setSatisLoading(false);
    }
  };

  // Ek hizmet iptal
  const handleHizmetIptal = async (kayitId: number) => {
    if (!seciliOgrenci) return;
    setSatisLoading(true);

    try {
      const res = await paketFetch(`/egitim-paketleri/api/ek-hizmet-satis/${kayitId}/iptal/`, {
        method: "DELETE",
        credentials: 'include',
      });
      const data = await res.json();

      if (data.success) {
        await handleOgrenciSec(seciliOgrenci);
      } else {
        setError(data.error || "İptal başarısız");
      }
    } catch (err) {
      setError("İptal sırasında hata oluştu");
    } finally {
      setSatisLoading(false);
    }
  };

  // Öğrenci seçimi temizle
  const handleOgrenciTemizle = () => {
    setSeciliOgrenci(null);
    setSatisArama("");
    setSatisOgrenciler([]);
    setUygunHizmetler([]);
    setMevcutHizmetler([]);
    setUygunDenemePaketleri([]);
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
        {activeTab !== "ek_hizmet_satis" && (
          <button className="btn-hero" onClick={handleOpenCreate}>
            <span className="btn-hero-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </span>
            <span>Yeni Paket Ekle</span>
          </button>
        )}
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
          className={`tab-modern ${activeTab === "ek_hizmet_satis" ? "active" : ""}`}
          onClick={(e) => { e.preventDefault(); setActiveTab("ek_hizmet_satis"); }}
          href="#"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
            <line x1="1" y1="10" x2="23" y2="10" />
          </svg>
          Ek Hizmet Satışı
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
            {activeTab === "ek_hizmet_satis" && "Ek Hizmet Satışı"}
          </h3>
          {activeTab !== "ek_hizmet_satis" && (
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
          )}
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

          {/* Ek Hizmet Satışı Tab */}
          {activeTab === "ek_hizmet_satis" && (
            <div style={{ padding: "20px" }}>
              {/* Öğrenci Arama */}
              <div style={{ marginBottom: "24px" }}>
                <label style={{ display: "block", fontSize: "14px", fontWeight: 600, color: "#374151", marginBottom: "8px" }}>
                  Öğrenci Ara
                </label>
                <div style={{ position: "relative" }}>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <div style={{ flex: 1, position: "relative" }}>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Ad, soyad veya TC ile ara..."
                        value={satisArama}
                        onChange={(e) => handleOgrenciAra(e.target.value)}
                        style={{ width: "100%", padding: "10px 12px", fontSize: "14px" }}
                      />
                      {satisOgrenciler.length > 0 && (
                        <div style={{
                          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
                          background: "white", border: "1px solid #e5e7eb", borderRadius: "8px",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.15)", maxHeight: "240px", overflowY: "auto",
                        }}>
                          {satisOgrenciler.map((o) => (
                            <div
                              key={o.id}
                              onClick={() => handleOgrenciSec(o)}
                              style={{
                                padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid #f3f4f6",
                                display: "flex", justifyContent: "space-between", alignItems: "center",
                              }}
                              onMouseOver={(e) => (e.currentTarget.style.background = "#f0f7ff")}
                              onMouseOut={(e) => (e.currentTarget.style.background = "white")}
                            >
                              <div>
                                <div style={{ fontWeight: 500, color: "#111827" }}>{o.tam_ad}</div>
                                <div style={{ fontSize: "12px", color: "#6b7280" }}>
                                  {o.sinif_seviyesi} · TC: {o.tc_kimlik_no}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {seciliOgrenci && (
                      <button
                        className="btn-modern btn-secondary"
                        onClick={handleOgrenciTemizle}
                        style={{ whiteSpace: "nowrap" }}
                      >
                        Temizle
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Seçili Öğrenci Bilgisi */}
              {seciliOgrenci && (
                <div style={{
                  background: "linear-gradient(135deg, #eff6ff, #f0fdf4)", padding: "16px 20px",
                  borderRadius: "12px", marginBottom: "24px", border: "1px solid #bfdbfe",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{
                      width: "42px", height: "42px", borderRadius: "50%", background: "#2563eb",
                      display: "flex", alignItems: "center", justifyContent: "center", color: "white",
                      fontWeight: 700, fontSize: "16px",
                    }}>
                      {seciliOgrenci.tam_ad.charAt(0)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "16px", color: "#111827" }}>{seciliOgrenci.tam_ad}</div>
                      <div style={{ fontSize: "13px", color: "#6b7280" }}>
                        {seciliOgrenci.sinif_seviyesi} · TC: {seciliOgrenci.tc_kimlik_no}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {satisLoading && (
                <div style={{ textAlign: "center", padding: "30px" }}>
                  <div className="loading-spinner"></div>
                  <p style={{ marginTop: "12px", color: "#6b7280" }}>Yükleniyor...</p>
                </div>
              )}

              {/* Mevcut Hizmetler */}
              {seciliOgrenci && !satisLoading && mevcutHizmetler.length > 0 && (
                <div style={{ marginBottom: "24px" }}>
                  <h4 style={{ fontSize: "15px", fontWeight: 600, marginBottom: "12px", color: "#374151" }}>
                    Mevcut Ek Hizmetler ({mevcutHizmetler.filter(h => h.aktif_mi).length} aktif)
                  </h4>
                  <table className="table-modern">
                    <thead>
                      <tr>
                        <th>Hizmet</th>
                        <th>Tür</th>
                        <th>Fiyat</th>
                        <th>Kaynak</th>
                        <th>Durum</th>
                        <th style={{ width: "80px" }}>İşlem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mevcutHizmetler.map((h) => (
                        <tr key={h.id} style={{ opacity: h.aktif_mi ? 1 : 0.5 }}>
                          <td><span className="cell-primary">{h.ek_hizmet_ad}</span></td>
                          <td>
                            <span className={`badge-modern ${h.hizmet_turu === 'kutuphane' ? 'info' : h.hizmet_turu === 'kocluk' ? 'warning' : 'success'}`}>
                              {h.hizmet_turu_display}
                            </span>
                          </td>
                          <td>
                            {h.dahil_mi ? (
                              <span className="badge-modern success">Dahil</span>
                            ) : (
                              <span className="price-tag">{formatCurrency(h.fiyat)}</span>
                            )}
                          </td>
                          <td>
                            <span style={{ fontSize: "12px", color: "#6b7280" }}>
                              {h.dahil_mi ? "Paket dahili" : h.kaynak_paket_turu === "bireysel" ? "Bireysel satış" : h.kaynak_paket_turu || "-"}
                            </span>
                          </td>
                          <td>
                            <span className={`badge-modern ${h.aktif_mi ? "success" : "danger"}`}>
                              {h.aktif_mi ? "Aktif" : "İptal"}
                            </span>
                          </td>
                          <td>
                            {h.aktif_mi && !h.dahil_mi && (
                              <button
                                className="row-action-btn danger"
                                title="İptal Et"
                                onClick={() => handleHizmetIptal(h.id)}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <line x1="18" y1="6" x2="6" y2="18" />
                                  <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Uygun Hizmetler — Satılabilir */}
              {seciliOgrenci && !satisLoading && (
                <div>
                  <h4 style={{ fontSize: "15px", fontWeight: 600, marginBottom: "12px", color: "#374151" }}>
                    Satılabilir Ek Hizmetler ({uygunHizmetler.length})
                  </h4>
                  {uygunHizmetler.length > 0 ? (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "12px" }}>
                      {uygunHizmetler.map((h) => (
                        <div key={h.id} style={{
                          border: "1px solid #e5e7eb", borderRadius: "12px", padding: "16px",
                          background: "white", transition: "all 0.2s",
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: "14px", color: "#111827" }}>{h.ad}</div>
                              <div style={{ fontSize: "12px", color: "#6b7280" }}>{h.kod}</div>
                            </div>
                            <span className={`badge-modern ${h.hizmet_turu === 'kutuphane' ? 'info' : h.hizmet_turu === 'kocluk' ? 'warning' : 'success'}`}>
                              {h.hizmet_turu_display}
                            </span>
                          </div>
                          {h.aciklama && (
                            <p style={{ fontSize: "12px", color: "#6b7280", marginBottom: "8px" }}>{h.aciklama}</p>
                          )}
                          {h.deneme_paketi && (
                            <div style={{ fontSize: "12px", color: "#7c3aed", marginBottom: "8px", fontWeight: 500 }}>
                              🎯 {h.deneme_paketi.ad} ({h.deneme_paketi.deneme_sayisi} deneme)
                            </div>
                          )}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px" }}>
                            <div>
                              <span className="price-tag">{formatCurrency(kdvDahilFiyat(h))}</span>
                              <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>
                                KDV Hariç: {formatCurrency(netFiyat(h))} (+%{h.kdv_orani} KDV)
                              </div>
                            </div>
                            <button
                              className="btn-modern btn-primary"
                              style={{ padding: "6px 14px", fontSize: "13px" }}
                              onClick={() => handleHizmetSat(h)}
                              disabled={satisLoading}
                            >
                              Sat
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ textAlign: "center", padding: "30px", color: "#6b7280" }}>
                      <div style={{ fontSize: "32px", marginBottom: "8px" }}>✅</div>
                      <p>Bu öğrenci için uygun ek hizmet bulunmuyor veya tümü zaten atanmış.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Satılabilir Deneme Paketleri */}
              {seciliOgrenci && !satisLoading && (
                <div style={{ marginTop: "24px" }}>
                  <h4 style={{ fontSize: "15px", fontWeight: 600, marginBottom: "12px", color: "#374151", display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "18px" }}>📝</span>
                    Satılabilir Deneme Paketleri ({uygunDenemePaketleri.length})
                  </h4>
                  {uygunDenemePaketleri.length > 0 ? (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "12px" }}>
                      {uygunDenemePaketleri.map((p) => (
                        <div key={p.id} style={{
                          border: "1px solid #ddd6fe", borderRadius: "12px", padding: "16px",
                          background: "linear-gradient(135deg, #faf5ff, #f5f3ff)", transition: "all 0.2s",
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: "14px", color: "#111827" }}>{p.ad}</div>
                              <div style={{ fontSize: "12px", color: "#6b7280" }}>{p.kod}</div>
                            </div>
                            <span className="badge-modern" style={{ background: "#ede9fe", color: "#7c3aed", fontWeight: 600 }}>
                              {p.deneme_sayisi} Deneme
                            </span>
                          </div>
                          {p.sinif_seviyeleri.length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "8px" }}>
                              {p.sinif_seviyeleri.map((s) => (
                                <span key={s.id} style={{
                                  fontSize: "11px", padding: "2px 8px", borderRadius: "10px",
                                  background: "#e0e7ff", color: "#4338ca",
                                }}>
                                  {s.ad}
                                </span>
                              ))}
                            </div>
                          )}
                          {p.aciklama && (
                            <p style={{ fontSize: "12px", color: "#6b7280", marginBottom: "8px" }}>{p.aciklama}</p>
                          )}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px" }}>
                            <div>
                              <span className="price-tag" style={{ color: "#7c3aed" }}>{formatCurrency(kdvDahilFiyat(p))}</span>
                              <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>
                                KDV Hariç: {formatCurrency(netFiyat(p))} (+%{p.kdv_orani} KDV)
                              </div>
                            </div>
                            <button
                              className="btn-modern btn-primary"
                              style={{ padding: "6px 14px", fontSize: "13px", background: "#7c3aed" }}
                              onClick={() => handleDenemePaketiSat(p)}
                              disabled={satisLoading}
                            >
                              Sat
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ textAlign: "center", padding: "20px", color: "#6b7280", fontSize: "13px" }}>
                      <p>Bu öğrenci için uygun deneme paketi bulunmuyor veya tümü zaten atanmış.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Öğrenci seçilmemiş durumu */}
              {!seciliOgrenci && !satisLoading && (
                <div className="empty-state">
                  <div className="empty-state-icon">🔍</div>
                  <h4>Öğrenci Seçin</h4>
                  <p>Ek hizmet satışı yapmak için yukarıdan bir öğrenci arayın ve seçin</p>
                </div>
              )}
            </div>
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

                {/* Dahil Ek Hizmetler - Sadece Grup Dersi için */}
                {activeTab === "grup_dersleri" && referansVeriler.ek_hizmetler.filter(h => h.hizmet_turu !== "deneme").length > 0 && (
                  <div className="form-group">
                    <label>Dahil Ek Hizmetler</label>
                    <p className="form-help-text" style={{ fontSize: "12px", color: "#888", marginBottom: "8px" }}>
                      Bu grup dersine kayıt olan öğrencilere otomatik olarak dahil edilecek hizmetler
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

                {activeTab === "grup_dersleri" && referansVeriler.denemeler.length > 0 && (
                  <div className="form-group">
                    <label>Dahil Deneme Paketleri</label>
                    <p className="form-help-text" style={{ fontSize: "12px", color: "#888", marginBottom: "8px" }}>
                      Bu grup dersine kayıt olan öğrencilere otomatik olarak dahil edilecek deneme paketleri
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
