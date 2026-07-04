'use client';

import React from 'react';
import { type ProgramBlock, BLOCK_TYPE_META, PRIORITY_META, GOAL_TYPE_META } from '@/lib/study-program-api';

/**
 * Takvim gridindeki tek bir çalışma kartı.
 * GoalType, BlockType label, Priority renk badge, edit/tamamla/sil/böl butonları.
 */

interface Props {
  block: ProgramBlock;
  onDragStart: (e: React.DragEvent, block: ProgramBlock) => void;
  onToggleComplete: (blockId: number) => void;
  onDelete: (blockId: number) => void;
  onEdit?: (block: ProgramBlock) => void;
  onSplit?: (block: ProgramBlock) => void;
}

export default function DayBlockCard({ block, onDragStart, onToggleComplete, onDelete, onEdit, onSplit }: Props) {
  const meta = BLOCK_TYPE_META[block.block_type] || { icon: '📋', label: block.block_type, color: '#6b7280' };
  const pri = PRIORITY_META[block.priority] || { label: 'Orta', color: '#eab308', icon: '🟡' };
  const goal = block.goal_type ? (GOAL_TYPE_META[block.goal_type] || null) : null;

  return (
    <div
      style={{
        backgroundColor: block.is_completed ? '#f0fdf4' : '#fff',
        border: `1px solid ${block.is_completed ? '#bbf7d0' : '#e5e7eb'}`,
        borderLeft: `4px solid ${block.color || meta.color}`,
        borderRadius: '8px',
        padding: '8px 10px',
        cursor: 'grab',
        transition: 'all .15s',
        opacity: block.is_completed ? 0.7 : 1,
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,.08)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* Üst satır: ders + blok tipi etiketi */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px', flexWrap: 'wrap', gap: '3px' }}>
        {block.lesson_name ? (
          <span style={{
            padding: '1px 6px',
            borderRadius: '8px',
            fontSize: '10px',
            fontWeight: 600,
            backgroundColor: `${block.color || meta.color}18`,
            color: block.color || meta.color,
          }}>
            {block.lesson_name}
          </span>
        ) : <span />}
        {/* Çalışma Türü — ikon + label */}
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: '2px',
          padding: '1px 5px', borderRadius: '6px', fontSize: '9px',
          fontWeight: 600, backgroundColor: `${meta.color}14`, color: meta.color,
        }}>
          {meta.icon} {meta.label}
        </span>
      </div>

      {/* Başlık */}
      <div style={{
        fontWeight: 600,
        fontSize: '12px',
        color: '#111827',
        marginBottom: '2px',
        lineHeight: '1.3',
        textDecoration: block.is_completed ? 'line-through' : 'none',
      }}>
        {block.title}
      </div>

      {/* Konu */}
      {block.topic_name && (
        <div style={{ fontSize: '10px', color: '#9ca3af', marginBottom: '4px' }}>{block.topic_name}</div>
      )}

      {/* Hedef Türü + Öncelik satırı */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px', flexWrap: 'wrap' }}>
        {/* Hedef türü badge */}
        {goal && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '2px',
            padding: '1px 5px', borderRadius: '6px', fontSize: '9px',
            fontWeight: 600, backgroundColor: '#f3f4f6', color: '#4b5563',
          }}>
            🎯 {goal.label}
          </span>
        )}
        {/* Öncelik badge */}
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: '2px',
          padding: '1px 5px', borderRadius: '6px', fontSize: '9px',
          fontWeight: 600, backgroundColor: `${pri.color}18`, color: pri.color,
        }}>
          {pri.icon} {pri.label}
        </span>
      </div>

      {/* Alt satır: soru + süre + aksiyon butonları */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#374151' }}>
            {block.question_count} soru
          </span>
          {block.estimated_duration_minutes && (
            <span style={{ fontSize: '10px', color: '#9ca3af' }}>
              ⏱ {block.estimated_duration_minutes}dk
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '3px' }}>
          {/* Düzenle */}
          {onEdit && !block.is_completed && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(block); }}
              style={actionBtnStyle('#3b82f6', '#dbeafe')}
              title="Düzenle"
            >
              ✏️
            </button>
          )}
          {/* Böl */}
          {onSplit && block.question_count > 1 && !block.is_completed && (
            <button
              onClick={(e) => { e.stopPropagation(); onSplit(block); }}
              style={actionBtnStyle('#6366f1', '#e0e7ff')}
              title="Günlere Böl"
            >
              ✂️
            </button>
          )}
          {/* Tamamla */}
          <button
            onClick={(e) => { e.stopPropagation(); onToggleComplete(block.id); }}
            style={{
              width: '20px', height: '20px',
              borderRadius: '4px',
              border: `1.5px solid ${block.is_completed ? '#22c55e' : '#d1d5db'}`,
              backgroundColor: block.is_completed ? '#22c55e' : 'transparent',
              color: block.is_completed ? '#fff' : '#6b7280',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', fontSize: '11px',
              transition: 'all .2s',
            }}
            title={block.is_completed ? 'Geri Al' : 'Tamamla'}
          >
            ✓
          </button>
          {/* Sil */}
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(block.id); }}
            style={actionBtnStyle('#ef4444', '#fee2e2')}
            title="Kaldır"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

/** Aksiyon buton stili helper */
function actionBtnStyle(color: string, bg: string): React.CSSProperties {
  return {
    width: '20px', height: '20px',
    borderRadius: '4px',
    border: `1px solid ${bg}`,
    backgroundColor: 'transparent',
    color: color,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', fontSize: '11px',
    transition: 'all .2s',
  };
}
