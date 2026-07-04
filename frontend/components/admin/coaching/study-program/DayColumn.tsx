'use client';

import React, { useState } from 'react';
import {
  type ProgramDay, type ProgramBlock, type HomeworkPoolItem,
  LOAD_LEVEL_META, WEEKDAY_FULL,
} from '@/lib/study-program-api';
import DayBlockCard from './DayBlockCard';

/**
 * Tek bir gün kolonu (drop-zone).
 * Yük barı, tamamlanma yüzdesi, blok listesi, feedback özeti.
 */

interface Props {
  day: ProgramDay;
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
  day, onDropHomework, onDropBlock,
  onToggleComplete, onDeleteBlock, onEditBlock, onDragBlockStart,
  onReorderBlocks, onCoachNoteChange, onSplitBlock,
}: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteValue, setNoteValue] = useState(day.coach_note || '');
  const [noteSaving, setNoteSaving] = useState(false);
  const [reorderDragIdx, setReorderDragIdx] = useState<number | null>(null);
  const [reorderOverIdx, setReorderOverIdx] = useState<number | null>(null);

  const load = LOAD_LEVEL_META[day.load_level] || LOAD_LEVEL_META.IDEAL;
  const pct = day.completion_percent;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };
  const handleDragLeave = () => setDragOver(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const hwData = e.dataTransfer.getData('homework-pool-item');
    const blockData = e.dataTransfer.getData('program-block');
    if (hwData) {
      onDropHomework(day.id, JSON.parse(hwData));
    } else if (blockData) {
      onDropBlock(day.id, JSON.parse(blockData));
    }
  };

  // Enerji ikonu
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
        backgroundColor: dragOver ? '#eff6ff' : '#f9fafb',
        borderRadius: '10px',
        border: dragOver ? '2px dashed #3b82f6' : '1px solid #e5e7eb',
        display: 'flex',
        flexDirection: 'column',
        transition: 'all .15s',
      }}
    >
      {/* Header */}
      <div style={{ padding: '10px 10px 6px', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ fontWeight: 700, fontSize: '13px', color: '#111827' }}>
            {WEEKDAY_FULL[day.weekday]?.slice(0, 3)}
          </span>
          <span style={{ fontSize: '11px', color: '#6b7280' }}>
            {new Date(day.day_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
          </span>
        </div>

        {/* Yük barı */}
        <div style={{ width: '100%', height: '4px', backgroundColor: '#e5e7eb', borderRadius: '99px', overflow: 'hidden', marginBottom: '6px' }}>
          <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', backgroundColor: load.color, borderRadius: '99px', transition: 'width .4s' }} />
        </div>

        {/* Metrikler */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#6b7280' }}>
          <span>{day.total_question_count} soru</span>
          <span style={{ color: load.color, fontWeight: 600 }}>%{pct}</span>
          <span>{day.total_block_count} blok</span>
        </div>

        {/* Aşırı yük uyarısı */}
        {day.load_level === 'ASIRI' && (
          <div style={{
            marginTop: '4px', padding: '3px 6px',
            borderRadius: '6px', fontSize: '10px',
            backgroundColor: '#fee2e2', color: '#dc2626',
            fontWeight: 600,
          }}>
            ⚠ Yoğun gün!
          </div>
        )}

        {/* Enerji */}
        {energyIcon && (
          <div style={{ marginTop: '4px', fontSize: '10px', color: '#6b7280' }}>
            Enerji: {energyIcon}
          </div>
        )}
      </div>

      {/* Bloklar */}
      <div style={{
        flex: 1,
        padding: '6px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        overflowY: 'auto',
        minHeight: '120px',
      }}>
        {day.blocks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: '#d1d5db', fontSize: '12px' }}>
            Sürükle bırak
          </div>
        ) : (
          [...day.blocks].sort((a, b) => a.order - b.order).map((b, idx) => (
            <div
              key={b.id}
              draggable
              onDragStart={(e) => {
                // İç reorder vs dış taşıma ayrımı
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
                transition: 'opacity .15s',
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

      {/* Koç notu (küçük) */}
      <div style={{ padding: '6px', borderTop: '1px solid #e5e7eb' }}>
        {showNoteInput ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <textarea
              value={noteValue}
              onChange={(e) => setNoteValue(e.target.value)}
              placeholder="Koç notu..."
              rows={2}
              autoFocus
              style={{
                width: '100%',
                fontSize: '11px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                padding: '4px 6px',
                resize: 'none',
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowNoteInput(false); setNoteValue(day.coach_note || ''); }}
                style={{
                  padding: '3px 8px', fontSize: '10px', borderRadius: '4px',
                  border: '1px solid #d1d5db', backgroundColor: '#fff', cursor: 'pointer', color: '#6b7280',
                }}
              >
                İptal
              </button>
              <button
                onClick={async () => {
                  setNoteSaving(true);
                  await onCoachNoteChange(day.id, noteValue);
                  setNoteSaving(false);
                  setShowNoteInput(false);
                }}
                disabled={noteSaving}
                style={{
                  padding: '3px 8px', fontSize: '10px', borderRadius: '4px',
                  border: 'none', backgroundColor: '#3b82f6', color: '#fff',
                  cursor: noteSaving ? 'wait' : 'pointer', fontWeight: 600,
                  opacity: noteSaving ? 0.6 : 1,
                }}
              >
                {noteSaving ? '...' : '💾 Kaydet'}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowNoteInput(true)}
            style={{
              width: '100%',
              padding: '4px',
              fontSize: '10px',
              color: day.coach_note ? '#3b82f6' : '#9ca3af',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            {day.coach_note ? `💬 ${day.coach_note.slice(0, 40)}${day.coach_note.length > 40 ? '...' : ''}` : '+ Koç notu ekle'}
          </button>
        )}
      </div>
    </div>
  );
}
