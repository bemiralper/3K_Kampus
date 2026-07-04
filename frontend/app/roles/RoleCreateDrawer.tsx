/**
 * Rol Yönetimi Modülü - Rol Oluşturma Drawer
 */
'use client';

import React, { useState, useEffect } from 'react';
import { Permission, ModulePermissions, RoleCreateRequest } from './role.types';
import { MODULE_NAMES, PERMISSION_TYPE_NAMES, DEFAULT_ROLE_LEVEL } from './role.constants';
import RoleService from './role.service';
import styles from './styles/role-drawer.module.css';

interface RoleCreateDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function RoleCreateDrawer({ isOpen, onClose, onSuccess }: RoleCreateDrawerProps) {
  const [formData, setFormData] = useState<RoleCreateRequest>({
    code: '',
    name: '',
    description: '',
    level: DEFAULT_ROLE_LEVEL,
    is_active: true,
    permission_ids: [],
  });
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [modulePermissions, setModulePermissions] = useState<ModulePermissions>({});
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadPermissions();
      // Form'u sıfırla
      setFormData({
        code: '',
        name: '',
        description: '',
        level: DEFAULT_ROLE_LEVEL,
        is_active: true,
        permission_ids: [],
      });
      setError(null);
    }
  }, [isOpen]);

  const loadPermissions = async () => {
    try {
      setLoading(true);
      const response = await RoleService.listPermissions();
      if (response.success) {
        setPermissions(response.permissions);
        setModulePermissions(response.modules);
      }
    } catch (err) {
      console.error('Yetkiler yüklenemedi:', err);
    } finally {
      setLoading(false);
    }
  };

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
    setFormData(prev => {
      const newIds = prev.permission_ids?.includes(permissionId)
        ? prev.permission_ids.filter(id => id !== permissionId)
        : [...(prev.permission_ids || []), permissionId];
      return { ...prev, permission_ids: newIds };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.code?.trim()) {
      setError('Rol kodu gereklidir');
      return;
    }
    if (!formData.name?.trim()) {
      setError('Rol adı gereklidir');
      return;
    }

    try {
      setSubmitting(true);
      const response = await RoleService.createRole(formData);
      if (response.success) {
        onSuccess();
        onClose();
      } else {
        setError(response.error || 'Rol oluşturulurken bir hata oluştu');
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

  if (!isOpen) return null;

  return (
    <>
      <div className={styles.drawerOverlay} onClick={onClose} />
      <div className={styles.drawer}>
        <div className={styles.drawerHeader}>
          <h2 className={styles.drawerTitle}>
            <svg className={styles.drawerTitleIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Yeni Rol Oluştur
          </h2>
          <button className={styles.closeButton} onClick={onClose}>
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.drawerBody}>
          {error && (
            <div className={styles.alertWarning}>
              <svg className={styles.alertIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className={styles.alertText}>{error}</span>
            </div>
          )}

          <div className={styles.alertInfo}>
            <svg className={styles.alertIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className={styles.alertText}>
              Rol, kullanıcının sistemde ne yapabileceğini belirler. Birimlerden (departman) bağımsızdır.
            </span>
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                Rol Kodu<span className={styles.formRequired}>*</span>
              </label>
              <input
                type="text"
                name="code"
                value={formData.code}
                onChange={handleInputChange}
                className={styles.formInput}
                placeholder="ornek_rol"
                pattern="[a-z_]+"
              />
              <span className={styles.formHint}>Sadece küçük harf ve alt çizgi</span>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                Rol Adı<span className={styles.formRequired}>*</span>
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                className={styles.formInput}
                placeholder="Örnek Rol"
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Açıklama</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              className={styles.formTextarea}
              placeholder="Bu rolün amacı ve yetkilerini açıklayın..."
            />
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Seviye</label>
              <input
                type="number"
                name="level"
                value={formData.level}
                onChange={handleInputChange}
                className={styles.formInput}
                min={0}
                max={1000}
              />
              <span className={styles.formHint}>Düşük değer = yüksek öncelik</span>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Durum</label>
              <div className={styles.checkboxGroup} style={{ marginBottom: 0, marginTop: 6 }}>
                <input
                  type="checkbox"
                  name="is_active"
                  checked={formData.is_active}
                  onChange={handleCheckboxChange}
                  className={styles.checkbox}
                  id="is_active"
                />
                <label htmlFor="is_active" className={styles.checkboxLabel}>
                  Aktif
                </label>
              </div>
            </div>
          </div>

          <div className={styles.permissionsSection}>
            <h3 className={styles.sectionTitle}>
              <svg className={styles.sectionIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Yetkiler ({formData.permission_ids?.length || 0} seçili)
            </h3>

            {loading ? (
              <div className={styles.loading} style={{ padding: '24px' }}>
                <div className={styles.spinner}></div>
              </div>
            ) : (
              Object.entries(modulePermissions).map(([module, perms]) => (
                <div key={module} className={styles.moduleGroup}>
                  <div 
                    className={styles.moduleHeader}
                    onClick={() => toggleModule(module)}
                  >
                    <span className={styles.moduleTitle}>
                      {MODULE_NAMES[module] || module}
                      <span style={{ color: '#64748b', fontWeight: 400 }}>
                        ({perms.length})
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
                        >
                          <input
                            type="checkbox"
                            checked={formData.permission_ids?.includes(perm.id) || false}
                            onChange={() => togglePermission(perm.id)}
                            className={styles.permissionCheckbox}
                            onClick={(e) => e.stopPropagation()}
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
              ))
            )}
          </div>
        </form>

        <div className={styles.drawerFooter}>
          <button type="button" className={styles.btnCancel} onClick={onClose}>
            İptal
          </button>
          <button 
            type="submit" 
            className={styles.btnSubmit} 
            onClick={handleSubmit}
            disabled={submitting}
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
                Kaydet
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
