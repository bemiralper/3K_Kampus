'use client';

import React from 'react';
import { type HomeworkPoolItem, PRIORITY_META } from '@/lib/study-program-api';

/**
 * Ödev havuzundaki tek bir kart.
 * Ders rengi, konu, soru sayısı, öncelik badge.
 * Drag edilebilir.
 */

// Ders adına göre sabit renk
const LESSON_COLORS: Record<string, string> = {
  Matematik: '#3b82f6',
  'Türkçe': '#ef4444',
  Fen: '#22c55e',
  'Fen Bilimleri': '#22c55e',
  Sosyal: '#f97316',
  'İngilizce': '#8b5cf6',
  Din: '#6366f1',
};

function lessonColor(name: string | null): string {
  if (!name) return '#6b7280';
  for (const [key, color] of Object.entries(LESSON_COLORS)) {
    if (name.toLowerCase().includes(key.toLowerCase())) return color;
  }
  return '#6b7280';
}

interface Props {
  item: HomeworkPoolItem;
  onDragStart: (e: React.DragEvent, item: HomeworkPoolItem) => void;
  onSplit?: (item: HomeworkPoolItem) => void;
}

export default function HomeworkPoolCard({ item, onDragStart, onSplit }: Props) {
  const lColor = lessonColor(item.lesson_name);
  const pri = PRIORITY_META[item.priority as keyof typeof PRIORITY_META];

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, item)}
      style={{
        backgroundColor: '#fff',
        border: '1px solid #e5e7eb',
        borderLeft: `4px solid ${lColor}`,
        borderRadius: '8px',
        padding: '10px 12px',
        cursor: 'grab',
        transition: 'box-shadow .15s, transform .15s',
        opacity: item.is_planned ? 0.45 : 1,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,.1)';
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.transform = 'none';
      }}
    >
      {/* Ders badge */}
      {item.lesson_name && (
        <span style={{
          display: 'inline-block',
          padding: '2px 8px',
          borderRadius: '10px',
          fontSize: '11px',
          fontWeight: 600,
          backgroundColor: `${lColor}18`,
          color: lColor,
          marginBottom: '6px',
        }}>
          {item.lesson_name}
        </span>
      )}

      {/* Başlık */}
      <div style={{ fontWeight: 600, fontSize: '13px', color: '#111827', marginBottom: '4px', lineHeight: '1.3' }}>
        {item.title}
      </div>

      {/* Konu + Kaynak */}
      {item.topic_name && (
        <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '2px' }}>{item.topic_name}</div>
      )}
      {item.resource_name && (
        <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '6px' }}>📚 {item.resource_name}</div>
      )}
      {item.coach_name && (
        <div style={{ fontSize: '10px', color: '#6366f1', marginBottom: '6px' }}>
          Koç: {item.coach_name}
        </div>
      )}

      {/* Alt bilgi satırı */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>
          {item.question_count} Soru
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {onSplit && item.question_count > 1 && !item.is_planned && (
            <button
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); onSplit(item); }}
              style={{
                padding: '2px 6px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 600,
                border: '1px solid #c7d2fe',
                backgroundColor: '#eef2ff',
                color: '#4f46e5',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '2px',
              }}
              title="Günlere bölerek ekle"
            >
              ✂️ Böl
            </button>
          )}
        {pri && (
          <span style={{
            padding: '1px 6px',
            borderRadius: '8px',
            fontSize: '10px',
            fontWeight: 600,
            backgroundColor: `${pri.color}18`,
            color: pri.color,
          }}>
            {pri.label}
          </span>
        )}
        </div>
      </div>

      {item.is_planned && (
        <div style={{
          marginTop: '6px',
          fontSize: '10px',
          color: '#22c55e',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}>
          ✓ Planlandı
        </div>
      )}
    </div>
  );
}
