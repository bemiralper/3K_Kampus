"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type PackageCatalog,
  type StudentPackageSelection,
  EMPTY_SELECTION,
  deriveIncludedDisplayItems,
  deriveBillableItems,
  enrollmentToSelection,
  sanitizeSelection,
  toggleParent,
  toggleOzelDers,
  toggleDeneme,
  toggleYayin,
  toggleEkHizmet,
  mapSelectionToKalemInputs,
  mergePackageCatalogs,
  filterGrupCatalogByAlan,
} from "@/lib/package-selection";

export type ContractPaketData = {
  kayit?: {
    alan_id?: number | null;
  };
  egitim_paketleri?: Array<{
    paket_turu: string;
    paket_id: number;
    paket_adi: string;
    fiyat: number;
    kdv_orani: number;
    alan_id?: number | null;
    dahil_ek_hizmet_ids?: number[];
    dahil_deneme_paketi_ids?: number[];
    dahil_yayin_paketi_ids?: number[];
  }>;
  ek_hizmetler?: Array<{
    id: number;
    ek_hizmet_id: number;
    ad: string;
    hizmet_turu: string;
    fiyat: number;
    kdv_orani: number;
  }>;
  dahil_hizmetler?: Array<{
    ek_hizmet_id?: number | null;
    ad: string;
    hizmet_turu: string;
    deneme_paket_id?: number | null;
    fiyat?: number;
    kdv_orani?: number;
    kdv_dahil_fiyat?: number;
  }>;
  dahil_paketler?: Array<{
    paket_turu: string;
    paket_id: number;
    paket_adi: string;
    fiyat?: number;
    kdv_orani?: number;
    kdv_dahil_fiyat?: number;
  }>;
};

function upsertEkHizmet(
  list: PackageCatalog["ekHizmetler"],
  item: {
    ek_hizmet_id?: number | null;
    ad: string;
    hizmet_turu: string;
    fiyat?: number;
    kdv_orani?: number;
    kdv_dahil_fiyat?: number;
  },
) {
  const id = item.ek_hizmet_id;
  if (id == null || item.hizmet_turu === "deneme") return;
  if (list.some((h) => h.id === id)) return;
  list.push({
    id,
    ad: item.ad,
    hizmet_turu: item.hizmet_turu,
    fiyat: item.kdv_dahil_fiyat ?? item.fiyat ?? 0,
    kdv_orani: item.kdv_orani ?? 10,
  });
}

function upsertDeneme(
  list: PackageCatalog["denemeler"],
  item: { id: number; ad: string; fiyat?: number; kdv_orani?: number; kdv_dahil_fiyat?: number },
) {
  if (list.some((d) => d.id === item.id)) return;
  list.push({
    id: item.id,
    ad: item.ad,
    fiyat: item.kdv_dahil_fiyat ?? item.fiyat ?? 0,
    kdv_orani: item.kdv_orani ?? 10,
  });
}

function upsertYayin(
  list: PackageCatalog["yayinPaketleri"],
  item: { paket_id: number; paket_adi: string; fiyat?: number; kdv_orani?: number; kdv_dahil_fiyat?: number },
) {
  if (list.some((y) => y.id === item.paket_id)) return;
  list.push({
    id: item.paket_id,
    ad: item.paket_adi,
    fiyat: item.kdv_dahil_fiyat ?? item.fiyat ?? 0,
    kdv_orani: item.kdv_orani ?? 10,
  });
}

