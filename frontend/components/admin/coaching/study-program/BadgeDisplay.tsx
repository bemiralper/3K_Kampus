'use client';

import React from 'react';
import { type Badge } from '@/lib/study-program-api';

/**
 * Rozet / Gamification gösterge paneli.
 * Kazanılan rozetler, seri durumu.
 */

interface Props {
  badges: Badge[];
  completionPercent: number;
}

export default function BadgeDisplay({ badges, completionPercent }: Props) {
  if (badges.length === 0 && completionPercent === 0) {
    return (
      <div style={{
        backgroundColor: '#fff',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        padding: '20px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>🏆</div>
        <div style={{ fontSize: '13px', fontWeight: 500, color: '#6b7280' }}>
          Henüz rozet kazanılmadı
        </div>
        <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
          Günleri tamamlayarak rozetler kazanabilirsin!
        </div>
      </div>
    );
  }

  return (
    <div style={{
      backgroundColor: '#fff',
      borderRadius: '12px',
      border: '1px solid #e5e7eb',
      padding: '16px',
    }}>
      <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#111827', marginBottom: '12px' }}>
        🏆 Rozetler
      </h4>

      {/* Haftalık tamamlanma ring */}
      <div style={{ textAlign: 'center', marginBottom: '14px' }}>
        <div style={{
          width: '80px', height: '80px',
          borderRadius: '50%',
          background: `conic-gradient(#3b82f6 ${completionPercent * 3.6}deg, #e5e7eb ${completionPercent * 3.6}deg)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto',
        }}>
          <div style={{
            width: '62px', height: '62px',
            borderRadius: '50%',
            backgroundColor: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '16px', fontWeight: 700, color: '#111827',
          }}>
            %{completionPercent}
          </div>
        </div>
        <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '6px' }}>Haftalık Tamamlanma</div>
      </div>

      {/* Rozet listesi */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {badges.map((b) => (
          <div key={b.id} style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '8px 10px',
            backgroundColor: '#fefce8',
            borderRadius: '8px',
            border: '1px solid #fde68a',
          }}>
            <span style={{ fontSize: '22px' }}>{b.icon}</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: '12px', color: '#111827' }}>{b.title}</div>
              <div style={{ fontSize: '10px', color: '#6b7280' }}>{b.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
