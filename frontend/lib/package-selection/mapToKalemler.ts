import type { BillableLineItem, KalemRowInput, StudentPackageSelection, PackageCatalog } from "./types";
import { deriveBillableItems } from "./derive";

/**
 * Seçim → kalem satır girdileri.
 * Finans hesabı (hesaplaKalem) burada yapılmaz; SozlesmeOlusturClient mergeKalemRow kullanır.
 */
export function mapSelectionToKalemInputs(
  selection: StudentPackageSelection,
  catalog: PackageCatalog,
  priceOverrides?: Map<string, { fiyat: number; kdv_orani: number; kalem_adi?: string }>,
): KalemRowInput[] {
  const items = deriveBillableItems(selection, catalog);
  return items.map((item) => {
    const override = priceOverrides?.get(item.key);
    return {
      key: item.key,
      kalem_turu: item.kalem_turu,
      paket_turu: item.paket_turu,
      kalem_id: item.kalem_id,
      kalem_adi: override?.kalem_adi ?? item.kalem_adi,
      fiyat: override?.fiyat ?? item.fiyat,
      kdv_orani: override?.kdv_orani ?? item.kdv_orani,
    };
  });
}

export function billableItemsFromEnrolled(
  enrolled: {
    egitim_paketleri?: Array<{
      paket_turu: string;
      paket_id: number;
      paket_adi: string;
      fiyat: number;
      kdv_orani: number;
      dahil_ek_hizmet_ids?: number[];
      dahil_deneme_paketi_ids?: number[];
      dahil_yayin_paketi_ids?: number[];
    }>;
    ek_hizmetler?: Array<{
      ek_hizmet_id: number;
      ad: string;
      fiyat: number;
      kdv_orani: number;
      hizmet_turu?: string;
    }>;
  },
  selection: StudentPackageSelection,
): BillableLineItem[] {
  const catalog: PackageCatalog = {
    grupDersleri: [],
    premiumPaketler: [],
    ozelDersler: [],
    denemeler: [],
    yayinPaketleri: [],
    ekHizmetler: [],
  };

  for (const p of enrolled.egitim_paketleri || []) {
    if (p.paket_turu === "grup_dersi") {
      catalog.grupDersleri.push({
        id: p.paket_id,
        ad: p.paket_adi,
        kategori: "grup_dersleri",
        dahil_ek_hizmet_ids: p.dahil_ek_hizmet_ids,
        dahil_deneme_paketi_ids: p.dahil_deneme_paketi_ids,
        dahil_yayin_paketi_ids: p.dahil_yayin_paketi_ids,
        fiyat: p.fiyat,
        kdv_orani: p.kdv_orani,
      } as never);
    } else if (p.paket_turu === "premium") {
      catalog.premiumPaketler.push({
        id: p.paket_id,
        ad: p.paket_adi,
        kategori: "premium_paketler",
        dahil_ek_hizmet_ids: p.dahil_ek_hizmet_ids,
        dahil_deneme_paketi_ids: p.dahil_deneme_paketi_ids,
        dahil_yayin_paketi_ids: p.dahil_yayin_paketi_ids,
        fiyat: p.fiyat,
        kdv_orani: p.kdv_orani,
      } as never);
    } else if (p.paket_turu === "ozel_ders") {
      catalog.ozelDersler.push({
        id: p.paket_id,
        ad: p.paket_adi,
        fiyat: p.fiyat,
        kdv_orani: p.kdv_orani,
      });
    } else if (p.paket_turu === "deneme") {
      catalog.denemeler.push({
        id: p.paket_id,
        ad: p.paket_adi,
        fiyat: p.fiyat,
        kdv_orani: p.kdv_orani,
      });
    } else if (p.paket_turu === "yayin") {
      catalog.yayinPaketleri.push({
        id: p.paket_id,
        ad: p.paket_adi,
        fiyat: p.fiyat,
        kdv_orani: p.kdv_orani,
      });
    }
  }

  for (const eh of enrolled.ek_hizmetler || []) {
    if (eh.hizmet_turu === "deneme") continue;
    catalog.ekHizmetler.push({
      id: eh.ek_hizmet_id,
      ad: eh.ad,
      hizmet_turu: eh.hizmet_turu || "kutuphane",
      fiyat: eh.fiyat,
      kdv_orani: eh.kdv_orani,
    });
  }

  return deriveBillableItems(selection, catalog);
}
