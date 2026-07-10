import type {
  LegacyPackageData,
  PackageCatalog,
  ParentPackageRef,
  ParentPackageTur,
  StudentPackageSelection,
} from "./types";
import {
  EMPTY_SELECTION,
  compositePackageId,
  kategoriToParentTur,
  parentTurToKategori,
  parseCompositePackageId,
} from "./types";
import { deriveIncludedFromParent, findParentInCatalog, sanitizeSelection } from "./derive";

export type ValidationError = { field: string; message: string };

export function validateSelection(
  selection: StudentPackageSelection,
  catalog: PackageCatalog,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const clean = sanitizeSelection(selection, catalog);

  if (clean.parent?.tur === "premium" && clean.ozelDersIds.length > 0) {
    errors.push({ field: "ozelDersIds", message: "Premium paket seçiliyken özel ders alınamaz" });
  }

  if (clean.parent?.tur === "grup_dersi" && clean.parent) {
    const premiumCount = catalog.premiumPaketler.some(() => false);
    void premiumCount;
  }

  const hasParent = clean.parent !== null;
  const hasOzel = clean.ozelDersIds.length > 0;
  const hasDeneme = clean.denemePaketiId !== null;
  const hasYayin = clean.yayinPaketiIds.length > 0;
  const hasEk = clean.ekHizmetIds.length > 0;

  if (!hasParent && !hasOzel && !hasDeneme && !hasYayin && !hasEk) {
    errors.push({
      field: "selection",
      message: "En az bir paket veya hizmet seçiniz",
    });
  }

  return errors;
}

export function toggleParent(
  selection: StudentPackageSelection,
  catalog: PackageCatalog,
  tur: ParentPackageTur,
  id: number,
): StudentPackageSelection {
  const isSame =
    selection.parent?.tur === tur && selection.parent?.id === id;

  if (isSame) {
    // Ana paket kaldırılırken özel ders / deneme / yayın / ek hizmet seçimleri korunur
    return sanitizeSelection(
      {
        ...EMPTY_SELECTION,
        ozelDersIds: tur === "premium" ? [] : selection.ozelDersIds,
        denemePaketiId: selection.denemePaketiId,
        yayinPaketiIds: selection.yayinPaketiIds,
        ekHizmetIds: selection.ekHizmetIds,
      },
      catalog,
    );
  }

  const parent: ParentPackageRef = { tur, id };
  const parentItem = findParentInCatalog(catalog, parent);
  const included = deriveIncludedFromParent(parentItem);

  const next: StudentPackageSelection = {
    parent,
    ozelDersIds: tur === "premium" ? [] : selection.ozelDersIds,
    denemePaketiId:
      selection.denemePaketiId != null && included.denemePaketiIds.has(selection.denemePaketiId)
        ? null
        : selection.denemePaketiId,
    yayinPaketiIds: selection.yayinPaketiIds.filter((x) => !included.yayinPaketiIds.has(x)),
    ekHizmetIds: selection.ekHizmetIds.filter((x) => !included.ekHizmetIds.has(x)),
  };
  return sanitizeSelection(next, catalog);
}

export function toggleOzelDers(
  selection: StudentPackageSelection,
  catalog: PackageCatalog,
  id: number,
): StudentPackageSelection {
  if (selection.parent?.tur === "premium") return selection;
  const has = selection.ozelDersIds.includes(id);
  const next: StudentPackageSelection = {
    ...selection,
    ozelDersIds: has
      ? selection.ozelDersIds.filter((x) => x !== id)
      : [...selection.ozelDersIds, id],
  };
  return sanitizeSelection(next, catalog);
}

export function toggleDeneme(
  selection: StudentPackageSelection,
  catalog: PackageCatalog,
  id: number,
): StudentPackageSelection {
  const parentItem = findParentInCatalog(catalog, selection.parent);
  const included = deriveIncludedFromParent(parentItem);
  if (included.denemePaketiIds.has(id)) return selection;

  const next: StudentPackageSelection = {
    ...selection,
    denemePaketiId: selection.denemePaketiId === id ? null : id,
  };
  return sanitizeSelection(next, catalog);
}

