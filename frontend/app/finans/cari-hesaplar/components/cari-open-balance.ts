/** Net bakiyeden açık borç/alacak (liste ve özet için). */

export function resolveCariBakiye(row: {
  bakiye?: number | null;
  toplam_borc?: number | null;
  toplam_alacak?: number | null;
}): number {
  if (row.bakiye != null && !Number.isNaN(Number(row.bakiye))) {
    return Number(row.bakiye);
  }
  return Number(row.toplam_borc || 0) - Number(row.toplam_alacak || 0);
}

/** Bizim ödeyeceğimiz tutar (net bakiye negatif). */
export function cariAcikVerecek(bakiye: number): number {
  return bakiye < 0 ? Math.abs(bakiye) : 0;
}

/** Tahsil edilecek tutar (net bakiye pozitif). */
export function cariAcikAlacak(bakiye: number): number {
  return bakiye > 0 ? bakiye : 0;
}

export function cariRowAcikVerecek(row: {
  bakiye?: number | null;
  toplam_borc?: number | null;
  toplam_alacak?: number | null;
}): number {
  return cariAcikVerecek(resolveCariBakiye(row));
}

export function cariRowAcikAlacak(row: {
  bakiye?: number | null;
  toplam_borc?: number | null;
  toplam_alacak?: number | null;
}): number {
  return cariAcikAlacak(resolveCariBakiye(row));
}
