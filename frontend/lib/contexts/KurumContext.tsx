"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo } from "react";
import { setActiveContext as apiSetActiveContext } from "@/lib/api";
import { personelAccessService, type MySubeItem } from "@/lib/personel-access-api";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

/** Same-origin media/API — LAN cihazlarda localhost:8000 kullanılmaz */
function resolveClientApiUrl(path: string): string {
  if (path.startsWith("http")) return path;
  if (typeof window !== "undefined") {
    if (path.startsWith("/api/")) return path;
    return `/api${path.startsWith("/") ? path : `/${path}`}`;
  }
  return `${BACKEND_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

// Types
export interface Kurum {
  id: number;
  ad: string;
  kod: string;
  aktif_mi: boolean;
  telefon_sabit?: string;
  telefon_cep?: string;
  yetkili_ad_soyad?: string;
  vergi_no?: string;
  vergi_dairesi?: string;
  adres?: string;
  gorunen_ad?: string;
  slogan?: string;
  login_logo_url?: string | null;
  app_logo_url?: string | null;
  favicon_url?: string | null;
  login_arkaplan_rengi?: string;
  login_arkaplan_rengi_2?: string;
  tema_rengi?: string;
}

export interface Sube {
  id: number;
  ad: string;
  kod?: string;
  resmi_ad?: string;
  web_adresi?: string;
  eposta?: string;
  telefon?: string;
  adres?: string;
  ticari_unvan?: string;
  vergi_dairesi?: string;
  vergi_no?: string;
  ticaret_sicil_no?: string;
  kurs_muduru?: string;
  kurs_muduru_telefon?: string;
  aktif_mi: boolean;
  gorunen_ad?: string;
  slogan?: string;
  login_logo_url?: string | null;
  app_logo_url?: string | null;
  favicon_url?: string | null;
  login_arkaplan_rengi?: string;
  login_arkaplan_rengi_2?: string;
  tema_rengi?: string;
  kurum: { id: number; ad: string };
}

export interface EgitimYili {
  id: number;
  baslangic_yil: number;
  bitis_yil: number;
  aktif_mi: boolean;
  sube?: { id: number; ad: string };
}

interface KurumContextData {
  // Data
  kurumlar: Kurum[];
  subeler: Sube[];
  egitimYillari: EgitimYili[];
  
  // Active selections
  activeKurum: Kurum | null;
  activeSube: Sube | null;
  activeEgitimYili: EgitimYili | null;
  
  // Loading state
  loading: boolean;
  error: string | null;
  
  // Actions
  setActiveKurum: (kurum: Kurum | null) => void;
  setActiveSube: (sube: Sube | null) => void;
  setActiveEgitimYili: (yil: EgitimYili | null) => void;
  refreshData: () => Promise<void>;
  
  // Filtered data based on selections
  filteredSubeler: Sube[];
  filteredEgitimYillari: EgitimYili[];
  /** Kullanıcının erişebildiği şube ID'leri; null = henüz yüklenmedi / kısıtlama yok */
  allowedSubeIds: number[] | null;
  globalSubeAccess: boolean;
  /** Header kurum sekmesi — my-kurumlar API ile filtrelenmiş */
  filteredKurumlar: Kurum[];
  /** İlk yükleme tamamlandı mı */
  initialized: boolean;
  /** localStorage'dan bağlamı yeniden oku (sayfa yenilemeden) */
  applyStoredContext: () => void;
}

const KurumContext = createContext<KurumContextData | undefined>(undefined);

// Storage keys
const STORAGE_KEYS = {
  activeKurum: "3k_active_kurum",
  activeSube: "3k_active_sube",
  activeEgitimYili: "3k_active_egitim_yili",
};

export function KurumProvider({ children }: { children: ReactNode }) {
  // Data states
  const [kurumlar, setKurumlar] = useState<Kurum[]>([]);
  const [subeler, setSubeler] = useState<Sube[]>([]);
  const [egitimYillari, setEgitimYillari] = useState<EgitimYili[]>([]);
  
  // Selection states
  const [activeKurum, setActiveKurumState] = useState<Kurum | null>(null);
  const [activeSube, setActiveSubeState] = useState<Sube | null>(null);
  const [activeEgitimYili, setActiveEgitimYiliState] = useState<EgitimYili | null>(null);
  
  // UI states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [allowedSubeIds, setAllowedSubeIds] = useState<number[] | null>(null);
  const [globalSubeAccess, setGlobalSubeAccess] = useState(false);
  const [accessibleSubeler, setAccessibleSubeler] = useState<MySubeItem[]>([]);
  const [allowedKurumIds, setAllowedKurumIds] = useState<number[] | null>(null);

  // Fetch all data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(resolveClientApiUrl("/kurum-yonetimi/api/legacy/kurumlar/"), {
        credentials: "include",
      });
      const data = await response.json();
      
      if (data.success) {
        const fetchedKurumlar = data.data?.kurumlar || [];
        const fetchedSubeler = data.data?.subeler || [];
        const fetchedEgitimYillari = data.data?.egitim_yillari || [];
        
        setKurumlar(fetchedKurumlar);
        setSubeler(fetchedSubeler);
        setEgitimYillari(fetchedEgitimYillari);
        
        return { 
          kurumlar: fetchedKurumlar, 
          subeler: fetchedSubeler, 
          egitimYillari: fetchedEgitimYillari 
        };
      } else {
        throw new Error(data.error || "Veri yüklenemedi");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Veri yüklenirken hata oluştu";
      setError(message);
      console.error("KurumContext fetch error:", err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Initialize - load from localStorage and fetch data
  useEffect(() => {
    const initializeContext = async () => {
      const result = await fetchData();
      
      if (result) {
        // Load from localStorage
        const storedKurumId = localStorage.getItem(STORAGE_KEYS.activeKurum);
        const storedSubeId = localStorage.getItem(STORAGE_KEYS.activeSube);
        const storedYilId = localStorage.getItem(STORAGE_KEYS.activeEgitimYili);
        
        // Set active kurum
        let selectedKurum: Kurum | null = null;
        if (storedKurumId) {
          selectedKurum = result.kurumlar.find((k: Kurum) => k.id === parseInt(storedKurumId)) || null;
        }
        if (!selectedKurum && result.kurumlar.length > 0) {
          // Default: first active kurum or first kurum
          selectedKurum = result.kurumlar.find((k: Kurum) => k.aktif_mi) || result.kurumlar[0];
        }
        setActiveKurumState(selectedKurum);
        
        // Set active sube
        let selectedSube: Sube | null = null;
        if (storedSubeId && selectedKurum) {
          selectedSube = result.subeler.find(
            (s: Sube) => s.id === parseInt(storedSubeId) && s.kurum?.id === selectedKurum?.id
          ) || null;
        }
        if (!selectedSube && selectedKurum) {
          // Default: first active sube of selected kurum or first sube
          const kurumSubeleri = result.subeler.filter((s: Sube) => s.kurum?.id === selectedKurum?.id);
          selectedSube = kurumSubeleri.find((s: Sube) => s.aktif_mi) || kurumSubeleri[0] || null;
        }
        setActiveSubeState(selectedSube);
        
        // Set active egitim yili (global - şubeye bağlı değil)
        let selectedYil: EgitimYili | null = null;
        if (storedYilId) {
          selectedYil = result.egitimYillari.find(
            (y: EgitimYili) => y.id === parseInt(storedYilId)
          ) || null;
        }
        if (!selectedYil && result.egitimYillari.length > 0) {
          // Default: first active yil or first yil
          selectedYil = result.egitimYillari.find((y: EgitimYili) => y.aktif_mi) || result.egitimYillari[0];
        }
        setActiveEgitimYiliState(selectedYil);

        // Eski/geçersiz localStorage değerlerini güncel seçimle eşitle
        if (selectedKurum) {
          localStorage.setItem(STORAGE_KEYS.activeKurum, selectedKurum.id.toString());
        } else {
          localStorage.removeItem(STORAGE_KEYS.activeKurum);
        }
        if (selectedSube) {
          localStorage.setItem(STORAGE_KEYS.activeSube, selectedSube.id.toString());
        } else {
          localStorage.removeItem(STORAGE_KEYS.activeSube);
        }
        if (selectedYil) {
          localStorage.setItem(STORAGE_KEYS.activeEgitimYili, selectedYil.id.toString());
        } else {
          localStorage.removeItem(STORAGE_KEYS.activeEgitimYili);
        }

        // Backend session'a ilk context'i yaz (sayfa yenilemeden)
        if (selectedKurum || selectedSube || selectedYil) {
          apiSetActiveContext(
            selectedKurum?.id ?? null,
            selectedSube?.id ?? null,
            selectedYil?.id ?? null
          ).catch((err) => console.error("[KurumContext] Initial sync error:", err));
        }
      }
      
      setInitialized(true);
    };
    
    initializeContext();
  }, [fetchData]);

  // Kullanıcının erişebileceği kurumları yükle
  useEffect(() => {
    if (!initialized) return;
    personelAccessService
      .myKurumlar()
      .then((res) => {
        const ids = res.kurumlar.map((k) => k.id);
        setAllowedKurumIds(ids);
        if (ids.length > 0 && activeKurum && !ids.includes(activeKurum.id)) {
          const fallback =
            kurumlar.find((k) => k.id === ids[0]) ||
            ({
              id: res.kurumlar[0].id,
              ad: res.kurumlar[0].ad,
              kod: res.kurumlar[0].kod,
              aktif_mi: res.kurumlar[0].aktif_mi,
            } as Kurum);
          setActiveKurumState(fallback);
          localStorage.setItem(STORAGE_KEYS.activeKurum, String(fallback.id));
          apiSetActiveContext(fallback.id, activeSube?.id ?? null, activeEgitimYili?.id ?? null).catch(() => {});
        }
      })
      .catch(() => setAllowedKurumIds(null));
  }, [initialized]); // eslint-disable-line react-hooks/exhaustive-deps

  // Kullanıcının erişebileceği şubeleri yükle (rol bazlı)
  useEffect(() => {
    if (!initialized || !activeKurum) return;
    personelAccessService
      .mySubeler({ kurum_id: activeKurum.id, egitim_yili_id: activeEgitimYili?.id })
      .then((res) => {
        const ids = res.subeler.map((s) => s.id);
        setAllowedSubeIds(ids);
        setAccessibleSubeler(res.subeler);
        setGlobalSubeAccess(res.global_sube_access);
        // Aktif şube izin listesinde değilse düzelt
        if (ids.length > 0 && activeSube && !ids.includes(activeSube.id)) {
          const fallback =
            subeler.find((s) => s.id === ids[0]) ||
            ({
              id: res.subeler[0].id,
              ad: res.subeler[0].ad,
              kod: res.subeler[0].kod,
              aktif_mi: res.subeler[0].aktif_mi,
              kurum: { id: activeKurum.id, ad: activeKurum.ad },
            } as Sube);
          if (fallback) {
            setActiveSubeState(fallback);
            localStorage.setItem(STORAGE_KEYS.activeSube, String(fallback.id));
            apiSetActiveContext(activeKurum.id, fallback.id, activeEgitimYili?.id ?? null).catch(() => {});
          }
        }
      })
      .catch(() => {
        setAllowedSubeIds(null);
        setAccessibleSubeler([]);
      });
  }, [initialized, activeKurum?.id, activeEgitimYili?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // NOT: localStorage kaydetme artık set fonksiyonlarında yapılıyor
  // Bu useEffect'ler sadece geriye dönük uyumluluk için tutuluyor
  // ve initialized kontrolü ile sadece ilk yüklemede çalışıyor

  // Filtered data — kurum + kullanıcı şube yetkisi
  const filteredKurumlar = useMemo(() => {
    if (!allowedKurumIds || allowedKurumIds.length === 0) return kurumlar;
    const allowed = new Set(allowedKurumIds);
    const list = kurumlar.filter((k) => allowed.has(k.id));
    if (list.length > 0) return list;
    return allowedKurumIds.map(
      (id) =>
        kurumlar.find((k) => k.id === id) ||
        ({ id, ad: `Kurum #${id}`, kod: "", aktif_mi: true } as Kurum),
    );
  }, [kurumlar, allowedKurumIds]);

  const filteredSubeler = useMemo(() => {
    if (!activeKurum) return [];

    let list = subeler.filter((s) => s.kurum?.id === activeKurum.id);

    if (!globalSubeAccess && allowedSubeIds && allowedSubeIds.length > 0) {
      const allowed = new Set(allowedSubeIds);
      list = list.filter((s) => allowed.has(s.id));
    }

    if (list.length === 0 && accessibleSubeler.length > 0) {
      list = accessibleSubeler
        .filter((s) => s.kurum_id === activeKurum.id)
        .map(
          (s) =>
            ({
              id: s.id,
              ad: s.ad,
              kod: s.kod,
              aktif_mi: s.aktif_mi,
              kurum: { id: activeKurum.id, ad: activeKurum.ad },
            }) as Sube,
        );
    }

    return list;
  }, [activeKurum, subeler, allowedSubeIds, globalSubeAccess, accessibleSubeler]);
    
  // Eğitim yılları global - şubeye bağlı değil, tüm yılları göster
  const filteredEgitimYillari = egitimYillari;

  // Backend'e aktif context'i bildir
  const syncContextToBackend = useCallback(async (
    kurumId?: number | null,
    subeId?: number | null,
    egitimYiliId?: number | null
  ) => {
    try {
      await apiSetActiveContext(kurumId, subeId, egitimYiliId);
      console.log("[KurumContext] Backend context synced:", { kurumId, subeId, egitimYiliId });
    } catch (err) {
      console.error("[KurumContext] Backend sync error:", err);
    }
  }, []);

  // Set active kurum with cascade reset
  const setActiveKurum = useCallback((kurum: Kurum | null) => {
    console.log("[KurumContext] setActiveKurum called:", kurum?.id);
    setActiveKurumState(kurum);
    
    // localStorage'ı HEMEN güncelle (useEffect beklemeden)
    if (kurum) {
      localStorage.setItem(STORAGE_KEYS.activeKurum, kurum.id.toString());
    } else {
      localStorage.removeItem(STORAGE_KEYS.activeKurum);
    }
    
    // Reset sube when kurum changes (egitim yili global, değişmez)
    let newSube: Sube | null = null;
    if (kurum) {
      const kurumSubeleri = subeler.filter(s => s.kurum?.id === kurum.id);
      newSube = kurumSubeleri.find(s => s.aktif_mi) || kurumSubeleri[0] || null;
      setActiveSubeState(newSube);
      // Şube için de localStorage'ı HEMEN güncelle
      if (newSube) {
        localStorage.setItem(STORAGE_KEYS.activeSube, newSube.id.toString());
      } else {
        localStorage.removeItem(STORAGE_KEYS.activeSube);
      }
    } else {
      setActiveSubeState(null);
      localStorage.removeItem(STORAGE_KEYS.activeSube);
    }
    
    // Backend'e bildir ve sayfayı yenile
    syncContextToBackend(kurum?.id, newSube?.id, activeEgitimYili?.id).finally(() => {
      window.location.reload();
    });
  }, [subeler, activeEgitimYili?.id, syncContextToBackend]);

  // Set active sube (egitim yili global, değişmez)
  const setActiveSube = useCallback((sube: Sube | null) => {
    console.log("[KurumContext] setActiveSube called:", sube?.id);
    setActiveSubeState(sube);
    // localStorage'ı HEMEN güncelle
    if (sube) {
      localStorage.setItem(STORAGE_KEYS.activeSube, sube.id.toString());
    } else {
      localStorage.removeItem(STORAGE_KEYS.activeSube);
    }
    // Backend'e bildir ve sayfayı yenile
    syncContextToBackend(activeKurum?.id, sube?.id, activeEgitimYili?.id).finally(() => {
      window.location.reload();
    });
  }, [activeKurum?.id, activeEgitimYili?.id, syncContextToBackend]);

  // Set active egitim yili
  const setActiveEgitimYili = useCallback((yil: EgitimYili | null) => {
    console.log("[KurumContext] setActiveEgitimYili called:", yil?.id);
    setActiveEgitimYiliState(yil);
    // localStorage'ı HEMEN güncelle
    if (yil) {
      localStorage.setItem(STORAGE_KEYS.activeEgitimYili, yil.id.toString());
    } else {
      localStorage.removeItem(STORAGE_KEYS.activeEgitimYili);
    }
    // Backend'e bildir ve sayfayı yenile
    syncContextToBackend(activeKurum?.id, activeSube?.id, yil?.id).finally(() => {
      window.location.reload();
    });
  }, [activeKurum?.id, activeSube?.id, syncContextToBackend]);

  // Refresh data and sync active kurum branding (logos/favicon)
  const refreshData = useCallback(async () => {
    const result = await fetchData();
    if (!result) return;
    setActiveKurumState(prev => {
      if (!prev) return prev;
      const match = result.kurumlar.find((k: Kurum) => k.id === prev.id);
      if (match) return match;
      const fallback =
        result.kurumlar.find((k: Kurum) => k.aktif_mi) || result.kurumlar[0] || null;
      if (fallback) {
        localStorage.setItem(STORAGE_KEYS.activeKurum, fallback.id.toString());
      } else {
        localStorage.removeItem(STORAGE_KEYS.activeKurum);
      }
      return fallback;
    });
    setActiveSubeState(prev => {
      if (!prev) return prev;
      const match = result.subeler.find((s: Sube) => s.id === prev.id);
      if (match) return match;
      localStorage.removeItem(STORAGE_KEYS.activeSube);
      return null;
    });
  }, [fetchData]);

  /** localStorage'daki kurum/şube/yıl seçimini state'e uygula (giriş sonrası geçiş için) */
  const applyStoredContext = useCallback(() => {
    const storedKurumId = localStorage.getItem(STORAGE_KEYS.activeKurum);
    const storedSubeId = localStorage.getItem(STORAGE_KEYS.activeSube);
    const storedYilId = localStorage.getItem(STORAGE_KEYS.activeEgitimYili);

    if (storedKurumId) {
      const kurum = kurumlar.find((k) => k.id === parseInt(storedKurumId, 10));
      if (kurum) setActiveKurumState(kurum);
    }
    if (storedSubeId) {
      const sube = subeler.find((s) => s.id === parseInt(storedSubeId, 10));
      if (sube) setActiveSubeState(sube);
    }
    if (storedYilId) {
      const yil = egitimYillari.find((y) => y.id === parseInt(storedYilId, 10));
      if (yil) setActiveEgitimYiliState(yil);
    }
  }, [kurumlar, subeler, egitimYillari]);

  useEffect(() => {
    const handler = () => applyStoredContext();
    window.addEventListener("3k:context-updated", handler);
    return () => window.removeEventListener("3k:context-updated", handler);
  }, [applyStoredContext]);

  const value: KurumContextData = {
    kurumlar,
    subeler,
    egitimYillari,
    activeKurum,
    activeSube,
    activeEgitimYili,
    loading,
    error,
    setActiveKurum,
    setActiveSube,
    setActiveEgitimYili,
    refreshData,
    filteredSubeler,
    filteredEgitimYillari,
    filteredKurumlar,
    allowedSubeIds,
    globalSubeAccess,
    initialized,
    applyStoredContext,
  };

  return (
    <KurumContext.Provider value={value}>
      {children}
    </KurumContext.Provider>
  );
}

export function useKurum() {
  const context = useContext(KurumContext);
  if (context === undefined) {
    throw new Error("useKurum must be used within a KurumProvider");
  }
  return context;
}

export default KurumContext;