export function toggleYayin(
  selection: StudentPackageSelection,
  catalog: PackageCatalog,
  id: number,
): StudentPackageSelection {
  const parentItem = findParentInCatalog(catalog, selection.parent);
  const included = deriveIncludedFromParent(parentItem);
  if (included.yayinPaketiIds.has(id)) return selection;

  const has = selection.yayinPaketiIds.includes(id);
  const next: StudentPackageSelection = {
    ...selection,
    yayinPaketiIds: has
      ? selection.yayinPaketiIds.filter((x) => x !== id)
      : [...selection.yayinPaketiIds, id],
  };
  return sanitizeSelection(next, catalog);
}

export function toggleEkHizmet(
  selection: StudentPackageSelection,
  catalog: PackageCatalog,
  id: number,
): StudentPackageSelection {
  const parentItem = findParentInCatalog(catalog, selection.parent);
  const included = deriveIncludedFromParent(parentItem);
  if (included.ekHizmetIds.has(id)) return selection;

  const h = catalog.ekHizmetler.find((x) => x.id === id);
  if (!h || h.hizmet_turu === "deneme") return selection;

  const has = selection.ekHizmetIds.includes(id);
  const next: StudentPackageSelection = {
    ...selection,
    ekHizmetIds: has
      ? selection.ekHizmetIds.filter((x) => x !== id)
      : [...selection.ekHizmetIds, id],
  };
  return sanitizeSelection(next, catalog);
}

/** Wizard API katalog yanıtından PackageCatalog üret */
export function catalogFromWizardResponse(data: {
  packages?: Array<{
    id: string;
    db_id?: number;
    kategori?: string;
    ad: string;
    fiyat?: number;
    kdv_orani?: number;
    dahil_ek_hizmet_ids?: number[];
    dahil_deneme_paketi_ids?: number[];
    dahil_yayin_paketi_ids?: number[];
  }>;
  ek_hizmetler?: Array<{ id: number; ad: string; hizmet_turu: string; fiyat: number; kdv_orani: number }>;
  deneme_paketleri?: Array<{ id: number; ad: string; fiyat: number; kdv_orani: number }>;
  yayin_paketleri?: Array<{ id: number; ad: string; fiyat: number; kdv_orani: number }>;
}): PackageCatalog {
  const grupDersleri: PackageCatalog["grupDersleri"] = [];
  const premiumPaketler: PackageCatalog["premiumPaketler"] = [];
  const ozelDersler: PackageCatalog["ozelDersler"] = [];

  for (const p of data.packages || []) {
    const dbId = p.db_id ?? parseCompositePackageId(p.id)?.dbId;
    if (dbId == null) continue;
    const kat = p.kategori || parseCompositePackageId(p.id)?.kategori || "";
    const base = {
      id: dbId,
      ad: p.ad,
      fiyat: p.fiyat ?? 0,
      kdv_orani: p.kdv_orani ?? 10,
      dahil_ek_hizmet_ids: p.dahil_ek_hizmet_ids,
      dahil_deneme_paketi_ids: p.dahil_deneme_paketi_ids,
      dahil_yayin_paketi_ids: p.dahil_yayin_paketi_ids,
    };
    if (kat === "grup_dersleri") {
      grupDersleri.push({ ...base, kategori: "grup_dersleri" });
    } else if (kat === "premium_paketler") {
      premiumPaketler.push({ ...base, kategori: "premium_paketler" });
    } else if (kat === "ozel_dersler") {
      ozelDersler.push({ id: dbId, ad: p.ad, fiyat: p.fiyat ?? 0, kdv_orani: p.kdv_orani ?? 10 });
    }
  }

  return {
    grupDersleri,
    premiumPaketler,
    ozelDersler,
    denemeler: (data.deneme_paketleri || []).map((d) => ({
      id: d.id,
      ad: d.ad,
      fiyat: d.fiyat,
      kdv_orani: d.kdv_orani,
    })),
    yayinPaketleri: (data.yayin_paketleri || []).map((y) => ({
      id: y.id,
      ad: y.ad,
      fiyat: y.fiyat,
      kdv_orani: y.kdv_orani,
    })),
    ekHizmetler: (data.ek_hizmetler || [])
      .filter((h) => h.hizmet_turu !== "deneme")
      .map((h) => ({
        id: h.id,
        ad: h.ad,
        hizmet_turu: h.hizmet_turu,
        fiyat: h.fiyat,
        kdv_orani: h.kdv_orani,
      })),
  };
}

