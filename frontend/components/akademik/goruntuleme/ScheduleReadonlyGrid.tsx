'use client';

import { Empty, Tag } from 'antd';
import type { ScheduleGridResponse } from '@/lib/schedule-api';
import './goruntuleme.css';

type Props = {
  grid: ScheduleGridResponse | null;
  /** Hücre içeriğinde sınıf adını da göster (öğretmen/oda görünümü için faydalı) */
  showClassroom?: boolean;
};

export default function ScheduleReadonlyGrid({ grid, showClassroom }: Props) {
  if (!grid || !grid.days?.length || !grid.slots?.length) {
    return (
      <Empty
        description="Görüntülenecek program bulunamadı."
        style={{ padding: '48px 0' }}
      />
    );
  }

  const days = [...grid.days].sort((a, b) => a.order - b.order);
  const slots = [...grid.slots]
    .filter((s) => s.start_time && s.end_time)
    .sort((a, b) => a.slot_number - b.slot_number);

  const cellFor = (dayId: number, slotId: number) =>
    grid.cells.find((c) => c.day_id === dayId && c.slot_id === slotId);

  return (
    <div className="sgrid-wrap">
      <table className="sgrid-table">
        <thead>
          <tr>
            <th className="sgrid-corner">Saat</th>
            {days.map((d) => (
              <th key={d.id}>{d.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slots.map((slot) => (
            <tr key={slot.id}>
              <td className="sgrid-time">
                {slot.start_time}–{slot.end_time}
              </td>
              {days.map((d) => {
                const cell = cellFor(d.id, slot.id);
                const hasLesson = Boolean(cell?.lesson);
                return (
                  <td key={d.id} className={hasLesson ? 'sgrid-cell is-filled' : 'sgrid-cell'}>
                    {hasLesson ? (
                      <div className="sgrid-cell-content">
                        <span className="sgrid-lesson">{cell?.lesson?.name}</span>
                        {cell?.teacher && (
                          <span className="sgrid-sub">{cell.teacher.name}</span>
                        )}
                        {showClassroom && cell?.classroom && (
                          <span className="sgrid-sub">{cell.classroom.name}</span>
                        )}
                      </div>
                    ) : cell?.status === 'EXAM' || cell?.status === 'HOLIDAY' ? (
                      <Tag color={cell.status === 'EXAM' ? 'orange' : 'red'}>
                        {cell.status === 'EXAM' ? 'Sınav' : 'Tatil'}
                      </Tag>
                    ) : (
                      <span className="sgrid-empty">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
