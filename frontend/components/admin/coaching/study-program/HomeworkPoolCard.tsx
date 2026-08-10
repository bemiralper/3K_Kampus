'use client';

import React from 'react';
import { type HomeworkPoolItem, PRIORITY_META } from '@/lib/study-program-api';
import { lessonAccent } from './blockDisplay';

interface Props {
  item: HomeworkPoolItem;
  onDragStart: (e: React.DragEvent, item: HomeworkPoolItem) => void;
  onSplit?: (item: HomeworkPoolItem) => void;
  /** Ders grubu altında gösteriliyorsa ders adını kartta tekrarlama */
  hideLessonName?: boolean;
}

export default function HomeworkPoolCard({
  item,
  onDragStart,
  onSplit,
  hideLessonName = false,
}: Props) {
  const accent = lessonAccent(item.lesson_name);
  const pri = PRIORITY_META[item.priority as keyof typeof PRIORITY_META];
  const topic = item.topic_name?.trim();

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, item)}
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        padding: '10px 12px',
        background: '#fff',
        borderRadius: 10,
        border: '1px solid #e8eef5',
        borderLeft: `3px solid ${accent}`,
        cursor: 'grab',
        transition: 'box-shadow .15s, border-color .15s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 4px 14px rgba(15,23,42,0.08)';
        e.currentTarget.style.borderColor = '#c7d7ea';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.borderColor = '#e8eef5';
      }}
    >
      <span
        aria-hidden
        style={{
          color: '#cbd5e1',
          fontSize: 13,
          lineHeight: 1.2,
          marginTop: 2,
          letterSpacing: -1,
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        ⋮⋮
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        {!hideLessonName && item.lesson_name && (
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: accent,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              marginBottom: 3,
            }}
          >
            {item.lesson_name}
          </div>
        )}
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: '#0f172a',
            lineHeight: 1.3,
            wordBreak: 'break-word',
          }}
        >
          {topic || item.lesson_name || item.title || 'İçerik'}
        </div>
        {item.resource_name && (
          <div
            style={{
              fontSize: 11,
              color: '#64748b',
              marginTop: 3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {item.resource_name}
          </div>
        )}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 6,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
            {item.question_count || 0} soru
          </span>
          {pri && (
            <span style={{ fontSize: 10, fontWeight: 600, color: pri.color }}>
              {pri.label}
            </span>
          )}
        </div>
      </div>

      {onSplit && item.question_count > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onSplit(item);
          }}
          title="Günlere böl"
          style={{
            flexShrink: 0,
            padding: '6px 8px',
            borderRadius: 8,
            border: '1px solid #e2e8f0',
            background: '#f8fafc',
            color: '#475569',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Böl
        </button>
      )}
    </div>
  );
}
