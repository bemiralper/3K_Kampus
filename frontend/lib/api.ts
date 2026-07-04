/**
 * API Helper - Context-aware fetch wrapper
 * 
 * Tüm API isteklerine aktif kurum, şube ve eğitim yılı bilgisini
 * HTTP Header olarak ekler.
 */

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

// Storage keys - KurumContext ile aynı
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

/**
 * localStorage'dan aktif context değerlerini al
 */
function getActiveContext(): { kurumId: string | null; subeId: string | null; egitimYiliId: string | null } {
  if (typeof window === "undefined") {
    return { kurumId: null, subeId: null, egitimYiliId: null };
  }

  return {
    kurumId: readContextId(STORAGE_KEYS.activeKurum),
    subeId: readContextId(STORAGE_KEYS.activeSube),
    egitimYiliId: readContextId(STORAGE_KEYS.activeEgitimYili),
  };
}

/**
 * Context header'larını oluştur (fetch çağrıları için dışa açık)
 */
export function getContextHeaders(): Record<string, string> {
  const ctx = getActiveContext();
  const headers: Record<string, string> = {};
  
  if (ctx.kurumId) headers["X-Kurum-ID"] = ctx.kurumId;
  if (ctx.subeId) headers["X-Sube-ID"] = ctx.subeId;
  if (ctx.egitimYiliId) headers["X-EgitimYili-ID"] = ctx.egitimYiliId;
  
  return headers;
}

export function resolveApiUrl(endpoint: string): string {
  if (endpoint.startsWith("http")) return endpoint;
  if (typeof window !== "undefined") {
    if (endpoint.startsWith("/api/")) return endpoint;
    return `/api${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
  }
  return `${BACKEND_URL}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
}

/** Backend JSON yanıtından okunabilir hata mesajı çıkarır */
function firstValidationError(errors: Record<string, unknown>): string | null {
  for (const value of Object.values(errors)) {
    if (Array.isArray(value) && value.length > 0) {
      const first = value[0];
      if (typeof first === "string" && first.trim()) return first;
    }
    if (typeof value === "string" && value.trim()) return value;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = firstValidationError(value as Record<string, unknown>);
      if (nested) return nested;
    }
  }
  return null;
}

export function extractApiError(data: unknown, response: Response, fallback: string): string {
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;

    if (obj.errors && typeof obj.errors === "object") {
      const detail = firstValidationError(obj.errors as Record<string, unknown>);
      if (detail) {
        if (typeof obj.error === "string" && obj.error.trim() && obj.error !== "Doğrulama hatası") {
          return obj.error;
        }
        return detail;
      }
    }

    if (typeof obj.error === "string" && obj.error.trim()) return obj.error;
    if (typeof obj.detail === "string" && obj.detail.trim()) return obj.detail;
    if (typeof obj.message === "string" && obj.message.trim() && obj.success === false) {
      return obj.message;
    }
    if (obj.details && typeof obj.details === "object") {
      const details = obj.details as Record<string, string | string[]>;
      for (const value of Object.values(details)) {
        const first = Array.isArray(value) ? value[0] : value;
        if (typeof first === "string" && first.trim()) return first;
      }
    }
  }
  if (response.status === 401) {
    return "Oturum açmanız gerekiyor. Lütfen tekrar giriş yapın.";
  }
  if (response.status === 403) {
    return "Bu işlem için yetkiniz yok.";
  }
  return fallback;
}

/** fetch yanıtını JSON olarak parse eder; hata durumunda anlamlı mesaj fırlatır */
export async function parseJsonResponse<T = unknown>(
  res: Response,
  fallbackError: string
): Promise<T> {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await res.text();
    if (text.includes("<!DOCTYPE") || text.includes("<html")) {
      throw new Error(
        res.status === 401
          ? "Oturum açmanız gerekiyor. Lütfen tekrar giriş yapın."
          : "Sunucudan beklenmeyen yanıt alındı. Lütfen sayfayı yenileyip tekrar deneyin."
      );
    }
    throw new Error(extractApiError(null, res, `${fallbackError} (${res.status})`));
  }

  const data = await res.json();
  if (!res.ok || (typeof data === "object" && data !== null && data.success === false)) {
    throw new Error(extractApiError(data, res, `${fallbackError} (${res.status})`));
  }
  return data as T;
}

export type ApiResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
} & Record<string, unknown>;

export type FetchOptions = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
};

function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  
  const cookies = document.cookie.split(";");
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split("=");
    if (name === "lms_csrftoken") {
      return value;
    }
  }
  return null;
}

/** Oturum/CSRF kaynaklı yanıt mı — yetki reddi (403 permission_denied) sayılmaz. */
export function isSessionExpiredResponse(status: number, data: unknown): boolean {
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const code = typeof obj.code === "string" ? obj.code : "";
    if (code === "not_authenticated" || code === "session_idle_timeout") {
      return true;
    }
    if (code === "permission_denied") {
      return false;
    }
    const error = typeof obj.error === "string" ? obj.error.toLowerCase() : "";
    const detail = typeof obj.detail === "string" ? obj.detail.toLowerCase() : "";
    const msg = `${error} ${detail}`;
    if (msg.includes("oturum açmanız") || msg.includes("oturum süresi")) {
      return true;
    }
    if (status === 403 && code === "not_authenticated") {
      return true;
    }
    return false;
  }
  return status === 401;
}

