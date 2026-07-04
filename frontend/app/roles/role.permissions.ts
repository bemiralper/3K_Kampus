/**
 * Rol Yönetimi Modülü - Yetki Tanımları
 * 
 * İleride genişletilebilir yetki yapısı.
 * Bu dosya, frontend'de yetki kontrolü için kullanılır.
 */

import { SYSTEM_ROLE_CODES } from './role.constants';

/**
 * Yetki kontrolü için kullanılan fonksiyon tipleri
 */
export type PermissionCheckFn = (userPermissions: string[]) => boolean;

/**
 * Modül erişim yetkileri
 */
export const ModulePermissions = {
  // Öğrenci Modülü
  OGRENCI: {
    READ: 'ogrenci.read',
    WRITE: 'ogrenci.write',
    DELETE: 'ogrenci.delete',
    MANAGE: 'ogrenci.manage',
  },
  
  // Personel Modülü
  PERSONEL: {
    READ: 'personel.read',
    WRITE: 'personel.write',
    DELETE: 'personel.delete',
    MANAGE: 'personel.manage',
  },
  
  // Finans Modülü
  FINANS: {
    READ: 'finans.read',
    WRITE: 'finans.write',
    DELETE: 'finans.delete',
    MANAGE: 'finans.manage',
  },
  
  // Kurum Modülü
  KURUM: {
    READ: 'kurum.read',
    WRITE: 'kurum.write',
    MANAGE: 'kurum.manage',
  },
  
  // Şube Modülü
  SUBE: {
    READ: 'sube.read',
    WRITE: 'sube.write',
    MANAGE: 'sube.manage',
  },
  
  // Eğitim Tanımları
  EGITIM_TANIMLARI: {
    READ: 'egitim_tanimlari.read',
    WRITE: 'egitim_tanimlari.write',
    MANAGE: 'egitim_tanimlari.manage',
  },
  
  // Eğitim Paketleri
  EGITIM_PAKETLERI: {
    READ: 'egitim_paketleri.read',
    WRITE: 'egitim_paketleri.write',
    MANAGE: 'egitim_paketleri.manage',
  },
  
  // Sınıf Modülü
  SINIF: {
    READ: 'sinif.read',
    WRITE: 'sinif.write',
    MANAGE: 'sinif.manage',
  },
  
  // Rapor Modülü
  RAPOR: {
    READ: 'rapor.read',
    EXPORT: 'rapor.export',
    MANAGE: 'rapor.manage',
  },
  
  // Rol Yönetimi
  ROLLER: {
    READ: 'roller.read',
    WRITE: 'roller.write',
    MANAGE: 'roller.manage',
  },
  
  // Sistem
  SISTEM: {
    ADMIN: 'sistem.admin',
    SETTINGS: 'sistem.settings',
  },
} as const;

/**
 * Yetki kontrol fonksiyonları
 */
export const PermissionChecks = {
  /**
   * Kullanıcının belirli bir yetkiye sahip olup olmadığını kontrol eder
   */
  hasPermission: (userPermissions: string[], permission: string): boolean => {
    // sistem.admin her şeyi yapabilir
    if (userPermissions.includes(ModulePermissions.SISTEM.ADMIN)) {
      return true;
    }
    return userPermissions.includes(permission);
  },
  
  /**
   * Kullanıcının belirtilen yetkilerden herhangi birine sahip olup olmadığını kontrol eder
   */
  hasAnyPermission: (userPermissions: string[], permissions: string[]): boolean => {
    if (userPermissions.includes(ModulePermissions.SISTEM.ADMIN)) {
      return true;
    }
    return permissions.some(perm => userPermissions.includes(perm));
  },
  
  /**
   * Kullanıcının belirtilen tüm yetkilere sahip olup olmadığını kontrol eder
   */
  hasAllPermissions: (userPermissions: string[], permissions: string[]): boolean => {
    if (userPermissions.includes(ModulePermissions.SISTEM.ADMIN)) {
      return true;
    }
    return permissions.every(perm => userPermissions.includes(perm));
  },
  
  /**
   * Kullanıcının bir modülü okuma yetkisi olup olmadığını kontrol eder
   */
  canRead: (userPermissions: string[], module: string): boolean => {
    return PermissionChecks.hasAnyPermission(userPermissions, [
      `${module}.read`,
      `${module}.write`,
      `${module}.manage`,
      `${module}.admin`,
    ]);
  },
  
  /**
   * Kullanıcının bir modülü yazma yetkisi olup olmadığını kontrol eder
   */
  canWrite: (userPermissions: string[], module: string): boolean => {
    return PermissionChecks.hasAnyPermission(userPermissions, [
      `${module}.write`,
      `${module}.manage`,
      `${module}.admin`,
    ]);
  },
  
  /**
   * Kullanıcının bir modülü silme yetkisi olup olmadığını kontrol eder
   */
  canDelete: (userPermissions: string[], module: string): boolean => {
    return PermissionChecks.hasAnyPermission(userPermissions, [
      `${module}.delete`,
      `${module}.manage`,
      `${module}.admin`,
    ]);
  },
  
  /**
   * Kullanıcının bir modülü yönetme yetkisi olup olmadığını kontrol eder
   */
  canManage: (userPermissions: string[], module: string): boolean => {
    return PermissionChecks.hasAnyPermission(userPermissions, [
      `${module}.manage`,
      `${module}.admin`,
    ]);
  },
};

/**
 * Rol tabanlı erişim kontrolü
 */
export const RoleBasedAccess = {
  /**
   * Süper admin mi?
   */
  isSuperAdmin: (roleCode: string): boolean => {
    return roleCode === SYSTEM_ROLE_CODES.SUPER_ADMIN;
  },
  
  /**
   * Kurum yöneticisi mi?
   */
  isKurumYoneticisi: (roleCode: string): boolean => {
    return roleCode === SYSTEM_ROLE_CODES.KURUM_YONETICISI;
  },
  
  /**
   * Yönetici seviyesinde mi? (super_admin, kurum_yoneticisi, sube_yoneticisi)
   */
  isManager: (roleCode: string): boolean => {
    return [
      SYSTEM_ROLE_CODES.SUPER_ADMIN,
      SYSTEM_ROLE_CODES.KURUM_YONETICISI,
      SYSTEM_ROLE_CODES.SUBE_YONETICISI,
    ].includes(roleCode as any);
  },
  
  /**
   * Personel mi? (öğrenci dışında herkes)
   */
  isStaff: (roleCode: string): boolean => {
    return roleCode !== SYSTEM_ROLE_CODES.OGRENCI;
  },
};

/**
 * Sidebar görünürlük kontrolü
 * Her menü öğesi için hangi yetkilerin gerekli olduğunu tanımlar
 */
export const SidebarPermissions = {
  DASHBOARD: [], // Herkes görebilir
  OGRENCILER: [ModulePermissions.OGRENCI.READ],
  PERSONEL: [ModulePermissions.PERSONEL.READ],
  FINANS: [ModulePermissions.FINANS.READ],
  KURUM_YONETIMI: [ModulePermissions.KURUM.READ],
  EGITIM_TANIMLARI: [ModulePermissions.EGITIM_TANIMLARI.READ],
  EGITIM_PAKETLERI: [ModulePermissions.EGITIM_PAKETLERI.READ],
  RAPORLAR: [ModulePermissions.RAPOR.READ],
  ROL_YONETIMI: [ModulePermissions.ROLLER.READ],
  SISTEM_AYARLARI: [ModulePermissions.SISTEM.SETTINGS],
};
