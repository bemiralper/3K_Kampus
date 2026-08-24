'use client';

import SessionBrowserClient from '@/components/akademik/ders-operasyonlari/SessionBrowserClient';

export default function DersOturumlariClient() {
  return (
    <SessionBrowserClient
      description="Tarihli ders oturumları — programdan üret, başlat, tamamla, iptal et veya manuel ekle."
      showMaterialize
      autoMaterialize
      allowCreate
      dailyMode
    />
  );
}
