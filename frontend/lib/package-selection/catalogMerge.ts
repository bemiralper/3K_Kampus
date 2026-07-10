import type { CatalogParentItem, PackageCatalog } from "./types";

function mergeById<T extends { id: number }>(primary: T[], secondary: T[]): T[] {
  const map = new Map<number, T>();
  for (const item of secondary) map.set(item.id, item);
  for (const item of primary) {
    const existing = map.get(item.id);
    map.set(item.id, existing ? ({ ...existing, ...item } as T) : item);
  }
  return Array.from(map.values());
}

function mergeParentItems(enrolled: CatalogParentItem[], kalem: CatalogParentItem[]): CatalogParentItem[] {
  const map = new Map<number, CatalogParentItem>();
  for (const item of kalem) map.set(item.id, item);
  for (const item of enrolled) {
    const existing = map.get(item.id);
    map.set(item.id, {
      ...(existing ?? item),
      ...item,
      dahil_ek_hizmet_ids: item.dahil_ek_hizmet_ids ?? existing?.dahil_ek_hizmet_ids,
      dahil_deneme_paketi_ids: item.dahil_deneme_paketi_ids ?? existing?.dahil_deneme_paketi_ids,
      dahil_yayin_paketi_ids: item.dahil_yayin_paketi_ids ?? existing?.dahil_yayin_paketi_ids,
    });
  }
  return Array.from(map.values());
}

/** Grup derslerini öğrenci alanına göre süz (sayısal öğrenciye EA paketi gösterme) */
export function filterGrupCatalogByAlan(catalog: PackageCatalog, alanId?: number | null): PackageCatalog {
  if (!alanId) return catalog;
  return {
    ...catalog,
    grupDersleri: catalog.grupDersleri.filter(
      (g) => g.alan_id == null || g.alan_id === alanId,
    ),
  };
}

/** Kayıtlı paket kataloğu + kalem-secenekleri kataloğunu birleştir */
export function mergePackageCatalogs(enrolled: PackageCatalog, kalem: PackageCatalog): PackageCatalog {
  return {
    grupDersleri: mergeParentItems(enrolled.grupDersleri, kalem.grupDersleri),
    premiumPaketler: mergeParentItems(enrolled.premiumPaketler, kalem.premiumPaketler),
    ozelDersler: mergeById(enrolled.ozelDersler, kalem.ozelDersler),
    denemeler: mergeById(enrolled.denemeler, kalem.denemeler),
    yayinPaketleri: mergeById(enrolled.yayinPaketleri, kalem.yayinPaketleri),
    ekHizmetler: mergeById(enrolled.ekHizmetler, kalem.ekHizmetler),
  };
}

type KalemItem = {
  id: number;
  ad: string;
  fiyat?: number;
  kdv_orani?: number;
  kdv_dahil_fiyat?: number;
  hizmet_turu?: string;
  dahil_ek_hizmet_ids?: number[];
  dahil_deneme_paketi_ids?: number[];
  dahil_yayin_paketi_ids?: number[];
  alan_id?: number | null;
};

/** kalem-secenekleri API yanıtından PackageCatalog üret */
export function catalogFromKalemSecenekleri(data: {
  grupDersleri?: KalemItem[];
  ozelDersler?: KalemItem[];
  premiumPaketler?: KalemItem[];
  denemeler?: KalemItem[];
  yayinPaketleri?: KalemItem[];
  ekHizmetler?: KalemItem[];
}): PackageCatalog {
  const price = (item: KalemItem) => item.kdv_dahil_fiyat ?? item.fiyat ?? 0;

  return {
    grupDersleri: (data.grupDersleri || []).map((p) => ({
      id: p.id,
      ad: p.ad,
      fiyat: price(p),
      kdv_orani: p.kdv_orani ?? 10,
      kategori: "grup_dersleri" as const,
      alan_id: p.alan_id ?? null,
      dahil_ek_hizmet_ids: p.dahil_ek_hizmet_ids,
      dahil_deneme_paketi_ids: p.dahil_deneme_paketi_ids,
      dahil_yayin_paketi_ids: p.dahil_yayin_paketi_ids,
    })),
    premiumPaketler: (data.premiumPaketler || []).map((p) => ({
      id: p.id,
      ad: p.ad,
      fiyat: price(p),
      kdv_orani: p.kdv_orani ?? 10,
      kategori: "premium_paketler" as const,
      dahil_ek_hizmet_ids: p.dahil_ek_hizmet_ids,
      dahil_deneme_paketi_ids: p.dahil_deneme_paketi_ids,
      dahil_yayin_paketi_ids: p.dahil_yayin_paketi_ids,
    })),
    ozelDersler: (data.ozelDersler || []).map((p) => ({
      id: p.id,
      ad: p.ad,
      fiyat: price(p),
      kdv_orani: p.kdv_orani ?? 10,
    })),
    denemeler: (data.denemeler || []).map((p) => ({
      id: p.id,
      ad: p.ad,
      fiyat: price(p),
      kdv_orani: p.kdv_orani ?? 10,
    })),
    yayinPaketleri: (data.yayinPaketleri || []).map((p) => ({
      id: p.id,
      ad: p.ad,
      fiyat: price(p),
      kdv_orani: p.kdv_orani ?? 10,
    })),
    ekHizmetler: (data.ekHizmetler || [])
      .filter((h) => h.hizmet_turu !== "deneme")
      .map((h) => ({
        id: h.id,
        ad: h.ad,
        hizmet_turu: h.hizmet_turu || "kutuphane",
        fiyat: price(h),
        kdv_orani: h.kdv_orani ?? 10,
      })),
  };
}
