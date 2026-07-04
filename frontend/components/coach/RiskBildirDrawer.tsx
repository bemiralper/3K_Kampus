'use client';

import { useState } from 'react';
import { reportStudentRisk } from '@/lib/coach-api';
import CoachActionSheet from '@/components/coach/CoachActionSheet';

interface RiskBildirDrawerProps {
  studentId: number;
  studentName: string;
  onClose: () => void;
  onSuccess?: () => void;
}

const REASONS = [
  'Ödev teslimi yok',
  'Sınav performansı düştü',
  'Görüşme kaçırıldı',
  'Motivasyon kaybı',
  'Veli iletişimi gerekli',
  'Diğer',
];

export default function RiskBildirDrawer({
  studentId,
  studentName,
  onClose,
  onSuccess,
}: RiskBildirDrawerProps) {
  const [reason, setReason] = useState(REASONS[0]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await reportStudentRisk(studentId, {
        reason,
        notes: notes.trim() || undefined,
        create_meeting_draft: false,
      });
      if (res.success) {
        onSuccess?.();
        onClose();
        return;
      }
      setError(res.error || 'Risk bildirimi gönderilemedi.');
    } catch {
      setError('Risk bildirimi gönderilemedi.');
    } finally {
      setSaving(false);
    }
  };

  const footer = (
    <>
      <button type="button" className="coach-btn coach-btn-secondary" onClick={onClose}>
        İptal
      </button>
      <button
        type="submit"
        form="risk-bildir-form"
        className="coach-btn coach-btn-danger"
        disabled={saving}
      >
        {saving ? 'Gönderiliyor…' : 'Risk Bildir'}
      </button>
    </>
  );

  return (
    <CoachActionSheet
      title="Risk Bildir"
      subtitle="CoachingEvent RISK kaydı oluşturulur."
      studentName={studentName}
      onClose={onClose}
      footer={footer}
    >
      <form id="risk-bildir-form" onSubmit={handleSubmit}>
        <div className="coach-form-field">
          <label htmlFor="risk-reason">Neden</label>
          <select
            id="risk-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        <div className="coach-form-field">
          <label htmlFor="risk-notes">Açıklama</label>
          <textarea
            id="risk-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Kısa açıklama (opsiyonel)"
          />
        </div>

        {error && <p className="coach-drawer-error">{error}</p>}
      </form>
    </CoachActionSheet>
  );
}
