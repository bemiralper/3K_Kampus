/**
 * Rol Yönetimi Modülü - Ana Sayfa Bileşeni
 */
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Role, RoleStats } from './role.types';
import RoleService from './role.service';
import RoleList from './RoleList';
import RoleCreateDrawer from './RoleCreateDrawer';
import RoleEditDrawer from './RoleEditDrawer';
import styles from './styles/roles.module.css';

// Import badge styles from drawer module for consistency
import drawerStyles from './styles/role-drawer.module.css';

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [stats, setStats] = useState<RoleStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const showDeleted = filterActive === 'deleted';
  
  // Drawer states
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [drawerMode, setDrawerMode] = useState<'edit' | 'view'>('edit');
  
  // Delete / restore confirmation
  const [deleteConfirmRole, setDeleteConfirmRole] = useState<Role | null>(null);
  const [restoreConfirmRole, setRestoreConfirmRole] = useState<Role | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      
      const params: any = {};
      if (showDeleted) {
        params.silindi_mi = true;
      } else if (filterActive !== 'all') {
        params.is_active = filterActive === 'active';
      }
      if (filterType !== 'all') {
        params.is_system_role = filterType === 'system';
      }
      if (search.trim()) {
        params.search = search.trim();
      }
      
      const [rolesResponse, statsResponse] = await Promise.all([
        RoleService.listRoles(params),
        RoleService.getStats(),
      ]);
      
      if (rolesResponse.success) {
        setRoles(rolesResponse.roles);
      }
      
      if (statsResponse.success) {
        setStats(statsResponse.stats);
      }
    } catch (err) {
      console.error('Veriler yüklenemedi:', err);
    } finally {
      setLoading(false);
    }
  }, [search, filterActive, filterType, showDeleted]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const handleView = (role: Role) => {
    setSelectedRole(role);
    setDrawerMode('view');
    setEditDrawerOpen(true);
  };

  const handleEdit = (role: Role) => {
    setSelectedRole(role);
    setDrawerMode('edit');
    setEditDrawerOpen(true);
  };

  const handleDelete = (role: Role) => {
    setDeleteConfirmRole(role);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmRole) return;
    
    try {
      setDeleting(true);
      const response = await RoleService.deleteRole(deleteConfirmRole.id);
      if (response.success) {
        loadData();
        setDeleteConfirmRole(null);
      } else {
        alert(response.error || 'Rol silinemedi');
      }
    } catch (err: any) {
      alert(err.message || 'Bir hata oluştu');
    } finally {
      setDeleting(false);
    }
  };

  const handleRestore = (role: Role) => {
    setRestoreConfirmRole(role);
  };

  const confirmRestore = async () => {
    if (!restoreConfirmRole) return;

    try {
      setRestoring(true);
      const response = await RoleService.restoreRole(restoreConfirmRole.id);
      if (response.success) {
        loadData();
        setRestoreConfirmRole(null);
      } else {
        alert(response.error || 'Rol geri getirilemedi');
      }
    } catch (err: any) {
      alert(err.message || 'Bir hata oluştu');
    } finally {
      setRestoring(false);
    }
  };

  const handleCreateSuccess = () => {
    loadData();
  };

  const handleEditSuccess = () => {
    loadData();
  };

  return (
    <div className={styles.rolesPage}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>
            <svg className={styles.pageTitleIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Rol Yönetimi
          </h1>
          <p className={styles.pageSubtitle}>
            Sistem rollerini ve yetkilerini yönetin. Roller, kullanıcıların ne yapabileceğini belirler.
          </p>
        </div>
        <button 
          className={styles.btnPrimary}
          onClick={() => setCreateDrawerOpen(true)}
          disabled={showDeleted}
        >
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Yeni Rol
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={`${styles.statIcon} ${styles.statIconPrimary}`}>🔐</div>
            <div className={styles.statContent}>
              <div className={styles.statValue}>{stats.total_roles}</div>
              <div className={styles.statLabel}>Toplam Rol</div>
            </div>
          </div>
          <div className={styles.statCard}>
            <div className={`${styles.statIcon} ${styles.statIconSuccess}`}>✓</div>
            <div className={styles.statContent}>
              <div className={styles.statValue}>{stats.active_roles}</div>
              <div className={styles.statLabel}>Aktif Rol</div>
            </div>
          </div>
          <div className={styles.statCard}>
            <div className={`${styles.statIcon} ${styles.statIconWarning}`}>🔒</div>
            <div className={styles.statContent}>
              <div className={styles.statValue}>{stats.system_roles}</div>
              <div className={styles.statLabel}>Sistem Rolü</div>
            </div>
          </div>
          <div className={styles.statCard}>
            <div className={`${styles.statIcon} ${styles.statIconInfo}`}>🗑</div>
            <div className={styles.statContent}>
              <div className={styles.statValue}>{stats.deleted_roles ?? 0}</div>
              <div className={styles.statLabel}>Silinen Rol</div>
            </div>
          </div>
          <div className={styles.statCard}>
            <div className={`${styles.statIcon} ${styles.statIconInfo}`}>🔑</div>
            <div className={styles.statContent}>
              <div className={styles.statValue}>{stats.total_permissions}</div>
              <div className={styles.statLabel}>Toplam Yetki</div>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <svg className={styles.searchIcon} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Rol ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.searchInput}
          />
        </div>
        <div className={styles.filterGroup}>
          <select 
            value={filterActive}
            onChange={(e) => setFilterActive(e.target.value)}
            className={styles.filterSelect}
          >
            <option value="all">Tüm Durumlar</option>
            <option value="active">Aktif</option>
            <option value="inactive">Pasif</option>
            <option value="deleted">Silinen</option>
          </select>
          <select 
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className={styles.filterSelect}
          >
            <option value="all">Tüm Türler</option>
            <option value="system">Sistem Rolleri</option>
            <option value="custom">Özel Roller</option>
          </select>
        </div>
      </div>

      {/* Role List */}
      <RoleList
        roles={roles}
        loading={loading}
        showDeleted={showDeleted}
        onView={handleView}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onRestore={handleRestore}
      />

      {/* Create Drawer */}
      <RoleCreateDrawer
        isOpen={createDrawerOpen}
        onClose={() => setCreateDrawerOpen(false)}
        onSuccess={handleCreateSuccess}
      />

      {/* Edit/View Drawer */}
      <RoleEditDrawer
        isOpen={editDrawerOpen}
        role={selectedRole}
        mode={drawerMode}
        onClose={() => {
          setEditDrawerOpen(false);
          setSelectedRole(null);
        }}
        onSuccess={handleEditSuccess}
      />

      {/* Delete Confirmation Modal */}
      {deleteConfirmRole && (
        <>
          <div 
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 1000,
            }}
            onClick={() => setDeleteConfirmRole(null)}
          />
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '400px',
              width: '90%',
              zIndex: 1001,
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <h3 style={{ 
              fontSize: '18px', 
              fontWeight: 600, 
              color: '#1e293b',
              marginBottom: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#ef4444">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Rolü Sil
            </h3>
            <p style={{ color: '#64748b', marginBottom: '20px', lineHeight: 1.5 }}>
              <strong style={{ color: '#334155' }}>{deleteConfirmRole.name}</strong> rolünü silmek istediğinizden emin misiniz? 
              Rol silinenler listesine taşınır; daha sonra geri getirebilirsiniz.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                className={styles.btnSecondary}
                onClick={() => setDeleteConfirmRole(null)}
                disabled={deleting}
              >
                İptal
              </button>
              <button
                className={styles.btnDanger}
                onClick={confirmDelete}
                disabled={deleting}
                style={{ padding: '10px 20px' }}
              >
                {deleting ? 'Siliniyor...' : 'Evet, Sil'}
              </button>
            </div>
          </div>
        </>
      )}

      {restoreConfirmRole && (
        <>
          <div 
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 1000,
            }}
            onClick={() => setRestoreConfirmRole(null)}
          />
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '400px',
              width: '90%',
              zIndex: 1001,
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}
          >
            <h3 style={{ 
              fontSize: '18px', 
              fontWeight: 600, 
              color: '#1e293b',
              marginBottom: '12px',
            }}>
              Rolü Geri Getir
            </h3>
            <p style={{ color: '#64748b', marginBottom: '20px', lineHeight: 1.5 }}>
              <strong style={{ color: '#334155' }}>{restoreConfirmRole.name}</strong> rolünü tekrar aktif listeye almak istiyor musunuz?
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                className={styles.btnSecondary}
                onClick={() => setRestoreConfirmRole(null)}
                disabled={restoring}
              >
                İptal
              </button>
              <button
                className={styles.btnPrimary}
                onClick={confirmRestore}
                disabled={restoring}
                style={{ padding: '10px 20px' }}
              >
                {restoring ? 'Geri getiriliyor...' : 'Geri Getir'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
