/**
 * Term Drawer Form Component
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Term, TermFormData, EgitimYili, TERM_TYPE_LABELS } from '../types';

interface TermDrawerFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: TermFormData) => Promise<void>;
  editingTerm: Term | null;
  activeYear: EgitimYili | null;
}

// Get today's date in YYYY-MM-DD format
const getTodayDate = () => {
  const today = new Date();
  return today.toISOString().split('T')[0];
};

const getDefaultEndDate = () => {
  const date = new Date();
  date.setMonth(date.getMonth() + 4); // 4 ay sonrası
  return date.toISOString().split('T')[0];
};

const INITIAL_FORM_DATA: TermFormData = {
  name: '',
  code: '',
  term_type: 'regular',
  start_date: '',
  end_date: '',
  order_no: 1,
  is_active: true,
  program_olusturulabilir: false,
  yoklama_acik: false,
  not_girisi_acik: false,
  ogrenci_kayit_acik: false,
  schedule_locked: false,
  auto_generate_enabled: false,
  allow_conflict_override: false,
};

const styles = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 1000,
    display: 'flex',
    justifyContent: 'flex-end',
  },
  drawer: {
    width: '500px',
    maxWidth: '100%',
    backgroundColor: '#fff',
    height: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
    boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.15)',
  },
  header: {
    padding: '20px 24px',
    borderBottom: '1px solid #e5e7eb',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#111827',
    margin: 0,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '24px',
    cursor: 'pointer',
    color: '#6b7280',
  },
  content: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '24px',
  },
  yearBadge: {
    backgroundColor: '#dbeafe',
    color: '#1d4ed8',
    padding: '8px 16px',
    borderRadius: '8px',
    marginBottom: '24px',
    fontSize: '14px',
    fontWeight: 500,
    textAlign: 'center' as const,
  },
  section: {
    marginBottom: '24px',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#374151',
    marginBottom: '12px',
    paddingBottom: '8px',
    borderBottom: '1px solid #e5e7eb',
  },
  formGroup: {
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: 500,
    color: '#374151',
    marginBottom: '6px',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s',
    boxSizing: 'border-box' as const,
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    outline: 'none',
    backgroundColor: '#fff',
    boxSizing: 'border-box' as const,
  },
  row: {
    display: 'flex',
    gap: '12px',
  },
  col: {
    flex: 1,
  },
  checkboxGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '10px',
  },
  checkboxItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
  },
  checkboxLabel: {
    fontSize: '13px',
    color: '#4b5563',
    cursor: 'pointer',
  },
  footer: {
    padding: '16px 24px',
    borderTop: '1px solid #e5e7eb',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
  },
  btnCancel: {
    padding: '10px 20px',
    backgroundColor: '#f3f4f6',
    color: '#374151',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  btnSubmit: {
    padding: '10px 20px',
    backgroundColor: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  btnSubmitDisabled: {
    opacity: 0.7,
    cursor: 'not-allowed',
  },
  error: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    color: '#dc2626',
    padding: '12px',
    borderRadius: '6px',
    marginBottom: '16px',
    fontSize: '13px',
  },
};

export default function TermDrawerForm({
  isOpen,
  onClose,
  onSubmit,
  editingTerm,
  activeYear,
}: TermDrawerFormProps) {
  const [formData, setFormData] = useState<TermFormData>(INITIAL_FORM_DATA);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editingTerm) {
      setFormData({
        name: editingTerm.name,
        code: editingTerm.code,
        term_type: editingTerm.term_type,
        start_date: editingTerm.start_date,
        end_date: editingTerm.end_date,
        order_no: editingTerm.order_no,
        is_active: editingTerm.is_active,
        program_olusturulabilir: editingTerm.program_olusturulabilir,
        yoklama_acik: editingTerm.yoklama_acik,
        not_girisi_acik: editingTerm.not_girisi_acik,
        ogrenci_kayit_acik: editingTerm.ogrenci_kayit_acik,
        schedule_locked: editingTerm.schedule_locked,
        auto_generate_enabled: editingTerm.auto_generate_enabled,
        allow_conflict_override: editingTerm.allow_conflict_override,
      });
    } else {
      // Yeni dönem için varsayılan tarihlerle başlat
      setFormData({
        ...INITIAL_FORM_DATA,
        start_date: getTodayDate(),
        end_date: getDefaultEndDate(),
      });
    }
    setError(null);
  }, [editingTerm, isOpen]);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : type === 'number' ? Number(value) : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    
    try {
      await onSubmit(formData);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div style={styles.overlay} onClick={handleOverlayClick}>
      <div style={styles.drawer}>
        <div style={styles.header}>
          <h2 style={styles.title}>
            {editingTerm ? 'Dönem Düzenle' : 'Yeni Dönem Ekle'}
          </h2>
          <button style={styles.closeBtn} onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div style={styles.content}>
            {/* Aktif Yıl Badge */}
            <div style={styles.yearBadge}>
              📅 Eğitim Yılı: {activeYear?.display || 'Seçili değil'}
            </div>

            {/* Hata Mesajı */}
            {error && <div style={styles.error}>{error}</div>}

            {/* Temel Bilgiler */}
            <div style={styles.section}>
              <div style={styles.sectionTitle}>Temel Bilgiler</div>
              
              <div style={styles.formGroup}>
                <label style={styles.label}>Dönem Adı *</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  style={styles.input}
                  placeholder="Örn: 1. Dönem"
                  required
                />
              </div>

              <div style={styles.row}>
                <div style={styles.col}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Dönem Kodu *</label>
                    <input
                      type="text"
                      name="code"
                      value={formData.code}
                      onChange={handleChange}
                      style={styles.input}
                      placeholder="Örn: 2024-D1"
                      required
                    />
                  </div>
                </div>
                <div style={styles.col}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Sıra No</label>
                    <input
                      type="number"
                      name="order_no"
                      value={formData.order_no}
                      onChange={handleChange}
                      style={styles.input}
                      min={1}
                    />
                  </div>
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Dönem Türü *</label>
                <select
                  name="term_type"
                  value={formData.term_type}
                  onChange={handleChange}
                  style={styles.select}
                >
                  {(Object.entries(TERM_TYPE_LABELS) as [string, string][]).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div style={styles.row}>
                <div style={styles.col}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Başlangıç Tarihi *</label>
                    <input
                      type="date"
                      name="start_date"
                      value={formData.start_date}
                      onChange={handleChange}
                      style={styles.input}
                      required
                    />
                  </div>
                </div>
                <div style={styles.col}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Bitiş Tarihi *</label>
                    <input
                      type="date"
                      name="end_date"
                      value={formData.end_date}
                      onChange={handleChange}
                      style={styles.input}
                      required
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* İşlem Ayarları */}
            <div style={styles.section}>
              <div style={styles.sectionTitle}>İşlem Ayarları</div>
              <div style={styles.checkboxGroup}>
                <label style={styles.checkboxItem}>
                  <input
                    type="checkbox"
                    name="is_active"
                    checked={formData.is_active}
                    onChange={handleChange}
                    style={styles.checkbox}
                  />
                  <span style={styles.checkboxLabel}>Dönem Aktif</span>
                </label>
                <label style={styles.checkboxItem}>
                  <input
                    type="checkbox"
                    name="program_olusturulabilir"
                    checked={formData.program_olusturulabilir}
                    onChange={handleChange}
                    style={styles.checkbox}
                  />
                  <span style={styles.checkboxLabel}>Program Oluşturulabilir</span>
                </label>
                <label style={styles.checkboxItem}>
                  <input
                    type="checkbox"
                    name="yoklama_acik"
                    checked={formData.yoklama_acik}
                    onChange={handleChange}
                    style={styles.checkbox}
                  />
                  <span style={styles.checkboxLabel}>Yoklama Açık</span>
                </label>
                <label style={styles.checkboxItem}>
                  <input
                    type="checkbox"
                    name="not_girisi_acik"
                    checked={formData.not_girisi_acik}
                    onChange={handleChange}
                    style={styles.checkbox}
                  />
                  <span style={styles.checkboxLabel}>Not Girişi Açık</span>
                </label>
                <label style={styles.checkboxItem}>
                  <input
                    type="checkbox"
                    name="ogrenci_kayit_acik"
                    checked={formData.ogrenci_kayit_acik}
                    onChange={handleChange}
                    style={styles.checkbox}
                  />
                  <span style={styles.checkboxLabel}>Öğrenci Kayıt Açık</span>
                </label>
              </div>
            </div>

            {/* Planlama Ayarları */}
            <div style={styles.section}>
              <div style={styles.sectionTitle}>Planlama Ayarları</div>
              <div style={styles.checkboxGroup}>
                <label style={styles.checkboxItem}>
                  <input
                    type="checkbox"
                    name="schedule_locked"
                    checked={formData.schedule_locked}
                    onChange={handleChange}
                    style={styles.checkbox}
                  />
                  <span style={styles.checkboxLabel}>Program Kilitli</span>
                </label>
                <label style={styles.checkboxItem}>
                  <input
                    type="checkbox"
                    name="auto_generate_enabled"
                    checked={formData.auto_generate_enabled}
                    onChange={handleChange}
                    style={styles.checkbox}
                  />
                  <span style={styles.checkboxLabel}>Otomatik Program Oluşturma</span>
                </label>
                <label style={styles.checkboxItem}>
                  <input
                    type="checkbox"
                    name="allow_conflict_override"
                    checked={formData.allow_conflict_override}
                    onChange={handleChange}
                    style={styles.checkbox}
                  />
                  <span style={styles.checkboxLabel}>Çakışmalara İzin Ver</span>
                </label>
              </div>
            </div>
          </div>

          <div style={styles.footer}>
            <button
              type="button"
              onClick={onClose}
              style={styles.btnCancel}
              disabled={loading}
            >
              İptal
            </button>
            <button
              type="submit"
              style={{
                ...styles.btnSubmit,
                ...(loading ? styles.btnSubmitDisabled : {}),
              }}
              disabled={loading}
            >
              {loading ? 'Kaydediliyor...' : editingTerm ? 'Güncelle' : 'Kaydet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
