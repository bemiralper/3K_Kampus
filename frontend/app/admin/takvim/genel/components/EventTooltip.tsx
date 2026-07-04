'use client';

import React, { useState, useRef, useEffect } from 'react';

interface TooltipData {
  title: string;
  ikon: string;
  color: string;
  time: string;
  salon?: string;
  kategori?: string;
  durum?: string;
}

interface Props {
  data: TooltipData | null;
  x: number;
  y: number;
}

export default function EventTooltip({ data, x, y }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useEffect(() => {
    if (!ref.current || !data) return;
    const rect = ref.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = x + 12;
    let top = y + 12;

    if (left + rect.width > vw - 16) left = x - rect.width - 12;
    if (top + rect.height > vh - 16) top = y - rect.height - 12;
    if (left < 8) left = 8;
    if (top < 8) top = 8;

    setPos({ left, top });
  }, [x, y, data]);

  if (!data) return null;

  return (
    <div
      ref={ref}
      className={`tkv-tooltip ${data ? 'visible' : ''}`}
      style={{ left: pos.left, top: pos.top }}
    >
      <div className="tkv-tooltip-color" style={{ background: data.color }} />
      <div className="tkv-tooltip-title">
        <span>{data.ikon}</span> {data.title}
      </div>
      {data.time && (
        <div className="tkv-tooltip-row">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm4.2 14.2L11 13V7h1.5v5.2l4.5 2.7-.8 1.3z"/></svg>
          {data.time}
        </div>
      )}
      {data.salon && (
        <div className="tkv-tooltip-row">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/></svg>
          {data.salon}
        </div>
      )}
      {data.kategori && (
        <div className="tkv-tooltip-row">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.63 5.84C17.27 5.33 16.67 5 16 5L5 5.01C3.9 5.01 3 5.9 3 7v10c0 1.1.9 1.99 2 1.99L16 19c.67 0 1.27-.33 1.63-.84L22 12l-4.37-6.16z"/></svg>
          {data.kategori}
        </div>
      )}
      {data.durum && (
        <div className="tkv-tooltip-row">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          {data.durum}
        </div>
      )}
    </div>
  );
}
