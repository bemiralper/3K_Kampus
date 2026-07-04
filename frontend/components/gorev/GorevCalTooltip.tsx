'use client';

import React, { useRef, useEffect, useState } from 'react';

export type GorevTooltipData = {
  title: string;
  ikon: string;
  color: string;
  time?: string;
  oncelik?: string;
  durum?: string;
  kod?: string;
  atananlar?: string[];
};

type Props = {
  data: GorevTooltipData | null;
  x: number;
  y: number;
};

export default function GorevCalTooltip({ data, x, y }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useEffect(() => {
    if (!ref.current || !data) return;
    const rect = ref.current.getBoundingClientRect();
    let left = x + 14;
    let top = y + 14;
    if (left + rect.width > window.innerWidth - 16) left = x - rect.width - 14;
    if (top + rect.height > window.innerHeight - 16) top = y - rect.height - 14;
    if (left < 8) left = 8;
    if (top < 8) top = 8;
    setPos({ left, top });
  }, [x, y, data]);

  if (!data) return null;

  return (
    <div
      ref={ref}
      className="gorev-cal-tooltip visible"
      style={{ left: pos.left, top: pos.top }}
      role="tooltip"
    >
      <div className="gorev-cal-tooltip-bar" style={{ background: data.color }} />
      <div className="gorev-cal-tooltip-title">
        <span>{data.ikon}</span>
        <span>{data.title}</span>
      </div>
      {data.time && <div className="gorev-cal-tooltip-row">🕐 {data.time}</div>}
      {data.kod && <div className="gorev-cal-tooltip-row">🏷️ {data.kod}</div>}
      {data.oncelik && <div className="gorev-cal-tooltip-row">⚡ {data.oncelik}</div>}
      {data.durum && <div className="gorev-cal-tooltip-row">📋 {data.durum}</div>}
      {data.atananlar && data.atananlar.length > 0 && (
        <div className="gorev-cal-tooltip-row gorev-cal-tooltip-assignees">
          👤 {data.atananlar.join(', ')}
        </div>
      )}
    </div>
  );
}
