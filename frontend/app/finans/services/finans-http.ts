/**
 * Finans API — same-origin /api proxy + kurum context headers.
 * Doğrudan :8000 çağrıları oturum çerezini taşımaz (port farkı).
 */

import {
  ensureCsrfCookie,
  isSessionExpiredResponse,
  type FetchOptions,
} from "@/lib/api";

const STORAGE_KEYS = {
  activeKurum: "3k_active_kurum",
  activeSube: "3k_active_sube",
  activeEgitimYili: "3k_active_egitim_yili",
};

function readContextId(storageKey: string): string | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "number") return String(parsed);
    if (typeof parsed === "string" && parsed.trim()) return parsed.trim();
    if (parsed && typeof parsed === "object" && "id" in parsed && parsed.id != null) {
      return String(parsed.id);
    }
  } catch {
    if (raw.trim()) return raw.trim();
  }
  return null;
}

function getContextHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const kurumId = readContextId(STORAGE_KEYS.activeKurum);
  const subeId = readContextId(STORAGE_KEYS.activeSube);
  const egitimYiliId = readContextId(STORAGE_KEYS.activeEgitimYili);
  if (kurumId) headers["X-Kurum-ID"] = kurumId;
  if (subeId) headers["X-Sube-ID"] = subeId;
  if (egitimYiliId) headers["X-EgitimYili-ID"] = egitimYiliId;
  return headers;
}

export function appendSubeId(
  params: Record<string, string>,
  subeId?: number | null,
): Record<string, string> {
  if (subeId) params.sube_id = String(subeId);
  return params;
}

export function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const cookies = document.cookie.split(";");
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split("=");
    if (name === "lms_csrftoken") return value;
  }
  return null;
}

export function finansApiUrl(path: string): string {
  if (path.startsWith("http")) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (typeof window !== "undefined") {
    return `/api/finans/api${normalized}`;
  }
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
  return `${backend}/finans/api${normalized}`;
}

const FINANS_FIELD_LABELS: Record<string, string> = {
  cari_hesap_id: "Cari hesap",
  gider_kategorisi_id: "Gider kategorisi",
  gelir_kategorisi_id: "Gelir kategorisi",
  fatura_tarihi: "Fatura tarihi",
  vade_tarihi: "Vade tarihi",
  brut_tutar: "Tutar",
  net_tutar: "Net tutar",
  odeme_yontemi_id: "Ödeme yöntemi",
  mali_hesap_id: "Mali hesap",
  tutar: "Tutar",
  tahsilat_tarihi: "Tahsilat tarihi",
  odeme_tarihi: "Ödeme tarihi",
  taksit_sayisi: "Taksit sayısı",
  taksit_plani: "Taksit planı",
  kurum_id: "Kurum",
  sube_id: "Şube",
};

export class FinansHttpError extends Error {
  fieldErrors: Record<string, string>;

  constructor(message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = "FinansHttpError";
    this.fieldErrors = fieldErrors;
  }
}

function collectFieldErrors(source: Record<string, unknown>, fieldErrors: Record<string, string>, fieldMessages: string[]) {
  for (const [key, value] of Object.entries(source)) {
    if (Array.isArray(value)) {
      const msg = value.map((v) => String(v)).filter(Boolean).join(", ");
      if (msg.trim()) {
        fieldErrors[key] = msg.trim();
        fieldMessages.push(`${FINANS_FIELD_LABELS[key] || key}: ${msg.trim()}`);
      }
    } else if (typeof value === "string" && value.trim()) {
      fieldErrors[key] = value.trim();
      fieldMessages.push(`${FINANS_FIELD_LABELS[key] || key}: ${value.trim()}`);
    }
  }
}

function parseFinansErrorPayload(data: unknown): { message: string; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  const fieldMessages: string[] = [];

  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;

    if (obj.errors && typeof obj.errors === "object" && !Array.isArray(obj.errors)) {
      collectFieldErrors(obj.errors as Record<string, unknown>, fieldErrors, fieldMessages);
    }

    if (obj.details && typeof obj.details === "object" && !Array.isArray(obj.details)) {
      collectFieldErrors(obj.details as Record<string, unknown>, fieldErrors, fieldMessages);
    }

    if (Array.isArray(obj.non_field_errors)) {
      for (const item of obj.non_field_errors) {
        if (typeof item === "string" && item.trim()) {
          fieldMessages.push(item.trim());
        }
      }
    }

    for (const [key, value] of Object.entries(obj)) {
      if (["error", "errors", "details", "detail", "success", "message", "non_field_errors"].includes(key)) continue;
      if (Array.isArray(value) && typeof value[0] === "string") {
        fieldErrors[key] = value[0];
        fieldMessages.push(`${FINANS_FIELD_LABELS[key] || key}: ${value[0]}`);
      } else if (typeof value === "string" && value.trim()) {
        fieldErrors[key] = value.trim();
        fieldMessages.push(`${FINANS_FIELD_LABELS[key] || key}: ${value.trim()}`);
      }
    }
  }

  const baseMessage =
    (typeof (data as { details?: unknown })?.details === "string" ? (data as { details: string }).details : null) ||
    (data as { error?: string })?.error ||
    (data as { detail?: string })?.detail ||
    (Array.isArray((data as { detail?: unknown })?.detail)
      ? String((data as { detail: unknown[] }).detail[0] || "")
      : null) ||
    (data as { genel?: string })?.genel ||
    (data as { message?: string })?.message ||
    fieldMessages[0] ||
    "İşlem tamamlanamadı. Lütfen formu kontrol edin.";

  const message =
    fieldMessages.length > 1
      ? `${baseMessage} (${fieldMessages.slice(0, 3).join(" · ")})`
      : String(baseMessage);

  return { message, fieldErrors };
}

function permissionDeniedMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  if (obj.code !== "permission_denied") return null;
  const error = typeof obj.error === "string" ? obj.error : "";
  if (error.toLowerCase().includes("permission")) {
    return "Bu işlem için finans düzenleme yetkisi gerekiyor (finans.write veya finans.manage).";
  }
  return error || "Bu işlem için yetkiniz yok.";
}

export async function finansRequest<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    await ensureCsrfCookie();
  }

  const url = path.startsWith("http") ? path : finansApiUrl(path);
  const csrf = getCsrfToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...getContextHeaders(),
    ...(options.headers as Record<string, string> | undefined),
  };
  if (csrf && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    headers["X-CSRFToken"] = csrf;
  }

  const res = await fetch(url, { ...options, headers, credentials: "include" });

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (isSessionExpiredResponse(res.status, data) && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("3k:session-expired"));
  }

  if (!res.ok) {
    const deniedMsg = permissionDeniedMessage(data);
    if (deniedMsg) {
      throw new FinansHttpError(deniedMsg);
    }
    if (data == null) {
      throw new FinansHttpError(
        res.status === 403
          ? "Bu işlem için yetkiniz yok veya şube bağlamı eksik."
          : `Sunucu yanıtı okunamadı (HTTP ${res.status}). Oturumunuzu ve şube seçimini kontrol edin.`,
      );
    }
    const { message, fieldErrors } = parseFinansErrorPayload(data);
    throw new FinansHttpError(message, fieldErrors);
  }

  return data as T;
}

/** multipart/form-data — dosya yükleme (Content-Type otomatik, boundary korunur) */
export async function finansFormUpload<T>(path: string, formData: FormData, method = "POST"): Promise<T> {
  await ensureCsrfCookie();
  const url = path.startsWith("http") ? path : finansApiUrl(path);
  const csrf = getCsrfToken();
  const headers: Record<string, string> = { ...getContextHeaders() };
  if (csrf) headers["X-CSRFToken"] = csrf;

  const res = await fetch(url, { method, headers, credentials: "include", body: formData });

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (isSessionExpiredResponse(res.status, data) && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("3k:session-expired"));
  }

  if (!res.ok) {
    const deniedMsg = permissionDeniedMessage(data);
    if (deniedMsg) {
      throw new FinansHttpError(deniedMsg);
    }
    const { message, fieldErrors } = parseFinansErrorPayload(data);
    throw new FinansHttpError(message || text || "Dosya yüklenemedi.", fieldErrors);
  }

  return data as T;
}

export async function finansDownload(path: string): Promise<{ blob: Blob; filename: string }> {
  const url = path.startsWith("http") ? path : finansApiUrl(path);
  const csrf = getCsrfToken();
  const headers: Record<string, string> = {
    ...getContextHeaders(),
  };

  const res = await fetch(url, { method: "GET", headers, credentials: "include" });
  if (!res.ok) {
    let errMsg = "Dışa aktarma başarısız.";
    try {
      const data = await res.json();
      errMsg = data.details || data.error || data.detail || errMsg;
    } catch {
      // binary response
    }
    throw new Error(typeof errMsg === "string" ? errMsg : "Dışa aktarma başarısız.");
  }

  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename[^;=\n]*=(['"]?)([^'"\n;]*)\1/);
  const filename = match?.[2] || "export";
  const blob = await res.blob();
  return { blob, filename };
}

export async function finansDownloadPost(
  path: string,
  body: unknown
): Promise<{ blob: Blob; filename: string }> {
  await ensureCsrfCookie();
  const url = path.startsWith("http") ? path : finansApiUrl(path);
  const csrf = getCsrfToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...getContextHeaders(),
  };
  if (csrf) headers["X-CSRFToken"] = csrf;

  const res = await fetch(url, {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let errMsg = "Dışa aktarma başarısız.";
    try {
      const data = await res.json();
      errMsg = data.details || data.error || data.detail || errMsg;
    } catch {
      /* binary */
    }
    throw new Error(typeof errMsg === "string" ? errMsg : "Dışa aktarma başarısız.");
  }

  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename[^;=\n]*=(['"]?)([^'"\n;]*)\1/);
  const filename = match?.[2] || "export";
  const blob = await res.blob();
  return { blob, filename };
}
