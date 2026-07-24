'use client';

import SessionBrowserClient from '@/components/akademik/ders-operasyonlari/SessionBrowserClient';

export default function BugunkuDerslerClient() {
  return (
    <SessionBrowserClient
      title="Bugünkü Dersler"
      description="Seçili güne ait ders oturumları. Programdan üretip başlatın, tamamlayın veya öğretmen yoklaması alın."
      fixedKind="REGULAR"
      dailyMode
      showMaterialize
      autoMaterialize
    />
  );
}
