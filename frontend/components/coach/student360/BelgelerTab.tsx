'use client';

import { useCallback, useEffect, useState } from 'react';
import { gorusmeService } from '@/app/admin/coaching/meetings/services/gorusme-api';
import type { GorusmeDosya, GorusmeKaydiDetail } from '@/app/admin/coaching/meetings/types';

import { resolveCoachPhotoUrl } from '@/lib/coach-media';

function fileUrl(path: string) {
  return resolveCoachPhotoUrl(path) ?? path;
}

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

interface BelgelerTabProps {
  studentId: number;
}

type DocRow = GorusmeDosya & { gorusme_konu?: string; gorusme_tarihi?: string };

export default function BelgelerTab({ studentId }: BelgelerTabProps) {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await gorusmeService.list({
        ogrenci_id: String(studentId),
        ordering: '-gorusme_tarihi',
      });
      const meetings = Array.isArray(list) ? list.slice(0, 15) : [];
      const collected: DocRow[] = [];

      await Promise.all(
        meetings.map(async (m) => {
          try {
            const detail: GorusmeKaydiDetail = await gorusmeService.get(m.id);
            (detail.dosyalar || []).forEach((d) => {
              collected.push({
                ...d,
                gorusme_konu: detail.konu,
                gorusme_tarihi: detail.gorusme_tarihi,
              });
            });
          } catch {
            /* skip */
          }
        })
      );

      collected.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setDocs(collected);
    } catch {
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="student360-panel">
        {[1, 2].map((i) => (
          <div key={i} className="coach-list-card">
            <div className="coach-skeleton coach-skeleton-line w60" />
          </div>
        ))}
      </div>
    );
  }

  if (docs.length === 0) {
    return (
      <div className="student360-panel">
        <div className="coach-empty-state">
          <div className="coach-empty-icon">📎</div>
          <h4>Belge yok</h4>
          <p>Görüşme kayıtlarına eklenmiş dosya bulunmuyor (GorusmeDosya v1).</p>
        </div>
      </div>
    );
  }

  return (
    <div className="student360-panel">
      {docs.map((doc) => (
        <article key={doc.id} className="coach-list-card">
          <div className="coach-list-card-header">
            <h3 className="coach-list-card-title" style={{ fontSize: 14 }}>
              {doc.aciklama || 'Dosya'}
            </h3>
            <a
              href={fileUrl(doc.dosya)}
              target="_blank"
              rel="noopener noreferrer"
              className="coach-badge blue"
              style={{ textDecoration: 'none' }}
            >
              İndir
            </a>
          </div>
          <div style={{ fontSize: 13, color: '#64748b' }}>
            {doc.gorusme_konu} · {fmtDate(doc.gorusme_tarihi)}
          </div>
        </article>
      ))}
    </div>
  );
}
