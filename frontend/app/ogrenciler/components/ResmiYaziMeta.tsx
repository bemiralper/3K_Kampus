'use client';

import React from 'react';

interface ResmiYaziMetaProps {
  sayi: string;
  konu: string;
  tarih: string;
  konuFallback?: string;
  sayiFallback?: string;
  tarihFallback?: string;
}

/** Resmi yazı — Sayı/Konu solda, Tarih sağda */
export default function ResmiYaziMeta({
  sayi,
  konu,
  tarih,
  konuFallback = '',
  sayiFallback = '……/……',
  tarihFallback = '…… / …… / 20……',
}: ResmiYaziMetaProps) {
  const lineStyle: React.CSSProperties = { marginBottom: 6, fontSize: '12pt', lineHeight: 1.6 };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 32,
        marginBottom: 0,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={lineStyle}>
          <strong>Sayı</strong> : {sayi || sayiFallback}
        </div>
        <div style={{ ...lineStyle, marginBottom: 0 }}>
          <strong>Konu</strong> : {konu || konuFallback}
        </div>
      </div>
      <div style={{ ...lineStyle, textAlign: 'right', whiteSpace: 'nowrap', marginBottom: 0, flexShrink: 0 }}>
        <strong>Tarih</strong> : {tarih || tarihFallback}
      </div>
    </div>
  );
}
