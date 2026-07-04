'use client';

import { useCallback, useEffect, useState } from 'react';
import { gorusmeService } from '@/app/admin/coaching/meetings/services/gorusme-api';
import type { GorusmeKaydiListItem } from '@/app/admin/coaching/meetings/types';
import GorusmeDetailDrawer from '@/components/coach/GorusmeDetailDrawer';
import GorusmeEkleDrawer from '@/components/coach/GorusmeEkleDrawer';
import GorusmeMeetingCard from './GorusmeMeetingCard';

interface GorusmelerTabProps {
  studentId: number;
  studentName?: string;
}

export default function GorusmelerTab({ studentId, studentName }: GorusmelerTabProps) {
  const [items, setItems] = useState<GorusmeKaydiListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [editId, setEditId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await gorusmeService.list({
        ogrenci_id: String(studentId),
        ordering: '-gorusme_tarihi',
      });
      setItems(Array.isArray(list) ? list : []);
    } catch {
      setError('Görüşmeler yüklenemedi');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);

  const resolvedName =
    studentName ||
    items[0]?.ogrenci_adi ||
    'Öğrenci';

  if (loading) {
    return (
      <div className="student360-panel">
        {[1, 2, 3].map((i) => (
          <div key={i} className="coach-list-card">
            <div className="coach-skeleton coach-skeleton-line w60" />
            <div className="coach-skeleton coach-skeleton-line w40" style={{ marginTop: 8 }} />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="student360-panel">
        <div className="coach-empty-state">
          <div className="coach-empty-icon">⚠️</div>
          <h4>{error}</h4>
          <button type="button" className="coach-link-btn" onClick={load}>
            Tekrar dene
          </button>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="student360-panel">
        <div className="coach-empty-state">
          <div className="coach-empty-icon">💬</div>
          <h4>Görüşme kaydı yok</h4>
          <p>Hızlı işlemden yeni görüşme ekleyebilirsiniz.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="student360-panel">
        {items.map((g) => (
          <GorusmeMeetingCard
            key={g.id}
            meeting={g}
            variant="full"
            clickable
            showHint
            onClick={() => setDetailId(g.id)}
          />
        ))}
      </div>

      {detailId != null && (
        <GorusmeDetailDrawer
          gorusmeId={detailId}
          onClose={() => setDetailId(null)}
          onUpdated={load}
          onEdit={(id) => {
            setDetailId(null);
            setEditId(id);
          }}
        />
      )}

      {editId != null && (
        <GorusmeEkleDrawer
          studentId={studentId}
          studentName={resolvedName}
          editId={editId}
          onClose={() => setEditId(null)}
          onSuccess={() => {
            setEditId(null);
            load();
          }}
        />
      )}
    </>
  );
}
