"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useKurum } from "@/lib/contexts/KurumContext";
import { useOgrenciPath } from "@/components/ogrenci/OgrenciPathProvider";
import { useOdemePath } from "@/components/odeme-takip/OdemePathProvider";
import { apiGet, apiDelete } from "@/lib/api";
import Pagination from "../odeme-takip/components/Pagination";
import OgrenciListToolbar, { type StatusFilter, type SortOption } from "./components/OgrenciListToolbar";
import OgrenciListResults, { type OgrenciRow } from "./components/OgrenciListResults";
import OgrenciFilterDrawer from "./components/OgrenciFilterDrawer";
import OgrenciExportModal from "./components/OgrenciExportModal";
import OgrenciBelgesiModal from "./components/OgrenciBelgesiModal";
import OgrenciIzinBelgesiModal from "./components/OgrenciIzinBelgesiModal";
import type { OgrenciBelgeTipi } from "./components/OgrenciBelgeMenu";
import OgrenciQuickInfoModal from "./components/OgrenciQuickInfoModal";
import {
  parseFiltersFromSearchParams,
  filtersToSearchParams,
  buildListApiQuery,
  normalizeKalemFilters,
  formatKalemFilterKey,
  KALEM_GRUP_LABELS,
  type OgrenciListFilters,
} from "./lib/ogrenci-list-utils";
import "./ogrenci-list.css";

type OgrenciData = {
  id: number;
  kayit_id?: number;
  ad: string;
  soyad: string;
  tam_ad?: string;
  tc_kimlik_no: string;
  telefon: string;
  email: string;
  aktif_mi: boolean;
  cinsiyet?: string;
  dogum_tarihi?: string;
  veli_ad_soyad?: string;
  veli_telefon?: string;
  veli_id?: number | null;
  veli_yakinlik?: string;
  veli_yakinlik_display?: string;
  profil_foto?: string | null;
  // Yıllık kayıt bilgileri
  sinif_id?: number;
  sinif_ad?: string;
  sinif_seviyesi?: string;
  sube_ad?: string;
  kayit_tarihi?: string;
  okul_no?: string;
  giris_turu?: string;
  giris_turu_display?: string;
  egitim_kalemleri?: {
    kalem_turu: string;
    kalem_id: number;
    kalem_turu_display: string;
    kalem_adi: string;
  }[];
  kalem_ozet?: string;
};

function asOgrenciData(row: OgrenciRow): OgrenciData {
  return row as OgrenciData;
}

type OgrenciResponse = {
  ogrenciler?: OgrenciData[];
  toplam_ogrenci?: number;
  aktif_ogrenci?: number;
  search_query?: string;
  filter_mode?: "yillik" | "tum" | "tum_yillar";
  egitim_yili?: { id: number; yil_str: string } | null;
  all_years_count?: number;
  page?: number;
  page_size?: number;
  total_count?: number;
  total_pages?: number;
  filter_counts?: { aktif: number; pasif: number };
};

