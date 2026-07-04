'use client';

import React from 'react';
import { CoachStats } from '@/lib/coaching-api';

interface CoachStatsCardProps {
  stats: CoachStats | null;
  loading?: boolean;
}

export default function CoachStatsCard({ stats, loading = false }: CoachStatsCardProps) {
  if (loading || !stats) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            style={{
              backgroundColor: '#f9fafb',
              borderRadius: '8px',
              padding: '16px',
              animation: 'pulse 2s infinite',
            }}
          >
            <div style={{ width: '60%', height: '14px', backgroundColor: '#e5e7eb', borderRadius: '4px', marginBottom: '8px' }} />
            <div style={{ width: '40%', height: '24px', backgroundColor: '#e5e7eb', borderRadius: '4px' }} />
          </div>
        ))}
      </div>
    );
  }

  const items = [
    { label: 'Aktif Öğrenci', value: stats.current_student_count, color: '#3b82f6', icon: '👥' },
    { label: 'Müsait Kapasite', value: stats.available_capacity, color: '#22c55e', icon: '✅' },
    { label: 'Aktif Atamalar', value: stats.active_assignments, color: '#ec4899', icon: '📋' },
    { label: 'Bekleyen Etkinlik', value: stats.pending_events, color: '#f97316', icon: '⏳' },
    { label: 'Tamamlanan', value: stats.completed_events, color: '#8b5cf6', icon: '✓' },
    { label: 'Toplam Etkinlik', value: stats.total_events, color: '#6b7280', icon: '📊' },
    { label: 'Bekleyen Görev', value: stats.gorev_bekleyen ?? 0, color: '#0ea5e9', icon: '📝' },
    { label: 'Geciken Görev', value: stats.gorev_geciken ?? 0, color: '#ef4444', icon: '⚠️' },
    { label: 'Tamamlanan Görev', value: stats.gorev_tamamlanan ?? 0, color: '#10b981', icon: '✅' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
      {items.map((item) => (
        <div
          key={item.label}
          style={{
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '16px',
          }}
        >
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>{item.icon}</span>
            {item.label}
          </div>
          <div style={{ fontSize: '24px', fontWeight: 600, color: item.color }}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}
