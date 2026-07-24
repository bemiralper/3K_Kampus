'use client';

import SessionBrowserClient from '@/components/akademik/ders-operasyonlari/SessionBrowserClient';

export default function OzelDerslerClient() {
  return (
    <SessionBrowserClient
      title="Özel Dersler"
      description="Birebir özel ders oturumları. Öğrenci arayarak oluşturun; ücret tamamlanan oturumlardan hesaplanır."
      fixedKind="PRIVATE"
      allowCreate
    />
  );
}
