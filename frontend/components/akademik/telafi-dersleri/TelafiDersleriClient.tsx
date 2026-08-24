'use client';

import SessionBrowserClient from '@/components/akademik/ders-operasyonlari/SessionBrowserClient';

export default function TelafiDersleriClient() {
  return (
    <SessionBrowserClient
      description="İptal / ertelenen derslerin yerine planlanan telafi oturumları."
      fixedKind="MAKEUP"
      allowCreate
    />
  );
}
