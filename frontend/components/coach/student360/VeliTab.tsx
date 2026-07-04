'use client';

import { useCallback, useEffect, useState } from 'react';
import { gorusmeService } from '@/app/admin/coaching/meetings/services/gorusme-api';
import type { GorusmeKaydiListItem } from '@/app/admin/coaching/meetings/types';
import type { CoachStudentProfileStudent } from '@/lib/coach-api';
import PhoneContactLinks from '@/components/coach/PhoneContactLinks';
import GorusmeDetailDrawer from '@/components/coach/GorusmeDetailDrawer';
import GorusmeMeetingCard from './GorusmeMeetingCard';
import { filterVeliMeetings } from './gorusme-meeting-utils';

interface VeliTabProps {
  student: CoachStudentProfileStudent;
}

export default function VeliTab({ student }: VeliTabProps) {
  const [meetings, setMeetings] = useState<GorusmeKaydiListItem[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [detailId, setDetailId] = useState<number | null>(null);

  const veliTuruDisplay =
    student.veli?.veli_turu_display ??
    student.veliler?.find((v) => v.varsayilan)?.veli_turu_display ??
    student.veliler?.[0]?.veli_turu_display ??
    null;

  const loadNotes = useCallback(async () => {
    setLoadingNotes(true);
    try {
      const list = await gorusmeService.list({
        ogrenci_id: String(student.id),
        ordering: '-gorusme_tarihi',
      });
      setMeetings(filterVeliMeetings(Array.isArray(list) ? list : []));
    } catch {
      setMeetings([]);
    } finally {
      setLoadingNotes(false);
    }
  }, [student.id]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  return (
    <>
      <div className="student360-panel">
        <article className="coach-list-card">
          <h3 className="coach-section-title">Veli iletişim</h3>
          {veliTuruDisplay && (
            <p className="coach-veli-turu-label">{veliTuruDisplay}</p>
          )}
          {student.veli_adi && (
            <p className="coach-veli-name">{student.veli_adi}</p>
          )}
          {student.veli_telefon ? (
            <PhoneContactLinks phone={student.veli_telefon} />
          ) : (
            <p className="coach-veli-empty">Veli telefonu profilde kayıtlı değil.</p>
          )}
        </article>

        <h3 className="coach-section-title">Veli görüşme notları</h3>
        {loadingNotes ? (
          <div className="coach-list-card">
            <div className="coach-skeleton coach-skeleton-line w80" />
          </div>
        ) : meetings.length === 0 ? (
          <div className="coach-empty-state" style={{ padding: '24px 16px' }}>
            <p>Veli görüşmesi veya paylaşılan not bulunmuyor.</p>
          </div>
        ) : (
          meetings.map((g) => (
            <GorusmeMeetingCard
              key={g.id}
              meeting={g}
              variant="veli"
              clickable
              showHint
              onClick={() => setDetailId(g.id)}
            />
          ))
        )}
      </div>

      {detailId != null && (
        <GorusmeDetailDrawer
          gorusmeId={detailId}
          readOnly
          onClose={() => setDetailId(null)}
        />
      )}
    </>
  );
}
