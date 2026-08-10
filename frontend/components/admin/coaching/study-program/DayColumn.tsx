'use client';

import React, { useEffect, useState } from 'react';
import {
  type ProgramDay, type ProgramBlock, type HomeworkPoolItem,
  LOAD_LEVEL_META, WEEKDAY_FULL,
} from '@/lib/study-program-api';
import DayBlockCard from './DayBlockCard';

interface Props {
  day: ProgramDay;
  /** Aralığın son günü = ödev kontrol günü */
  isControlDay?: boolean;
  onDropHomework: (dayId: number, item: HomeworkPoolItem) => void;
  onDropBlock: (dayId: number, block: ProgramBlock) => void;
  onToggleComplete: (blockId: number) => void;
  onDeleteBlock: (blockId: number) => void;
  onEditBlock?: (block: ProgramBlock) => void;
  onDragBlockStart: (e: React.DragEvent, block: ProgramBlock) => void;
  onReorderBlocks?: (dayId: number, orderedBlockIds: number[]) => void;
  onCoachNoteChange: (dayId: number, note: string) => void | Promise<void>;
  onSplitBlock?: (block: ProgramBlock) => void;
}

export default function DayColumn({
  day, isControlDay = false, onDropHomework, onDropBlock,
  onToggleComplete, onDeleteBlock, onEditBlock, onDragBlockStart,
  onReorderBlocks, onCoachNoteChange, onSplitBlock,
}: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [noteValue, setNoteValue] = useState(day.coach_note || '');
  const [noteSaving, setNoteSaving] = useState(false);
  const [reorderDragIdx, setReorderDragIdx] = useState<number | null>(null);
  const [reorderOverIdx, setReorderOverIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!editingNote) setNoteValue(day.coach_note || '');
  }, [day.coach_note, editingNote]);

  const load = LOAD_LEVEL_META[day.load_level] || LOAD_LEVEL_META.IDEAL;
  const pct = day.completion_percent;
  const hasNote = Boolean(day.coach_note?.trim());

  const handleDragOver = (e: React.DragEvent) => {
    if (isControlDay) return;
    e.preventDefault();
    setDragOver(true);
  };
  const handleDragLeave = () => setDragOver(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (isControlDay) return;
    const hwData = e.dataTransfer.getData('homework-pool-item');
    const blockData = e.dataTransfer.getData('program-block');
    if (hwData) {
      onDropHomework(day.id, JSON.parse(hwData));
    } else if (blockData) {
      onDropBlock(day.id, JSON.parse(blockData));
    }
  };

  const energyIcon = day.feedback?.energy_level === 'YUKSEK' ? '🟢'
    : day.feedback?.energy_level === 'DUSUK' ? '🔴' : day.feedback ? '🟡' : '';

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        flex: '1 1 0',
        minWidth: '160px',
        backgroundColor: isControlDay ? '#fffbeb' : dragOver ? '#eff6ff' : '#f8fafc',
        borderRadius: 12,
        border: isControlDay
          ? '1.5px solid #fbbf24'
          : dragOver
            ? '2px dashed #3b82f6'
            : '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        transition: 'all .15s',
        opacity: isControlDay ? 0.95 : 1,
        minHeight: 280,
      }}
    >
      {/* Header */}
      <div style={{ padding: '10px 10px 8px', borderBottom: '1px solid #e8eef5' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontWeight: 800, fontSize: 13, color: isControlDay ? '#b45309' : '#0f172a' }}>
            {WEEKDAY_FULL[day.weekday]?.slice(0, 3)}
          </span>
          <span style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>
            {new Date(`${day.day_date}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
          </span>
        </div>
        {isControlDay && (
          <div style={{
            marginBottom: 6, padding: '4px 8px', borderRadius: 6,
            background: '#fef3c7', color: '#92400e', fontSize: 10, fontWeight: 700, textAlign: 'center',
          }}>
            Kontrol günü
          </div>
        )}

        <div style={{ width: '100%', height: 3, backgroundColor: '#e2e8f0', borderRadius: 99, overflow: 'hidden', marginBottom: 6 }}>
          <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', backgroundColor: load.color, borderRadius: 99 }} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b' }}>
          <span>{day.total_question_count} soru</span>
          <span style={{ color: load.color, fontWeight: 700 }}>%{pct}</span>
          <span>{day.total_block_count} içerik</span>
        </div>

        {day.load_level === 'ASIRI' && (
          <div style={{
            marginTop: 4, padding: '3px 6px', borderRadius: 6, fontSize: 10,
            backgroundColor: '#fee2e2', color: '#dc2626', fontWeight: 600,
          }}>
            Yoğun gün
          </div>
        )}

        {energyIcon && (
          <div style={{ marginTop: 4, fontSize: 10, color: '#64748b' }}>
            Enerji: {energyIcon}
          </div>
        )}
      </div>

      {/* Bloklar */}
      <div style={{
        flex: 1,
        padding: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        overflowY: 'auto',
        minHeight: 100,
      }}>
        {day.blocks.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '28px 8px',
            color: isControlDay ? '#d97706' : '#94a3b8',
            fontSize: 12,
            border: isControlDay ? 'none' : '1px dashed #e2e8f0',
            borderRadius: 8,
          }}>
            {isControlDay ? 'Ödev kontrolü' : 'İçerik bırakın'}
          </div>
        ) : (
          [...day.blocks].sort((a, b) => a.order - b.order).map((b, idx) => (
            <div
              key={b.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('reorder-block', JSON.stringify({ blockId: b.id, fromIdx: idx }));
                onDragBlockStart(e, b);
                setReorderDragIdx(idx);
              }}
              onDragEnd={() => { setReorderDragIdx(null); setReorderOverIdx(null); }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setReorderOverIdx(idx);
              }}
              onDrop={(e) => {
                e.stopPropagation();
                const reorderData = e.dataTransfer.getData('reorder-block');
                if (reorderData && onReorderBlocks) {
                  const { fromIdx } = JSON.parse(reorderData);
                  if (fromIdx !== idx) {
                    const sorted = [...day.blocks].sort((a2, b2) => a2.order - b2.order);
                    const ids = sorted.map((bl) => bl.id);
                    const [moved] = ids.splice(fromIdx, 1);
                    ids.splice(idx, 0, moved);
                    onReorderBlocks(day.id, ids);
                  }
                }
                setReorderDragIdx(null);
                setReorderOverIdx(null);
              }}
              style={{
                opacity: reorderDragIdx === idx ? 0.4 : 1,
                borderTop: reorderOverIdx === idx && reorderDragIdx !== null && reorderDragIdx !== idx ? '2px solid #3b82f6' : 'none',
              }}
            >
              <DayBlockCard
                block={b}
                onDragStart={onDragBlockStart}
                onToggleComplete={onToggleComplete}
                onDelete={onDeleteBlock}
                onEdit={onEditBlock}
                onSplit={onSplitBlock}
              />
            </div>
          ))
        )}
      </div>

      {/* Koç notu — günün altında, her zaman görünür alan */}
      <div
        style={{
          marginTop: 'auto',
          padding: 8,
          borderTop: '1px solid #e8eef5',
          background: hasNote || editingNote ? '#fffbeb' : '#fff',
          borderRadius: '0 0 11px 11px',
        }}
      >
        {editingNote ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <textarea
              value={noteValue}
              onChange={(e) => setNoteValue(e.target.value)}
              placeholder="Bu güne not yazın…"
              rows={3}
              autoFocus
              style={{
                width: '100%',
                fontSize: 12,
                border: '1px solid #fcd34d',
                borderRadius: 8,
                padding: '8px 10px',
                resize: 'vertical',
                outline: 'none',
                background: '#fff',
                color: '#78350f',
                lineHeight: 1.4,
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => { setEditingNote(false); setNoteValue(day.coach_note || ''); }}
                style={noteBtn('#fff', '#64748b', '#e2e8f0')}
              >
                İptal
              </button>
              <button
                type="button"
                disabled={noteSaving}
                onClick={async () => {
                  setNoteSaving(true);
                  await onCoachNoteChange(day.id, noteValue);
                  setNoteSaving(false);
                  setEditingNote(false);
                }}
                style={{
                  ...noteBtn('#0f766e', '#fff', 'transparent'),
                  opacity: noteSaving ? 0.6 : 1,
                  cursor: noteSaving ? 'wait' : 'pointer',
                }}
              >
                {noteSaving ? '…' : 'Kaydet'}
              </button>
            </div>
          </div>
        ) : hasNote ? (
          <button
            type="button"
            onClick={() => setEditingNote(true)}
            style={{
              width: '100%',
              textAlign: 'left',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <div style={{
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: '#b45309',
              marginBottom: 4,
            }}>
              Koç notu
            </div>
            <div style={{
              fontSize: 12,
              color: '#78350f',
              lineHeight: 1.4,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {day.coach_note}
            </div>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setEditingNote(true)}
            style={{
              width: '100%',
              padding: '6px 4px',
              fontSize: 11,
              fontWeight: 600,
              color: '#94a3b8',
              background: 'transparent',
              border: '1px dashed #e2e8f0',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            + Koç notu
          </button>
        )}
      </div>
    </div>
  );
}

function noteBtn(bg: string, color: string, border: string): React.CSSProperties {
  return {
    padding: '5px 10px',
    fontSize: 11,
    fontWeight: 700,
    borderRadius: 6,
    border: border === 'transparent' ? 'none' : `1px solid ${border}`,
    backgroundColor: bg,
    color,
    cursor: 'pointer',
  };
}
