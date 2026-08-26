'use client';

import { useEffect, useRef, useState } from 'react';
import { isEmptyNoteHtml, sanitizeNoteHtml } from '@/lib/note-html';

const PRESET_COLORS = [
  { label: 'Siyah', value: '#0f172a' },
  { label: 'Kırmızı', value: '#dc2626' },
  { label: 'Turuncu', value: '#d97706' },
  { label: 'Mavi', value: '#2563eb' },
  { label: 'Yeşil', value: '#16a34a' },
];

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  compact?: boolean;
  autoFocus?: boolean;
  onEscape?: () => void;
};

export default function NoteRichEditor({
  value,
  onChange,
  placeholder = 'Not yazın…',
  minHeight = 64,
  compact = false,
  autoFocus = false,
  onEscape,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [color, setColor] = useState('#0f172a');

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (document.activeElement !== el && el.innerHTML !== (value || '')) {
      el.innerHTML = value || '';
    }
  }, [value]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const emit = () => {
    if (!ref.current) return;
    const html = sanitizeNoteHtml(ref.current.innerHTML);
    onChange(isEmptyNoteHtml(html) ? '' : html);
  };

  const exec = (command: string, arg?: string) => {
    ref.current?.focus();
    try {
      document.execCommand('styleWithCSS', false, command === 'foreColor' ? 'true' : 'false');
    } catch {
      /* eski tarayıcı */
    }
    document.execCommand(command, false, arg);
    emit();
  };

  return (
    <div
      className="odev-note-rte"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="odev-note-rte-bar">
        <div className="odev-note-rte-group">
          <button type="button" className="odev-note-rte-btn" onClick={() => exec('bold')} title="Kalın"><b>B</b></button>
          <button type="button" className="odev-note-rte-btn" onClick={() => exec('italic')} title="İtalik"><i>I</i></button>
          <button type="button" className="odev-note-rte-btn" onClick={() => exec('underline')} title="Altı çizili"><u>U</u></button>
        </div>
        <span className="odev-note-rte-div" />
        <div className="odev-note-rte-swatches">
          {PRESET_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              className="odev-note-rte-swatch"
              title={c.label}
              style={{ background: c.value }}
              onClick={() => { setColor(c.value); exec('foreColor', c.value); }}
            />
          ))}
        </div>
        <label className="odev-note-rte-btn odev-note-rte-color" title="Özel renk">
          <span style={{ color }}>A</span>
          <input
            type="color"
            value={color}
            onChange={(e) => { setColor(e.target.value); exec('foreColor', e.target.value); }}
          />
        </label>
        <button type="button" className="odev-note-rte-btn" onClick={() => exec('removeFormat')} title="Biçimi temizle">⌫</button>
      </div>
      <div
        ref={ref}
        className="odev-note-rte-body"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        style={{ minHeight }}
        onInput={emit}
        onBlur={emit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onEscape?.();
          }
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
            e.preventDefault();
            exec('bold');
          }
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') {
            e.preventDefault();
            exec('italic');
          }
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'u') {
            e.preventDefault();
            exec('underline');
          }
        }}
      />
      <style jsx>{`
        .odev-note-rte {
          container-type: inline-size;
          container-name: note-rte;
          border: 1px solid var(--border-color, #e2e8f0);
          border-radius: ${compact ? '8px' : '10px'};
          overflow: hidden;
          background: var(--card-bg, #fff);
          min-width: 0;
        }
        .odev-note-rte-bar {
          display: flex;
          flex-wrap: nowrap;
          align-items: center;
          gap: 3px;
          padding: ${compact ? '4px 6px' : '5px 8px'};
          background: var(--body-bg, #f8fafc);
          border-bottom: 1px solid var(--border-color, #e2e8f0);
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: thin;
        }
        .odev-note-rte-group,
        .odev-note-rte-swatches {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          flex-shrink: 0;
        }
        .odev-note-rte-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 26px;
          height: 26px;
          padding: 0 6px;
          border: none;
          border-radius: 6px;
          background: transparent;
          color: var(--text-color, #334155);
          font-size: 13px;
          cursor: pointer;
          flex-shrink: 0;
        }
        .odev-note-rte-btn:hover { background: rgba(0,0,0,0.06); }
        .odev-note-rte-swatch {
          width: 14px;
          height: 14px;
          border-radius: 999px;
          border: 1px solid rgba(0,0,0,0.12);
          padding: 0;
          cursor: pointer;
          flex-shrink: 0;
        }
        .odev-note-rte-color {
          position: relative;
          font-weight: 800;
        }
        .odev-note-rte-color input {
          position: absolute;
          inset: 0;
          opacity: 0;
          cursor: pointer;
        }
        .odev-note-rte-div {
          width: 1px;
          height: 16px;
          background: var(--border-color, #e2e8f0);
          margin: 0 2px;
          flex-shrink: 0;
        }
        .odev-note-rte-body {
          padding: ${compact ? '7px 8px' : '8px 10px'};
          font-size: 13px;
          line-height: 1.45;
          color: var(--text-color, #0f172a);
          outline: none;
        }
        .odev-note-rte-body:empty::before {
          content: attr(data-placeholder);
          color: #94a3b8;
        }
        @container note-rte (max-width: 320px) {
          .odev-note-rte-swatches { display: none; }
          .odev-note-rte-div { display: none; }
          .odev-note-rte-btn {
            min-width: 22px;
            height: 22px;
            padding: 0 4px;
            font-size: 12px;
          }
        }
        @media (max-width: 480px) {
          .odev-note-rte-swatches { display: none; }
          .odev-note-rte-btn {
            min-width: 24px;
            height: 24px;
          }
        }
      `}</style>
    </div>
  );
}