/** Kayıt API payload'ına dönüştür */
export function selectionToLegacyPackageData(
  selection: StudentPackageSelection,
  catalog: PackageCatalog,
): LegacyPackageData {
  const clean = sanitizeSelection(selection, catalog);
  const paketler: string[] = [];

  if (clean.parent) {
    paketler.push(
      compositePackageId(parentTurToKategori(clean.parent.tur), clean.parent.id),
    );
  }
  for (const id of clean.ozelDersIds) {
    paketler.push(compositePackageId("ozel_dersler", id));
  }

  return {
    paketler,
    ek_hizmet_ids: clean.ekHizmetIds,
    deneme_paketi_id: clean.denemePaketiId,
    yayin_paketi_ids: clean.yayinPaketiIds,
  };
}

/** Legacy PackageData / composite paketler → StudentPackageSelection */
export function legacyToSelection(
  legacy: LegacyPackageData,
  catalog: PackageCatalog,
): StudentPackageSelection {
  let parent: ParentPackageRef | null = null;
  const ozelDersIds: number[] = [];

  for (const pid of legacy.paketler || []) {
    const parsed = parseCompositePackageId(pid);
    if (!parsed) continue;
    const tur = kategoriToParentTur(parsed.kategori);
    if (tur === "grup_dersi" || tur === "premium") {
      if (!parent) parent = { tur, id: parsed.dbId };
    } else if (parsed.kategori === "ozel_dersler") {
      ozelDersIds.push(parsed.dbId);
    }
  }

  const denemeIds = legacy.deneme_paketi_id != null ? [legacy.deneme_paketi_id] : [];

  const sel: StudentPackageSelection = {
    parent,
    ozelDersIds,
    denemePaketiId: denemeIds[0] ?? null,
    yayinPaketiIds: legacy.yayin_paketi_ids || [],
    ekHizmetIds: legacy.ek_hizmet_ids || [],
  };
  return sanitizeSelection(sel, catalog);
}

/** Öğrenci kayıtlı paketlerden (sözleşme auto-load) */
export function enrollmentToSelection(data: {
  egitim_paketleri?: Array<{ paket_turu: string; paket_id: number }>;
  ek_hizmetler?: Array<{ ek_hizmet_id: number }>;
}): StudentPackageSelection {
  let parent: ParentPackageRef | null = null;
  const ozelDersIds: number[] = [];
  let denemePaketiId: number | null = null;
  const yayinPaketiIds: number[] = [];

  for (const p of data.egitim_paketleri || []) {
    const tur = p.paket_turu;
    if (tur === "grup_dersi" && !parent) {
      parent = { tur: "grup_dersi", id: p.paket_id };
    } else if (tur === "premium" && !parent) {
      parent = { tur: "premium", id: p.paket_id };
    } else if (tur === "ozel_ders") {
      ozelDersIds.push(p.paket_id);
    } else if (tur === "deneme" && denemePaketiId === null) {
      denemePaketiId = p.paket_id;
    } else if (tur === "yayin") {
      yayinPaketiIds.push(p.paket_id);
    }
  }

  return {
    parent,
    ozelDersIds,
    denemePaketiId,
    yayinPaketiIds,
    ekHizmetIds: (data.ek_hizmetler || []).map((e) => e.ek_hizmet_id),
  };
}
