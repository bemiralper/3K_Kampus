'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  fetchStudentResources,
  type StudentResource,
} from '@/lib/kutuphane-api';
import { kutuphaneHref, COACH_KUTUPHANE_BASE } from '@/lib/kutuphane-routes';

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

interface KutuphaneTabProps {
  studentId: number;
  studentName?: string;
}

export default function KutuphaneTab({ studentId, studentName }: KutuphaneTabProps) {
  const [resource, setResource] = useState<StudentResource | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setUnavailable(false);
    try {
      const res = await fetchStudentResources({ search: studentName || String(studentId) });
      if (res.success && res.data?.students) {
        const match =
          res.data.students.find((s) => s.ogrenci_id === studentId) ??
          res.data.students[0] ??
          null;
        setResource(match);
        if (!match) setUnavailable(true);
      } else {
        setUnavailable(true);
        setResource(null);
      }
    } catch {
      setUnavailable(true);
      setResource(null);
    } finally {
      setLoading(false);
    }
  }, [studentId, studentName]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="student360-panel">
        <div className="coach-list-card">
          <div className="coach-skeleton coach-skeleton-line w60" />
          <div className="coach-skeleton coach-skeleton-line w80" style={{ marginTop: 8 }} />
        </div>
      </div>
    );
  }

  if (unavailable || !resource) {
    return (
      <div className="student360-panel">
        <div className="coach-empty-state">
          <div className="coach-empty-icon">📚</div>
          <h4>Kütüphane kaydı bulunamadı</h4>
          <p>
            Fiziksel kütüphane ataması (masa/dolap) henüz yok veya API bu öğrenci için
            veri döndürmedi.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="student360-panel">
      <article className="coach-list-card">
        <h3 className="coach-section-title">Masa ataması</h3>
        {resource.masa ? (
          <div style={{ fontSize: 14, color: '#475569' }}>
            <p style={{ margin: '0 0 6px' }}>
              <strong>{resource.masa.salon_adi}</strong> · Masa {resource.masa.masa_no}
            </p>
            <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
              Başlangıç: {fmtDate(resource.masa.baslangic_tarihi)} · {resource.masa.atama_tipi}
            </p>
          </div>
        ) : (
          <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>Masa ataması yok</p>
        )}
      </article>

      <article className="coach-list-card">
        <h3 className="coach-section-title">Dolap ataması</h3>
        {resource.dolap ? (
          <div style={{ fontSize: 14, color: '#475569' }}>
            <p style={{ margin: '0 0 6px' }}>
              Dolap <strong>{resource.dolap.dolap_no}</strong>
            </p>
            <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
              Başlangıç: {fmtDate(resource.dolap.baslangic_tarihi)}
              {resource.dolap.anahtar_verildi ? ' · Anahtar verildi' : ''}
            </p>
          </div>
        ) : (
          <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>Dolap ataması yok</p>
        )}
      </article>

      <div className="coach-library-actions" style={{ marginTop: 4 }}>
        <Link
          href={`${kutuphaneHref(COACH_KUTUPHANE_BASE, 'atamalar')}?ogrenci=${studentId}`}
          className="coach-link-btn"
        >
          Atamaları yönet
        </Link>
        <Link href={kutuphaneHref(COACH_KUTUPHANE_BASE, 'izinler')} className="coach-link-btn">
          İzinler
        </Link>
      </div>
    </div>
  );
}
