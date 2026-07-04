/**
 * Rol Yönetimi Modülü - Rol Düzenleme Drawer
 */
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Role, Permission, ModulePermissions, RoleUpdateRequest } from './role.types';
import { MODULE_NAMES, PERMISSION_TYPE_NAMES } from './role.constants';
import RoleService from './role.service';
import styles from './styles/role-drawer.module.css';

interface RoleEditDrawerProps {
  isOpen: boolean;
  role: Role | null;
  mode: 'edit' | 'view';
  onClose: () => void;
  onSuccess: () => void;
}

export default function RoleEditDrawer({ isOpen, role, mode, onClose, onSuccess }: RoleEditDrawerProps) {
  const [formData, setFormData] = useState<RoleUpdateRequest>({});
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [modulePermissions, setModulePermissions] = useState<ModulePermissions>({});
  const [rolePermissions, setRolePermissions] = useState<Permission[]>([]);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!role) return;
    
    try {
      setLoading(true);
      
      // Paralel olarak yetkileri ve rol detayını yükle
      const [permResponse, roleResponse] = await Promise.all([
        RoleService.listPermissions(),
        RoleService.getRole(role.id),
      ]);
      
      if (permResponse.success) {
        setPermissions(permResponse.permissions);
        setModulePermissions(permResponse.modules);
      }
      
      if (roleResponse.success) {
        const roleData = roleResponse.role;
        setRolePermissions(roleData.permissions || []);
        setFormData({
          code: roleData.code,
          name: roleData.name,
          description: roleData.description,
          level: roleData.level,
          is_active: roleData.is_active,
          permission_ids: roleData.permissions?.map(p => p.id) || [],
        });
      }
      
      setError(null);
    } catch (err) {
      console.error('Veriler yüklenemedi:', err);
      setError('Veriler yüklenirken bir hata oluştu');
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    if (isOpen && role) {
      loadData();
    }
  }, [isOpen, role, loadData]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseInt(value) || 0 : value,
    }));
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: checked,
    }));
  };

  const toggleModule = (module: string) => {
    setExpandedModules(prev => {
      const newSet = new Set(prev);
      if (newSet.has(module)) {
        newSet.delete(module);
      } else {
        newSet.add(module);
      }
      return newSet;
    });
  };

  const togglePermission = (permissionId: number) => {
    if (mode === 'view') return;
    
    setFormData(prev => {
      const currentIds = prev.permission_ids || [];
      const newIds = currentIds.includes(permissionId)
        ? currentIds.filter(id => id !== permissionId)
        : [...currentIds, permissionId];
      return { ...prev, permission_ids: newIds };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!role || mode === 'view') return;
    
    setError(null);

    if (!formData.name?.trim()) {
      setError('Rol adı gereklidir');
      return;
    }

    try {
      setSubmitting(true);
      const response = await RoleService.updateRole(role.id, formData);
      if (response.success) {
        onSuccess();
        onClose();
      } else {
        setError(response.error || 'Rol güncellenirken bir hata oluştu');
      }
    } catch (err: any) {
      setError(err.message || 'Bir hata oluştu');
    } finally {
      setSubmitting(false);
    }
  };

  const getPermissionTypeClass = (type: string) => {
    switch (type) {
      case 'read': return styles.permissionTypeRead;
      case 'write': return styles.permissionTypeWrite;
      case 'delete': return styles.permissionTypeDelete;
      case 'manage': return styles.permissionTypeManage;
      case 'admin': return styles.permissionTypeAdmin;
      default: return '';
    }
  };

  if (!isOpen || !role) return null;

  const isViewMode = mode === 'view';
  const isSystemRole = role.is_system_role;

  return (
    <>
      <div className={styles.drawerOverlay} onClick={onClose} />
      <div className={styles.drawer}>
        <div className={styles.drawerHeader}>
          <h2 className={styles.drawerTitle}>
            <svg className={styles.drawerTitleIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {isViewMode ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              )}
            </svg>
            {isViewMode ? 'Rol Detayı' : 'Rol Düzenle'}
          </h2>
          <button className={styles.closeButton} onClick={onClose}>
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className={styles.drawerBody}>
          {loading ? (
            <div className={styles.loading} style={{ padding: '48px' }}>
              <div className={styles.spinner}></div>
              <span>Yükleniyor...</span>
            </div>
          ) : (
            <>
              {error && (
                <div className={styles.alertWarning}>
                  <svg className={styles.alertIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span className={styles.alertText}>{error}</span>
                </div>
              )}

              {isSystemRole && !isViewMode && (
                <div className={styles.alertWarning}>
                  <svg className={styles.alertIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span className={styles.alertText}>
                    Bu bir sistem rolüdür. Rol kodu değiştirilemez.
                  </span>
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Rol Kodu</label>
                    {isViewMode ? (
                      <div className={styles.viewValue} style={{ fontFamily: 'monospace' }}>
                        {formData.code}
                      </div>
                    ) : (
                      <input
                        type="text"
                        name="code"
                        value={formData.code || ''}
                        onChange={handleInputChange}
                        className={styles.formInput}
                        disabled={isSystemRole}
                      />
                    )}
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      Rol Adı{!isViewMode && <span className={styles.formRequired}>*</span>}
                    </label>
                    {isViewMode ? (
                      <div className={styles.viewValue}>{formData.name}</div>
                    ) : (
                      <input
                        type="text"
                        name="name"
                        value={formData.name || ''}
                        onChange={handleInputChange}
                        className={styles.formInput}
                      />
                    )}
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Açıklama</label>
                  {isViewMode ? (
                    <div className={styles.viewValue}>
                      {formData.description || '-'}
                    </div>
                  ) : (
                    <textarea
                      name="description"
                      value={formData.description || ''}
                      onChange={handleInputChange}
                      className={styles.formTextarea}
                    />
                  )}
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Seviye</label>
                    {isViewMode ? (
                      <div className={styles.viewValue}>{formData.level}</div>
                    ) : (
                      <input
                        type="number"
                        name="level"
                        value={formData.level || 100}
                        onChange={handleInputChange}
                        className={styles.formInput}
                        min={0}
                        max={1000}
                      />
                    )}
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Durum</label>
                    {isViewMode ? (
                      <div className={styles.viewBadges}>
                        <span className={formData.is_active ? styles.badgeActive : styles.badgeInactive}>
                          {formData.is_active ? 'Aktif' : 'Pasif'}
                        </span>
                        <span className={isSystemRole ? styles.badgeSystem : styles.badgeCustom}>
                          {isSystemRole ? '🔒 Sistem Rolü' : '✨ Özel Rol'}
                        </span>
                      </div>
                    ) : (
                      <div className={styles.checkboxGroup} style={{ marginBottom: 0, marginTop: 6 }}>
                        <input
                          type="checkbox"
                          name="is_active"
                          checked={formData.is_active || false}
                          onChange={handleCheckboxChange}
                          className={styles.checkbox}
                          id="is_active_edit"
                        />
                        <label htmlFor="is_active_edit" className={styles.checkboxLabel}>
                          Aktif
                        </label>
                      </div>
                    )}
                  </div>
                </div>

                <div className={styles.permissionsSection}>
                  <h3 className={styles.sectionTitle}>
                    <svg className={styles.sectionIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    Yetkiler ({formData.permission_ids?.length || 0})
                  </h3>

                  {Object.entries(modulePermissions).map(([module, perms]) => {
                    const selectedCount = perms.filter(p => formData.permission_ids?.includes(p.id)).length;
                    
                    return (
                      <div key={module} className={styles.moduleGroup}>
                        <div 
                          className={styles.moduleHeader}
                          onClick={() => toggleModule(module)}
                        >
                          <span className={styles.moduleTitle}>
                            {MODULE_NAMES[module] || module}
                            <span style={{ 
                              color: selectedCount > 0 ? '#6366f1' : '#64748b', 
                              fontWeight: selectedCount > 0 ? 600 : 400 
                            }}>
                              ({selectedCount}/{perms.length})
                            </span>
                          </span>
                          <svg 
                            className={`${styles.moduleToggle} ${expandedModules.has(module) ? styles.expanded : ''}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                        {expandedModules.has(module) && (
                          <div className={styles.moduleBody}>
                            {perms.map((perm) => (
                              <div
                                key={perm.id}
                                className={`${styles.permissionItem} ${formData.permission_ids?.includes(perm.id) ? styles.selected : ''}`}
                                onClick={() => togglePermission(perm.id)}
                                style={{ cursor: isViewMode ? 'default' : 'pointer' }}
                              >
                                <input
                                  type="checkbox"
                                  checked={formData.permission_ids?.includes(perm.id) || false}
                                  onChange={() => togglePermission(perm.id)}
                                  className={styles.permissionCheckbox}
                                  onClick={(e) => e.stopPropagation()}
                                  disabled={isViewMode}
                                />
                                <div className={styles.permissionInfo}>
                                  <span className={styles.permissionName}>{perm.name}</span>
                                  <span className={styles.permissionCode}>{perm.code}</span>
                                </div>
                                <span className={`${styles.permissionTypeBadge} ${getPermissionTypeClass(perm.permission_type)}`}>
                                  {PERMISSION_TYPE_NAMES[perm.permission_type] || perm.permission_type}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </form>
            </>
          )}
        </div>

        <div className={styles.drawerFooter}>
          <button type="button" className={styles.btnCancel} onClick={onClose}>
            {isViewMode ? 'Kapat' : 'İptal'}
          </button>
          {!isViewMode && (
            <button 
              type="submit" 
              className={styles.btnSubmit} 
              onClick={handleSubmit}
              disabled={submitting || loading}
            >
              {submitting ? (
                <>
                  <span className={styles.spinner} style={{ width: 16, height: 16, borderWidth: 2 }}></span>
                  Kaydediliyor...
                </>
              ) : (
                <>
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Güncelle
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
