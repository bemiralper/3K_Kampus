import { apiGet, apiPost, apiPut, apiDelete, apiPatch, apiPostForm, resolveApiUrl, type ApiResponse } from './api';

const BASE = '/yedekleme/api';

function listUrl(path: string, query: string): string {
  return query ? `${BASE}/${path}/?${query}` : `${BASE}/${path}/`;
}

export interface BackupArtifact {
  id: number;
  filename: string;
  size_bytes: number;
  checksum: string;
  status: string;
  kind: string;
  trigger: string;
  resource_codes: string[];
  encrypted: boolean;
  format_version: string;
  manifest: Record<string, unknown>;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  created_by: number | null;
  created_by_name?: string | null;
  error_message: string;
}

export interface BackupResource {
  id: number;
  code: string;
  name: string;
  resource_type: string;
  description: string;
  handler_key: string;
  config: Record<string, unknown>;
  is_active: boolean;
  is_default: boolean;
  encrypt: boolean;
  compress: boolean;
  priority: number;
  is_restorable: boolean;
  source_app: string;
  is_system: boolean;
  updated_at?: string | null;
}

export interface DashboardData {
  latest_backup: BackupArtifact | null;
  total_backups: number;
  total_size_bytes: number;
  schedule: {
    frequency: string;
    hour: number;
    minute: number;
    enabled: boolean;
    kind: string;
    max_artifacts: number;
    auto_delete_old: boolean;
    last_run_at: string | null;
    last_run_status?: string | null;
    last_run_message?: string | null;
    last_run_artifact?: BackupArtifact | null;
  };
  last_success: { action: string | null; step: string | null; created_at: string | null };
  last_error: {
    action: string | null;
    step: string | null;
    error_message: string | null;
    created_at: string | null;
  };
  resources: { total: number; active: number };
  config: {
    local_root: string;
    encryption_key_available: boolean;
    key_fingerprint: string | null;
    format_version: string;
  };
}

export interface ScheduleData {
  frequency: string;
  hour: number;
  minute: number;
  enabled: boolean;
  kind: string;
  resource_codes: string[];
  max_artifacts: number;
  auto_delete_old: boolean;
  encrypt: boolean;
  last_run_at: string | null;
  last_run_status?: string | null;
  last_run_message?: string | null;
  last_run_artifact?: BackupArtifact | null;
}

export interface BackupSettingsData {
  encryption_enabled: boolean;
  default_encrypt: boolean;
  default_compress: boolean;
  notify_enabled: boolean;
  notify_emails: string;
  notify_on_success: boolean;
  notify_on_failure: boolean;
  notes: string;
  encryption_key_available: boolean;
  key_fingerprint: string | null;
  local_root: string;
  format_version: string;
  legacy_format_supported: boolean;
}

export interface BackupJob {
  id: number;
  artifact_id: number | null;
  action: string;
  status: string;
  phase: string;
  progress: number;
  message: string;
  result: Record<string, unknown>;
  error_message: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface OperationLog {
  id: number;
  action: string;
  step: string;
  success: boolean;
  error_message: string;
  metadata: Record<string, unknown>;
  duration_ms: number | null;
  artifact_id: number | null;
  job_id: number | null;
  user_id: number | null;
  ip_address: string | null;
  created_at: string | null;
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

export function fetchDashboard(): Promise<ApiResponse<DashboardData>> {
  return apiGet<DashboardData>(`${BASE}/dashboard/`);
}

export function fetchResources(params?: Record<string, string | number>): Promise<
  ApiResponse<{
    results: BackupResource[];
    count: number;
    page: number;
    page_size: number;
    resource_types: Array<{ value: string; label: string }>;
  }>
> {
  const qs = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => qs.set(k, String(v)));
  const q = qs.toString();
  return apiGet(listUrl('resources', q));
}

export function createResource(data: Partial<BackupResource>): Promise<ApiResponse<{ resource: BackupResource }>> {
  return apiPost(`${BASE}/resources/`, data);
}

export function updateResource(
  id: number,
  data: Partial<BackupResource>,
): Promise<ApiResponse<{ resource: BackupResource }>> {
  return apiPost(`${BASE}/resources/${id}/`, data); // PATCH via POST body handled; use fetch patch
}

export async function patchResource(
  id: number,
  data: Partial<BackupResource>,
): Promise<ApiResponse<{ resource: BackupResource }>> {
  return apiPatch(`${BASE}/resources/${id}/`, data);
}

export function deactivateResource(id: number): Promise<ApiResponse<{ resource: BackupResource }>> {
  return apiPost(`${BASE}/resources/${id}/deactivate/`, {});
}

export function syncResources(deactivateMissing = false): Promise<ApiResponse<Record<string, number>>> {
  return apiPost(`${BASE}/resources/sync/`, { deactivate_missing: deactivateMissing });
}

export function fetchBackups(params?: Record<string, string | number>): Promise<
  ApiResponse<{ results: BackupArtifact[]; count: number; page: number; page_size: number }>
> {
  const qs = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => qs.set(k, String(v)));
  const q = qs.toString();
  return apiGet(listUrl('backups', q));
}

