import { apiGet, apiPost, apiPut, apiDelete, apiPostForm, resolveApiUrl, type ApiResponse } from './api';

const BASE = '/yedekleme/api';

export interface BackupArtifact {
  id: number;
  filename: string;
  size_bytes: number;
  checksum: string;
  status: string;
  trigger: string;
  components: Record<string, unknown>;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  created_by: number | null;
  error_message: string;
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
    include_logs: boolean;
    last_run_at: string | null;
  };
  config: {
    local_root: string;
    remote_provider: string;
    retention: Record<string, number | null>;
    upload_max_bytes?: number;
  };
}

export interface ScheduleData {
  frequency: string;
  hour: number;
  minute: number;
  enabled: boolean;
  include_logs: boolean;
  last_run_at: string | null;
}

export function fetchDashboard(): Promise<ApiResponse<DashboardData>> {
  return apiGet<DashboardData>(`${BASE}/dashboard/`);
}

export function fetchArtifacts(): Promise<ApiResponse<{ results: BackupArtifact[] }>> {
  return apiGet<{ results: BackupArtifact[] }>(`${BASE}/artifacts/`);
}

export function createBackup(includeLogs = false): Promise<ApiResponse<{ artifact: BackupArtifact }>> {
  return apiPost<{ artifact: BackupArtifact }>(`${BASE}/artifacts/create/`, { include_logs: includeLogs });
}

export function uploadBackup(file: File): Promise<ApiResponse<{ artifact: BackupArtifact }>> {
  const form = new FormData();
  form.append('file', file);
  return apiPostForm<{ artifact: BackupArtifact }>(`${BASE}/artifacts/upload/`, form);
}

export function validateBackup(id: number): Promise<ApiResponse<{ valid: boolean; manifest?: Record<string, unknown> }>> {
  return apiPost(`${BASE}/artifacts/${id}/validate/`, {});
}

export function restoreBackup(id: number, confirm: string): Promise<ApiResponse<{ restored: boolean }>> {
  return apiPost(`${BASE}/artifacts/${id}/restore/`, { confirm });
}

export function deleteBackup(id: number): Promise<ApiResponse<{ deleted: boolean }>> {
  return apiDelete(`${BASE}/artifacts/${id}/delete/`);
}

export function fetchSchedule(): Promise<ApiResponse<ScheduleData>> {
  return apiGet<ScheduleData>(`${BASE}/schedule/`);
}

export function updateSchedule(data: Partial<ScheduleData>): Promise<ApiResponse<{ updated: boolean }>> {
  return apiPut(`${BASE}/schedule/`, data);
}

export function fetchOperationLogs(): Promise<ApiResponse<{ results: Array<Record<string, unknown>> }>> {
  return apiGet(`${BASE}/logs/`);
}

export async function downloadBackup(id: number, fallbackFilename: string): Promise<void> {
  const url = resolveApiUrl(`${BASE}/artifacts/${id}/download/`);
  const res = await fetch(url, { method: 'GET', credentials: 'include' });
  if (!res.ok) {
    let errMsg = 'Yedek indirilemedi.';
    try {
      const data = await res.json();
      errMsg = (data.error as string) || errMsg;
    } catch {
      /* binary veya boş yanıt */
    }
    throw new Error(errMsg);
  }
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename[^;=\n]*=(['"]?)([^'"\n;]*)\1/);
  const filename = match?.[2] || fallbackFilename;
  const blob = await res.blob();
  if (blob.size === 0) {
    throw new Error('İndirilen dosya boş.');
  }
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
