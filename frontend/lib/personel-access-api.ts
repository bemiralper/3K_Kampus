/**
 * Personel API — şube erişimi ve finans yetkili adayları
 */

function personelApiUrl(path: string): string {
  if (typeof window !== "undefined") {
    return `/api/personel${path.startsWith("/") ? path : `/${path}`}`;
  }
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
  return `${backend}/personel${path.startsWith("/") ? path : `/${path}`}`;
}

function readContextHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (typeof window === "undefined") return headers;
  for (const [key, storageKey] of [
    ["X-Kurum-ID", "3k_active_kurum"],
    ["X-Sube-ID", "3k_active_sube"],
    ["X-EgitimYili-ID", "3k_active_egitim_yili"],
  ] as const) {
    const raw = localStorage.getItem(storageKey);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const id = typeof parsed === "object" && parsed?.id != null ? parsed.id : parsed;
      if (id) headers[key] = String(id);
    } catch {
      if (raw.trim()) headers[key] = raw.trim();
    }
  }
  return headers;
}

export interface MySubeItem {
  id: number;
  ad: string;
  kod: string;
  aktif_mi: boolean;
  kurum_id: number;
  kurum_ad: string;
}

export interface MySubelerResponse {
  success: boolean;
  subeler: MySubeItem[];
  toplam: number;
  role_code: string | null;
  global_sube_access: boolean;
  needs_sube_picker: boolean;
  requires_login_sube_selection: boolean;
}

export interface MyKurumItem {
  id: number;
  ad: string;
  kod: string;
  aktif_mi: boolean;
}

export interface MyKurumlarResponse {
  success: boolean;
  kurumlar: MyKurumItem[];
  toplam: number;
  needs_kurum_picker: boolean;
}

export interface FinansYetkiliPersonel {
  id: number;
  ad: string;
  soyad: string;
  tam_ad: string;
  email: string;
  telefon: string;
  rol_kodu: string;
  rol_adi: string;
  gorev_sube_ad: string;
}

export const personelAccessService = {
  async myKurumlar(): Promise<MyKurumlarResponse> {
    const res = await fetch(personelApiUrl("/api/my-kurumlar/"), {
      credentials: "include",
      headers: readContextHeaders(),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Kurum listesi alınamadı");
    }
    return data;
  },

  async mySubeler(params?: { kurum_id?: number; egitim_yili_id?: number }): Promise<MySubelerResponse> {
    const qs = new URLSearchParams();
    if (params?.kurum_id) qs.set("kurum_id", String(params.kurum_id));
    if (params?.egitim_yili_id) qs.set("egitim_yili_id", String(params.egitim_yili_id));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    const res = await fetch(personelApiUrl(`/api/my-subeler/${suffix}`), {
      credentials: "include",
      headers: readContextHeaders(),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Şube listesi alınamadı");
    }
    return data;
  },

  async finansYetkililer(params: { kurum_id: number; egitim_yili_id?: number }): Promise<FinansYetkiliPersonel[]> {
    const qs = new URLSearchParams({ kurum_id: String(params.kurum_id) });
    if (params.egitim_yili_id) qs.set("egitim_yili_id", String(params.egitim_yili_id));
    const res = await fetch(personelApiUrl(`/api/finans-yetkililer/?${qs.toString()}`), {
      credentials: "include",
      headers: readContextHeaders(),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Personel listesi alınamadı");
    }
    return data.personeller || [];
  },
};