export default function OgrenciListesiPage() {
  const { listHref, href, portalHomeHref } = useOgrenciPath();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeKurum, activeSube, activeEgitimYili, loading: contextLoading, initialized, applyStoredContext } = useKurum();

  const [filters, setFilters] = useState<OgrenciListFilters>(() =>
    parseFiltersFromSearchParams(new URLSearchParams(searchParams.toString()))
  );
  const [ogrenciler, setOgrenciler] = useState<OgrenciData[]>([]);
  const [toplamOgrenci, setToplamOgrenci] = useState(0);
  const [aktifOgrenci, setAktifOgrenci] = useState(0);
  const [pasifOgrenci, setPasifOgrenci] = useState(0);
  const [filterMode, setFilterMode] = useState<"yillik" | "tum" | "tum_yillar">("tum");
  const [totalCount, setTotalCount] = useState(0);
  const [allYearsCount, setAllYearsCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(filters.q || "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [popupOgrenci, setPopupOgrenci] = useState<OgrenciData | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OgrenciData | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportMode, setExportMode] = useState<"all" | "selected">("all");
  const [belgeTarget, setBelgeTarget] = useState<{ student: OgrenciData; tip: OgrenciBelgeTipi } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [filterOptions, setFilterOptions] = useState<{
    kalem_gruplari: {
      tur: string;
      label: string;
      count: number;
      kalemler: { kalem_id: number; kalem_adi: string }[];
    }[];
    egitim_kalemleri: { kalem_turu: string; kalem_id: number; kalem_adi: string }[];
    siniflar: { id: number; ad: string; sinif_seviyesi_id: number | null }[];
    subeler: { id: number; ad: string }[];
    sinif_seviyeleri: { id: number; ad: string }[];
    giris_turu: { value: string; label: string }[];
    cinsiyet: { value: string; label: string }[];
  }>({
    kalem_gruplari: [],
    egitim_kalemleri: [],
    siniflar: [],
    subeler: [],
    sinif_seviyeleri: [],
    giris_turu: [],
    cinsiyet: [],
  });

  const statusFilter: StatusFilter = filters.durum || "all";
  const sortBy: SortOption =
    filters.sort === "name_desc"
      ? "name_desc"
      : filters.sort === "name_asc"
        ? "name_asc"
        : filters.sort === "kayit_tarihi_asc"
          ? "kayit_tarihi_asc"
          : filters.sort === "created_at_desc" || filters.sort === "kayit_tarihi_desc" || !filters.sort
            ? "created_at_desc"
            : "created_at_desc";
  const apiSort =
    sortBy === "name_desc"
      ? "name_desc"
      : sortBy === "name_asc"
        ? "name_asc"
        : sortBy === "kayit_tarihi_asc"
          ? "kayit_tarihi_asc"
          : "created_at_desc";
  const searchQuery = filters.q || "";

  const syncUrl = useCallback(
    (next: OgrenciListFilters) => {
      const qs = filtersToSearchParams(next).toString();
      router.replace(qs ? `${listHref}?${qs}` : listHref, { scroll: false });
    },
    [router]
  );

  const updateFilters = useCallback(
    (patch: Partial<OgrenciListFilters>) => {
      setFilters((prev) => {
        const next = { ...prev, ...patch };
        syncUrl(next);
        return next;
      });
    },
    [syncUrl]
  );


  const fetchOgrenciler = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const query = buildListApiQuery({
        ...filters,
        sort: apiSort,
      });
      const response = await apiGet<OgrenciResponse>(`/ogrenciler/api/list/${query}`);

      if (response.success) {
        const data = (response.data || response) as OgrenciResponse;
        setOgrenciler(data.ogrenciler || []);
        setToplamOgrenci(data.toplam_ogrenci || data.total_count || 0);
        setTotalCount(data.total_count || data.toplam_ogrenci || 0);
        setAktifOgrenci(data.filter_counts?.aktif ?? data.aktif_ogrenci ?? 0);
        setPasifOgrenci(data.filter_counts?.pasif ?? 0);
        setFilterMode(data.filter_mode || "tum");
        setAllYearsCount(data.all_years_count ?? null);
      } else {
        setError(response.error || "Veri yüklenemedi");
      }
    } catch {
      setError("Öğrenci listesi yüklenirken hata oluştu");
    } finally {
      setLoading(false);
    }
  }, [filters, apiSort, activeKurum?.id, activeSube?.id, activeEgitimYili?.id]);

  useEffect(() => {
    if (!initialized) return;
    applyStoredContext();
  }, [initialized, applyStoredContext]);

  useEffect(() => {
    if (contextLoading || !initialized) return;

    const hasStoredContext =
      typeof window !== "undefined" &&
      localStorage.getItem("3k_active_kurum") &&
      localStorage.getItem("3k_active_sube");

    if (!activeKurum || !activeSube) {
      if (hasStoredContext) {
        applyStoredContext();
        return;
      }
      setLoading(false);
      setError("Lütfen önce kurum ve şube seçin");
      return;
    }

    setError(null);
    fetchOgrenciler();
  }, [contextLoading, initialized, activeKurum?.id, activeSube?.id, activeEgitimYili?.id, fetchOgrenciler, applyStoredContext]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const q = searchInput.trim();
      if (q !== (filters.q || "")) {
        updateFilters({ q, page: 1 });
      }
    }, 320);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput, filters.q, updateFilters]);

  const handleSearchClear = () => {
    setSearchInput("");
    updateFilters({ q: "", page: 1 });
  };

  useEffect(() => {
    if (contextLoading || !activeKurum || !activeSube) return;
    apiGet<typeof filterOptions>('/ogrenciler/api/filter-options/').then((res) => {
      const data = (res.data || res) as typeof filterOptions;
      setFilterOptions({
        kalem_gruplari: data.kalem_gruplari || [],
        egitim_kalemleri: data.egitim_kalemleri || [],
        siniflar: data.siniflar || [],
        subeler: data.subeler || [],
        sinif_seviyeleri: data.sinif_seviyeleri || [],
        giris_turu: data.giris_turu || [],
        cinsiyet: data.cinsiyet || [],
      });
    });
  }, [contextLoading, activeKurum?.id, activeSube?.id, activeEgitimYili?.id]);

  const handleClearFilters = () => {
    setSearchInput("");
    setSelectedIds(new Set());
    const cleared: OgrenciListFilters = {
      q: "",
      durum: "all",
      all_years: false,
      sinif_seviyesi_ids: [],
      sinif_ids: [],
      sube_id: "",
      kalemler: [],
      giris_turu: "",
      cinsiyet: "",
      paket_id: "",
      paket_turu: "",
      kayit_tarihi_bas: "",
      kayit_tarihi_bit: "",
      sort: "created_at_desc",
      page: 1,
      page_size: filters.page_size || 25,
    };
    setFilters(cleared);
    syncUrl(cleared);
  };

  const statusCounts = useMemo(
    () => ({
      all: aktifOgrenci + pasifOgrenci,
      aktif: aktifOgrenci,
      pasif: pasifOgrenci,
    }),
    [aktifOgrenci, pasifOgrenci]
  );

  const activeKalemFilters = useMemo(() => normalizeKalemFilters(filters), [filters]);

  const advancedFilterCount = useMemo(() => {
    let n = 0;
    if (activeKalemFilters.length > 0) n += activeKalemFilters.length;
    if ((filters.sinif_seviyesi_ids || []).length > 0) {
      n += filters.sinif_seviyesi_ids!.length;
    }
    if ((filters.sinif_ids || []).length > 0) n += filters.sinif_ids!.length;
    if (filters.sube_id) n++;
    if (filters.giris_turu) n++;
    if (filters.cinsiyet) n++;
    if (filters.kayit_tarihi_bas) n++;
    if (filters.kayit_tarihi_bit) n++;
    if (filters.all_years) n++;
    return n;
  }, [filters, activeKalemFilters]);

  const activeFilterChips = useMemo(() => {
    const chips: { key: string; label: string }[] = [];

    for (const spec of activeKalemFilters) {
      const turLabel = KALEM_GRUP_LABELS[spec.tur] || spec.tur;
      const kalemAdi =
        filterOptions.kalem_gruplari
          .flatMap((g) =>
            g.kalemler.map((k) => ({ tur: g.tur, kalem_id: k.kalem_id, kalem_adi: k.kalem_adi }))
          )
          .find((k) => k.tur === spec.tur && k.kalem_id === spec.id)?.kalem_adi ||
        filterOptions.egitim_kalemleri.find(
          (k) => k.kalem_turu === spec.tur && k.kalem_id === spec.id
        )?.kalem_adi ||
        String(spec.id);
      chips.push({
        key: `kalem:${formatKalemFilterKey(spec)}`,
        label: `${turLabel}: ${kalemAdi}`,
      });
    }

    for (const seviyeId of filters.sinif_seviyesi_ids || []) {
      const seviyeAd =
        filterOptions.sinif_seviyeleri.find((s) => s.id === seviyeId)?.ad ||
        String(seviyeId);
      chips.push({ key: `seviye:${seviyeId}`, label: `Seviye: ${seviyeAd}` });
    }

    for (const sinifId of filters.sinif_ids || []) {
      const sinifAd =
        filterOptions.siniflar.find((s) => s.id === sinifId)?.ad ||
        String(sinifId);
      chips.push({ key: `sinif:${sinifId}`, label: `Sınıf: ${sinifAd}` });
    }

    if (filters.sube_id) {
      const subeAd =
        filterOptions.subeler.find((s) => s.id === filters.sube_id)?.ad ||
        String(filters.sube_id);
      chips.push({ key: 'sube_id', label: `Şube: ${subeAd}` });
    }

    if (filters.giris_turu) {
      const label =
        filterOptions.giris_turu.find((g) => g.value === filters.giris_turu)?.label ||
        filters.giris_turu;
      chips.push({ key: 'giris_turu', label: `Giriş: ${label}` });
    }

    if (filters.cinsiyet) {
      const label =
        filterOptions.cinsiyet.find((c) => c.value === filters.cinsiyet)?.label ||
        filters.cinsiyet;
      chips.push({ key: 'cinsiyet', label: `Cinsiyet: ${label}` });
    }

    if (filters.kayit_tarihi_bas || filters.kayit_tarihi_bit) {
      chips.push({
        key: 'kayit_tarihi',
        label: `Kayıt: ${filters.kayit_tarihi_bas || '…'} – ${filters.kayit_tarihi_bit || '…'}`,
      });
    }

    if (filters.all_years) {
      chips.push({ key: 'all_years', label: 'Tüm yıllar' });
    }

    return chips;
  }, [filters, filterOptions, activeKalemFilters]);

  const handleRemoveFilter = (key: string) => {
    if (key.startsWith('kalem:')) {
      const token = key.slice('kalem:'.length);
      const nextKalemler = activeKalemFilters.filter(
        (k) => formatKalemFilterKey(k) !== token
      );
      updateFilters({ kalemler: nextKalemler, page: 1 });
      return;
    }

    if (key.startsWith('seviye:')) {
      const id = parseInt(key.slice('seviye:'.length), 10);
      const nextSeviye = (filters.sinif_seviyesi_ids || []).filter((x) => x !== id);
      const nextSinif = (filters.sinif_ids || []).filter(
        (sid) => filterOptions.siniflar.find((s) => s.id === sid)?.sinif_seviyesi_id !== id
      );
      updateFilters({ sinif_seviyesi_ids: nextSeviye, sinif_ids: nextSinif, page: 1 });
      return;
    }

    if (key.startsWith('sinif:')) {
      const id = parseInt(key.slice('sinif:'.length), 10);
      updateFilters({
        sinif_ids: (filters.sinif_ids || []).filter((x) => x !== id),
        page: 1,
      });
      return;
    }

    switch (key) {
      case 'sube_id':
        updateFilters({ sube_id: '', page: 1 });
        break;
      case 'giris_turu':
        updateFilters({ giris_turu: '', page: 1 });
        break;
      case 'cinsiyet':
        updateFilters({ cinsiyet: '', page: 1 });
        break;
      case 'kayit_tarihi':
        updateFilters({ kayit_tarihi_bas: '', kayit_tarihi_bit: '', page: 1 });
        break;
      case 'all_years':
        updateFilters({ all_years: false, page: 1 });
        break;
      default:
        break;
    }
  };

  const displayedOgrenciler = ogrenciler;


  const listTitle = filterMode === "yillik"
    ? `${activeEgitimYili?.baslangic_yil}-${activeEgitimYili?.bitis_yil} Öğrenci Kayıtları`
    : "Öğrenci Listesi";

  const listSubtitle = searchQuery
    ? "Sunucuda arama yapılıyor; sonuçlar anlık filtreleniyor"
    : filterMode === "yillik"
      ? "Seçili eğitim yılına kayıtlı öğrenciler"
      : "Kurumdaki tüm öğrenci kayıtları";

  const hasActiveFilters =
    Boolean(searchInput.trim()) ||
    statusFilter !== "all" ||
    sortBy !== "created_at_desc" ||
    advancedFilterCount > 0;

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (ids: number[], checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        ids.forEach((id) => next.add(id));
      } else {
        ids.forEach((id) => next.delete(id));
      }
      return next;
    });
  };

  const getAvatarColor = (index: number) => {
    const colors = ["blue", "green", "purple", "orange", "pink", "teal"];
    return colors[index % colors.length];
  };

  const getInitials = (ad: string, soyad: string) => {
    return `${ad.charAt(0)}${soyad.charAt(0)}`.toUpperCase();
  };

  // Öğrenci silme fonksiyonu
  const handleDelete = async () => {
    if (!deleteTarget) return;
    
    setDeleteLoading(true);
    setDeleteError(null);
    
    try {
      const response = await apiDelete(`/ogrenciler/api/${deleteTarget.id}/delete/`);
      
      if (response.success) {
        setDeleteTarget(null);
        fetchOgrenciler();
      } else {
        const data = response.data as { code?: string; sozlesme_no?: string } | undefined;
        if (data?.code === 'AKTIF_SOZLESME') {
          setDeleteError(`Bu öğrencinin aktif sözleşmesi bulunmaktadır (${data.sozlesme_no}). Önce sözleşmeyi feshedin veya iptal edin.`);
        } else {
          setDeleteError(response.error || 'Silme işlemi başarısız oldu.');
        }
      }
    } catch (err) {
      console.error("[OgrenciListesi] Delete error:", err);
      setDeleteError('Bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setDeleteLoading(false);
    }
  };

  if (contextLoading) {
    return (
      <div className="section">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Yükleniyor...</p>
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
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div className="hero-text">
            <h1>Öğrenci Listesi</h1>
            <div className="hero-breadcrumb">
              <Link href={portalHomeHref}>Ana Sayfa</Link>
              <span>/</span>
              <span>Öğrenci Listesi</span>
            </div>
          </div>
        </div>
        <Link href={href("yeni-kayit")} className="btn-hero">
          <span className="btn-hero-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </span>
          <span>Yeni Öğrenci</span>
        </Link>
      </div>

      {/* Quick Stats */}
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
            <h4>{toplamOgrenci}</h4>
            <span>{filterMode === "yillik" ? "Kayıtlı Öğrenci" : "Toplam Öğrenci"}</span>
          </div>
        </div>
        <div className="quick-stat">
          <div className="quick-stat-icon green">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <div className="quick-stat-info">
            <h4>{aktifOgrenci}</h4>
            <span>Aktif Kayıt</span>
          </div>
        </div>
        <div className="quick-stat">
          <div className="quick-stat-icon orange">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div className="quick-stat-info">
            <h4>{pasifOgrenci}</h4>
            <span>Pasif Kayıt</span>
          </div>
        </div>
        <div className="quick-stat">
          <div className="quick-stat-icon purple">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          </div>
          <div className="quick-stat-info">
            <h4>%{toplamOgrenci > 0 ? Math.round((aktifOgrenci / toplamOgrenci) * 100) : 0}</h4>
            <span>Aktiflik Oranı</span>
          </div>
        </div>
      </div>

      {/* Context Banner */}
      {activeKurum && activeSube && (
        <div className="context-banner">
          <div className="context-banner-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
          </div>
          <div className="context-banner-content">
            <span className="context-banner-label">Görüntülenen bağlam</span>
            <span className="context-banner-value">
              {activeKurum.ad} · {activeSube.ad}
              {activeEgitimYili
                ? ` · ${activeEgitimYili.baslangic_yil}-${activeEgitimYili.bitis_yil}`
                : ""}
            </span>
          </div>
        </div>
      )}

      {allYearsCount != null && allYearsCount > 0 && !filters.all_years && (
        <div className="ogrenci-all-years-banner">
          <span>
            Seçili yılda sonuç bulunamadı. Tüm yıllarda <strong>{allYearsCount}</strong> eşleşme var.
          </span>
          <button
            type="button"
            className="btn-modern btn-secondary small"
            onClick={() => updateFilters({ all_years: true, page: 1 })}
          >
            Tüm yıllarda ara
          </button>
        </div>
      )}

      {error && (
        <div className="alert-modern alert-error">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Student List */}
      <div className="ogrenci-list-card">
        <OgrenciListToolbar
          title={listTitle}
          subtitle={listSubtitle}
          searchInput={searchInput}
          onSearchInputChange={setSearchInput}
          onSearchClear={handleSearchClear}
          onRefresh={() => fetchOgrenciler()}
          loading={loading}
          statusFilter={statusFilter}
          onStatusFilterChange={(f) => updateFilters({ durum: f, page: 1 })}
          counts={statusCounts}
          sortBy={sortBy}
          onSortChange={(s) =>
            updateFilters({
              sort: s,
              page: 1,
            })
          }
          displayedCount={displayedOgrenciler.length}
          totalFetched={totalCount}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={handleClearFilters}
          onOpenFilters={() => setFilterDrawerOpen(true)}
          onOpenExport={() => {
            setExportMode("all");
            setExportModalOpen(true);
          }}
          selectedCount={selectedIds.size}
          onExportSelected={() => {
            setExportMode("selected");
            setExportModalOpen(true);
          }}
          advancedFilterCount={advancedFilterCount}
          activeFilterChips={activeFilterChips}
          onRemoveFilter={handleRemoveFilter}
        />
        <OgrenciListResults
          loading={loading}
          students={displayedOgrenciler}
          searchQuery={searchQuery}
          filterMode={filterMode}
          activeEgitimYiliLabel={
            activeEgitimYili
              ? `${activeEgitimYili.baslangic_yil}-${activeEgitimYili.bitis_yil}`
              : undefined
          }
          getAvatarColor={getAvatarColor}
          getInitials={getInitials}
          onQuickInfo={(student) => setPopupOgrenci(asOgrenciData(student))}
          onDelete={(ogrenci) => {
            setDeleteError(null);
            setDeleteTarget(asOgrenciData(ogrenci));
          }}
          onBelge={(ogrenci, tip) => setBelgeTarget({ student: asOgrenciData(ogrenci), tip })}
          onClearSearch={handleSearchClear}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          hasKalemFilter={activeKalemFilters.length > 0}
        />
        <Pagination
          currentPage={filters.page || 1}
          totalItems={totalCount}
          pageSize={filters.page_size || 25}
          onPageChange={(page) => updateFilters({ page })}
          onPageSizeChange={(size) => updateFilters({ page_size: size, page: 1 })}
        />
      </div>

      <OgrenciFilterDrawer
        open={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
        filters={filters}
        onApply={(f) => {
          setFilters(f);
          syncUrl(f);
        }}
        onClear={handleClearFilters}
      />

      <OgrenciExportModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        filters={filters}
        mode={exportMode}
        selectedIds={selectedIds}
      />

      {belgeTarget?.tip === 'ogrenci_belgesi' && (
        <OgrenciBelgesiModal
          student={belgeTarget.student}
          onClose={() => setBelgeTarget(null)}
        />
      )}
      {belgeTarget?.tip === 'ogrenci_izin_belgesi' && (
        <OgrenciIzinBelgesiModal
          student={belgeTarget.student}
          onClose={() => setBelgeTarget(null)}
        />
      )}

      {/* Silme Onay Dialogu */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={() => { if (!deleteLoading) { setDeleteTarget(null); setDeleteError(null); } }}>
          <div className="delete-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="delete-dialog-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h3 className="delete-dialog-title">Öğrenciyi Pasife Al</h3>
            <p className="delete-dialog-text">
              <strong>{deleteTarget.tam_ad || `${deleteTarget.ad} ${deleteTarget.soyad}`}</strong> isimli öğrenciyi pasife almak istediğinize emin misiniz?
            </p>
            {deleteError && (
              <div className="delete-dialog-error">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                <span>{deleteError}</span>
              </div>
            )}
            <div className="delete-dialog-actions">
              <button 
                className="delete-dialog-btn cancel" 
                onClick={() => { setDeleteTarget(null); setDeleteError(null); }}
                disabled={deleteLoading}
              >
                Vazgeç
              </button>
              <button 
                className="delete-dialog-btn confirm" 
                onClick={handleDelete}
                disabled={deleteLoading}
              >
                {deleteLoading ? (
                  <>
                    <span className="delete-spinner"></span>
                    Pasife alınıyor...
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                    </svg>
                    Evet, Pasife Al
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hızlı Bilgi */}
      {popupOgrenci && (
        <OgrenciQuickInfoModal
          ogrenci={popupOgrenci}
          avatarColorClass={getAvatarColor(ogrenciler.findIndex((o) => o.id === popupOgrenci.id))}
          initials={getInitials(popupOgrenci.ad, popupOgrenci.soyad)}
          onClose={() => setPopupOgrenci(null)}
        />
      )}

      <style jsx>{`
        .context-banner {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%);
          border: 1px solid rgba(59, 130, 246, 0.2);
          border-radius: 10px;
          margin-bottom: 20px;
        }
        
        .context-banner-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: rgba(59, 130, 246, 0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #3b82f6;
        }
        
        .context-banner-content {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        
        .context-banner-label {
          font-size: 12px;
          color: var(--text-secondary);
          font-weight: 500;
        }
        
        .context-banner-value {
          font-size: 14px;
          color: var(--text-primary);
          font-weight: 600;
        }
        
        .loading-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 20px;
          color: var(--text-secondary);
        }
        
        .spinner {
          width: 40px;
          height: 40px;
          border: 3px solid var(--border-color);
          border-top-color: var(--primary-color);
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 16px;
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        .alert-modern {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          border-radius: 10px;
          margin-bottom: 20px;
        }
        
        .alert-modern.alert-error {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: #ef4444;
        }
        
        .badge-modern.info {
          background: rgba(59, 130, 246, 0.1);
          color: #3b82f6;
        }
        
        .badge-modern.purple {
          background: rgba(139, 92, 246, 0.1);
          color: #8b5cf6;
        }
        
        .badge-modern.warning {
          background: rgba(245, 158, 11, 0.1);
          color: #f59e0b;
        }
        
        .date-text {
          font-size: 13px;
          color: var(--text-secondary);
        }
        
        .cell-primary-row {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        
        .avatar-circle.avatar-photo {
          padding: 0;
          overflow: hidden;
          background: transparent;
        }
        
        .avatar-circle.avatar-photo img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        
        /* Silme onay overlay */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          backdrop-filter: blur(8px);
          animation: fadeIn 0.2s ease-out;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(30px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        
        /* Silme Onay Dialogu */
        .delete-dialog {
          background: var(--card-bg);
          border-radius: 20px;
          width: 90%;
          max-width: 400px;
          padding: 32px;
          text-align: center;
          box-shadow: 0 25px 80px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05);
          animation: slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        
        .delete-dialog-icon {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 16px;
        }
        
        .delete-dialog-title {
          font-size: 18px;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0 0 8px;
        }
        
        .delete-dialog-text {
          font-size: 14px;
          color: var(--text-secondary);
          margin: 0 0 20px;
          line-height: 1.5;
        }
        
        .delete-dialog-text strong {
          color: var(--text-primary);
        }
        
        .delete-dialog-error {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 12px 16px;
          background: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.2);
          border-radius: 12px;
          margin-bottom: 20px;
          text-align: left;
          color: #ef4444;
          font-size: 13px;
          line-height: 1.5;
        }
        
        .delete-dialog-error svg {
          flex-shrink: 0;
          margin-top: 1px;
        }
        
        .delete-dialog-actions {
          display: flex;
          gap: 12px;
        }
        
        .delete-dialog-btn {
          flex: 1;
          padding: 12px 20px;
          border: none;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        
        .delete-dialog-btn.cancel {
          background: var(--bg-secondary);
          color: var(--text-primary);
          border: 1px solid var(--border-color);
        }
        
        .delete-dialog-btn.cancel:hover {
          background: var(--border-color);
        }
        
        .delete-dialog-btn.confirm {
          background: linear-gradient(135deg, #ef4444, #dc2626);
          color: white;
          box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
        }
        
        .delete-dialog-btn.confirm:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(239, 68, 68, 0.4);
        }
        
        .delete-dialog-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        
        .delete-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
      `}</style>
    </div>
  );
}
