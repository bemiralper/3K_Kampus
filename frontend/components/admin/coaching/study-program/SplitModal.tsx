'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { ProgramDay } from '@/lib/study-program-api';

/* ─────────────────────────────────────────────
   Ödev Bölme Modalı
   
   Kullanım:
   - Havuzdan bir ödev seçilip "Böl" denildiğinde
   - Takvimde zaten var olan bir blok sağ-tık / ✂️ ile bölünmek istendiğinde
   
   Adımlar:
   1. Hangi günler? (checkbox ile günler seçilir)
   2. Soru dağılımı (slider veya input ile her güne kaç soru)
   ───────────────────────────────────────────── */

const WEEKDAY_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

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
  /** Eğer blok zaten bir gündeyse, o günün id'si (opsiyonel — mevcut blok bölme) */
  currentDayId?: number;
}

export default function SplitModal({
  open, onClose, onConfirm,
  title, totalQuestions, days, currentDayId,
}: SplitModalProps) {
  const [targets, setTargets] = useState<SplitTarget[]>([]);
  const [error, setError] = useState('');

  // Modal açıldığında hedefleri sıfırla
  useEffect(() => {
    if (!open) return;
    setTargets([]);
    setError('');
  }, [open]);

  // Gün toggle
  const toggleDay = useCallback((day: ProgramDay) => {
    setTargets(prev => {
      const exists = prev.find(t => t.dayId === day.id);
      if (exists) {
        return prev.filter(t => t.dayId !== day.id);
      }
      return [
        ...prev,
        {
          dayId: day.id,
          dayLabel: WEEKDAY_LABELS[day.weekday] || `Gün ${day.weekday}`,
          questionCount: 0,
        },
      ];
    });
    setError('');
  }, []);

  // Soru değiştiğinde
  const updateQuestion = useCallback((dayId: number, value: number) => {
    setTargets(prev => prev.map(t => t.dayId === dayId ? { ...t, questionCount: Math.max(0, value) } : t));
    setError('');
  }, []);

  // Eşit dağıt
  const distributeEvenly = useCallback(() => {
    if (targets.length === 0) return;
    const base = Math.floor(totalQuestions / targets.length);
    const remainder = totalQuestions % targets.length;
    setTargets(prev =>
      prev.map((t, i) => ({ ...t, questionCount: base + (i < remainder ? 1 : 0) }))
    );
    setError('');
  }, [targets.length, totalQuestions]);

  // Otomatik dağıt (ilk eklenen günlere eşit)
  useEffect(() => {
    if (targets.length >= 2) {
      distributeEvenly();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets.length]);

  const currentTotal = targets.reduce((s, t) => s + t.questionCount, 0);
  const diff = totalQuestions - currentTotal;

  const handleConfirm = () => {
    if (targets.length < 2) {
      setError('En az 2 gün seçmelisiniz.');
      return;
    }
    if (totalQuestions > 0 && diff !== 0) {
      setError(`Soru toplamı ${diff > 0 ? diff + ' eksik' : Math.abs(diff) + ' fazla'}. Toplam ${totalQuestions} olmalı.`);
      return;
    }
    onConfirm(
      targets.map(t => t.dayId),
      targets.map(t => t.questionCount),
    );
  };

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.45)',
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          backgroundColor: '#fff', borderRadius: '14px',
          width: '460px', maxHeight: '90vh', overflow: 'auto',
          boxShadow: '0 24px 48px rgba(0,0,0,.18)',
          padding: '24px',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#111827' }}>
            ✂️ Ödevi Günlere Böl
          </h3>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#6b7280',
          }}>×</button>
        </div>

        {/* Ödev bilgisi */}
        <div style={{
          backgroundColor: '#f9fafb', borderRadius: '10px', padding: '12px 14px',
          marginBottom: '16px', border: '1px solid #e5e7eb',
        }}>
          <div style={{ fontWeight: 600, fontSize: '14px', color: '#1f2937', marginBottom: '4px' }}>
            {title}
          </div>
          <div style={{ fontSize: '13px', color: '#6b7280' }}>
            Toplam: <strong>{totalQuestions}</strong> soru
          </div>
        </div>

        {/* Gün seçimi */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>
            Hangi günlere bölünsün?
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {days.map(day => {
              const selected = targets.some(t => t.dayId === day.id);
              const isCurrent = day.id === currentDayId;
              return (
                <button
                  key={day.id}
                  onClick={() => toggleDay(day)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: selected ? '2px solid #3b82f6' : '1px solid #d1d5db',
                    backgroundColor: selected ? '#eff6ff' : '#fff',
                    color: selected ? '#2563eb' : '#374151',
                    position: 'relative',
                  }}
                >
                  {WEEKDAY_LABELS[day.weekday]}
                  {isCurrent && (
                    <span style={{
                      position: 'absolute', top: '-4px', right: '-4px',
                      width: '8px', height: '8px', borderRadius: '50%',
                      backgroundColor: '#f59e0b',
                    }} />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Soru dağılımı */}
        {targets.length >= 2 && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: '10px',
            }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>
                Soru Dağılımı
              </span>
              <button
                onClick={distributeEvenly}
                style={{
                  padding: '4px 10px', borderRadius: '6px', fontSize: '12px',
                  fontWeight: 600, border: '1px solid #d1d5db',
                  background: '#f9fafb', color: '#374151', cursor: 'pointer',
                }}
              >
                ⚖️ Eşit Dağıt
              </button>
            </div>

            {targets.map((t) => (
              <div key={t.dayId} style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                marginBottom: '8px',
              }}>
                <span style={{
                  width: '40px', fontSize: '13px', fontWeight: 600, color: '#2563eb',
                }}>
                  {t.dayLabel}
                </span>
                <input
                  type="range"
                  min={0}
                  max={totalQuestions}
                  value={t.questionCount}
                  onChange={(e) => updateQuestion(t.dayId, parseInt(e.target.value))}
                  style={{ flex: 1, accentColor: '#3b82f6' }}
                />
                <input
                  type="number"
                  min={0}
                  max={totalQuestions}
                  value={t.questionCount}
                  onChange={(e) => updateQuestion(t.dayId, parseInt(e.target.value) || 0)}
                  style={{
                    width: '60px', textAlign: 'center', padding: '4px 6px',
                    borderRadius: '6px', border: '1px solid #d1d5db',
                    fontSize: '13px', fontWeight: 600,
                  }}
                />
              </div>
            ))}

            {/* Toplam göstergesi */}
            <div style={{
              display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
              gap: '8px', marginTop: '6px',
            }}>
              <span style={{
                fontSize: '13px',
                fontWeight: 700,
                color: diff === 0 ? '#16a34a' : '#dc2626',
              }}>
                Toplam: {currentTotal} / {totalQuestions}
                {diff !== 0 && ` (${diff > 0 ? '-' : '+'}${Math.abs(diff)})`}
              </span>
            </div>
          </div>
        )}

        {/* Hata */}
        {error && (
          <div style={{
            padding: '8px 12px', borderRadius: '8px',
            backgroundColor: '#fef2f2', color: '#dc2626',
            fontSize: '12px', fontWeight: 600, marginBottom: '12px',
          }}>
            {error}
          </div>
        )}

        {/* Eylemler */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 18px', borderRadius: '8px', fontSize: '13px',
              fontWeight: 600, border: '1px solid #d1d5db',
              background: '#fff', color: '#374151', cursor: 'pointer',
            }}
          >
            İptal
          </button>
          <button
            onClick={handleConfirm}
            disabled={targets.length < 2}
            style={{
              padding: '8px 18px', borderRadius: '8px', fontSize: '13px',
              fontWeight: 600, border: 'none',
              background: targets.length < 2 ? '#d1d5db' : '#3b82f6',
              color: '#fff', cursor: targets.length < 2 ? 'not-allowed' : 'pointer',
            }}
          >
            ✂️ Böl ve Dağıt
          </button>
        </div>
      </div>
    </div>
  );
}
