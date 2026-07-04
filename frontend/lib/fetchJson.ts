export type FetchJsonResult<T> = {
  ok: boolean;
  status: number;
  data: T | null;
};

export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<FetchJsonResult<T>> {
  try {
    const response = await fetch(input, {
      ...init,
      credentials: "include",
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
