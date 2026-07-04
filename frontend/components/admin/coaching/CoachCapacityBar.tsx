'use client';

import React from 'react';

interface CoachCapacityBarProps {
  current: number;
  capacity: number;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export default function CoachCapacityBar({
  current,
  capacity,
  showLabel = false,
  size = 'md',
}: CoachCapacityBarProps) {
  const percentage = capacity > 0 ? Math.min((current / capacity) * 100, 100) : 0;
  const available = Math.max(capacity - current, 0);

  const getColor = () => {
    if (percentage >= 90) return '#ef4444'; // red
    if (percentage >= 70) return '#f97316'; // orange
    return '#22c55e'; // green
  };

  const heights = {
    sm: '6px',
    md: '8px',
    lg: '10px',
  };

  return (
    <div>
      <div
        style={{
          width: '100%',
          height: heights[size],
          backgroundColor: '#e5e7eb',
          borderRadius: '999px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${percentage}%`,
            height: '100%',
            backgroundColor: getColor(),
            borderRadius: '999px',
            transition: 'width 0.3s ease',
          }}
        />
      </div>
      {showLabel && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '12px',
            color: '#6b7280',
            marginTop: '4px',
          }}
        >
          <span>{current} / {capacity}</span>
          <span>{available} müsait</span>
        </div>
      )}
    </div>
  );
}
