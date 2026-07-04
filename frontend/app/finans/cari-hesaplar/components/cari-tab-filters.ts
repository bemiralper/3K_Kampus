import type { CariHareket } from "../../types/cari-hesap-types";
import type { GelirKaydiListItem } from "../../types/gelir-types";
import type { GiderKaydiListItem } from "../../types/gider-types";
import type { CariTabFilterState } from "./CariTabToolbar";

function inDateRange(
  dateStr: string | null | undefined,
  baslangic: string,
  bitis: string
): boolean {
  if (!baslangic && !bitis) return true;
  if (!dateStr) return false;
  const d = dateStr.slice(0, 10);
  if (baslangic && d < baslangic) return false;
  if (bitis && d > bitis) return false;
  return true;
}

function matchesArama(q: string, ...fields: (string | null | undefined)[]): boolean {
  if (!q) return true;
  const lower = q.toLowerCase();
  return fields.some((f) => (f || "").toLowerCase().includes(lower));
}

export function resolveFilterLabel(
  options: { id: number; ad: string }[],
  id: string
): string | undefined {
  if (!id) return undefined;
  return options.find((o) => String(o.id) === id)?.ad;
}

export function filterCariHareketler(
  items: CariHareket[],
  filters: CariTabFilterState,
  kategoriAd?: string,
  odemeAd?: string
): CariHareket[] {
  return items.filter((h) => {
    if (!inDateRange(h.islem_tarihi, filters.baslangic, filters.bitis)) return false;
    if (kategoriAd && h.kategori_adi !== kategoriAd) return false;
    if (odemeAd && h.odeme_yontemi_adi !== odemeAd) return false;
    return matchesArama(
      filters.arama,
      h.aciklama,
      h.belge_no,
      h.kategori_adi,
      h.odeme_yontemi_adi,
      h.islem_turu_display
    );
  });
}

export function filterGelirKayitlari(
  items: GelirKaydiListItem[],
  filters: CariTabFilterState
): GelirKaydiListItem[] {
  return items.filter((g) => {
    if (!inDateRange(g.fatura_tarihi, filters.baslangic, filters.bitis)) return false;
    if (filters.kategoriId && String(g.gelir_kategorisi_id || "") !== filters.kategoriId) {
      return false;
    }
    if (filters.odemeYontemiId && String(g.odeme_yontemi_id || "") !== filters.odemeYontemiId) {
      return false;
    }
    return matchesArama(
      filters.arama,
      g.aciklama,
      g.fatura_no,
      g.kategori_adi,
      g.cari_hesap_adi,
      g.odeme_yontemi_adi
    );
  });
}

export function filterGiderKayitlari(
  items: GiderKaydiListItem[],
  filters: CariTabFilterState
): GiderKaydiListItem[] {
  return items.filter((g) => {
    if (!inDateRange(g.fatura_tarihi, filters.baslangic, filters.bitis)) return false;
    if (filters.kategoriId && String(g.gider_kategorisi_id || "") !== filters.kategoriId) {
      return false;
    }
    if (filters.odemeYontemiId && String(g.odeme_yontemi_id || "") !== filters.odemeYontemiId) {
      return false;
    }
    return matchesArama(
      filters.arama,
      g.aciklama,
      g.fatura_no,
      g.kategori_adi,
      g.cari_hesap_adi,
      g.odeme_yontemi_adi
    );
  });
}

export function filterOdemeHareketleri(
  items: CariHareket[],
  filters: CariTabFilterState,
  kategoriAd?: string,
  odemeAd?: string
): CariHareket[] {
  return filterCariHareketler(items, filters, kategoriAd, odemeAd);
}
