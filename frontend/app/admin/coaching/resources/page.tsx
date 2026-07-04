'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Eski Kaynak Kütüphanesi sayfası.
 * Yeni konum: /admin/odev/kaynaklar
 * Bu sayfa bookmark uyumluluğu için redirect yapar.
 */
export default function ResourcesRedirect() {
  const router = useRouter();
  
  useEffect(() => {
    router.replace('/admin/odev/kaynaklar');
  }, [router]);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '60vh', fontFamily: "'Poppins', sans-serif",
    }}>
      <div style={{ textAlign: 'center', color: '#64748b' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔄</div>
        <p style={{ fontSize: 14 }}>Yönlendiriliyor...</p>
      </div>
    </div>
  );
}
