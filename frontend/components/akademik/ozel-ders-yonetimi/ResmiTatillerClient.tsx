'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Eski akademik sekme — Takvim / Resmi Tatiller’e yönlendirir. */
export default function ResmiTatillerClient() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/takvim/resmi-tatiller');
  }, [router]);
  return null;
}
