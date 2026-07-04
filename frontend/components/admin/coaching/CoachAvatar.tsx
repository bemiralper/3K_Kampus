'use client';

import React from 'react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

export function coachPhotoUrl(fotograf?: string | null): string | null {
  if (!fotograf) return null;
  if (fotograf.startsWith('http')) return fotograf;
  return `${BACKEND_URL}${fotograf}`;
}

interface CoachAvatarProps {
  fotograf?: string | null;
  ad: string;
  soyad: string;
  size?: number;
  gradient?: string;
  style?: React.CSSProperties;
}

export default function CoachAvatar({
  fotograf,
  ad,
  soyad,
  size = 72,
  gradient,
  style,
}: CoachAvatarProps) {
  const url = coachPhotoUrl(fotograf);
  const initials = `${ad?.charAt(0) || ''}${soyad?.charAt(0) || ''}`.toUpperCase();
  const bg = gradient || 'linear-gradient(135deg, #667eea, #764ba2)';

  if (url) {
    return (
      <img
        src={url}
        alt={`${ad} ${soyad}`}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          border: '4px solid #fff',
          boxShadow: '0 4px 12px rgba(0,0,0,.15)',
          ...style,
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: '4px solid #fff',
        background: bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.round(size * 0.3),
        fontWeight: 700,
        color: '#fff',
        boxShadow: '0 4px 12px rgba(0,0,0,.15)',
        ...style,
      }}
    >
      {initials}
    </div>
  );
}
