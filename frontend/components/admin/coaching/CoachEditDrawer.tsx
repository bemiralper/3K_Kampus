'use client';

import React, { useState, useEffect } from 'react';
import { fetchCoach, updateCoach, type Coach, type CoachCreateUpdate } from '@/lib/coaching-api';

interface CoachEditDrawerProps {
  isOpen: boolean;
  coachId: number | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CoachEditDrawer({ isOpen, coachId, onClose, onSuccess }: CoachEditDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coach, setCoach] = useState<Coach | null>(null);

  const [formData, setFormData] = useState<CoachCreateUpdate>({
    teacher_id: 0,
    capacity: 10,
    is_active: true,
    is_coach: true,
  });

  useEffect(() => {
    if (isOpen && coachId) {
      loadCoach();
    }
  }, [isOpen, coachId]);

  const loadCoach = async () => {
    if (!coachId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetchCoach(coachId);

      if (response.success && response.data) {
        setCoach(response.data);
        setFormData({
          teacher_id: response.data.teacher,
          capacity: response.data.capacity,
          is_active: response.data.is_active,
          is_coach: response.data.is_coach,
        });
      } else {
        setError('Koç bulunamadı');
      }
    } catch (err) {
      setError('Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!coachId) return;

    setSaving(true);
    setError(null);

    try {
      const response = await updateCoach(coachId, formData);

      if (response.success) {
        onSuccess();
        onClose();
      } else {
        setError(response.error || 'Koç güncellenemedi');
      }
    } catch (err) {
      setError('Bir hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 40,
        }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          maxWidth: '672px',
          backgroundColor: '#fff',
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-4px 0 6px -1px rgba(0, 0, 0, 0.1)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 24px',
            borderBottom: '1px solid #e5e7eb',
          }}
        >
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#111827', margin: 0 }}>
              Koç Düzenle
            </h2>
            <p style={{ fontSize: '14px', color: '#6b7280', margin: '4px 0 0' }}>
              {coach?.teacher_full_name || 'Yükleniyor...'}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '8px',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              borderRadius: '6px',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>
            Yükleniyor...
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
            {error && (
              <div
                style={{
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  marginBottom: '20px',
                  color: '#dc2626',
                  fontSize: '14px',
                }}
              >
                {error}
              </div>
            )}

            {/* Teacher (Read-only) */}
            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Öğretmen</label>
              <div
                style={{
                  padding: '10px 14px',
                  backgroundColor: '#f9fafb',
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                  fontSize: '14px',
                  color: '#374151',
                }}
              >
                {coach?.teacher_full_name}
              </div>
              <p style={helpStyle}>Öğretmen ataması değiştirilemez</p>
            </div>

            {/* Capacity */}
            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>
                Kapasite <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={formData.capacity}
                onChange={(e) => setFormData({ ...formData, capacity: Number(e.target.value) })}
                style={inputStyle}
                required
              />
              <p style={helpStyle}>
                Koçun aynı anda bakabileceği maksimum öğrenci sayısı (1-100).
                Mevcut öğrenci: {coach?.current_student_count}
              </p>
            </div>

            {/* Checkboxes */}
            <div style={{ display: 'flex', gap: '24px', marginBottom: '24px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  style={{ width: '18px', height: '18px', accentColor: '#3b82f6' }}
                />
                <span style={{ fontSize: '14px', color: '#374151' }}>Aktif</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.is_coach}
                  onChange={(e) => setFormData({ ...formData, is_coach: e.target.checked })}
                  style={{ width: '18px', height: '18px', accentColor: '#3b82f6' }}
                />
                <span style={{ fontSize: '14px', color: '#374151' }}>Koç Yetkili</span>
              </label>
            </div>
          </form>
        )}

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end',
            padding: '16px 24px',
            borderTop: '1px solid #e5e7eb',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '10px 20px',
              backgroundColor: '#fff',
              color: '#374151',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            İptal
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={saving || loading}
            style={{
              padding: '10px 20px',
              backgroundColor: saving || loading ? '#9ca3af' : '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: saving || loading ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '14px',
  fontWeight: 500,
  color: '#374151',
  marginBottom: '6px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: '8px',
  border: '1px solid #e5e7eb',
  fontSize: '14px',
  backgroundColor: '#fff',
};

const helpStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#6b7280',
  marginTop: '4px',
  margin: '4px 0 0',
};
