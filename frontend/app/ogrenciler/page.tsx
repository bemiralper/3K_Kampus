"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useKurum } from "@/lib/contexts/KurumContext";
import { useOgrenciPath } from "@/components/ogrenci/OgrenciPathProvider";
import { apiGet, apiDelete } from "@/lib/api";
import Pagination from "../odeme-takip/components/Pagination";
import OgrenciListToolbar, { type StatusFilter, type SortOption } from "./components/OgrenciListToolbar";
import OgrenciListResults, { type OgrenciRow } from "./components/OgrenciListResults";
import OgrenciFilterDrawer from "./components/OgrenciFilterDrawer";
import OgrenciExportModal from "./components/OgrenciExportModal";
import OgrenciSinifRosterExportButton from "./components/OgrenciSinifRosterExportButton";
import OgrenciBelgesiModal from "./components/OgrenciBelgesiModal";
import OgrenciIzinBelgesiModal from "./components/OgrenciIzinBelgesiModal";
import type { OgrenciBelgeTipi } from "./components/OgrenciBelgeMenu";
import OgrenciQuickInfoModal from "./components/OgrenciQuickInfoModal";
import { useOgrenciListColumns } from "./hooks/useOgrenciListColumns";
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
  veliler?: {
    id: number;
    ad_soyad: string;
    telefon?: string;
    telefonlar?: { numara: string; etiket?: string }[];
    yakinlik_display?: string;
  }[];
  profil_foto?: string | null;
  // Yıllık kayıt bilgileri
  sinif_id?: number;
  sinif_ad?: string;
  sinif_seviyesi?: string;
  alan_ad?: string;
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
  koc_adi?: string;
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
  const {
    toggleableColumns,
    visibleColumns,
    toggleColumn,
    resetColumns,
  } = useOgrenciListColumns();

  const [filters, setFilters] = useState<OgrenciListFilters>(() =>
    parseFiltersFromSearchParams(new URLSearchParams(searchParams.toString()))
  );
  const [ogrenciler, setOgrenciler] = useState<OgrenciData[]>([]);
  const [aktifOgrenci, setAktifOgrenci] = useState(0);
  const [pasifOgrenci, setPasifOgrenci] = useState(0);
  const [filterMode, setFilterMode] = useState<"yillik" | "tum" | "tum_yillar">("tum");
  const [totalCount, setTotalCount] = useState(0);
  const [allYearsCount, setAllYearsCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(filters.q || "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPushedSearchRef = useRef<string | null>(null);
  const searchInputRef = useRef(searchInput);
  searchInputRef.current = searchInput;
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
    sinif_seviyeleri: { id: number; ad: string }[];
    okullar: { id: number; ad: string; okul_turu?: string }[];
    alanlar: { id: number; ad: string; kod?: string }[];
    rehberler: { id: number; ad: string }[];
    kayit_turleri: { value: string; label: string }[];
    giris_turu: { value: string; label: string }[];
    cinsiyet: { value: string; label: string }[];
  }>({
    kalem_gruplari: [],
    egitim_kalemleri: [],
    siniflar: [],
    sinif_seviyeleri: [],
    okullar: [],
    alanlar: [],
    rehberler: [],
    kayit_turleri: [],
    giris_turu: [],
    cinsiyet: [],
  });

  const statusFilter: StatusFilter = filters.durum || "aktif";
  const sortBy: SortOption =
    filters.sort === "name_desc" ||
    filters.sort === "name_asc" ||
    filters.sort === "kayit_tarihi_asc" ||
    filters.sort === "kayit_tarihi_desc" ||
    filters.sort === "created_at_desc"
      ? (filters.sort as SortOption)
      : "created_at_desc";
  const apiSort = sortBy;
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
    const parsed = parseFiltersFromSearchParams(new URLSearchParams(searchParams.toString()));
    setFilters(parsed);
    const urlQ = parsed.q || "";
    // Kendi debounce'umuzun URL yansımasıysa input'u geri yazma —
    // yazarken harf kaybına yol açıyordu.
    if (lastPushedSearchRef.current !== null && urlQ === lastPushedSearchRef.current) {
      return;
    }
    lastPushedSearchRef.current = urlQ;
    if (searchInputRef.current !== urlQ) {
      setSearchInput(urlQ);
    }
  }, [searchParams]);

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
        lastPushedSearchRef.current = q;
        updateFilters({ q, page: 1 });
      }
    }, 320);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput, filters.q, updateFilters]);

  const handleSearchClear = () => {
    setSearchInput("");
    lastPushedSearchRef.current = "";
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
        sinif_seviyeleri: data.sinif_seviyeleri || [],
        okullar: data.okullar || [],
        alanlar: (data as typeof filterOptions).alanlar || [],
        rehberler: (data as typeof filterOptions).rehberler || [],
        kayit_turleri: data.kayit_turleri || [],
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
      durum: "aktif",
      all_years: false,
      sinif_seviyesi_ids: [],
      sinif_ids: [],
      school_ids: [],
      alan_ids: [],
      coach_ids: [],
      kalemler: [],
      kayit_turu: "",
      giris_turu: "",
      cinsiyet: "",
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
    if ((filters.school_ids || []).length > 0) n += filters.school_ids!.length;
    if ((filters.alan_ids || []).length > 0) n += filters.alan_ids!.length;
    if ((filters.coach_ids || []).length > 0) n += filters.coach_ids!.length;
    if (filters.kayit_turu) n++;
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

    for (const schoolId of filters.school_ids || []) {
      const okulAd =
        filterOptions.okullar.find((o) => o.id === schoolId)?.ad ||
        String(schoolId);
      chips.push({ key: `school:${schoolId}`, label: `Okul: ${okulAd}` });
    }

    for (const alanId of filters.alan_ids || []) {
      const alanAd =
        filterOptions.alanlar.find((a) => a.id === alanId)?.ad || String(alanId);
      chips.push({ key: `alan:${alanId}`, label: `Alan: ${alanAd}` });
    }

    for (const coachId of filters.coach_ids || []) {
      const rehberAd =
        filterOptions.rehberler.find((r) => r.id === coachId)?.ad || String(coachId);
      chips.push({ key: `coach:${coachId}`, label: `Rehber: ${rehberAd}` });
    }

    if (filters.kayit_turu) {
      const label =
        filterOptions.kayit_turleri.find((k) => k.value === filters.kayit_turu)?.label ||
        filters.kayit_turu;
      chips.push({ key: 'kayit_turu', label: `Kayıt türü: ${label}` });
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

    if (key.startsWith('school:')) {
      const id = parseInt(key.slice('school:'.length), 10);
      updateFilters({
        school_ids: (filters.school_ids || []).filter((x) => x !== id),
        page: 1,
      });
      return;
    }

    if (key.startsWith('alan:')) {
      const id = parseInt(key.slice('alan:'.length), 10);
      updateFilters({
        alan_ids: (filters.alan_ids || []).filter((x) => x !== id),
        page: 1,
      });
      return;
    }

    if (key.startsWith('coach:')) {
      const id = parseInt(key.slice('coach:'.length), 10);
      updateFilters({
        coach_ids: (filters.coach_ids || []).filter((x) => x !== id),
        page: 1,
      });
      return;
    }

    switch (key) {
      case 'kayit_turu':
        updateFilters({ kayit_turu: '', page: 1 });
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
      <div className="section ogl-page">
        <div className="ogl-loading">
          <div className="ogl-spinner" aria-hidden />
          <p>Yükleniyor…</p>
        </div>
      </div>
    );
  }

  const contextParts = [
    activeKurum?.ad,
    activeSube?.ad,
    activeEgitimYili ? `${activeEgitimYili.baslangic_yil}-${activeEgitimYili.bitis_yil}` : null,
  ].filter(Boolean);

  return (
    <div className="section ogl-page">
      <header className="ogl-head">
        <div className="ogl-head-main">
          <nav className="ogl-crumbs" aria-label="Sayfa yolu">
            <Link href={portalHomeHref}>Ana Sayfa</Link>
            <span aria-hidden>/</span>
            <span aria-current="page">Öğrenci Listesi</span>
          </nav>
          <h1 className="ogl-title">Öğrenci Listesi</h1>
          <p className="ogl-subtitle">
            {contextParts.length > 0 ? `${contextParts.join(" · ")} — ` : ""}
            Kayıtlı öğrencileri arayın, filtreleyin ve dışa aktarın.
          </p>
        </div>
        <div className="ogl-head-actions">
          <Link href={href("yeni-kayit")} className="ogl-btn ogl-btn--primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Yeni Öğrenci
          </Link>
        </div>
      </header>

      {allYearsCount != null && allYearsCount > 0 && !filters.all_years && (
        <div className="ogl-notice ogl-notice--warn" role="status">
          <span>
            Seçili yılda sonuç bulunamadı. Tüm yıllarda <strong>{allYearsCount}</strong> eşleşme var.
          </span>
          <button
            type="button"
            className="ogl-btn ogl-btn--ghost ogl-btn--sm"
            onClick={() => updateFilters({ all_years: true, page: 1 })}
          >
            Tüm yıllarda ara
          </button>
        </div>
      )}

      {error && (
        <div className="ogl-notice ogl-notice--error" role="alert">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
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
          rosterExport={<OgrenciSinifRosterExportButton filters={filters} />}
          columnsApi={{
            toggleableColumns,
            visibleColumns,
            toggleColumn,
            resetColumns,
          }}
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
          visibleColumns={visibleColumns}
        />
        <div className="ogl-footer">
          <Pagination
            currentPage={filters.page || 1}
            totalItems={totalCount}
            pageSize={filters.page_size || 25}
            onPageChange={(page) => updateFilters({ page })}
            onPageSizeChange={(size) => updateFilters({ page_size: size, page: 1 })}
          />
        </div>
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
        filterDimensions={{
          hasSinif: filterOptions.siniflar.length > 0,
          hasSinifSeviyesi: filterOptions.sinif_seviyeleri.length > 0,
        }}
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

      {/* Pasife alma onayı */}
      {deleteTarget && (
        <div
          className="ogl-dialog-overlay"
          onClick={() => { if (!deleteLoading) { setDeleteTarget(null); setDeleteError(null); } }}
          role="presentation"
        >
          <div
            className="ogl-dialog"
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="ogl-delete-title"
            aria-describedby="ogl-delete-text"
          >
            <div className="ogl-dialog-icon" aria-hidden>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
              </svg>
            </div>
            <h3 id="ogl-delete-title" className="ogl-dialog-title">Öğrenciyi pasife al</h3>
            <p id="ogl-delete-text" className="ogl-dialog-text">
              <strong>{deleteTarget.tam_ad || `${deleteTarget.ad} ${deleteTarget.soyad}`}</strong> pasife alınacak.
              Öğrenci listelerden düşer; kaydı ve geçmişi korunur.
            </p>
            {deleteError && (
              <div className="ogl-dialog-error" role="alert">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{deleteError}</span>
              </div>
            )}
            <div className="ogl-dialog-actions">
              <button
                type="button"
                className="ogl-btn ogl-btn--ghost"
                onClick={() => { setDeleteTarget(null); setDeleteError(null); }}
                disabled={deleteLoading}
              >
                Vazgeç
              </button>
              <button
                type="button"
                className="ogl-btn ogl-btn--danger"
                onClick={handleDelete}
                disabled={deleteLoading}
              >
                {deleteLoading ? (
                  <>
                    <span className="ogl-spinner ogl-spinner--sm ogl-spinner--light" aria-hidden />
                    Pasife alınıyor…
                  </>
                ) : (
                  "Evet, pasife al"
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
    </div>
  );
}
