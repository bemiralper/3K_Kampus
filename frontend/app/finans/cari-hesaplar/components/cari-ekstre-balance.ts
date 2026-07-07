import type { CariHareket } from "../../types/cari-hesap-types";

/** Tarih + oluşturma sırasına göre kronolojik sıralama (eskiden yeniye). */
export function compareHareketChronological(a: CariHareket, b: CariHareket): number {
  const dateA = (a.islem_tarihi || "").slice(0, 10);
  const dateB = (b.islem_tarihi || "").slice(0, 10);
  if (dateA !== dateB) return dateA.localeCompare(dateB);
  if (a.created_at && b.created_at && a.created_at !== b.created_at) {
    return a.created_at.localeCompare(b.created_at);
  }
  return a.id - b.id;
}

/** Hareket sonrası net bakiye (borç − alacak). */
export function getHareketBakiyeSonrasi(h: CariHareket): number {
  if (h.bakiye_sonrasi != null && !Number.isNaN(Number(h.bakiye_sonrasi))) {
    return Number(h.bakiye_sonrasi);
  }
  return Number(h.borc_sonrasi || 0) - Number(h.alacak_sonrasi || 0);
}

/** Hareket öncesi net bakiye. */
export function getHareketBakiyeOncesi(h: CariHareket): number {
  if (h.bakiye_oncesi != null && !Number.isNaN(Number(h.bakiye_oncesi))) {
    return Number(h.bakiye_oncesi);
  }
  return Number(h.borc_oncesi || 0) - Number(h.alacak_oncesi || 0);
}

/** Seçili dönemin devreden bakiyesi (ilk hareket öncesi). */
export function computeDevredenBakiye(hareketler: CariHareket[]): number {
  if (!hareketler.length) return 0;
  const sorted = [...hareketler].sort(compareHareketChronological);
  return getHareketBakiyeOncesi(sorted[0]);
}

/** Seçili dönemin kapanış bakiyesi (son hareket sonrası). */
export function computeKapanisBakiye(hareketler: CariHareket[]): number {
  if (!hareketler.length) return computeDevredenBakiye(hareketler);
  const sorted = [...hareketler].sort(compareHareketChronological);
  return getHareketBakiyeSonrasi(sorted[sorted.length - 1]);
}

export function fmtEkstreMoney(v: number | string | null | undefined): string {
  return Number(v || 0).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Ekran: işaret + (B) borçlu / (A) alacaklı. */
export function formatEkstreBakiye(value: number): string {
  const n = Number(value || 0);
  const formatted = fmtEkstreMoney(Math.abs(n));
  if (Math.abs(n) < 0.005) return `${formatted} ₺`;
  return `${formatted} ₺ ${n > 0 ? "(B)" : "(A)"}`;
}

/** Export hücreleri: yalnızca sayı (₺ soneki ayrı kolonda değil). */
export function formatEkstreBakiyeExport(value: number): string {
  const n = Number(value || 0);
  const formatted = fmtEkstreMoney(Math.abs(n));
  if (Math.abs(n) < 0.005) return formatted;
  return `${n > 0 ? "" : "-"}${formatted}`;
}

function fmtTarihExport(d: string | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function mapHareketExportRow(h: CariHareket): Record<string, string> {
  const isAlacak = h.yon === "alacak";
  const bakiye = getHareketBakiyeSonrasi(h);
  return {
    tarih: fmtTarihExport(h.islem_tarihi),
    islem: h.islem_turu_display || h.islem_turu,
    aciklama: h.aciklama || h.belge_no || "",
    kategori: h.kategori_adi || "",
    odeme_yontemi: h.odeme_yontemi_adi || "",
    islem_yapan: h.islem_yapan_adi || "",
    alacak: isAlacak ? fmtEkstreMoney(h.tutar) : "",
    borc: !isAlacak ? fmtEkstreMoney(h.tutar) : "",
    bakiye: formatEkstreBakiyeExport(bakiye),
  };
}

/**
 * Ekstre export satırları — kronolojik sırada, isteğe bağlı devreden satırı.
 * PDF/Excel/CSV ekrandaki bakiye mantığı ile aynıdır.
 */
export function buildEkstreExportRows(
  hareketler: CariHareket[],
  opts?: { includeDevredenRow?: boolean },
): Record<string, string>[] {
  const sorted = [...hareketler].sort(compareHareketChronological);
  const rows: Record<string, string>[] = [];

  if (opts?.includeDevredenRow !== false && sorted.length > 0) {
    const devreden = computeDevredenBakiye(sorted);
    rows.push({
      tarih: "",
      islem: "Devreden Bakiye",
      aciklama: "",
      kategori: "",
      odeme_yontemi: "",
      islem_yapan: "",
      alacak: "",
      borc: "",
      bakiye: formatEkstreBakiyeExport(devreden),
    });
  }

  for (const h of sorted) {
    rows.push(mapHareketExportRow(h));
  }
  return rows;
}
