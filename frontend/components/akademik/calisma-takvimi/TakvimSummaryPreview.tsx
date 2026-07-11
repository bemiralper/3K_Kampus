'use client';

import { Space, Tag, Typography } from 'antd';
import type { WorkCalendarDayInput } from '@/lib/academic-api';
import type { ScheduleTemplate } from '@/lib/academic-api';
import { takvimIconNode } from './constants';
import './calisma-takvimi.css';

const { Text } = Typography;

type Props = {
  name: string;
  color: string;
  icon: string;
  days: WorkCalendarDayInput[];
  templates: ScheduleTemplate[];
};

export default function TakvimSummaryPreview({ name, color, icon, days, templates }: Props) {
  const activeDays = days.filter((d) => d.is_active);
  const templateMap = new Map(templates.map((t) => [t.id, t.name]));

  const usedTemplateIds = new Set(
    activeDays.map((d) => d.schedule_template).filter((id): id is number => id != null),
  );
  const totalLessons = activeDays.reduce((sum, day) => {
    const tpl = templates.find((t) => t.id === day.schedule_template);
    return sum + (tpl?.lesson_count ?? 0);
  }, 0);

  const usedNames = [...usedTemplateIds].map((id) => templateMap.get(id) || `#${id}`);

  return (
    <div className="ct-preview">
      <div className="ct-preview-head">
        <div className="ct-card-icon" style={{ background: `${color}18` }}>
          {takvimIconNode(icon, color)}
        </div>
        <div>
          <Text strong style={{ fontSize: 15 }}>
            {name || 'Yeni Takvim'}
          </Text>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Canlı önizleme
            </Text>
          </div>
        </div>
      </div>

      <div className="ct-preview-stat">
        <span>Aktif Gün</span>
        <strong>{activeDays.length}</strong>
      </div>
      <div className="ct-preview-stat">
        <span>Toplam Ders</span>
        <strong>{totalLessons}</strong>
      </div>

      <div className="ct-preview-templates">
        <h4>Kullanılan Saat Şablonları</h4>
        {usedNames.length === 0 ? (
          <Text type="secondary">Henüz şablon seçilmedi</Text>
        ) : (
          <Space wrap size={[4, 4]}>
            {usedNames.map((n) => (
              <Tag key={n} color="blue">
                {n}
              </Tag>
            ))}
          </Space>
        )}
      </div>

      <div className="ct-preview-templates" style={{ marginTop: 16 }}>
        <h4>Aktif Günler</h4>
        <div>
          {activeDays.length === 0 ? (
            <Text type="secondary">—</Text>
          ) : (
            activeDays.map((d) => (
              <span key={d.day_of_week} className="ct-preview-day-chip">
                <strong>{d.name}</strong>
                <span>{templateMap.get(d.schedule_template!) || '?'}</span>
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
