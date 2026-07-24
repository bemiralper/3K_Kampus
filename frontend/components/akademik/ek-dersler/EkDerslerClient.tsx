'use client';

import SessionBrowserClient from '@/components/akademik/ders-operasyonlari/SessionBrowserClient';

export default function EkDerslerClient() {
  return (
    <SessionBrowserClient
      title="Ek Dersler"
      description="Program dışı ek ders oturumları (sınav hazırlık, takviye vb.)."
      fixedKind="EXTRA"
      allowCreate
    />
  );
}
