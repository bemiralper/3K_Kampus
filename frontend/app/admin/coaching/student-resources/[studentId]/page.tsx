'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

/**
 * Eski Öğrenci Kaynak Detay sayfası.
 * Yeni konum: /admin/odev/kaynak-havuzu/[studentId]
 * Bu sayfa bookmark uyumluluğu için redirect yapar.
 */
export default function StudentResourceDetailRedirect() {
  const router = useRouter();
  const params = useParams();
  
  useEffect(() => {
    router.replace(`/admin/odev/kaynak-havuzu/${params.studentId}`);
  }, [router, params.studentId]);

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
