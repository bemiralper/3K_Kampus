'use client';

import SessionBrowserClient from '@/components/akademik/ders-operasyonlari/SessionBrowserClient';

export default function TelafiDersleriClient() {
  return (
    <SessionBrowserClient
      title="Telafi Dersleri"
      description="İptal / ertelenen derslerin yerine planlanan telafi oturumları."
      fixedKind="MAKEUP"
      allowCreate
    />
  );
}
