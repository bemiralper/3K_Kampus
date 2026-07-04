'use client';

import React, { useEffect, useState } from 'react';
import {
  changeCoach,
  fetchCoaches,
  type Coach,
} from '@/lib/coaching-api';

export interface CoachChangeTarget {
  studentId: number;
  studentName: string;
  currentCoachId: number;
  currentCoachName: string;
  assignmentId?: number;
}

interface CoachChangeModalProps {
  isOpen: boolean;
  target: CoachChangeTarget | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export default function CoachChangeModal({
  isOpen,
  target,
  onClose,
  onSuccess,
}: CoachChangeModalProps) {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [selectedCoachId, setSelectedCoachId] = useState<number | ''>('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !target) {
      setSelectedCoachId('');
      setError(null);
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        const res = await fetchCoaches({ is_active: true, is_coach: true });
        if (res.success && res.data) {
          setCoaches(
            res.data.filter(
              c => c.id !== target.currentCoachId && c.available_capacity > 0
            )
          );
        }
      } catch {
        setError('Koç listesi yüklenemedi');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [isOpen, target]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target || !selectedCoachId) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await changeCoach({
        student_id: target.studentId,
        new_coach_id: Number(selectedCoachId),
      });
      if (res.success) {
        onSuccess(res.message || 'Koç değişikliği tamamlandı. Öğrenci geçmişi korundu.');
        onClose();
      } else {
        setError(res.error || 'Koç değişikliği yapılamadı');
      }
    } catch {
      setError('Bir hata oluştu');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !target) return null;

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,.45)', zIndex: 60 }}
        onClick={onClose}
      />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '100%',
          maxWidth: 480,
          backgroundColor: '#fff',
          borderRadius: 12,
          boxShadow: '0 20px 40px rgba(0,0,0,.15)',
          zIndex: 70,
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#111827' }}>Koç Değiştir</h2>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#6b7280' }}>
            {target.studentName} — mevcut koç: {target.currentCoachName}
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px 24px' }}>
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 8,
              backgroundColor: '#eff6ff',
              border: '1px solid #bfdbfe',
              fontSize: 13,
              color: '#1e40af',
              marginBottom: 16,
              lineHeight: 1.5,
            }}
          >
            Önceki koçun verdiği ödevler, çalışma programları ve görüşme kayıtları öğrenci
            kaydında kalır. Yeni koç bu geçmişi görebilir ve yeni çalışmalar ekleyebilir.
          </div>

          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
            Yeni koç
          </label>
          {loading ? (
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>Koçlar yükleniyor...</div>
          ) : coaches.length === 0 ? (
            <div style={{ fontSize: 13, color: '#92400e', marginBottom: 16 }}>
              Müsait kapasitesi olan başka koç bulunamadı.
            </div>
          ) : (
            <select
              value={selectedCoachId}
              onChange={e => setSelectedCoachId(e.target.value ? Number(e.target.value) : '')}
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #e5e7eb',
                fontSize: 14,
                marginBottom: 16,
              }}
            >
              <option value="">Koç seçin...</option>
              {coaches.map(coach => (
                <option key={coach.id} value={coach.id}>
                  {coach.teacher_full_name} — müsait: {coach.available_capacity}
                </option>
              ))}
            </select>
          )}

          {error && (
            <div style={{ fontSize: 13, color: '#dc2626', marginBottom: 12 }}>{error}</div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: '1px solid #e5e7eb',
                backgroundColor: '#fff',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={submitting || !selectedCoachId || coaches.length === 0}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                backgroundColor: submitting || !selectedCoachId ? '#9ca3af' : '#3b82f6',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: submitting || !selectedCoachId ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Kaydediliyor...' : 'Koçu Değiştir'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