export function catalogFromPaketData(data: ContractPaketData | null): PackageCatalog {
  const catalog: PackageCatalog = {
    grupDersleri: [],
    premiumPaketler: [],
    ozelDersler: [],
    denemeler: [],
    yayinPaketleri: [],
    ekHizmetler: [],
  };
  if (!data) return catalog;

  for (const p of data.egitim_paketleri || []) {
    const base = {
      id: p.paket_id,
      ad: p.paket_adi,
      fiyat: p.fiyat,
      kdv_orani: p.kdv_orani,
      dahil_ek_hizmet_ids: p.dahil_ek_hizmet_ids,
      dahil_deneme_paketi_ids: p.dahil_deneme_paketi_ids,
      dahil_yayin_paketi_ids: p.dahil_yayin_paketi_ids,
    };
    if (p.paket_turu === "grup_dersi") {
      catalog.grupDersleri.push({
        ...base,
        kategori: "grup_dersleri",
        alan_id: p.alan_id ?? null,
      });
    } else if (p.paket_turu === "premium") {
      catalog.premiumPaketler.push({ ...base, kategori: "premium_paketler" });
    } else if (p.paket_turu === "ozel_ders") {
      catalog.ozelDersler.push({ id: p.paket_id, ad: p.paket_adi, fiyat: p.fiyat, kdv_orani: p.kdv_orani });
    } else if (p.paket_turu === "deneme") {
      catalog.denemeler.push({ id: p.paket_id, ad: p.paket_adi, fiyat: p.fiyat, kdv_orani: p.kdv_orani });
    } else if (p.paket_turu === "yayin") {
      catalog.yayinPaketleri.push({ id: p.paket_id, ad: p.paket_adi, fiyat: p.fiyat, kdv_orani: p.kdv_orani });
    }
  }

  for (const eh of data.ek_hizmetler || []) {
    if (eh.hizmet_turu === "deneme") continue;
    catalog.ekHizmetler.push({
      id: eh.ek_hizmet_id,
      ad: eh.ad,
      hizmet_turu: eh.hizmet_turu,
      fiyat: eh.fiyat,
      kdv_orani: eh.kdv_orani,
    });
  }

  // Pakete dahil (ücretsiz) hizmetler — katalogda görünsün; paket seçiliyken ücretsiz, kalkınca ücretli
  for (const dh of data.dahil_hizmetler || []) {
    if (dh.hizmet_turu === "deneme" && dh.deneme_paket_id != null) {
      upsertDeneme(catalog.denemeler, {
        id: dh.deneme_paket_id,
        ad: dh.ad.replace(/^Deneme — /, "") || dh.ad,
        fiyat: dh.fiyat,
        kdv_orani: dh.kdv_orani,
        kdv_dahil_fiyat: dh.kdv_dahil_fiyat,
      });
    } else {
      upsertEkHizmet(catalog.ekHizmetler, dh);
    }
  }

  for (const dp of data.dahil_paketler || []) {
    if (dp.paket_turu === "yayin") {
      upsertYayin(catalog.yayinPaketleri, dp);
    }
  }

  return catalog;
}

type SelectionUpdater =
  | StudentPackageSelection
  | ((prev: StudentPackageSelection) => StudentPackageSelection);

