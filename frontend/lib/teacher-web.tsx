"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { ensureCsrfCookie, getCsrfToken } from "@/lib/api";

export type TeacherScope = {
  kurumId: number;
  subeId: number;
  yilId: number;
  subeAd: string;
  yilAd: string;
};

export type TeacherBranch = {
  id: number;
  ad: string;
  kurum_id: number;
  egitim_yili_id: number;
};

type TeacherContextValue = {
  scope: TeacherScope | null;
  branches: TeacherBranch[];
  yearNames: Record<number, string>;
  profileName: string;
  termId: number | null;
  termName: string;
  loading: boolean;
  error: string | null;
  choose: (branch: TeacherBranch) => void;
  clearScope: () => void;
};

const TeacherContext = createContext<TeacherContextValue | null>(null);
const SCOPE_KEY = "3k_teacher_scope";

type RequestOptions = {
  method?: string;
  body?: BodyInit | null;
  scope?: TeacherScope | null;
  headers?: Record<string, string>;
};

export async function teacherRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Portal": "teacher",
    ...options.headers,
  };
  if (options.scope) {
    headers["X-Kurum-ID"] = String(options.scope.kurumId);
    headers["X-Sube-ID"] = String(options.scope.subeId);
    headers["X-EgitimYili-ID"] = String(options.scope.yilId);
  }
  const mutating = method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
  if (mutating) {
    await ensureCsrfCookie();
    const csrf = getCsrfToken();
    if (csrf) headers["X-CSRFToken"] = csrf;
  }
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (!isForm && options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(path, {
    method,
    headers,
    body: options.body,
    credentials: "include",
  });
  const text = await response.text();
  let payload: { message?: string } | null = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    throw new Error(payload?.message || "İstek tamamlanamadı.");
  }
  return payload as T;
}

export function useTeacher() {
  const value = useContext(TeacherContext);
  if (!value) throw new Error("Öğretmen portalı hazır değil.");
  return value;
}

export function useTeacherData<T>(path: string | null) {
  const { scope } = useTeacher();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!path || !scope) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    teacherRequest<T>(path, { scope })
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "İstek tamamlanamadı.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, scope, tick]);

  return { data, error, loading, reload: () => setTick((value) => value + 1) };
}

function readStoredScope(branches: TeacherBranch[]): TeacherScope | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(SCOPE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as TeacherScope;
    const match = branches.find(
      (row) =>
        row.id === parsed.subeId &&
        row.kurum_id === parsed.kurumId &&
        row.egitim_yili_id === parsed.yilId,
    );
    return match
      ? { ...parsed, subeAd: match.ad }
      : null;
  } catch {
    return null;
  }
}

export function TeacherProvider({ children }: { children: ReactNode }) {
  const [branches, setBranches] = useState<TeacherBranch[]>([]);
  const [yearNames, setYearNames] = useState<Record<number, string>>({});
  const [scope, setScope] = useState<TeacherScope | null>(null);
  const [profileName, setProfileName] = useState("");
  const [termId, setTermId] = useState<number | null>(null);
  const [termName, setTermName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    teacherRequest<{
      subeler: TeacherBranch[];
      yillar: { id: number; ad: string }[];
    }>("/api/teacher/context/")
      .then((body) => {
        if (cancelled) return;
        const rows = body.subeler || [];
        const names: Record<number, string> = {};
        for (const year of body.yillar || []) names[year.id] = year.ad;
        setBranches(rows);
        setYearNames(names);
        const stored = readStoredScope(rows);
        const only = rows.length === 1 ? rows[0] : null;
        const picked = stored || (only
          ? {
              kurumId: only.kurum_id,
              subeId: only.id,
              yilId: only.egitim_yili_id,
              subeAd: only.ad,
              yilAd: names[only.egitim_yili_id] || "",
            }
          : null);
        if (picked) {
          sessionStorage.setItem(SCOPE_KEY, JSON.stringify(picked));
          setScope(picked);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Portal açılamadı.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!scope) return;
    let cancelled = false;
    teacherRequest<{ ad?: string; soyad?: string }>("/api/teacher/profile/", { scope })
      .then((body) => {
        if (!cancelled) setProfileName([body.ad, body.soyad].filter(Boolean).join(" "));
      })
      .catch(() => undefined);
    teacherRequest<{ results: { id: number; name: string; is_current: boolean }[] }>(
      "/api/teacher/terms/",
      { scope },
    )
      .then((body) => {
        if (cancelled) return;
        const current = body.results?.find((row) => row.is_current) || body.results?.[0];
        setTermId(current?.id ?? null);
        setTermName(current?.name || "");
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Dönem alınamadı.");
      });
    return () => {
      cancelled = true;
    };
  }, [scope]);

  const clearScope = useCallback(() => {
    sessionStorage.removeItem(SCOPE_KEY);
    setScope(null);
    setTermId(null);
    setTermName("");
  }, []);

  const choose = useCallback((branch: TeacherBranch) => {
    const next: TeacherScope = {
      kurumId: branch.kurum_id,
      subeId: branch.id,
      yilId: branch.egitim_yili_id,
      subeAd: branch.ad,
      yilAd: yearNames[branch.egitim_yili_id] || "",
    };
    sessionStorage.setItem(SCOPE_KEY, JSON.stringify(next));
    setScope(next);
    setTermId(null);
    setError(null);
  }, [yearNames]);

  return (
    <TeacherContext.Provider
      value={{ scope, branches, yearNames, profileName, termId, termName, loading, error, choose, clearScope }}
    >
      {children}
    </TeacherContext.Provider>
  );
}

export function clock(value: string | null | undefined) {
  if (!value) return "";
  const match = value.match(/(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : value;
}

export function roleLabel(rol: string) {
  if (rol === "PRIMARY") return "Asıl";
  if (rol === "SECONDARY") return "Yardımcı";
  return rol;
}

export const WEEKDAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

export function localIso(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function dateForWeekday(dayId: number) {
  const now = new Date();
  const mondayOffset = (now.getDay() + 6) % 7;
  const target = new Date(now);
  target.setDate(now.getDate() - mondayOffset + dayId);
  return localIso(target);
}
