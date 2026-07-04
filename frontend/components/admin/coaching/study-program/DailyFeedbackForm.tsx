'use client';

import React from 'react';
import { type DailyFeedback } from '@/lib/study-program-api';

/**
 * Günlük mini yorum formu — 3 soruluk hızlı check.
 */

interface Props {
  feedback: DailyFeedback | null;
  dayId: number;
  onSave: (dayId: number, data: {
    struggled?: boolean;
    time_enough?: boolean;
    unclear_topic?: string;
    comment?: string;
  }) => void;
}

export default function DailyFeedbackForm({ feedback, dayId, onSave }: Props) {
  const [struggled, setStruggled] = React.useState(feedback?.struggled ?? null);
  const [timeEnough, setTimeEnough] = React.useState(feedback?.time_enough ?? null);
  const [unclearTopic, setUnclearTopic] = React.useState(feedback?.unclear_topic ?? '');
  const [comment, setComment] = React.useState(feedback?.comment ?? '');
  const [saved, setSaved] = React.useState(false);

  const handleSubmit = () => {
    onSave(dayId, {
      struggled: struggled ?? undefined,
      time_enough: timeEnough ?? undefined,
      unclear_topic: unclearTopic || undefined,
      comment: comment || undefined,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const btnStyle = (active: boolean | null, val: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '8px',
    borderRadius: '8px',
    border: `2px solid ${active === val ? (val ? '#22c55e' : '#ef4444') : '#e5e7eb'}`,
    backgroundColor: active === val ? (val ? '#f0fdf4' : '#fef2f2') : '#fff',
    color: active === val ? (val ? '#059669' : '#dc2626') : '#6b7280',
    fontWeight: 600,
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'all .2s',
  });

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px' }}>
      <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#111827', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        📋 Günlük Mini Yorum
      </h4>

      {/* Soru 1: Zorlandı mı? */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontSize: '12px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>Bugün zorlandın mı?</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button style={btnStyle(struggled, true)} onClick={() => setStruggled(true)}>😰 Evet</button>
          <button style={btnStyle(struggled, false)} onClick={() => setStruggled(false)}>😊 Hayır</button>
        </div>
      </div>

      {/* Soru 2: Süre yetti mi? */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontSize: '12px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>Süre yetti mi?</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button style={btnStyle(timeEnough, true)} onClick={() => setTimeEnough(true)}>✅ Yetti</button>
          <button style={btnStyle(timeEnough, false)} onClick={() => setTimeEnough(false)}>⏰ Yetmedi</button>
        </div>
      </div>

      {/* Soru 3: Anlamadığı konu */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontSize: '12px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>Anlamadığın konu var mı?</div>
        <input
          type="text"
          value={unclearTopic}
          onChange={(e) => setUnclearTopic(e.target.value)}
          placeholder="Konu adı yazın..."
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            fontSize: '13px',
            outline: 'none',
          }}
        />
      </div>

      {/* Ek yorum */}
      <div style={{ marginBottom: '14px' }}>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Ek yorum (opsiyonel)..."
          rows={2}
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            fontSize: '13px',
            resize: 'none',
            outline: 'none',
          }}
        />
      </div>

      <button
        onClick={handleSubmit}
        style={{
          width: '100%',
          padding: '10px',
          borderRadius: '8px',
          border: 'none',
          backgroundColor: saved ? '#22c55e' : '#3b82f6',
          color: '#fff',
          fontWeight: 600,
          fontSize: '13px',
          cursor: 'pointer',
          transition: 'background .2s',
        }}
      >
        {saved ? '✓ Kaydedildi' : 'Kaydet'}
      </button>
    </div>
  );
}