/** POST/PUT/PATCH/DELETE öncesi CSRF çerezi yoksa /auth/api/me/ ile alınır. */
export async function ensureCsrfCookie(): Promise<void> {
  if (typeof document === "undefined") return;
  if (getCsrfToken()) return;
  await fetch(resolveApiUrl("/auth/api/me/"), {
    credentials: "include",
    headers: { "Cache-Control": "no-cache" },
  });
}

export function notifySessionExpired() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("3k:session-expired"));
  }
}

/**
 * Context-aware API fetch
 * Otomatik olarak kurum, şube ve eğitim yılı header'larını ekler
 */
export async function apiFetch<T = unknown>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<ApiResponse<T>> {
  const url = resolveApiUrl(endpoint);
  
  const contextHeaders = getContextHeaders();
  const csrfToken = getCsrfToken();
  
  const headers: Record<string, string> = {
    ...contextHeaders,
    ...options.headers,
  };

  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (!isFormData) {
    headers["Content-Type"] = "application/json";
  }
  
  // CSRF token'ı ekle (POST, PUT, PATCH, DELETE için)
  if (csrfToken && options.method && ["POST", "PUT", "PATCH", "DELETE"].includes(options.method.toUpperCase())) {
    headers["X-CSRFToken"] = csrfToken;
  }
  
  try {
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: "include",
    });

    if (response.status === 401) {
      try {
        const errData = await response.clone().json();
        if (isSessionExpiredResponse(response.status, errData)) {
          notifySessionExpired();
        }
      } catch {
        notifySessionExpired();
      }
    }
    
    if (response.status === 204) {
      return { success: true, data: undefined as T };
    }
    
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const text = await response.text();
      const htmlError = text.includes("<!DOCTYPE") || text.includes("<html");
      return {
        success: false,
        error: htmlError
          ? extractApiError(null, response, "Sunucudan beklenmeyen yanıt alındı.")
          : `Beklenmeyen yanıt formatı (${response.status})`,
      };
    }
    
    const data = await response.json();
    
    if (typeof data.success === "boolean") {
      if (!data.success || !response.ok) {
        const { success: _s, data: responseData, error, message, errors, ...rest } = data as Record<string, unknown>;
        return {
          success: false,
          data: (responseData !== undefined ? responseData : data) as T,
          error: extractApiError(data, response, "İstek başarısız oldu"),
          message: message as string | undefined,
          errors,
          ...rest,
        };
      }
      const { success: _success, data: responseData, error, message, ...extra } = data as Record<string, unknown>;
      return {
        success: true,
        data: (responseData !== undefined ? responseData : data) as T,
        error: error as string | undefined,
        message: message as string | undefined,
        ...extra,
      };
    }
    
    if (!response.ok) {
      return {
        success: false,
        data: data as T,
        error: extractApiError(data, response, `İstek başarısız oldu (${response.status})`),
      };
    }
    
    return {
      success: true,
      data: data as T,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Bilinmeyen hata";
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * GET request helper
 */
export async function apiGet<T = unknown>(endpoint: string, options: FetchOptions = {}): Promise<ApiResponse<T>> {
  return apiFetch<T>(endpoint, { ...options, method: "GET" });
}

/**
 * POST request helper
 */
export async function apiPost<T = unknown>(
  endpoint: string,
  body?: unknown,
  options: FetchOptions = {}
): Promise<ApiResponse<T>> {
  return apiFetch<T>(endpoint, {
    ...options,
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** multipart/form-data POST — PDF yükleme vb. */
export async function apiPostForm<T = unknown>(
  endpoint: string,
  formData: FormData,
  options: FetchOptions = {},
): Promise<ApiResponse<T>> {
  return apiFetch<T>(endpoint, {
    ...options,
    method: "POST",
    body: formData,
  });
}

/**
 * PUT request helper
 */
export async function apiPut<T = unknown>(
  endpoint: string,
  body?: unknown,
  options: FetchOptions = {}
): Promise<ApiResponse<T>> {
  return apiFetch<T>(endpoint, {
    ...options,
    method: "PUT",
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * DELETE request helper
 */
export async function apiDelete<T = unknown>(endpoint: string, options: FetchOptions = {}): Promise<ApiResponse<T>> {
  return apiFetch<T>(endpoint, { ...options, method: "DELETE" });
}

/**
 * PATCH request helper
 */
export async function apiPatch<T = unknown>(
  endpoint: string,
  body?: unknown,
  options: FetchOptions = {}
): Promise<ApiResponse<T>> {
  return apiFetch<T>(endpoint, {
    ...options,
    method: "PATCH",
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Aktif context'i Backend session'a kaydet
 * Topbar'dan seçim değiştiğinde çağrılır
 */
export async function setActiveContext(
  kurumId?: number | null,
  subeId?: number | null, 
  egitimYiliId?: number | null
): Promise<ApiResponse<{ context: Record<string, unknown> }>> {
  return apiPost("/kurum-yonetimi/api/context/set/", {
    kurum_id: kurumId,
    sube_id: subeId,
    egitim_yili_id: egitimYiliId,
  });
}

/**
 * Backend'den mevcut aktif context'i al
 */
export async function fetchActiveContextFromBackend(): Promise<ApiResponse<{ context: Record<string, unknown> }>> {
  return apiGet("/kurum-yonetimi/api/context/get/");
}

export default apiFetch;
