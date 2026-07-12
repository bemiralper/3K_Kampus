import { apiGet, apiPost, apiPut, apiPatch, type ApiResponse } from '@/lib/api';

const BASE = '/sistem-yonetimi/api';

export type HealthStatus = 'up' | 'warn' | 'down' | 'stopped' | 'unknown';

export interface DashboardData {
  server: { status: string; host: Record<string, unknown> };
  application: { status: string; message: string };
  last_backup: { id: number; filename: string; size_bytes: number; started_at: string | null } | null;
  last_error: { id: number; message: string; error_type: string; last_seen_at: string | null; occurrence_count: number } | null;
  cpu_percent: number | null;
  ram_percent: number | null;
  disk_percent: number | null;
  postgres: Record<string, unknown>;
  nginx: Record<string, unknown> | null;
  gunicorn: Record<string, unknown> | null;
  active_users: number;
  running_jobs: number;
  services_preview: ServiceItem[];
  health_preview: HealthItem[];
  alerts: AlertItem[];
  ops_enabled: boolean;
  docker_mode: boolean;
  poll_interval_sec: number;
  collected_at: string;
}

export interface HealthItem {
  code: string;
  label: string;
  category: string;
  status: HealthStatus | string;
  message: string;
  detail: Record<string, unknown>;
  checked_at: string;
}

export interface AlertItem {
  code: string;
  active: boolean;
  severity: string;
  title: string;
  message: string;
  last_seen_at: string | null;
  metadata: Record<string, unknown>;
}

export interface ServiceItem {
  code: string;
  label: string;
  unit: string;
  status: string;
  active_state?: string;
  sub_state?: string;
  pid?: number | null;
  memory_bytes?: number | null;
  uptime_sec?: number | null;
  active_enter_timestamp?: string | null;
  message?: string;
  available?: boolean;
}

export interface LogSource {
  code: string;
  label: string;
  category: string;
  path: string;
  exists: boolean;
}

export interface LogLine {
  text: string;
  level: string;
  offset: number;
  explanation?: { title: string; text: string } | null;
}

export interface ErrorItem {
  id: number;
  fingerprint: string;
  module: string;
  error_type: string;
  message: string;
  request_url: string;
  http_method: string;
  user_id: number | null;
  status: string;
  occurrence_count: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  stack_trace?: string;
  ip_address?: string | null;
  user_agent?: string;
  request_params?: Record<string, unknown>;
  status_code?: number | null;
}

export interface JobItem {
  code: string;
  label: string;
  description: string;
  command: string;
  cron_hint: string;
  category: string;
  last_run: JobRun | null;
}

export interface JobRun {
  id: number;
  job_code: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  result_message: string;
  output: string;
  triggered_by_id: number | null;
  created_at: string | null;
}

export interface AuditItem {
  id: number;
  created_at: string | null;
  user_id: number | null;
  module: string;
  action: string;
  description: string;
  ip_address: string | null;
  user_agent: string;
  metadata: Record<string, unknown>;
}

export interface TimelineItem {
  id: number;
  created_at: string | null;
  category: string;
  title: string;
  detail: string;
  level: string;
  metadata: Record<string, unknown>;
}

export interface SettingsData {
  poll_interval_sec: number;
  disk_warn_percent: number;
  disk_critical_percent: number;
  error_rate_warn_per_min: number;
  scheduler_stale_minutes: number;
  ops_enabled: boolean;
  notes: string;
  paths: Record<string, string>;
  docker_mode: boolean;
  helper_path: string;
  updated_at: string | null;
}

export function formatBytes(n: number): string {
  if (!n || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatUptime(sec?: number | null): string {
  if (!sec || sec <= 0) return '-';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}g ${h}s`;
  if (h > 0) return `${h}s ${m}dk`;
  return `${m} dk`;
}

export const fetchDashboard = () => apiGet<DashboardData>(`${BASE}/dashboard/`);
export const fetchHealth = () => apiGet<{ items: HealthItem[]; alerts: AlertItem[] }>(`${BASE}/health/`);
export const fetchAlerts = () => apiGet<{ items: AlertItem[] }>(`${BASE}/alerts/`);
export const fetchServices = () => apiGet<{ items: ServiceItem[]; ops_enabled: boolean }>(`${BASE}/services/`);
export const controlService = (code: string, action: string, confirm: string) =>
  apiPost(`${BASE}/services/`, { code, action, confirm });
export const fetchLogSources = () => apiGet<{ items: LogSource[] }>(`${BASE}/logs/sources/`);
export const fetchLogs = (params: Record<string, string | number>) => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== '' && v !== undefined && v !== null) q.set(k, String(v));
  });
  return apiGet<{
    lines: LogLine[];
    next_offset: number;
    size: number;
    truncated: boolean;
    source: string;
    label: string;
    error?: string;
  }>(`${BASE}/logs/?${q.toString()}`);
};
export const fetchErrors = (params: Record<string, string | number>) => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== '' && v !== undefined && v !== null) q.set(k, String(v));
  });
  return apiGet<{ items: ErrorItem[]; total: number; page: number; page_size: number }>(`${BASE}/errors/?${q.toString()}`);
};
export const fetchErrorDetail = (id: number) => apiGet<ErrorItem>(`${BASE}/errors/${id}/`);
export const patchError = (id: number, data: { status: string }) => apiPatch<{ id: number; status: string }>(`${BASE}/errors/${id}/`, data);
export const fetchJobs = () => apiGet<{ items: JobItem[] }>(`${BASE}/jobs/`);
export const runJob = (code: string) => apiPost<{ run: JobRun }>(`${BASE}/jobs/`, { code });
export const fetchJobRun = (id: number) => apiGet<{ run: JobRun }>(`${BASE}/jobs/runs/${id}/`);
export const fetchAudit = (params: Record<string, string | number>) => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== '' && v !== undefined && v !== null) q.set(k, String(v));
  });
  return apiGet<{ items: AuditItem[]; total: number }>(`${BASE}/audit/?${q.toString()}`);
};
export const fetchTimeline = (params: Record<string, string | number> = {}) => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== '' && v !== undefined && v !== null) q.set(k, String(v));
  });
  return apiGet<{ items: TimelineItem[]; total: number }>(`${BASE}/timeline/?${q.toString()}`);
};
export const fetchPerformance = (range: string) =>
  apiGet<{ range: string; points: Array<Record<string, number | string>>; live: Record<string, unknown>; postgres: Record<string, unknown> }>(
    `${BASE}/performance/?range=${encodeURIComponent(range)}`,
  );
export const fetchStorage = () =>
  apiGet<{
    disk: Record<string, number | string>;
    folders: Array<{ key: string; path: string; exists: boolean; size_bytes: number; file_count: number }>;
    largest: Array<{ path: string; name: string; size_bytes: number; file_count: number }>;
  }>(`${BASE}/storage/`);
export const fetchSettings = () => apiGet<SettingsData>(`${BASE}/settings/`);
export const updateSettings = (data: Partial<SettingsData>) =>
  apiPut<{ updated: boolean; settings: SettingsData }>(`${BASE}/settings/`, data);

export type { ApiResponse };
