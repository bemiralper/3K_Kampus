'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { ProgramDay } from '@/lib/study-program-api';
import { WEEKDAY_LABELS } from '@/lib/study-program-api';

function dayLabel(day: ProgramDay): string {
  const wd = WEEKDAY_LABELS[day.weekday] || `Gün ${day.weekday}`;
  const d = new Date(`${day.day_date}T12:00:00`);
  const short = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  return `${wd} ${short}`;
}

export type SplitMetric = 'question' | 'test';

interface SplitModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (dayIds: number[], metric: SplitMetric) => void;
  title: string;
  totalQuestions: number;
  testCount?: number;
  days: ProgramDay[];
  currentDayId?: number;
}

export default function SplitModal({
  open, onClose, onConfirm,
  title, totalQuestions, testCount = 0, days, currentDayId,
}: SplitModalProps) {
  const [metric, setMetric] = useState<SplitMetric>('question');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [error, setError] = useState('');
  const orderedDays = useMemo(
    () => [...days].sort((a, b) => a.day_date.localeCompare(b.day_date)),
    [days],
  );
  const allIds = orderedDays.map((day) => day.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.includes(id));

  useEffect(() => {
    if (!open) return;
    setMetric('question');
    setSelectedIds([]);
    setError('');
  }, [open]);

  const toggleDay = (dayId: number) => {
    setSelectedIds((prev) => (
      prev.includes(dayId) ? prev.filter((id) => id !== dayId) : [...prev, dayId]
    ));
    setError('');
  };

  const toggleAll = () => {
    setSelectedIds(allSelected ? [] : allIds);
    setError('');
  };

  const handleConfirm = () => {
    if (selectedIds.length < 1) {
      setError('En az bir gün seçin.');
      return;
    }
    if (metric === 'test' && testCount < 1) {
      setError('Bu ödevde bölünecek test yok.');
      return;
    }
    const ordered = orderedDays.filter((day) => selectedIds.includes(day.id)).map((day) => day.id);
    onConfirm(ordered, metric);
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#fff',
          borderRadius: 16,
          width: '100%',
          maxWidth: 480,
          maxHeight: '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(15, 23, 42, 0.22)',
        }}
      >
        <div style={{
          padding: '18px 20px 14px',
          borderBottom: '1px solid #e8eef5',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
              Bu ödevi böl
            </h3>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: '#64748b', lineHeight: 1.4 }}>
              Yalnızca bu ödev, seçtiğiniz günlere soru veya test sayısına göre yazılır.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              background: '#f8fafc',
              color: '#64748b',
              fontSize: 18,
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: 20, overflowY: 'auto' }}>
          <div style={{
            background: '#f8fafc',
            borderRadius: 12,
            padding: '12px 14px',
            marginBottom: 16,
            border: '1px solid #e8eef5',
          }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 4 }}>
              {title}
            </div>
            <div style={{ fontSize: 13, color: '#64748b' }}>
              {totalQuestions} soru
              {testCount > 0 ? ` · ${testCount} test` : ''}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#64748b',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              marginBottom: 8,
            }}>
              Bölme
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} role="group" aria-label="Bölme ölçüsü">
              <button
                type="button"
                onClick={() => { setMetric('question'); setError(''); }}
                style={metricBtn(metric === 'question')}
              >
                Soru sayısı
              </button>
              <button
                type="button"
                onClick={() => { setMetric('test'); setError(''); }}
                disabled={testCount < 1}
                style={metricBtn(metric === 'test', testCount < 1)}
              >
                Test sayısı
              </button>
            </div>
          </div>

          <div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
              marginBottom: 8,
            }}>
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#64748b',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}>
                Günler
              </span>
              <button
                type="button"
                onClick={toggleAll}
                style={{
                  border: '1px solid #e2e8f0',
                  background: '#fff',
                  borderRadius: 8,
                  padding: '5px 10px',
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#0f172a',
                  cursor: 'pointer',
                }}
              >
                {allSelected ? 'Seçimi kaldır' : 'Tümünü seç'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {orderedDays.map((day) => {
                const selected = selectedIds.includes(day.id);
                const isCurrent = day.id === currentDayId;
                return (
                  <button
                    key={day.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleDay(day.id)}
                    style={{
                      padding: '9px 12px',
                      borderRadius: 10,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: selected ? '2px solid #0f766e' : '1px solid #e2e8f0',
                      backgroundColor: selected ? '#f0fdfa' : '#fff',
                      color: selected ? '#0f766e' : '#334155',
                      position: 'relative',
                    }}
                  >
                    {dayLabel(day)}
                    {isCurrent && (
                      <span style={{
                        position: 'absolute',
                        top: -3,
                        right: -3,
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: '#f59e0b',
                      }} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <div style={{
              marginTop: 12,
              padding: '10px 12px',
              borderRadius: 10,
              backgroundColor: '#fef2f2',
              color: '#dc2626',
              fontSize: 12,
              fontWeight: 600,
            }}>
              {error}
            </div>
          )}
        </div>

        <div style={{
          padding: '14px 20px',
          borderTop: '1px solid #e8eef5',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
          background: '#f8fafc',
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              border: '1px solid #e2e8f0',
              background: '#fff',
              color: '#334155',
              cursor: 'pointer',
            }}
          >
            İptal
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={selectedIds.length < 1}
            style={{
              padding: '10px 18px',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 700,
              border: 'none',
              background: selectedIds.length < 1 ? '#cbd5e1' : '#0f766e',
              color: '#fff',
              cursor: selectedIds.length < 1 ? 'not-allowed' : 'pointer',
            }}
          >
            Böl
          </button>
        </div>
      </div>
    </div>
  );
}

function metricBtn(on: boolean, disabled = false): React.CSSProperties {
  return {
    padding: '8px 14px',
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: on ? '2px solid #0f766e' : '1px solid #e2e8f0',
    background: on ? '#f0fdfa' : '#fff',
    color: disabled ? '#94a3b8' : on ? '#0f766e' : '#334155',
    opacity: disabled ? 0.6 : 1,
  };
}
