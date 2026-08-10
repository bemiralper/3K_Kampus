'use client';

import React from 'react';
import { type ProgramBlock, BLOCK_TYPE_META, GOAL_TYPE_META } from '@/lib/study-program-api';
import { lessonAccent, primaryBlockLabel } from './blockDisplay';

interface Props {
  block: ProgramBlock;
  onDragStart: (e: React.DragEvent, block: ProgramBlock) => void;
  /** İleride kullanılacak — şimdilik UI’da yok */
  onToggleComplete?: (blockId: number) => void;
  onDelete: (blockId: number) => void;
  onEdit?: (block: ProgramBlock) => void;
  onSplit?: (block: ProgramBlock) => void;
}

export default function DayBlockCard({
  block,
  onDelete,
  onEdit,
  onSplit,
}: Props) {
  const typeKey = block.block_type === 'ZAYIF_KONU' ? 'SORU_COZUMU' : block.block_type;
  const meta = BLOCK_TYPE_META[typeKey] || { icon: '📝', label: block.block_type, color: '#64748b' };
  const goal = block.goal_type ? GOAL_TYPE_META[block.goal_type] || null : null;
  const accent = block.color || lessonAccent(block.lesson_name);
  const topicLine = primaryBlockLabel(block);

  return (
    <div
      style={{
        background: block.is_completed ? '#f0fdf4' : '#fff',
        border: `1px solid ${block.is_completed ? '#bbf7d0' : '#e8eef5'}`,
        borderRadius: 10,
        padding: '10px 10px 8px',
        cursor: 'grab',
        opacity: block.is_completed ? 0.72 : 1,
      }}
    >
      {block.lesson_name && (
        <div
          style={{
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: accent,
            marginBottom: 4,
          }}
        >
          {block.lesson_name}
        </div>
      )}

      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: '#0f172a',
          lineHeight: 1.3,
          textDecoration: block.is_completed ? 'line-through' : 'none',
          marginBottom: 4,
          wordBreak: 'break-word',
        }}
      >
        {topicLine}
      </div>

      {block.resource_name?.trim() && (
        <div
          style={{
            fontSize: 10,
            color: '#64748b',
            marginBottom: 6,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {block.resource_name}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: meta.color,
            background: `${meta.color}14`,
            borderRadius: 6,
            padding: '2px 6px',
          }}
        >
          {meta.label}
        </span>
        {goal && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: '#9a3412',
              background: '#fff7ed',
              borderRadius: 6,
              padding: '2px 6px',
            }}
          >
            {goal.label}
          </span>
        )}
        <span style={{ fontSize: 11, fontWeight: 700, color: '#334155', marginLeft: 'auto' }}>
          {block.question_count} soru
        </span>
      </div>

      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
        {onEdit && !block.is_completed && (
          <IconBtn title="Düzenle" onClick={() => onEdit(block)}>✎</IconBtn>
        )}
        {onSplit && block.question_count > 1 && !block.is_completed && (
          <IconBtn title="Böl" onClick={() => onSplit(block)}>✂</IconBtn>
        )}
        <IconBtn title="Kaldır" onClick={() => onDelete(block.id)} danger>
          ×
        </IconBtn>
      </div>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  active,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        width: 24,
        height: 24,
        borderRadius: 6,
        border: `1px solid ${active ? '#86efac' : danger ? '#fecaca' : '#e2e8f0'}`,
        background: active ? '#22c55e' : '#fff',
        color: active ? '#fff' : danger ? '#dc2626' : '#64748b',
        fontSize: 12,
        fontWeight: 700,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </button>
  );
}
