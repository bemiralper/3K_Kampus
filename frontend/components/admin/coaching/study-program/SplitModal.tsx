'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { ProgramDay } from '@/lib/study-program-api';
import { WEEKDAY_LABELS } from '@/lib/study-program-api';

function dayLabel(day: ProgramDay): string {
  const wd = WEEKDAY_LABELS[day.weekday] || `Gün ${day.weekday}`;
  const d = new Date(`${day.day_date}T12:00:00`);
  const short = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  return `${wd} ${short}`;
}

interface SplitTarget {
  dayId: number;
  dayLabel: string;
  questionCount: number;
}

interface SplitModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (dayIds: number[], questionCounts: number[]) => void;
  title: string;
  totalQuestions: number;
  days: ProgramDay[];
  currentDayId?: number;
}

export default function SplitModal({
  open, onClose, onConfirm,
  title, totalQuestions, days, currentDayId,
}: SplitModalProps) {
  const [targets, setTargets] = useState<SplitTarget[]>([]);
  const [error, setError] = useState('');
  const orderedDays = [...days].sort((a, b) => a.day_date.localeCompare(b.day_date));

  useEffect(() => {
    if (!open) return;
    setTargets([]);
    setError('');
  }, [open]);

  const toggleDay = useCallback((day: ProgramDay) => {
    setTargets((prev) => {
      const exists = prev.find((t) => t.dayId === day.id);
      if (exists) return prev.filter((t) => t.dayId !== day.id);
      return [...prev, { dayId: day.id, dayLabel: dayLabel(day), questionCount: 0 }];
    });
    setError('');
  }, []);

  const updateQuestion = useCallback((dayId: number, value: number) => {
    setTargets((prev) =>
      prev.map((t) => (t.dayId === dayId ? { ...t, questionCount: Math.max(0, value) } : t)),
    );
    setError('');
  }, []);

  const distributeEvenly = useCallback(() => {
    if (targets.length === 0) return;
    const base = Math.floor(totalQuestions / targets.length);
    const remainder = totalQuestions % targets.length;
    setTargets((prev) =>
      prev.map((t, i) => ({ ...t, questionCount: base + (i < remainder ? 1 : 0) })),
    );
    setError('');
  }, [targets.length, totalQuestions]);

  useEffect(() => {
    if (targets.length >= 2) distributeEvenly();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets.length]);

  const currentTotal = targets.reduce((s, t) => s + t.questionCount, 0);
  const diff = totalQuestions - currentTotal;

  const handleConfirm = () => {
    if (targets.length < 2) {
      setError('En az 2 gün seçin.');
      return;
    }
    if (totalQuestions > 0 && diff !== 0) {
      setError(`Soru toplamı ${diff > 0 ? `${diff} eksik` : `${Math.abs(diff)} fazla`}.`);
      return;
    }
    onConfirm(
      targets.map((t) => t.dayId),
      targets.map((t) => t.questionCount),
    );
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
          maxWidth: 460,
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
              Günlere böl
            </h3>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: '#64748b', lineHeight: 1.4 }}>
              Soruları seçtiğiniz günlere dağıtın.
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
            marginBottom: 18,
            border: '1px solid #e8eef5',
          }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 4 }}>
              {title}
            </div>
            <div style={{ fontSize: 13, color: '#64748b' }}>
              Toplam <strong style={{ color: '#0f172a' }}>{totalQuestions}</strong> soru
            </div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <div style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#64748b',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              marginBottom: 8,
            }}>
              Günler
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {orderedDays.map((day) => {
                const selected = targets.some((t) => t.dayId === day.id);
                const isCurrent = day.id === currentDayId;
                return (
                  <button
                    key={day.id}
                    type="button"
                    onClick={() => toggleDay(day)}
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

          {targets.length >= 2 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 10,
              }}>
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#64748b',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}>
                  Soru dağılımı
                </span>
                <button
                  type="button"
                  onClick={distributeEvenly}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    border: '1px solid #e2e8f0',
                    background: '#fff',
                    color: '#334155',
                    cursor: 'pointer',
                  }}
                >
                  Eşit dağıt
                </button>
              </div>

              {targets.map((t) => (
                <div
                  key={t.dayId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    marginBottom: 10,
                    padding: '8px 10px',
                    background: '#f8fafc',
                    borderRadius: 10,
                    border: '1px solid #e8eef5',
                  }}
                >
                  <span style={{
                    width: 72,
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#0f766e',
                    flexShrink: 0,
                  }}>
                    {t.dayLabel}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={totalQuestions}
                    value={t.questionCount}
                    onChange={(e) => updateQuestion(t.dayId, parseInt(e.target.value, 10))}
                    style={{ flex: 1, accentColor: '#0f766e' }}
                  />
                  <input
                    type="number"
                    min={0}
                    max={totalQuestions}
                    value={t.questionCount}
                    onChange={(e) => updateQuestion(t.dayId, parseInt(e.target.value, 10) || 0)}
                    style={{
                      width: 56,
                      textAlign: 'center',
                      padding: '6px 4px',
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  />
                </div>
              ))}

              <div style={{
                textAlign: 'right',
                fontSize: 13,
                fontWeight: 700,
                color: diff === 0 ? '#16a34a' : '#dc2626',
                marginTop: 4,
              }}>
                {currentTotal} / {totalQuestions}
                {diff !== 0 && ` (${diff > 0 ? '−' : '+'}${Math.abs(diff)})`}
              </div>
            </div>
          )}

          {error && (
            <div style={{
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
            disabled={targets.length < 2}
            style={{
              padding: '10px 18px',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 700,
              border: 'none',
              background: targets.length < 2 ? '#cbd5e1' : '#0f766e',
              color: '#fff',
              cursor: targets.length < 2 ? 'not-allowed' : 'pointer',
            }}
          >
            Böl ve dağıt
          </button>
        </div>
      </div>
    </div>
  );
}
