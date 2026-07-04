/**
 * Rol Yönetimi Modülü - TypeScript Tip Tanımları
 * 
 * Bu modül, birimlerden tamamen bağımsızdır.
 * Birim ≠ Rol
 * - Birim: Organizasyonel görev alanı (nerede çalışır)
 * - Rol: Sistem yetkisi (ne yapabilir)
 */

/**
 * Yetki türleri
 */
export type PermissionType = 'read' | 'write' | 'delete' | 'manage' | 'admin';

/**
 * Yetki (Permission) modeli
 */
export interface Permission {
  id: number;
  code: string;
  name: string;
  description: string;
  module: string;
  permission_type: PermissionType;
}

/**
 * Modül bazlı yetkiler
 */
export interface ModulePermissions {
  [module: string]: Permission[];
}

/**
 * Rol (Role) modeli
 */
export interface Role {
  id: number;
  code: string;
  name: string;
  description: string;
  level: number;
  is_system_role: boolean;
  is_active: boolean;
  silindi_mi?: boolean;
  silinme_tarihi?: string | null;
  permission_count?: number;
  permissions?: Permission[];
  created_at: string;
  updated_at: string;
}

/**
 * Rol oluşturma isteği
 */
export interface RoleCreateRequest {
  code: string;
  name: string;
  description?: string;
  level?: number;
  is_active?: boolean;
  permission_ids?: number[];
}

/**
 * Rol güncelleme isteği
 */
export interface RoleUpdateRequest {
  code?: string;
  name?: string;
  description?: string;
  level?: number;
  is_active?: boolean;
  permission_ids?: number[];
}

/**
 * Rol listesi API yanıtı
 */
export interface RoleListResponse {
  success: boolean;
  roles: Role[];
  total: number;
  error?: string;
}

/**
 * Rol detay API yanıtı
 */
export interface RoleDetailResponse {
  success: boolean;
  role: Role;
  error?: string;
}

/**
 * Yetki listesi API yanıtı
 */
export interface PermissionListResponse {
  success: boolean;
  permissions: Permission[];
  modules: ModulePermissions;
  total: number;
  error?: string;
}

/**
 * Rol istatistikleri
 */
export interface RoleStats {
  total_roles: number;
  active_roles: number;
  system_roles: number;
  custom_roles: number;
  deleted_roles?: number;
  total_permissions: number;
  total_modules: number;
}

/**
 * İstatistik API yanıtı
 */
export interface RoleStatsResponse {
  success: boolean;
  stats: RoleStats;
  error?: string;
}

/**
 * Genel API yanıtı
 */
export interface ApiResponse {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * Drawer durumu
 */
export interface DrawerState {
  isOpen: boolean;
  mode: 'create' | 'edit' | 'view';
  selectedRole: Role | null;
}
