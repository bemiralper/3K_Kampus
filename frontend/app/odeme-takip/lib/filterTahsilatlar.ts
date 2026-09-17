import type { TahsilatFiltre, TahsilatItem } from "../types";

function dateOnly(value?: string | null): string {
  if (!value) return "";
  return String(value).slice(0, 10);
}

/** Türkçe büyük/küçük ve aksan farkını yok sayarak karşılaştırma metni. */
export function foldTr(value?: string | null): string {
  return (value || "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .trim();
}

export function textMatches(haystack?: string | null, query?: string | null): boolean {
  const q = foldTr(query);
  if (!q) return true;
  const hay = foldTr(haystack);
  if (hay.includes(q)) return true;
  const parts = q.split(/\s+/).filter(Boolean);
  return parts.length > 1 && parts.every((p) => hay.includes(p));
}

export type TahsilatYontemOption = { key: string; label: string };

const TIP_LABELS: Record<string, string> = {
  nakit: "Nakit",
  pos: "POS",
  havale_eft: "Havale / EFT",
  online: "Online Ödeme",
  cek: "Çek",
  senet: "Senet",
};

function tipKey(value?: string | null): string {
  return foldTr(value).replace(/[\s/-]+/g, "_");
}

/** Tablodaki gerçek yöntemler — plan kanoniği ile kasa/banka kaydı aynı seçenek olsun. */
export function tahsilatYontemOptions(list: TahsilatItem[]): TahsilatYontemOption[] {
  const map = new Map<string, string>();
  for (const row of list) {
    const tip = tipKey(row.odeme_yontemi?.tip);
    const ad = (row.odeme_yontemi?.ad || "").trim();
    if (!tip && !ad) continue;
    const key = tip || foldTr(ad);
    if (!map.has(key)) map.set(key, TIP_LABELS[tip] || ad || tip);
  }
  return [...map.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "tr"));
}

export function yontemMatches(
  row: TahsilatItem,
  selectedKey: string,
  selected?: { id?: number | string; ad?: string; tip?: string } | null,
): boolean {
  if (!selectedKey) return true;
  const rowId = String(row.odeme_yontemi?.id ?? "");
  const rowTip = tipKey(row.odeme_yontemi?.tip);
  const rowAd = foldTr(row.odeme_yontemi?.ad);
  const selTip = tipKey(selected?.tip);
  const selAd = foldTr(selected?.ad);
  const selKey = tipKey(selectedKey) || foldTr(selectedKey);
  if (rowId && rowId === String(selectedKey)) return true;
  if (rowTip && (rowTip === selKey || (selTip && rowTip === selTip))) return true;
  if (rowAd && (rowAd === foldTr(selectedKey) || (selAd && rowAd === selAd))) return true;
  return false;
}

export function applyTahsilatFilters(
  list: TahsilatItem[],
  filters: TahsilatFiltre,
  yontemLookup?: { id?: number | string; ad?: string; tip?: string } | null,
): TahsilatItem[] {
  const bas = dateOnly(filters.tarih_baslangic);
  const bit = dateOnly(filters.tarih_bitis);
  const durum = filters.durum || "";
  const tur = filters.tahsilat_turu || "";
  const yontemKey = filters.odeme_yontemi_id || "";

  return list.filter((row) => {
    if (filters.ogrenci_adi && !textMatches(row.ogrenci_adi, filters.ogrenci_adi)) return false;
    if (filters.sozlesme_no && !textMatches(row.sozlesme_no, filters.sozlesme_no)) return false;
    const tarih = dateOnly(row.tahsilat_tarihi);
    if (bas && (!tarih || tarih < bas)) return false;
    if (bit && (!tarih || tarih > bit)) return false;
    if (durum && row.durum !== durum) return false;
    if (tur && row.tahsilat_turu !== tur) return false;
    if (yontemKey && !yontemMatches(row, yontemKey, yontemLookup)) return false;
    return true;
  });
}

export function tahsilatFilterActive(filters: TahsilatFiltre): boolean {
  return Object.values(filters).some((v) => Boolean(v));
}
