'use client';

import React, { useState } from 'react';
import {
  type ProgramBlock,
  type BlockType,
  type GoalType,
  type Priority,
  BLOCK_TYPE_META,
  GOAL_TYPE_META,
  PRIORITY_META,
  SELECTABLE_BLOCK_TYPES,
  SELECTABLE_GOAL_TYPES,
} from '@/lib/study-program-api';
import { isWeekHomeworkTitle, lessonAccent, primaryBlockLabel } from './blockDisplay';

interface Props {
  block: ProgramBlock;
  onSave: (blockId: number, data: Partial<ProgramBlock>) => void;
  onClose: () => void;
}

export default function BlockEditModal({ block, onSave, onClose }: Props) {
  const topicPrimary = primaryBlockLabel(block);
  const hideTitle = isWeekHomeworkTitle(block.title);

  const [topicName, setTopicName] = useState(block.topic_name || topicPrimary || '');
  const [title, setTitle] = useState(hideTitle ? '' : block.title);
  const [resourceName, setResourceName] = useState(block.resource_name || '');
  const initialType = SELECTABLE_BLOCK_TYPES.includes(block.block_type)
    ? block.block_type
    : 'SORU_COZUMU';
  const [blockType, setBlockType] = useState<BlockType>(initialType);
  const [goalType, setGoalType] = useState<GoalType | ''>(block.goal_type || '');
  const [priority, setPriority] = useState<Priority>(block.priority || 'MEDIUM');
  const [questionCount, setQuestionCount] = useState(block.question_count || 0);
  const [estimatedDuration, setEstimatedDuration] = useState(block.estimated_duration_minutes || 0);
  const [saving, setSaving] = useState(false);

  const accent = block.color || lessonAccent(block.lesson_name);
  const fromSplit = Boolean(block.source_assignment);

  const handleSubmit = async () => {
    const nextTopic = topicName.trim();
    const nextTitle = title.trim() || nextTopic || block.lesson_name || block.title;
    setSaving(true);
    await onSave(block.id, {
      title: nextTitle,
      topic_name: nextTopic,
      resource_name: resourceName.trim(),
      block_type: blockType,
      goal_type: goalType as GoalType | '',
      priority,
      question_count: questionCount,
      estimated_duration_minutes: estimatedDuration || null,
    } as Partial<ProgramBlock>);
    setSaving(false);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
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
        {/* Header */}
        <div style={{
          padding: '18px 20px 14px',
          borderBottom: '1px solid #e8eef5',
          borderLeft: `4px solid ${accent}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              {block.lesson_name && (
                <div style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  color: accent,
                  marginBottom: 4,
                }}>
                  {block.lesson_name}
                </div>
              )}
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a', lineHeight: 1.25 }}>
                Çalışmayı düzenle
              </h3>
              {fromSplit && (
                <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>
                  Çalışma türü ve hedef, aynı ödevin diğer parçalarına da uygulanır.
                </p>
              )}
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
        </div>

        <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Field label="Konu başlığı">
            <input
              value={topicName}
              onChange={(e) => setTopicName(e.target.value)}
              style={inputStyle}
              placeholder="Örn. Üslü sayılar"
              autoFocus
            />
          </Field>

          <Field label="Kaynak">
            <input
              value={resourceName}
              onChange={(e) => setResourceName(e.target.value)}
              style={inputStyle}
              placeholder="Kitap / fasikül"
            />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Soru">
              <input
                type="number"
                min={0}
                value={questionCount}
                onChange={(e) => setQuestionCount(parseInt(e.target.value, 10) || 0)}
                style={inputStyle}
              />
            </Field>
            <Field label="Süre (dk)">
              <input
                type="number"
                min={0}
                value={estimatedDuration}
                onChange={(e) => setEstimatedDuration(parseInt(e.target.value, 10) || 0)}
                style={inputStyle}
              />
            </Field>
          </div>

          <Field label="Çalışma türü">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {SELECTABLE_BLOCK_TYPES.map((bt) => {
                const m = BLOCK_TYPE_META[bt];
                const selected = blockType === bt;
                return (
                  <button
                    key={bt}
                    type="button"
                    onClick={() => setBlockType(bt)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: selected ? `2px solid ${m.color}` : '1px solid #e2e8f0',
                      backgroundColor: selected ? `${m.color}12` : '#fff',
                      color: selected ? m.color : '#334155',
                      fontSize: 13,
                      fontWeight: selected ? 700 : 500,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Hedef türü">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <Chip label="Hedef yok" selected={goalType === ''} onClick={() => setGoalType('')} />
              {SELECTABLE_GOAL_TYPES.map((gt) => (
                <Chip
                  key={gt}
                  label={GOAL_TYPE_META[gt].label}
                  selected={goalType === gt}
                  onClick={() => setGoalType(gt)}
                />
              ))}
            </div>
          </Field>

          <Field label="Öncelik">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {(Object.keys(PRIORITY_META) as Priority[]).map((p) => {
                const pm = PRIORITY_META[p];
                return (
                  <Chip
                    key={p}
                    label={pm.label}
                    selected={priority === p}
                    color={pm.color}
                    onClick={() => setPriority(p)}
                  />
                );
              })}
            </div>
          </Field>

          {!hideTitle && (
            <Field label="Ek başlık (isteğe bağlı)">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={inputStyle}
                placeholder="Boş bırakılabilir"
              />
            </Field>
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
          <button type="button" onClick={onClose} style={secondaryBtn}>
            İptal
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || !topicName.trim()}
            style={{
              ...primaryBtn,
              opacity: saving || !topicName.trim() ? 0.55 : 1,
              cursor: saving ? 'wait' : 'pointer',
            }}
          >
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{
        display: 'block',
        fontSize: 11,
        fontWeight: 700,
        color: '#64748b',
        marginBottom: 6,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
      }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Chip({
  label,
  selected,
  onClick,
  color = '#0f766e',
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '8px 12px',
        borderRadius: 10,
        border: selected ? `1.5px solid ${color}` : '1px solid #e2e8f0',
        backgroundColor: selected ? `${color}14` : '#fff',
        color: selected ? color : '#475569',
        fontSize: 12,
        fontWeight: selected ? 700 : 500,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '11px 12px',
  borderRadius: 10,
  border: '1px solid #e2e8f0',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
  color: '#0f172a',
};

const secondaryBtn: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: 10,
  border: '1px solid #e2e8f0',
  backgroundColor: '#fff',
  color: '#334155',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const primaryBtn: React.CSSProperties = {
  padding: '10px 20px',
  borderRadius: 10,
  border: 'none',
  backgroundColor: '#0f766e',
  color: '#fff',
  fontSize: 13,
  fontWeight: 700,
};
