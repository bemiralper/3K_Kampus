'use client';

import SessionBrowserClient from '@/components/akademik/ders-operasyonlari/SessionBrowserClient';

export default function OgretmenYoklamalariClient() {
  return (
    <SessionBrowserClient
      description="Oturum bazında öğretmen geldi / gelmedi kaydı. Gerekirse yedek öğretmen atayın."
      showMaterialize
      autoMaterialize
      dailyMode
      attendanceFocus
    />
  );
}