export function useContractPackageSelection(
  paketData: ContractPaketData | null,
  kalemCatalog?: PackageCatalog | null,
) {
  const [selection, setSelection] = useState<StudentPackageSelection>(EMPTY_SELECTION);
  const userTouchedRef = useRef(false);
  const loadedKayitIdRef = useRef<number | null>(null);

  const enrolledCatalog = useMemo(() => catalogFromPaketData(paketData), [paketData]);
  const catalog = useMemo(() => {
    const merged = kalemCatalog
      ? mergePackageCatalogs(enrolledCatalog, kalemCatalog)
      : enrolledCatalog;
    return filterGrupCatalogByAlan(merged, paketData?.kayit?.alan_id);
  }, [enrolledCatalog, kalemCatalog, paketData?.kayit?.alan_id]);

  const commit = useCallback(
    (updater: SelectionUpdater, catalogOverride?: PackageCatalog) => {
      userTouchedRef.current = true;
      const cat = catalogOverride ?? catalog;
      setSelection((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        return sanitizeSelection(next, cat);
      });
    },
    [catalog],
  );

  const loadFromEnrollment = useCallback(
    (kayitId?: number) => {
      if (!paketData) return;
      if (userTouchedRef.current) return;
      if (kayitId != null && loadedKayitIdRef.current === kayitId) return;

      const sel = enrollmentToSelection({
        egitim_paketleri: paketData.egitim_paketleri,
        ek_hizmetler: paketData.ek_hizmetler?.map((e) => ({ ek_hizmet_id: e.ek_hizmet_id })),
      });
      setSelection(sanitizeSelection(sel, catalog));
      if (kayitId != null) loadedKayitIdRef.current = kayitId;
    },
    [paketData, catalog],
  );

  const resetForNewStudent = useCallback(() => {
    userTouchedRef.current = false;
    loadedKayitIdRef.current = null;
    setSelection(EMPTY_SELECTION);
  }, []);

  const included = useMemo(
    () => deriveIncludedDisplayItems(selection, catalog),
    [selection, catalog],
  );

  const billableItems = useMemo(
    () => deriveBillableItems(selection, catalog),
    [selection, catalog],
  );

  const kalemInputs = useMemo(
    () => mapSelectionToKalemInputs(selection, catalog),
    [selection, catalog],
  );

  const hasGrupSelected = selection.parent?.tur === "grup_dersi";
  const hasPremiumSelected = selection.parent?.tur === "premium";

  // Katalog genişlediğinde (kalem-secenekleri yüklendi) seçimi doğrula; kullanıcı değişikliğini ezmez
  useEffect(() => {
    setSelection((prev) => sanitizeSelection(prev, catalog));
  }, [catalog]);

  return {
    selection,
    setSelection: commit,
    catalog,
    included,
    billableItems,
    kalemInputs,
    hasGrupSelected,
    hasPremiumSelected,
    loadFromEnrollment,
    resetForNewStudent,
    toggleGrup: (id: number) => commit((prev) => toggleParent(prev, catalog, "grup_dersi", id)),
    togglePremium: (id: number) => commit((prev) => toggleParent(prev, catalog, "premium", id)),
    toggleOzelDers: (id: number) => commit((prev) => toggleOzelDers(prev, catalog, id)),
    toggleDeneme: (id: number) => commit((prev) => toggleDeneme(prev, catalog, id)),
    toggleYayin: (id: number) => commit((prev) => toggleYayin(prev, catalog, id)),
    toggleEkHizmet: (id: number) => commit((prev) => toggleEkHizmet(prev, catalog, id)),
    isParentSelected: (tur: "grup_dersi" | "premium", id: number) =>
      selection.parent?.tur === tur && selection.parent.id === id,
    isOzelDersSelected: (id: number) => selection.ozelDersIds.includes(id),
    isDenemeSelected: (id: number) => selection.denemePaketiId === id,
    isYayinSelected: (id: number) => selection.yayinPaketiIds.includes(id),
    isEkHizmetSelected: (id: number) => selection.ekHizmetIds.includes(id),
    isEkHizmetDahil: (id: number) => included.included.ekHizmetIds.has(id),
    isDenemeDahil: (id: number) => included.included.denemePaketiIds.has(id),
    isYayinDahil: (id: number) => included.included.yayinPaketiIds.has(id),
  };
}

/** Katalogdan eklenen kalem için seçim kurallarını uygula */
export function applyCatalogSelectionToggle(
  selection: StudentPackageSelection,
  catalog: PackageCatalog,
  tur: string,
  id: number,
): StudentPackageSelection {
  switch (tur) {
    case "grup_dersi":
      return toggleParent(selection, catalog, "grup_dersi", id);
    case "premium":
      return toggleParent(selection, catalog, "premium", id);
    case "ozel_ders":
      return toggleOzelDers(selection, catalog, id);
    case "deneme":
      return toggleDeneme(selection, catalog, id);
    case "yayin":
      return toggleYayin(selection, catalog, id);
    default:
      return selection;
  }
}
