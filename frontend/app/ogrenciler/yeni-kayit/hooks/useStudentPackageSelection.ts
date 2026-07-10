"use client";

import { useCallback, useMemo } from "react";
import type { PackageData, PackageInfo, EkHizmetInfo, DenemePaketiInfo, YayinPaketiInfo } from "../types";
import {
  type PackageCatalog,
  type StudentPackageSelection,
  catalogFromWizardResponse,
  legacyToSelection,
  selectionToLegacyPackageData,
  sanitizeSelection,
  deriveIncludedDisplayItems,
  toggleParent,
  toggleOzelDers,
  toggleDeneme,
  toggleYayin,
  toggleEkHizmet,
  validateSelection,
  compositePackageId,
  kategoriToParentTur,
} from "@/lib/package-selection";

export function useStudentPackageSelection(
  packageData: PackageData,
  onPackageChange: (pkg: PackageData) => void,
  catalog: {
    packages: PackageInfo[];
    ekHizmetler: EkHizmetInfo[];
    denemePaketleri: DenemePaketiInfo[];
    yayinPaketleri: YayinPaketiInfo[];
  },
) {
  const packageCatalog: PackageCatalog = useMemo(
    () =>
      catalogFromWizardResponse({
        packages: catalog.packages,
        ek_hizmetler: catalog.ekHizmetler.map((h) => ({
          ...h,
          kdv_orani: h.kdv_orani ?? 10,
        })),
        deneme_paketleri: catalog.denemePaketleri.map((d) => ({
          ...d,
          kdv_orani: d.kdv_orani ?? 10,
        })),
        yayin_paketleri: catalog.yayinPaketleri.map((y) => ({
          ...y,
          kdv_orani: y.kdv_orani ?? 10,
        })),
      }),
    [catalog.packages, catalog.ekHizmetler, catalog.denemePaketleri, catalog.yayinPaketleri],
  );

  const selection: StudentPackageSelection = useMemo(() => {
    const legacy = {
      paketler: packageData.paketler,
      ek_hizmet_ids: packageData.ek_hizmet_ids,
      deneme_paketi_id: packageData.deneme_paketi_id,
      yayin_paketi_ids: packageData.yayin_paketi_ids,
    };
    return legacyToSelection(legacy, packageCatalog);
  }, [packageData, packageCatalog]);

  const commit = useCallback(
    (updater: StudentPackageSelection | ((prev: StudentPackageSelection) => StudentPackageSelection)) => {
      const legacy = {
        paketler: packageData.paketler,
        ek_hizmet_ids: packageData.ek_hizmet_ids,
        deneme_paketi_id: packageData.deneme_paketi_id,
        yayin_paketi_ids: packageData.yayin_paketi_ids,
      };
      const prev = legacyToSelection(legacy, packageCatalog);
      const next = typeof updater === "function" ? updater(prev) : updater;
      const clean = sanitizeSelection(next, packageCatalog);
      onPackageChange(selectionToLegacyPackageData(clean, packageCatalog));
    },
    [onPackageChange, packageCatalog, packageData],
  );

  const included = useMemo(
    () => deriveIncludedDisplayItems(selection, packageCatalog),
    [selection, packageCatalog],
  );

  const validationErrors = useMemo(
    () => validateSelection(selection, packageCatalog),
    [selection, packageCatalog],
  );

  const hasGrupSelected = selection.parent?.tur === "grup_dersi";
  const hasPremiumSelected = selection.parent?.tur === "premium";

  const isParentSelected = (kategori: string, id: number) => {
    const tur = kategoriToParentTur(kategori);
    return tur != null && selection.parent?.tur === tur && selection.parent.id === id;
  };

  const isOzelDersSelected = (id: number) => selection.ozelDersIds.includes(id);
  const isDenemeSelected = (id: number) => selection.denemePaketiId === id;
  const isYayinSelected = (id: number) => selection.yayinPaketiIds.includes(id);
  const isEkHizmetSelected = (id: number) => selection.ekHizmetIds.includes(id);

  const isEkHizmetDahil = (id: number) => included.included.ekHizmetIds.has(id);
  const isDenemeDahil = (id: number) => included.included.denemePaketiIds.has(id);
  const isYayinDahil = (id: number) => included.included.yayinPaketiIds.has(id);

  return {
    selection,
    packageCatalog,
    included,
    validationErrors,
    hasGrupSelected,
    hasPremiumSelected,
    isParentSelected,
    isOzelDersSelected,
    isDenemeSelected,
    isYayinSelected,
    isEkHizmetSelected,
    isEkHizmetDahil,
    isDenemeDahil,
    isYayinDahil,
    toggleGrup: (id: number) => commit((prev) => toggleParent(prev, packageCatalog, "grup_dersi", id)),
    togglePremium: (id: number) => commit((prev) => toggleParent(prev, packageCatalog, "premium", id)),
    toggleOzelDers: (id: number) => commit((prev) => toggleOzelDers(prev, packageCatalog, id)),
    toggleDeneme: (id: number) => commit((prev) => toggleDeneme(prev, packageCatalog, id)),
    toggleYayin: (id: number) => commit((prev) => toggleYayin(prev, packageCatalog, id)),
    toggleEkHizmet: (id: number) => commit((prev) => toggleEkHizmet(prev, packageCatalog, id)),
    clearAll: () =>
      onPackageChange({
        paketler: [],
        ek_hizmet_ids: [],
        deneme_paketi_id: null,
        yayin_paketi_ids: [],
      }),
    compositePackageId,
  };
}
