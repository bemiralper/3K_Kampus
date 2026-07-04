/**
 * Rol Yönetimi Modülü - Rol Listesi Bileşeni
 */
'use client';

import React from 'react';
import { Role } from './role.types';
import styles from './styles/roles.module.css';

interface RoleListProps {
  roles: Role[];
  loading: boolean;
  showDeleted?: boolean;
  onEdit: (role: Role) => void;
  onDelete: (role: Role) => void;
  onView: (role: Role) => void;
  onRestore?: (role: Role) => void;
}

export default function RoleList({
  roles,
  loading,
  showDeleted = false,
  onEdit,
  onDelete,
  onView,
  onRestore,
}: RoleListProps) {
  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
        <span>Roller yükleniyor...</span>
      </div>
    );
  }

  if (roles.length === 0) {
    return (
      <div className={styles.emptyState}>
        <svg className={styles.emptyIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        <h3 className={styles.emptyTitle}>
          {showDeleted ? 'Silinmiş rol bulunmuyor' : 'Henüz rol bulunmuyor'}
        </h3>
        <p className={styles.emptyText}>
          {showDeleted
            ? 'Silinen roller burada listelenir ve geri getirilebilir.'
            : 'Yeni bir rol eklemek için yukarıdaki butonu kullanın.'}
        </p>
      </div>
    );
  }

  const getLevelBadgeClass = (level: number) => {
    if (level <= 30) return styles.levelBadgeHigh;
    if (level <= 100) return styles.levelBadgeMedium;
    return styles.levelBadgeLow;
  };

  return (
    <div className={styles.tableContainer}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Rol</th>
            <th>Açıklama</th>
            <th>Seviye</th>
            <th>Durum</th>
            <th>Tür</th>
            <th>Yetkiler</th>
            <th>İşlemler</th>
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => (
            <tr key={role.id}>
              <td>
                <div className={styles.roleInfo}>
                  <span className={styles.roleName}>{role.name}</span>
                  <span className={styles.roleCode}>{role.code}</span>
                </div>
              </td>
              <td>
                <span className={styles.roleDescription} title={role.description}>
                  {role.description || '-'}
                </span>
              </td>
              <td>
                <span className={`${styles.levelBadge} ${getLevelBadgeClass(role.level)}`}>
                  {role.level}
                </span>
              </td>
              <td>
                {showDeleted ? (
                  <span className={styles.badgeInactive}>Silindi</span>
                ) : (
                  <span className={role.is_active ? styles.badgeActive : styles.badgeInactive}>
                    {role.is_active ? 'Aktif' : 'Pasif'}
                  </span>
                )}
              </td>
              <td>
                <span className={role.is_system_role ? styles.badgeSystem : styles.badgeCustom}>
                  {role.is_system_role ? '🔒 Sistem' : '✨ Özel'}
                </span>
              </td>
              <td>
                <span className={styles.permissionCount}>
                  {role.permission_count || 0}
                </span>
              </td>
              <td>
                <div className={styles.actions}>
                  {showDeleted ? (
                    <button
                      className={styles.btnSecondary}
                      onClick={() => onRestore?.(role)}
                      title="Geri Getir"
                      style={{ padding: '6px 12px', fontSize: '13px' }}
                    >
                      Geri Getir
                    </button>
                  ) : (
                    <>
                      <button
                        className={styles.btnIcon}
                        onClick={() => onView(role)}
                        title="Görüntüle"
                      >
                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </button>
                      <button
                        className={styles.btnIcon}
                        onClick={() => onEdit(role)}
                        title="Düzenle"
                      >
                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      {!role.is_system_role && (
                        <button
                          className={styles.btnIcon}
                          onClick={() => onDelete(role)}
                          title="Sil"
                          style={{ color: '#ef4444' }}
                        >
                          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
