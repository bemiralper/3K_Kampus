'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { K3_MODES, K3_MODE_META, type K3Mode } from '@/lib/k3-mode';

interface K3ModePickerProps {
  value?: K3Mode | null;
  targetMinutes?: number | null;
  compact?: boolean;
  onChange: (mode: K3Mode | null, targetMinutes: number | null) => void;
}

export default function K3ModePicker({
  value,
  targetMinutes,
  compact = true,
  onChange,
}: K3ModePickerProps) {
  const meta = value ? K3_MODE_META[value] : null;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 128;
      setMenuPos({
        top: rect.bottom + 4,
        left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
      });
    };
    place();
    const close = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', close, true);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', close, true);
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span
      ref={rootRef}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label="3K Modu"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: compact ? '2px 6px' : '4px 8px',
          borderRadius: 6,
          border: `1px solid ${meta?.border || '#dbe3ee'}`,
          background: meta?.bg || '#fff',
          color: meta?.color || '#64748b',
          fontSize: compact ? 10 : 11,
          fontWeight: 700,
          letterSpacing: 0.15,
          cursor: 'pointer',
          lineHeight: 1.2,
        }}
      >
        <span>{meta?.label || '3K Modu'}</span>
        <span style={{ fontSize: 8, opacity: 0.5, transform: open ? 'rotate(180deg)' : 'none' }}>▾</span>
      </button>
      {open && (
        <div
          role="listbox"
          aria-label="3K Modu"
          style={{
            position: 'fixed',
            top: menuPos.top,
            left: menuPos.left,
            width: 128,
            zIndex: 80,
            padding: 4,
            borderRadius: 8,
            border: '1px solid #e2e8f0',
            background: '#fff',
            boxShadow: '0 8px 20px rgba(15, 23, 42, 0.12)',
          }}
        >
          <button
            type="button"
            role="option"
            aria-selected={!value}
            onClick={() => {
              onChange(null, null);
              setOpen(false);
            }}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '5px 8px',
              border: 'none',
              borderRadius: 5,
              background: !value ? '#f8fafc' : 'transparent',
              color: '#64748b',
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Seçilmedi
          </button>
          {K3_MODES.map((m) => {
            const active = value === m.code;
            return (
              <button
                key={m.code}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(m.code, m.code === 'HIZLAN' ? (targetMinutes ?? null) : null);
                  setOpen(false);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '5px 8px',
                  border: 'none',
                  borderRadius: 5,
                  background: active ? m.bg : 'transparent',
                  color: m.color,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 0.15,
                  cursor: 'pointer',
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      )}
      {value === 'HIZLAN' && (
        <input
          type="number"
          min={1}
          placeholder="dk"
          title="Hedef süre (dakika)"
          value={targetMinutes && targetMinutes > 0 ? targetMinutes : ''}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            onChange('HIZLAN', Number.isFinite(n) && n > 0 ? n : null);
          }}
          style={{
            width: 44,
            padding: compact ? '2px 4px' : '4px 6px',
            borderRadius: 6,
            border: '1px solid #fed7aa',
            background: '#fff7ed',
            fontSize: 10,
            fontWeight: 700,
            color: '#c2410c',
          }}
        />
      )}
    </span>
  );
}

export function K3ModeBadge({
  mode,
  targetMinutes,
}: {
  mode?: string | null;
  targetMinutes?: number | null;
}) {
  const meta = mode ? K3_MODE_META[mode as K3Mode] : null;
  if (!meta) return null;
  return (
    <span
      title={meta.pdfText}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '1px 7px',
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 700,
        color: meta.color,
        background: meta.bg,
        border: `1px solid ${meta.border}`,
        letterSpacing: 0.2,
        whiteSpace: 'nowrap',
      }}
    >
      {meta.label}
      {mode === 'HIZLAN' && targetMinutes ? ` · ${targetMinutes} dk` : ''}
    </span>
  );
}

/** Plan / rapor konu satırı: solda 3K Odak + açıklama, sağda konu ve soru */
export function K3TopicFocusRow({
  mode,
  targetMinutes,
  topicName,
  questionLabel,
  trailing,
}: {
  mode?: string | null;
  targetMinutes?: number | null;
  topicName: string;
  questionLabel?: string | null;
  trailing?: ReactNode;
}) {
  const meta = mode ? K3_MODE_META[mode as K3Mode] : null;
  const duration = mode === 'HIZLAN' && targetMinutes ? ` · ${targetMinutes} dk` : '';

  const topicColor = meta?.color || '#0061a6';
  const printInk = {
    WebkitPrintColorAdjust: 'exact' as const,
    printColorAdjust: 'exact' as const,
  };

  const topicTitle = (
    <div style={{
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: meta ? 'flex-end' : 'flex-start',
      gap: 8,
    }}>
      <div style={{
        fontSize: 11,
        fontWeight: 800,
        color: topicColor,
        wordBreak: 'break-word',
        overflowWrap: 'anywhere',
        lineHeight: 1.3,
        minWidth: 0,
        ...printInk,
      }}>
        {topicName}
      </div>
      {trailing ? <div style={{ flexShrink: 0, lineHeight: 1.3 }}>{trailing}</div> : null}
    </div>
  );

  if (!meta) {
    return (
      <div>
        {topicTitle}
        {questionLabel ? (
          <div style={{ fontSize: 10, fontWeight: 600, color: '#475569', marginTop: 2 }}>
            {questionLabel}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 12,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: 0.2,
          color: meta.color,
          lineHeight: 1.25,
          ...printInk,
        }}>
          3K ODAK : {meta.label}{duration}
        </div>
        <div style={{
          marginTop: 2,
          fontSize: 9,
          fontWeight: 500,
          color: '#475569',
          lineHeight: 1.35,
        }}>
          {meta.pdfText}
        </div>
      </div>
      <div style={{
        textAlign: 'right',
        flexShrink: 0,
        maxWidth: '48%',
      }}>
        {topicTitle}
        {questionLabel ? (
          <div style={{ fontSize: 10, fontWeight: 600, color: '#475569', marginTop: 2 }}>
            {questionLabel}
          </div>
        ) : null}
      </div>
    </div>
  );
}