export function createBackup(payload: {
  kind: string;
  resource_codes?: string[];
  encrypt?: boolean;
  compress?: boolean;
  // Opsiyonel çoklu kurum kapsamı (yalnızca tablo-seviye kaynaklar yedeklenir).
  kurum_id?: number;
  sube_id?: number;
  egitim_yili_id?: number;
}): Promise<ApiResponse<{ artifact: BackupArtifact; job: BackupJob }>> {
  return apiPost(`${BASE}/backups/`, payload);
}

export function previewBackup(id: number): Promise<ApiResponse<Record<string, unknown>>> {
  return apiGet(`${BASE}/backups/${id}/preview/`);
}

export function verifyBackup(id: number): Promise<ApiResponse<Record<string, unknown>>> {
  return apiPost(`${BASE}/backups/${id}/verify/`, {});
}

export function analyzeBackup(id: number): Promise<ApiResponse<Record<string, unknown>>> {
  return apiPost(`${BASE}/backups/${id}/analyze/`, {});
}

export function dryRunBackup(id: number): Promise<ApiResponse<Record<string, unknown>>> {
  return apiPost(`${BASE}/backups/${id}/dry-run/`, {});
}

export function restoreBackup(id: number, confirm: string): Promise<ApiResponse<Record<string, unknown>>> {
  return apiPost(`${BASE}/backups/${id}/restore/`, { confirm });
}

export function deleteBackup(id: number): Promise<ApiResponse<{ deleted: boolean }>> {
  return apiDelete(`${BASE}/backups/${id}/delete/`);
}

export function fetchSchedule(): Promise<ApiResponse<ScheduleData>> {
  return apiGet(`${BASE}/schedule/`);
}

export function updateSchedule(data: Partial<ScheduleData>): Promise<ApiResponse<{ updated: boolean; schedule?: ScheduleData }>> {
  return apiPut(`${BASE}/schedule/`, data);
}

export function runScheduleNow(): Promise<ApiResponse<{ artifact: BackupArtifact; job: BackupJob; schedule?: ScheduleData }>> {
  return apiPost(`${BASE}/schedule/run/`, {});
}

export function uploadBackup(file: File): Promise<ApiResponse<{ artifact: BackupArtifact; import: Record<string, unknown> }>> {
  const form = new FormData();
  form.append('file', file);
  return apiPostForm(`${BASE}/backups/upload/`, form);
}

export function fetchSettings(): Promise<ApiResponse<BackupSettingsData>> {
  return apiGet(`${BASE}/settings/`);
}

export function updateSettings(data: Partial<BackupSettingsData>): Promise<ApiResponse<{ updated: boolean }>> {
  return apiPut(`${BASE}/settings/`, data);
}

export function fetchLogs(params?: Record<string, string | number>): Promise<
  ApiResponse<{ results: OperationLog[]; count: number }>
> {
  const qs = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => qs.set(k, String(v)));
  const q = qs.toString();
  return apiGet(listUrl('logs', q));
}

export function fetchJob(id: number): Promise<ApiResponse<{ job: BackupJob }>> {
  return apiGet(`${BASE}/jobs/${id}/`);
}

export async function downloadBackup(id: number, fallbackFilename: string): Promise<void> {
  const { describeHttpStatus, extractHtmlErrorMessage, extractApiError } = await import('./api');
  const url = resolveApiUrl(`${BASE}/backups/${id}/download/`);
  const res = await fetch(url, { method: 'GET', credentials: 'include' });
  if (!res.ok) {
    const contentType = res.headers.get('content-type') || '';
    let errMsg = `Yedek indirilemedi. ${describeHttpStatus(res.status)}`;
    try {
      if (contentType.includes('application/json')) {
        const data = await res.json();
        errMsg = extractApiError(data, res, errMsg);
      } else {
        const text = await res.text();
        if (text.includes('<html') || text.includes('<!DOCTYPE')) {
          errMsg = extractHtmlErrorMessage(text, res.status);
        } else if (text.trim()) {
          errMsg = `${describeHttpStatus(res.status)} Ayrıntı: ${text.trim().slice(0, 200)}`;
        }
      }
    } catch {
      /* keep errMsg */
    }
    throw new Error(errMsg);
  }
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') || '';
  const match = /filename="?([^"]+)"?/.exec(cd);
  const filename = match?.[1] || fallbackFilename;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}
