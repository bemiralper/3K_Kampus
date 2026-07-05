"use client";
import React, { useState, useEffect, useCallback, useMemo, Suspense, lazy } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useKurum } from "@/lib/contexts/KurumContext";
import { useFinansPath } from "@/components/finans/FinansPathProvider";
import { FinansHttpError } from "../../services/finans-http";
import { cariHesapService } from "../../services/cari-hesap-api";
import { giderKaydiService, giderOdemeService } from "../../services/gider-kaydi-api";
import { gelirKaydiService, gelirTahsilatService, GelirTahsilatItem, gelirKategoriService } from "../../services/gelir-api";
import { paymentMethodService, financialAccountService } from "../../services/finans-api";

import {
  CariHesap,
  CariHareket,
  CariDosya,
  CariHesapCariOzet,
  HESAP_TURLERI,
  CARI_ISLEM_YETKI,
  cariTabGorunur,
} from "../../types/cari-hesap-types";
import {
  GiderKaydiListItem,
  GiderKaydiDetail,
  GiderOdemeCreatePayload,
  GiderTaksit,
} from "../../types/gider-types";
import { GelirKaydiListItem, GelirKaydiCreatePayload } from "../../types/gelir-types";
import CariDosyaPanel from "../components/CariDosyaPanel";
import CariEkstreList from "../components/CariEkstreList";
import CariEkstreOzet, { cariEkstreOzetExportMeta } from "../components/CariEkstreOzet";
import { useAuth } from "@/lib/contexts/AuthContext";
import { formatUserDisplayName } from "@/lib/format-user";
import {
  computeRaporTotalsFromOzet,
  defaultRaporBaslangic,
  defaultRaporBitis,
  ekstrePeriodExportMeta,
  formatReportDateRange,
} from "../components/cari-report-export-meta";
import CariQuickStats from "../components/CariQuickStats";
import CariGelirTable from "../components/CariGelirTable";
import CariGiderTable from "../components/CariGiderTable";
import CariOdemeTable from "../components/CariOdemeTable";
import CariTabToolbar, {
  EMPTY_CARI_TAB_FILTERS,
  type CariTabFilterState,
  type CariTableColumnsApi,
  toCariTableColumnsApi,
} from "../components/CariTabToolbar";
import {
  filterCariHareketler,
  filterGelirKayitlari,
  filterGiderKayitlari,
  filterOdemeHareketleri,
  resolveFilterLabel,
} from "../components/cari-tab-filters";
import { buildEkstreExportRows } from "../components/CariEkstreList";
import { buildEkstreExportColumns } from "../components/cari-ekstre-table-columns";
import { buildGiderExportRows } from "../components/CariGiderTable";
import { buildGelirExportRows } from "../components/CariGelirTable";
import { buildOdemeExportRows } from "../components/CariOdemeTable";
import GelirKaydiDrawer from "@/components/finans/GelirKaydiDrawer";
import TahsilatDrawer from "@/components/finans/TahsilatDrawer";
import IslemMasrafiFields from "@/components/finans/IslemMasrafiFields";
import { formatOdemeYontemiLabel } from "@/components/finans/odeme-yontemi-label";
import { EMPTY_ISLEM_MASRAFI, buildIslemMasrafiPayload } from "@/app/finans/types/islem-masrafi-types";
import { islemMasrafiGoster } from "@/app/finans/utils/islem-masrafi-eligibility";
import "@/components/finans/finans-drawer.css";
import "../components/cari-tab-toolbar.css";

const GiderFormModal = lazy(() =>
  import("../../giderler/GiderlerClient").then((m) => ({ default: m.GiderFormModal }))
);
const GiderDetailModal = lazy(() =>
  import("../../giderler/GiderlerClient").then((m) => ({ default: m.GiderDetailModal }))
);

