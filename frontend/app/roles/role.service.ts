/**
 * Rol Yönetimi Modülü - API Servis
 * 
 * Backend API'leri ile iletişim
 */

import {
  Role,
  RoleCreateRequest,
  RoleUpdateRequest,
  RoleListResponse,
  RoleDetailResponse,
  PermissionListResponse,
  RoleStatsResponse,
  ApiResponse,
} from './role.types';
import { ROLE_API_ENDPOINTS } from './role.constants';
import { apiFetch, type FetchOptions } from '@/lib/api';

async function fetchApi<T>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<T> {
  const response = await apiFetch<T>(endpoint, options);
  if (!response.success) {
    throw new Error(response.error || 'Bir hata oluştu');
  }
  return response as T;
}

/**
 * Rol Servis Sınıfı
 */
export const RoleService = {
  /**
   * Tüm rolleri listele
   */
  async listRoles(params?: {
    is_active?: boolean;
    is_system_role?: boolean;
    silindi_mi?: boolean;
    search?: string;
  }): Promise<RoleListResponse> {
    const queryParams = new URLSearchParams();
    
    if (params?.is_active !== undefined) {
      queryParams.append('is_active', String(params.is_active));
    }
    if (params?.is_system_role !== undefined) {
      queryParams.append('is_system_role', String(params.is_system_role));
    }
    if (params?.silindi_mi !== undefined) {
      queryParams.append('silindi_mi', String(params.silindi_mi));
    }
    if (params?.search) {
      queryParams.append('search', params.search);
    }
    
    const queryString = queryParams.toString();
    const endpoint = queryString 
      ? `${ROLE_API_ENDPOINTS.LIST}?${queryString}`
      : ROLE_API_ENDPOINTS.LIST;
    
    return fetchApi<RoleListResponse>(endpoint);
  },
  
  /**
   * Rol detayını getir
   */
  async getRole(id: number): Promise<RoleDetailResponse> {
    return fetchApi<RoleDetailResponse>(ROLE_API_ENDPOINTS.DETAIL(id));
  },
  
  /**
   * Yeni rol oluştur
   */
  async createRole(data: RoleCreateRequest): Promise<ApiResponse & { role?: Role }> {
    return fetchApi<ApiResponse & { role?: Role }>(ROLE_API_ENDPOINTS.CREATE, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  
  /**
   * Rol güncelle
   */
  async updateRole(id: number, data: RoleUpdateRequest): Promise<ApiResponse> {
    return fetchApi<ApiResponse>(ROLE_API_ENDPOINTS.DETAIL(id), {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
  
  /**
   * Rol sil
   */
  async deleteRole(id: number): Promise<ApiResponse> {
    return fetchApi<ApiResponse>(ROLE_API_ENDPOINTS.DETAIL(id), {
      method: 'DELETE',
    });
  },

  /**
   * Silinmiş rolü geri getir
   */
  async restoreRole(id: number): Promise<ApiResponse & { role?: Role }> {
    return fetchApi<ApiResponse & { role?: Role }>(ROLE_API_ENDPOINTS.RESTORE(id), {
      method: 'POST',
    });
  },
  
  /**
   * Rol istatistiklerini getir
   */
  async getStats(): Promise<RoleStatsResponse> {
    return fetchApi<RoleStatsResponse>(ROLE_API_ENDPOINTS.STATS);
  },
  
  /**
   * Tüm yetkileri listele
   */
  async listPermissions(params?: {
    module?: string;
    permission_type?: string;
  }): Promise<PermissionListResponse> {
    const queryParams = new URLSearchParams();
    
    if (params?.module) {
      queryParams.append('module', params.module);
    }
    if (params?.permission_type) {
      queryParams.append('permission_type', params.permission_type);
    }
    
    const queryString = queryParams.toString();
    const endpoint = queryString 
      ? `${ROLE_API_ENDPOINTS.PERMISSIONS}?${queryString}`
      : ROLE_API_ENDPOINTS.PERMISSIONS;
    
    return fetchApi<PermissionListResponse>(endpoint);
  },
};

export default RoleService;
