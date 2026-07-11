'use client';

import { Input, Select, Switch, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { ScheduleTemplate } from '@/lib/academic-api';
import type { WorkCalendarDayInput } from '@/lib/academic-api';
import { WEEKDAY_LABELS } from './constants';
import './calisma-takvimi.css';

type Props = {
  days: WorkCalendarDayInput[];
  templates: ScheduleTemplate[];
  onChange: (days: WorkCalendarDayInput[]) => void;
};

export default function WeeklyPlanGrid({ days, templates, onChange }: Props) {
  const sorted = [...days].sort((a, b) => a.day_of_week - b.day_of_week);

  const patchDay = (dayOfWeek: number, patch: Partial<WorkCalendarDayInput>) => {
    onChange(
      days.map((d) => {
        if (d.day_of_week !== dayOfWeek) return d;
        const next = { ...d, ...patch };
        if (patch.is_active === false) {
          next.schedule_template = null;
        }
        return next;
      }),
    );
  };

  const templateOptions = templates
    .filter((t) => t.is_active)
    .map((t) => ({ value: t.id, label: t.name }));

  const columns: ColumnsType<WorkCalendarDayInput> = [
    {
      title: 'Gün',
      width: 120,
      render: (_, row) => (
        <strong style={{ color: row.is_active ? '#0f172a' : '#94a3b8' }}>
          {row.name || WEEKDAY_LABELS[row.day_of_week]}
        </strong>
      ),
    },
    {
      title: 'Aktif',
      width: 72,
      align: 'center',
      render: (_, row) => (
        <Switch
          size="small"
          checked={row.is_active}
          onChange={(checked) => patchDay(row.day_of_week, { is_active: checked })}
        />
      ),
    },
    {
      title: 'Ders Saati Şablonu',
      render: (_, row) => (
        <Select
          size="small"
          allowClear
          placeholder={row.is_active ? 'Şablon seçin…' : '—'}
          style={{ width: '100%', minWidth: 160 }}
          disabled={!row.is_active}
          value={row.schedule_template ?? undefined}
          options={templateOptions}
          onChange={(val) => patchDay(row.day_of_week, { schedule_template: val ?? null })}
        />
      ),
    },
    {
      title: 'Not',
      width: 160,
      render: (_, row) => (
        <Input
          size="small"
          placeholder="—"
          disabled={!row.is_active}
          value={row.note || ''}
          onChange={(e) => patchDay(row.day_of_week, { note: e.target.value })}
        />
      ),
    },
  ];

  return (
    <Table
      className="ct-plan-grid"
      size="small"
      rowKey="day_of_week"
      columns={columns}
      dataSource={sorted}
      pagination={false}
      rowClassName={(row) => {
        const parts = ['ct-plan-row'];
        parts.push(row.is_active ? 'ct-plan-row--active' : 'ct-plan-row--inactive');
        if (row.day_of_week >= 5 && row.is_active) parts.push('ct-plan-row--weekend');
        return parts.join(' ');
      }}
    />
  );
}