/* ═══════════════════════════════════════════
   Helpers
═══════════════════════════════════════════ */
function fmt(v: number | string | null | undefined) {
  return Number(v || 0).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function fmtTarih(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

type Tab =
  | "genel"
  | "ekstre"
  | "giderler"
  | "gelirler"
  | "odemeler"
  | "dosyalar";

function bakiyeEtiketi(bakiye: number): {
  text: string;
  cls: string;
  bg: string;
} {
  if (bakiye > 0.01)
    return { text: "ALACAKLIYIZ", cls: "text-emerald-600", bg: "bg-emerald-50" };
  if (bakiye < -0.01)
    return { text: "BORÇLUYUZ", cls: "text-rose-600", bg: "bg-rose-50" };
  return { text: "DENGEDE", cls: "text-blue-600", bg: "bg-blue-50" };
}

/* ═══════════════════════════════════════════
   COMPONENT
═══════════════════════════════════════════ */
export default function CariDetayClient({
  cariHesapId,
}: {
  cariHesapId: number;
}) {
  const router = useRouter();
  const { activeKurum, activeSube } = useKurum();
  const { user } = useAuth();
  const { homeHref, href } = useFinansPath();
  const kurumId = activeKurum?.id || 0;

  /* ─── state ─── */
  const [hesap, setHesap] = useState<CariHesap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("genel");

  // ekstre
  const [hareketler, setHareketler] = useState<CariHareket[]>([]);
  const [hareketLoading, setHareketLoading] = useState(false);
  const [cariOzet, setCariOzet] = useState<CariHesapCariOzet | null>(null);
  const [cariOzetLoading, setCariOzetLoading] = useState(false);
  const [tabFilters, setTabFilters] = useState<CariTabFilterState>(EMPTY_CARI_TAB_FILTERS);
  const [odemeYontemleriList, setOdemeYontemleriList] = useState<{ id: number; ad: string }[]>([]);
  const [columnsApi, setColumnsApi] = useState<CariTableColumnsApi | null>(null);
  const [odemeDrawerDefaults, setOdemeDrawerDefaults] = useState<{
    mali_hesap_id?: number;
    odeme_yontemi_id?: number;
  }>({});

  // giderler
  const [giderler, setGiderler] = useState<GiderKaydiListItem[]>([]);
  const [giderLoading, setGiderLoading] = useState(false);

  // gelirler
  const [gelirler, setGelirler] = useState<GelirKaydiListItem[]>([]);
  const [gelirLoading, setGelirLoading] = useState(false);

  // gelir tahsilat
  const [showGelirTahsilatDrawer, setShowGelirTahsilatDrawer] = useState(false);
  const [tahsilatGelirId, setTahsilatGelirId] = useState<number | null>(null);
  const [tahsilatGelirKalan, setTahsilatGelirKalan] = useState(0);
  const [gelirTahsilatForm, setGelirTahsilatForm] = useState({
    odeme_yontemi_id: 0,
    mali_hesap_id: 0,
    tutar: "",
    tahsilat_tarihi: new Date().toISOString().slice(0, 10),
    aciklama: "",
    ...EMPTY_ISLEM_MASRAFI,
  });
  const [gelirTahsilatErrors, setGelirTahsilatErrors] = useState<Record<string, string>>({});
  const [gelirTahsilatGeneralError, setGelirTahsilatGeneralError] = useState<string | null>(null);
  const [gelirTahsilatSaving, setGelirTahsilatSaving] = useState(false);

  // ödemeler
  const [odemeler, setOdemeler] = useState<CariHareket[]>([]);
  const [odemeLoading, setOdemeLoading] = useState(false);

  // dosyalar
  const [dosyalar, setDosyalar] = useState<CariDosya[]>([]);
  const [dosyaLoading, setDosyaLoading] = useState(false);
  const [showDosyaYukle, setShowDosyaYukle] = useState(false);

  // inline drawers
  const [showGiderDrawer, setShowGiderDrawer] = useState(false);
  const [showGelirDrawer, setShowGelirDrawer] = useState(false);
  const [showOdemeDrawer, setShowOdemeDrawer] = useState(false);
  const [showSerbestOdemeDrawer, setShowSerbestOdemeDrawer] = useState(false);
  const [selectedGiderId, setSelectedGiderId] = useState<number | null>(null);

  // gelir form
  const [gelirForm, setGelirForm] = useState<GelirKaydiCreatePayload>({
    kurum_id: 0,
    cari_hesap_id: 0,
    fatura_tarihi: new Date().toISOString().slice(0, 10),
    vade_tarihi: new Date().toISOString().slice(0, 10),
    brut_tutar: 0,
    kdv_orani: 20,
  });
  const [gelirFormErrors, setGelirFormErrors] = useState<Record<string, string>>({});
  const [gelirFormGeneralError, setGelirFormGeneralError] = useState<string | null>(null);
  const [gelirSaving, setGelirSaving] = useState(false);
  const [gelirOdemeYontemleri, setGelirOdemeYontemleri] = useState<
    { id: number; ad: string; tip: string; mali_hesap_id: number }[]
  >([]);
  const [gelirMaliHesaplar, setGelirMaliHesaplar] = useState<{ id: number; ad: string; tip?: string }[]>([]);
  const [gelirFlatKategoriler, setGelirFlatKategoriler] = useState<{ id: number; label: string }[]>([]);

  // gider detay slide-over
  const [detailGider, setDetailGider] = useState<GiderKaydiDetail | null>(
    null
  );
  const [detailGiderLoading, setDetailGiderLoading] = useState(false);
  const [selectedGiderTaksitler, setSelectedGiderTaksitler] = useState<
    GiderTaksit[]
  >([]);

  // toast
  const [toast, setToast] = useState<{
    msg: string;
    type: "ok" | "err";
  } | null>(null);

  const showToast = useCallback((msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  /* ─── data fetchers ─── */
  const loadHesap = useCallback(async () => {
    setLoading(true);
    try {
      const data = await cariHesapService.get(cariHesapId);
      setHesap(data);
    } catch (e: any) {
      setError(e.message || "Yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [cariHesapId]);

  const loadHareketler = useCallback(async () => {
    setHareketLoading(true);
    try {
      setHareketler(await cariHesapService.hareketler(cariHesapId));
    } catch {
      /* silent */
    } finally {
      setHareketLoading(false);
    }
  }, [cariHesapId]);

  const loadCariOzet = useCallback(async () => {
    setCariOzetLoading(true);
    try {
      setCariOzet(await cariHesapService.cariOzet(cariHesapId));
    } catch {
      setCariOzet(null);
    } finally {
      setCariOzetLoading(false);
    }
  }, [cariHesapId]);

  const loadGiderler = useCallback(async () => {
    if (!kurumId) return;
    setGiderLoading(true);
    try {
      setGiderler(
        await giderKaydiService.list({
          kurum_id: String(kurumId),
          cari_hesap_id: String(cariHesapId),
          ...(activeSube?.id ? { sube_id: String(activeSube.id) } : {}),
        })
      );
    } catch {
      /* silent */
    } finally {
      setGiderLoading(false);
    }
  }, [kurumId, cariHesapId, activeSube?.id]);

  const loadGelirler = useCallback(async () => {
    if (!kurumId) return;
    setGelirLoading(true);
    try {
      setGelirler(
        await gelirKaydiService.list({
          kurum_id: String(kurumId),
          cari_hesap_id: String(cariHesapId),
          ...(activeSube?.id ? { sube_id: String(activeSube.id) } : {}),
        })
      );
    } catch {
      /* silent */
    } finally {
      setGelirLoading(false);
    }
  }, [kurumId, cariHesapId, activeSube?.id]);

  const loadOdemeler = useCallback(async () => {
    setOdemeLoading(true);
    try {
      setOdemeler(
        await cariHesapService.hareketler(cariHesapId, {
          islem_turu: "odeme,mahsup,iade",
        })
      );
    } catch {
      /* silent */
    } finally {
      setOdemeLoading(false);
    }
  }, [cariHesapId]);

  const loadDosyalar = useCallback(async () => {
    setDosyaLoading(true);
    try {
      setDosyalar(await cariHesapService.dosyalar(cariHesapId));
    } catch {
      /* silent */
    } finally {
      setDosyaLoading(false);
    }
  }, [cariHesapId]);

  useEffect(() => {
    loadHesap();
  }, [loadHesap]);

  useEffect(() => {
    if (!kurumId) return;
    paymentMethodService
      .dropdown(kurumId, undefined, activeSube?.id)
      .then((r) => setOdemeYontemleriList(r.odeme_yontemleri || []))
      .catch(() => setOdemeYontemleriList([]));
  }, [kurumId, activeSube?.id]);

  useEffect(() => {
    setTabFilters(EMPTY_CARI_TAB_FILTERS);
    setColumnsApi(null);
  }, [activeTab]);

  const patchTabFilters = useCallback((patch: Partial<CariTabFilterState>) => {
    setTabFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const gelirKategoriOptions = useMemo(
    () => hesap?.gelir_kategorileri ?? [],
    [hesap?.gelir_kategorileri]
  );
  const giderKategoriOptions = useMemo(
    () => hesap?.gider_kategorileri ?? [],
    [hesap?.gider_kategorileri]
  );

  const filteredHareketler = useMemo(() => {
    const kategoriAd = resolveFilterLabel(
      [...gelirKategoriOptions, ...giderKategoriOptions],
      tabFilters.kategoriId
    );
    const odemeAd = resolveFilterLabel(odemeYontemleriList, tabFilters.odemeYontemiId);
    return filterCariHareketler(hareketler, tabFilters, kategoriAd, odemeAd);
  }, [hareketler, tabFilters, gelirKategoriOptions, giderKategoriOptions, odemeYontemleriList]);

  const filteredGiderler = useMemo(
    () => filterGiderKayitlari(giderler, tabFilters),
    [giderler, tabFilters]
  );

  const filteredGelirler = useMemo(
    () => filterGelirKayitlari(gelirler, tabFilters),
    [gelirler, tabFilters]
  );

  const filteredOdemeler = useMemo(() => {
    const kategoriAd = resolveFilterLabel(giderKategoriOptions, tabFilters.kategoriId);
    const odemeAd = resolveFilterLabel(odemeYontemleriList, tabFilters.odemeYontemiId);
    return filterOdemeHareketleri(odemeler, tabFilters, kategoriAd, odemeAd);
  }, [odemeler, tabFilters, giderKategoriOptions, odemeYontemleriList]);

  const exportFiltersMeta = useMemo(() => {
    const baslangic = tabFilters.baslangic || defaultRaporBaslangic();
    const bitis = tabFilters.bitis || defaultRaporBitis();
    const tarihAraligi = formatReportDateRange(baslangic, bitis);
    const hesapTuruLabel =
      HESAP_TURLERI.find((t) => t.value === hesap?.hesap_turu)?.label || "Tümü";
    const kategoriAd = resolveFilterLabel(
      [...gelirKategoriOptions, ...giderKategoriOptions],
      tabFilters.kategoriId,
    );
    const odemeAd = resolveFilterLabel(odemeYontemleriList, tabFilters.odemeYontemiId);

    const base: Record<string, unknown> = {
      kurum_id: kurumId,
      sube_id: activeSube?.id,
      cari_unvan: hesap?.gorunen_ad || hesap?.unvan || "",
      arama: tabFilters.arama || undefined,
      arama_filtresi: tabFilters.arama || "Tümü",
      kategori_filtresi: kategoriAd || "Tümü",
      odeme_yontemi_filtresi: odemeAd || "Tümü",
      baslangic,
      bitis,
      tarih_araligi: tarihAraligi,
      raporu_olusturan: formatUserDisplayName(user),
      cari_turu: hesapTuruLabel,
      durum: "Tümü",
      para_birimi: "TL",
    };

    if (activeTab === "ekstre") {
      const periodMeta = ekstrePeriodExportMeta(filteredHareketler);
      const ozetMeta = cariOzet ? cariEkstreOzetExportMeta(cariOzet) : {};
      return {
        ...base,
        ...ozetMeta,
        ...periodMeta,
        report_kind: "cari_ekstre",
        rapor_adi: "Cari Ekstre Raporu",
        report_totals: cariOzet
          ? {
              ...computeRaporTotalsFromOzet(cariOzet),
              donem_toplam_borc: periodMeta.donem_toplam_borc,
              donem_toplam_alacak: periodMeta.donem_toplam_alacak,
              donem_hareket_sayisi: periodMeta.filtrelenmis_hareket_sayisi,
            }
          : undefined,
      };
    }

    return base;
  }, [
    kurumId,
    activeSube?.id,
    hesap,
    tabFilters,
    activeTab,
    cariOzet,
    user,
    filteredHareketler,
    gelirKategoriOptions,
    giderKategoriOptions,
    odemeYontemleriList,
  ]);

  const exportRowsForTab = useMemo(() => {
    if (activeTab === "ekstre") return buildEkstreExportRows(filteredHareketler);
    if (activeTab === "giderler") return buildGiderExportRows(filteredGiderler);
    if (activeTab === "gelirler") return buildGelirExportRows(filteredGelirler);
    if (activeTab === "odemeler") return buildOdemeExportRows(filteredOdemeler);
    return [];
  }, [activeTab, filteredHareketler, filteredGiderler, filteredGelirler, filteredOdemeler]);

  const exportTitleForTab =
    activeTab === "ekstre"
      ? `Cari Ekstre Raporu — ${hesap?.gorunen_ad || ""}`
      : activeTab === "giderler"
        ? `Gider Kayıtları — ${hesap?.gorunen_ad || ""}`
        : activeTab === "gelirler"
          ? `Gelir Kayıtları — ${hesap?.gorunen_ad || ""}`
          : activeTab === "odemeler"
            ? `Ödeme Kayıtları — ${hesap?.gorunen_ad || ""}`
            : "Cari Rapor";

  const ekstreFallbackColumns = useMemo(
    () => (hesap ? buildEkstreExportColumns(hesap.hesap_turu) : []),
    [hesap?.hesap_turu],
  );

  const tabToolbarProps = {
    filters: tabFilters,
    onChange: patchTabFilters,
    columnsApi,
    cariHesapId: cariHesapId,
    exportTitle: exportTitleForTab,
    exportRows: exportRowsForTab,
    exportFilenamePrefix: `cari-${activeTab}-${cariHesapId}`,
    filtersMeta: exportFiltersMeta,
    odemeYontemleri: odemeYontemleriList,
    ...(activeTab === "ekstre"
      ? {
          fallbackExportColumns: ekstreFallbackColumns,
          allowEmptyRowsExport: !!cariOzet || hareketler.length > 0,
          exportLabel: "Ekstre Raporu (PDF/Excel)",
        }
      : {}),
  };

  useEffect(() => {
    if (activeTab === "ekstre") {
      loadHareketler();
      loadCariOzet();
    }
  }, [activeTab, loadHareketler, loadCariOzet]);
  useEffect(() => {
    if (activeTab === "giderler") loadGiderler();
  }, [activeTab, loadGiderler]);
  useEffect(() => {
    if (activeTab === "gelirler") loadGelirler();
  }, [activeTab, loadGelirler]);
  useEffect(() => {
    if (activeTab === "odemeler") loadOdemeler();
  }, [activeTab, loadOdemeler]);
  useEffect(() => {
    if (activeTab === "dosyalar") loadDosyalar();
  }, [activeTab, loadDosyalar]);

  useEffect(() => {
    if (!kurumId) return;
    paymentMethodService
      .dropdown(kurumId, undefined, activeSube?.id)
      .then((r) => setGelirOdemeYontemleri(r.odeme_yontemleri || []))
      .catch(() => {});
    financialAccountService
      .dropdownByKurum(kurumId, activeSube?.id)
      .then((r) => setGelirMaliHesaplar(r.mali_hesaplar || []))
      .catch(() => {});
    if (activeSube?.id) {
      gelirKategoriService
        .tree(kurumId, activeSube.id)
        .then((res) => {
          const flat: { id: number; label: string }[] = [];
          (res.kategoriler || []).forEach((ana: { id: number; ad: string; alt_kategoriler?: { id: number; ad: string }[] }) => {
            flat.push({ id: ana.id, label: ana.ad });
            (ana.alt_kategoriler || []).forEach((alt: { id: number; ad: string }) => {
              flat.push({ id: alt.id, label: `${ana.ad} › ${alt.ad}` });
            });
          });
          setGelirFlatKategoriler(flat);
        })
        .catch(() => setGelirFlatKategoriler([]));
    } else {
      setGelirFlatKategoriler([]);
    }
  }, [kurumId, activeSube?.id]);

  /* ─── derived ─── */
  const hesapTuru = useMemo(
    () => HESAP_TURLERI.find((t) => t.value === hesap?.hesap_turu),
    [hesap?.hesap_turu]
  );
  const islemYetki = hesap?.hesap_turu
    ? CARI_ISLEM_YETKI[hesap.hesap_turu]
    : CARI_ISLEM_YETKI.tedarikci;
  const bakiye = (hesap?.toplam_borc ?? 0) - (hesap?.toplam_alacak ?? 0);
  const bakiyeInfo = bakiyeEtiketi(bakiye);
  const serbestBakiye = hesap?.serbest_bakiye ?? 0;

  const gelirNetGirilen = gelirForm.brut_tutar || 0;
  const gelirKdvOrani = gelirForm.kdv_orani || 0;
  const gelirBrutTutar =
    gelirKdvOrani > 0
      ? Math.round((Number(gelirNetGirilen) / (1 + gelirKdvOrani / 100)) * 100) / 100
      : Number(gelirNetGirilen);
  const gelirKdvTutar =
    Math.round((Number(gelirNetGirilen) - gelirBrutTutar) * 100) / 100;

  const cariGelirKategoriIds = useMemo(
    () => (hesap?.gelir_kategorileri || []).map((k) => k.id),
    [hesap?.gelir_kategorileri],
  );
  const filtrelenmisGelirKategoriler = useMemo(
    () =>
      cariGelirKategoriIds.length > 0
        ? gelirFlatKategoriler.filter((k) => cariGelirKategoriIds.includes(k.id))
        : gelirFlatKategoriler,
    [gelirFlatKategoriler, cariGelirKategoriIds],
  );

  const handleGelirCariHesapChange = (cariHesapId: number) => {
    setGelirForm((f) => {
      const updated = { ...f, cari_hesap_id: cariHesapId };
      if (cariHesapId && cariGelirKategoriIds.length > 0) {
        updated.gelir_kategorisi_id = cariGelirKategoriIds[0];
      } else {
        updated.gelir_kategorisi_id = 0;
      }
      return updated;
    });
  };

  useEffect(() => {
    if (!hesap) return;
    if (activeTab === "giderler" && !cariTabGorunur("giderler", hesap.hesap_turu)) {
      setActiveTab("genel");
    }
    if (activeTab === "gelirler" && !cariTabGorunur("gelirler", hesap.hesap_turu)) {
      setActiveTab("genel");
    }
    if (activeTab === "odemeler" && !cariTabGorunur("odemeler", hesap.hesap_turu)) {
      setActiveTab("genel");
    }
  }, [hesap, activeTab]);

  /* ─── gider actions ─── */
  const handleGiderDetay = async (id: number) => {
    setDetailGiderLoading(true);
    try {
      const data = await giderKaydiService.get(id);
      setDetailGider(data);
    } catch (e: any) {
      showToast(e.message || "Detay yüklenemedi", "err");
    } finally {
      setDetailGiderLoading(false);
    }
  };
  const handleGiderIptal = async (id: number) => {
    if (!confirm("Bu gideri iptal etmek istediğinize emin misiniz?")) return;
    try {
      await giderKaydiService.iptal(id);
      showToast("Gider iptal edildi");
      loadGiderler();
      loadHesap();
      loadHareketler();
    } catch (e: any) {
      showToast(e.message, "err");
    }
  };

  /* ─── ödeme actions ─── */
  const openOdemeDrawer = async (giderId: number) => {
    const gider = giderler.find((g) => g.id === giderId);
    setOdemeDrawerDefaults({
      odeme_yontemi_id: gider?.odeme_yontemi_id || undefined,
    });
    setSelectedGiderId(giderId);
    try {
      const taksitler = await giderKaydiService.taksitler(giderId);
      setSelectedGiderTaksitler(taksitler);
    } catch {
      setSelectedGiderTaksitler([]);
    }
    setShowOdemeDrawer(true);
  };

  /** Serbest ödeme iptal (cari hareket üzerinden) */
  const handleSerbestOdemeIptal = async (cariHareketId: number) => {
    if (!confirm("Bu serbest ödemeyi iptal etmek istediğinize emin misiniz? İşlem geri alınamaz.")) return;
    try {
      const res = await cariHesapService.serbestOdemeIptal(cariHareketId);
      showToast(res.detail || "Serbest ödeme iptal edildi");
      reloadAll();
    } catch (e: any) {
      showToast(e.message || "İptal sırasında hata oluştu", "err");
    }
  };

  /** Gider ödemesi iptal (gider ödeme ID üzerinden) */
  const handleGiderOdemeIptal = async (odemeId: number) => {
    if (!confirm("Bu gider ödemesini iptal etmek istediğinize emin misiniz? İşlem geri alınamaz.")) return;
    try {
      const res = await cariHesapService.giderOdemeIptal(odemeId);
      showToast(res.detail || "Gider ödemesi iptal edildi");
      reloadAll();
    } catch (e: any) {
      showToast(e.message || "İptal sırasında hata oluştu", "err");
    }
  };

  /* ─── gelir tahsilat actions ─── */
  const openGelirTahsilatDrawer = (gelirId: number, kalanTutar: number) => {
    const gelir = gelirler.find((g) => g.id === gelirId);
    setTahsilatGelirId(gelirId);
    setTahsilatGelirKalan(kalanTutar);
    setGelirTahsilatForm({
      odeme_yontemi_id: gelir?.odeme_yontemi_id || 0,
      mali_hesap_id: gelirMaliHesaplar[0]?.id || 0,
      tutar: String(kalanTutar),
      tahsilat_tarihi: new Date().toISOString().slice(0, 10),
      aciklama: "",
      ...EMPTY_ISLEM_MASRAFI,
    });
    setGelirTahsilatErrors({});
    setGelirTahsilatGeneralError(null);
    setShowGelirTahsilatDrawer(true);
  };

  const handleGelirTahsilatSubmit = async () => {
    setGelirTahsilatErrors({});
    setGelirTahsilatGeneralError(null);
    const clientErrs: Record<string, string> = {};
    if (!gelirTahsilatForm.odeme_yontemi_id) {
      clientErrs.odeme_yontemi_id = "Ödeme yöntemi seçiniz";
    }
    if (!gelirTahsilatForm.mali_hesap_id) {
      clientErrs.mali_hesap_id = "Mali hesap seçiniz";
    }
    if (!gelirTahsilatForm.tutar || Number(gelirTahsilatForm.tutar) <= 0) {
      clientErrs.tutar = "Tutar giriniz";
    } else if (Number(gelirTahsilatForm.tutar) > tahsilatGelirKalan) {
      clientErrs.tutar = `Tutar kalan tutardan (₺${fmt(tahsilatGelirKalan)}) fazla olamaz`;
    }
    if (Object.keys(clientErrs).length > 0) {
      setGelirTahsilatErrors(clientErrs);
      setGelirTahsilatGeneralError("Lütfen zorunlu alanları doldurun.");
      return;
    }
    if (!tahsilatGelirId) return;
    setGelirTahsilatSaving(true);
    try {
      const masraf = buildIslemMasrafiPayload(gelirTahsilatForm);
      await gelirTahsilatService.create(tahsilatGelirId, {
        gelir_kaydi_id: tahsilatGelirId,
        odeme_yontemi_id: gelirTahsilatForm.odeme_yontemi_id,
        mali_hesap_id: gelirTahsilatForm.mali_hesap_id,
        tutar: Number(gelirTahsilatForm.tutar),
        tahsilat_tarihi: gelirTahsilatForm.tahsilat_tarihi,
        aciklama: gelirTahsilatForm.aciklama || undefined,
        ...masraf,
      });
      showToast("Tahsilat başarıyla kaydedildi");
      setShowGelirTahsilatDrawer(false);
      reloadAll();
    } catch (err: unknown) {
      if (err instanceof FinansHttpError) {
        setGelirTahsilatErrors(err.fieldErrors);
      }
      showToast(err instanceof Error ? err.message : "Tahsilat kaydedilemedi", "err");
    } finally {
      setGelirTahsilatSaving(false);
    }
  };

  const reloadAll = () => {
    loadHesap();
    loadGiderler();
    loadOdemeler();
    loadHareketler();
    loadCariOzet();
    loadDosyalar();
    loadGelirler();
  };

  const openGelirDrawer = () => {
    setGelirForm({
      kurum_id: kurumId,
      cari_hesap_id: cariHesapId,
      gelir_kategorisi_id: cariGelirKategoriIds[0] || 0,
      sube_id: activeSube?.id,
      fatura_tarihi: new Date().toISOString().slice(0, 10),
      vade_tarihi: new Date().toISOString().slice(0, 10),
      brut_tutar: 0,
      kdv_orani: 20,
    });
    setGelirFormErrors({});
    setGelirFormGeneralError(null);
    setShowGelirDrawer(true);
  };

  const handleGelirSave = async () => {
    const errs: Record<string, string> = {};
    if (!gelirForm.cari_hesap_id) errs.cari_hesap_id = "Cari hesap seçiniz.";
    if (!gelirForm.gelir_kategorisi_id) errs.gelir_kategorisi_id = "Kategori seçiniz.";
    if (!gelirForm.mali_hesap_id) errs.mali_hesap_id = "Mali hesap seçiniz.";
    if (!gelirForm.fatura_tarihi) errs.fatura_tarihi = "Fatura tarihi zorunludur.";
    if (!gelirForm.vade_tarihi) errs.vade_tarihi = "Vade tarihi zorunludur.";
    if (!gelirForm.brut_tutar || Number(gelirForm.brut_tutar) <= 0) {
      errs.brut_tutar = "Net tutar sıfırdan büyük olmalıdır.";
    }
    if (!gelirForm.odeme_yontemi_id) {
      errs.odeme_yontemi_id = "Ödeme türü seçiniz (Nakit, POS, Çek vb.).";
    }
    if (Object.keys(errs).length) {
      setGelirFormErrors(errs);
      setGelirFormGeneralError("Lütfen zorunlu alanları doldurun.");
      return;
    }
    setGelirSaving(true);
    setGelirFormErrors({});
    setGelirFormGeneralError(null);
    try {
      await gelirKaydiService.create({
        ...gelirForm,
        kurum_id: kurumId,
        brut_tutar: gelirBrutTutar,
      });
      showToast("Gelir kaydı oluşturuldu");
      setShowGelirDrawer(false);
      reloadAll();
    } catch (err: unknown) {
      if (err instanceof FinansHttpError) {
        if (Object.keys(err.fieldErrors).length) setGelirFormErrors(err.fieldErrors);
        setGelirFormGeneralError(err.message);
      } else {
        setGelirFormGeneralError(err instanceof Error ? err.message : "Kayıt sırasında hata oluştu.");
      }
    } finally {
      setGelirSaving(false);
    }
  };

  /* ═══ RENDER ═══ */
  if (loading)
    return (
      <div className="section">
        <div className="card-modern">
          <div
            className="card-modern-body"
            style={{ textAlign: "center", padding: "60px" }}
          >
            <div className="loading-spinner"></div>
            <p style={{ marginTop: "16px", color: "#666" }}>Yükleniyor...</p>
          </div>
        </div>
      </div>
    );
  if (error || !hesap)
    return (
      <div className="section" style={{ padding: 32 }}>
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 12,
            padding: 24,
            textAlign: "center",
          }}
        >
          <p
            style={{ color: "#b91c1c", fontSize: 15, fontWeight: 500 }}
          >
            {error || "Cari hesap bulunamadı"}
          </p>
          <Link
            href={href("cari-hesaplar")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginTop: 12,
              color: "#2563eb",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            ← Cari Hesaplara Dön
          </Link>
        </div>
      </div>
    );

  /* ─── Cümle kuran bakiye bilgisi ─── */
  const bakiyeAbs = Math.abs(bakiye);

  return (
    <div className="section">
      {/* TOAST */}
      {toast && (
        <div
          className={`toast-modern ${
            toast.type === "ok" ? "toast-success" : "toast-error"
          }`}
        >
          <span className="toast-icon">
            {toast.type === "ok" ? "✓" : "✕"}
          </span>
          {toast.msg}
        </div>
      )}

      {/* ─── HERO HEADER ─── */}
      <div className="hero-header">
        <div className="hero-content">
          <Link
            href={href("cari-hesaplar")}
            className="hero-back-btn"
            title="Geri Dön"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="hero-icon">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <div className="hero-text">
            <h1>{hesap.gorunen_ad || hesap.unvan}</h1>
            <div className="hero-breadcrumb">
              <a href={homeHref}>Finans</a>
              <span>/</span>
              <a href={href("cari-hesaplar")}>Cari Hesaplar</a>
              <span>/</span>
              <span>{hesap.gorunen_ad || hesap.unvan}</span>
            </div>
          </div>
        </div>
        <div className="hero-actions">
          <span className="hero-badge">
            {hesapTuru?.icon} {hesapTuru?.label || hesap.hesap_turu}
          </span>
          <span className="hero-badge" style={{ opacity: 0.9, fontSize: 12 }}>
            {islemYetki.islemLabel}
          </span>
          <span className="hero-code">{hesap.hesap_kodu || "—"}</span>
          {islemYetki.alim && (
            <button
              className="btn-hero"
              onClick={() => setShowSerbestOdemeDrawer(true)}
            >
              <span className="btn-hero-icon">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <rect
                    x="1"
                    y="4"
                    width="22"
                    height="16"
                    rx="2"
                    ry="2"
                  />
                  <line x1="1" y1="10" x2="23" y2="10" />
                </svg>
              </span>
              <span>Ödeme Yap</span>
            </button>
          )}
          {islemYetki.alim && (
            <button
              className="btn-hero btn-hero-secondary"
              onClick={() => setShowGiderDrawer(true)}
            >
              <span className="btn-hero-icon">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </span>
              <span>Gider Ekle</span>
            </button>
          )}
          {islemYetki.satim && (
            <button
              className="btn-hero btn-hero-secondary"
              onClick={openGelirDrawer}
            >
              <span className="btn-hero-icon">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </span>
              <span>Gelir Ekle</span>
            </button>
          )}
        </div>
      </div>

      {/* ─── QUICK STATS ─── */}
      <CariQuickStats hesap={hesap} />

      {/* ─── TABS ─── */}
      <div className="tabs-modern">
        {(
          [
            {
              key: "genel" as Tab,
              label: "Genel Bilgi",
              icon: (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4" />
                  <path d="M12 8h.01" />
                </svg>
              ),
            },
            {
              key: "ekstre" as Tab,
              label: "Cari Ekstre",
              icon: (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              ),
              count: hareketler.length,
            },
            {
              key: "giderler" as Tab,
              label: "Giderler",
              icon: (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="12" y1="1" x2="12" y2="23" />
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              ),
              count: giderler.length,
            },
            {
              key: "gelirler" as Tab,
              label: "Gelirler",
              icon: (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                  <polyline points="17 6 23 6 23 12" />
                </svg>
              ),
              count: gelirler.length,
            },
            {
              key: "odemeler" as Tab,
              label: "Ödemeler",
              icon: (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect
                    x="1"
                    y="4"
                    width="22"
                    height="16"
                    rx="2"
                    ry="2"
                  />
                  <line x1="1" y1="10" x2="23" y2="10" />
                </svg>
              ),
              count: odemeler.length,
            },
            {
              key: "dosyalar" as Tab,
              label: "Dosyalar",
              icon: (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              ),
              count: dosyalar.length,
            },
          ] as const
        )
          .filter((t) => {
            if (t.key === "giderler" || t.key === "odemeler") {
              return cariTabGorunur(t.key, hesap.hesap_turu);
            }
            if (t.key === "gelirler") {
              return cariTabGorunur("gelirler", hesap.hesap_turu);
            }
            return true;
          })
          .map((t) => (
          <a
            key={t.key}
            className={`tab-modern ${activeTab === t.key ? "active" : ""}`}
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab(t.key);
            }}
          >
            {t.icon}
            {t.label}
            {"count" in t && (t.count ?? 0) > 0 && (
              <span className="tab-count">{t.count}</span>
            )}
          </a>
        ))}
      </div>

      {/* ─── TAB CONTENT ─── */}
      <div
        className="card-modern"
        style={{
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          borderTop: "none",
        }}
      >
        <div className="card-modern-header">
          <h3>
            {activeTab === "genel" && "Genel Bilgi"}
            {activeTab === "ekstre" && "Cari Ekstre — Tüm Hareketler"}
            {activeTab === "giderler" && "Gider Kayıtları"}
            {activeTab === "gelirler" && "Gelir Kayıtları"}
            {activeTab === "odemeler" && "Ödeme Kayıtları"}
            {activeTab === "dosyalar" && "Belgeler & Dosyalar"}
          </h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {activeTab === "ekstre" && (
              <button
                onClick={loadHareketler}
                className="btn-modern btn-outline-sm"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                Yenile
              </button>
            )}
            {activeTab === "giderler" && cariTabGorunur("giderler", hesap.hesap_turu) && (
              <>
                <button
                  onClick={loadGiderler}
                  className="btn-modern btn-outline-sm"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="23 4 23 10 17 10" />
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                  Yenile
                </button>
                <button
                  onClick={() => setShowGiderDrawer(true)}
                  className="btn-modern btn-primary-sm"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Yeni Gider
                </button>
              </>
            )}
            {activeTab === "gelirler" && cariTabGorunur("gelirler", hesap.hesap_turu) && (
              <>
                <button
                  onClick={loadGelirler}
                  className="btn-modern btn-outline-sm"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="23 4 23 10 17 10" />
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                  Yenile
                </button>
                <button
                  onClick={openGelirDrawer}
                  className="btn-modern btn-primary-sm"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Yeni Gelir
                </button>
              </>
            )}
            {activeTab === "odemeler" && cariTabGorunur("odemeler", hesap.hesap_turu) && (
              <>
                <button
                  onClick={loadOdemeler}
                  className="btn-modern btn-outline-sm"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="23 4 23 10 17 10" />
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                  Yenile
                </button>
                <button
                  onClick={() => setShowSerbestOdemeDrawer(true)}
                  className="btn-modern btn-primary-sm"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect
                      x="1"
                      y="4"
                      width="22"
                      height="16"
                      rx="2"
                      ry="2"
                    />
                    <line x1="1" y1="10" x2="23" y2="10" />
                  </svg>
                  Serbest Ödeme
                </button>
              </>
            )}
            {activeTab === "dosyalar" && (
              <>
                <button
                  onClick={loadDosyalar}
                  className="btn-modern btn-outline-sm"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="23 4 23 10 17 10" />
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                  Yenile
                </button>
                <button
                  onClick={() => setShowDosyaYukle(true)}
                  className="btn-modern btn-primary-sm"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  Dosya Yükle
                </button>
              </>
            )}
          </div>
        </div>
        <div className="card-modern-body">
          {/* ════════ GENEL BİLGİ ════════ */}
          {activeTab === "genel" && (
            <div className="detail-sections">
              {/* Firma & İletişim */}
              <div className="detail-section">
                <div className="detail-section-header">
                  <div className="detail-section-icon blue">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </div>
                  <h4>Firma & İletişim Bilgileri</h4>
                </div>
                <div className="detail-grid">
                  <InfoRow label="Ünvan" value={hesap.unvan} />
                  <InfoRow label="Kısa Ad" value={hesap.kisa_ad} />
                  <InfoRow
                    label="Hesap Kodu"
                    value={hesap.hesap_kodu}
                    highlight
                  />
                  <InfoRow
                    label="Hesap Türü"
                    value={hesapTuru?.label || hesap.hesap_turu}
                  />
                  <InfoRow label="Vergi No" value={hesap.vergi_no} />
                  <InfoRow
                    label="Vergi Dairesi"
                    value={hesap.vergi_dairesi}
                  />
                  <InfoRow label="Telefon" value={hesap.telefon} />
                  <InfoRow label="E-posta" value={hesap.email} />
                  <InfoRow
                    label="İl / İlçe"
                    value={[hesap.il, hesap.ilce]
                      .filter(Boolean)
                      .join(" / ")}
                  />
                  <InfoRow label="Adres" value={hesap.adres} colSpan />
                </div>
              </div>

              {/* Yetkili Kişi */}
              {hesap.yetkili_kisi && (
                <div className="detail-section">
                  <div className="detail-section-header">
                    <div className="detail-section-icon purple">
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <line x1="19" y1="8" x2="19" y2="14" />
                        <line x1="22" y1="11" x2="16" y2="11" />
                      </svg>
                    </div>
                    <h4>Yetkili Kişi</h4>
                  </div>
                  <div className="yetkili-card-modern">
                    <div className="yetkili-avatar">
                      {hesap.yetkili_kisi?.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="yetkili-name">
                        {hesap.yetkili_kisi}
                      </div>
                      {hesap.yetkili_telefon && (
                        <div className="yetkili-phone">
                          {hesap.yetkili_telefon}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Banka */}
              {(hesap.banka_adi || hesap.iban) && (
                <div className="detail-section">
                  <div className="detail-section-header">
                    <div className="detail-section-icon green">
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <rect
                          x="1"
                          y="4"
                          width="22"
                          height="16"
                          rx="2"
                          ry="2"
                        />
                        <line x1="1" y1="10" x2="23" y2="10" />
                      </svg>
                    </div>
                    <h4>Banka Bilgileri</h4>
                  </div>
                  <div className="detail-grid">
                    <InfoRow label="Banka" value={hesap.banka_adi} />
                    <InfoRow label="IBAN" value={hesap.iban} />
                    <InfoRow
                      label="Hesap Sahibi"
                      value={hesap.hesap_sahibi}
                    />
                  </div>
                </div>
              )}

              {/* Gider Kategorileri */}
              {hesap.gider_kategorileri &&
                hesap.gider_kategorileri.length > 0 && (
                  <div className="detail-section">
                    <div className="detail-section-header">
                      <div className="detail-section-icon orange">
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                          <line x1="7" y1="7" x2="7.01" y2="7" />
                        </svg>
                      </div>
                      <h4>Hizmet Aldığı Gider Kategorileri</h4>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 8,
                      }}
                    >
                      {hesap.gider_kategorileri.map((k) => (
                        <span
                          key={k.id}
                          className="badge-modern primary"
                        >
                          {k.ad}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

              {/* Gelir Kategorileri */}
              {hesap.gelir_kategorileri &&
                hesap.gelir_kategorileri.length > 0 && (
                  <div className="detail-section">
                    <div className="detail-section-header">
                      <div className="detail-section-icon green">
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                          <polyline points="17 6 23 6 23 12" />
                        </svg>
                      </div>
                      <h4>Satış Yaptığı Gelir Kategorileri</h4>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 8,
                      }}
                    >
                      {hesap.gelir_kategorileri.map((k) => (
                        <span
                          key={k.id}
                          className="badge-modern success"
                        >
                          {k.ad}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

              {/* Notlar */}
              {hesap.notlar && (
                <div className="detail-section">
                  <div className="detail-section-header">
                    <div className="detail-section-icon blue">
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </div>
                    <h4>Notlar</h4>
                  </div>
                  <p
                    style={{
                      color: "#4b5563",
                      whiteSpace: "pre-wrap",
                      fontSize: 14,
                      lineHeight: 1.6,
                    }}
                  >
                    {hesap.notlar}
                  </p>
                </div>
              )}

              {/* Alış / Gider Analizi */}
              {islemYetki.alim && Number(hesap.toplam_gider) > 0 && (
                <div className="detail-section">
                  <div className="detail-section-header">
                    <div className="detail-section-icon purple">
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M18 20V10" />
                        <path d="M12 20V4" />
                        <path d="M6 20v-6" />
                      </svg>
                    </div>
                    <h4>Alış / Gider Analizi</h4>
                  </div>
                  {(() => {
                    const toplam = Number(hesap.toplam_gider) || 0;
                    const kalan = Number(hesap.gider_borcu) || 0;
                    const odenen = toplam - kalan;
                    const oran = toplam > 0 ? Math.round((odenen / toplam) * 100) : 0;
                    return (
                      <>
                        <div className="analiz-cards">
                          <div className="analiz-card rose">
                            <div className="analiz-icon">
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                              </svg>
                            </div>
                            <div className="analiz-value">₺{fmt(toplam)}</div>
                            <div className="analiz-label">Toplam Alış</div>
                          </div>
                          <div className="analiz-card emerald">
                            <div className="analiz-icon">
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            </div>
                            <div className="analiz-value">₺{fmt(odenen)}</div>
                            <div className="analiz-label">Ödenen</div>
                          </div>
                          <div className="analiz-card orange">
                            <div className="analiz-icon">
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                              </svg>
                            </div>
                            <div className="analiz-value">₺{fmt(kalan)}</div>
                            <div className="analiz-label">Kalan Borç</div>
                          </div>
                          <div className="analiz-card violet">
                            <div className="analiz-icon">
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 20V10" />
                                <path d="M12 20V4" />
                                <path d="M6 20v-6" />
                              </svg>
                            </div>
                            <div className="analiz-value">%{oran}</div>
                            <div className="analiz-label">Ödeme Oranı</div>
                          </div>
                        </div>
                        <div className="progress-bar-modern">
                          <div
                            className="progress-fill-modern"
                            style={{ width: `${Math.min(100, oran)}%` }}
                          />
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Satış / Gelir Analizi */}
              {islemYetki.satim && Number(hesap.toplam_gelir) > 0 && (
                <div className="detail-section">
                  <div className="detail-section-header">
                    <div className="detail-section-icon green">
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M18 20V10" />
                        <path d="M12 20V4" />
                        <path d="M6 20v-6" />
                      </svg>
                    </div>
                    <h4>Satış / Gelir Analizi</h4>
                  </div>
                  {(() => {
                    const toplam = Number(hesap.toplam_gelir) || 0;
                    const kalan = Number(hesap.gelir_alacagi) || 0;
                    const tahsil = Number(hesap.tahsil_edilen_gelir) || 0;
                    const oran = toplam > 0 ? Math.round((tahsil / toplam) * 100) : 0;
                    return (
                      <>
                        <div className="analiz-cards">
                          <div className="analiz-card violet">
                            <div className="analiz-icon">
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                              </svg>
                            </div>
                            <div className="analiz-value">₺{fmt(toplam)}</div>
                            <div className="analiz-label">Toplam Gelir</div>
                          </div>
                          <div className="analiz-card emerald">
                            <div className="analiz-icon">
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            </div>
                            <div className="analiz-value">₺{fmt(tahsil)}</div>
                            <div className="analiz-label">Tahsil Edilen</div>
                          </div>
                          <div className="analiz-card rose">
                            <div className="analiz-icon">
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                              </svg>
                            </div>
                            <div className="analiz-value">₺{fmt(kalan)}</div>
                            <div className="analiz-label">Kalan Alacak</div>
                          </div>
                          <div className="analiz-card orange">
                            <div className="analiz-icon">
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 20V10" />
                                <path d="M12 20V4" />
                                <path d="M6 20v-6" />
                              </svg>
                            </div>
                            <div className="analiz-value">%{oran}</div>
                            <div className="analiz-label">Tahsilat Oranı</div>
                          </div>
                        </div>
                        <div className="progress-bar-modern">
                          <div
                            className="progress-fill-modern"
                            style={{ width: `${Math.min(100, oran)}%` }}
                          />
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* ════════ CARİ EKSTRE ════════ */}
          {activeTab === "ekstre" && (
            <>
              <CariEkstreOzet
                ozet={cariOzet}
                loading={cariOzetLoading}
                tarihBaslangic={tabFilters.baslangic || defaultRaporBaslangic()}
                tarihBitis={tabFilters.bitis || defaultRaporBitis()}
              />
              <CariTabToolbar
                {...tabToolbarProps}
                kategoriler={[...gelirKategoriOptions, ...giderKategoriOptions]}
              />
              {hareketLoading ? (
                <div style={{ textAlign: "center", padding: 48 }}>
                  <div className="loading-spinner"></div>
                  <p
                    style={{
                      marginTop: 12,
                      color: "#9ca3af",
                      fontSize: 14,
                    }}
                  >
                    Hareketler yükleniyor...
                  </p>
                </div>
              ) : (
                <CariEkstreList
                  hareketler={filteredHareketler}
                  hesapTuru={hesap.hesap_turu}
                  onColumnsReady={(api) => setColumnsApi(toCariTableColumnsApi(api))}
                  emptyMessage={
                    hareketler.length === 0
                      ? "Henüz cari hareket yok"
                      : "Filtreye uygun hareket bulunamadı"
                  }
                />
              )}
            </>
          )}

          {/* ════════ GİDERLER ════════ */}
          {activeTab === "giderler" && cariTabGorunur("giderler", hesap.hesap_turu) && (
            <>
              {(giderler.length > 0 || tabFilters.arama) && (
                <CariTabToolbar
                  {...tabToolbarProps}
                  kategoriler={giderKategoriOptions}
                />
              )}
              {giderLoading ? (
                <div style={{ textAlign: "center", padding: 48 }}>
                  <div className="loading-spinner"></div>
                  <p
                    style={{
                      marginTop: 12,
                      color: "#9ca3af",
                      fontSize: 14,
                    }}
                  >
                    Yükleniyor...
                  </p>
                </div>
              ) : filteredGiderler.length === 0 ? (
                <div className="empty-state-modern">
                  <div className="empty-icon">
                    <svg
                      width="48"
                      height="48"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <line x1="12" y1="1" x2="12" y2="23" />
                      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                    </svg>
                  </div>
                  <h4>{giderler.length === 0 ? "Henüz Gider Kaydı Yok" : "Filtreye Uygun Gider Yok"}</h4>
                  <p>{giderler.length === 0 ? "İlk gider kaydınızı ekleyerek başlayın" : "Filtreleri değiştirin veya temizleyin"}</p>
                  {giderler.length === 0 && (
                  <button
                    onClick={() => setShowGiderDrawer(true)}
                    className="btn-modern btn-primary-sm"
                    style={{ marginTop: 12 }}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    İlk Gideri Ekle
                  </button>
                  )}
                </div>
              ) : (
                <CariGiderTable
                  items={filteredGiderler}
                  onOdeme={openOdemeDrawer}
                  onIptal={handleGiderIptal}
                  onDetay={handleGiderDetay}
                  onColumnsReady={(api) => setColumnsApi(toCariTableColumnsApi(api))}
                  emptyMessage="Filtreye uygun gider bulunamadı"
                />
              )}
            </>
          )}

          {/* ════════ GELİRLER ════════ */}
          {activeTab === "gelirler" && cariTabGorunur("gelirler", hesap.hesap_turu) && (
            <>
              {(gelirler.length > 0 || tabFilters.arama) && (
                <CariTabToolbar
                  {...tabToolbarProps}
                  kategoriler={gelirKategoriOptions}
                />
              )}
              {gelirLoading ? (
                <div style={{ textAlign: "center", padding: 48 }}>
                  <div className="loading-spinner"></div>
                </div>
              ) : filteredGelirler.length === 0 ? (
                <div className="empty-state-modern">
                  <div className="empty-icon">
                    <svg
                      width="48"
                      height="48"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                      <polyline points="17 6 23 6 23 12" />
                    </svg>
                  </div>
                  <h4>{gelirler.length === 0 ? "Henüz Gelir Kaydı Yok" : "Filtreye Uygun Gelir Yok"}</h4>
                  <p>{gelirler.length === 0 ? "Bu cariye ait gelir kaydı bulunmuyor" : "Filtreleri değiştirin veya temizleyin"}</p>
                  {gelirler.length === 0 && (
                  <button
                    onClick={openGelirDrawer}
                    className="btn-modern btn-primary"
                    style={{ marginTop: 16 }}
                  >
                    Gelir Ekle
                  </button>
                  )}
                </div>
              ) : (
                <CariGelirTable
                  items={filteredGelirler}
                  onTahsilat={openGelirTahsilatDrawer}
                  onColumnsReady={(api) => setColumnsApi(toCariTableColumnsApi(api))}
                  emptyMessage="Filtreye uygun gelir bulunamadı"
                />
              )}
            </>
          )}

          {/* ════════ ÖDEMELER ════════ */}
          {activeTab === "odemeler" && cariTabGorunur("odemeler", hesap.hesap_turu) && (
            <>
              {(odemeler.length > 0 || tabFilters.arama) && (
                <CariTabToolbar
                  {...tabToolbarProps}
                  kategoriler={giderKategoriOptions}
                />
              )}
              {odemeLoading ? (
                <div style={{ textAlign: "center", padding: 48 }}>
                  <div className="loading-spinner"></div>
                </div>
              ) : filteredOdemeler.length === 0 ? (
                <div className="empty-state-modern">
                  <div className="empty-icon">
                    <svg
                      width="48"
                      height="48"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <rect
                        x="1"
                        y="4"
                        width="22"
                        height="16"
                        rx="2"
                        ry="2"
                      />
                      <line x1="1" y1="10" x2="23" y2="10" />
                    </svg>
                  </div>
                  <h4>{odemeler.length === 0 ? "Henüz Ödeme Kaydı Yok" : "Filtreye Uygun Ödeme Yok"}</h4>
                  <p>{odemeler.length === 0 ? "İlk ödemenizi yaparak başlayın" : "Filtreleri değiştirin veya temizleyin"}</p>
                  {odemeler.length === 0 && (
                  <button
                    onClick={() => setShowSerbestOdemeDrawer(true)}
                    className="btn-modern btn-primary-sm"
                    style={{ marginTop: 12 }}
                  >
                    İlk Ödemeyi Yap
                  </button>
                  )}
                </div>
              ) : (
                <CariOdemeTable
                  items={filteredOdemeler}
                  onSerbestOdemeIptal={handleSerbestOdemeIptal}
                  onGiderOdemeIptal={handleGiderOdemeIptal}
                  onColumnsReady={(api) => setColumnsApi(toCariTableColumnsApi(api))}
                  emptyMessage="Filtreye uygun ödeme bulunamadı"
                />
              )}
            </>
          )}

          {/* ════════ DOSYALAR ════════ */}
          {activeTab === "dosyalar" && (
            <CariDosyaPanel
              cariHesapId={cariHesapId}
              dosyalar={dosyalar}
              loading={dosyaLoading}
              showUpload={showDosyaYukle}
              onShowUpload={() => setShowDosyaYukle(true)}
              onHideUpload={() => setShowDosyaYukle(false)}
              onRefresh={loadDosyalar}
              onSuccess={(msg) => showToast(msg || "İşlem başarılı")}
              onError={(msg) => showToast(msg, "err")}
            />
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════
         DRAWER: GİDER EKLE
      ═══════════════════════════════════════════ */}
      {showGiderDrawer && islemYetki.alim && (
        <Suspense fallback={null}>
          <GiderFormModal
            kurumId={kurumId}
            subeId={activeSube?.id}
            defaultCariHesapId={cariHesapId}
            lockedCariHesap={
              hesap
                ? {
                    id: cariHesapId,
                    gorunen_ad: hesap.gorunen_ad || hesap.unvan,
                    hesap_turu: hesap.hesap_turu,
                    gider_kategorileri: (hesap.gider_kategorileri || []).map((k) => k.id),
                  }
                : undefined
            }
            presetGiderKategorileri={hesap?.gider_kategorileri}
            onClose={() => setShowGiderDrawer(false)}
            onSuccess={(msg) => {
              showToast(msg || "Gider eklendi");
              setShowGiderDrawer(false);
              reloadAll();
            }}
            onError={(msg) => showToast(msg, "err")}
          />
        </Suspense>
      )}

      <GelirKaydiDrawer
        open={showGelirDrawer && islemYetki.satim}
        onClose={() => setShowGelirDrawer(false)}
        editId={null}
        form={gelirForm}
        setForm={setGelirForm}
        formErrors={gelirFormErrors}
        formGeneralError={gelirFormGeneralError}
        saving={gelirSaving}
        onSave={handleGelirSave}
        cariHesaplar={[
          { id: cariHesapId, gorunen_ad: hesap.gorunen_ad || hesap.unvan },
        ]}
        kategoriler={filtrelenmisGelirKategoriler}
        onCariHesapChange={handleGelirCariHesapChange}
        maliHesaplar={gelirMaliHesaplar}
        brutTutar={gelirBrutTutar}
        kdvTutar={gelirKdvTutar}
        kdvOrani={gelirKdvOrani}
        fmtTutar={fmt}
        odemeYontemleri={gelirOdemeYontemleri}
      />

      {/* SLIDE-OVER: GİDER DETAY */}
      {(detailGider || detailGiderLoading) && (
        <>
          <div
            className="fd-overlay"
            onClick={() => {
              setDetailGider(null);
              setDetailGiderLoading(false);
            }}
            aria-hidden
          />
          <div className="fd-panel fd-panel--wide fd-panel--gider" role="dialog" aria-modal="true">
            {detailGiderLoading ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
                <div className="loading-spinner"></div>
                <span style={{ fontSize: 14 }}>
                  Gider detayı yükleniyor...
                </span>
              </div>
            ) : (
              detailGider && (
                <Suspense fallback={
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
                    <div className="loading-spinner"></div>
                    <span style={{ fontSize: 14 }}>Gider detayı yükleniyor...</span>
                  </div>
                }>
                  <GiderDetailModal
                    data={detailGider}
                    kurumId={kurumId}
                    onClose={() => setDetailGider(null)}
                    onAction={(msg) => {
                      showToast(msg);
                      reloadAll();
                      handleGiderDetay(detailGider.id);
                    }}
                    onError={(msg) => showToast(msg, "err")}
                  />
                </Suspense>
              )
            )}
          </div>
        </>
      )}

      {/* DRAWER: GİDER ÖDEMESİ */}
      {showOdemeDrawer && selectedGiderId && (
        <OdemeYapDrawer
          kurumId={kurumId}
          giderId={selectedGiderId}
          taksitler={selectedGiderTaksitler}
          cariBakiye={serbestBakiye}
          defaultMaliHesapId={odemeDrawerDefaults.mali_hesap_id}
          defaultOdemeYontemiId={odemeDrawerDefaults.odeme_yontemi_id}
          onClose={() => {
            setShowOdemeDrawer(false);
            setSelectedGiderId(null);
          }}
          onSuccess={(msg) => {
            showToast(msg || "Ödeme kaydedildi");
            setShowOdemeDrawer(false);
            setSelectedGiderId(null);
            reloadAll();
          }}
          onError={(msg) => showToast(msg, "err")}
        />
      )}

      {/* DRAWER: SERBEST ÖDEME */}
      {showSerbestOdemeDrawer && islemYetki.alim && (
        <SerbestOdemeDrawer
          kurumId={kurumId}
          cariHesapId={cariHesapId}
          cariHesapAdi={hesap.gorunen_ad || hesap.unvan}
          bakiye={bakiye}
          onClose={() => setShowSerbestOdemeDrawer(false)}
          onSuccess={(msg) => {
            showToast(msg || "Ödeme kaydedildi");
            setShowSerbestOdemeDrawer(false);
            reloadAll();
          }}
          onError={(msg) => showToast(msg, "err")}
        />
      )}

      {/* ─── GELİR TAHSİLAT DRAWER ─── */}
      <TahsilatDrawer
        open={showGelirTahsilatDrawer && !!tahsilatGelirId}
        onClose={() => setShowGelirTahsilatDrawer(false)}
        kalanTutar={tahsilatGelirKalan}
        fmtTutar={fmt}
        form={gelirTahsilatForm}
        setForm={setGelirTahsilatForm}
        fieldErrors={gelirTahsilatErrors}
        generalError={gelirTahsilatGeneralError}
        saving={gelirTahsilatSaving}
        onSubmit={handleGelirTahsilatSubmit}
        odemeYontemleri={gelirOdemeYontemleri}
        maliHesaplar={gelirMaliHesaplar}
      />

      {/* ─── SCOPED STYLES ─── */}
      <style jsx>{`
        /* Toast */
        .toast-modern {
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 9999;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 22px;
          border-radius: 14px;
          color: white;
          font-size: 14px;
          font-weight: 600;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
          animation: slideDown 0.3s ease;
          backdrop-filter: blur(10px);
        }
        .toast-success {
          background: linear-gradient(135deg, #059669, #10b981);
        }
        .toast-error {
          background: linear-gradient(135deg, #dc2626, #ef4444);
        }
        .toast-icon {
          font-size: 16px;
        }
        @keyframes slideDown {
          from {
            transform: translateY(-20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        @keyframes slideIn {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }

        /* Hero extras */
        .hero-back-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.15);
          color: white;
          transition: all 0.2s;
          margin-right: 4px;
        }
        .hero-back-btn:hover {
          background: rgba(255, 255, 255, 0.25);
        }
        .hero-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 6px 14px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.2);
          color: white;
          font-size: 13px;
          font-weight: 600;
          backdrop-filter: blur(8px);
        }
        .hero-code {
          display: inline-flex;
          padding: 6px 14px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.15);
          color: rgba(255, 255, 255, 0.9);
          font-size: 12px;
          font-weight: 600;
          font-family: monospace;
        }
        .btn-hero-secondary {
          background: rgba(255, 255, 255, 0.15) !important;
          border: 1px solid rgba(255, 255, 255, 0.3) !important;
        }
        .btn-hero-secondary:hover {
          background: rgba(255, 255, 255, 0.25) !important;
        }

        /* Detail sections */
        .detail-sections {
          display: flex;
          flex-direction: column;
          gap: 28px;
          padding: 24px 28px 28px;
        }
        @media (max-width: 640px) {
          .detail-sections {
            padding: 18px 16px 20px;
          }
        }
        .detail-section {
        }
        .detail-section-header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding-bottom: 12px;
          border-bottom: 1px solid #f3f4f6;
          margin-bottom: 16px;
        }
        .detail-section-icon {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .detail-section-icon.blue {
          background: #dbeafe;
          color: #2563eb;
        }
        .detail-section-icon.green {
          background: #d1fae5;
          color: #059669;
        }
        .detail-section-icon.purple {
          background: #ede9fe;
          color: #7c3aed;
        }
        .detail-section-icon.orange {
          background: #ffedd5;
          color: #ea580c;
        }
        .detail-section-header h4 {
          font-size: 15px;
          font-weight: 600;
          color: #111827;
          margin: 0;
        }

        /* Detail grid */
        .detail-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }
        @media (max-width: 768px) {
          .detail-grid {
            grid-template-columns: 1fr;
          }
        }

        .info-row--full {
          grid-column: 1 / -1;
        }
        .info-row-label {
          font-size: 11px;
          color: #9ca3af;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-weight: 600;
        }
        .info-row-value {
          font-size: 14px;
          font-weight: 500;
          color: #1f2937;
          margin-top: 4px;
          line-height: 1.4;
          word-break: break-word;
        }
        .info-row-value--highlight {
          display: inline-flex;
          font-weight: 700;
          color: var(--primary, #0262a7);
          font-family: ui-monospace, monospace;
          background: rgba(2, 98, 167, 0.08);
          padding: 2px 8px;
          border-radius: 6px;
        }
        .info-row-value--empty {
          color: #cbd5e1;
          font-weight: 400;
        }

        /* Yetkili card modern */
        .yetkili-card-modern {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px 18px;
          background: linear-gradient(135deg, #f8fafc, #f1f5f9);
          border: 1px solid #e2e8f0;
          border-radius: 14px;
        }
        .yetkili-avatar {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: linear-gradient(135deg, #818cf8, #6366f1);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 700;
          font-size: 16px;
        }
        .yetkili-name {
          font-weight: 600;
          color: #1e293b;
          font-size: 15px;
        }
        .yetkili-phone {
          color: #64748b;
          font-size: 13px;
          margin-top: 2px;
        }

        /* Analiz cards modern */
        .analiz-cards {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
        }
        @media (max-width: 768px) {
          .analiz-cards {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        .analiz-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          padding: 18px 12px;
          border-radius: 14px;
          text-align: center;
          border: 1px solid transparent;
        }
        .analiz-card.rose {
          background: #fff1f2;
          border-color: #fecdd3;
        }
        .analiz-card.emerald {
          background: #ecfdf5;
          border-color: #a7f3d0;
        }
        .analiz-card.orange {
          background: #fff7ed;
          border-color: #fed7aa;
        }
        .analiz-card.violet {
          background: #f5f3ff;
          border-color: #ddd6fe;
        }
        .analiz-icon {
          opacity: 0.7;
        }
        .analiz-card.rose .analiz-icon {
          color: #e11d48;
        }
        .analiz-card.emerald .analiz-icon {
          color: #059669;
        }
        .analiz-card.orange .analiz-icon {
          color: #ea580c;
        }
        .analiz-card.violet .analiz-icon {
          color: #7c3aed;
        }
        .analiz-value {
          font-size: 20px;
          font-weight: 700;
        }
        .analiz-card.rose .analiz-value {
          color: #e11d48;
        }
        .analiz-card.emerald .analiz-value {
          color: #059669;
        }
        .analiz-card.orange .analiz-value {
          color: #ea580c;
        }
        .analiz-card.violet .analiz-value {
          color: #7c3aed;
        }
        .analiz-label {
          font-size: 11px;
          color: #6b7280;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        /* Progress bar */
        .progress-bar-modern {
          height: 8px;
          background: #e5e7eb;
          border-radius: 99px;
          overflow: hidden;
          margin-top: 14px;
        }
        .progress-fill-modern {
          height: 100%;
          background: linear-gradient(90deg, #059669, #34d399);
          border-radius: 99px;
          transition: width 0.5s;
        }

        /* Empty state modern */
        .empty-state-modern {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 56px 20px;
          color: #9ca3af;
        }
        .empty-icon {
          color: #d1d5db;
          margin-bottom: 16px;
        }
        .empty-state-modern h4 {
          font-size: 17px;
          font-weight: 600;
          color: #6b7280;
          margin: 0 0 6px 0;
        }
        .empty-state-modern p {
          font-size: 14px;
          color: #9ca3af;
          margin: 0;
          max-width: 360px;
          line-height: 1.5;
        }

        /* Table responsive */
        .table-responsive {
          overflow-x: auto;
        }

        /* Row action buttons */
        .row-action-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
          border-radius: 8px;
          border: 1px solid #e5e7eb;
          background: white;
          color: #6b7280;
          cursor: pointer;
          transition: all 0.15s;
        }
        .row-action-btn:hover {
          background: #f3f4f6;
          color: #111827;
          border-color: #d1d5db;
        }
        .row-action-btn.success {
          color: #059669;
          border-color: #a7f3d0;
        }
        .row-action-btn.success:hover {
          background: #ecfdf5;
        }
        .row-action-btn.danger {
          color: #dc2626;
          border-color: #fecaca;
        }
        .row-action-btn.danger:hover {
          background: #fef2f2;
        }
        .row-action-btn.info {
          color: #2563eb;
          border-color: #bfdbfe;
        }
        .row-action-btn.info:hover {
          background: #eff6ff;
        }

        /* Button variants */
        .btn-modern {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          border-radius: 10px;
          border: none;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          text-decoration: none;
        }
        .btn-modern:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
        }
      `}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════
   InfoRow helper — modern
═══════════════════════════════════════════ */
function InfoRow({
  label,
  value,
  colSpan,
  highlight,
}: {
  label: string;
  value?: string | null;
  colSpan?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className={`info-row${colSpan ? " info-row--full" : ""}`}>
      <div className="info-row-label">{label}</div>
      <div className={`info-row-value${highlight ? " info-row-value--highlight" : ""}${!value ? " info-row-value--empty" : ""}`}>
        {value || "—"}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Modern Drawer Shell
═══════════════════════════════════════════ */
function DrawerShell({
  title,
  subtitle,
  icon,
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <>
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(15,23,42,0.5)",
          backdropFilter: "blur(4px)",
          zIndex: 1000,
        }}
        onClick={onClose}
      />
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          width: 500,
          maxWidth: "100%",
          height: "100vh",
          background: "white",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.12)",
          zIndex: 1001,
          display: "flex",
          flexDirection: "column",
          animation: "slideIn 0.3s ease",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "20px 24px",
            borderBottom: "1px solid #f1f5f9",
            background: "linear-gradient(135deg, #f8fafc, #ffffff)",
          }}
        >
          <div
            style={{ display: "flex", alignItems: "center", gap: 12 }}
          >
            {icon && (
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  background:
                    "linear-gradient(135deg, #dbeafe, #bfdbfe)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#2563eb",
                }}
              >
                {icon}
              </div>
            )}
            <div>
              <h3
                style={{
                  margin: 0,
                  fontSize: 17,
                  fontWeight: 700,
                  color: "#0f172a",
                }}
              >
                {title}
              </h3>
              {subtitle && (
                <p
                  style={{
                    margin: "2px 0 0",
                    fontSize: 12,
                    color: "#94a3b8",
                  }}
                >
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "#f1f5f9",
              border: "none",
              cursor: "pointer",
              color: "#64748b",
              padding: 8,
              borderRadius: 10,
              transition: "all 0.2s",
              display: "flex",
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          {children}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            padding: "16px 24px",
            borderTop: "1px solid #f1f5f9",
            background: "#fafafa",
          }}
        >
          {footer}
        </div>
      </div>
      <style>{`@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
    </>
  );
}

/* ═══ Modern Form Field ═══ */
function FField({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
        {label}
        {required && <span style={{ color: "#ef4444" }}> *</span>}
      </label>
      {children}
      {error && (
        <p
          style={{
            color: "#ef4444",
            fontSize: 12,
            margin: 0,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}

const fieldInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 14px",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  fontSize: 14,
  outline: "none",
  transition: "all 0.2s",
  background: "#f8fafc",
};
const modernBtnStyle: React.CSSProperties = {
  padding: "10px 20px",
  borderRadius: 10,
  border: "none",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  transition: "all 0.2s",
};

/* ═══════════════════════════════════════════
   ÖDEME YAPMA DRAWER (Gider taksit bazlı + bakiyeden mahsup)
═══════════════════════════════════════════ */
function OdemeYapDrawer({
  kurumId,
  giderId,
  taksitler,
  cariBakiye,
  defaultMaliHesapId,
  defaultOdemeYontemiId,
  onClose,
  onSuccess,
  onError,
}: {
  kurumId: number;
  giderId: number;
  taksitler: GiderTaksit[];
  cariBakiye: number;
  defaultMaliHesapId?: number;
  defaultOdemeYontemiId?: number;
  onClose: () => void;
  onSuccess: (msg?: string) => void;
  onError: (msg: string) => void;
}) {
  const { activeSube } = useKurum();
  const [saving, setSaving] = useState(false);
  const [bakiyedenMahsup, setBakiyedenMahsup] = useState(false);
  const [odemeYontemleri, setOdemeYontemleri] = useState<
    { id: number; ad: string; mali_hesap_id: number; tip?: string }[]
  >([]);
  const [maliHesaplar, setMaliHesaplar] = useState<
    { id: number; ad: string; tip?: string }[]
  >([]);
  const [form, setForm] = useState({
    gider_taksit_id: taksitler.find((t) => t.kalan_tutar > 0)?.id || (null as number | null),
    odeme_yontemi_id: defaultOdemeYontemiId || 0,
    mali_hesap_id: defaultMaliHesapId || 0,
    tutar: "",
    odeme_tarihi: new Date().toISOString().split("T")[0],
    aciklama: "",
    ...EMPTY_ISLEM_MASRAFI,
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const filtreliOdemeYontemleri = form.mali_hesap_id
    ? odemeYontemleri.filter((o) => o.mali_hesap_id === form.mali_hesap_id)
    : [];

  // Bakiye pozitif ise mahsup edilebilir (alacaklıyız = önceki ödemelerimiz var)
  const mahsupYapilabilir = cariBakiye > 0;

  useEffect(() => {
    if (kurumId) {
      paymentMethodService
        .dropdown(kurumId)
        .then((r) => {
          const l = r.odeme_yontemleri || [];
          setOdemeYontemleri(l);
        })
        .catch(() => {});
      financialAccountService
        .dropdownByKurum(kurumId, activeSube?.id)
        .then((r) => {
          const l = r.mali_hesaplar || [];
          setMaliHesaplar(l);
          setForm((f) => ({
            ...f,
            mali_hesap_id: f.mali_hesap_id || defaultMaliHesapId || l[0]?.id || 0,
            odeme_yontemi_id: f.odeme_yontemi_id || defaultOdemeYontemiId || 0,
          }));
        })
        .catch(() => {});
    }
  }, [kurumId, activeSube?.id, defaultMaliHesapId, defaultOdemeYontemiId]);

  useEffect(() => {
    if (form.gider_taksit_id) {
      const t = taksitler.find((tk) => tk.id === form.gider_taksit_id);
      if (t) {
        const maxTutar = bakiyedenMahsup
          ? Math.min(t.kalan_tutar, cariBakiye)
          : t.kalan_tutar;
        setForm((f) => ({ ...f, tutar: String(maxTutar) }));
      }
    }
  }, [form.gider_taksit_id, taksitler, bakiyedenMahsup, cariBakiye]);

  const handleSubmit = async () => {
    setFieldErrors({});
    if (!bakiyedenMahsup && !form.odeme_yontemi_id) {
      setFieldErrors({ odeme_yontemi_id: "Seçiniz" });
      return;
    }
    if (!bakiyedenMahsup && !form.mali_hesap_id) {
      setFieldErrors({ mali_hesap_id: "Seçiniz" });
      return;
    }
    if (!form.tutar || Number(form.tutar) <= 0) {
      setFieldErrors({ tutar: "Tutar giriniz" });
      return;
    }
    if (bakiyedenMahsup && Number(form.tutar) > cariBakiye) {
      setFieldErrors({ tutar: `Mahsup tutarı serbest bakiyeden (₺${fmt(cariBakiye)}) fazla olamaz` });
      return;
    }
    setSaving(true);
    try {
      const payload: GiderOdemeCreatePayload = {
        gider_kaydi_id: giderId,
        gider_taksit_id: form.gider_taksit_id || undefined,
        tutar: Number(form.tutar),
        odeme_tarihi: form.odeme_tarihi,
        aciklama: form.aciklama || undefined,
        bakiyeden_mahsup: bakiyedenMahsup,
      };
      if (!bakiyedenMahsup) {
        payload.odeme_yontemi_id = form.odeme_yontemi_id;
        payload.mali_hesap_id = form.mali_hesap_id;
        Object.assign(payload, buildIslemMasrafiPayload(form) || {});
      }
      await giderOdemeService.create(giderId, payload);
      onSuccess(bakiyedenMahsup ? "Bakiyeden mahsup edildi" : "Ödeme başarıyla kaydedildi");
    } catch (err: any) {
      if (err.fieldErrors) {
        const fe: Record<string, string> = {};
        Object.entries(err.fieldErrors).forEach(([k, v]) => {
          fe[k] = Array.isArray(v) ? v.join(", ") : String(v);
        });
        setFieldErrors(fe);
      }
      onError(err.message || "Ödeme kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  const odenmemisTaksitler = taksitler.filter((t) => t.kalan_tutar > 0);
  const selectedYontem = odemeYontemleri.find((o) => o.id === form.odeme_yontemi_id);
  const selectedHesap = maliHesaplar.find((m) => m.id === form.mali_hesap_id);
  const masrafVisible = !bakiyedenMahsup && islemMasrafiGoster(selectedYontem?.tip, selectedHesap?.tip);

  return (
    <DrawerShell
      title={bakiyedenMahsup ? "Bakiyeden Mahsup Et" : "Gider Ödemesi Yap"}
      subtitle={bakiyedenMahsup ? "Cari hesaptaki mevcut bakiyeden düş" : "Taksit bazlı ödeme yapın"}
      onClose={onClose}
      icon={
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          {bakiyedenMahsup ? (
            <>
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </>
          ) : (
            <>
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </>
          )}
        </svg>
      }
      footer={
        <>
          <button
            onClick={onClose}
            style={{
              ...modernBtnStyle,
              background: "#f1f5f9",
              color: "#475569",
            }}
          >
            İptal
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{
              ...modernBtnStyle,
              background: bakiyedenMahsup
                ? "linear-gradient(135deg, #7c3aed, #8b5cf6)"
                : "linear-gradient(135deg, #059669, #10b981)",
              color: "white",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Kaydediliyor..." : bakiyedenMahsup ? "Mahsup Et" : "Ödemeyi Kaydet"}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Bakiyeden Mahsup Toggle */}
        {mahsupYapilabilir && (
          <div
            style={{
              background: bakiyedenMahsup
                ? "linear-gradient(135deg, #f5f3ff, #ede9fe)"
                : "linear-gradient(135deg, #f8fafc, #f1f5f9)",
              borderRadius: 14,
              padding: 16,
              border: bakiyedenMahsup
                ? "2px solid #8b5cf6"
                : "1px solid #e2e8f0",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
            onClick={() => setBakiyedenMahsup(!bakiyedenMahsup)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 44,
                  height: 24,
                  borderRadius: 12,
                  background: bakiyedenMahsup ? "#7c3aed" : "#cbd5e1",
                  position: "relative",
                  transition: "background 0.2s",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    background: "white",
                    position: "absolute",
                    top: 2,
                    left: bakiyedenMahsup ? 22 : 2,
                    transition: "left 0.2s",
                    boxShadow: "0 1px 3px rgba(0,0,0,.15)",
                  }}
                />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: bakiyedenMahsup ? "#5b21b6" : "#334155" }}>
                  Serbest Bakiyeden Mahsup Et
                </div>
                <div style={{ fontSize: 12, color: bakiyedenMahsup ? "#7c3aed" : "#94a3b8", marginTop: 2 }}>
                  Serbest bakiye: <strong>₺{fmt(cariBakiye)}</strong> — Kasa/bankadan para çıkmaz
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bakiye yetersiz uyarısı */}
        {!mahsupYapilabilir && (
          <div
            style={{
              background: "#fefce8",
              borderRadius: 12,
              padding: 14,
              fontSize: 13,
              color: "#854d0e",
              lineHeight: 1.6,
              border: "1px solid #fde68a",
            }}
          >
            💡 Cari hesapta mahsup edilecek serbest bakiye bulunmuyor. Önce serbest ödeme yaparak bakiye oluşturabilirsiniz.
          </div>
        )}

        {/* Mahsup bilgi kutusu */}
        {bakiyedenMahsup && (
          <div
            style={{
              background: "#f5f3ff",
              borderRadius: 12,
              padding: 14,
              fontSize: 13,
              color: "#5b21b6",
              lineHeight: 1.6,
              border: "1px solid #c4b5fd",
            }}
          >
            🔄 <strong>Bakiyeden Mahsup:</strong> Daha önce yapılan serbest ödemeler/avanslar bu gider borcundan düşülecek. Kasa veya banka hesabından para çıkmayacak.
          </div>
        )}

        {odenmemisTaksitler.length > 0 && (
          <FField label="Taksit">
            <select
              style={fieldInputStyle}
              value={form.gider_taksit_id || ""}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  gider_taksit_id: e.target.value
                    ? Number(e.target.value)
                    : null,
                }))
              }
            >
              <option value="">Genel ödeme (taksitsiz)</option>
              {odenmemisTaksitler.map((t) => (
                <option key={t.id} value={t.id}>
                  Taksit {t.taksit_no} — Kalan: ₺{fmt(t.kalan_tutar)} (Vade:{" "}
                  {fmtTarih(t.vade_tarihi)})
                </option>
              ))}
            </select>
          </FField>
        )}

        {/* Normal ödeme alanları — bakiyeden mahsupta gizle */}
        {!bakiyedenMahsup && (
          <>
            <FField
              label="Mali Hesap (Kasa/Banka)"
              required
              error={fieldErrors.mali_hesap_id}
            >
              <select
                style={fieldInputStyle}
                value={form.mali_hesap_id}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    mali_hesap_id: Number(e.target.value),
                    odeme_yontemi_id: 0,
                    kesinti_turu: "",
                    kesinti_tutar: "",
                    kesinti_aciklama: "",
                  }))
                }
              >
                <option value={0}>Seçiniz</option>
                {maliHesaplar.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.ad}
                  </option>
                ))}
              </select>
            </FField>
            <FField
              label="Ödeme Yöntemi"
              required
              error={fieldErrors.odeme_yontemi_id}
            >
              <select
                style={fieldInputStyle}
                disabled={!form.mali_hesap_id}
                value={form.odeme_yontemi_id}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    odeme_yontemi_id: Number(e.target.value),
                    kesinti_turu: "",
                    kesinti_tutar: "",
                    kesinti_aciklama: "",
                  }))
                }
              >
                <option value={0}>{form.mali_hesap_id ? "Seçiniz" : "Önce mali hesap seçin"}</option>
                {filtreliOdemeYontemleri.map((o) => (
                  <option key={o.id} value={o.id}>
                    {formatOdemeYontemiLabel(o, { hideMaliHesap: true })}
                  </option>
                ))}
              </select>
            </FField>
            <IslemMasrafiFields
              visible={masrafVisible}
              form={form}
              onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
              fieldErrors={fieldErrors}
            />
          </>
        )}

        <FField label="Tutar (₺)" required error={fieldErrors.tutar}>
          <input
            type="number"
            step="any"
            min="0"
            max={bakiyedenMahsup ? cariBakiye : undefined}
            style={fieldInputStyle}
            value={form.tutar}
            onChange={(e) =>
              setForm((f) => ({ ...f, tutar: e.target.value }))
            }
            placeholder="0.00"
          />
          {bakiyedenMahsup && (
            <div style={{ fontSize: 12, color: "#7c3aed", marginTop: 4 }}>
              Maks. mahsup edilebilir: ₺{fmt(cariBakiye)}
            </div>
          )}
        </FField>
        <FField label="Ödeme Tarihi">
          <input
            type="date"
            style={fieldInputStyle}
            value={form.odeme_tarihi}
            onChange={(e) =>
              setForm((f) => ({ ...f, odeme_tarihi: e.target.value }))
            }
          />
        </FField>
        <FField label="Açıklama">
          <textarea
            style={{ ...fieldInputStyle, resize: "vertical" }}
            rows={2}
            value={form.aciklama}
            onChange={(e) =>
              setForm((f) => ({ ...f, aciklama: e.target.value }))
            }
            placeholder={bakiyedenMahsup ? "Ör: Önceki serbest ödemeden mahsup" : "Opsiyonel not"}
          />
        </FField>

        {/* Mahsup sonucu önizleme */}
        {bakiyedenMahsup && form.tutar && Number(form.tutar) > 0 && (
          <div
            style={{
              background: "linear-gradient(135deg, #faf5ff, #f5f3ff)",
              borderRadius: 14,
              padding: 16,
              border: "1px solid #ddd6fe",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: "#6b7280" }}>Mevcut bakiye</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#059669" }}>₺{fmt(cariBakiye)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: "#6b7280" }}>Mahsup tutarı</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#dc2626" }}>-₺{fmt(Number(form.tutar))}</span>
            </div>
            <div style={{ borderTop: "1px dashed #c4b5fd", paddingTop: 8, display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Kalan bakiye</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: (cariBakiye - Number(form.tutar)) >= 0 ? "#059669" : "#dc2626" }}>
                ₺{fmt(Math.abs(cariBakiye - Number(form.tutar)))}
              </span>
            </div>
          </div>
        )}

        {fieldErrors.genel && (
          <div
            style={{
              color: "#ef4444",
              fontSize: 13,
              background: "#fef2f2",
              padding: 14,
              borderRadius: 10,
              border: "1px solid #fecaca",
            }}
          >
            {fieldErrors.genel}
          </div>
        )}
      </div>
    </DrawerShell>
  );
}

/* ═══════════════════════════════════════════
   SERBEST ÖDEME DRAWER
═══════════════════════════════════════════ */
function SerbestOdemeDrawer({
  kurumId,
  cariHesapId,
  cariHesapAdi,
  bakiye,
  onClose,
  onSuccess,
  onError,
}: {
  kurumId: number;
  cariHesapId: number;
  cariHesapAdi: string;
  bakiye: number;
  onClose: () => void;
  onSuccess: (msg?: string) => void;
  onError: (msg: string) => void;
}) {
  const { activeSube } = useKurum();
  const [saving, setSaving] = useState(false);
  const [odemeYontemleri, setOdemeYontemleri] = useState<
    { id: number; ad: string; mali_hesap_id: number; tip?: string }[]
  >([]);
  const [maliHesaplar, setMaliHesaplar] = useState<
    { id: number; ad: string; tip?: string }[]
  >([]);
  const [form, setForm] = useState({
    odeme_yontemi_id: 0,
    mali_hesap_id: 0,
    tutar: "",
    odeme_tarihi: new Date().toISOString().split("T")[0],
    aciklama: "",
    ...EMPTY_ISLEM_MASRAFI,
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const filtreliOdemeYontemleri = form.mali_hesap_id
    ? odemeYontemleri.filter((o) => o.mali_hesap_id === form.mali_hesap_id)
    : [];
  const selectedYontem = odemeYontemleri.find((o) => o.id === form.odeme_yontemi_id);
  const selectedHesap = maliHesaplar.find((m) => m.id === form.mali_hesap_id);
  const masrafVisible = islemMasrafiGoster(selectedYontem?.tip, selectedHesap?.tip);

  useEffect(() => {
    if (kurumId) {
      paymentMethodService
        .dropdown(kurumId)
        .then((r) => {
          const l = r.odeme_yontemleri || [];
          setOdemeYontemleri(l);
        })
        .catch(() => {});
      financialAccountService
        .dropdownByKurum(kurumId, activeSube?.id)
        .then((r) => {
          const l = r.mali_hesaplar || [];
          setMaliHesaplar(l);
          if (l.length > 0)
            setForm((f) => ({ ...f, mali_hesap_id: l[0].id }));
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kurumId, activeSube?.id]);

  const handleSubmit = async () => {
    setFieldErrors({});
    if (!form.mali_hesap_id) {
      setFieldErrors({ mali_hesap_id: "Seçiniz" });
      return;
    }
    if (!form.tutar || Number(form.tutar) <= 0) {
      setFieldErrors({ tutar: "Tutar giriniz" });
      return;
    }
    if (!form.odeme_tarihi) {
      setFieldErrors({ odeme_tarihi: "Tarih seçiniz" });
      return;
    }
    setSaving(true);
    try {
      const masraf = buildIslemMasrafiPayload(form);
      await cariHesapService.serbestOdeme({
        cari_hesap_id: cariHesapId,
        kurum_id: kurumId,
        tutar: Number(form.tutar),
        odeme_tarihi: form.odeme_tarihi,
        mali_hesap_id: form.mali_hesap_id,
        odeme_yontemi_id: form.odeme_yontemi_id || undefined,
        aciklama: form.aciklama || undefined,
        ...masraf,
      });
      onSuccess("Ödeme başarıyla kaydedildi");
    } catch (err: any) {
      if (err.fieldErrors) {
        const fe: Record<string, string> = {};
        Object.entries(err.fieldErrors).forEach(([k, v]) => {
          fe[k] = Array.isArray(v) ? v.join(", ") : String(v);
        });
        setFieldErrors(fe);
      }
      onError(err.message || "Ödeme kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  const bakiyeInfoLocal = bakiyeEtiketi(bakiye);

  return (
    <DrawerShell
      title="Serbest Ödeme Yap"
      subtitle={cariHesapAdi}
      onClose={onClose}
      icon={
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      }
      footer={
        <>
          <button
            onClick={onClose}
            style={{
              ...modernBtnStyle,
              background: "#f1f5f9",
              color: "#475569",
            }}
          >
            İptal
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{
              ...modernBtnStyle,
              background: "linear-gradient(135deg, #059669, #10b981)",
              color: "white",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Kaydediliyor..." : "Ödemeyi Kaydet"}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Bakiye özet */}
        <div
          style={{
            background: "linear-gradient(135deg, #f8fafc, #f1f5f9)",
            borderRadius: 14,
            padding: 18,
            border: "1px solid #e2e8f0",
          }}
        >
          <div
            style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}
          >
            {cariHesapAdi}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 10,
            }}
          >
            <span style={{ fontSize: 13, color: "#64748b" }}>
              Mevcut Bakiye:
            </span>
            <span
              style={{ fontSize: 18, fontWeight: 700 }}
              className={bakiyeInfoLocal.cls}
            >
              ₺{fmt(Math.abs(bakiye))}{" "}
              <span style={{ fontSize: 11, fontWeight: 600 }}>
                {bakiyeInfoLocal.text}
              </span>
            </span>
          </div>
        </div>
        <div
          style={{
            background: "#eff6ff",
            borderRadius: 12,
            padding: 14,
            fontSize: 13,
            color: "#1e40af",
            lineHeight: 1.6,
            border: "1px solid #bfdbfe",
          }}
        >
          💡 <strong>Serbest Ödeme:</strong> Gider kaydına bağlı olmadan
          doğrudan ödeme yapabilirsiniz.
        </div>
        <FField
          label="Mali Hesap (Kasa/Banka)"
          required
          error={fieldErrors.mali_hesap_id}
        >
          <select
            style={fieldInputStyle}
            value={form.mali_hesap_id}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                mali_hesap_id: Number(e.target.value),
                odeme_yontemi_id: 0,
                kesinti_turu: "",
                kesinti_tutar: "",
                kesinti_aciklama: "",
              }))
            }
          >
            <option value={0}>Seçiniz</option>
            {maliHesaplar.map((m) => (
              <option key={m.id} value={m.id}>
                {m.ad}
              </option>
            ))}
          </select>
        </FField>
        <FField
          label="Ödeme Yöntemi"
          error={fieldErrors.odeme_yontemi_id}
        >
          <select
            style={fieldInputStyle}
            disabled={!form.mali_hesap_id}
            value={form.odeme_yontemi_id}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                odeme_yontemi_id: Number(e.target.value),
                kesinti_turu: "",
                kesinti_tutar: "",
                kesinti_aciklama: "",
              }))
            }
          >
            <option value={0}>{form.mali_hesap_id ? "Seçiniz (opsiyonel)" : "Önce mali hesap seçin"}</option>
            {filtreliOdemeYontemleri.map((o) => (
              <option key={o.id} value={o.id}>
                {formatOdemeYontemiLabel(o, { hideMaliHesap: true })}
              </option>
            ))}
          </select>
        </FField>
        <IslemMasrafiFields
          visible={masrafVisible}
          form={form}
          onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
          fieldErrors={fieldErrors}
        />
        <FField label="Tutar (₺)" required error={fieldErrors.tutar}>
          <input
            type="number"
            step="any"
            min="0"
            style={fieldInputStyle}
            value={form.tutar}
            onChange={(e) =>
              setForm((f) => ({ ...f, tutar: e.target.value }))
            }
            placeholder="0.00"
          />
        </FField>
        <FField
          label="Ödeme Tarihi"
          required
          error={fieldErrors.odeme_tarihi}
        >
          <input
            type="date"
            style={fieldInputStyle}
            value={form.odeme_tarihi}
            onChange={(e) =>
              setForm((f) => ({ ...f, odeme_tarihi: e.target.value }))
            }
          />
        </FField>
        <FField label="Açıklama">
          <textarea
            style={{ ...fieldInputStyle, resize: "vertical" }}
            rows={2}
            value={form.aciklama}
            onChange={(e) =>
              setForm((f) => ({ ...f, aciklama: e.target.value }))
            }
            placeholder="Ör: Erken ödeme, avans..."
          />
        </FField>
        {form.tutar && Number(form.tutar) > 0 && (
          <div
            style={{
              background: "#f0fdf4",
              borderRadius: 14,
              padding: 16,
              textAlign: "center",
              border: "1px solid #a7f3d0",
            }}
          >
            <div style={{ fontSize: 11, color: "#6b7280" }}>
              Ödeme Sonrası Tahmini Bakiye
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: "#059669",
                marginTop: 4,
              }}
            >
              ₺{fmt(Math.abs(bakiye + Number(form.tutar)))}
            </div>
          </div>
        )}
        {fieldErrors.genel && (
          <div
            style={{
              color: "#ef4444",
              fontSize: 13,
              background: "#fef2f2",
              padding: 14,
              borderRadius: 10,
              border: "1px solid #fecaca",
            }}
          >
            {fieldErrors.genel}
          </div>
        )}
      </div>
    </DrawerShell>
  );
}
