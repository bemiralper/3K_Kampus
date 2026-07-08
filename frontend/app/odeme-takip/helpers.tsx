// ─── Ödeme Takip Shared Helpers ──────────────────────────────

import { getContextHeaders } from "@/lib/api";

export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
export const API_BASE =
  typeof window !== "undefined" ? "/api/odeme-takip/api" : `${BACKEND_URL}/odeme-takip/api`;

export function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const cookies = document.cookie.split(";");
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split("=");
    if (name === "lms_csrftoken") return value;
  }
  return null;
}

export function apiHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...getContextHeaders(), ...extra };
  const csrf = getCsrfToken();
  if (csrf) headers["X-CSRFToken"] = csrf;
  return headers;
}

export function postHeaders(): Record<string, string> {
  return apiHeaders({ "Content-Type": "application/json" });
}

export function parseApiError(payload: unknown, fallback = "Hata oluştu"): string {
  if (!payload || typeof payload !== "object") return fallback;
  const data = payload as Record<string, unknown>;
  if (typeof data.error === "string" && data.error) return data.error;
  if (typeof data.detail === "string" && data.detail) return data.detail;
  const messages = Object.values(data)
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  return messages.join(", ") || fallback;
}

export const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

export const formatDate = (d: string | null) => {
  if (!d) return "-";
  try { return new Date(d).toLocaleDateString("tr-TR"); } catch { return d; }
};

export const durumLabel: Record<string, { label: string; color: string; bg: string }> = {
  taslak: { label: "Taslak", color: "#6b7280", bg: "#f3f4f6" },
  aktif: { label: "Aktif", color: "#059669", bg: "#ecfdf5" },
  iptal: { label: "İptal", color: "#dc2626", bg: "#fef2f2" },
  dondurulmus: { label: "Dondurulmuş", color: "#d97706", bg: "#fffbeb" },
  feshedilmis: { label: "Feshedilmiş", color: "#991b1b", bg: "#fef2f2" },
  tamamlandi: { label: "Tamamlandı", color: "#2563eb", bg: "#eff6ff" },
};

export const taksitDurumLabel: Record<string, { label: string; color: string; bg: string }> = {
  beklemede: { label: "Beklemede", color: "#6b7280", bg: "#f3f4f6" },
  kismi_odendi: { label: "Kısmi Ödendi", color: "#d97706", bg: "#fffbeb" },
  odendi: { label: "Ödendi", color: "#059669", bg: "#ecfdf5" },
  gecikti: { label: "Gecikti", color: "#dc2626", bg: "#fef2f2" },
  iptal: { label: "İptal", color: "#9ca3af", bg: "#f3f4f6" },
};

export const tahsilatTuruLabel: Record<string, string> = {
  normal: "Normal",
  mahsup: "Mahsup",
  iade: "İade",
  emanet: "Emanet",
};

export const tahsilatDurumLabel: Record<string, { label: string; color: string; bg: string }> = {
  aktif: { label: "Aktif", color: "#059669", bg: "#ecfdf5" },
  iptal_edildi: { label: "İptal Edildi", color: "#dc2626", bg: "#fef2f2" },
};

export const egitimTuruLabel: Record<string, string> = {
  yks: "YKS",
  lgs: "LGS",
  ara_sinif: "Ara Sınıf",
  mezun: "Mezun",
  diger: "Diğer",
};

export const kalemTuruLabel: Record<string, string> = {
  paket: "Paket",
  ek_hizmet: "Ek Hizmet",
  grup_dersi: "Grup Dersi",
  ozel_ders: "Özel Ders",
  deneme: "Deneme",
  ek_hizmet_satisi: "Ek Hizmet Satışı",
};

export const odemeTuruLabel: Record<string, string> = {
  pesin: "Peşin",
  taksitli: "Taksitli",
  cek_senet: "Çek / Senet",
  karma: "Karma",
};

/** Peşin dışındaki tüm taksit planlı ödeme türleri */
export function odemeTuruTaksitPlaniMi(odemeTuru: string): boolean {
  return odemeTuru === "taksitli" || odemeTuru === "cek_senet" || odemeTuru === "karma";
}

export const taksitPeriyoduLabel: Record<string, string> = {
  aylik: "Aylık",
  iki_aylik: "2 Aylık",
  uc_aylik: "3 Aylık",
  ozel: "Özel Plan",
};

export const gecmisIslemTuruLabel: Record<string, string> = {
  olusturma: "Oluşturma",
  guncelleme: "Güncelleme",
  durum_degisikligi: "Durum Değişikliği",
  indirim: "İndirim",
  taksit: "Taksit",
  tahsilat: "Tahsilat",
  iptal: "İptal",
  fesih: "Fesih",
  kalem_ekleme: "Kalem Ekleme",
  kalem_cikarma: "Kalem Çıkarma",
  revizyon: "Revizyon",
};

export function gecmisIslemTuruText(islemTuru: string, label?: string | null): string {
  return label?.trim() || gecmisIslemTuruLabel[islemTuru] || islemTuru;
}

export function islemYapanText(islemYapan: string | null | undefined): string {
  const name = islemYapan?.trim();
  return name || "Belirtilmemiş";
}

export const DurumBadge = ({ durum, map }: { durum: string; map: Record<string, { label: string; color: string; bg: string }> }) => {
  const d = map[durum] || { label: durum, color: "#6b7280", bg: "#f3f4f6" };
  return (
    <span style={{ padding: "2px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600, color: d.color, background: d.bg, whiteSpace: "nowrap" }}>
      {d.label}
    </span>
  );
};
