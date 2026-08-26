export type FetchJsonResult<T> = {
  ok: boolean;
  status: number;
  data: T | null;
};

const SSR_FETCH_TIMEOUT_MS = 6000;

export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<FetchJsonResult<T>> {
  try {
    const signal =
      init?.signal
      ?? (typeof window === "undefined" ? AbortSignal.timeout(SSR_FETCH_TIMEOUT_MS) : undefined);
    const response = await fetch(input, {
      ...init,
      credentials: "include",
      ...(signal ? { signal } : {}),
    });
    const contentType = response.headers.get("content-type") || "";

    if (!response.ok || !contentType.includes("application/json")) {
      return { ok: false, status: response.status, data: null };
    }

    try {
      const data = (await response.json()) as T;
      return { ok: true, status: response.status, data };
    } catch {
      return { ok: false, status: response.status, data: null };
    }
  } catch {
    return { ok: false, status: 0, data: null };
  }
}
