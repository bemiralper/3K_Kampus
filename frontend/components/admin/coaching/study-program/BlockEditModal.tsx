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
} from '@/lib/study-program-api';

interface Props {
  block: ProgramBlock;
  onSave: (blockId: number, data: Partial<ProgramBlock>) => void;
  onClose: () => void;
}

export default function BlockEditModal({ block, onSave, onClose }: Props) {
  const [title, setTitle] = useState(block.title);
  const [topicName, setTopicName] = useState(block.topic_name || '');
  const [resourceName, setResourceName] = useState(block.resource_name || '');
  const [blockType, setBlockType] = useState<BlockType>(block.block_type);
  const [goalType, setGoalType] = useState<GoalType | ''>(block.goal_type || '');
  const [priority, setPriority] = useState<Priority>(block.priority || 'MEDIUM');
  const [questionCount, setQuestionCount] = useState(block.question_count || 0);
  const [estimatedDuration, setEstimatedDuration] = useState(block.estimated_duration_minutes || 0);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setSaving(true);
    await onSave(block.id, {
      title,
      topic_name: topicName,
      resource_name: resourceName,
      block_type: blockType,
      goal_type: goalType || undefined,
      priority,
      question_count: questionCount,
      estimated_duration_minutes: estimatedDuration || null,
    } as Partial<ProgramBlock>);
    setSaving(false);
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        backgroundColor: 'rgba(0,0,0,.45)', zIndex: 1100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#fff', borderRadius: '16px',
          padding: '24px', width: '480px', maxHeight: '90vh',
          overflowY: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,.2)',
        }}
      >
        <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 700, color: '#111827' }}>
          ✏️ Bloğu Düzenle
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {/* Başlık */}
          <FieldGroup label="Başlık">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={inputStyle}
              placeholder="Başlık"
            />
          </FieldGroup>

          {/* Konu */}
          <FieldGroup label="Konu">
            <input
              value={topicName}
              onChange={(e) => setTopicName(e.target.value)}
              style={inputStyle}
              placeholder="Konu adı"
            />
          </FieldGroup>

          {/* Kaynak */}
          <FieldGroup label="Kaynak">
            <input
              value={resourceName}
              onChange={(e) => setResourceName(e.target.value)}
              style={inputStyle}
              placeholder="Kaynak kitap / materyal"
            />
          </FieldGroup>

          {/* Çalışma Türü */}
          <FieldGroup label="Çalışma Türü">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {(Object.keys(BLOCK_TYPE_META) as BlockType[]).map((bt) => {
                const m = BLOCK_TYPE_META[bt];
                const selected = blockType === bt;
                return (
                  <button
                    key={bt}
                    onClick={() => setBlockType(bt)}
                    style={{
                      padding: '4px 10px', borderRadius: '8px',
                      border: selected ? `2px solid ${m.color}` : '1px solid #e5e7eb',
                      backgroundColor: selected ? `${m.color}14` : '#fff',
                      color: selected ? m.color : '#6b7280',
                      fontSize: '12px', fontWeight: selected ? 700 : 400,
                      cursor: 'pointer', transition: 'all .15s',
                      display: 'flex', alignItems: 'center', gap: '4px',
                    }}
                  >
                    {m.icon} {m.label}
                  </button>
                );
              })}
            </div>
          </FieldGroup>

          {/* Hedef Türü */}
          <FieldGroup label="Hedef Türü">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              <button
                onClick={() => setGoalType('')}
                style={{
                  padding: '4px 10px', borderRadius: '8px',
                  border: goalType === '' ? '2px solid #6b7280' : '1px solid #e5e7eb',
                  backgroundColor: goalType === '' ? '#f3f4f6' : '#fff',
                  color: '#6b7280', fontSize: '12px', cursor: 'pointer',
                  fontWeight: goalType === '' ? 700 : 400,
                }}
              >
                Yok
              </button>
              {(Object.keys(GOAL_TYPE_META) as GoalType[]).map((gt) => {
                const g = GOAL_TYPE_META[gt];
                const selected = goalType === gt;
                return (
                  <button
                    key={gt}
                    onClick={() => setGoalType(gt)}
                    style={{
                      padding: '4px 10px', borderRadius: '8px',
                      border: selected ? '2px solid #6366f1' : '1px solid #e5e7eb',
                      backgroundColor: selected ? '#eef2ff' : '#fff',
                      color: selected ? '#6366f1' : '#6b7280',
                      fontSize: '12px', fontWeight: selected ? 700 : 400,
                      cursor: 'pointer', transition: 'all .15s',
                      display: 'flex', alignItems: 'center', gap: '4px',
                    }}
                  >
                    {g.icon} {g.label}
                  </button>
                );
              })}
            </div>
          </FieldGroup>

          {/* Öncelik */}
          <FieldGroup label="Öncelik Seviyesi">
            <div style={{ display: 'flex', gap: '6px' }}>
              {(Object.keys(PRIORITY_META) as Priority[]).map((p) => {
                const pm = PRIORITY_META[p];
                const selected = priority === p;
                return (
                  <button
                    key={p}
                    onClick={() => setPriority(p)}
                    style={{
                      padding: '4px 12px', borderRadius: '8px',
                      border: selected ? `2px solid ${pm.color}` : '1px solid #e5e7eb',
                      backgroundColor: selected ? `${pm.color}14` : '#fff',
                      color: selected ? pm.color : '#6b7280',
                      fontSize: '12px', fontWeight: selected ? 700 : 400,
                      cursor: 'pointer', transition: 'all .15s',
                      display: 'flex', alignItems: 'center', gap: '4px',
                    }}
                  >
                    {pm.icon} {pm.label}
                  </button>
                );
              })}
            </div>
          </FieldGroup>

          {/* Sayısal alanlar */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FieldGroup label="Soru Sayısı">
              <input
                type="number"
                min={0}
                value={questionCount}
                onChange={(e) => setQuestionCount(parseInt(e.target.value) || 0)}
                style={inputStyle}
              />
            </FieldGroup>
            <FieldGroup label="Tahmini Süre (dk)">
              <input
                type="number"
                min={0}
                value={estimatedDuration}
                onChange={(e) => setEstimatedDuration(parseInt(e.target.value) || 0)}
                style={inputStyle}
              />
            </FieldGroup>
          </div>
        </div>

        {/* Butonlar */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px', borderRadius: '8px',
              border: '1px solid #d1d5db', backgroundColor: '#fff',
              color: '#374151', fontSize: '13px', cursor: 'pointer',
            }}
          >
            İptal
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !title.trim()}
            style={{
              padding: '8px 20px', borderRadius: '8px',
              border: 'none', backgroundColor: '#3b82f6',
              color: '#fff', fontSize: '13px', fontWeight: 600,
              cursor: saving ? 'wait' : 'pointer',
              opacity: saving || !title.trim() ? 0.6 : 1,
              transition: 'all .15s',
            }}
          >
            {saving ? 'Kaydediliyor...' : '💾 Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Helpers ─── */

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: '8px',
  border: '1px solid #d1d5db',
  fontSize: '13px',
  outline: 'none',
  transition: 'border-color .15s',
};
