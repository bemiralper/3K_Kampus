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

/** Sunucudaki bölme ile aynı: kalan, tarih sırasındaki ilk günlere birer eklenir. */
function splitAmounts(total: number, parts: number): number[] {
  if (parts <= 0) return [];
  const safe = Math.max(0, Math.trunc(total) || 0);
  const base = Math.floor(safe / parts);
  const extra = safe % parts;
  return Array.from({ length: parts }, (_, index) => base + (index < extra ? 1 : 0));
}

function dailySplitLabel(amounts: number[], unit: 'soru' | 'test'): string {
  if (amounts.length === 0) return '';
  if (amounts.length === 1) {
    return amounts[0] === 0 ? `Bu günde ${unit} yok` : `${amounts[0]} ${unit}`;
  }
  const grouped = new Map<number, number>();
  for (const amount of amounts) grouped.set(amount, (grouped.get(amount) ?? 0) + 1);
  if (grouped.size === 1) {
    const amount = amounts[0];
    return amount === 0 ? `Seçilen günlere ${unit} düşmez` : `Günde ${amount} ${unit}`;
  }
  return [...grouped.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([amount, days]) => (
      amount === 0 ? `${days} günde ${unit} yok` : `${days} güne ${amount} ${unit}`
    ))
    .join(', ');
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

  const selectedOrdered = orderedDays.filter((day) => selectedIds.includes(day.id));
  const splitUnit: 'soru' | 'test' = metric === 'test' ? 'test' : 'soru';
  const splitTotal = metric === 'test' ? testCount : totalQuestions;
  const splitShares = splitAmounts(splitTotal, selectedOrdered.length);
  const shareByDayId = new Map(selectedOrdered.map((day, index) => [day.id, splitShares[index] ?? 0]));
  const splitLabel = dailySplitLabel(splitShares, splitUnit);

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
                const share = selected ? shareByDayId.get(day.id) : undefined;
                const shareText = share == null
                  ? ''
                  : share > 0
                    ? `${share} ${splitUnit}`
                    : `${splitUnit} yok`;
                return (
                  <button
                    key={day.id}
                    type="button"
                    aria-pressed={selected}
                    aria-label={shareText ? `${dayLabel(day)}, ${shareText}` : dayLabel(day)}
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
                      textAlign: 'center',
                      lineHeight: 1.2,
                    }}
                  >
                    {dayLabel(day)}
                    {shareText && (
                      <span style={{
                        display: 'block',
                        marginTop: 3,
                        fontSize: 11,
                        fontWeight: 800,
                        color: share && share > 0 ? '#0f766e' : '#94a3b8',
                      }}>
                        {shareText}
                      </span>
                    )}
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
            {selectedOrdered.length > 0 && (
              <div style={{
                marginTop: 12,
                padding: '10px 12px',
                borderRadius: 10,
                background: '#f0fdfa',
                border: '1px solid #ccfbf1',
              }}>
                <div style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#0f766e',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}>
                  {selectedOrdered.length} gün
                </div>
                <div style={{ marginTop: 2, fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
                  {splitLabel}
                </div>
              </div>
            )}
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
