import { apiGet, apiPost, type ApiResponse } from './api';

const BASE = '/kurum-yonetimi/api/demo';

export type DemoPreset = 'full' | 'dashboard' | 'students' | 'finance';

export interface DemoEnvironment {
  environment: string;
  label: string;
  db_name: string;
  db_host: string;
  demo_allowed: boolean;
  operational_reset_allowed: boolean;
  is_demo_environment: boolean;
  is_production: boolean;
  warnings: string[];
  workflow_hint: string;
}

export interface DemoStatus {
  students: number;
  personnel: number;
  classes: number;
  contracts: number;
  tahsilat: number;
  gelir: number;
  gider: number;
  has_demo_students: boolean;
  kurum: { id: number; ad: string };
  sube: { id: number; ad: string };
  environment?: DemoEnvironment;
  presets: Record<string, Record<string, unknown>>;
  isolation: {
    separate_database: boolean;
    demo_db_name: string;
    production_db_name: string;
    description: string;
  };
}

export interface DemoSeedResult {
  created?: boolean;
  skipped?: boolean;
  reason?: string;
  preset: string;
  students_active?: number;
  students_mezun?: number;
  teachers?: number;
  classes?: number;
  contracts?: number;
  status?: Partial<DemoStatus>;
}

export function fetchDemoStatus(): Promise<ApiResponse<DemoStatus>> {
  return apiGet<DemoStatus>(`${BASE}/status/`);
}

export function seedDemoData(body: {
  preset: DemoPreset;
  purge_first?: boolean;
  students?: number;
  mezun?: number;
  teachers?: number;
  classes?: number;
}): Promise<ApiResponse<DemoSeedResult>> {
  return apiPost<DemoSeedResult>(`${BASE}/seed/`, body);
}

export function purgeDemoData(confirm = 'PURGE-DEMO'): Promise<ApiResponse<{ deleted: Record<string, number>; status: DemoStatus }>> {
  return apiPost(`${BASE}/purge/`, { confirm });
}

export function resetOperationalData(body: {
  confirm: 'SIFIRLA';
  create_admin?: boolean;
}): Promise<ApiResponse<{
  message: string;
  log?: string;
  admin_created?: boolean;
  login_hint?: { username: string; password: string } | null;
}>> {
  return apiPost(`${BASE}/reset/`, { create_admin: true, ...body });
}
